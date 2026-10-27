import type { ContractTemplate, ContractTemplateId } from './contractTemplates';

export const WEST_CONSTRUCTION_TIMING_TEXT = [
  'Construction to substantially commence approximately 2-4 weeks after the permit is issued and full HOA approval.',
  'Construction to be substantially complete approximately 8-12 weeks from the dig date.',
] as const;

const DATE_FIELD_IDS = new Set(['p1_8', 'p1_9']);

// The four West PDFs have different page-one layouts. These baselines and font
// sizes match their existing timing lines; every other field stays in place.
const TIMING_LAYOUTS: Record<ContractTemplateId, {
  left: number;
  baselines: [number, number];
  fontSize: number;
}> = {
  'nc-gunite': { left: 53.28, baselines: [579.22, 570.58], fontSize: 6.96 },
  'sc-gunite': { left: 53.28, baselines: [579.22, 570.58], fontSize: 6.96 },
  'nc-fiberglass': { left: 38.76, baselines: [570.22, 561.10], fontSize: 7.44 },
  'sc-fiberglass': { left: 35.76, baselines: [586.06, 576.82], fontSize: 7.56 },
};

export function withWestConstructionTiming(
  template: ContractTemplate,
  layoutId: ContractTemplateId
): ContractTemplate {
  const timingFields = template.fields.filter((field) => field.page === 1 && DATE_FIELD_IDS.has(field.id));
  // A future template that already removed the dates owns its own printed text.
  if (timingFields.length !== 2) return template;

  const layout = TIMING_LAYOUTS[layoutId];
  const top = Math.min(...timingFields.map((field) => field.rect[1])) - 0.5;
  const bottom = Math.max(...timingFields.map((field) => field.rect[3])) + 0.5;
  return {
    ...template,
    fields: template.fields.filter((field) => !DATE_FIELD_IDS.has(field.id)),
    staticPatches: [
      ...template.staticPatches,
      {
        page: 1,
        // PDF patch coordinates use the bottom-left origin. West pages are 612 × 792.
        rect: [layout.left - 0.5, 792 - bottom, 560 - layout.left, bottom - top],
        fill: 'white',
        texts: WEST_CONSTRUCTION_TIMING_TEXT.map((text, index) => ({
          x: layout.left,
          y: layout.baselines[index],
          fontSize: layout.fontSize,
          text,
        })),
      },
    ],
  };
}
