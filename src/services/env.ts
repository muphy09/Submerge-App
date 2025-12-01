// Lightweight env accessor that works in both Vite (import.meta.env) and Electron sandboxed renderers.
declare global {
  interface Window {
    __APP_ENV__?: Record<string, string | undefined>;
  }
}

export function getEnvVar(key: string): string | undefined {
  const metaEnv = (import.meta as any)?.env;
  if (metaEnv && key in metaEnv) {
    return metaEnv[key];
  }

  if (typeof window !== 'undefined' && window.__APP_ENV__ && key in window.__APP_ENV__) {
    return window.__APP_ENV__?.[key];
  }

  if (typeof process !== 'undefined' && process?.env) {
    return process.env[key];
  }

  return undefined;
}

export function isEnvFlagTrue(key: string): boolean {
  return (getEnvVar(key) ?? '').toString().toLowerCase() === 'true';
}
