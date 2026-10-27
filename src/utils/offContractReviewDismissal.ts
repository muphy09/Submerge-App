import type { Proposal } from '../types/proposal-new';

// UI preferences only: never write a decline into proposal pricing or workflow.
// The in-memory fallback also survives route remounts when storage is unavailable.
const dismissedReviews = new Set<string>();

export function getOffContractReviewKey(proposal: Partial<Proposal>, userId?: string): string {
  return `submerge.offContractReview.declined.${JSON.stringify([
    userId || '', proposal.franchiseId || '', proposal.proposalNumber, proposal.versionId || 'original',
  ])}`;
}

export function isOffContractReviewDismissed(key: string): boolean {
  if (dismissedReviews.has(key)) return true;
  try { return localStorage.getItem(key) === 'declined'; } catch { return false; }
}

export function dismissOffContractReview(key: string): void {
  dismissedReviews.add(key);
  try { localStorage.setItem(key, 'declined'); } catch { /* Keep the session fallback. */ }
}
