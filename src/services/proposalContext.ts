import { getEnvVar } from './env';
import { getSessionFranchiseId, isTestSession, readSession, sessionContextGeneration } from './session';

// An identity is captured before asynchronous work, never reconstructed at commit time.
export function captureProposalContext(): string {
  const session = readSession();
  return JSON.stringify([getEnvVar('VITE_SUPABASE_URL') || 'local',
    session?.userId, session?.appSessionId, session?.role, getSessionFranchiseId(),
    isTestSession(), session?.testAccountId, session?.userEmail, sessionContextGeneration]);
}

export function assertProposalContext(context: string) {
  if (context !== captureProposalContext()) {
    throw new Error('The signed-in account or workspace changed. Reopen the proposal before continuing.');
  }
}

export function proposalCacheEnvironment() {
  return encodeURIComponent(getEnvVar('VITE_SUPABASE_URL') || 'local');
}
