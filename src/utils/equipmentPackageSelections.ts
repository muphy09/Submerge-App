import type { Equipment } from '../types/proposal-new';

const includedFields: Record<string, string> = {
  pump: 'Pump', filter: 'Filter', cleaner: 'Cleaner', heater: 'Heater', automation: 'Automation',
  saltSystem: 'SaltSystem', autoFillSystem: 'AutoFillSystem', sanitationAccessory: 'SanitationAccessory',
  poolLights: 'PoolLight', spaLights: 'SpaLight',
};

// A fixed package can include a named component without a standalone catalog entry.
// That allowance belongs only to the selected package and its included quantity.
export function isPackageIncludedSelection(equipment: Partial<Equipment> | undefined, field: string,
  item: { name?: string }, pricing: any, index = 0): boolean {
  const key = includedFields[field];
  const option = pricing?.equipment?.packageOptions?.find((entry: any) => entry.id === equipment?.packageSelectionId
    && entry.mode === 'fixed' && entry.enabled !== false);
  if (!key || !option || !item?.name) return false;
  const included = Number(option[`included${key}Quantity`] || 0);
  const quantity = field.endsWith('Lights') ? index + 1 : Number((equipment as any)?.[`${field}Quantity`] ?? 1);
  return quantity > 0 && quantity <= included
    && item.name.trim().toLowerCase() === String(option[`included${key}Name`] || '').trim().toLowerCase();
}
