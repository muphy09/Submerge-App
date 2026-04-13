import { useEffect, useState } from 'react';
import { getSessionFranchiseId } from '../services/session';
import {
  getCachedFranchiseSignedWorkflowDisabled,
  loadFranchiseSignedWorkflowDisabled,
  subscribeToFranchiseSignedWorkflowUpdates,
} from '../services/franchiseBranding';

export function useFranchiseSignedWorkflowDisabled(franchiseId?: string) {
  const resolvedId = franchiseId || getSessionFranchiseId();
  const cached = resolvedId ? getCachedFranchiseSignedWorkflowDisabled(resolvedId) : undefined;
  const [disableSignedWorkflow, setDisableSignedWorkflow] = useState<boolean>(cached === true);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(resolvedId) && cached === undefined);

  useEffect(() => {
    if (!resolvedId) {
      setDisableSignedWorkflow(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const cachedNow = getCachedFranchiseSignedWorkflowDisabled(resolvedId);
    if (cachedNow !== undefined) {
      setDisableSignedWorkflow(cachedNow === true);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    loadFranchiseSignedWorkflowDisabled(resolvedId)
      .then((value) => {
        if (cancelled) return;
        setDisableSignedWorkflow(value === true);
        setIsLoading(false);
      })
      .catch((error) => {
        console.warn('Unable to load signed workflow setting:', error);
        if (!cancelled) setIsLoading(false);
      });

    const unsubscribe = subscribeToFranchiseSignedWorkflowUpdates(resolvedId, (nextValue) => {
      if (cancelled) return;
      setDisableSignedWorkflow(nextValue === true);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [resolvedId]);

  return { disableSignedWorkflow, isLoading };
}
