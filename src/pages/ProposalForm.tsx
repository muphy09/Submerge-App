import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Proposal, WaterFeatures } from '../types/proposal-new';
import { getDefaultProposal } from '../utils/proposalDefaults';
import MasterPricingEngine from '../services/masterPricingEngine';
import { validateProposal } from '../utils/validation';
import CustomerInfoSection from '../components/CustomerInfoSection';
import PoolSpecsSectionNew from '../components/PoolSpecsSectionNew';
import ExcavationSectionNew from '../components/ExcavationSectionNew';
import PlumbingSectionNew from '../components/PlumbingSectionNew';
import ElectricalSectionNew from '../components/ElectricalSectionNew';
import TileCopingDeckingSectionNew from '../components/TileCopingDeckingSectionNew';
import DrainageSectionNew from '../components/DrainageSectionNew';
import EquipmentSectionNew from '../components/EquipmentSectionNew';
import WaterFeaturesSectionNew from '../components/WaterFeaturesSectionNew';
import InteriorFinishSectionNew from '../components/InteriorFinishSectionNew';
import CustomFeaturesSectionNew from '../components/CustomFeaturesSectionNew';
import CostBreakdownView from '../components/CostBreakdownView';
import LiveCostBreakdown from '../components/LiveCostBreakdown';
import './ProposalForm.css';
import ppasLogo from '../../PPAS Logo.png';
import customerProposalIcon from '../../CustomerProposalIcon.png';
import { useToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

const normalizeWaterFeatures = (waterFeatures: any): WaterFeatures => {
  if (waterFeatures && Array.isArray((waterFeatures as any).selections)) {
    return {
      selections: (waterFeatures as any).selections,
      totalCost: (waterFeatures as any).totalCost ?? 0,
    };
  }

  return {
    selections: [],
    totalCost: 0,
  };
};

const sections = [
  'Customer Information',
  'Pool Specifications',
  'Excavation',
  'Plumbing',
  'Electrical',
  'Tile/Coping/Decking',
  'Drainage',
  'Equipment',
  'Water Features',
  'Interior Finish',
  'Custom Features',
];

function ProposalForm() {
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const { showToast } = useToast();
  const [currentSection, setCurrentSection] = useState(0);
  const [isLoading, setIsLoading] = useState(!!proposalNumber);
  const loadRequestRef = useRef(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showLeftNav, setShowLeftNav] = useState(true);
  const [showRightCost, setShowRightCost] = useState(true);
  const [showCostModal, setShowCostModal] = useState(false);

  const getInitialProposal = (): Partial<Proposal> => getDefaultProposal();

  const [proposal, setProposal] = useState<Partial<Proposal>>(getInitialProposal());

  useEffect(() => {
    const requestId = ++loadRequestRef.current;
    if (proposalNumber) {
      setIsLoading(true);
      loadProposal(proposalNumber, requestId);
    } else {
      const freshProposal = getInitialProposal();
      setProposal(freshProposal);
      setCurrentSection(0);
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalNumber]);

  const loadProposal = async (num: string, requestId: number) => {
    try {
      const data = await window.electron.getProposal(num);
      if (data) {
        // Deep clone to ensure fresh object references
        const freshData = JSON.parse(JSON.stringify(data));

        // Normalize water features to the new catalog-driven shape
        freshData.waterFeatures = normalizeWaterFeatures(freshData.waterFeatures);

        if (loadRequestRef.current === requestId) {
          setProposal(freshData);
        }
      }
    } catch (error) {
      console.error('Failed to load proposal:', error);
      showToast({
        type: 'error',
        message: 'Failed to load proposal. Please try again.',
      });
    } finally {
      if (loadRequestRef.current === requestId) {
        setIsLoading(false);
      }
    }
  };

  const updateProposal = (section: string, data: any) => {
    setProposal(prev => ({
      ...prev,
      [section]: data,
      lastModified: new Date().toISOString(),
    }));
  };

  const calculateTotals = (): Proposal => {
    const result = MasterPricingEngine.calculateCompleteProposal(proposal);

    return {
      ...proposal,
      costBreakdown: result.costBreakdown,
      subtotal: result.subtotal,
      taxRate: result.taxRate,
      taxAmount: result.taxAmount,
      totalCost: result.totalCost,
    } as Proposal;
  };

  const handleNext = () => {
    if (currentSection < sections.length - 1) {
      setCurrentSection(currentSection + 1);
    }
  };

  const handlePrevious = () => {
    if (currentSection > 0) {
      setCurrentSection(currentSection - 1);
    }
  };

  const handleSave = async (submit: boolean = false) => {
    try {
      // Validate if submitting
      if (submit) {
        const errors = validateProposal(proposal);
        if (errors.length > 0) {
          showToast({
            type: 'error',
            message: `Validation errors: ${errors.map(e => e.message).join(', ')}`,
          });
          return;
        }
      }

      const finalProposal = calculateTotals();
      if (submit) {
        finalProposal.status = 'submitted';
      }

      await window.electron.saveProposal(finalProposal);
      showToast({
        type: 'success',
        message: submit ? 'Proposal submitted successfully!' : 'Proposal saved successfully!',
      });

      if (submit) {
        navigate(`/proposal/view/${finalProposal.proposalNumber}`);
      } else {
        navigate('/');
      }
    } catch (error) {
      console.error('Failed to save proposal:', error);
      showToast({
        type: 'error',
        message: 'Failed to save proposal. Please try again.',
      });
    }
  };

  const handleCancel = () => {
    setShowCancelConfirm(true);
  };

  const renderSection = () => {
    // Ensure we have valid proposal data before rendering
    if (!proposal.poolSpecs || !proposal.customerInfo) {
      return (
        <div className="section-form">
          <p>Loading proposal data...</p>
        </div>
      );
    }

    const hasSpa = proposal.poolSpecs?.spaType !== 'none';
    const isFiberglass = proposal.poolSpecs?.poolType === 'fiberglass';

    try {
      switch (currentSection) {
        case 0:
          return (
            <CustomerInfoSection
              data={proposal.customerInfo}
              onChange={(data) => updateProposal('customerInfo', data)}
            />
          );
      case 1:
        return (
          <PoolSpecsSectionNew
            data={proposal.poolSpecs}
            onChange={(data) => updateProposal('poolSpecs', data)}
          />
        );
      case 2:
        return (
          <ExcavationSectionNew
            data={proposal.excavation!}
            onChange={(data) => updateProposal('excavation', data)}
          />
        );
      case 3:
        return (
          <PlumbingSectionNew
            data={proposal.plumbing!}
            onChange={(data) => updateProposal('plumbing', data)}
            hasSpa={hasSpa}
          />
        );
      case 4:
        return (
          <ElectricalSectionNew
            data={proposal.electrical!}
            onChange={(data) => updateProposal('electrical', data)}
            hasSpa={hasSpa}
          />
        );
      case 5:
        return (
          <TileCopingDeckingSectionNew
            data={proposal.tileCopingDecking!}
            onChange={(data) => updateProposal('tileCopingDecking', data)}
            poolPerimeter={proposal.poolSpecs.perimeter || 0}
            isFiberglass={isFiberglass}
          />
        );
      case 6:
        return (
          <DrainageSectionNew
            data={proposal.drainage!}
            onChange={(data) => updateProposal('drainage', data)}
          />
        );
      case 7:
        return (
          <EquipmentSectionNew
            data={proposal.equipment!}
            onChange={(data) => updateProposal('equipment', data)}
            hasSpa={hasSpa}
          />
        );
      case 8:
        return (
          <WaterFeaturesSectionNew
            data={proposal.waterFeatures!}
            onChange={(data) => updateProposal('waterFeatures', data)}
          />
        );
      case 9:
        return (
          <InteriorFinishSectionNew
            data={proposal.interiorFinish!}
            onChange={(data) => updateProposal('interiorFinish', data)}
            poolSurfaceArea={proposal.poolSpecs.surfaceArea || 0}
            hasSpa={hasSpa}
          />
        );
      case 10:
        return (
          <CustomFeaturesSectionNew
            data={proposal.customFeatures!}
            onChange={(data) => updateProposal('customFeatures', data)}
          />
        );
      default:
        return null;
      }
    } catch (error) {
      console.error('Error rendering section:', error);
      return (
        <div className="section-form">
          <div style={{
            padding: '2rem',
            backgroundColor: '#fee2e2',
            borderRadius: '8px',
            border: '1px solid #dc2626'
          }}>
            <h3 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>Error Loading Section</h3>
            <p style={{ color: '#7f1d1d' }}>
              There was an error loading this section. This may be due to incompatible data from an older version.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => navigate('/')}
              style={{ marginTop: '1rem' }}
            >
              Return to Home
            </button>
          </div>
        </div>
      );
    }
  };

  if (isLoading) {
    return (
      <div className="proposal-form">
        <div className="form-container loading-state">
          <p>Loading proposal...</p>
        </div>
      </div>
    );
  }

  const currentCostBreakdown = MasterPricingEngine.calculateCompleteProposal(proposal);

  return (
    <div className="proposal-form">
      <header className="form-header">
        <div className="form-header-title">
          <img src={ppasLogo} alt="PPAS Logo" className="form-logo" />
          <h1>Pool Proposal Builder</h1>
        </div>
        <p className="proposal-number">Proposal #{proposal.proposalNumber?.replace('PROP-', '')}</p>
      </header>

      <div className={`progress-bar ${!showLeftNav ? 'no-left-nav' : ''} ${!showRightCost ? 'no-right-cost' : ''}`}>
        <div
          className="progress-fill"
          style={{ width: `${((currentSection + 1) / sections.length) * 100}%` }}
        />
      </div>

      <div className="form-layout">
        {showLeftNav && (
          <nav className="section-nav">
            <div
              className="nav-header"
              onClick={() => setShowLeftNav(false)}
              title="Hide navigation"
            >
              <h3>Proposal Navigation</h3>
              <button
                className="sidebar-toggle left-toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowLeftNav(false);
                }}
                title="Hide navigation"
              >
                ◀
              </button>
            </div>
            <div className="nav-action-space" aria-hidden="true">
              <span className="nav-divider" />
              <div className="nav-action-buttons">
                <button
                  className="cost-modal-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCostModal(true);
                  }}
                  title="View Customer Proposal"
                >
                  <img src={customerProposalIcon} alt="Customer Proposal" className="button-icon" />
                  <span className="cost-modal-label">Customer Proposal</span>
                </button>
              </div>
              <span className="nav-divider" />
            </div>
            <div className="section-nav-grid">
              {sections.map((section, index) => (
                <button
                  key={section}
                  className={`nav-item ${index === currentSection ? 'active' : ''} ${index < currentSection ? 'completed' : ''}`}
                  onClick={() => setCurrentSection(index)}
                >
                  <span className="nav-number">{index + 1}</span>
                  <span className="nav-label">{section}</span>
                </button>
              ))}
            </div>
          </nav>
        )}

        {!showLeftNav && (
          <button
            className="sidebar-show-button left-show"
            onClick={() => setShowLeftNav(true)}
            title="Show navigation"
          >
            ▶
          </button>
        )}

        <div className={`form-container ${!showLeftNav ? 'no-left-nav' : ''} ${!showRightCost ? 'no-right-cost' : ''}`}>
          <div className="section-content">
            <h2 className="section-title">{sections[currentSection]}</h2>
            {renderSection()}
          </div>

          <div className="form-actions">
            <div className="left-actions">
              <button className="btn btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              <button className="btn btn-secondary" onClick={() => handleSave(false)}>
                Save Draft
              </button>
            </div>
            <div className="right-actions">
              {currentSection > 0 && (
                <button className="btn btn-secondary" onClick={handlePrevious}>
                  Previous
                </button>
              )}
              {currentSection < sections.length - 1 ? (
                <button className="btn btn-primary" onClick={handleNext}>
                  Next
                </button>
              ) : (
                <button className="btn btn-success" onClick={() => handleSave(true)}>
                  Submit Proposal
                </button>
              )}
            </div>
          </div>
        </div>

        {showRightCost && (
          <aside className="cost-sidebar">
            <LiveCostBreakdown
              costBreakdown={currentCostBreakdown.costBreakdown}
              onToggle={() => setShowRightCost(false)}
            />
          </aside>
        )}

        {!showRightCost && (
          <button
            className="sidebar-show-button right-show"
            onClick={() => setShowRightCost(true)}
            title="Show cost breakdown"
          >
            ◀
          </button>
        )}
      </div>

      {showCostModal && (
        <div className="cost-modal-overlay" onClick={() => setShowCostModal(false)}>
          <div className="cost-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="cost-modal-close" onClick={() => setShowCostModal(false)}>
              ✕
            </button>
            <CostBreakdownView
              costBreakdown={currentCostBreakdown.costBreakdown}
              customerName={proposal.customerInfo?.customerName || ''}
              proposal={proposal}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showCancelConfirm}
        title="Cancel changes?"
        message="Unsaved changes will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setShowCancelConfirm(false);
          navigate('/');
        }}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  );
}

export default ProposalForm;
