import { getSessionFranchiseId, readSession, type UserSession } from './session';

const ADMIN_COGS_VIEW_STORAGE_PREFIX = 'submerge.adminCogsView';
const ADMIN_COGS_VIEW_UPDATED_EVENT = 'submerge-admin-cogs-view-updated';

type AdminCogsViewScopeOptions = {
  franchiseId?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  session?: UserSession | null;
};

type AdminCogsViewScope = {
  franchiseId: string;
  userKey: string;
};

type AdminCogsViewPreference = {
  hideCogsFromProposalBuilder: boolean;
};

function normalizeStoragePart(value: string | null | undefined, fallback: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return fallback;
  return encodeURIComponent(trimmed.toLowerCase());
}

function resolveScope(options: AdminCogsViewScopeOptions = {}): AdminCogsViewScope {
  const session = options.session ?? readSession();
  const franchiseId = options.franchiseId || getSessionFranchiseId() || 'default';
  const userKey =
    options.userId ||
    session?.userId ||
    options.userEmail ||
    session?.userEmail ||
    options.userName ||
    session?.userName ||
    'default';

  return {
    franchiseId: normalizeStoragePart(franchiseId, 'default'),
    userKey: normalizeStoragePart(userKey, 'default'),
  };
}

function storageKey(options: AdminCogsViewScopeOptions = {}) {
  const scope = resolveScope(options);
  return `${ADMIN_COGS_VIEW_STORAGE_PREFIX}.${scope.franchiseId}.${scope.userKey}`;
}

function emitAdminCogsViewUpdate(options: AdminCogsViewScopeOptions, hideCogsFromProposalBuilder: boolean) {
  if (typeof window === 'undefined' || !window.dispatchEvent) return;
  const scope = resolveScope(options);
  window.dispatchEvent(
    new CustomEvent(ADMIN_COGS_VIEW_UPDATED_EVENT, {
      detail: {
        franchiseId: scope.franchiseId,
        userKey: scope.userKey,
        hideCogsFromProposalBuilder,
      },
    })
  );
}

function parsePreference(raw: string | null): AdminCogsViewPreference {
  if (!raw) {
    return { hideCogsFromProposalBuilder: false };
  }

  try {
    const parsed = JSON.parse(raw) as boolean | Partial<AdminCogsViewPreference> | null;
    if (typeof parsed === 'boolean') {
      return { hideCogsFromProposalBuilder: parsed };
    }
    return {
      hideCogsFromProposalBuilder: Boolean(parsed?.hideCogsFromProposalBuilder),
    };
  } catch (error) {
    if (raw === 'true' || raw === 'false') {
      return { hideCogsFromProposalBuilder: raw === 'true' };
    }
    console.warn('Unable to parse admin COGS view preference:', error);
    return { hideCogsFromProposalBuilder: false };
  }
}

export function getHideCogsFromProposalBuilder(options: AdminCogsViewScopeOptions = {}) {
  if (typeof localStorage === 'undefined') return false;
  try {
    const stored = localStorage.getItem(storageKey(options));
    return parsePreference(stored).hideCogsFromProposalBuilder;
  } catch (error) {
    console.warn('Unable to read admin COGS view preference:', error);
    return false;
  }
}

export function saveHideCogsFromProposalBuilder(
  hideCogsFromProposalBuilder: boolean,
  options: AdminCogsViewScopeOptions = {}
) {
  if (typeof localStorage !== 'undefined') {
    const key = storageKey(options);
    if (hideCogsFromProposalBuilder) {
      localStorage.setItem(key, JSON.stringify({ hideCogsFromProposalBuilder: true }));
    } else {
      localStorage.removeItem(key);
    }
  }

  emitAdminCogsViewUpdate(options, hideCogsFromProposalBuilder);
  return hideCogsFromProposalBuilder;
}

export function subscribeToAdminCogsViewUpdates(
  options: AdminCogsViewScopeOptions,
  callback: (hideCogsFromProposalBuilder: boolean) => void
) {
  if (typeof window === 'undefined' || !window.addEventListener) return () => {};

  const scope = resolveScope(options);
  const handler = (
    event: Event
  ) => {
    const detail = (
      event as CustomEvent<{
        franchiseId: string;
        userKey: string;
        hideCogsFromProposalBuilder: boolean;
      }>
    ).detail;

    if (!detail) return;
    if (detail.franchiseId !== scope.franchiseId || detail.userKey !== scope.userKey) return;
    callback(Boolean(detail.hideCogsFromProposalBuilder));
  };

  window.addEventListener(ADMIN_COGS_VIEW_UPDATED_EVENT, handler as EventListener);
  return () => window.removeEventListener(ADMIN_COGS_VIEW_UPDATED_EVENT, handler as EventListener);
}
