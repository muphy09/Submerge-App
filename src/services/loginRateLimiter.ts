const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const STORAGE_PREFIX = 'submerge-login-attempts';

function buildKey(email: string, franchiseCode?: string | null) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedCode = String(franchiseCode || '').trim().toUpperCase() || 'master';
  return `${STORAGE_PREFIX}:${normalizedCode}:${normalizedEmail}`;
}

function readAttempts(key: string): number[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch (error) {
    return [];
  }
}

function writeAttempts(key: string, attempts: number[]) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(attempts));
}

export function assertLoginAllowed(email: string, franchiseCode?: string | null) {
  const key = buildKey(email, franchiseCode);
  const now = Date.now();
  const recent = readAttempts(key).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    const retryAfterSeconds = Math.ceil((RATE_LIMIT_WINDOW_MS - (now - recent[0])) / 1000);
    const minutes = Math.ceil(retryAfterSeconds / 60);
    throw new Error(`Too many login attempts. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }
}

export function recordLoginFailure(email: string, franchiseCode?: string | null) {
  const key = buildKey(email, franchiseCode);
  const now = Date.now();
  const recent = readAttempts(key).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);
  recent.push(now);
  writeAttempts(key, recent);
}

export function clearLoginAttempts(email: string, franchiseCode?: string | null) {
  if (typeof localStorage === 'undefined') return;
  const key = buildKey(email, franchiseCode);
  localStorage.removeItem(key);
}
