import { useEffect, useState } from 'react';
import { getSessionFranchiseId } from '../services/session';
import {
  DEFAULT_APP_NAME,
  getCachedFranchiseAppName,
  loadFranchiseAppName,
  subscribeToFranchiseAppNameUpdates,
} from '../services/franchiseBranding';

export function useFranchiseAppName(franchiseId?: string) {
  const resolvedId = franchiseId || getSessionFranchiseId();
  const cached = resolvedId ? getCachedFranchiseAppName(resolvedId) : undefined;
  const [appName, setAppName] = useState<string | null>(() => cached ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(cached === undefined);

  useEffect(() => {
    if (!resolvedId) {
      setAppName(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const cachedNow = getCachedFranchiseAppName(resolvedId);
    if (cachedNow !== undefined) {
      setAppName(cachedNow ?? null);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    loadFranchiseAppName(resolvedId)
      .then((value) => {
        if (cancelled) return;
        setAppName(value ?? null);
        setIsLoading(false);
      })
      .catch((error) => {
        console.warn('Unable to load franchise app name:', error);
        if (!cancelled) setIsLoading(false);
      });

    const unsubscribe = subscribeToFranchiseAppNameUpdates(resolvedId, (nextName) => {
      if (cancelled) return;
      setAppName(nextName ?? null);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [resolvedId]);

  const trimmed = (appName || '').trim();
  const displayName = trimmed ? trimmed : DEFAULT_APP_NAME;

  return { appName, displayName, isLoading };
}
