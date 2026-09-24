import type { ReactNode } from 'react';

type IconName =
  | 'summary' | 'versions' | 'file' | 'layers' | 'workflow' | 'upload'
  | 'check' | 'signature' | 'people' | 'owner' | 'review' | 'history'
  | 'share' | 'edit' | 'trash' | 'chevron' | 'arrow' | 'request' | 'submit';

const paths: Record<IconName, ReactNode> = {
  summary: <><rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="10" cy="8" r="1"/><path d="M13 8h3M8 13h8M8 17h8"/></>,
  versions: <><rect x="8" y="7" width="12" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></>,
  file: <><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h4"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
  workflow: <><circle cx="5" cy="5" r="2"/><circle cx="19" cy="19" r="2"/><path d="M7 5h8a3 3 0 0 1 3 3v4M5 7v8a3 3 0 0 0 3 3h4M15 15l3-3 3 3"/></>,
  upload: <><path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M12 16V3m-4 4 4-4 4 4"/></>,
  submit: <><path d="M5 3h8l4 4v8M13 3v5h4M8 12h5M8 16h3M18 21v-8m-3 3 3-3 3 3"/><path d="M5 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/></>,
  check: <><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>,
  signature: <><path d="M4 19h16M5 15l10-10a2 2 0 0 1 3 3L8 18l-4 1 1-4Z"/></>,
  people: <><circle cx="9" cy="7" r="3"/><path d="M3 20v-2a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v2H3ZM17 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v2h-3"/></>,
  owner: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2H4Z"/></>,
  review: <><path d="M5 3h9l4 4v7M14 3v5h4M7 12h6M7 16h4"/><circle cx="17" cy="17" r="3"/><path d="m19 19 3 3"/></>,
  history: <><path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7M12 7v5l3 2"/></>,
  share: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3ZM19 7v8M15 11h8"/></>,
  edit: <><path d="M4 17.5V20h2.5L19 7.5 16.5 5 4 17.5ZM15 6.5l2.5 2.5"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/></>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  request: <><path d="M5 3h9l4 4v7M14 3v5h4M8 12h5M8 16h3"/><circle cx="18" cy="18" r="4"/><path d="M18 16v2m0 2h.01"/></>,
};

export default function ProposalSummaryIcon({ name, size = 24, className }: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
