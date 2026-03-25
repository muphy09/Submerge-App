import { useEffect, useMemo, useState } from 'react';
import {
  CustomFeature,
  CustomFeatures,
  GroupedCustomFeatureOption,
} from '../types/proposal-new';
import {
  getCustomFeatureTotal,
  isGroupedCustomFeature,
  normalizeCustomFeature,
  normalizeCustomFeatures,
  normalizeGroupedCustomFeatureOptions,
} from '../utils/customFeatures';
import './SectionStyles.css';

interface Props {
  data: CustomFeatures;
  onChange: (data: CustomFeatures) => void;
  retailPrice?: number;
  groupedOptions?: GroupedCustomFeatureOption[];
}

type GroupedFeatureCard = GroupedCustomFeatureOption & {
  isRetired?: boolean;
};

const getGroupedFeatureKey = (feature: Partial<CustomFeature>, fallbackIndex: number): string =>
  String(feature.groupedOptionId || '').trim() || `legacy-grouped-${fallbackIndex + 1}`;

function CustomFeaturesSectionNew({ data, onChange, retailPrice, groupedOptions = [] }: Props) {
  const [activeFeatureIndex, setActiveFeatureIndex] = useState<number | null>(null);
  const maxManualFeatures = 7;

  const toNumber = (value: any) => Number(value) || 0;
  const formatCurrency = (value?: number) =>
    `$${toNumber(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const normalizedData = useMemo(() => normalizeCustomFeatures(data), [data]);
  const groupedFeatures = useMemo(
    () => normalizedData.features.filter((feature) => isGroupedCustomFeature(feature)),
    [normalizedData.features]
  );
  const manualFeatures = useMemo(
    () => normalizedData.features.filter((feature) => !isGroupedCustomFeature(feature)),
    [normalizedData.features]
  );
  const normalizedGroupedOptions = useMemo(
    () => normalizeGroupedCustomFeatureOptions(groupedOptions),
    [groupedOptions]
  );

  const groupedSelectionMap = useMemo(
    () =>
      new Map(
        groupedFeatures.map((feature, index) => [getGroupedFeatureKey(feature, index), feature] as const)
      ),
    [groupedFeatures]
  );

  const groupedFeatureCards = useMemo<GroupedFeatureCard[]>(() => {
    const cards: GroupedFeatureCard[] = normalizedGroupedOptions.map((option) => ({ ...option }));
    const knownIds = new Set(cards.map((option) => option.id));

    groupedFeatures.forEach((feature, index) => {
      const featureId = getGroupedFeatureKey(feature, index);
      if (knownIds.has(featureId)) return;
      knownIds.add(featureId);
      cards.push({
        id: featureId,
        name: feature.name?.trim() || `Grouped Feature #${index + 1}`,
        description: feature.description?.trim() || '',
        totalPrice: getCustomFeatureTotal(feature),
        isRetired: true,
      });
    });

    return cards;
  }, [groupedFeatures, normalizedGroupedOptions]);

  const syncFeatures = (
    nextManualFeatures: CustomFeature[],
    nextGroupedFeatures: CustomFeature[] = groupedFeatures
  ) => {
    onChange(
      normalizeCustomFeatures({
        features: [...nextGroupedFeatures, ...nextManualFeatures],
      })
    );
  };

  const safeRetailPrice = Number.isFinite(retailPrice) ? (retailPrice as number) : 0;
  const negativeAdjustmentTotal = normalizedData.features.reduce((sum, feature) => {
    const total = getCustomFeatureTotal(feature);
    return total < 0 ? sum + Math.abs(total) : sum;
  }, 0);
  const showAdjustmentWarning = safeRetailPrice > 0 && negativeAdjustmentTotal > safeRetailPrice * 0.18;

  useEffect(() => {
    if (activeFeatureIndex !== null && activeFeatureIndex >= manualFeatures.length) {
      setActiveFeatureIndex(null);
    }
  }, [activeFeatureIndex, manualFeatures.length]);

  const addFeature = () => {
    if (manualFeatures.length >= maxManualFeatures) return;
    const nextManualFeatures = [
      ...manualFeatures,
      normalizeCustomFeature({
        name: '',
        description: '',
        laborCost: 0,
        materialCost: 0,
        totalCost: 0,
        isOffContract: false,
        source: 'manual',
      }),
    ];
    syncFeatures(nextManualFeatures);
    setActiveFeatureIndex(nextManualFeatures.length - 1);
  };

  const updateFeature = (index: number, field: keyof CustomFeature, value: any) => {
    const nextManualFeatures = manualFeatures.map((feature, featureIndex) =>
      featureIndex === index ? normalizeCustomFeature({ ...feature, [field]: value, source: 'manual' }) : feature
    );
    syncFeatures(nextManualFeatures);
  };

  const removeFeature = (index: number) => {
    const nextManualFeatures = manualFeatures.filter((_, featureIndex) => featureIndex !== index);
    syncFeatures(nextManualFeatures);
    setActiveFeatureIndex(null);
  };

  const toggleGroupedFeature = (option: GroupedFeatureCard) => {
    const selected = groupedSelectionMap.get(option.id);
    if (selected) {
      const nextGroupedFeatures = groupedFeatures.filter(
        (feature, index) => getGroupedFeatureKey(feature, index) !== option.id
      );
      syncFeatures(manualFeatures, nextGroupedFeatures);
      return;
    }

    const nextGroupedFeatures = [
      ...groupedFeatures,
      normalizeCustomFeature({
        source: 'grouped',
        groupedOptionId: option.id,
        name: option.name,
        description: option.description,
        totalCost: option.totalPrice,
        laborCost: 0,
        materialCost: 0,
        isOffContract: false,
      }),
    ];
    syncFeatures(manualFeatures, nextGroupedFeatures);
  };

  const updateGroupedFeatureOffContract = (optionId: string, isOffContract: boolean) => {
    const nextGroupedFeatures = groupedFeatures.map((feature, index) =>
      getGroupedFeatureKey(feature, index) === optionId
        ? normalizeCustomFeature({ ...feature, isOffContract, source: 'grouped' })
        : feature
    );
    syncFeatures(manualFeatures, nextGroupedFeatures);
  };

  return (
    <div className="section-form">
      <div className="form-help" style={{ marginBottom: '1.5rem', fontStyle: 'italic' }}>
        Use grouped feature presets from the active pricing model or add up to 7 manual custom features for one-off
        work.
      </div>

      {showAdjustmentWarning && (
        <div className="custom-features-warning">Warning: over 18% threshold</div>
      )}

      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Grouped Features</h2>
        </div>

        {groupedFeatureCards.length === 0 ? (
          <div className="empty-message">No grouped custom features are configured in the active pricing model.</div>
        ) : (
          <div className="custom-feature-group-grid">
            {groupedFeatureCards.map((option) => {
              const selectedFeature = groupedSelectionMap.get(option.id);
              const isSelected = Boolean(selectedFeature);
              const isOffContract = Boolean(selectedFeature?.isOffContract);

              return (
                <div
                  key={option.id}
                  className={`custom-feature-group-card${isSelected ? ' active' : ''}${
                    isOffContract ? ' off-contract' : ''
                  }${option.isRetired ? ' retired' : ''}`}
                >
                  <div className="custom-feature-group-card__header">
                    <div>
                      <div className="custom-feature-group-card__title">{option.name || 'Untitled Grouped Feature'}</div>
                      <div className="custom-feature-group-card__status">
                        {isSelected ? (isOffContract ? 'Selected | Off Contract' : 'Selected') : 'Available'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className={`action-btn ${isSelected ? 'secondary' : ''}`}
                      onClick={() => toggleGroupedFeature(option)}
                    >
                      {isSelected ? 'Remove' : 'Select'}
                    </button>
                  </div>

                  <div className="custom-feature-group-card__description">
                    {option.description?.trim() || 'No description provided'}
                  </div>

                  <div className="custom-feature-group-card__footer">
                    {option.isRetired && (
                      <span className="info-pill">No longer in active pricing model</span>
                    )}
                    {isSelected && (
                      <label className="custom-option-toggle">
                        <input
                          type="checkbox"
                          checked={isOffContract}
                          onChange={(e) => updateGroupedFeatureOffContract(option.id, e.target.checked)}
                        />
                        <span>Mark as Off-Contract</span>
                      </label>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="spec-block custom-options-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Manual Custom Features</h2>
        </div>

        {manualFeatures.map((feature, index) => {
          const isEditing = activeFeatureIndex === index;
          const total = getCustomFeatureTotal(feature);
          const isOffContract = Boolean(feature.isOffContract);
          const subtitle = feature.description?.trim() || 'No description provided';
          const clippedSubtitle = subtitle.length > 120 ? `${subtitle.slice(0, 120)}...` : subtitle;

          return (
            <div key={`manual-feature-${index}`} className="spec-subcard" style={{ marginBottom: '1rem' }}>
              <div className="spec-subcard-header">
                <div>
                  <div className="spec-subcard-title">{feature.name?.trim() || `Custom Feature #${index + 1}`}</div>
                  {!isEditing && (
                    <>
                      <div className="spec-subcard-subtitle">{clippedSubtitle}</div>
                      <div className="spec-subcard-subtitle">
                        {isOffContract
                          ? `Off Contract | Total: ${formatCurrency(total)}`
                          : `Labor: ${formatCurrency(feature.laborCost)} | Material: ${formatCurrency(
                              feature.materialCost
                            )} | Total: ${formatCurrency(total)}`}
                      </div>
                    </>
                  )}
                </div>
                <div className="spec-subcard-actions stacked-actions">
                  {isEditing ? (
                    <div className="stacked-primary-actions custom-option-edit-actions">
                      <label className="custom-option-toggle">
                        <input
                          type="checkbox"
                          checked={isOffContract}
                          onChange={(e) => updateFeature(index, 'isOffContract', e.target.checked)}
                        />
                        <span>Mark as Off-Contract</span>
                      </label>
                      <button type="button" className="link-btn danger" onClick={() => removeFeature(index)}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="stacked-primary-actions">
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => setActiveFeatureIndex(index)}
                      >
                        Edit
                      </button>
                      <button type="button" className="link-btn danger" onClick={() => removeFeature(index)}>
                        Remove
                      </button>
                    </div>
                  )}
                  {!isEditing && manualFeatures.length < maxManualFeatures && (
                    <button type="button" className="link-btn small" onClick={addFeature}>
                      Add Another
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className="spec-field" style={{ marginTop: '12px' }}>
                  <div className="form-group">
                    <label className="form-label">Feature Name</label>
                    <input
                      type="text"
                      className="form-input"
                      value={feature.name}
                      onChange={(e) => updateFeature(index, 'name', e.target.value)}
                      placeholder="e.g., 16x16, turf, etc."
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-input"
                      value={feature.description}
                      onChange={(e) => updateFeature(index, 'description', e.target.value)}
                      placeholder="Description of the feature..."
                      rows={3}
                      style={{ resize: 'vertical' }}
                    />
                  </div>

                  {isOffContract ? (
                    <div className="form-row custom-option-single-cost-row">
                      <div className="form-group">
                        <label className="form-label">Total Cost</label>
                        <input
                          type="number"
                          className="form-input"
                          value={feature.totalCost || ''}
                          onChange={(e) => updateFeature(index, 'totalCost', e.target.value)}
                          onBlur={(e) => updateFeature(index, 'totalCost', toNumber(e.target.value))}
                          step="0.01"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Labor Cost</label>
                        <input
                          type="number"
                          className="form-input"
                          value={feature.laborCost || ''}
                          onChange={(e) => updateFeature(index, 'laborCost', e.target.value)}
                          onBlur={(e) => updateFeature(index, 'laborCost', toNumber(e.target.value))}
                          step="0.01"
                          placeholder="0"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Material Cost</label>
                        <input
                          type="number"
                          className="form-input"
                          value={feature.materialCost || ''}
                          onChange={(e) => updateFeature(index, 'materialCost', e.target.value)}
                          onBlur={(e) => updateFeature(index, 'materialCost', toNumber(e.target.value))}
                          step="0.01"
                          placeholder="0"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Total Cost (Auto)</label>
                        <input
                          type="text"
                          className="form-input"
                          value={formatCurrency(total)}
                          readOnly
                          style={{ backgroundColor: '#f0f0f0', cursor: 'not-allowed' }}
                        />
                      </div>
                    </div>
                  )}

                  <div
                    className="action-row"
                    style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}
                  >
                    <button type="button" className="action-btn" onClick={() => setActiveFeatureIndex(null)}>
                      Done
                    </button>
                    {manualFeatures.length < maxManualFeatures && (
                      <button type="button" className="action-btn secondary" onClick={addFeature}>
                        Add Another
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {manualFeatures.length === 0 && manualFeatures.length < maxManualFeatures && (
          <button type="button" className="btn btn-add" onClick={addFeature}>
            + Add Custom Feature
          </button>
        )}
        {manualFeatures.length > 0 && manualFeatures.length < maxManualFeatures && activeFeatureIndex === null && (
          <button type="button" className="btn btn-add" onClick={addFeature} style={{ marginTop: '0.75rem' }}>
            + Add Custom Feature
          </button>
        )}
      </div>

      {normalizedData.features.length > 0 && (
        <div
          className="cost-summary"
          style={{
            marginTop: '2rem',
            padding: '1rem',
            backgroundColor: '#f9fafb',
            borderRadius: '4px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
            <span>Total Custom Features:</span>
            <span>{formatCurrency(normalizedData.totalCost)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default CustomFeaturesSectionNew;
