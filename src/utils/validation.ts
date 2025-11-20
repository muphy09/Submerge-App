import { Proposal } from '../types/proposal-new';

export interface ValidationError {
  field: string;
  message: string;
}

export function validateProposal(proposal: Partial<Proposal>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Customer info
  if (!proposal.customerInfo?.customerName) {
    errors.push({ field: 'customerName', message: 'Customer name is required' });
  }

  // Pool specs
  if (!proposal.poolSpecs?.poolType) {
    errors.push({ field: 'poolType', message: 'Pool type is required' });
  }

  if (proposal.poolSpecs?.poolType === 'gunite') {
    if (!proposal.poolSpecs.surfaceArea || proposal.poolSpecs.surfaceArea <= 0) {
      errors.push({ field: 'surfaceArea', message: 'Surface area is required for gunite pools' });
    }
  }

  // Spa validation
  const hasSpa = proposal.poolSpecs?.spaType !== 'none';
  if (hasSpa) {
    // Check heater capability
    const heaterName = proposal.equipment?.heater?.name || '';
    if (heaterName.includes('260K')) {
      errors.push({
        field: 'heater',
        message: '260K BTU heater cannot be used to heat a spa',
      });
    }

    // Check for spa plumbing if gunite spa
    if (proposal.poolSpecs?.spaType === 'gunite' && proposal.plumbing?.runs.spaRun === 0) {
      errors.push({
        field: 'spaRun',
        message: 'Spa plumbing run is required when spa is present',
      });
    }
  }

  // Raised spa validation
  if (proposal.poolSpecs?.isRaisedSpa && proposal.poolSpecs.raisedSpaFacing === 'none') {
    errors.push({
      field: 'raisedSpaFacing',
      message: 'Raised spa requires facing selection',
    });
  }

  return errors;
}
