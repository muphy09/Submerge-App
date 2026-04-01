export const DEFAULT_ADMIN_PANEL_PIN = '2026';
export const ADMIN_PANEL_PIN_LENGTH = 4;
export const MIN_ADMIN_PANEL_PIN_LENGTH = ADMIN_PANEL_PIN_LENGTH;
export const MAX_ADMIN_PANEL_PIN_LENGTH = ADMIN_PANEL_PIN_LENGTH;
export const ADMIN_PANEL_PIN_MAX_ATTEMPTS = 5;
export const ADMIN_PANEL_PIN_ATTEMPT_WINDOW_MS = 60 * 1000;
export const ADMIN_PANEL_PIN_LOCKOUT_MS = 10 * 60 * 1000;
export const ADMIN_PANEL_PIN_LOCKOUT_MESSAGE = 'Too many incorrect attempts. Wait 10 min';

export function sanitizeAdminPanelPinInput(value: string) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, ADMIN_PANEL_PIN_LENGTH);
}
