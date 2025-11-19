import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Proposal } from '../types/proposal';
import CustomerInfoSection from '../components/CustomerInfoSection';
import PoolSpecsSection from '../components/PoolSpecsSection';
import ExcavationSection from '../components/ExcavationSection';
import PlumbingSection from '../components/PlumbingSection';
import TileCopingDeckingSection from '../components/TileCopingDeckingSection';
import DrainageSection from '../components/DrainageSection';
import EquipmentSection from '../components/EquipmentSection';
import WaterFeaturesSection from '../components/WaterFeaturesSection';
import CustomFeaturesSection from '../components/CustomFeaturesSection';
import MasonrySection from '../components/MasonrySection';
import InteriorFinishSection from '../components/InteriorFinishSection';
import './ProposalForm.css';

const sections = [
  'Customer Information',
  'Pool Specs',
  'Excavation',
  'Plumbing',
  'Tile/Coping/Decking',
  'Drainage',
  'Equipment',
  'Water Features',
  'Custom Features',
  'Masonry',
  'Interior Finish',
];

function ProposalForm() {
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const [currentSection, setCurrentSection] = useState(0);
  const [proposal, setProposal] = useState<Partial<Proposal>>({
    proposalNumber: `PROP-${Date.now()}`,
    createdDate: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    status: 'draft',
    customerInfo: { customerName: '', city: '' },
    poolSpecs: { poolType: 'fiberglass', length: 0, width: 0, depth: 0, basePrice: 0 },
    excavation: { excavationType: '', difficulty: 'medium', accessConcerns: [], cost: 0 },
    plumbing: { pipeType: '', pipeLength: 0, fittings: [], laborHours: 0, cost: 0 },
    tileCopingDecking: { copingType: '', copingLength: 0, deckingType: '', deckingArea: 0, cost: 0 },
    drainage: { drainType: '', drainCount: 0, pipingLength: 0, cost: 0 },
    equipment: { items: [], totalCost: 0 },
    waterFeatures: { features: [], totalCost: 0 },
    customFeatures: { features: [], totalCost: 0 },
    masonry: { fireplaceIncluded: false, outdoorKitchen: false, cost: 0 },
    interiorFinish: { finishType: '', color: '', area: 0, cost: 0 },
    subtotal: 0,
    taxRate: 0.08,
    taxAmount: 0,
    totalCost: 0,
  });

  useEffect(() => {
    if (proposalNumber) {
      loadProposal(proposalNumber);
    }
  }, [proposalNumber]);

  const loadProposal = async (num: string) => {
    try {
      const data = await window.electron.getProposal(num);
      if (data) {
        setProposal(data);
      }
    } catch (error) {
      console.error('Failed to load proposal:', error);
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
    const subtotal =
      (proposal.poolSpecs?.basePrice || 0) +
      (proposal.excavation?.cost || 0) +
      (proposal.plumbing?.cost || 0) +
      (proposal.tileCopingDecking?.cost || 0) +
      (proposal.drainage?.cost || 0) +
      (proposal.equipment?.totalCost || 0) +
      (proposal.waterFeatures?.totalCost || 0) +
      (proposal.customFeatures?.totalCost || 0) +
      (proposal.masonry?.cost || 0) +
      (proposal.interiorFinish?.cost || 0);

    const taxRate = proposal.taxRate || 0.08;
    const taxAmount = subtotal * taxRate;
    const totalCost = subtotal + taxAmount;

    return {
      ...proposal,
      subtotal,
      taxRate,
      taxAmount,
      totalCost,
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
      const finalProposal = calculateTotals();
      if (submit) {
        finalProposal.status = 'submitted';
      }

      await window.electron.saveProposal(finalProposal);
      alert(submit ? 'Proposal submitted successfully!' : 'Proposal saved successfully!');

      if (submit) {
        navigate(`/proposal/view/${finalProposal.proposalNumber}`);
      }
    } catch (error) {
      console.error('Failed to save proposal:', error);
      alert('Failed to save proposal. Please try again.');
    }
  };

  const handleCancel = () => {
    if (confirm('Are you sure you want to cancel? Unsaved changes will be lost.')) {
      navigate('/');
    }
  };

  const renderSection = () => {
    switch (currentSection) {
      case 0:
        return <CustomerInfoSection data={proposal.customerInfo!} onChange={(data) => updateProposal('customerInfo', data)} />;
      case 1:
        return <PoolSpecsSection data={proposal.poolSpecs!} onChange={(data) => updateProposal('poolSpecs', data)} />;
      case 2:
        return <ExcavationSection data={proposal.excavation!} onChange={(data) => updateProposal('excavation', data)} />;
      case 3:
        return <PlumbingSection data={proposal.plumbing!} onChange={(data) => updateProposal('plumbing', data)} />;
      case 4:
        return <TileCopingDeckingSection data={proposal.tileCopingDecking!} onChange={(data) => updateProposal('tileCopingDecking', data)} />;
      case 5:
        return <DrainageSection data={proposal.drainage!} onChange={(data) => updateProposal('drainage', data)} />;
      case 6:
        return <EquipmentSection data={proposal.equipment!} onChange={(data) => updateProposal('equipment', data)} />;
      case 7:
        return <WaterFeaturesSection data={proposal.waterFeatures!} onChange={(data) => updateProposal('waterFeatures', data)} />;
      case 8:
        return <CustomFeaturesSection data={proposal.customFeatures!} onChange={(data) => updateProposal('customFeatures', data)} />;
      case 9:
        return <MasonrySection data={proposal.masonry!} onChange={(data) => updateProposal('masonry', data)} />;
      case 10:
        return <InteriorFinishSection data={proposal.interiorFinish!} onChange={(data) => updateProposal('interiorFinish', data)} />;
      default:
        return null;
    }
  };

  return (
    <div className="proposal-form">
      <div className="form-container">
        <header className="form-header">
          <h1>Pool Proposal Builder</h1>
          <p className="proposal-number">Proposal #{proposal.proposalNumber}</p>
        </header>

        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((currentSection + 1) / sections.length) * 100}%` }}
          />
        </div>

        <nav className="section-nav">
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
        </nav>

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
    </div>
  );
}

export default ProposalForm;
