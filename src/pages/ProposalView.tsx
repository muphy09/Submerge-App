import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Proposal } from '../types/proposal-new';
import CostBreakdownView from '../components/CostBreakdownView';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { useToast } from '../components/Toast';
import './ProposalView.css';
import submergeLogo from '../../Submerge Logo.png';
import MasterPricingEngine from '../services/masterPricingEngine';
import { getProposal as getProposalRemote } from '../services/proposalsAdapter';

function ProposalView() {
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const proposalRef = useRef<HTMLDivElement>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (proposalNumber) {
      loadProposal(proposalNumber);
    }
  }, [proposalNumber]);

  const loadProposal = async (num: string) => {
    try {
      const data = await getProposalRemote(num);
      setProposal(data);
    } catch (error) {
      console.error('Failed to load proposal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    navigate(`/proposal/edit/${proposalNumber}`);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    if (!proposalRef.current || !proposal) return;

    try {
      const canvas = await html2canvas(proposalRef.current, {
        scale: 2,
        logging: false,
        useCORS: true,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const imgX = (pdfWidth - imgWidth * ratio) / 2;
      const imgY = 10;

      pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio);
      pdf.save(`Pool_Proposal_${proposal.proposalNumber}.pdf`);
    } catch (error) {
      console.error('Failed to export PDF:', error);
      showToast({ type: 'error', message: 'Failed to export PDF. Please try again.' });
    }
  };

  if (loading) {
    return (
      <div className="proposal-view">
        <div className="loading-container">Loading proposal...</div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="proposal-view">
        <div className="error-container">
          <h2>Proposal not found</h2>
          <button className="btn btn-primary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  let calculated: ReturnType<typeof MasterPricingEngine.calculateCompleteProposal> | null = null;
  try {
    calculated = MasterPricingEngine.calculateCompleteProposal(proposal, proposal.papDiscounts);
  } catch (error) {
    console.error('Failed to recalculate proposal for view:', error);
  }

  const costBreakdownForDisplay = calculated?.costBreakdown || proposal.costBreakdown;
  const subtotal = calculated?.subtotal ?? proposal.subtotal ?? 0;
  const totalCost = calculated?.totalCost ?? proposal.totalCost ?? 0;

  return (
    <div className="proposal-view">
      <div className="view-actions no-print">
        <div className="left-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Back to Home
          </button>
        </div>
        <div className="right-actions">
          <button className="btn btn-secondary" onClick={handleEdit}>
            Edit Proposal
          </button>
          <button className="btn btn-secondary" onClick={handlePrint}>
            Print
          </button>
          <button className="btn btn-primary" onClick={handleExportPDF}>
            Export PDF
          </button>
        </div>
      </div>

      <div ref={proposalRef} className="proposal-document">
        {/* Header */}
        <header className="doc-header">
          <img src={submergeLogo} alt="Submerge Logo" className="doc-logo" />
          <div className="doc-title-section">
            <h1>Pool Proposal</h1>
            <p className="proposal-meta">
              Proposal #{proposal.proposalNumber.replace('PROP-', '')}
            </p>
            <p className="proposal-meta">
              Date: {new Date(proposal.createdDate).toLocaleDateString()}
            </p>
          </div>
        </header>

        {/* Customer Information */}
        <section className="doc-section">
          <h2>Customer Information</h2>
          <div className="info-grid">
            <div><strong>Name:</strong> {proposal.customerInfo.customerName}</div>
            <div><strong>City:</strong> {proposal.customerInfo.city}</div>
            {proposal.customerInfo.address && <div><strong>Address:</strong> {proposal.customerInfo.address}</div>}
            {proposal.customerInfo.phone && <div><strong>Phone:</strong> {proposal.customerInfo.phone}</div>}
            {proposal.customerInfo.email && <div><strong>Email:</strong> {proposal.customerInfo.email}</div>}
          </div>
        </section>

        {/* Pool Specifications */}
        <section className="doc-section">
          <h2>Pool Specifications</h2>
          <div className="info-grid">
            <div><strong>Type:</strong> {proposal.poolSpecs.poolType === 'gunite' ? 'Gunite (Custom)' : 'Fiberglass'}</div>
            {proposal.poolSpecs.poolType === 'fiberglass' && proposal.poolSpecs.fiberglassSize && (
              <div><strong>Size:</strong> {proposal.poolSpecs.fiberglassSize}</div>
            )}
            {proposal.poolSpecs.poolType === 'gunite' && (
              <>
                <div><strong>Surface Area:</strong> {proposal.poolSpecs.surfaceArea} sqft</div>
                <div><strong>Perimeter:</strong> {proposal.poolSpecs.perimeter} lnft</div>
                <div><strong>Shallow Depth:</strong> {proposal.poolSpecs.shallowDepth} ft</div>
                <div><strong>End Depth:</strong> {proposal.poolSpecs.endDepth} ft</div>
              </>
            )}
            <div><strong>Approximate Gallons:</strong> {proposal.poolSpecs.approximateGallons.toLocaleString()}</div>
            {proposal.poolSpecs.spaType !== 'none' && (
              <div><strong>Spa Type:</strong> {proposal.poolSpecs.spaType}</div>
            )}
          </div>
        </section>

        {/* Cost Breakdown */}
        {costBreakdownForDisplay && (
          <section className="doc-section">
            <CostBreakdownView
              costBreakdown={costBreakdownForDisplay}
              customerName={proposal.customerInfo.customerName}
              proposal={proposal}
              pricing={calculated?.pricing ?? proposal.pricing}
            />
          </section>
        )}

        {/* Summary */}
        <section className="doc-section summary-section">
          <h2>Proposal Summary</h2>
          <table className="cost-table">
            <tbody>
              <tr className="subtotal-row">
                <td><strong>Subtotal</strong></td>
                <td style={{ textAlign: 'right' }}><strong>${subtotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
              </tr>
              <tr className="total-row">
                <td><strong>TOTAL</strong></td>
                <td style={{ textAlign: 'right' }}><strong>${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Footer */}
        <footer className="doc-footer">
          <p className="status-badge" style={{
            display: 'inline-block',
            padding: '0.5rem 1rem',
            backgroundColor: proposal.status === 'submitted' ? '#04bc17ff' : '#ddc720ff',
            color: 'white',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}>
            Status: {proposal.status.toUpperCase()}
          </p>
          <p>Submerge - A passion for splashin'</p>
        </footer>
      </div>
    </div>
  );
}

export default ProposalView;
