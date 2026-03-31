import { useEffect } from 'react';
import { AdditionalDeckingSelection, TileCopingDecking } from '../types/proposal-new';
import {
  getAdditionalDeckingOption,
  getAdditionalDeckingSelections,
  getAdditionalDeckingOptions,
  getDeckingTypeFullLabel,
  withAdditionalDeckingSelections,
} from '../utils/decking';
import CustomOptionsSection from './CustomOptionsSection';
import './SectionStyles.css';

interface Props {
  data: TileCopingDecking;
  onChange: (data: TileCopingDecking) => void;
  isFiberglass: boolean;
  poolDeckingArea: number;
}

const CompactInput = ({
  type = 'number',
  value,
  onChange,
  unit,
  min,
  step,
  readOnly = false,
  placeholder,
}: {
  type?: string;
  value: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  unit?: string;
  min?: string;
  step?: string;
  readOnly?: boolean;
  placeholder?: string;
}) => {
  const displayValue = type === 'number' && value === 0 && !readOnly ? '' : value;
  const finalPlaceholder = placeholder ?? (type === 'number' ? '0' : undefined);

  return (
    <div className="compact-input-wrapper">
      <input
        type={type}
        className="compact-input"
        value={displayValue}
        onChange={onChange}
        min={min}
        step={step}
        readOnly={readOnly}
        placeholder={finalPlaceholder}
        style={readOnly ? { backgroundColor: '#f0f0f0', cursor: 'not-allowed' } : {}}
      />
      {unit && <span className="compact-input-unit">{unit}</span>}
    </div>
  );
};

const createEmptyAdditionalDeckingSelection = (): AdditionalDeckingSelection => ({
  deckingType: '',
  area: 0,
  isOffContract: false,
});

function TileCopingDeckingSectionNew({ data, onChange, isFiberglass, poolDeckingArea }: Props) {
  const showStoneRockwork = false;
  const isDeckingOffContract = Boolean(data.isDeckingOffContract);
  const additionalDeckingSelections = getAdditionalDeckingSelections(data);
  const displayedAdditionalDeckingSelections =
    additionalDeckingSelections.length > 0
      ? additionalDeckingSelections
      : [createEmptyAdditionalDeckingSelection()];
  const primaryAdditionalDeckingSelection = displayedAdditionalDeckingSelections[0];
  const canAddMoreDecking =
    additionalDeckingSelections.length > 0 &&
    additionalDeckingSelections.every((selection) => Boolean(selection.deckingType));
  const additionalDeckingOptions = (() => {
    const options = getAdditionalDeckingOptions();
    const selectedTypes = Array.from(
      new Set(displayedAdditionalDeckingSelections.map((selection) => selection.deckingType).filter(Boolean))
    );

    return selectedTypes.reduce((allOptions, deckingType) => {
      if (allOptions.some((option) => option.id === deckingType)) {
        return allOptions;
      }

      return [
        ...allOptions,
        {
          id: deckingType,
          label: getDeckingTypeFullLabel(deckingType),
          laborRate: getAdditionalDeckingOption(deckingType)?.laborRate ?? 0,
          materialRate: getAdditionalDeckingOption(deckingType)?.materialRate ?? 0,
          wasteNotIncluded: getAdditionalDeckingOption(deckingType)?.wasteNotIncluded ?? false,
        },
      ];
    }, options);
  })();
  const handleChange = (field: keyof TileCopingDecking, value: any) => {
    onChange({ ...data, [field]: value });
  };
  const handleDeckingOffContractChange = (enabled: boolean) => {
    onChange({
      ...data,
      isDeckingOffContract: enabled,
    });
  };
  const handleAdditionalDeckingSelectionsChange = (
    selections: Array<Partial<AdditionalDeckingSelection> | null>
  ) => {
    onChange(withAdditionalDeckingSelections(data, selections));
  };
  const handleAdditionalDeckingSelectionChange = (
    index: number,
    updates: Partial<AdditionalDeckingSelection>
  ) => {
    const nextSelections =
      additionalDeckingSelections.length > 0
        ? [...additionalDeckingSelections]
        : [createEmptyAdditionalDeckingSelection()];

    while (nextSelections.length <= index) {
      nextSelections.push(createEmptyAdditionalDeckingSelection());
    }

    const currentSelection = nextSelections[index] || createEmptyAdditionalDeckingSelection();
    const nextSelection = {
      ...currentSelection,
      ...updates,
    };

    if (!nextSelection.deckingType) {
      if (nextSelections.length === 1) {
        handleAdditionalDeckingSelectionsChange([]);
        return;
      }

      nextSelections.splice(index, 1);
      handleAdditionalDeckingSelectionsChange(nextSelections);
      return;
    }

    nextSelections[index] = nextSelection;
    handleAdditionalDeckingSelectionsChange(nextSelections);
  };
  const handleAddMoreDecking = () => {
    handleAdditionalDeckingSelectionsChange([
      ...additionalDeckingSelections,
      createEmptyAdditionalDeckingSelection(),
    ]);
  };
  const handleRemoveAdditionalDecking = (index: number) => {
    handleAdditionalDeckingSelectionsChange(
      additionalDeckingSelections.filter((_, selectionIndex) => selectionIndex !== index)
    );
  };

  // Prefill decking area from Pool Specifications when available and not set here yet
  useEffect(() => {
    if ((data.deckingArea ?? 0) <= 0 && poolDeckingArea > 0) {
      onChange({ ...data, deckingArea: poolDeckingArea });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolDeckingArea]);

  return (
    <div className="section-form">
      {/* Tile Section - Only for gunite pools */}
      {!isFiberglass && (
        <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Tile</h2>
        </div>

          <div className="spec-grid-3-fixed">
            <div className="spec-field">
              <label className="spec-label required">Tile Level</label>
              <select
                className="compact-input"
                value={data.tileLevel}
                onChange={(e) => handleChange('tileLevel', parseInt(e.target.value, 10))}
              >
                <option value={0}>No Tile</option>
                <option value={1}>Level 1</option>
                <option value={2}>Level 2</option>
                <option value={3}>Level 3</option>
              </select>
            </div>
            <div className="spec-field">
              <label className="spec-label">Additional Tile Length</label>
              <CompactInput
                value={data.additionalTileLength ?? 0}
                onChange={(e) => handleChange('additionalTileLength', parseFloat(e.target.value) || 0)}
                unit="LNFT"
                min="0"
                step="1"
              />
            </div>
            <div className="spec-field">
              <label className="spec-label">Trim Tile on Steps & Bench</label>
              <select
                className="compact-input"
                value={data.hasTrimTileOnSteps ? 'yes' : 'no'}
                onChange={(e) => handleChange('hasTrimTileOnSteps', e.target.value === 'yes')}
              >
                <option value="no">No Trim Tile</option>
                <option value="yes">Add Trim Tile</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Coping */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Coping</h2>
        </div>

        <div className="spec-grid-4-fixed">
          <div className="spec-field">
            <label className="spec-label required">Coping Type</label>
            <select
              className="compact-input"
              value={data.copingType}
              onChange={(e) => handleChange('copingType', e.target.value)}
            >
              <option value="none">No Coping</option>
              <option value="travertine-level1">Travertine - Level 1</option>
              <option value="travertine-level2">Travertine - Level 2</option>
              <option value="cantilever">Cantilever</option>
              <option value="flagstone">Flagstone</option>
              <option value="paver">Paver</option>
              <option value="concrete">Concrete</option>
            </select>
          </div>
          <div className="spec-field">
            <label className="spec-label">Coping Size</label>
            <select
              className="compact-input"
              value={data.copingSize ?? '12x12'}
              onChange={(e) => handleChange('copingSize', e.target.value)}
            >
              <option value="12x12">12x12</option>
              <option value="12x24">12x24</option>
              <option value="16x16">16x16</option>
            </select>
          </div>
          <div className="spec-field">
            <label className="spec-label">Bullnose</label>
            <CompactInput
              value={data.bullnoseLnft ?? 0}
              onChange={(e) => handleChange('bullnoseLnft', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
            />
          </div>

          <div className="spec-field">
            <label className="spec-label">Spillway Length</label>
            <CompactInput
              value={data.spillwayLnft ?? 0}
              onChange={(e) => handleChange('spillwayLnft', parseFloat(e.target.value) || 0)}
              unit="LNFT"
              min="0"
              step="1"
            />
          </div>
        </div>
      </div>

      {/* Decking */}
      <div className="spec-block">
        <div
          className="spec-block-header"
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}
        >
          <h2 className="spec-block-title" style={{ width: 'auto', margin: 0 }}>
            Decking
          </h2>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={isDeckingOffContract}
                onChange={(e) => handleDeckingOffContractChange(e.target.checked)}
              />
              <span>Mark as Off-Contract</span>
            </label>
            {canAddMoreDecking && (
              <button type="button" className="action-btn secondary" onClick={handleAddMoreDecking}>
                Add More Decking
              </button>
            )}
          </div>
        </div>

        <div className="spec-grid-4-fixed">
          <div className="spec-field">
            <label className="spec-label required">Decking Type</label>
            <select
              className="compact-input"
              value={data.deckingType}
              onChange={(e) => handleChange('deckingType', e.target.value)}
            >
              <option value="none">No Decking</option>
              <option value="travertine-level1">Travertine - Level 1</option>
              <option value="travertine-level2">Travertine - Level 2</option>
              <option value="travertine-level3">Travertine - Level 3</option>
              <option value="paver">Paver</option>
              <option value="concrete">Concrete</option>
            </select>
          </div>
          <div className="spec-field">
            <label className="spec-label">Additional Decking</label>
            <select
              className="compact-input"
              value={primaryAdditionalDeckingSelection.deckingType}
              onChange={(e) =>
                handleAdditionalDeckingSelectionChange(0, {
                  deckingType: e.target.value,
                  area: e.target.value ? primaryAdditionalDeckingSelection.area : 0,
                  isOffContract: e.target.value ? primaryAdditionalDeckingSelection.isOffContract : false,
                })
              }
            >
              <option value="">No Additional Decking</option>
              {additionalDeckingOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {primaryAdditionalDeckingSelection.deckingType && (
            <>
              <div className="spec-field">
                <label className="spec-label">Additional Decking SQFT</label>
                <CompactInput
                  value={primaryAdditionalDeckingSelection.area ?? 0}
                  onChange={(e) =>
                    handleAdditionalDeckingSelectionChange(0, {
                      area: parseFloat(e.target.value) || 0,
                    })
                  }
                  unit="SQFT"
                  min="0"
                  step="1"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label">Additional Off-Contract</label>
                <label className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(primaryAdditionalDeckingSelection.isOffContract)}
                    onChange={(e) =>
                      handleAdditionalDeckingSelectionChange(0, {
                        isOffContract: e.target.checked,
                      })
                    }
                  />
                  <span>Mark as Off-Contract</span>
                </label>
              </div>
            </>
          )}
        </div>

        {displayedAdditionalDeckingSelections.slice(1).map((selection, index) => {
          const selectionIndex = index + 1;
          return (
            <div
              key={`additional-decking-${selectionIndex}`}
              className="spec-grid-4-fixed"
              style={{ marginTop: '12px' }}
            >
              <div className="spec-field">
                <label className="spec-label">{`Additional Decking ${selectionIndex + 1}`}</label>
                <select
                  className="compact-input"
                  value={selection.deckingType}
                  onChange={(e) =>
                    handleAdditionalDeckingSelectionChange(selectionIndex, {
                      deckingType: e.target.value,
                      area: e.target.value ? selection.area : 0,
                      isOffContract: e.target.value ? selection.isOffContract : false,
                    })
                  }
                >
                  <option value="">No Additional Decking</option>
                  {additionalDeckingOptions.map((option) => (
                    <option key={`${selectionIndex}-${option.id}`} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="spec-field">
                <label className="spec-label">Additional Decking SQFT</label>
                <CompactInput
                  value={selection.area ?? 0}
                  onChange={(e) =>
                    handleAdditionalDeckingSelectionChange(selectionIndex, {
                      area: parseFloat(e.target.value) || 0,
                    })
                  }
                  unit="SQFT"
                  min="0"
                  step="1"
                  readOnly={!selection.deckingType}
                />
              </div>
              <div className="spec-field">
                <label className="spec-label">Additional Off-Contract</label>
                <label className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={Boolean(selection.isOffContract)}
                    disabled={!selection.deckingType}
                    onChange={(e) =>
                      handleAdditionalDeckingSelectionChange(selectionIndex, {
                        isOffContract: e.target.checked,
                      })
                    }
                  />
                  <span>Mark as Off-Contract</span>
                </label>
              </div>
              <div className="spec-field">
                <label className="spec-label">Remove Additional Decking</label>
                <button
                  type="button"
                  className="action-btn danger"
                  onClick={() => handleRemoveAdditionalDecking(selectionIndex)}
                >
                  Remove Row
                </button>
              </div>
            </div>
          );
        })}

        {data.deckingType === 'concrete' && (
          <div className="spec-grid">
            <div className="spec-field">
              <label className="spec-label">Concrete Steps Length</label>
              <CompactInput
                value={data.concreteStepsLength ?? 0}
                onChange={(e) => handleChange('concreteStepsLength', parseFloat(e.target.value) || 0)}
                unit="LNFT"
                min="0"
                step="1"
              />
            </div>
          </div>
        )}
      </div>

      {/* Stone / Rockwork - hidden for now */}
      {showStoneRockwork && (
        <div className="spec-block">
          <div className="spec-block-header">
            <h2 className="spec-block-title">Stone / Rockwork</h2>
          </div>

          <div className="spec-grid spec-grid-2">
            <div className="spec-field">
              <label className="spec-label">Panel Ledge Facing</label>
              <CompactInput
                value={data.rockworkPanelLedgeSqft ?? 0}
                onChange={(e) => handleChange('rockworkPanelLedgeSqft', parseFloat(e.target.value) || 0)}
                unit="SQFT"
                min="0"
                step="1"
              />
            </div>

            <div className="spec-field">
              <label className="spec-label">Panel Ledge Material</label>
              <CompactInput
                value={data.rockworkPanelLedgeMaterialSqft ?? 0}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  handleChange('rockworkPanelLedgeMaterialSqft', val > 0 ? val : undefined);
                }}
                unit="SQFT"
                min="0"
                step="0.01"
              />
            </div>

            <div className="spec-field">
              <label className="spec-label">Stacked Stone Facing</label>
              <CompactInput
                value={data.rockworkStackedStoneSqft ?? 0}
                onChange={(e) => handleChange('rockworkStackedStoneSqft', parseFloat(e.target.value) || 0)}
                unit="SQFT"
                min="0"
                step="1"
              />
            </div>

            <div className="spec-field">
              <label className="spec-label">Tile Facing</label>
              <CompactInput
                value={data.rockworkTileSqft ?? 0}
                onChange={(e) => handleChange('rockworkTileSqft', parseFloat(e.target.value) || 0)}
                unit="SQFT"
                min="0"
                step="1"
              />
            </div>
          </div>
        </div>
      )}

      {/* Options */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Options</h2>
        </div>

        <div className="pool-type-buttons" style={{ maxWidth: '360px' }}>
          <button
            type="button"
            className={`pool-type-btn ${data.hasRoughGrading ? 'active' : ''}`}
            onClick={() => handleChange('hasRoughGrading', !data.hasRoughGrading)}
          >
            Rough Grading
          </button>
        </div>
      </div>

      <CustomOptionsSection
        data={data.customOptions || []}
        onChange={(customOptions) => handleChange('customOptions', customOptions)}
      />
    </div>
  );
}

export default TileCopingDeckingSectionNew;
