import type { Proposal } from '../types/proposal-new';
import type { CollaborationRequest } from './proposalCollaboration';
import { loadPricingSnapshotForExistingProposal, withTemporaryPricingSnapshot } from './pricingDataStore';
import { hydrateProposalEquipmentFromRevision } from './pricingRevisionReview';
import { normalizePapDiscounts } from '../utils/papDiscounts';
import { sanitizeProposalSelectionState } from '../utils/proposalSelectionSanitizer';
import MasterPricingEngine from './masterPricingEngine';
import { getDefaultProposal } from '../utils/proposalDefaults';
import { normalizeCustomFeatures, normalizeGroupedCustomFeatureOptions, normalizeGroupedCustomFeatureSubcategories } from '../utils/customFeatures';
import { flattenWaterFeatures } from '../utils/waterFeatureCost';
import { getTileOptions, getTrimTileOptions, getCopingOptions, getDeckingOptions } from '../utils/tileCopingCatalogs';
import { findFiberglassPoolModel, findFiberglassNamedOption } from '../utils/fiberglass';
import { mergeContribution, contributionEqual, contributionInputs, contributionSections, applyContributionDelta, type ContributionConflict,
  type ContributionResolutions } from '../utils/contributionInputs';

function hydrateGroupedFeatures(input: Proposal, pricing: any): Proposal {
  const options = normalizeGroupedCustomFeatureOptions(pricing.customFeatures?.groupedOptions);
  const addons = normalizeGroupedCustomFeatureSubcategories(pricing.customFeatures?.groupedSubcategories);
  return { ...input, customFeatures: normalizeCustomFeatures({ features: (input.customFeatures?.features || []).map(feature => {
    if (feature.source !== 'grouped') return feature;
    const option = options.find(item => feature.groupedOptionId ? item.id === feature.groupedOptionId : item.name === feature.name);
    if (!option) return feature; // Missing selections are surfaced by prepareContribution, never silently substituted.
    const addon = addons.find(item => item.id === feature.groupedAddonOptionId);
    return { ...feature, name: option.name, description: option.description, laborCost: 0, materialCost: 0,
      groupedPricingMode: option.pricingMode, groupedPricePerSqft: option.pricePerSqft || 0,
      groupedAddonUnitPrice: addon?.addonUnitPrice || 0,
      totalCost: option.pricingMode === 'sqft' ? (option.pricePerSqft || 0) * (feature.groupedSqft || 0) : option.totalPrice };
  }) }) };
}

export async function calculateCollaborativeVersion(input: Proposal, baseline?: Proposal) {
  const snapshot = await loadPricingSnapshotForExistingProposal(input.franchiseId, input.pricingModelId,
    input.pricingModelFranchiseId, input.pricingTierId, input.pricingModelRevisionId);
  return withTemporaryPricingSnapshot(snapshot.pricing, () => {
    const normalize = (source: Proposal) => {
      const defaults = getDefaultProposal();
      const complete = { ...defaults, ...source } as Proposal;
      for (const key of ['poolSpecs','excavation','plumbing','electrical','tileCopingDecking','drainage',
        'equipment','waterFeatures','customFeatures','masonry','interiorFinish'] as const) {
        (complete as any)[key] = { ...(defaults as any)[key], ...(source as any)[key] };
      }
      return sanitizeProposalSelectionState(hydrateGroupedFeatures(
        hydrateProposalEquipmentFromRevision(complete, snapshot.pricing), snapshot.pricing));
    };
    const normalized = normalize(input);
    // Catalog hydration/defaults are a calculation view, not permission to rewrite
    // saved inputs. Only normalization differences CAUSED by the contribution
    // (including actual selection dependencies) can enter the reviewed document.
    const persisted = JSON.parse(JSON.stringify(input)) as Proposal;
    if (baseline) {
      const normalizedBaseline = normalize(baseline);
      for (const key of contributionSections) {
        const value = applyContributionDelta((baseline as any)[key],
          (normalizedBaseline as any)[key], (normalized as any)[key]);
        if (value === undefined) delete (persisted as any)[key]; else (persisted as any)[key] = value;
      }
    }
    return { ...persisted, ...MasterPricingEngine.calculateCompleteProposal(normalized),
      papDiscounts: normalizePapDiscounts(snapshot.pricing.papDiscountRates) } as Proposal;
  });
}

export type PreparedContribution = { before: Proposal; after: Proposal; conflicts: ContributionConflict[];
  expectedRevision: number; requestUpdatedAt: string; resolutions: ContributionResolutions };

export async function prepareContribution(request: CollaborationRequest, container: Proposal,
  resolutions: ContributionResolutions = {}): Promise<PreparedContribution> {
  const current = [container, ...(container.versions || [])].find(v => (v.versionId || 'original') === request.target_version_id);
  if (!current) throw new Error('The target version was removed. Your proposed changes are retained in history.');
  const merged = mergeContribution(request.base_version_json, request.working_version_json, current, resolutions);
  const canonicalBefore = await calculateCollaborativeVersion(current);
  // The review must show the persisted owner price, including any historical
  // protection. Showing only a recalculated baseline could hide an unrelated delta.
  const before = JSON.parse(JSON.stringify(current)) as Proposal;
  const conflicts = [...merged.conflicts];
  if (Math.abs(Number(canonicalBefore.totalCost) - Number(current.totalCost)) > 0.01) {
    conflicts.push({ path: 'baseline-pricing', before: current.totalCost, owner: current.totalCost,
      proposed: canonicalBefore.totalCost, message: 'The current calculation differs from the owner’s saved total. Explicitly review this price difference before applying any contribution.' });
  }
  // A changed pin can reprice or remove a selected item. Require explicit owner review
  // of the affected edited section, even if the selected item's name stayed the same.
  if (current.pricingModelRevisionId !== request.base_version_json.pricingModelRevisionId
    || current.pricingModelId !== request.base_version_json.pricingModelId
    || current.pricingTierId !== request.base_version_json.pricingTierId) {
    const baseInputs = contributionInputs(request.base_version_json);
    const workInputs = contributionInputs(request.working_version_json);
    for (const section of Object.keys(workInputs)) {
      if (contributionEqual(baseInputs[section], workInputs[section]) || ['customerInfo','notes','warrantySections'].includes(section)) continue;
      conflicts.push({ path: `pricing:${section}`, before: baseInputs[section], owner: contributionInputs(current)[section],
        proposed: workInputs[section], message: 'Pricing changed since these edits began. Review this section under the owner’s current revision.' });
      if (resolutions[`pricing:${section}`] === 'owner') {
        (merged.proposal as any)[section] = (current as any)[section];
      }
    }
  }
  const snapshot = await loadPricingSnapshotForExistingProposal(current.franchiseId, current.pricingModelId,
    current.pricingModelFranchiseId, current.pricingTierId, current.pricingModelRevisionId);
  const catalogs = snapshot.pricing.equipment as any;
  const equipmentCatalogs: Record<string, any[]> = {
    pump: catalogs?.pumps, additionalPumps: catalogs?.pumps, auxiliaryPump: catalogs?.auxiliaryPumps,
    auxiliaryPumps: catalogs?.auxiliaryPumps, filter: catalogs?.filters, additionalFilters: catalogs?.filters,
    cleaner: catalogs?.cleaners, heater: catalogs?.heaters, additionalHeaters: catalogs?.heaters,
    heaterChiller: catalogs?.heaterChillers, automation: catalogs?.automation, saltSystem: catalogs?.saltSystem,
    additionalSaltSystem: catalogs?.saltSystem, autoFillSystem: catalogs?.autoFillSystem,
    sanitationAccessory: catalogs?.sanitationAccessories, poolLights: catalogs?.lights?.poolLights,
    spaLights: catalogs?.lights?.spaLights,
  };
  const missing = Object.entries(equipmentCatalogs).flatMap(([key, catalog]) => {
    const value = (merged.proposal.equipment as any)?.[key];
    return (Array.isArray(value) ? value : value ? [value] : []).filter(item => item?.name && !/^(none|no\b)/i.test(item.name)
      && !(catalog || []).some(entry => item.id ? entry.id === item.id : entry.name?.trim().toLowerCase() === item.name?.trim().toLowerCase()))
      .map(item => `${key.replace(/([a-z])([A-Z])/g, '$1 $2')}: ${item.name}`);
  });
  if (missing.length) {
    conflicts.push({ path: 'catalog:equipment', before: request.base_version_json.equipment,
      owner: current.equipment, proposed: request.working_version_json.equipment, allowed: ['owner'],
      message: `These equipment selections are unavailable in the current revision: ${missing.join(', ')}. Keep the owner’s equipment or request revised selections; the original proposal is retained.` });
    // Never calculate or persist an unavailable item using old embedded prices.
    merged.proposal.equipment = current.equipment;
  }
  const unavailable = (section: keyof Proposal, labels: string[]) => {
    if (!labels.length) return;
    conflicts.push({ path: `catalog:${section}`, before: request.base_version_json[section], owner: current[section],
      proposed: request.working_version_json[section], allowed: ['owner'],
      message: `These selections are unavailable in the current pricing revision: ${labels.join(', ')}. Keep the owner’s section or request revised selections.` });
    (merged.proposal as any)[section] = current[section];
  };
  const waterCatalog = flattenWaterFeatures(snapshot.pricing.waterFeatures);
  unavailable('waterFeatures', (merged.proposal.waterFeatures?.selections || []).filter(item => item.quantity > 0
    && !waterCatalog.some(option => option.id === item.featureId || option.name === item.featureId)).map(item => item.featureId));
  const groupCatalog = normalizeGroupedCustomFeatureOptions(snapshot.pricing.customFeatures?.groupedOptions);
  const addonCatalog = normalizeGroupedCustomFeatureSubcategories(snapshot.pricing.customFeatures?.groupedSubcategories);
  unavailable('customFeatures', (merged.proposal.customFeatures?.features || []).filter(feature => feature.source === 'grouped'
    && (!groupCatalog.some(option => feature.groupedOptionId ? option.id === feature.groupedOptionId : option.name === feature.name)
      || ((feature.groupedAddonQuantity || 0) > 0 && !addonCatalog.some(option => option.id === feature.groupedAddonOptionId))))
    .map(feature => feature.name));
  const tile = merged.proposal.tileCopingDecking;
  unavailable('tileCopingDecking', [
    [tile?.tileOptionId, getTileOptions(snapshot.pricing.tileCoping)],
    [tile?.trimTileOptionId, getTrimTileOptions(snapshot.pricing.tileCoping)],
    [tile?.copingType, getCopingOptions(snapshot.pricing.tileCoping)],
    [tile?.deckingType, getDeckingOptions(snapshot.pricing.tileCoping)],
  ].filter(([id, catalog]) => id && id !== 'none' && !(catalog as any[]).some(option => option.id === id)).map(([id]) => String(id)));
  const specs = merged.proposal.poolSpecs;
  if (specs.poolType === 'fiberglass') {
    unavailable('poolSpecs', [
      specs.fiberglassModelName && !findFiberglassPoolModel(specs.fiberglassModelName, specs.fiberglassSize, snapshot.pricing) ? specs.fiberglassModelName : '',
      specs.spaFiberglassModelName && !findFiberglassNamedOption('spaOptions', specs.spaFiberglassModelName, snapshot.pricing) ? specs.spaFiberglassModelName : '',
    ].filter(Boolean));
  }
  let after = await calculateCollaborativeVersion(merged.proposal, current);
  // Sanitization must never silently discard an intended input or replace a selection.
  if (!contributionEqual(contributionInputs(merged.proposal), contributionInputs(after))) {
    conflicts.push({ path: 'catalog', before: contributionInputs(merged.proposal), owner: contributionInputs(current),
      proposed: contributionInputs(after), message: 'These edits also change dependent selections. Review all changes before applying them.' });
  }
  if (resolutions.catalog === 'owner') after = before;
  if (resolutions['baseline-pricing'] === 'owner') after = before;
  return { before, after, conflicts, expectedRevision: Number(container.contentRevision),
    requestUpdatedAt: request.updated_at, resolutions };
}
