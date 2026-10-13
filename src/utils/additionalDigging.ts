import type { Excavation, Proposal } from '../types/proposal-new';

export const EXCAVATION_DAYS_CONTRACT_FIELD = 'p1_30';

export const normalizeAdditionalDiggingDays = (value: unknown): number => {
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 1 ? days : 1;
};

export const getAdditionalDiggingDays = (excavation?: Partial<Excavation>): number =>
  excavation?.hasAdditionalDigging ? normalizeAdditionalDiggingDays(excavation.additionalDiggingDays) : 0;

export const parseContractExcavationDays = (value: unknown): number | null => {
  if (value == null || String(value).trim() === '') return null;
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 1 ? days : null;
};

// Existing manual contract totals become the same selection as a new contract edit.
// Keep the override until a user changes the proposal control or saves the contract.
export const syncAdditionalDiggingFromContract = <T extends Partial<Proposal>>(proposal: T): T => {
  const total = parseContractExcavationDays(proposal.contractOverrides?.[EXCAVATION_DAYS_CONTRACT_FIELD]);
  if (total === null) return proposal;
  return { ...proposal, excavation: { ...proposal.excavation,
    hasAdditionalDigging: total > 1, additionalDiggingDays: total > 1 ? total - 1 : 1,
  } };
};
