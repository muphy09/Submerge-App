import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import type { Proposal } from '../types/proposal-new';
import {
  approveWorkflowProposal,
  buildVersionDiffSummary,
  completeWorkflowProposal,
  countUnreadWorkflowEvents,
  ensureProposalWorkflow,
  getApprovedVersion,
  getApprovedVersionId,
  getPendingReviewVersion,
  getPendingReviewVersionId,
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

type QueueFilter = 'needs_approval' | 'approved' | 'archive';

const normalizeStatusLabel = (value?: string | null) =>
  (() => {
    const normalized = String(value || 'draft').trim().toLowerCase();
    if (normalized === 'changes_requested') return 'Returned';
    return normalized.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  })();

const matchesQueueFilter = (proposal: Proposal, filter: QueueFilter) => {
  const status = getWorkflowStatus(proposal);
  if (filter === 'needs_approval') return status === 'needs_approval';
  if (filter === 'archive') return status === 'completed';
  return status === 'approved' || status === 'submitted';
};

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

const formatPercent = (value: number) => `${(Number.isFinite(value) ? value : 0).toFixed(2)}%`;

const getNonPapDiscountTotal = (proposal?: Partial<Proposal> | null) => {
  const retailAdjustments = Array.isArray(proposal?.retailAdjustments) ? proposal.retailAdjustments : [];
  const retailDiscountTotal = retailAdjustments.reduce((sum, adjustment) => {
    const amount = Number(adjustment?.amount);
    return Number.isFinite(amount) && amount < 0 ? sum + Math.abs(amount) : sum;
  }, 0);
  const manualAdjustments = proposal?.manualAdjustments || ({} as Proposal['manualAdjustments']);
  const negative1 = Number((manualAdjustments as any).negative1);
  const negative2 = Number((manualAdjustments as any).negative2);
  const manualDiscountTotal =
    Math.abs(Math.min(0, Number.isFinite(negative1) ? negative1 : 0)) +
    Math.abs(Math.min(0, Number.isFinite(negative2) ? negative2 : 0));
  return retailDiscountTotal + manualDiscountTotal;
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
  const [showNoteComposer, setShowNoteComposer] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [savingAction, setSavingAction] = useState<string | null>(null);
  const [expandedCostCategories, setExpandedCostCategories] = useState<string[]>([]);

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

      setSelectedProposal(null);
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

  useEffect(() => {
    setNoteDraft('');
    setShowNoteComposer(false);
    setShowCompleteConfirm(false);
  }, [selectedProposal?.proposalNumber]);

  useEffect(() => {
    setExpandedCostCategories([]);
  }, [
    selectedProposal?.proposalNumber,
    selectedProposal?.workflow?.submittedVersionId,
    selectedProposal?.workflow?.approvedVersionId,
  ]);

  const counts = useMemo(() => {
    const needsApproval = proposals.filter((entry) => getWorkflowStatus(entry) === 'needs_approval').length;
    const approved = proposals.filter((entry) => matchesQueueFilter(entry, 'approved')).length;
    const archive = proposals.filter((entry) => getWorkflowStatus(entry) === 'completed').length;
    return { needsApproval, approved, archive };
  }, [proposals]);

  const filteredProposals = useMemo(() => {
    return proposals
      .filter((entry) => matchesQueueFilter(entry, selectedFilter))
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
  const selectedReviewVersionId = selectedProposal ? getPendingReviewVersionId(selectedProposal) || getReviewVersionId(selectedProposal) : null;
  const selectedApprovedVersionId = selectedProposal ? getApprovedVersionId(selectedProposal) : null;
  const selectedReviewVersion = selectedProposal ? getPendingReviewVersion(selectedProposal) : null;
  const selectedApprovedVersion = selectedProposal ? getApprovedVersion(selectedProposal) : null;
  const selectedDisplayVersion = selectedReviewVersion || selectedApprovedVersion || selectedProposal;
  const selectedWorkflowReasons = (selectedProposal?.workflow?.approvalReasons || []).filter(
    (reason) => reason.code !== 'manual_review'
  );
  const selectedHasResubmission =
    (selectedProposal?.workflow?.history || []).filter((entry) => entry.type === 'submitted').length > 1;
  const selectedRetailTotal = Number(selectedDisplayVersion?.pricing?.retailPrice || selectedDisplayVersion?.totalCost || 0);
  const selectedTotalCogs = Number(selectedDisplayVersion?.pricing?.totalCOGS || 0);
  const selectedGrossProfitPercent = Number(selectedDisplayVersion?.pricing?.grossProfitMargin || 0);
  const selectedDiscountAmount = getNonPapDiscountTotal(selectedDisplayVersion);
  const selectedWorkflowPath = selectedProposal ? `/workflow/${selectedProposal.proposalNumber}` : '/workflow';
  const emptyDetailMessage =
    selectedFilter === 'needs_approval' && filteredProposals.length > 0
      ? 'Select a Proposal that is Awaiting Approval on the left'
      : 'Select a proposal to review its workflow.';

  const persistSelectedProposal = async (nextProposal: Proposal, successMessage: string) => {
    setSavingAction(successMessage);
    try {
      const saved = ensureProposalWorkflow((await saveProposal(nextProposal)) as Proposal);
      const nextRows = proposals.map((entry) =>
        entry.proposalNumber === saved.proposalNumber ? saved : entry
      );
      const nextSelected =
        matchesQueueFilter(saved, selectedFilter)
          ? saved
          : nextRows.find((entry) => entry.proposalNumber !== saved.proposalNumber && matchesQueueFilter(entry, selectedFilter)) ||
            null;

      setSelectedProposal(nextSelected);
      setProposals(nextRows);
      setNoteDraft('');
      setShowNoteComposer(false);
      if (nextSelected) {
        navigate(`/workflow/${nextSelected.proposalNumber}`, { replace: true });
      } else {
        navigate('/workflow', { replace: true });
      }
      showToast({ type: 'success', message: successMessage });
    } catch (error) {
      console.error('Failed to save workflow action', error);
      showToast({ type: 'error', message: 'Unable to save the workflow action.' });
    } finally {
      setSavingAction(null);
    }
  };

  const handleApprove = async () => {
    if (!selectedProposal) return;
    await persistSelectedProposal(approveWorkflowProposal(selectedProposal, undefined, session), 'Proposal approved.');
  };

  const handleRequestChanges = async () => {
    if (!selectedProposal || !noteDraft.trim()) {
      setShowNoteComposer(true);
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

  const toggleCostCategory = (categoryKey: string) => {
    setExpandedCostCategories((current) =>
      current.includes(categoryKey)
        ? current.filter((entry) => entry !== categoryKey)
        : [...current, categoryKey]
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
            className={`workflow-filter-pill${selectedFilter === 'approved' ? ' is-active' : ''}`}
            onClick={() => setSelectedFilter('approved')}
          >
            Approved ({counts.approved})
          </button>
          <button
            type="button"
            className={`workflow-filter-pill${selectedFilter === 'archive' ? ' is-active' : ''}`}
            onClick={() => setSelectedFilter('archive')}
          >
            Archived ({counts.archive})
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
                ? 'Archived Proposals'
                : 'Approved Proposals'}
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
                      </div>
                    </div>
                    <div className="workflow-queue-item-meta">
                      <span>{formatDateTime(entry.workflow?.submittedAt || entry.lastModified)}</span>
                      {unread && <span className="workflow-unread-pill">{countUnreadWorkflowEvents(entry, session?.userId)} New</span>}
                    </div>
                    {diff && (
                      <div className="workflow-queue-diff">
                        <span>Addendum Review</span>
                        {diff.compareVersionName ? <span>{diff.compareVersionName} vs {diff.reviewVersionName}</span> : null}
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
            <div className="workflow-empty workflow-empty-detail">{emptyDetailMessage}</div>
          ) : (
            <>
              <div className="workflow-detail-header">
                <div>
                  <p className="workflow-kicker">Proposal Review</p>
                  <h2>{selectedProposal.customerInfo?.customerName || selectedProposal.proposalNumber}</h2>
                </div>
                <div className={`workflow-status-pill is-${getWorkflowStatus(selectedProposal)}`}>
                  {normalizeStatusLabel(getWorkflowStatus(selectedProposal))}
                </div>
              </div>

              <div className="workflow-detail-grid">
                <div className="workflow-detail-card">
                  <div className="workflow-detail-label">Designer</div>
                  <div className="workflow-detail-value">{selectedProposal.designerName || 'Designer'}</div>
                </div>
                <div className="workflow-detail-card">
                  <div className="workflow-detail-label">{selectedHasResubmission ? 'Resubmitted' : 'Submitted'}</div>
                  <div className="workflow-detail-value">
                    {formatDateTime(selectedProposal.workflow?.submittedAt || selectedProposal.lastModified)}
                  </div>
                </div>
                <div className="workflow-detail-card">
                  <div className="workflow-detail-label">Discount Amount</div>
                  <div className="workflow-detail-value">{formatCurrency(selectedDiscountAmount)}</div>
                </div>
                <div className="workflow-detail-card">
                  <div className="workflow-detail-label">Gross Profit %</div>
                  <div className="workflow-detail-value">{formatPercent(selectedGrossProfitPercent)}</div>
                </div>
                <div className="workflow-detail-card">
                  <div className="workflow-detail-label">Total COGS</div>
                  <div className="workflow-detail-value">{formatCurrency(selectedTotalCogs)}</div>
                </div>
                <div className="workflow-detail-card">
                  <div className="workflow-detail-label">Total Retail</div>
                  <div className="workflow-detail-value">{formatCurrency(selectedRetailTotal)}</div>
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
                      <div className="workflow-detail-label">Approved Proposal vs Proposal Addendum</div>
                      <div className="workflow-detail-value">
                        {selectedDiff.compareVersionName} vs {selectedDiff.reviewVersionName}
                      </div>
                    </div>
                    <div className="workflow-compare-actions">
                      <button
                        type="button"
                        className="workflow-secondary-btn"
                        onClick={() =>
                          navigate(`/proposal/view/${selectedProposal.proposalNumber}`, {
                            state: {
                              versionId: selectedReviewVersionId,
                              reviewerReturnTo: 'workflow',
                              reviewerReturnPath: selectedWorkflowPath,
                            },
                          })
                        }
                      >
                        Open Addendum
                      </button>
                      {selectedApprovedVersionId && (
                        <button
                          type="button"
                          className="workflow-secondary-btn"
                          onClick={() =>
                            navigate(`/proposal/view/${selectedProposal.proposalNumber}`, {
                              state: {
                                versionId: selectedApprovedVersionId,
                                reviewerReturnTo: 'workflow',
                                reviewerReturnPath: selectedWorkflowPath,
                              },
                            })
                          }
                        >
                          Open Approved Proposal
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="workflow-diff-intro">
                    <div className="workflow-diff-intro-title">
                      {`${selectedDiff.compareVersionName} -> ${selectedDiff.reviewVersionName} Differences`}
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

                  <div className="workflow-diff-categories">
                    {selectedDiff.categories.map((category) => (
                      <div key={category.key} className="workflow-diff-category">
                        <div className="workflow-diff-category-header">
                          <div>
                            <div className="workflow-diff-category-title">{category.label}</div>
                            <div className="workflow-diff-category-meta">
                              {category.changeCount} change{category.changeCount === 1 ? '' : 's'} | {formatSignedCurrency(category.totalDelta)}
                            </div>
                          </div>
                        </div>

                        {category.fieldChanges.length > 0 && (
                          <div className="workflow-diff-block">
                            <div className="workflow-diff-block-title">Proposal Changes</div>
                            {category.fieldChanges.map((change) => (
                              <div key={`${category.key}-${change.label}`} className="workflow-diff-row">
                                <span className="workflow-diff-label">{change.label}</span>
                                <span className="workflow-diff-before">{change.before || 'None'}</span>
                                <span className="workflow-diff-arrow">{'->'}</span>
                                <span className="workflow-diff-after">{change.after || 'None'}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {category.costChanges.length > 0 && (
                          <div className="workflow-diff-block workflow-diff-block-collapsible">
                            <div className="workflow-diff-block-header">
                              <div className="workflow-diff-block-title">Cost Breakdown Impact</div>
                              <button
                                type="button"
                                className="workflow-diff-toggle-btn"
                                onClick={() => toggleCostCategory(category.key)}
                                aria-expanded={expandedCostCategories.includes(category.key)}
                              >
                                {expandedCostCategories.includes(category.key) ? 'Hide Details' : 'Show Details'}
                              </button>
                            </div>
                            {expandedCostCategories.includes(category.key) && (
                              <div className="workflow-diff-block-content">
                                {category.costChanges.map((change) => (
                                  <div key={`${category.key}-${change.category}-${change.label}`} className="workflow-cost-row">
                                    <div className="workflow-cost-row-copy">
                                      <div className="workflow-cost-row-title">{change.label}</div>
                                      <div className="workflow-cost-row-meta">
                                        {change.beforeQuantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} {'->'} {change.afterQuantity.toLocaleString('en-US', { maximumFractionDigits: 2 })} qty
                                      </div>
                                    </div>
                                    <div className="workflow-cost-row-values">
                                      <span>{formatCurrency(change.beforeTotal)} {'->'} {formatCurrency(change.afterTotal)}</span>
                                      <strong>{formatSignedCurrency(change.delta)}</strong>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="workflow-action-card">
                <div className="workflow-action-header">
                  <div>
                    <div className="workflow-detail-label">Reviewer Actions</div>
                    <div className="workflow-detail-value">
                      {getWorkflowStatus(selectedProposal) === 'approved'
                        ? 'Mark Complete or Request Changes'
                        : 'Approve or Request Changes'}
                    </div>
                  </div>
                </div>
                <div className="workflow-action-stack">
                  <button
                    type="button"
                    className="workflow-open-summary-btn"
                    onClick={() =>
                      navigate(`/proposal/view/${selectedProposal.proposalNumber}`, {
                        state: {
                          reviewerReturnTo: 'workflow',
                          reviewerReturnPath: selectedWorkflowPath,
                        },
                      })
                    }
                  >
                    Open Proposal Summary
                  </button>
                  <div className="workflow-action-buttons">
                    {getWorkflowStatus(selectedProposal) === 'needs_approval' && (
                      <button
                        type="button"
                        className="workflow-success-btn"
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
                        onClick={() => setShowNoteComposer(true)}
                      >
                        Request Changes
                      </button>
                    )}
                    {getWorkflowStatus(selectedProposal) === 'approved' && (
                      <button
                        type="button"
                        className="workflow-primary-btn"
                        disabled={Boolean(savingAction)}
                        onClick={() => setShowCompleteConfirm(true)}
                      >
                        Mark Complete
                      </button>
                    )}
                  </div>
                </div>
                {showNoteComposer && (
                  <>
                    <textarea
                      className="workflow-note-input"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder="Add a note"
                    />
                    <div className="workflow-note-actions">
                      <button
                        type="button"
                        className="workflow-secondary-btn"
                        disabled={!noteDraft.trim() || Boolean(savingAction)}
                        onClick={() => void handleRequestChanges()}
                      >
                        Request Changes
                      </button>
                      <button
                        type="button"
                        className="workflow-secondary-btn"
                        disabled={Boolean(savingAction)}
                        onClick={() => {
                          setNoteDraft('');
                          setShowNoteComposer(false);
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
              <ConfirmDialog
                open={showCompleteConfirm}
                title="Are you sure?"
                message="Marking as complete will not allow any edits to be made afterwards. This should be done after the pool is complete"
                confirmLabel="Yes, I'm sure"
                cancelLabel="No, take me back"
                isLoading={Boolean(savingAction)}
                onConfirm={() => {
                  setShowCompleteConfirm(false);
                  void handleComplete();
                }}
                onCancel={() => setShowCompleteConfirm(false)}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default WorkflowPage;
