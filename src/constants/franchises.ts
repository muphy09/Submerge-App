export const PPAS_EAST_FRANCHISE_ID = 'aa414a3a-f9b2-4c96-b3c0-8ea496105354';

export function isPpasEastFranchiseId(franchiseId?: string | null): boolean {
  return String(franchiseId || '').trim().toLowerCase() === PPAS_EAST_FRANCHISE_ID;
}
