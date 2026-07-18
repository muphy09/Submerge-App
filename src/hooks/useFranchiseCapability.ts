import { useEffect, useState } from 'react';
import { getSessionFranchiseId } from '../services/session';
import {
  getCachedFranchiseConfiguration,
  isFranchiseCapabilityEnabled,
  loadFranchiseConfiguration,
  subscribeToFranchiseConfigurationUpdates,
  type FranchiseCapabilities,
} from '../services/franchiseConfiguration';

export function useFranchiseCapability(
  capability: keyof FranchiseCapabilities | string,
  franchiseId?: string
) {
  const resolvedId = franchiseId || getSessionFranchiseId();
  const cached = resolvedId ? getCachedFranchiseConfiguration(resolvedId) : null;
  const [enabled, setEnabled] = useState(() =>
    isFranchiseCapabilityEnabled(cached, capability)
  );
  const [isLoading, setIsLoading] = useState(Boolean(resolvedId) && !cached);

  useEffect(() => {
    if (!resolvedId) {
      setEnabled(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const cachedNow = getCachedFranchiseConfiguration(resolvedId);
    setEnabled(isFranchiseCapabilityEnabled(cachedNow, capability));
    setIsLoading(!cachedNow);

    void loadFranchiseConfiguration(resolvedId, { force: true })
      .then((record) => {
        if (cancelled) return;
        setEnabled(isFranchiseCapabilityEnabled(record, capability));
        setIsLoading(false);
      })
      .catch((error) => {
        console.warn(`Unable to load franchise capability ${String(capability)}:`, error);
        if (!cancelled) setIsLoading(false);
      });

    const unsubscribe = subscribeToFranchiseConfigurationUpdates(resolvedId, (record) => {
      if (cancelled) return;
      setEnabled(isFranchiseCapabilityEnabled(record, capability));
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [capability, resolvedId]);

  return { enabled, isLoading };
}
