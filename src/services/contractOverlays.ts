import type { Proposal } from '../types/proposal-new';
import type { ContractFieldRender } from './contractGenerator';
import type { ContractPdfTextOverlay } from './contractPdf';

const FIBERGLASS_PAYMENT_SCHEDULE_LABELS: Record<string, string> = {
  p1_pay_excavation: '- At Permitting',
  p1_pay_shotcete: '- At Shell Delivery',
  p1_pay_decking: '- At Equipment Set',
  p1_pay_interior_finish: '- Balance at Decking',
};

export function buildContractTextOverlays(
  fields: ContractFieldRender[],
  proposal: Proposal
): ContractPdfTextOverlay[] {
  if (proposal.poolSpecs?.poolType !== 'fiberglass') return [];

  return fields
    .filter((field) => Object.prototype.hasOwnProperty.call(FIBERGLASS_PAYMENT_SCHEDULE_LABELS, field.id))
    .map((field) => ({
      page: field.page,
      x: field.x + field.width + 2,
      y: field.y - 1,
      width: 170,
      height: Math.max(field.height + 2, 10),
      text: FIBERGLASS_PAYMENT_SCHEDULE_LABELS[field.id],
      fill: 'white',
      fontSize: field.page === 1 ? 7.2 : 7,
      align: 'left',
      paddingLeft: 2,
    }));
}
