const CHANGELOG_PROMPT_STORAGE_KEY = 'submerge-changelog-prompt';

type ChangelogPromptState = {
  lastLaunchedVersion: string | null;
  pendingChangelogVersion: string | null;
  acknowledgedChangelogVersion: string | null;
};

const EMPTY_STATE: ChangelogPromptState = {
  lastLaunchedVersion: null,
  pendingChangelogVersion: null,
  acknowledgedChangelogVersion: null,
};

function normalizeVersion(version?: string | null) {
  const trimmed = typeof version === 'string' ? version.trim() : '';
  return trimmed || null;
}

function readStoredState(): ChangelogPromptState {
  if (typeof localStorage === 'undefined') return EMPTY_STATE;

  try {
    const raw = localStorage.getItem(CHANGELOG_PROMPT_STORAGE_KEY);
    if (!raw) return EMPTY_STATE;

    const parsed = JSON.parse(raw) as Partial<ChangelogPromptState>;
    return {
      lastLaunchedVersion: normalizeVersion(parsed.lastLaunchedVersion),
      pendingChangelogVersion: normalizeVersion(parsed.pendingChangelogVersion),
      acknowledgedChangelogVersion: normalizeVersion(parsed.acknowledgedChangelogVersion),
    };
  } catch (error) {
    console.warn('Unable to read changelog prompt state:', error);
    return EMPTY_STATE;
  }
}

function writeStoredState(state: ChangelogPromptState) {
  if (typeof localStorage === 'undefined') return;

  const normalizedState: ChangelogPromptState = {
    lastLaunchedVersion: normalizeVersion(state.lastLaunchedVersion),
    pendingChangelogVersion: normalizeVersion(state.pendingChangelogVersion),
    acknowledgedChangelogVersion: normalizeVersion(state.acknowledgedChangelogVersion),
  };

  if (
    !normalizedState.lastLaunchedVersion &&
    !normalizedState.pendingChangelogVersion &&
    !normalizedState.acknowledgedChangelogVersion
  ) {
    localStorage.removeItem(CHANGELOG_PROMPT_STORAGE_KEY);
    return;
  }

  localStorage.setItem(CHANGELOG_PROMPT_STORAGE_KEY, JSON.stringify(normalizedState));
}

export function getCurrentAppVersion(defaultVersion = 'dev') {
  return normalizeVersion(window.electron?.appVersion) || defaultVersion;
}

export function recordAppLaunch(version: string) {
  const normalizedVersion = normalizeVersion(version);
  if (!normalizedVersion) return;

  const current = readStoredState();
  if (current.lastLaunchedVersion === normalizedVersion) return;

  writeStoredState({
    ...current,
    lastLaunchedVersion: normalizedVersion,
    pendingChangelogVersion: normalizedVersion,
  });
}

export function hasPendingChangelog(version: string) {
  const normalizedVersion = normalizeVersion(version);
  if (!normalizedVersion) return false;
  return readStoredState().pendingChangelogVersion === normalizedVersion;
}

export function acknowledgeChangelog(version: string) {
  const normalizedVersion = normalizeVersion(version);
  if (!normalizedVersion) return;

  const current = readStoredState();
  writeStoredState({
    ...current,
    lastLaunchedVersion: normalizedVersion,
    pendingChangelogVersion:
      current.pendingChangelogVersion === normalizedVersion
        ? null
        : current.pendingChangelogVersion,
    acknowledgedChangelogVersion: normalizedVersion,
  });
}
