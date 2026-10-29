export function validateAddOnCatalogs(pricing: any): string | null {
  for (const category of ['equipment', 'interiorFinish']) {
    const catalog = pricing?.[category]?.addOns;
    if (catalog === undefined) continue;
    if (!Array.isArray(catalog)) return `${category} Add-ons must be a list.`;
    const ids = new Set<string>();
    for (const item of catalog) {
      if (!item || typeof item.id !== 'string' || !item.id.trim() || ids.has(item.id)) {
        return `${category} Add-ons must have unique IDs.`;
      }
      ids.add(item.id);
      if (typeof item.name !== 'string' || !item.name.trim()) return `${category} Add-ons must have a name.`;
      for (const key of ['cost1', 'cost2']) {
        if (typeof item[key] !== 'number' || !Number.isFinite(item[key]) || item[key] < 0) {
          return `${category} add-on "${item.name}" ${key === 'cost1' ? 'Cost 1' : 'Cost 2'} must be a nonnegative number.`;
        }
      }
      if (typeof item.includeByDefault !== 'boolean') return `${category} add-on "${item.name}" must specify Include by Default.`;
    }
  }
  return null;
}
