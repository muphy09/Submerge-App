import { useEffect } from 'react';
import { CustomerInfo, PoolSpecs, TileCopingDecking } from '../types/proposal-new';
import { CalculationModules } from '../services/pricingEngineComplete';
import pricingData from '../services/pricingData';
import {
  formatMasonryFacingLabel,
  getMasonryFacingOptions,
  normalizeMasonryFacingId,
  type MasonryFacingOption,
} from '../utils/masonryFacing';
import {
  fiberglassSpaOptionSupportsSpillover,
  findFiberglassNamedOption,
  findFiberglassPoolModel,
  getFiberglassNamedOptions,
  getFiberglassPoolModelsBySize,
  normalizeFiberglassSize,
} from '../utils/fiberglass';
import './SectionStyles.css';

interface Props {
  data: PoolSpecs;
  onChange: (data: PoolSpecs) => void;
  customerInfo: CustomerInfo;
  onChangeCustomerInfo: (info: CustomerInfo) => void;
  tileCopingDecking?: TileCopingDecking;
  onChangeTileCopingDecking?: (data: TileCopingDecking) => void;
  disableSpaSelections?: boolean;
  disabledSpaMessage?: string;
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

const getFacingSelectOptions = (
  options: MasonryFacingOption[],
  currentValue?: string | null
): MasonryFacingOption[] => {
  const normalized = normalizeMasonryFacingId(currentValue);
  if (!normalized || normalized === 'none') {
    return options;
  }

  const hasMatch = options.some((option) => normalizeMasonryFacingId(option.id) === normalized);
  if (hasMatch) {
    return options;
  }

  return [
    ...options,
    {
      id: normalized,
      name: formatMasonryFacingLabel(currentValue, options),
      materialCost: 0,
      laborCost: 0,
    },
  ];
};

function PoolSpecsSectionNew({
  data,
  onChange,
  customerInfo,
  onChangeCustomerInfo,
  tileCopingDecking,
  onChangeTileCopingDecking,
  disableSpaSelections = false,
  disabledSpaMessage,
}: Props) {
  const dropdownStyle = { width: '100%', height: '38px', padding: '6px 10px', lineHeight: '20px', boxSizing: 'border-box' as const };
  const raisedSpaFacingOptions = getMasonryFacingOptions(pricingData.masonry, 'raisedSpa');

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
  const selectedFiberglassSize = normalizeFiberglassSize(data.fiberglassSize);
  const fiberglassPoolModels = selectedFiberglassSize
    ? getFiberglassPoolModelsBySize(selectedFiberglassSize)
    : [];
  const fiberglassSpaOptions = getFiberglassNamedOptions('spaOptions');
  const selectedFiberglassSpaOption =
    data.spaFiberglassModelName ? findFiberglassNamedOption('spaOptions', data.spaFiberglassModelName) : undefined;
  const fiberglassTanningOptions = getFiberglassNamedOptions('tanningLedgeOptions');
  const fiberglassFinishUpgrades = getFiberglassNamedOptions('finishUpgrades');
  const isGuniteSpa = data.spaType === 'gunite';
  const hasSpaDimensions = isGuniteSpa && data.spaLength > 0 && data.spaWidth > 0;
  const doubleBullnoseLnft = tileCopingDecking?.doubleBullnoseLnft ?? 0;
  const isDoubleBullnoseIncluded = doubleBullnoseLnft > 0;
  const doubleBullnoseDisabled = !hasSpaDimensions || !tileCopingDecking || !onChangeTileCopingDecking;
  const doubleBullnoseSelectValue = !doubleBullnoseDisabled && isDoubleBullnoseIncluded ? 'yes' : 'none';
  const spilloverSelectValue = data.hasSpillover ? 'yes' : 'none';
  const fiberglassSpaSpilloverUnavailable =
    Boolean(selectedFiberglassSpaOption) && !fiberglassSpaOptionSupportsSpillover(selectedFiberglassSpaOption);
  const fiberglassSpaSpilloverDisabled =
    data.spaType === 'fiberglass' && (!selectedFiberglassSpaOption || fiberglassSpaSpilloverUnavailable);
  const fiberglassSpaSpilloverDisabledMessage = !selectedFiberglassSpaOption
    ? 'Select a fiberglass spa option first'
    : 'Spillover is not available for this fiberglass spa option';
  const raisedSpaSelectValue = data.isRaisedSpa ? 'yes' : 'none';

  useEffect(() => {
    if (!isFiberglass || data.poolShape === 'geometric') return;
    onChange({ ...data, poolShape: 'geometric' });
  }, [data, isFiberglass, onChange]);

  useEffect(() => {
    if (data.spaType !== 'fiberglass' || !data.hasSpillover || !fiberglassSpaSpilloverUnavailable) return;
    onChange({ ...data, hasSpillover: false });
  }, [data, fiberglassSpaSpilloverUnavailable, onChange]);

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
      {/* ==================== CUSTOMER INFORMATION ==================== */}
      <div className="spec-block">
        <h2 className="spec-block-title">Customer Information</h2>
        <div className="spec-grid-3">
          <div className="spec-field spec-full-width">
            <label className="spec-label required">Job Site Address</label>
            <input
              type="text"
              className="compact-input"
              value={customerInfo.address || ''}
              onChange={(e) => onChangeCustomerInfo({ ...customerInfo, address: e.target.value })}
              placeholder="Enter street address"
            />
          </div>
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
            Shotcrete (Custom)
          </button>
          <button
            type="button"
            className={`pool-type-btn ${data.poolType === 'fiberglass' ? 'active' : ''}`}
            onClick={() => handleChange('poolType', 'fiberglass')}
          >
            Fiberglass
          </button>
        </div>

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
              unit="sqft"
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
              unit="sqft"
              min="0"
              step="1"
            />
          </div>
        </div>

        {isFiberglass && (
          <>
            <div className="spec-grid-2" style={{ marginTop: '15px' }}>
              <div className="spec-field">
                <label className="spec-label required">Fiberglass Size</label>
                <select
                  className="compact-input"
                  value={selectedFiberglassSize || ''}
                  onChange={(e) => {
                    const nextSize = normalizeFiberglassSize(e.target.value);
                    const nextModel =
                      nextSize && data.fiberglassModelName
                        ? findFiberglassPoolModel(data.fiberglassModelName, nextSize)
                        : undefined;
                    onChange({
                      ...data,
                      fiberglassSize: nextSize,
                      fiberglassModelName: nextModel ? data.fiberglassModelName : undefined,
                    });
                  }}
                >
                  <option value="">Select size</option>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
              <div className="spec-field">
                <label className="spec-label required">Fiberglass Model</label>
                <select
                  className="compact-input"
                  value={data.fiberglassModelName || ''}
                  onChange={(e) => handleChange('fiberglassModelName', e.target.value || undefined)}
                  disabled={!selectedFiberglassSize}
                  title={!selectedFiberglassSize ? 'Select a fiberglass size first' : undefined}
                >
                  <option value="">Select model</option>
                  {fiberglassPoolModels.map((model) => (
                    <option key={model.name} value={model.name}>
                      {model.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="spec-grid-2" style={{ marginTop: '15px' }}>
              <div className="spec-field">
                <label className="spec-label">Finish Upgrade</label>
                <select
                  className="compact-input"
                  value={data.fiberglassFinishUpgradeName || ''}
                  onChange={(e) => handleChange('fiberglassFinishUpgradeName', e.target.value || undefined)}
                >
                  <option value="">No Finish Upgrade</option>
                  {fiberglassFinishUpgrades.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="spec-field">
                <label className="spec-label">Crane Required</label>
                <select
                  className="compact-input"
                  value={data.needsFiberglassCrane ? 'yes' : 'no'}
                  onChange={(e) => handleChange('needsFiberglassCrane', e.target.value === 'yes')}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>

            <div className="spec-grid-2" style={{ marginTop: '15px' }}>
              <div className="spec-field">
                <label className="spec-label">Fiberglass Tanning Ledge</label>
                <select
                  className="compact-input"
                  value={data.fiberglassTanningLedgeName || ''}
                  onChange={(e) =>
                    onChange({
                      ...data,
                      fiberglassTanningLedgeName: e.target.value || undefined,
                      hasTanningShelf: Boolean(e.target.value),
                    })
                  }
                >
                  <option value="">No Tanning Ledge</option>
                  {fiberglassTanningOptions.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {!isFiberglass && (
          <div className="spec-grid-2" style={{ marginTop: '0' }}>
            <div className="spec-field">
              <label className="spec-label">Pool Shape</label>
              <div className="pool-type-buttons" style={{ marginBottom: 0 }}>
                <button
                  type="button"
                  className={`pool-type-btn ${data.poolShape === 'geometric' ? 'active' : ''}`}
                  onClick={() => handleChange('poolShape', 'geometric')}
                >
                  Geometric
                </button>
                <button
                  type="button"
                  className={`pool-type-btn ${data.poolShape === 'freeform' ? 'active' : ''}`}
                  onClick={() => handleChange('poolShape', 'freeform')}
                >
                  Freeform
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Calculated Gallons - shown for both pool types */}
        {(isFiberglass || data.poolType === 'gunite') && (
          <>
            <div className="spec-grid-2" style={{ marginTop: '15px' }}>
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
          </>
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
            className={`pool-type-btn ${data.spaType === 'gunite' ? 'active' : ''} ${disableSpaSelections ? 'disabled' : ''}`}
            onClick={() => {
              if (disableSpaSelections) return;
              handleChange('spaType', 'gunite');
            }}
            title={disableSpaSelections ? disabledSpaMessage : undefined}
            aria-disabled={disableSpaSelections}
          >
            Shotcrete (Custom)
          </button>
          <button
            type="button"
            className={`pool-type-btn ${data.spaType === 'fiberglass' ? 'active' : ''} ${disableSpaSelections ? 'disabled' : ''}`}
            onClick={() => {
              if (disableSpaSelections) return;
              handleChange('spaType', 'fiberglass');
            }}
            title={disableSpaSelections ? disabledSpaMessage : undefined}
            aria-disabled={disableSpaSelections}
          >
            Fiberglass Spa
          </button>
        </div>

        {/* Fiberglass Spa Details */}
        {data.spaType === 'fiberglass' && (
          <>
            <div className="spec-grid-2" style={{ marginTop: '15px' }}>
              <div className="spec-field">
                <label className="spec-label required">Fiberglass Spa Option</label>
                <select
                  className="compact-input"
                  value={data.spaFiberglassModelName || ''}
                  onChange={(e) => {
                    const nextValue = e.target.value || undefined;
                    onChange({
                      ...data,
                      spaFiberglassModelName: nextValue,
                      spaFiberglassModelPrice: undefined,
                    });
                  }}
                >
                  <option value="">Select model</option>
                  {fiberglassSpaOptions.map((option) => (
                    <option key={option.name} value={option.name}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="spec-grid-2" style={{ marginTop: '15px' }}>
              <div className="spec-field">
                <label className="spec-label">Spillover</label>
                <select
                  className="compact-input"
                  value={spilloverSelectValue}
                  disabled={fiberglassSpaSpilloverDisabled}
                  title={fiberglassSpaSpilloverDisabled ? fiberglassSpaSpilloverDisabledMessage : undefined}
                  onChange={(e) => handleChange('hasSpillover', e.target.value === 'yes')}
                >
                  <option value="none">None</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Shotcrete Spa Details */}
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
                    value={normalizeMasonryFacingId(data.raisedSpaFacing) || 'none'}
                    onChange={(e) => handleChange('raisedSpaFacing', normalizeMasonryFacingId(e.target.value) || 'none')}
                  >
                    <option value="none">None</option>
                    {getFacingSelectOptions(raisedSpaFacingOptions, data.raisedSpaFacing).map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
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
            ...(!isFiberglass ? [{ key: 'hasTanningShelf', label: 'Tanning Shelf' }] : []),
          ].map(option => (
            <div className="spec-field" key={option.key}>
              <div className={`pool-type-buttons ${option.key === 'hasAutomaticCover' ? 'auto-cover-toggle' : ''}`}>
                <button
                  type="button"
                  className={`pool-type-btn ${(data as any)[option.key] ? 'active' : ''}`}
                  onClick={() => handleChange(option.key as keyof PoolSpecs, !(data as any)[option.key])}
                >
                  {option.label}
                </button>
              </div>
              {option.key === 'hasAutomaticCover' && data.hasAutomaticCover && (
                <div className="auto-cover-input">
                  <label className="spec-label">Automatic Cover Manufacturer Cost (Forming is included)</label>
                  <CompactInput
                    value={data.automaticCoverManufacturerCost ?? 0}
                    onChange={(e) =>
                      handleChange('automaticCoverManufacturerCost', parseFloat(e.target.value) || 0)
                    }
                    unit="$"
                    min="0"
                    step="0.01"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default PoolSpecsSectionNew;
