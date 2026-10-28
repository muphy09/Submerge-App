import type { CollaborationEvent } from '../services/proposalCollaboration';

export function getCollaborationNotifications(events: CollaborationEvent[]) {
  const opened = new Set(events.filter(event => event.read_at && event.event_type === 'shared').map(event => event.proposal_number));
  return {
    newShares: new Set(events.filter(event => !event.read_at && event.event_type === 'shared' && !opened.has(event.proposal_number))
      .map(event => event.proposal_number)),
    reviews: new Set(events.filter(event => !event.read_at && event.event_type === 'changes_submitted').map(event => event.proposal_number)),
  };
}
