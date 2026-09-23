import assert from 'node:assert/strict';
import { build } from 'esbuild';

const sessions = new Map();
let signOutOthersCount = 0;
let handler;

globalThis.Deno = {
  env: { get: (key) => key === 'SUPABASE_URL' ? 'https://example.supabase.co' : 'test-key' },
  serve: (callback) => { handler = callback; },
};

function query(table) {
  const filters = [];
  const matching = () => {
    const row = sessions.get(table);
    return row && filters.every(([key, value]) => row[key] === value) ? row : null;
  };
  return {
    select() { return this; },
    eq(key, value) { filters.push([key, value]); return this; },
    async maybeSingle() { return { data: matching(), error: null }; },
    async upsert(row) { sessions.set(table, row); return { error: null }; },
    update(patch) {
      return {
        eq(key, value) {
          filters.push([key, value]);
          return this;
        },
        then(resolve) {
          const row = matching();
          if (row) Object.assign(row, patch);
          return resolve({ error: null });
        },
      };
    },
  };
}

const supabase = {
  auth: {
    getUser: async (token) => ({ data: { user: { id: token } }, error: null }),
    admin: { signOut: async () => { signOutOthersCount++; return { error: null }; } },
  },
  from(table) {
    if (table === 'franchise_users') {
      return {
        select() { return this; },
        eq(_key, token) { this.token = token; return this; },
        async maybeSingle() {
          return { data: { role: this.token.startsWith('master') ? 'master' : 'owner', is_active: true }, error: null };
        },
      };
    }
    return query(table);
  },
};

await build({
  entryPoints: ['supabase/functions/manage-user-app-session/index.ts'],
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  write: false,
  plugins: [{
    name: 'fake-supabase',
    setup(plugin) {
      plugin.onResolve({ filter: /^https:\/\/esm\.sh\/@supabase\/supabase-js@2$/ }, () => ({ path: 'supabase', namespace: 'fake' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: 'export const createClient = globalThis.__fakeSupabaseClient;', loader: 'js' }));
    },
  }],
}).then(async (result) => {
  globalThis.__fakeSupabaseClient = () => supabase;
  await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
});

async function invoke(token, channel, action, sessionId, deviceId = sessionId, takeover = false) {
  const response = await handler(new Request('https://example.test/session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      action,
      channel,
      appSessionId: sessionId,
      leaseToken: `lease-${sessionId}`,
      deviceId,
      takeover,
    }),
  }));
  assert.equal(response.status, 200);
  return (await response.json()).status;
}

assert.equal(await invoke('master-1', undefined, 'claim', 'real'), 'claimed');
assert.equal(await invoke('master-1', 'development', 'claim', 'dev'), 'claimed');
assert.equal(await invoke('master-1', undefined, 'heartbeat', 'real'), 'active');
assert.equal(await invoke('master-1', 'development', 'heartbeat', 'dev'), 'active');
assert.equal(await invoke('master-1', 'development', 'claim', 'second-dev'), 'conflict');
assert.equal(await invoke('master-1', undefined, 'claim', 'second-real'), 'conflict');
assert.equal(await invoke('master-1', 'development', 'claim', 'second-dev', 'other-device', true), 'claimed');
assert.equal(await invoke('master-1', 'development', 'heartbeat', 'dev'), 'displaced');
assert.equal(await invoke('master-1', undefined, 'heartbeat', 'real'), 'active');
assert.equal(await invoke('master-1', 'development', 'release', 'second-dev'), 'released');
assert.equal(await invoke('master-1', undefined, 'heartbeat', 'real'), 'active');
assert.equal(signOutOthersCount, 0);

sessions.clear();
assert.equal(await invoke('master-2', 'development', 'claim', 'dev-first'), 'claimed');
assert.equal(await invoke('master-2', undefined, 'claim', 'real-second'), 'claimed');
assert.equal(await invoke('master-2', 'development', 'heartbeat', 'dev-first'), 'active');
assert.equal(await invoke('master-2', undefined, 'heartbeat', 'real-second'), 'active');

sessions.clear();
assert.equal(await invoke('owner-1', undefined, 'claim', 'owner-real'), 'claimed');
assert.equal(await invoke('owner-1', 'development', 'claim', 'owner-dev'), 'conflict');
assert.equal(await invoke('owner-1', 'development', 'claim', 'owner-dev', 'same-device', true), 'claimed');
assert.equal(await invoke('owner-1', undefined, 'heartbeat', 'owner-real'), 'displaced');
assert.equal(signOutOthersCount, 1);

console.log('Master production and development slots remain independent; other roles retain one slot.');
