export type UserSession = {
  userName?: string;
  franchiseId?: string;
  franchiseName?: string;
  franchiseCode?: string;
  role?: 'admin' | 'designer';
};

export const SESSION_STORAGE_KEY = 'submerge-user-session';
export const DEFAULT_FRANCHISE_ID = 'default';

export function readSession(): UserSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UserSession) : null;
  } catch (error) {
    console.warn('Unable to read saved session:', error);
    return null;
  }
}

export function getSessionFranchiseId(defaultValue: string = DEFAULT_FRANCHISE_ID) {
  return readSession()?.franchiseId || defaultValue;
}

export function getSessionUserName(defaultName = 'Designer') {
  return readSession()?.userName || defaultName;
}

export function getSessionRole(defaultRole: 'admin' | 'designer' = 'designer'): 'admin' | 'designer' {
  const role = readSession()?.role;
  if (role === 'admin') return 'admin';
  return defaultRole;
}

export function getSessionFranchiseCode() {
  return readSession()?.franchiseCode;
}
