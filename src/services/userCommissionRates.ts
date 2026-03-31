export type UserCommissionRates = {
  digCommissionRate: number;
  closeoutCommissionRate: number;
};

export const DEFAULT_DIG_COMMISSION_RATE = 0.0275;
export const DEFAULT_CLOSEOUT_COMMISSION_RATE = 0.0275;

function normalizeRate(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < 0 || numeric > 1) return fallback;
  return numeric;
}

export function normalizeUserCommissionRates(
  input?: {
    digCommissionRate?: number | null;
    closeoutCommissionRate?: number | null;
  } | null
): UserCommissionRates {
  return {
    digCommissionRate: normalizeRate(input?.digCommissionRate, DEFAULT_DIG_COMMISSION_RATE),
    closeoutCommissionRate: normalizeRate(
      input?.closeoutCommissionRate,
      DEFAULT_CLOSEOUT_COMMISSION_RATE
    ),
  };
}

export function formatCommissionRatePercent(value: unknown, digits = 2): string {
  return (normalizeRate(value, 0) * 100).toFixed(digits);
}

export function parseCommissionPercentInput(value: string, fieldLabel: string): number {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    throw new Error(`${fieldLabel} is required.`);
  }

  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldLabel} must be a valid number.`);
  }
  if (numeric < 0) {
    throw new Error(`${fieldLabel} cannot be negative.`);
  }
  if (numeric > 100) {
    throw new Error(`${fieldLabel} cannot exceed 100%.`);
  }

  return numeric / 100;
}
