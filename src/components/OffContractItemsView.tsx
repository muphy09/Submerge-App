import FranchiseLogo from './FranchiseLogo';
import { OffContractItemGroup } from '../utils/customOptions';
import './OffContractItemsView.css';

interface Props {
  customerName: string;
  franchiseId?: string;
  groups: OffContractItemGroup[];
}

const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

function OffContractItemsView({ customerName, franchiseId, groups }: Props) {
  const totalCost = groups.reduce((sum, group) => sum + group.totalCost, 0);

  return (
    <div className="off-contract-sheet">
      <div className="off-contract-header">
        <div>
          <p className="off-contract-eyebrow">Retail-Only Addendum</p>
          <h2 className="off-contract-title">Off Contract Items</h2>
          <p className="off-contract-subtitle">
            Prepared for: <span>{customerName || 'N/A'}</span>
          </p>
        </div>
        <div className="off-contract-logo">
          <FranchiseLogo alt="Franchise Logo" franchiseId={franchiseId} />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="off-contract-empty">No off contract items were added to this proposal.</div>
      ) : (
        <>
          <div className="off-contract-groups">
            {groups.map((group) => (
              <section className="off-contract-group-card" key={group.category}>
                <div className="off-contract-group-header">
                  <h3>{group.category}</h3>
                  <span>{formatCurrency(group.totalCost)}</span>
                </div>
                <table className="off-contract-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((item, index) => (
                      <tr key={`${group.category}-${index}`}>
                        <td>{item.name}</td>
                        <td>{item.description || 'No description provided'}</td>
                        <td>{formatCurrency(item.totalCost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            ))}
          </div>

          <div className="off-contract-total">
            <span>OFF CONTRACT TOTAL</span>
            <span>{formatCurrency(totalCost)}</span>
          </div>
        </>
      )}
    </div>
  );
}

export default OffContractItemsView;
