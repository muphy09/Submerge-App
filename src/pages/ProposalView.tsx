import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Proposal } from '../types/proposal';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import './ProposalView.css';

function ProposalView() {
  const navigate = useNavigate();
  const { proposalNumber } = useParams();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const proposalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (proposalNumber) {
      loadProposal(proposalNumber);
    }
  }, [proposalNumber]);

  const loadProposal = async (num: string) => {
    try {
      const data = await window.electron.getProposal(num);
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
      alert('Failed to export PDF. Please try again.');
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

  return (
    <div className="proposal-view">
      <div className="view-actions no-print">
        <div className="left-actions">
          <button className="btn btn-secondary" onClick={() => navigate('/')}>
            Back to Home
          </button>
          <button className="btn btn-primary" onClick={handleEdit}>
            Edit Proposal
          </button>
        </div>
        <div className="right-actions">
          <button className="btn btn-secondary" onClick={handlePrint}>
            Print
          </button>
          <button className="btn btn-success" onClick={handleExportPDF}>
            Export PDF
          </button>
        </div>
      </div>

      <div className="proposal-document" ref={proposalRef}>
        {/* Header */}
        <div className="doc-header">
          <h1>Pool Construction Proposal</h1>
          <div className="header-info">
            <p><strong>Proposal #:</strong> {proposal.proposalNumber}</p>
            <p><strong>Date:</strong> {new Date(proposal.createdDate).toLocaleDateString()}</p>
            <p><strong>Status:</strong> <span className={`status-${proposal.status}`}>{proposal.status.toUpperCase()}</span></p>
          </div>
        </div>

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
            <div><strong>Type:</strong> {proposal.poolSpecs.poolType}</div>
            {proposal.poolSpecs.poolModel && <div><strong>Model:</strong> {proposal.poolSpecs.poolModel}</div>}
            <div><strong>Dimensions:</strong> {proposal.poolSpecs.length}' L × {proposal.poolSpecs.width}' W × {proposal.poolSpecs.depth}' D</div>
            {proposal.poolSpecs.shape && <div><strong>Shape:</strong> {proposal.poolSpecs.shape}</div>}
            <div><strong>Base Price:</strong> ${proposal.poolSpecs.basePrice.toLocaleString()}</div>
          </div>
        </section>

        {/* Cost Breakdown */}
        <section className="doc-section">
          <h2>Cost Breakdown</h2>
          <table className="cost-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pool Base Price</td>
                <td>${proposal.poolSpecs.basePrice.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Excavation</td>
                <td>${proposal.excavation.cost.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Plumbing</td>
                <td>${proposal.plumbing.cost.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Tile, Coping & Decking</td>
                <td>${proposal.tileCopingDecking.cost.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Drainage</td>
                <td>${proposal.drainage.cost.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Equipment</td>
                <td>${proposal.equipment.totalCost.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Water Features</td>
                <td>${proposal.waterFeatures.totalCost.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Custom Features</td>
                <td>${proposal.customFeatures.totalCost.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Masonry</td>
                <td>${proposal.masonry.cost.toLocaleString()}</td>
              </tr>
              <tr>
                <td>Interior Finish</td>
                <td>${proposal.interiorFinish.cost.toLocaleString()}</td>
              </tr>
              <tr className="subtotal-row">
                <td><strong>Subtotal</strong></td>
                <td><strong>${proposal.subtotal.toLocaleString()}</strong></td>
              </tr>
              <tr>
                <td>Tax ({(proposal.taxRate * 100).toFixed(1)}%)</td>
                <td>${proposal.taxAmount.toLocaleString()}</td>
              </tr>
              <tr className="total-row">
                <td><strong>TOTAL</strong></td>
                <td><strong>${proposal.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Equipment Details */}
        {proposal.equipment.items.length > 0 && (
          <section className="doc-section">
            <h2>Equipment Details</h2>
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Item</th>
                  <th>Model</th>
                  <th>Qty</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {proposal.equipment.items.map((item, index) => (
                  <tr key={index}>
                    <td>{item.category}</td>
                    <td>{item.name}</td>
                    <td>{item.model}</td>
                    <td>{item.quantity}</td>
                    <td>${item.totalPrice.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Water Features */}
        {proposal.waterFeatures.features.length > 0 && (
          <section className="doc-section">
            <h2>Water Features</h2>
            <table className="detail-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>Qty</th>
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {proposal.waterFeatures.features.map((feature, index) => (
                  <tr key={index}>
                    <td>{feature.type}</td>
                    <td>{feature.name}</td>
                    <td>{feature.quantity}</td>
                    <td>${feature.totalPrice.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Custom Features */}
        {proposal.customFeatures.features.length > 0 && (
          <section className="doc-section">
            <h2>Custom Features</h2>
            {proposal.customFeatures.features.map((feature, index) => (
              <div key={index} className="custom-feature-item">
                <h3>{feature.name} - ${feature.cost.toLocaleString()}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </section>
        )}

        {/* Notes */}
        {proposal.notes && (
          <section className="doc-section">
            <h2>Additional Notes</h2>
            <p>{proposal.notes}</p>
          </section>
        )}

        {/* Footer */}
        <div className="doc-footer">
          <p>This proposal is valid for 30 days from the date of issue.</p>
          <p>Thank you for considering our services!</p>
        </div>
      </div>
    </div>
  );
}

export default ProposalView;
