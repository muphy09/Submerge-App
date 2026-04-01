import {
  DEFAULT_ADMIN_PANEL_PIN,
  ADMIN_PANEL_PIN_LENGTH,
  MIN_ADMIN_PANEL_PIN_LENGTH,
  MAX_ADMIN_PANEL_PIN_LENGTH,
  ADMIN_PANEL_PIN_MAX_ATTEMPTS,
  ADMIN_PANEL_PIN_ATTEMPT_WINDOW_MS,
  ADMIN_PANEL_PIN_LOCKOUT_MS,
  ADMIN_PANEL_PIN_LOCKOUT_MESSAGE,
  sanitizeAdminPanelPinInput,
} from './adminPanelPinConfig';
import {
  getCachedFranchiseAdminPanelPin,
  loadFranchiseAdminPanelPin,
  saveFranchiseAdminPanelPin,
  subscribeToFranchiseAdminPanelPinUpdates,
} from './franchiseBranding';

const LEGACY_ADMIN_PANEL_PIN_STORAGE_PREFIX = 'submerge.adminPanelPin';
const ADMIN_PANEL_PIN_SECURITY_STORAGE_PREFIX = 'submerge.adminPanelPinSecurity';

type AdminPanelPinSecurityState = {
  failedAttemptTimestamps: number[];
  lockedUntil: number | null;
};

const loadedFranchiseIds = new Set<string>();
const pendingLoads = new Map<string, Promise<string>>();

function getLegacyAdminPanelPinStorageKey(franchiseId: string) {
  return `${LEGACY_ADMIN_PANEL_PIN_STORAGE_PREFIX}.${franchiseId || 'default'}`;
}

function getAdminPanelPinSecurityStorageKey(franchiseId: string) {
  return `${ADMIN_PANEL_PIN_SECURITY_STORAGE_PREFIX}.${franchiseId || 'default'}`;
}

function getDefaultSecurityState(): AdminPanelPinSecurityState {
  return {
    failedAttemptTimestamps: [],
    lockedUntil: null,
  };
}

function sanitizeSecurityState(raw: Partial<AdminPanelPinSecurityState> | null | undefined): AdminPanelPinSecurityState {
  return {
    failedAttemptTimestamps: Array.isArray(raw?.failedAttemptTimestamps)
      ? raw.failedAttemptTimestamps.filter(
          (value): value is number => typeof value === 'number' && Number.isFinite(value)
        )
      : [],
    lockedUntil:
      typeof raw?.lockedUntil === 'number' && Number.isFinite(raw.lockedUntil)
        ? raw.lockedUntil
        : null,
  };
}

function pruneSecurityState(
  state: AdminPanelPinSecurityState,
  now: number = Date.now()
): AdminPanelPinSecurityState {
  return {
    failedAttemptTimestamps: state.failedAttemptTimestamps.filter(
      (timestamp) => now - timestamp <= ADMIN_PANEL_PIN_ATTEMPT_WINDOW_MS
    ),
    lockedUntil: state.lockedUntil && state.lockedUntil > now ? state.lockedUntil : null,
  };
}

function persistSecurityState(franchiseId: string, state: AdminPanelPinSecurityState) {
  if (typeof localStorage === 'undefined') return;
  const key = getAdminPanelPinSecurityStorageKey(franchiseId);
  const isEmpty = !state.failedAttemptTimestamps.length && !state.lockedUntil;
  if (isEmpty) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(state));
}

function readSecurityState(franchiseId: string) {
  if (typeof localStorage === 'undefined') {
    return getDefaultSecurityState();
  }

  try {
    const raw = localStorage.getItem(getAdminPanelPinSecurityStorageKey(franchiseId));
    const parsed = raw ? (JSON.parse(raw) as Partial<AdminPanelPinSecurityState>) : null;
    const state = pruneSecurityState(sanitizeSecurityState(parsed));
    persistSecurityState(franchiseId, state);
    return state;
  } catch (error) {
    console.warn('Unable to read admin panel PIN security state:', error);
    return getDefaultSecurityState();
  }
}

function getLegacyStoredAdminPanelPin(franchiseId: string) {
  if (typeof localStorage === 'undefined') {
    return null;
  }

  try {
    const stored = localStorage.getItem(getLegacyAdminPanelPinStorageKey(franchiseId));
    const normalized = sanitizeAdminPanelPinInput(stored || '');
    return normalized.length === ADMIN_PANEL_PIN_LENGTH ? normalized : null;
  } catch (error) {
    console.warn('Unable to read legacy admin panel PIN:', error);
    return null;
  }
}

function clearLegacyStoredAdminPanelPin(franchiseId: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(getLegacyAdminPanelPinStorageKey(franchiseId));
}

export {
  DEFAULT_ADMIN_PANEL_PIN,
  ADMIN_PANEL_PIN_LENGTH,
  MIN_ADMIN_PANEL_PIN_LENGTH,
  MAX_ADMIN_PANEL_PIN_LENGTH,
  ADMIN_PANEL_PIN_MAX_ATTEMPTS,
  ADMIN_PANEL_PIN_ATTEMPT_WINDOW_MS,
  ADMIN_PANEL_PIN_LOCKOUT_MS,
  ADMIN_PANEL_PIN_LOCKOUT_MESSAGE,
  sanitizeAdminPanelPinInput,
};

export function getCachedAdminPanelPin(franchiseId: string) {
  const cached = getCachedFranchiseAdminPanelPin(franchiseId);
  if (cached === undefined) return undefined;
  return cached ?? DEFAULT_ADMIN_PANEL_PIN;
}

export function hasLoadedAdminPanelPin(franchiseId: string) {
  if (!franchiseId) return true;
  return loadedFranchiseIds.has(franchiseId) || getCachedFranchiseAdminPanelPin(franchiseId) !== undefined;
}

export async function loadAdminPanelPin(
  franchiseId: string,
  options: { force?: boolean } = {}
) {
  if (!franchiseId) return DEFAULT_ADMIN_PANEL_PIN;
  if (!options.force && pendingLoads.has(franchiseId)) {
    return pendingLoads.get(franchiseId)!;
  }

  const loadPromise = (async () => {
    const cachedPin = getCachedFranchiseAdminPanelPin(franchiseId);
    const legacyPin = getLegacyStoredAdminPanelPin(franchiseId);
    let resolvedPin = cachedPin ?? null;

    try {
      resolvedPin = await loadFranchiseAdminPanelPin(franchiseId, options);
    } catch (error) {
      console.warn('Unable to load admin panel PIN from franchise settings:', error);
    }

    if (!resolvedPin && legacyPin && legacyPin !== DEFAULT_ADMIN_PANEL_PIN) {
      try {
        await saveFranchiseAdminPanelPin(
          {
            franchiseId,
            adminPanelPin: legacyPin,
            updatedBy: null,
          },
          { skipLedger: true }
        );
        resolvedPin = legacyPin;
        clearLegacyStoredAdminPanelPin(franchiseId);
      } catch (error) {
        console.warn('Unable to migrate legacy admin panel PIN to franchise settings:', error);
        resolvedPin = legacyPin;
      }
    }

    loadedFranchiseIds.add(franchiseId);
    return resolvedPin || legacyPin || DEFAULT_ADMIN_PANEL_PIN;
  })();

  pendingLoads.set(franchiseId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    pendingLoads.delete(franchiseId);
  }
}

export function getStoredAdminPanelPin(franchiseId: string) {
  return getCachedAdminPanelPin(franchiseId) || getLegacyStoredAdminPanelPin(franchiseId) || DEFAULT_ADMIN_PANEL_PIN;
}

export function subscribeToStoredAdminPanelPinUpdates(
  franchiseId: string,
  callback: (pin: string) => void
) {
  if (!franchiseId) return () => {};
  return subscribeToFranchiseAdminPanelPinUpdates(franchiseId, (nextPin) => {
    loadedFranchiseIds.add(franchiseId);
    callback(nextPin || DEFAULT_ADMIN_PANEL_PIN);
  });
}

export function clearAdminPanelPinFailures(franchiseId: string) {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(getAdminPanelPinSecurityStorageKey(franchiseId));
}

export function getAdminPanelPinLockout(franchiseId: string) {
  const state = readSecurityState(franchiseId);
  const lockedUntil = state.lockedUntil;
  return {
    locked: Boolean(lockedUntil),
    lockedUntil,
    remainingMs: lockedUntil ? Math.max(0, lockedUntil - Date.now()) : 0,
  };
}

export function recordFailedAdminPanelPinAttempt(franchiseId: string) {
  const now = Date.now();
  const current = pruneSecurityState(readSecurityState(franchiseId), now);
  if (current.lockedUntil && current.lockedUntil > now) {
    return {
      locked: true,
      lockedUntil: current.lockedUntil,
      remainingMs: current.lockedUntil - now,
    };
  }

  const failedAttemptTimestamps = [...current.failedAttemptTimestamps, now];
  if (failedAttemptTimestamps.length >= ADMIN_PANEL_PIN_MAX_ATTEMPTS) {
    const lockedUntil = now + ADMIN_PANEL_PIN_LOCKOUT_MS;
    persistSecurityState(franchiseId, {
      failedAttemptTimestamps: [],
      lockedUntil,
    });
    return {
      locked: true,
      lockedUntil,
      remainingMs: ADMIN_PANEL_PIN_LOCKOUT_MS,
    };
  }

  persistSecurityState(franchiseId, {
    failedAttemptTimestamps,
    lockedUntil: null,
  });

  return {
    locked: false,
    lockedUntil: null,
    remainingMs: 0,
  };
}

export async function saveAdminPanelPin(
  franchiseId: string,
  pin: string,
  options: { updatedBy?: string | null } = {}
) {
  const normalizedPin = sanitizeAdminPanelPinInput(pin);
  if (normalizedPin.length !== ADMIN_PANEL_PIN_LENGTH) {
    throw new Error(`PIN must be exactly ${ADMIN_PANEL_PIN_LENGTH} digits.`);
  }

  await saveFranchiseAdminPanelPin({
    franchiseId,
    adminPanelPin: normalizedPin,
    updatedBy: options.updatedBy ?? null,
  });

  loadedFranchiseIds.add(franchiseId);
  clearLegacyStoredAdminPanelPin(franchiseId);
  clearAdminPanelPinFailures(franchiseId);
  return normalizedPin;
}

export async function resetAdminPanelPin(
  franchiseId: string,
  options: { updatedBy?: string | null } = {}
) {
  await saveFranchiseAdminPanelPin({
    franchiseId,
    adminPanelPin: null,
    updatedBy: options.updatedBy ?? null,
  });

  loadedFranchiseIds.add(franchiseId);
  clearLegacyStoredAdminPanelPin(franchiseId);
  clearAdminPanelPinFailures(franchiseId);
  return DEFAULT_ADMIN_PANEL_PIN;
}

export function isAdminPanelPinValid(franchiseId: string, pin: string) {
  const normalizedInput = sanitizeAdminPanelPinInput(pin);
  if (!normalizedInput) return false;
  return normalizedInput === getStoredAdminPanelPin(franchiseId);
}
