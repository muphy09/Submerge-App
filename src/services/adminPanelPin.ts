const ADMIN_PANEL_PIN_STORAGE_PREFIX = 'submerge.adminPanelPin';
const ADMIN_PANEL_PIN_SECURITY_STORAGE_PREFIX = 'submerge.adminPanelPinSecurity';

export const DEFAULT_ADMIN_PANEL_PIN = '2026';
export const ADMIN_PANEL_PIN_LENGTH = 4;
export const MIN_ADMIN_PANEL_PIN_LENGTH = ADMIN_PANEL_PIN_LENGTH;
export const MAX_ADMIN_PANEL_PIN_LENGTH = ADMIN_PANEL_PIN_LENGTH;
export const ADMIN_PANEL_PIN_MAX_ATTEMPTS = 5;
export const ADMIN_PANEL_PIN_ATTEMPT_WINDOW_MS = 60 * 1000;
export const ADMIN_PANEL_PIN_LOCKOUT_MS = 10 * 60 * 1000;
export const ADMIN_PANEL_PIN_LOCKOUT_MESSAGE = 'Too many incorrect attempts. Wait 10 min';

type AdminPanelPinSecurityState = {
  failedAttemptTimestamps: number[];
  lockedUntil: number | null;
};

function getAdminPanelPinStorageKey(franchiseId: string) {
  return `${ADMIN_PANEL_PIN_STORAGE_PREFIX}.${franchiseId || 'default'}`;
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
      ? raw.failedAttemptTimestamps.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      : [],
    lockedUntil: typeof raw?.lockedUntil === 'number' && Number.isFinite(raw.lockedUntil) ? raw.lockedUntil : null,
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

export function sanitizeAdminPanelPinInput(value: string) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, ADMIN_PANEL_PIN_LENGTH);
}

export function getStoredAdminPanelPin(franchiseId: string) {
  if (typeof localStorage === 'undefined') {
    return DEFAULT_ADMIN_PANEL_PIN;
  }

  try {
    const stored = localStorage.getItem(getAdminPanelPinStorageKey(franchiseId));
    const normalized = sanitizeAdminPanelPinInput(stored || '');
    return normalized || DEFAULT_ADMIN_PANEL_PIN;
  } catch (error) {
    console.warn('Unable to read admin panel PIN:', error);
    return DEFAULT_ADMIN_PANEL_PIN;
  }
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

export function saveAdminPanelPin(franchiseId: string, pin: string) {
  const normalizedPin = sanitizeAdminPanelPinInput(pin);
  if (normalizedPin.length !== ADMIN_PANEL_PIN_LENGTH) {
    throw new Error(`PIN must be exactly ${ADMIN_PANEL_PIN_LENGTH} digits.`);
  }

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(getAdminPanelPinStorageKey(franchiseId), normalizedPin);
  }
  clearAdminPanelPinFailures(franchiseId);

  return normalizedPin;
}

export function resetAdminPanelPin(franchiseId: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(getAdminPanelPinStorageKey(franchiseId));
  }
  clearAdminPanelPinFailures(franchiseId);

  return DEFAULT_ADMIN_PANEL_PIN;
}

export function isAdminPanelPinValid(franchiseId: string, pin: string) {
  const normalizedInput = sanitizeAdminPanelPinInput(pin);
  if (!normalizedInput) return false;
  return normalizedInput === getStoredAdminPanelPin(franchiseId);
}
