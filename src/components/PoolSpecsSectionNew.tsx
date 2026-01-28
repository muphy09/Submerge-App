import { useEffect } from 'react';
import { CustomerInfo, PoolSpecs, TileCopingDecking } from '../types/proposal-new';
import { CalculationModules } from '../services/pricingEngineComplete';
import pricingData from '../services/pricingData';
import './SectionStyles.css';

interface Props {
  data: PoolSpecs;
  onChange: (data: PoolSpecs) => void;
  customerInfo: CustomerInfo;
  onChangeCustomerInfo: (info: CustomerInfo) => void;
  tileCopingDecking?: TileCopingDecking;
  onChangeTileCopingDecking?: (data: TileCopingDecking) => void;
  pricingModels?: { id: string; name: string; isDefault?: boolean }[];
  selectedPricingModelId?: string | null;
  selectedPricingModelName?: string | null;
  defaultPricingModelId?: string | null;
  onSelectPricingModel?: (id: string) => void;
  showStaleIndicator?: boolean;
}

// Helper component for compact inputs with inline unit labels
const CompactInput = ({
  type = 'number',
  value,
  onChange,
  unit,
  min,
  step,
  readOnly = false,
}: {
  type?: string;
  value: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  unit?: string;
  min?: string;
  step?: string;
  readOnly?: boolean;
}) => {
  // For number inputs with value 0, show as placeholder instead
  const displayValue = type === 'number' && value === 0 && !readOnly ? '' : value;
  const placeholder = type === 'number' && !readOnly ? '0' : undefined;

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
        placeholder={placeholder}
        style={readOnly ? { backgroundColor: '#f0f0f0', cursor: 'not-allowed' } : {}}
      />
      {unit && <span className="compact-input-unit">{unit}</span>}
    </div>
  );
};

function PoolSpecsSectionNew({
  data,
  onChange,
  customerInfo,
  onChangeCustomerInfo,
  tileCopingDecking,
  onChangeTileCopingDecking,
  pricingModels = [],
  selectedPricingModelId,
  selectedPricingModelName,
  defaultPricingModelId,
  onSelectPricingModel,
  showStaleIndicator,
  showRemovedIndicator,
}: Props) {
  const dropdownStyle = { width: '100%', height: '38px', padding: '6px 10px', lineHeight: '20px', boxSizing: 'border-box' as const };

  // Auto-calculate gallons and spa perimeter when relevant fields change
  useEffect(() => {
    const gallons = CalculationModules.Pool.calculateGallons(data);
    const spaPerimeter = CalculationModules.Pool.calculateSpaPerimeter(data);
    const surfaceFromDims =
      data.surfaceArea && data.surfaceArea > 0
        ? data.surfaceArea
        : CalculationModules.Pool.calculateSurfaceAreaFromDimensions(data);
    const perimeterFromDims =
      data.perimeter && data.perimeter > 0
        ? data.perimeter
        : data.maxLength && data.maxWidth
        ? Math.ceil((data.maxLength + data.maxWidth) * 2)
        : 0;

    if (
      gallons !== data.approximateGallons ||
      spaPerimeter !== data.spaPerimeter ||
      surfaceFromDims !== data.surfaceArea ||
      perimeterFromDims !== data.perimeter
    ) {
      onChange({
        ...data,
        surfaceArea: surfaceFromDims,
        perimeter: perimeterFromDims,
        approximateGallons: gallons,
        spaPerimeter: spaPerimeter,
      });
    }
  }, [
    data.poolType,
    data.fiberglassSize,
    data.surfaceArea,
    data.shallowDepth,
    data.endDepth,
    data.hasTanningShelf,
    data.spaType,
    data.spaLength,
    data.spaWidth,
    data.spaShape,
  ]);

  const handleChange = (field: keyof PoolSpecs, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const isFiberglass = data.poolType === 'fiberglass';
  const isGuniteSpa = data.spaType === 'gunite';
  const hasSpaDimensions = isGuniteSpa && data.spaLength > 0 && data.spaWidth > 0;
  const doubleBullnoseLnft = tileCopingDecking?.doubleBullnoseLnft ?? 0;
  const isDoubleBullnoseIncluded = doubleBullnoseLnft > 0;
  const doubleBullnoseDisabled = !hasSpaDimensions || !tileCopingDecking || !onChangeTileCopingDecking;
  const doubleBullnoseSelectValue = !doubleBullnoseDisabled && isDoubleBullnoseIncluded ? 'yes' : 'none';
  const spilloverSelectValue = data.hasSpillover ? 'yes' : 'none';
  const raisedSpaSelectValue = data.isRaisedSpa ? 'yes' : 'none';

  const handleDoubleBullnoseSelect = (value: string) => {
    if (doubleBullnoseDisabled || !tileCopingDecking || !onChangeTileCopingDecking) {
      return;
    }
    if (value === 'yes') {
      const spaPerimeter = CalculationModules.Pool.calculateSpaPerimeter(data);
      onChangeTileCopingDecking({ ...tileCopingDecking, doubleBullnoseLnft: spaPerimeter });
      return;
    }
    onChangeTileCopingDecking({ ...tileCopingDecking, doubleBullnoseLnft: 0 });
  };

  return (
    <div className="section-form">
      <div className="spec-block">
        <h2 className="spec-block-title">Pricing Information</h2>
        <div className="pricing-info-row">
          <div className="spec-field spec-full-width">
            <label className="spec-label">Pricing Model</label>
            <div className="pricing-model-select">
              <select
                value={selectedPricingModelId || ''}
                onChange={(e) => onSelectPricingModel && onSelectPricingModel(e.target.value)}
                className="compact-input"
              >
                {pricingModels.length === 0 && <option value="">No models</option>}
                {pricingModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} {model.isDefault ? '(Active)' : ''}
                  </option>
                ))}
              </select>
              <div
                className={`pricing-model-pill ${
                  showRemovedIndicator ? 'removed' : showStaleIndicator ? 'inactive' : ''
                }`}
              >
                <span className="pill-name">
                  {selectedPricingModelName || 'Unnamed model'}
                  {showRemovedIndicator &&
                    !(selectedPricingModelName || '').toLowerCase().includes('(removed)') &&
                    ' (Removed)'}
                </span>
                {selectedPricingModelId === defaultPricingModelId ? (
                  <span className="pill-default">Active</span>
                ) : (
                  <>
                    {showStaleIndicator && !showRemovedIndicator && <span className="pill-inactive">Inactive</span>}
                    {showRemovedIndicator && <span className="pill-removed">Removed</span>}
                  </>
                )}
              </div>
            </div>
            {showRemovedIndicator ? (
              <div className="pricing-model-warning">
                Warning: The Pricing Model that is being used no longer exists. Consider switching to a new Price Model
              </div>
            ) : (
              showStaleIndicator && (
                <div className="pricing-model-warning">
                  Pricing Warning: You have selected an alternate Pricing Model
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ==================== CUSTOMER INFORMATION ==================== */}
      <div className="spec-block">
        <h2 className="spec-block-title">Customer Information</h2>
        <div className="spec-grid-3">
          <div className="spec-field">
            <label className="spec-label required">Customer Name</label>
            <input
              type="text"
              className="compact-input"
              value={customerInfo.customerName || ''}
              onChange={(e) => onChangeCustomerInfo({ ...customerInfo, customerName: e.target.value })}
              placeholder="Enter customer name"
            />
          </div>
          <div className="spec-field">
            <label className="spec-label required">Customer City</label>
            <input
              type="text"
              className="compact-input"
              value={customerInfo.city || ''}
              onChange={(e) => onChangeCustomerInfo({ ...customerInfo, city: e.target.value })}
              placeholder="Enter city"
            />
          </div>
          <div className="spec-field">
            <label className="spec-label required">Customer State</label>
            <select
              className="compact-input"
              value={customerInfo.state || 'NC'}
              onChange={(e) =>
                onChangeCustomerInfo({ ...customerInfo, state: e.target.value === 'SC' ? 'SC' : 'NC' })
              }
            >
              <option value="NC">NC</option>
              <option value="SC">SC</option>
            </select>
          </div>
        </div>
      </div>

      {/* ==================== POOL DIMENSIONS BLOCK ==================== */}
      <div className="spec-block">
        <h2 className="spec-block-title">Pool Dimensions</h2>

        {/* Pool Type Button Selection */}
        <div className="pool-type-buttons">
          <button
            type="button"
            className={`pool-type-btn ${data.poolType === 'gunite' ? 'active' : ''}`}
            onClick={() => handleChange('poolType', 'gunite')}
          >
            Gunite (Custom)
          </button>
          <button
            type="button"
            className={`pool-type-btn ${data.poolType === 'fiberglass' ? 'active' : ''}`}
            onClick={() => handleChange('poolType', 'fiberglass')}
          >
            Fiberglass
          </button>
        </div>

        {/* Fiberglass Size & Model Selection */}
        {isFiberglass && (
          <>
            <div className="spec-grid-2">
              <div className="spec-field">
                <label className="spec-label required">Fiberglass Size</label>
                <select
                  className="compact-input"
                  value={data.fiberglassSize || ''}
                  onChange={(e) => handleChange('fiberglassSize', e.target.value)}
                >
                  <option value="">Select size</option>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                  <option value="crystite">Crystite</option>
                </select>
              </div>

              <div className="spec-field">
                <label className="spec-label">Fiberglass Model</label>
                <select
                  className="compact-input"
                  value={data.fiberglassModelName || ''}
                  onChange={(e) => {
                    const model = pricingData.fiberglass.models.find(m => m.name === e.target.value);
                    if (model) {
                      onChange({
                        ...data,
                        fiberglassModelName: model.name,
                        fiberglassModelPrice: model.price,
                        fiberglassPerimeter: model.perimeter,
                        fiberglassSize: model.size as any,
                        perimeter: model.perimeter || data.perimeter,
                      });
                    } else {
                      onChange({
                        ...data,
                        fiberglassModelName: undefined,
                        fiberglassModelPrice: undefined,
                        fiberglassPerimeter: undefined,
                      });
                    }
                  }}
                >
                  <option value="">Select model</option>
                  {pricingData.fiberglass.models
                    .filter(m => !data.fiberglassSize || m.size === data.fiberglassSize)
                    .map(model => (
                      <option key={model.name} value={model.name}>
                        {model.name} ({model.size}) - ${model.price.toLocaleString()}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <small className="form-help" style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '-10px', marginBottom: '15px', display: 'block' }}>
              Selecting a model will also set the perimeter from the spreadsheet.
            </small>

            <div className="spec-grid-2">
              <div className="spec-field">
                <label className="spec-label">Crane Option (Fiberglass)</label>
                <select
                  className="compact-input"
                  value={data.fiberglassCraneOption || 'no-crane'}
                  onChange={(e) => handleChange('fiberglassCraneOption', e.target.value)}
                >
                  <option value="no-crane">No Crane</option>
                  <option value="crane-small">Crane - Small</option>
                  <option value="crane-medium">Crane - Medium</option>
                  <option value="crane-large">Crane - Large</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Gunite Pool Dimensions */}
        {!isFiberglass && (
          <>
            <div className="spec-grid-4">
              <div className="spec-field">
                <label className="spec-label required">Perimeter</label>
                <CompactInput
                  value={data.perimeter}
                  onChange={(e) => handleChange('perimeter', parseFloat(e.target.value) || 0)}
                  unit="ft"
                  min="0"
                  step="1"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label required">Surface Area</label>
                <CompactInput
                  value={data.surfaceArea}
                  onChange={(e) => handleChange('surfaceArea', parseFloat(e.target.value) || 0)}
                  unit="ft"
                  min="0"
                  step="1"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label required">Shallow Depth</label>
                <CompactInput
                  value={data.shallowDepth}
                  onChange={(e) => handleChange('shallowDepth', parseFloat(e.target.value) || 0)}
                  unit="ft"
                  min="0"
                  step="0.5"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label required">End Depth</label>
                <CompactInput
                  value={data.endDepth}
                  onChange={(e) => handleChange('endDepth', parseFloat(e.target.value) || 0)}
                  unit="ft"
                  min="0"
                  step="0.5"
                />
              </div>
            </div>

            <div className="spec-grid-4">
              <div className="spec-field">
                <label className="spec-label">Max Width</label>
                <CompactInput
                  value={data.maxWidth}
                  onChange={(e) => handleChange('maxWidth', parseFloat(e.target.value) || 0)}
                  unit="ft"
                  min="0"
                  step="0.5"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label">Max Length</label>
                <CompactInput
                  value={data.maxLength}
                  onChange={(e) => handleChange('maxLength', parseFloat(e.target.value) || 0)}
                  unit="ft"
                  min="0"
                  step="0.5"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label">Total Steps & Bench</label>
                <CompactInput
                  value={data.totalStepsAndBench}
                  onChange={(e) => handleChange('totalStepsAndBench', parseFloat(e.target.value) || 0)}
                  unit="ft"
                  min="0"
                  step="1"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label">Decking Area</label>
                <CompactInput
                  value={data.deckingArea}
                  onChange={(e) => handleChange('deckingArea', parseFloat(e.target.value) || 0)}
                  unit="ft"
                  min="0"
                  step="1"
                />
              </div>
            </div>

          </>
        )}

        {/* Calculated Gallons - shown for both pool types */}
        {(isFiberglass || data.poolType === 'gunite') && (
          <div className="spec-grid-2" style={{ marginTop: '0' }}>
            <div className="spec-field">
              <label className="spec-label">Approximate Gallons (Auto-calculated)</label>
              <CompactInput
                type="text"
                value={data.approximateGallons.toLocaleString()}
                unit="gal"
                readOnly
              />
            </div>
          </div>
        )}
      </div>

      {/* ==================== SPA BLOCK ==================== */}
      <div className="spec-block">
        <h2 className="spec-block-title">Spa</h2>

        {/* Spa Type Button Selection */}
        <div className="pool-type-buttons">
          <button
            type="button"
            className={`pool-type-btn ${data.spaType === 'none' ? 'active' : ''}`}
            onClick={() => handleChange('spaType', 'none')}
          >
            No Spa
          </button>
          <button
            type="button"
            className={`pool-type-btn ${data.spaType === 'gunite' ? 'active' : ''}`}
            onClick={() => handleChange('spaType', 'gunite')}
          >
            Gunite (Custom)
          </button>
          <button
            type="button"
            className={`pool-type-btn ${data.spaType === 'fiberglass' ? 'active' : ''}`}
            onClick={() =>
              handleChange('spaType', 'fiberglass')
            }
          >
            Fiberglass Spa
          </button>
        </div>

        {/* Fiberglass Spa Details */}
        {data.spaType === 'fiberglass' && (
          <>
            <div className="spec-grid-2" style={{ marginTop: '15px' }}>
              <div className="spec-field">
                <label className="spec-label required">Fiberglass Spa Model</label>
                <select
                  className="compact-input"
                  value={data.spaFiberglassModelName || ''}
                  onChange={(e) => {
                    const model = pricingData.fiberglass.spaModels.find(m => m.name === e.target.value);
                    if (model) {
                      onChange({
                        ...data,
                        spaFiberglassModelName: model.name,
                        spaFiberglassModelPrice: model.price,
                      });
                    } else {
                      onChange({
                        ...data,
                        spaFiberglassModelName: undefined,
                        spaFiberglassModelPrice: undefined,
                      });
                    }
                  }}
                >
                  <option value="">Select model</option>
                  {pricingData.fiberglass.spaModels.map(model => (
                    <option key={model.name} value={model.name}>
                      {model.name} - ${model.price.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="spec-grid-2" style={{ marginTop: '15px' }}>
              <div className="spec-field">
                <label className="spec-label">Double Bullnose</label>
                <select
                  className="compact-input"
                  value={doubleBullnoseSelectValue}
                  onChange={(e) => handleDoubleBullnoseSelect(e.target.value)}
                  disabled={doubleBullnoseDisabled}
                >
                  <option value="none">None</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
              <div className="spec-field">
                <label className="spec-label">Spillover</label>
                <select
                  className="compact-input"
                  value={spilloverSelectValue}
                  onChange={(e) => handleChange('hasSpillover', e.target.value === 'yes')}
                >
                  <option value="none">None</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Gunite Spa Details */}
        {isGuniteSpa && (
          <>
            <div className="spec-grid-4">
              <div className="spec-field">
                <label className="spec-label required">Spa Length</label>
                <CompactInput
                  value={data.spaLength}
                  onChange={(e) => handleChange('spaLength', parseFloat(e.target.value) || 0)}
                  unit="ft"
                  min="0"
                  step="0.5"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label required">Spa Width</label>
                <CompactInput
                  value={data.spaWidth}
                  onChange={(e) => handleChange('spaWidth', parseFloat(e.target.value) || 0)}
                  unit="ft"
                  min="0"
                  step="0.5"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label">Spa Shape</label>
                <select
                  className="compact-input"
                  value={data.spaShape}
                  onChange={(e) => handleChange('spaShape', e.target.value)}
                >
                  <option value="round">Round</option>
                  <option value="square">Square</option>
                </select>
              </div>
              <div className="spec-field">
                <label className="spec-label">Spa Perimeter</label>
                <CompactInput
                  type="text"
                  value={data.spaPerimeter}
                  unit="ft"
                  readOnly
                />
              </div>
            </div>

            <div className="spec-grid-3-fixed" style={{ marginTop: '15px' }}>
              <div className="spec-field">
                <label className="spec-label">Double Bullnose</label>
                <select
                  className="compact-input"
                  value={doubleBullnoseSelectValue}
                  onChange={(e) => handleDoubleBullnoseSelect(e.target.value)}
                  disabled={doubleBullnoseDisabled}
                >
                  <option value="none">None</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              <div className="spec-field">
                <label className="spec-label">Spillover</label>
                <select
                  className="compact-input"
                  value={spilloverSelectValue}
                  onChange={(e) => handleChange('hasSpillover', e.target.value === 'yes')}
                >
                  <option value="none">None</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              <div className="spec-field">
                <label className="spec-label">Raised Spa</label>
                <select
                  className="compact-input"
                  value={raisedSpaSelectValue}
                  onChange={(e) => handleChange('isRaisedSpa', e.target.value === 'yes')}
                >
                  <option value="none">None</option>
                  <option value="yes">Yes (+18")</option>
                </select>
              </div>
            </div>

            {data.isRaisedSpa && (
              <div className="spec-grid-3-fixed" style={{ marginTop: '10px' }}>
                <div className="spec-field spa-facing-field">
                  <label className="spec-label">Raised Spa Facing</label>
                  <select
                    className="compact-input"
                    value={data.raisedSpaFacing}
                    onChange={(e) => handleChange('raisedSpaFacing', e.target.value)}
                  >
                    <option value="none">None</option>
                    <option value="tile">Tile</option>
                    <option value="ledgestone">Ledgestone</option>
                    <option value="stacked-stone">Stacked Stone</option>
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ==================== TRAVEL BLOCK ==================== */}
      <div className="spec-block">
        <h2 className="spec-block-title">Travel</h2>

        <div className="spec-grid-2">
          <div className="spec-field">
            <label className="spec-label">Travel Distance</label>
            <CompactInput
              value={data.travelDistance}
              onChange={(e) => handleChange('travelDistance', parseFloat(e.target.value) || 0)}
              unit="mi"
              min="0"
              step="1"
            />
          </div>
          <div className="spec-field">
            <label className="spec-label">Pool to Street Distance</label>
            <select
              className="compact-input"
              style={dropdownStyle}
              value={data.poolToStreetDistance}
              onChange={(e) => handleChange('poolToStreetDistance', parseInt(e.target.value))}
            >
              <option value="0">Under 251 ft</option>
              <option value="1">251-300 ft</option>
              <option value="2">300-350 ft</option>
            </select>
          </div>
        </div>
      </div>

      {/* ==================== ADDITIONAL OPTIONS BLOCK ==================== */}
      <div className="spec-block">
        <h2 className="spec-block-title">Additional Options</h2>

        <div className="spec-grid-3">
          {[
            { key: 'hasSiltFence', label: 'Silt Fence Required' },
            { key: 'hasAutomaticCover', label: 'Automatic Cover' },
            { key: 'hasTanningShelf', label: 'Tanning Shelf' },
          ].map(option => (
            <div className="spec-field" key={option.key}>
              <div className="pool-type-buttons">
                <button
                  type="button"
                  className={`pool-type-btn ${(data as any)[option.key] ? 'active' : ''}`}
                  onClick={() => handleChange(option.key as keyof PoolSpecs, !(data as any)[option.key])}
                >
                  {option.label}
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default PoolSpecsSectionNew;
