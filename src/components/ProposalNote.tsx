import {
  getProposalNoteText,
  type ProposalNoteCategoryKey,
  type ProposalNoteOverrides,
} from '../utils/proposalNotes';

type ProposalNoteProps = {
  categoryKey: ProposalNoteCategoryKey;
  subcategoryId: string;
  overrides?: ProposalNoteOverrides;
  className?: string;
};

function ProposalNote({
  categoryKey,
  subcategoryId,
  overrides,
  className = 'spec-block-subtitle',
}: ProposalNoteProps) {
  const text = getProposalNoteText(overrides, categoryKey, subcategoryId);
  if (!text) return null;

  return <p className={className}>{text}</p>;
}

export default ProposalNote;
