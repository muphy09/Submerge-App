import { useEffect, useState } from 'react';
import { getSessionFranchiseId } from '../services/session';
import {
  getCachedFranchiseLogo,
  loadFranchiseLogo,
  subscribeToFranchiseLogoUpdates,
} from '../services/franchiseBranding';

export function useFranchiseLogo(franchiseId?: string) {
  const resolvedId = franchiseId || getSessionFranchiseId();
  const cached = resolvedId ? getCachedFranchiseLogo(resolvedId) : undefined;
  const [logoUrl, setLogoUrl] = useState<string | null>(() => cached?.logoUrl ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(cached === undefined);

  useEffect(() => {
    if (!resolvedId) {
      setLogoUrl(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const cachedNow = getCachedFranchiseLogo(resolvedId);
    if (cachedNow !== undefined) {
      setLogoUrl(cachedNow?.logoUrl ?? null);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    loadFranchiseLogo(resolvedId)
      .then((record) => {
        if (cancelled) return;
        setLogoUrl(record?.logoUrl ?? null);
        setIsLoading(false);
      })
      .catch((error) => {
        console.warn('Unable to load franchise logo:', error);
        if (!cancelled) setIsLoading(false);
      });

    const unsubscribe = subscribeToFranchiseLogoUpdates(resolvedId, (nextLogo) => {
      if (cancelled) return;
      setLogoUrl(nextLogo);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [resolvedId]);

  return { logoUrl, isLoading };
}
