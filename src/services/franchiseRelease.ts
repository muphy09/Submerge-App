import releaseState from '../../release-state.json';
import { alignedFrom } from '../../release-version-policy.json';
import { getSupabaseClient } from './supabaseClient';

export type FranchiseReleaseAssignment = {
  coreVersion: string;
  franchiseReleaseNumber: number;
  releaseChannel: 'stable' | 'canary' | 'paused';
  minimumRequiredVersion?: string | null;
  updateEnabled: boolean;
  releaseNotes?: string | null;
};

type PackagedReleaseState = {
  coreVersion?: string;
  franchises?: Record<string, number>;
};

const packagedReleaseState = releaseState as PackagedReleaseState;

const schemaUnavailable = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || message.includes('does not exist') || message.includes('schema cache');
};

export function getUpdateChannel(role?: string | null, franchiseCode?: string | null) {
  if (String(role || '').toLowerCase() === 'master') return 'master';
  const normalizedCode = String(franchiseCode || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return normalizedCode ? `franchise-${normalizedCode}` : null;
}

export function formatFranchiseAppVersion(version: string) {
  const normalized = String(version || '').trim().replace(/^v/i, '');
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)-(?:franchise-[a-z0-9-]+|master)\.(\d+)$/i);
  if (match) {
    const core = match.slice(1, 4).map(Number);
    const differingIndex = core.findIndex((value, index) => value !== alignedFrom[index]);
    const legacy = differingIndex >= 0 && core[differingIndex] < alignedFrom[differingIndex];
    const releasedPatch = legacy ? Math.max(core[2] - 1, 0) : core[2];
    return `${match[1]}.${match[2]}.${releasedPatch}-${match[4]}`;
  }
  const stable = normalized.match(/^(\d+\.\d+\.\d+)/);
  return stable ? `${stable[1]}-1` : normalized || 'dev';
}

export function getLatestFranchiseAppVersion(franchiseCode?: string | null) {
  const normalizedCode = String(franchiseCode || '').trim().toLowerCase();
  const coreVersion = String(packagedReleaseState.coreVersion || '').trim();
  const releaseNumber = packagedReleaseState.franchises?.[normalizedCode];
  if (!coreVersion || !Number.isInteger(releaseNumber) || Number(releaseNumber) < 1) return null;
  return `${coreVersion}-franchise-${normalizedCode}.${releaseNumber}`;
}

export async function loadFranchiseReleaseAssignment(
  franchiseId?: string | null
): Promise<FranchiseReleaseAssignment | null> {
  if (!franchiseId) return null;
  const supabase = getSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('franchise_release_assignments')
    .select('core_version,franchise_release_number,release_channel,minimum_required_version,update_enabled,release_notes')
    .eq('franchise_id', franchiseId)
    .maybeSingle();
  if (error) {
    if (schemaUnavailable(error)) return null;
    throw error;
  }
  if (!data) return null;
  return {
    coreVersion: data.core_version,
    franchiseReleaseNumber: data.franchise_release_number,
    releaseChannel: data.release_channel,
    minimumRequiredVersion: data.minimum_required_version,
    updateEnabled: data.update_enabled !== false,
    releaseNotes: data.release_notes,
  };
}
