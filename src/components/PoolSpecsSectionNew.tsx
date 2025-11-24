import { useEffect } from 'react';
import { PoolSpecs } from '../types/proposal-new';
import { CalculationModules } from '../services/pricingEngineComplete';
import pricingData from '../services/pricingData';
import './SectionStyles.css';

interface Props {
  data: PoolSpecs;
  onChange: (data: PoolSpecs) => void;
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

function PoolSpecsSectionNew({ data, onChange }: Props) {
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
  const hasSpa = data.spaType !== 'none';
  const isGuniteSpa = data.spaType === 'gunite';

  return (
    <div className="section-form">
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
                <small className="form-help">Matches FIBER sheet crane selection.</small>
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

            <div className="spec-grid-2" style={{ marginTop: '15px' }}>
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={data.hasTanningShelf}
                  onChange={(e) => handleChange('hasTanningShelf', e.target.checked)}
                />
                <span>Has Tanning Shelf</span>
              </label>
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

        {/* Fiberglass Spa Details */}
        {hasSpa && data.spaType === 'fiberglass' && (
          <div className="spec-grid-2" style={{ marginTop: '15px' }}>
            <div className="spec-field">
              <label className="spec-label required">Fiberglass Spa Model</label>
              <select
                className="compact-input"
                value={data.spaFiberglassModelName || ''}
                onChange={(e) => {
                  const model = pricingData.fiberglass.spaModels.find(m => m.name === e.target.value);
                  if (model) {
                    handleChange('spaFiberglassModelName', model.name);
                    handleChange('spaFiberglassModelPrice', model.price);
                  } else {
                    handleChange('spaFiberglassModelName', undefined);
                    handleChange('spaFiberglassModelPrice', undefined);
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

            <div className="spec-field">
              <label className="spec-label">Spa Price (auto)</label>
              <CompactInput
                type="text"
                value={data.spaFiberglassModelPrice ? `$${data.spaFiberglassModelPrice.toLocaleString()}` : '$0'}
                readOnly
              />
            </div>

            <label className="form-checkbox" style={{ gridColumn: '1 / span 2' }}>
              <input
                type="checkbox"
                checked={data.hasSpillover}
                onChange={(e) => handleChange('hasSpillover', e.target.checked)}
              />
              <span>Include Spillover (Fiberglass)</span>
            </label>
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

            <div className="spec-grid-3" style={{ marginTop: '15px' }}>
              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={data.hasSpillover}
                  onChange={(e) => handleChange('hasSpillover', e.target.checked)}
                />
                <span>Has Spillover</span>
              </label>

              <label className="form-checkbox">
                <input
                  type="checkbox"
                  checked={data.isRaisedSpa}
                  onChange={(e) => handleChange('isRaisedSpa', e.target.checked)}
                />
                <span>Raised Spa (+18")</span>
              </label>

              {data.isRaisedSpa && (
                <div className="spec-field">
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
              )}
            </div>
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

        <div className="spec-grid-2">
          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={data.hasSiltFence}
              onChange={(e) => handleChange('hasSiltFence', e.target.checked)}
            />
            <span>Silt Fence Required</span>
          </label>

          <label className="form-checkbox">
            <input
              type="checkbox"
              checked={data.hasAutomaticCover}
              onChange={(e) => handleChange('hasAutomaticCover', e.target.checked)}
            />
            <span>Automatic Cover</span>
          </label>
        </div>

      </div>
    </div>
  );
}

export default PoolSpecsSectionNew;
