import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../components/Toast';
import type { Proposal } from '../types/proposal-new';
import {
  addWorkflowNote,
  approveWorkflowProposal,
  buildVersionDiffSummary,
  completeWorkflowProposal,
  countUnreadWorkflowEvents,
  ensureProposalWorkflow,
  getReviewVersionId,
  getWorkflowStatus,
  hasUnreadWorkflowEvents,
  markWorkflowRead,
  requestWorkflowChanges,
} from '../services/proposalWorkflow';
import { getProposal, listProposals, saveProposal } from '../services/proposalsAdapter';
import type { UserSession } from '../services/session';
import './WorkflowPage.css';

type WorkflowPageProps = {
  session?: UserSession | null;
};

type QueueFilter = 'needs_approval' | 'active' | 'archive';

const normalizeStatusLabel = (value?: string | null) =>
  String(value || 'draft')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatDateTime = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'N/A' : date.toLocaleString();
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const formatSignedCurrency = (value: number) => {
  const absolute = formatCurrency(Math.abs(value));
  if (!Number.isFinite(value) || value === 0) return absolute;
  return value > 0 ? `+${absolute}` : `-${absolute}`;
};

const formatSignedPercent = (value: number) => {
  if (!Number.isFinite(value) || value === 0) return '0.00%';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
};

function WorkflowPage({ session }: WorkflowPageProps) {
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const { showToast } = useToast();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<QueueFilter>('needs_approval');
  const [noteDraft, setNoteDraft] = useState('');
  const [savingAction, setSavingAction] = useState<string | null>(null);

  const effectiveRole = String(session?.role || '').trim().toLowerCase();
  const canAccess =
    effectiveRole === 'owner' ||
    effectiveRole === 'admin' ||
    effectiveRole === 'bookkeeper' ||
    effectiveRole === 'master';

  const loadWorkspace = async (preferredProposalNumber?: string | null) => {
    if (!canAccess) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = (await listProposals(session?.franchiseId)).map((entry) => ensureProposalWorkflow(entry));
      setProposals(rows);

      const preferred = preferredProposalNumber || proposalNumber;
      if (preferred) {
        const selected = rows.find((entry) => entry.proposalNumber === preferred);
        if (selected) {
          await loadSelectedProposal(selected.proposalNumber, rows);
          return;
        }
      }

      const activeRows = rows.filter((entry) => getWorkflowStatus(entry) !== 'draft');
      if (activeRows[0]) {
        await loadSelectedProposal(activeRows[0].proposalNumber, rows);
      } else {
        setSelectedProposal(null);
      }
    } catch (error) {
      console.error('Failed to load workflow workspace', error);
      showToast({ type: 'error', message: 'Unable to load the workflow workspace.' });
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedProposal = async (targetProposalNumber: string, sourceRows?: Proposal[]) => {
    try {
      const loaded = await getProposal(targetProposalNumber);
      if (!loaded) {
        setSelectedProposal(null);
        return;
      }
      const normalized = ensureProposalWorkflow(loaded);
      const readUpdated = markWorkflowRead(normalized, session?.userId);
      const didUpdateReadState =
        JSON.stringify(readUpdated.workflow?.history || []) !== JSON.stringify(normalized.workflow?.history || []);
      const persisted = didUpdateReadState ? await saveProposal(readUpdated) : readUpdated;
      const finalProposal = ensureProposalWorkflow(persisted as Proposal);
      setSelectedProposal(finalProposal);

      setProposals((current) => {
        const base = sourceRows || current;
        return base.map((entry) =>
          entry.proposalNumber === finalProposal.proposalNumber ? finalProposal : entry
        );
      });
    } catch (error) {
      console.error('Failed to load selected workflow proposal', error);
      showToast({ type: 'error', message: 'Unable to load the selected proposal.' });
    }
  };

  useEffect(() => {
    void loadWorkspace();
  }, [canAccess, proposalNumber, session?.franchiseId]);

  useEffect(() => {
    const handleOnline = () => {
      void loadWorkspace(selectedProposal?.proposalNumber || proposalNumber);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [proposalNumber, selectedProposal?.proposalNumber]);

  const counts = useMemo(() => {
    const needsApproval = proposals.filter((entry) => getWorkflowStatus(entry) === 'needs_approval').length;
    const active = proposals.filter((entry) => {
      const status = getWorkflowStatus(entry);
      return status === 'submitted' || status === 'needs_approval';
    }).length;
    const archive = proposals.filter((entry) => getWorkflowStatus(entry) === 'completed').length;
    return { needsApproval, active, archive };
  }, [proposals]);

  const filteredProposals = useMemo(() => {
    return proposals
      .filter((entry) => {
        const status = getWorkflowStatus(entry);
        if (selectedFilter === 'needs_approval') return status === 'needs_approval';
        if (selectedFilter === 'archive') return status === 'completed';
        return status === 'submitted' || status === 'needs_approval';
      })
      .sort((a, b) => {
        const aTs = new Date(a.workflow?.submittedAt || a.lastModified || a.createdDate || 0).getTime();
        const bTs = new Date(b.workflow?.submittedAt || b.lastModified || b.createdDate || 0).getTime();
        return bTs - aTs;
      });
  }, [proposals, selectedFilter]);

  const selectedDiff = useMemo(
    () => (selectedProposal ? buildVersionDiffSummary(selectedProposal) : null),
    [selectedProposal]
  );
  const selectedReviewVersionId = selectedProposal ? getReviewVersionId(selectedProposal) : null;
  const selectedUnreadCount = selectedProposal ? countUnreadWorkflowEvents(selectedProposal, session?.userId) : 0;
  const selectedWorkflowReasons = (selectedProposal?.workflow?.approvalReasons || []).map((reason) =>
    reason.code === 'manual_review'
      ? {
          ...reason,
          detail: undefined,
        }
      : reason
  );

  const persistSelectedProposal = async (nextProposal: Proposal, successMessage: string) => {
    setSavingAction(successMessage);
    try {
      const saved = ensureProposalWorkflow((await saveProposal(nextProposal)) as Proposal);
      setSelectedProposal(saved);
      setProposals((current) =>
        current.map((entry) => (entry.proposalNumber === saved.proposalNumber ? saved : entry))
      );
      setNoteDraft('');
      showToast({ type: 'success', message: successMessage });
    } catch (error) {
      console.error('Failed to save workflow action', error);
      showToast({ type: 'error', message: 'Unable to save the workflow action.' });
    } finally {
      setSavingAction(null);
    }
  };

  const handleAddNote = async () => {
    if (!selectedProposal || !noteDraft.trim()) return;
    await persistSelectedProposal(addWorkflowNote(selectedProposal, noteDraft, session), 'Workflow note saved.');
  };

  const handleApprove = async () => {
    if (!selectedProposal) return;
    await persistSelectedProposal(
      approveWorkflowProposal(selectedProposal, noteDraft.trim() || undefined, session),
      'Proposal approved.'
    );
  };

  const handleRequestChanges = async () => {
    if (!selectedProposal || !noteDraft.trim()) {
      showToast({ type: 'error', message: 'Changes requested requires a note.' });
      return;
    }
    await persistSelectedProposal(
      requestWorkflowChanges(selectedProposal, noteDraft.trim(), session),
      'Proposal returned with requested changes.'
    );
  };

  const handleComplete = async () => {
    if (!selectedProposal) return;
    await persistSelectedProposal(
      completeWorkflowProposal(selectedProposal, noteDraft.trim() || undefined, session),
      'Proposal marked as completed.'
    );
  };

  if (!canAccess) {
    return (
      <div className="workflow-page">
        <div className="workflow-locked-card">
          <h2>Workflow access required</h2>
          <p>Switch to an owner, admin, or book keeper account to review submitted proposals.</p>
          <button type="button" className="workflow-primary-btn" onClick={() => navigate('/')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="workflow-page">
      <div className="workflow-header">
        <div>
          <p className="workflow-kicker">Review Workspace</p>
          <h1>Submitted Proposal Workflow</h1>
        </div>
        <div className="workflow-header-actions">
          <button
            type="button"
            className={`workflow-filter-pill${selectedFilter === 'needs_approval' ? ' is-active' : ''}`}
            onClick={() => setSelectedFilter('needs_approval')}
          >
            Needs Approval ({counts.needsApproval})
          </button>
          <button
            type="button"
            className={`workflow-filter-pill${selectedFilter === 'active' ? ' is-active' : ''}`}
            onClick={() => setSelectedFilter('active')}
          >
            Active ({counts.active})
          </button>
          <button
            type="button"
            className={`workflow-filter-pill${selectedFilter === 'archive' ? ' is-active' : ''}`}
            onClick={() => setSelectedFilter('archive')}
          >
            Archive ({counts.archive})
          </button>
        </div>
      </div>

      <div className="workflow-layout">
        <aside className="workflow-queue">
          <div className="workflow-queue-header">
            <div className="workflow-queue-title">
              {selectedFilter === 'needs_approval'
                ? 'Approval Queue'
                : selectedFilter === 'archive'
                ? 'Completed Proposals'
                : 'Submitted Proposals'}
            </div>
            <div className="workflow-queue-meta">{filteredProposals.length} shown</div>
          </div>
          {loading ? (
            <div className="workflow-empty">Loading workflow queue...</div>
          ) : filteredProposals.length === 0 ? (
            <div className="workflow-empty">No proposals match this view.</div>
          ) : (
            <div className="workflow-queue-list">
              {filteredProposals.map((entry) => {
                const diff = buildVersionDiffSummary(entry);
                const unread = hasUnreadWorkflowEvents(entry, session?.userId);
                const status = getWorkflowStatus(entry);
                return (
                  <button
                    key={entry.proposalNumber}
                    type="button"
                    className={`workflow-queue-item${
                      selectedProposal?.proposalNumber === entry.proposalNumber ? ' is-selected' : ''
                    }`}
                    onClick={() => {
                      navigate(`/workflow/${entry.proposalNumber}`);
                      void loadSelectedProposal(entry.proposalNumber);
                    }}
                  >
                    <div className="workflow-queue-item-header">
                      <div>
                        <div className="workflow-queue-customer">{entry.customerInfo?.customerName || 'Proposal'}</div>
                        <div className="workflow-queue-designer">{entry.designerName || 'Designer'}</div>
                      </div>
                      <div className={`workflow-status-pill is-${status}`}>
                        {normalizeStatusLabel(status)}
                        {entry.workflow?.approved ? ' *' : ''}
                      </div>
                    </div>
                    <div className="workflow-queue-item-meta">
                      <span>{entry.versionName || 'Current Version'}</span>
                      <span>{formatDateTime(entry.workflow?.submittedAt || entry.lastModified)}</span>
                      {unread && <span className="workflow-unread-pill">{countUnreadWorkflowEvents(entry, session?.userId)} New</span>}
                    </div>
                    {diff && (
                      <div className="workflow-queue-diff">
                        <span>{diff.reviewVersionName}</span>
                        {diff.compareVersionName ? <span>vs {diff.compareVersionName}</span> : <span>First submission</span>}
                        <span>{formatSignedCurrency(diff.retailDelta)} retail</span>
                        <span>{formatSignedPercent(diff.grossMarginDelta)} GP</span>
                      </div>
                    )}
                    {diff?.changedSections?.length ? (
                      <div className="workflow-queue-sections">
                        {diff.changedSections.slice(0, 4).map((section) => (
                          <span key={section} className="workflow-section-chip">
                            {section}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        <section className="workflow-detail">
          {!selectedProposal ? (
            <div className="workflow-empty workflow-empty-detail">Select a proposal to review its workflow.</div>
          ) : (
            <>
              <div className="workflow-detail-header">
                <div>
                  <p className="workflow-kicker">Proposal Review</p>
                  <h2>{selectedProposal.customerInfo?.customerName || selectedProposal.proposalNumber}</h2>
                </div>
                <div className={`workflow-status-pill is-${getWorkflowStatus(selectedProposal)}`}>
                  {normalizeStatusLabel(getWorkflowStatus(selectedProposal))}
                  {selectedProposal.workflow?.approved ? ' *' : ''}
                </div>
              </div>

              <div className="workflow-detail-grid">
                <div className="workflow-detail-card">
                  <div className="workflow-detail-label">Designer</div>
                  <div className="workflow-detail-value">{selectedProposal.designerName || 'Designer'}</div>
                </div>
                <div className="workflow-detail-card">
                  <div className="workflow-detail-label">Submitted</div>
                  <div className="workflow-detail-value">
                    {formatDateTime(selectedProposal.workflow?.submittedAt || selectedProposal.lastModified)}
                  </div>
                </div>
                <div className="workflow-detail-card">
                  <div className="workflow-detail-label">Unread Activity</div>
                  <div className="workflow-detail-value">{selectedUnreadCount}</div>
                </div>
                <div className="workflow-detail-card">
                  <div className="workflow-detail-label">Review Version</div>
                  <div className="workflow-detail-value">{selectedDiff?.reviewVersionName || selectedProposal.versionName || 'Current Version'}</div>
                </div>
              </div>

              {selectedWorkflowReasons.length > 0 && (
                <div className="workflow-reasons">
                  {selectedWorkflowReasons.map((reason) => (
                    <div key={`${reason.code}-${reason.label}`} className="workflow-reason-row">
                      <strong>{reason.label}</strong>
                      {reason.detail ? ` - ${reason.detail}` : ''}
                    </div>
                  ))}
                </div>
              )}

              {selectedDiff && (
                <div className="workflow-compare-card">
                  <div className="workflow-compare-header">
                    <div>
                      <div className="workflow-detail-label">Version Comparison</div>
                      <div className="workflow-detail-value">
                        {selectedDiff.reviewVersionName}
                        {selectedDiff.compareVersionName ? ` vs ${selectedDiff.compareVersionName}` : ''}
                      </div>
                    </div>
                    <div className="workflow-compare-actions">
                      <button
                        type="button"
                        className="workflow-secondary-btn"
                        onClick={() =>
                          navigate(`/proposal/view/${selectedProposal.proposalNumber}`, {
                            state: { versionId: selectedReviewVersionId },
                          })
                        }
                      >
                        Open Review Version
                      </button>
                      {selectedDiff.compareVersionId && (
                        <button
                          type="button"
                          className="workflow-secondary-btn"
                          onClick={() =>
                            navigate(`/proposal/view/${selectedProposal.proposalNumber}`, {
                              state: { versionId: selectedDiff.compareVersionId },
                            })
                          }
                        >
                          Open Prior Version
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="workflow-metric-grid">
                    <div className="workflow-metric">
                      <span>Retail Delta</span>
                      <strong>{formatSignedCurrency(selectedDiff.retailDelta)}</strong>
                    </div>
                    <div className="workflow-metric">
                      <span>COGS Delta</span>
                      <strong>{formatSignedCurrency(selectedDiff.costDelta)}</strong>
                    </div>
                    <div className="workflow-metric">
                      <span>Gross Profit Delta</span>
                      <strong>{formatSignedCurrency(selectedDiff.grossProfitDelta)}</strong>
                    </div>
                    <div className="workflow-metric">
                      <span>GP % Delta</span>
                      <strong>{formatSignedPercent(selectedDiff.grossMarginDelta)}</strong>
                    </div>
                    <div className="workflow-metric">
                      <span>Discount Delta</span>
                      <strong>{formatSignedCurrency(selectedDiff.discountDelta)}</strong>
                    </div>
                    <div className="workflow-metric">
                      <span>Contract Override Delta</span>
                      <strong>{selectedDiff.contractOverrideDelta}</strong>
                    </div>
                  </div>

                  {selectedDiff.changedSections.length > 0 && (
                    <div className="workflow-changed-sections">
                      {selectedDiff.changedSections.map((section) => (
                        <span key={section} className="workflow-section-chip">
                          {section}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="workflow-action-card">
                <div className="workflow-action-header">
                  <div>
                    <div className="workflow-detail-label">Reviewer Actions</div>
                    <div className="workflow-detail-value">Add a note, approve, return, or complete</div>
                  </div>
                </div>
                <textarea
                  className="workflow-note-input"
                  value={noteDraft}
                  onChange={(event) => setNoteDraft(event.target.value)}
                  placeholder="Add a workflow note"
                />
                <div className="workflow-action-buttons">
                  <button
                    type="button"
                    className="workflow-secondary-btn"
                    disabled={!noteDraft.trim() || Boolean(savingAction)}
                    onClick={() => {
                      void handleAddNote();
                    }}
                  >
                    Add Note
                  </button>
                  {getWorkflowStatus(selectedProposal) === 'needs_approval' && (
                    <button
                      type="button"
                      className="workflow-primary-btn"
                      disabled={Boolean(savingAction)}
                      onClick={() => {
                        void handleApprove();
                      }}
                    >
                      Approve
                    </button>
                  )}
                  {getWorkflowStatus(selectedProposal) !== 'completed' && (
                    <button
                      type="button"
                      className="workflow-danger-btn"
                      disabled={Boolean(savingAction)}
                      onClick={() => {
                        void handleRequestChanges();
                      }}
                    >
                      Request Changes
                    </button>
                  )}
                  {getWorkflowStatus(selectedProposal) === 'submitted' && (
                    <button
                      type="button"
                      className="workflow-primary-btn"
                      disabled={Boolean(savingAction)}
                      onClick={() => {
                        void handleComplete();
                      }}
                    >
                      Mark Completed
                    </button>
                  )}
                </div>
              </div>

              <div className="workflow-history-card">
                <div className="workflow-detail-label">Workflow History</div>
                {(selectedProposal.workflow?.history || [])
                  .slice()
                  .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                  .map((entry) => (
                    <div key={entry.id} className="workflow-history-row">
                      <div className="workflow-history-meta">
                        <span>{normalizeStatusLabel(entry.type)}</span>
                        <span>{formatDateTime(entry.createdAt)}</span>
                        <span>{entry.actor?.name || entry.actor?.email || 'User'}</span>
                      </div>
                      {entry.message && <div className="workflow-history-message">{entry.message}</div>}
                    </div>
                  ))}
              </div>

              <div className="workflow-drilldown-actions">
                <button
                  type="button"
                  className="workflow-secondary-btn"
                  onClick={() => navigate(`/proposal/view/${selectedProposal.proposalNumber}`)}
                >
                  Open Proposal Summary
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default WorkflowPage;
