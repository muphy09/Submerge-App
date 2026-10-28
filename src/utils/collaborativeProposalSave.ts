import type { Proposal } from '../types/proposal-new';

/** The collaboration RPC keeps the stored root identity stable across version edits. */
export function alignCollaborativeProposalRoot(proposal: Proposal, storedRootId: string): Proposal {
  const versions = [proposal, ...(proposal.versions || [])];
  const root = versions.find((version) => (version.versionId || 'original') === storedRootId);
  if (!root) throw new Error('The stored root version is missing. Reopen the proposal before saving.');
  return {
    ...proposal,
    ...root,
    versionId: storedRootId,
    versions: versions
      .filter((version) => (version.versionId || 'original') !== storedRootId)
      .map((version) => ({ ...version, versions: [] })),
    activeVersionId: proposal.activeVersionId || proposal.versionId || storedRootId,
    status: proposal.status,
    workflow: proposal.workflow,
    lastModified: proposal.lastModified,
    ownerAuthUserId: proposal.ownerAuthUserId,
    contentRevision: proposal.contentRevision,
    collaborationEnabled: proposal.collaborationEnabled,
  };
}
