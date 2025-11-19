import { Proposal } from '../types/proposal';

// Centralized cost calculation with tax removed
export const calculateFinancials = (proposal: Partial<Proposal>) => {
  const subtotal =
    (proposal.poolSpecs?.basePrice || 0) +
    (proposal.excavation?.cost || 0) +
    (proposal.plumbing?.cost || 0) +
    (proposal.tileCopingDecking?.cost || 0) +
    (proposal.drainage?.cost || 0) +
    (proposal.equipment?.totalCost || 0) +
    (proposal.waterFeatures?.totalCost || 0) +
    (proposal.customFeatures?.totalCost || 0) +
    (proposal.masonry?.cost || 0) +
    (proposal.interiorFinish?.cost || 0);

  return {
    subtotal,
    taxRate: 0,
    taxAmount: 0,
    totalCost: subtotal,
  };
};
