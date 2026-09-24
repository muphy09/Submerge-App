import { useEffect, useState } from 'react';
import {
  listOwnershipRecovery, transferDepartedOwner,
  type OwnershipRecoveryCandidate, type RecipientOption,
} from '../services/proposalCollaboration';

export default function ProposalOwnershipRecoveryModal({ franchiseId, onClose }: { franchiseId: string; onClose: () => void }) {
  const [candidates, setCandidates] = useState<OwnershipRecoveryCandidate[]>([]);
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      const result = await listOwnershipRecovery(franchiseId);
      setCandidates(result.candidates);
      setRecipients(result.recipients);
      setError(null);
    } catch (caught) { setError((caught as Error).message); }
  };
  useEffect(() => { void load(); }, [franchiseId]);
  return <div className="modal-overlay" data-scroll-lock="true" onClick={onClose}>
    <div className="modal-content" role="dialog" aria-modal="true" aria-label="Proposal ownership recovery" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header"><h2>Proposal ownership recovery</h2><button className="modal-close" onClick={onClose} aria-label="Close">×</button></div>
      <div className="modal-body-scroll" style={{ display: 'grid', gap: '.8rem' }}>
        <p>Only proposals with an unresolved owner or an inactive or departed owner appear here. Transfer keeps the proposal number, historical designer attribution, and pending contributor requests.</p>
        {error && <p role="alert" className="admin-error">{error}</p>}
        {!candidates.length && !error && <p>No proposals need ownership recovery.</p>}
        {candidates.map((candidate) => <div key={candidate.proposal_number} style={{ borderTop: '1px solid #cbd5e1', paddingTop: '.7rem', display: 'grid', gap: '.4rem' }}>
          <strong>{candidate.customer_name || candidate.proposal_number} · {candidate.proposal_number}</strong>
          <span>{candidate.reason} · Historical designer: {candidate.designer_name || 'Unknown'}</span>
          <label>New owner <select value={selection[candidate.proposal_number] || ''} onChange={(event) => setSelection((current) => ({ ...current, [candidate.proposal_number]: event.target.value }))}>
            <option value="">Select active user</option>
            {recipients.filter((person) => person.user_id !== candidate.owner_id).map((person) =>
              <option key={person.user_id} value={person.user_id}>{person.display_name} ({person.email})</option>)}
          </select></label>
          <button className="admin-primary-btn" disabled={busy || !selection[candidate.proposal_number]} onClick={async () => {
            if (!window.confirm(`Transfer ${candidate.proposal_number} to the selected user?`)) return;
            setBusy(true);
            try { await transferDepartedOwner(candidate.proposal_number, selection[candidate.proposal_number]); await load(); }
            catch (caught) { setError((caught as Error).message); }
            finally { setBusy(false); }
          }}>Transfer ownership</button>
        </div>)}
      </div>
    </div>
  </div>;
}
