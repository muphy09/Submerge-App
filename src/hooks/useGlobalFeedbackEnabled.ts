import { useEffect, useState } from 'react';
import {
  getCachedGlobalFeedbackEnabled,
  loadGlobalFeedbackEnabled,
  subscribeToGlobalFeedbackEnabledUpdates,
} from '../services/feedback';

type UseGlobalFeedbackEnabledOptions = {
  poll?: boolean;
};

const GLOBAL_FEEDBACK_POLL_INTERVAL_MS = 15000;

export function useGlobalFeedbackEnabled(
  options: UseGlobalFeedbackEnabledOptions = {}
) {
  const { poll = false } = options;
  const cached = getCachedGlobalFeedbackEnabled();
  const [feedbackEnabled, setFeedbackEnabled] = useState<boolean>(() => cached ?? true);
  const [isLoading, setIsLoading] = useState<boolean>(cached === undefined);

  useEffect(() => {
    let cancelled = false;

    const syncFeedbackEnabled = async (force = false) => {
      try {
        const enabled = await loadGlobalFeedbackEnabled({ force });
        if (cancelled) return;
        setFeedbackEnabled(enabled);
        setIsLoading(false);
      } catch (error) {
        console.warn('Unable to load global feedback setting:', error);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    const cachedNow = getCachedGlobalFeedbackEnabled();
    if (cachedNow !== undefined) {
      setFeedbackEnabled(cachedNow);
      setIsLoading(poll);
    } else {
      setIsLoading(true);
    }

    void syncFeedbackEnabled(poll);

    const unsubscribe = subscribeToGlobalFeedbackEnabledUpdates((nextEnabled) => {
      if (cancelled) return;
      setFeedbackEnabled(nextEnabled);
      setIsLoading(false);
    });

    let intervalId: number | null = null;
    const handleVisibilityRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void syncFeedbackEnabled(true);
    };

    if (poll && typeof window !== 'undefined') {
      intervalId = window.setInterval(() => {
        void syncFeedbackEnabled(true);
      }, GLOBAL_FEEDBACK_POLL_INTERVAL_MS);

      window.addEventListener('online', handleVisibilityRefresh);
      window.addEventListener('focus', handleVisibilityRefresh);
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityRefresh);
      }
    }

    return () => {
      cancelled = true;
      unsubscribe();
      if (intervalId !== null && typeof window !== 'undefined') {
        window.clearInterval(intervalId);
      }
      if (poll && typeof window !== 'undefined') {
        window.removeEventListener('online', handleVisibilityRefresh);
        window.removeEventListener('focus', handleVisibilityRefresh);
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', handleVisibilityRefresh);
        }
      }
    };
  }, [poll]);

  return { feedbackEnabled, isLoading };
}
