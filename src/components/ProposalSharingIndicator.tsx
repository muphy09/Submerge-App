import { TooltipAnchor } from './AppTooltip';

export default function ProposalSharingIndicator({ tooltip, recipient = false }: { tooltip: string; recipient?: boolean }) {
  return <TooltipAnchor tooltip={tooltip}>
    <svg className="dashboard-shared-icon" viewBox="0 0 24 24" role="img" aria-label={recipient ? 'Shared with you' : 'Shared with collaborators'}>
      <circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" />
      <path d="M3.5 19v-1.2a5.5 5.5 0 0 1 11 0V19H3.5Zm12.4-5.4a4.6 4.6 0 0 1 4.6 4.6V19h-3.8" />
    </svg>
  </TooltipAnchor>;
}
