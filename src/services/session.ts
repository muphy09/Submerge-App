import { normalizeUserCommissionRates, type UserCommissionRates } from './userCommissionRates';

export type UserRole = 'master' | 'owner' | 'admin' | 'bookkeeper' | 'designer';

export type UserSession = Partial<UserCommissionRates> & {
  userId?: string;
  userEmail?: string;
  userName?: string;
  franchiseId?: string;
  franchiseName?: string;
  franchiseCode?: string;
  role?: UserRole;
  passwordResetRequired?: boolean;
  appSessionId?: string;
  appSessionLeaseToken?: string;
  approvalMarginThresholdPercent?: number;
  discountAllowanceThresholdPercent?: number;
  alwaysRequireApproval?: boolean;
};

export type MasterImpersonation = {
  franchiseId: string;
  franchiseName?: string;
  franchiseCode?: string;
  actingRole?: UserRole;
  startedAt?: string;
};

export const SESSION_STORAGE_KEY = 'submerge-user-session';
export const MASTER_IMPERSONATION_KEY = 'submerge-master-impersonation';
export const REMOTE_SIGNOUT_NOTICE_KEY = 'submerge-remote-signout-notice';
export const DEFAULT_FRANCHISE_ID = 'default';
export const MASTER_IMPERSONATION_UPDATED_EVENT = 'submerge-master-impersonation-updated';

function emitMasterImpersonationUpdate(impersonation: MasterImpersonation | null) {
  if (typeof window === 'undefined' || !window.dispatchEvent) return;
  window.dispatchEvent(
    new CustomEvent(MASTER_IMPERSONATION_UPDATED_EVENT, { detail: { impersonation } })
  );
}

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

export function shouldShowRemoteSignoutNotice() {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(REMOTE_SIGNOUT_NOTICE_KEY) === '1';
}

export function markRemoteSignoutNotice() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(REMOTE_SIGNOUT_NOTICE_KEY, '1');
}

export function clearRemoteSignoutNotice() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(REMOTE_SIGNOUT_NOTICE_KEY);
}

export function readMasterImpersonation(): MasterImpersonation | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MASTER_IMPERSONATION_KEY);
    const parsed = raw ? (JSON.parse(raw) as MasterImpersonation) : null;
    if (!parsed?.franchiseId) return null;
    return parsed;
  } catch (error) {
    console.warn('Unable to read master impersonation:', error);
    return null;
  }
}

export function saveMasterImpersonation(impersonation: MasterImpersonation) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(MASTER_IMPERSONATION_KEY, JSON.stringify(impersonation));
  emitMasterImpersonationUpdate(impersonation);
}

export function clearMasterImpersonation() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(MASTER_IMPERSONATION_KEY);
  emitMasterImpersonationUpdate(null);
}

export function subscribeToMasterImpersonationUpdates(
  callback: (impersonation: MasterImpersonation | null) => void
) {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ impersonation: MasterImpersonation | null }>).detail;
    callback(detail?.impersonation ?? null);
  };
  window.addEventListener(MASTER_IMPERSONATION_UPDATED_EVENT, handler as EventListener);
  return () => window.removeEventListener(MASTER_IMPERSONATION_UPDATED_EVENT, handler as EventListener);
}

export function isMasterSession(): boolean {
  return (readSession()?.role || '').toLowerCase() === 'master';
}

export function isMasterActingAsOwnerSession(): boolean {
  if (!isMasterSession()) return false;
  const impersonation = readMasterImpersonation();
  return Boolean(impersonation?.franchiseId) && (impersonation?.actingRole || 'owner') === 'owner';
}

export function updateSession(partial: Partial<UserSession>): UserSession | null {
  const current = readSession() || {};
  const next = { ...current, ...partial };
  saveSession(next);
  return next;
}

export function getSessionFranchiseId(defaultValue: string = DEFAULT_FRANCHISE_ID) {
  const session = readSession();
  if ((session?.role || '').toLowerCase() === 'master') {
    const impersonation = readMasterImpersonation();
    if (impersonation?.franchiseId) return impersonation.franchiseId;
  }
  return session?.franchiseId || defaultValue;
}

export function getSessionUserName(defaultName = 'Designer') {
  const session = readSession();
  return session?.userName || session?.userEmail || defaultName;
}

export function getSessionRole(
  defaultRole: UserRole = 'designer'
): UserRole {
  const session = readSession();
  const role = session?.role;
  if (role === 'master') {
    const impersonation = readMasterImpersonation();
    if (impersonation?.franchiseId) {
      return (impersonation.actingRole || 'owner') as UserRole;
    }
    return 'master';
  }
  if (role === 'owner') return 'owner';
  if (role === 'admin') return 'admin';
  if (role === 'bookkeeper') return 'bookkeeper';
  if (role === 'designer') return 'designer';
  return defaultRole;
}

export function getSessionFranchiseCode() {
  const session = readSession();
  if ((session?.role || '').toLowerCase() === 'master') {
    const impersonation = readMasterImpersonation();
    if (impersonation?.franchiseCode) return impersonation.franchiseCode;
  }
  return session?.franchiseCode;
}

export function getSessionCommissionRates(): UserCommissionRates {
  return normalizeUserCommissionRates(readSession());
}

export function getSessionApprovalMarginThreshold(defaultValue = 18) {
  const value = Number(readSession()?.approvalMarginThresholdPercent);
  return Number.isFinite(value) ? value : defaultValue;
}

export function getSessionDiscountAllowanceThreshold(defaultValue = 18) {
  const value = Number(readSession()?.discountAllowanceThresholdPercent);
  return Number.isFinite(value) ? value : defaultValue;
}

export function getSessionAlwaysRequireApproval(defaultValue = false) {
  const value = readSession()?.alwaysRequireApproval;
  return typeof value === 'boolean' ? value : defaultValue;
}
