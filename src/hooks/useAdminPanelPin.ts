import { useEffect, useState } from 'react';
import {
  getCachedAdminPanelPin,
  loadAdminPanelPin,
  subscribeToStoredAdminPanelPinUpdates,
} from '../services/adminPanelPin';

export function useAdminPanelPin(franchiseId?: string) {
  const cached = franchiseId ? getCachedAdminPanelPin(franchiseId) : undefined;
  const [adminPanelPin, setAdminPanelPin] = useState<string>(() => cached || '');
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(franchiseId) && cached === undefined);

  useEffect(() => {
    if (!franchiseId) {
      setAdminPanelPin('');
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const cachedNow = getCachedAdminPanelPin(franchiseId);
    if (cachedNow !== undefined) {
      setAdminPanelPin(cachedNow);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    loadAdminPanelPin(franchiseId)
      .then((pin) => {
        if (cancelled) return;
        setAdminPanelPin(pin);
        setIsLoading(false);
      })
      .catch((error) => {
        console.warn('Unable to load admin panel PIN:', error);
        if (!cancelled) setIsLoading(false);
      });

    const unsubscribe = subscribeToStoredAdminPanelPinUpdates(franchiseId, (nextPin) => {
      if (cancelled) return;
      setAdminPanelPin(nextPin);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [franchiseId]);

  return { adminPanelPin, isLoading };
}
