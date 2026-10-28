import type { Proposal } from '../types/proposal-new';

// Keep this projection in sync with collab_input_fields / collab_input_value in SQL.
export const contributionSections = ['customerInfo', 'poolSpecs', 'excavation', 'plumbing', 'electrical',
  'tileCopingDecking', 'drainage', 'equipment', 'waterFeatures', 'customFeatures', 'masonry',
  'interiorFinish', 'manualAdjustments', 'retailAdjustments', 'notes', 'contractOverrides', 'warrantySections'] as const;
const derived = new Set(['price', 'basePrice', 'addCost1', 'addCost2', 'addCost3', 'unitPrice', 'cost',
  'totalCost', 'total', 'subtotal', 'taxAmount', 'taxRate', 'percentIncrease', 'overheadMultiplier',
  'fiberglassModelPrice', 'spaFiberglassModelPrice', 'fiberglassCraneCost', 'raisedSpaFacingCost',
  'totalRBBSqft', 'totalRaisedBondBeamSqft', 'hasBeenEdited']);
const custom = new Set(['customOptions', 'customFeatures', 'manualAdjustments', 'retailAdjustments', 'contractOverrides']);
const object = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export const cloneContributionValue = <T,>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
export function contributionValue(value: any, explicit = false): any {
  if (Array.isArray(value)) return value.map(item => contributionValue(item, explicit));
  if (!object(value)) return value;
  const grouped = value.source === 'grouped';
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key)
    && !(Array.isArray(value.features) && key === 'totalCost')
    && !(grouped && ['laborCost','materialCost','totalCost','groupedPricePerSqft','groupedAddonUnitPrice','groupedPricingMode'].includes(key))
    && (explicit || !derived.has(key))).map(([key, item]) => [key, contributionValue(item, explicit || custom.has(key))]));
}
export function contributionInputs(proposal: Partial<Proposal>): Record<string, any> {
  return Object.fromEntries(contributionSections.filter(key => Object.prototype.hasOwnProperty.call(proposal, key))
    .map(key => [key, contributionValue(proposal[key], custom.has(key))]));
}
const ordered = (value: any): any => Array.isArray(value) ? value.map(ordered) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
export const contributionEqual = (a: any, b: any) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));

/** Replay a delta onto the original document, retaining fields absent from a projection.
 * A projection is suitable for detecting intent, never as a replacement document.
 */
export function applyContributionDelta(original: any, before: any, after: any): any {
  if (contributionEqual(before, after)) return cloneContributionValue(original);
  if (Array.isArray(original) && Array.isArray(before) && Array.isArray(after)) {
    // Arrays remain atomic for conflict resolution, but adding/reordering an item
    // must not rebuild the other saved items from a lossy projection or catalog.
    const used = new Set<number>();
    return after.map((item, index) => {
      const matching = !used.has(index) && contributionEqual(before[index], item) ? index
        : before.findIndex((entry, i) => !used.has(i) && contributionEqual(entry, item));
      if (matching >= 0 && original.length === before.length) {
        used.add(matching);
        return cloneContributionValue(original[matching]);
      }
      const identity = (entry: any) => object(entry) ? entry.id || entry.featureId || entry.name : undefined;
      const id = identity(item);
      const previous = id ? before.findIndex((entry, i) => !used.has(i) && identity(entry) === id) : -1;
      if (previous >= 0 && original.length === before.length) {
        used.add(previous);
        return applyContributionDelta(original[previous], before[previous], item);
      }
      return cloneContributionValue(item);
    });
  }
  if (object(before) && object(after) && object(original)) {
    // A newly selected item gets its complete prepared representation. Retaining
    // old financial fields on a different selection would mix two catalog items.
    if (before.id !== after.id || before.name !== after.name || before.featureId !== after.featureId) {
      return cloneContributionValue(after);
    }
    const result = cloneContributionValue(original);
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
      if (contributionEqual(before[key], after[key])) continue;
      const value = applyContributionDelta(original[key], before[key], after[key]);
      if (value === undefined) delete result[key]; else result[key] = value;
    }
    return result;
  }
  return cloneContributionValue(after);
}
export type ContributionConflict = { path: string; before: any; owner: any; proposed: any; message: string;
  allowed?: Array<'owner' | 'contributor'> };
export type ContributionResolutions = Record<string, 'owner' | 'contributor'>;

/** Arrays are atomic: concurrent array edits are surfaced, never silently zipped or dropped. */
export function mergeContribution(base: Proposal, work: Proposal, current: Proposal, resolutions: ContributionResolutions = {}) {
  const conflicts: ContributionConflict[] = [];
  const walk = (before: any, proposed: any, owner: any, path: string): any => {
    if (contributionEqual(before, proposed)) return cloneContributionValue(owner);
    if (object(before) && object(proposed) && object(owner)) {
      const result = cloneContributionValue(owner);
      for (const key of new Set([...Object.keys(before), ...Object.keys(proposed)])) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
        const value = walk(before[key], proposed[key], owner[key], path ? `${path}.${key}` : key);
        if (value === undefined) delete result[key]; else result[key] = value;
      }
      return result;
    }
    if (!contributionEqual(owner, before) && !contributionEqual(owner, proposed)) {
      conflicts.push({ path, before, owner, proposed, message: 'The owner also changed this field.' });
      if (resolutions[path] !== 'contributor') return cloneContributionValue(owner);
    }
    return cloneContributionValue(proposed);
  };
  const merged = walk(contributionInputs(base), contributionInputs(work), contributionInputs(current), '');
  // Replay the input delta onto the full owner document. Replacing sections with
  // their projections erased saved prices, metadata and runtime flags even on no-op reviews.
  const proposal = cloneContributionValue(current) as any;
  const ownerInputs = contributionInputs(current);
  for (const section of contributionSections) {
    if (Object.prototype.hasOwnProperty.call(merged, section)) {
      proposal[section] = applyContributionDelta(proposal[section], ownerInputs[section], merged[section]);
    }
    else delete proposal[section];
  }
  return { proposal: proposal as Proposal, conflicts };
}
