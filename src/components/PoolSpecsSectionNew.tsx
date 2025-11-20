import { useEffect } from 'react';
import { PoolSpecs } from '../types/proposal-new';
import { CalculationModules } from '../services/pricingEngineComplete';
import pricingData from '../services/pricingData';
import './SectionStyles.css';

interface Props {
  data: PoolSpecs;
  onChange: (data: PoolSpecs) => void;
}

function PoolSpecsSectionNew({ data, onChange }: Props) {
  // Auto-calculate gallons and spa perimeter when relevant fields change
  useEffect(() => {
    const gallons = CalculationModules.Pool.calculateGallons(data);
    const spaPerimeter = CalculationModules.Pool.calculateSpaPerimeter(data);

    if (gallons !== data.approximateGallons || spaPerimeter !== data.spaPerimeter) {
      onChange({
        ...data,
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

  return (
    <div className="section-form">
      {/* Pool Type Selection */}
      <div className="form-group">
        <label className="form-label required">Pool Type</label>
        <select
          className="form-input"
          value={data.poolType}
          onChange={(e) => handleChange('poolType', e.target.value)}
        >
          <option value="gunite">Gunite (Custom)</option>
          <option value="fiberglass">Fiberglass</option>
        </select>
      </div>

      {/* Fiberglass Size Selection */}
      {isFiberglass && (
        <div className="form-group">
          <label className="form-label required">Fiberglass Size</label>
          <select
            className="form-input"
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
      )}

      {/* Fiberglass Model Selection */}
      {isFiberglass && (
        <div className="form-group">
          <label className="form-label">Fiberglass Model</label>
          <select
            className="form-input"
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
          <small className="form-help">Selecting a model will also set the perimeter from the spreadsheet.</small>
        </div>
      )}

      {/* Gunite Pool Dimensions */}
      {!isFiberglass && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Perimeter (LNFT)</label>
              <input
                type="number"
                className="form-input"
                value={data.perimeter}
                onChange={(e) => handleChange('perimeter', parseFloat(e.target.value) || 0)}
                min="0"
                step="1"
              />
            </div>
            <div className="form-group">
              <label className="form-label required">Surface Area (SQFT)</label>
              <input
                type="number"
                className="form-input"
                value={data.surfaceArea}
                onChange={(e) => handleChange('surfaceArea', parseFloat(e.target.value) || 0)}
                min="0"
                step="1"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Shallow Depth (FT)</label>
              <input
                type="number"
                className="form-input"
                value={data.shallowDepth}
                onChange={(e) => handleChange('shallowDepth', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
              />
            </div>
            <div className="form-group">
              <label className="form-label required">End Depth (FT)</label>
              <input
                type="number"
                className="form-input"
                value={data.endDepth}
                onChange={(e) => handleChange('endDepth', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Max Width (FT)</label>
              <input
                type="number"
                className="form-input"
                value={data.maxWidth}
                onChange={(e) => handleChange('maxWidth', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Max Length (FT)</label>
              <input
                type="number"
                className="form-input"
                value={data.maxLength}
                onChange={(e) => handleChange('maxLength', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
              />
            </div>
          </div>
        </>
      )}

      {/* Calculated Gallons (Read-only) */}
      <div className="form-group">
        <label className="form-label">Approximate Gallons (Auto-calculated)</label>
        <input
          type="text"
          className="form-input"
          value={data.approximateGallons.toLocaleString()}
          readOnly
          style={{ backgroundColor: '#f0f0f0', cursor: 'not-allowed' }}
        />
        <small className="form-help">This value is automatically calculated based on pool dimensions</small>
      </div>

      {/* Features */}
      {!isFiberglass && (
        <>
          <div className="form-group">
            <label className="form-label">Total Steps & Bench (LNFT)</label>
            <input
              type="number"
              className="form-input"
              value={data.totalStepsAndBench}
              onChange={(e) => handleChange('totalStepsAndBench', parseFloat(e.target.value) || 0)}
              min="0"
              step="1"
            />
            <small className="form-help">First 20 LNFT included, additional charged</small>
          </div>

          <div className="form-group">
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

      {/* Spa Configuration */}
      <h3>Spa</h3>
      <div className="form-group">
        <label className="form-label">Spa Type</label>
        <select
          className="form-input"
          value={data.spaType}
          onChange={(e) => handleChange('spaType', e.target.value)}
        >
          <option value="none">No Spa</option>
          <option value="fiberglass-small">Fiberglass - Small</option>
          <option value="fiberglass-medium">Fiberglass - Medium</option>
          <option value="fiberglass-large">Fiberglass - Large</option>
          <option value="crystite">Crystite</option>
          <option value="gunite">Gunite (Custom)</option>
        </select>
      </div>

      {hasSpa && data.poolType === 'fiberglass' && (
        <div className="form-group">
          <label className="form-label">Fiberglass Spa Model</label>
          <select
            className="form-input"
            value={data.fiberglassSpaModelName || ''}
            onChange={(e) => {
              const spa = pricingData.fiberglass.spas.find(s => s.name === e.target.value);
              onChange({
                ...data,
                fiberglassSpaModelName: spa?.name,
                fiberglassSpaPrice: spa?.price,
              });
            }}
          >
            <option value="">Select spa model</option>
            {pricingData.fiberglass.spas.map(spa => (
              <option key={spa.name} value={spa.name}>
                {spa.name} - ${spa.price.toLocaleString()}
              </option>
            ))}
          </select>
        </div>
      )}

      {hasSpa && data.spaType === 'gunite' && (
        <>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label required">Spa Length (FT)</label>
              <input
                type="number"
                className="form-input"
                value={data.spaLength}
                onChange={(e) => handleChange('spaLength', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
              />
            </div>
            <div className="form-group">
              <label className="form-label required">Spa Width (FT)</label>
              <input
                type="number"
                className="form-input"
                value={data.spaWidth}
                onChange={(e) => handleChange('spaWidth', parseFloat(e.target.value) || 0)}
                min="0"
                step="0.5"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Spa Shape</label>
            <select
              className="form-input"
              value={data.spaShape}
              onChange={(e) => handleChange('spaShape', e.target.value)}
            >
              <option value="round">Round</option>
              <option value="square">Square</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Spa Perimeter (Auto-calculated)</label>
            <input
              type="text"
              className="form-input"
              value={`${data.spaPerimeter} LNFT`}
              readOnly
              style={{ backgroundColor: '#f0f0f0', cursor: 'not-allowed' }}
            />
          </div>

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={data.isRaisedSpa}
                onChange={(e) => handleChange('isRaisedSpa', e.target.checked)}
              />
              <span>Raised Spa (+18")</span>
            </label>
          </div>

          {data.isRaisedSpa && (
            <div className="form-group">
              <label className="form-label">Raised Spa Facing</label>
              <select
                className="form-input"
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

          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={data.hasSpillover}
                onChange={(e) => handleChange('hasSpillover', e.target.checked)}
              />
              <span>Has Spillover</span>
            </label>
          </div>
        </>
      )}

      {/* Decking */}
      <h3>Decking & Travel</h3>
      <div className="form-group">
        <label className="form-label">Decking Area (SQFT)</label>
        <input
          type="number"
          className="form-input"
          value={data.deckingArea}
          onChange={(e) => handleChange('deckingArea', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Travel Distance (MILES)</label>
        <input
          type="number"
          className="form-input"
          value={data.travelDistance}
          onChange={(e) => handleChange('travelDistance', parseFloat(e.target.value) || 0)}
          min="0"
          step="1"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Pool to Street Distance</label>
        <select
          className="form-input"
          value={data.poolToStreetDistance}
          onChange={(e) => handleChange('poolToStreetDistance', parseInt(e.target.value))}
        >
          <option value="0">Under 251 ft</option>
          <option value="1">251-300 ft</option>
          <option value="2">300-350 ft</option>
        </select>
      </div>

      {/* Options */}
      <h3>Options</h3>
      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasSiltFence}
            onChange={(e) => handleChange('hasSiltFence', e.target.checked)}
          />
          <span>Silt Fence Required</span>
        </label>
      </div>

      <div className="form-group">
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
  );
}

export default PoolSpecsSectionNew;
