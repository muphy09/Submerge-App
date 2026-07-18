import type { Proposal } from '../types/proposal-new';

export const PPAS_EAST_FRANCHISE_CODE = '9724';

export function isPpasEastFranchiseCode(franchiseCode?: string | null): boolean {
  return String(franchiseCode || '').trim() === PPAS_EAST_FRANCHISE_CODE;
}

export function isPpasEastProposal(proposal?: Partial<Proposal> | null): boolean {
  return isPpasEastFranchiseCode(proposal?.designerCode);
}
