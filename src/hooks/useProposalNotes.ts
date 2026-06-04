import { useEffect, useState } from 'react';
import {
  getCachedFranchiseProposalNotes,
  loadFranchiseProposalNotes,
  subscribeToFranchiseProposalNotesUpdates,
} from '../services/proposalNotesAdapter';
import { getSessionFranchiseId } from '../services/session';
import { normalizeProposalNoteOverrides, type ProposalNoteOverrides } from '../utils/proposalNotes';

export function useProposalNotes(franchiseId?: string) {
  const resolvedId = franchiseId || getSessionFranchiseId();
  const cached = resolvedId ? getCachedFranchiseProposalNotes(resolvedId) : undefined;
  const [notes, setNotes] = useState<ProposalNoteOverrides>(() => normalizeProposalNoteOverrides(cached?.notes));
  const [isLoading, setIsLoading] = useState<boolean>(cached === undefined);

  useEffect(() => {
    if (!resolvedId) {
      setNotes({});
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const cachedNow = getCachedFranchiseProposalNotes(resolvedId);
    if (cachedNow !== undefined) {
      setNotes(normalizeProposalNoteOverrides(cachedNow?.notes));
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    loadFranchiseProposalNotes(resolvedId)
      .then((record) => {
        if (cancelled) return;
        setNotes(normalizeProposalNoteOverrides(record?.notes));
        setIsLoading(false);
      })
      .catch((error) => {
        console.warn('Unable to load proposal notes:', error);
        if (!cancelled) setIsLoading(false);
      });

    const unsubscribe = subscribeToFranchiseProposalNotesUpdates(resolvedId, (nextNotes) => {
      if (cancelled) return;
      setNotes(normalizeProposalNoteOverrides(nextNotes));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [resolvedId]);

  return { notes, isLoading };
}
