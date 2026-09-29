import FranchiseLogo from './FranchiseLogo';
import type { Proposal } from '../types/proposal-new';
import type { MaterialsOrderFormData, OrderFormGroup, OrderFormItem } from '../utils/materialsOrderForm';
import './MaterialsOrderForm.css';

interface Props {
  proposal: Proposal;
  data: MaterialsOrderFormData;
}

const formatQuantity = (value: number, unit: string) =>
  `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit === 'items' ? '' : unit}`.trim();

const getVersionName = (proposal: Proposal) => {
  const name = proposal.versionName?.trim();
  if (name && name.toLowerCase() !== 'version') return name;
  return (proposal.isOriginalVersion ?? (proposal.versionId || 'original') === 'original')
    ? 'Original' : 'Version';
};

const getTierName = (proposal: Proposal) =>
  (proposal.pricingTierId || proposal.pricingTierName || '').trim().toLowerCase() === 'bronze'
    ? 'Bronze' : 'Standard';

// Small sections stay together; long equipment lists continue under the same heading.
const paginateGroups = (groups: OrderFormGroup[]): OrderFormGroup[][] => {
  const pages: OrderFormGroup[][] = [];
  let page: OrderFormGroup[] = [];
  let used = 0;
  const limit = 12;
  groups.forEach((group) => {
    if (page.length && group.items.length + 1 <= limit && used + group.items.length + 1 > limit) {
      pages.push(page);
      page = [];
      used = 0;
    }
    for (let offset = 0; offset < group.items.length;) {
      if (used >= limit) { pages.push(page); page = []; used = 0; }
      const room = Math.max(1, limit - used - 1);
      const take = Math.min(room, group.items.length - offset);
      page.push({ title: offset ? `${group.title} (continued)` : group.title, items: group.items.slice(offset, offset + take) });
      offset += take;
      used += take + 1;
    }
  });
  if (page.length || !pages.length) pages.push(page);
  return pages;
};

function Item({ item }: { item: OrderFormItem }) {
  return (
    <div className="materials-order-item">
      <div className="materials-order-item-copy">
        <strong>{item.name}</strong>
        {item.detail && <span>{item.detail}</span>}
        {item.note && <small>{item.note}</small>}
      </div>
      <div className="materials-order-measures">
        {item.measures.map((measure) => (
          <div className="materials-order-measure" key={measure.label}>
            <span>{measure.label}</span>
            <strong>{formatQuantity(measure.value, measure.unit)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MaterialsOrderForm({ proposal, data }: Props) {
  const pages = paginateGroups(data.groups);
  return (
    <div className="materials-order-document">
      {pages.map((groups, pageIndex) => (
        <article className="export-breakdown-page materials-order-page" key={pageIndex}>
          <header className="materials-order-header">
            <div className="materials-order-heading">
              <p>Materials &amp; Equipment</p>
              <h2>Order Form</h2>
              <p className="materials-order-subtitle">Prepared for {proposal.customerInfo.customerName || 'Customer'}</p>
            </div>
            <div className="materials-order-logo"><FranchiseLogo alt="Franchise Logo" franchiseId={proposal.franchiseId} /></div>
          </header>
          <div className="materials-order-meta">
            <div><span>Version</span><strong>{getVersionName(proposal)}</strong></div>
            <div><span>Price Model</span><strong>{proposal.pricingModelName?.trim() || proposal.pricingModelId?.trim() || 'Not available'}</strong></div>
            <div><span>Tier</span><strong>{getTierName(proposal)}</strong></div>
          </div>
          {data.packageNote && <p className="materials-order-package-note">{data.packageNote}</p>}
          <div className="materials-order-groups">
            {groups.length ? groups.map((group, groupIndex) => (
              <section className="materials-order-group" key={`${pageIndex}-${groupIndex}`}>
                <h3>{group.title}</h3>
                {group.items.map((item, itemIndex) => <Item item={item} key={`${item.name}-${itemIndex}`} />)}
              </section>
            )) : <p className="materials-order-empty">No materials or equipment selected for this proposal.</p>}
          </div>
          <footer className="materials-order-footer">
            <span>Materials and Equipment Order Form</span>
            <span>Page {pageIndex + 1} of {pages.length}</span>
          </footer>
        </article>
      ))}
    </div>
  );
}
