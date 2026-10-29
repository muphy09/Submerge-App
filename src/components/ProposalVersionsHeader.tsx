import { TooltipAnchor } from './AppTooltip';
import type { ReactNode } from 'react';
import ProposalSummaryIcon from './ProposalSummaryIcon';
import './ProposalVersionsHeader.css';

type Props = {
  count: number;
  canCompare: boolean;
  onCompare: () => void;
  buildAction?: ReactNode;
};

export default function ProposalVersionsHeader({ count, canCompare, onCompare, buildAction }: Props) {
  return <div className="proposal-side-card-header proposal-versions-header">
    <div className="summary-card-title">
      <span className="summary-card-icon"><ProposalSummaryIcon name="versions" size={28} /></span>
      <span className="proposal-nav-heading-copy">
        <h2>Versions &amp; Addendums</h2>
        <span className="version-count-pill">{count} Available</span>
      </span>
    </div>
    <div className={`proposal-versions-actions${buildAction ? '' : ' is-compare-only'}`}>
      <TooltipAnchor tooltip="Compare saved versions" className="proposal-nav-compare-action">
        <button type="button" className="action-button" disabled={!canCompare} onClick={onCompare}>Compare</button>
      </TooltipAnchor>
      {buildAction}
    </div>
  </div>;
}
