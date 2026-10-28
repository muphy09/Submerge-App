import { getSessionFranchiseId, isTestSession, readSession } from './session';
import { proposalCacheEnvironment } from './proposalContext';

// Keep receipts across sign-out, scoped to the account and workspace. Store only
// a digest, never the contents of a potentially private sharing message.
export async function collaborationNoteReceiptKey(proposalNumber: string, shareId: string, note: string) {
  const scope = JSON.stringify([proposalCacheEnvironment(), isTestSession(), readSession()?.userId,
    getSessionFranchiseId(), proposalNumber, shareId, note.trim()]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(scope));
  return 'submerge.collaborationNoteSeen.v1.' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function hasCollaborationNoteReceipt(key: string) {
  try { return localStorage.getItem(key) === 'seen'; } catch { return false; }
}

export function saveCollaborationNoteReceipt(key: string) {
  try { localStorage.setItem(key, 'seen'); }
  catch (error) { console.warn('Could not remember the dismissed sharing note.', error); }
}
