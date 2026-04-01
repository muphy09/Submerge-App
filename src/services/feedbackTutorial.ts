const FEEDBACK_TUTORIAL_STORAGE_PREFIX = 'submerge-feedback-tutorial-seen';

function normalizeUserId(userId?: string | null) {
  return String(userId || '').trim();
}

function storageKey(userId: string) {
  return `${FEEDBACK_TUTORIAL_STORAGE_PREFIX}:${userId}`;
}

export function hasSeenFeedbackTutorial(userId?: string | null) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId || typeof localStorage === 'undefined') return false;

  try {
    return localStorage.getItem(storageKey(normalizedUserId)) === '1';
  } catch (error) {
    console.warn('Unable to read feedback tutorial state:', error);
    return false;
  }
}

export function markFeedbackTutorialSeen(userId?: string | null) {
  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId || typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(storageKey(normalizedUserId), '1');
  } catch (error) {
    console.warn('Unable to persist feedback tutorial state:', error);
  }
}
