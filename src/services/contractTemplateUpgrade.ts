import { Proposal } from '../types/proposal-new';

export const CURRENT_CONTRACT_TEMPLATE_REVISION = '2026-04-21-blowers-and-2026-contracts-v1';

function isPlaceholderPumpName(name?: string | null): boolean {
  const normalized = String(name || '').trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes('no pump') ||
    normalized.includes('no aux') ||
    normalized.includes('no auxiliary') ||
    normalized.includes('no blower')
  );
}

function clonePumpSelection(source?: Proposal['equipment']['pump']) {
  if (!source || isPlaceholderPumpName(source.name)) return null;
  return {
    name: source.name,
    model: source.model,
    price: source.price,
    basePrice: source.basePrice,
    addCost1: source.addCost1,
    addCost2: source.addCost2,
  };
}

function migrateEquipmentForCurrentRevision(equipment: Proposal['equipment']): Proposal['equipment'] {

  const currentAdditionalPumps = Array.isArray(equipment.additionalPumps)
    ? equipment.additionalPumps.filter((pump) => pump && !isPlaceholderPumpName(pump.name))
    : [];
  const auxiliarySelections =
    Array.isArray(equipment.auxiliaryPumps) && equipment.auxiliaryPumps.length > 0
      ? equipment.auxiliaryPumps.filter((pump) => pump && !isPlaceholderPumpName(pump.name))
      : equipment.auxiliaryPump && !isPlaceholderPumpName(equipment.auxiliaryPump.name)
        ? [equipment.auxiliaryPump]
        : [];

  const blowerSelections = auxiliarySelections.filter((pump) => pump?.autoAddedReason !== 'waterFeature');
  const legacyWaterFeatureSelections = auxiliarySelections.filter((pump) => pump?.autoAddedReason === 'waterFeature');
  const additionalPumpSeed = clonePumpSelection(equipment.pump) || currentAdditionalPumps.find((pump) => !isPlaceholderPumpName(pump?.name));
  const migratedWaterFeaturePumps = legacyWaterFeatureSelections.flatMap(() => {
    if (!additionalPumpSeed) return [];
    return [
      {
        ...additionalPumpSeed,
        autoAddedForSpa: false,
        autoAddedReason: 'waterFeature' as const,
      },
    ];
  });
  const nextAdditionalPumps = [...currentAdditionalPumps, ...migratedWaterFeaturePumps];
  const nextBlowerSelections = blowerSelections.length > 0 ? [blowerSelections[0]] : [];

  const additionalChanged =
    nextAdditionalPumps.length !== currentAdditionalPumps.length ||
    nextAdditionalPumps.some((pump, index) => pump !== currentAdditionalPumps[index]);
  const blowerChanged =
    nextBlowerSelections.length !== auxiliarySelections.length ||
    nextBlowerSelections.some((pump, index) => pump !== auxiliarySelections[index]);

  if (!additionalChanged && !blowerChanged) {
    return equipment;
  }

  return {
    ...equipment,
    additionalPumps: nextAdditionalPumps,
    auxiliaryPumps: nextBlowerSelections,
    auxiliaryPump: nextBlowerSelections[0],
  };
}

export function upgradeProposalContractTemplateRevision(proposal: Proposal): Proposal {
  const revisionAlreadyCurrent = proposal.contractTemplateRevision === CURRENT_CONTRACT_TEMPLATE_REVISION;
  const nextOverrides = proposal.contractOverrides;
  const nextEquipment = migrateEquipmentForCurrentRevision(proposal.equipment);
  const nextVersions = (proposal.versions || []).map((version) => upgradeProposalContractTemplateRevision(version));
  const versionsChanged = nextVersions.some((version, index) => version !== (proposal.versions || [])[index]);
  const overridesChanged = nextOverrides !== proposal.contractOverrides;
  const equipmentChanged = nextEquipment !== proposal.equipment;

  if (revisionAlreadyCurrent && !versionsChanged && !overridesChanged && !equipmentChanged) {
    return proposal;
  }

  return {
    ...proposal,
    contractTemplateRevision: CURRENT_CONTRACT_TEMPLATE_REVISION,
    equipment: nextEquipment,
    ...(proposal.contractOverrides !== undefined || overridesChanged ? { contractOverrides: nextOverrides } : {}),
    ...(proposal.versions ? { versions: nextVersions } : {}),
  };
}
