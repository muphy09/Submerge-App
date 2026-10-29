import { useEffect, useState, type ReactNode } from 'react';
import type { AddOnSelection } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { subscribeToPricingData } from '../services/pricingDataStore';
import type { AddOnCategory } from '../utils/addOns';
import type { ProposalNoteOverrides } from '../utils/proposalNotes';
import ProposalNote from './ProposalNote';

export default function AddOnsSection({ category, selections, onChange, allowed = true, renderPriceImpact, noteOverrides }: {
  category: AddOnCategory;
  selections: AddOnSelection[];
  onChange: (value: AddOnSelection[]) => void;
  allowed?: boolean;
  renderPriceImpact?: (id: string, name: string) => ReactNode;
  noteOverrides?: ProposalNoteOverrides;
}) {
  const [catalog, setCatalog] = useState(pricingData[category].addOns || []);
  useEffect(() => subscribeToPricingData(snapshot => setCatalog(snapshot[category].addOns || [])), [category]);
  if (!catalog.length) return null;
  return (
    <div className="spec-block tile-additional-options-block" data-testid={`${category}-add-ons`}>
      <div className="spec-block-header">
        <h2 className="spec-block-title">Add-ons</h2>
        <ProposalNote categoryKey={category} subcategoryId="addOns" overrides={noteOverrides} />
      </div>
      {!allowed && <p>Add-ons are unavailable with this equipment package.</p>}
      {catalog.map(item => {
        const enabled = allowed && selections.some(selection => selection.id === item.id);
        return (
          <div className="tile-additional-option-card" key={item.id}>
            <div className="tile-additional-option-copy">
              <div className="tile-additional-option-title">{item.name}</div>
              <div className="tile-additional-option-description">Enable or Disable {item.name}</div>
            </div>
            <div className="tile-additional-option-actions">
              {enabled && renderPriceImpact?.(item.id, item.name)}
              <label className={`equipment-selection-toggle ${enabled ? 'is-on' : 'is-off'}`}>
                <span className="equipment-selection-toggle__status">{enabled ? 'Enabled' : 'Disabled'}</span>
                <input type="checkbox" role="switch" aria-label={item.name} checked={enabled} disabled={!allowed}
                  onChange={event => onChange(event.target.checked
                    ? [...selections.filter(selection => selection.id !== item.id), { id: item.id, name: item.name }]
                    : selections.filter(selection => selection.id !== item.id))} />
                <span className="equipment-selection-toggle__track" aria-hidden="true">
                  <span className="equipment-selection-toggle__thumb" />
                </span>
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
