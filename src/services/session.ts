export type UserRole = 'master' | 'owner' | 'admin' | 'designer';

export type UserSession = {
  userId?: string;
  userEmail?: string;
  userName?: string;
  franchiseId?: string;
  franchiseName?: string;
  franchiseCode?: string;
  role?: UserRole;
  passwordResetRequired?: boolean;
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

export function saveSession(session: UserSession) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function updateSession(partial: Partial<UserSession>): UserSession | null {
  const current = readSession() || {};
  const next = { ...current, ...partial };
  saveSession(next);
  return next;
}

export function getSessionFranchiseId(defaultValue: string = DEFAULT_FRANCHISE_ID) {
  return readSession()?.franchiseId || defaultValue;
}

export function getSessionUserName(defaultName = 'Designer') {
  const session = readSession();
  return session?.userName || session?.userEmail || defaultName;
}

export function getSessionRole(
  defaultRole: UserRole = 'designer'
): UserRole {
  const role = readSession()?.role;
  if (role === 'master') return 'master';
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  if (role === 'designer') return 'designer';
  return defaultRole;
}

export function getSessionFranchiseCode() {
  return readSession()?.franchiseCode;
}

export function getSessionUserEmail(defaultEmail = '') {
  return readSession()?.userEmail || defaultEmail;
}
