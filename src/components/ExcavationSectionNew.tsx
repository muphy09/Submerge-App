import { useEffect, useState } from 'react';
import { Excavation, RBBLevel } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import {
  formatMasonryFacingLabel,
  getMasonryFacingOptions,
  normalizeMasonryFacingId,
  type MasonryFacingOption,
} from '../utils/masonryFacing';
import CustomOptionsSection from './CustomOptionsSection';
import './SectionStyles.css';

interface Props {
  data: Excavation;
  onChange: (data: Excavation) => void;
}

const defaultRBBLevel: RBBLevel = {
  height: 6,
  length: 0,
  facing: 'none',
  hasBacksideFacing: false,
};

const wallHeightOptions = [6, 12, 18, 24, 30, 36] as const;

// Compact input with inline units to mirror Pool Specifications styling
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

const formatNumber = (value: number) => {
  const num = Number(value) || 0;
  return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
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

const formatWallTitle = (
  label: string,
  level: RBBLevel,
  facingOptions: MasonryFacingOption[],
  includeBacksideFacing: boolean = false
) => {
  const parts = [`${formatNumber(level.height)}" ${label}`, `${formatNumber(level.length)} LNFT`];
  if (level.facing && level.facing !== 'none') {
    parts.push(formatMasonryFacingLabel(level.facing, facingOptions));
  }
  if (includeBacksideFacing && level.hasBacksideFacing) {
    parts.push('Backside Facing');
  }
  return parts.join(' | ');
};

const formatRBBTitle = (level: RBBLevel, facingOptions: MasonryFacingOption[]) =>
  formatWallTitle('RBB', level, facingOptions, true);

const formatExposedPoolWallTitle = (level: RBBLevel, facingOptions: MasonryFacingOption[]) =>
  formatWallTitle('Exposed Pool Wall', level, facingOptions);

const formatColumnsTitle = (columns: Excavation['columns'], facingOptions: MasonryFacingOption[]) => {
  const count = formatNumber(columns.count || 0);
  const parts = [
    `${count} ${columns.count === 1 ? 'Column' : 'Columns'}`,
    `${formatNumber(columns.width || 0)} FT W x ${formatNumber(columns.depth || 0)} FT D`,
    `${formatNumber(columns.height || 0)} FT H`,
  ];
  if (columns.facing && columns.facing !== 'none') {
    parts.push(formatMasonryFacingLabel(columns.facing, facingOptions));
  }
  return parts.join(' | ');
};

function ExcavationSectionNew({ data, onChange }: Props) {
  const [activeRBBIndex, setActiveRBBIndex] = useState<number | null>(null);
  const [activeExposedPoolWallIndex, setActiveExposedPoolWallIndex] = useState<number | null>(null);
  const [columnsEditing, setColumnsEditing] = useState<boolean>(data.columns.count > 0);
  const [doubleCurtainActive, setDoubleCurtainActive] = useState<boolean>(data.doubleCurtainLength > 0);
  const [sitePrepActive, setSitePrepActive] = useState<boolean>(data.additionalSitePrepHours > 0);
  const rbbFacingOptions = getMasonryFacingOptions(pricingData.masonry, 'rbb');
  const retainingWallOptions = pricingData.masonry.retainingWalls.filter(
    (option: any) => option.name && option.name !== 'No Retaining Wall' && option.name !== 'None',
  );
  const defaultRetainingWallType =
    retainingWallOptions[0]?.name ||
    pricingData.masonry.retainingWalls[0]?.name ||
    'No Retaining Wall';
  const rbbLevels = data.rbbLevels ?? [];
  const exposedPoolWallLevels = data.exposedPoolWallLevels ?? [];
  const retainingWalls = data.retainingWalls ?? [];
  const retainingActive = retainingWalls.length > 0;

  useEffect(() => {
    if (rbbLevels.length === 0) {
      setActiveRBBIndex(null);
    }
  }, [rbbLevels.length]);

  useEffect(() => {
    if (exposedPoolWallLevels.length === 0) {
      setActiveExposedPoolWallIndex(null);
    }
  }, [exposedPoolWallLevels.length]);

  useEffect(() => {
    if (data.doubleCurtainLength > 0 && !doubleCurtainActive) {
      setDoubleCurtainActive(true);
    }
  }, [data.doubleCurtainLength, doubleCurtainActive]);

  useEffect(() => {
    if (data.additionalSitePrepHours > 0 && !sitePrepActive) {
      setSitePrepActive(true);
    }
  }, [data.additionalSitePrepHours, sitePrepActive]);

  useEffect(() => {
    const hasLegacySelection =
      (data.retainingWallType &&
        data.retainingWallType !== 'None' &&
        data.retainingWallType !== 'No Retaining Wall') ||
      (data.retainingWallLength ?? 0) > 0;
    if ((!data.retainingWalls || data.retainingWalls.length === 0) && hasLegacySelection) {
      const legacyType =
        data.retainingWallType &&
        data.retainingWallType !== 'None' &&
        data.retainingWallType !== 'No Retaining Wall'
          ? data.retainingWallType
          : defaultRetainingWallType;
      setRetainingWalls([{ type: legacyType, length: data.retainingWallLength ?? 0 }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.retainingWallType, data.retainingWallLength, data.retainingWalls?.length, defaultRetainingWallType]);

  const handleChange = (field: keyof Excavation, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const setWallLevels = (field: 'rbbLevels' | 'exposedPoolWallLevels', levels: RBBLevel[]) => {
    handleChange(field, levels);
  };

  const updateWallLevel = (
    wallField: 'rbbLevels' | 'exposedPoolWallLevels',
    levels: RBBLevel[],
    index: number,
    field: keyof RBBLevel,
    value: any
  ) => {
    const updated = [...levels];
    const nextValue = field === 'facing' ? normalizeMasonryFacingId(String(value)) || 'none' : value;
    const nextLevel = { ...updated[index], [field]: nextValue };
    if (field === 'facing' && nextValue === 'none') {
      nextLevel.hasBacksideFacing = false;
    }
    updated[index] = nextLevel;
    setWallLevels(wallField, updated);
  };

  const removeWallLevel = (
    wallField: 'rbbLevels' | 'exposedPoolWallLevels',
    levels: RBBLevel[],
    index: number,
    setActive: (value: number | null) => void
  ) => {
    const updated = levels.filter((_, i) => i !== index);
    setWallLevels(wallField, updated);
    setActive(null);
  };

  const startWallFlow = (
    wallField: 'rbbLevels' | 'exposedPoolWallLevels',
    levels: RBBLevel[],
    setActive: (value: number | null) => void
  ) => {
    if (levels.length === 0) {
      setWallLevels(wallField, [{ ...defaultRBBLevel }]);
      setActive(0);
    } else {
      setActive(levels.length - 1);
    }
  };

  const addWallLevel = (
    wallField: 'rbbLevels' | 'exposedPoolWallLevels',
    levels: RBBLevel[],
    setActive: (value: number | null) => void
  ) => {
    const updated = [...levels, { ...defaultRBBLevel }];
    setWallLevels(wallField, updated);
    setActive(updated.length - 1);
  };

  const clearWallLevels = (
    wallField: 'rbbLevels' | 'exposedPoolWallLevels',
    setActive: (value: number | null) => void
  ) => {
    setWallLevels(wallField, []);
    setActive(null);
  };

  const hasRBB = rbbLevels.length > 0;
  const hasExposedPoolWall = exposedPoolWallLevels.length > 0;

  const columnsActive = data.columns.count > 0 || columnsEditing;

  const handleNoColumns = () => {
    handleChange('columns', { ...data.columns, count: 0, width: 0, depth: 0, height: 0 });
    setColumnsEditing(false);
  };

  const openColumns = () => {
    const nextCount = data.columns.count > 0 ? data.columns.count : 1;
    handleChange('columns', { ...data.columns, count: nextCount });
    setColumnsEditing(true);
  };

  const addAnotherColumn = () => {
    const nextCount = (data.columns.count || 0) + 1;
    handleChange('columns', { ...data.columns, count: nextCount });
  };

  const setRetainingWalls = (walls: { type: string; length: number }[]) => {
    const primary = walls[0];
    onChange({
      ...data,
      retainingWalls: walls,
      retainingWallType: primary?.type ?? 'No Retaining Wall',
      retainingWallLength: primary?.length ?? 0,
    });
  };

  const handleRetainingToggle = (enabled: boolean) => {
    if (enabled) {
      if (retainingWalls.length === 0) {
        const nextType =
          data.retainingWallType &&
          data.retainingWallType !== 'None' &&
          data.retainingWallType !== 'No Retaining Wall'
            ? data.retainingWallType
            : defaultRetainingWallType;
        setRetainingWalls([{ type: nextType, length: data.retainingWallLength ?? 0 }]);
      }
      return;
    }
    setRetainingWalls([]);
  };

  const addRetainingWall = () => {
    setRetainingWalls([...retainingWalls, { type: defaultRetainingWallType, length: 0 }]);
  };

  const removeRetainingWall = (index: number) => {
    const next = retainingWalls.filter((_, i) => i !== index);
    setRetainingWalls(next);
  };

  const updateRetainingWall = (index: number, field: 'type' | 'length', value: any) => {
    const updated = [...retainingWalls];
    updated[index] = { ...updated[index], [field]: value };
    setRetainingWalls(updated);
  };

  const toggleDoubleCurtain = () => {
    const next = !doubleCurtainActive;
    setDoubleCurtainActive(next);
    if (!next) {
      handleChange('doubleCurtainLength', 0);
    }
  };

  const toggleSitePrep = () => {
    const next = !sitePrepActive;
    setSitePrepActive(next);
    if (!next) {
      handleChange('additionalSitePrepHours', 0);
    }
  };

  const gravelSelected = data.hasGravelInstall;
  const dirtSelected = data.hasDirtHaul;
  const soilSelected = data.needsSoilSampleEngineer;
  const hasDoubleCurtain = doubleCurtainActive;

  return (
    <div className="section-form">
      {/* ==================== RBB BLOCK ==================== */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Raised Bond Beam (RBB)</h2>
          <p className="spec-block-subtitle">Add Raised Bond Beams to the project.</p>
        </div>

        <div className="pool-type-buttons stackable">
          <button
            type="button"
            className={`pool-type-btn ${!hasRBB ? 'active' : ''}`}
            onClick={() => clearWallLevels('rbbLevels', setActiveRBBIndex)}
          >
            No RBB
          </button>
          <button
            type="button"
            className={`pool-type-btn ${hasRBB ? 'active' : ''}`}
            onClick={() => startWallFlow('rbbLevels', rbbLevels, setActiveRBBIndex)}
          >
            Add RBB
          </button>
        </div>

        {hasRBB ? (
          <>
            {rbbLevels.map((level, index) => {
              const isEditing = activeRBBIndex === index;
              return (
                <div key={index} className="spec-subcard">
                  <div className="spec-subcard-header">
                    <div>
                      <div className="spec-subcard-title">{formatRBBTitle(level, rbbFacingOptions)}</div>
                      {!isEditing && <div className="spec-subcard-subtitle">RBB #{index + 1}</div>}
                    </div>
                    <div className="spec-subcard-actions stacked-actions">
                      <div className="stacked-primary-actions">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setActiveRBBIndex(isEditing ? null : index)}
                        >
                          {isEditing ? 'Collapse' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => removeWallLevel('rbbLevels', rbbLevels, index, setActiveRBBIndex)}
                        >
                          Remove
                        </button>
                      </div>
                      {!isEditing && (
                        <button
                          type="button"
                          className="link-btn small"
                          onClick={() => addWallLevel('rbbLevels', rbbLevels, setActiveRBBIndex)}
                        >
                          Add Another
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <>
                      <div className="spec-grid-3">
                        <div className="spec-field">
                          <label className="spec-label">Height</label>
                          <select
                            className="compact-input"
                            value={level.height}
                            onChange={(e) =>
                              updateWallLevel('rbbLevels', rbbLevels, index, 'height', parseInt(e.target.value))
                            }
                          >
                            {wallHeightOptions.map((height) => (
                              <option key={height} value={height}>
                                {height}"
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="spec-field">
                          <label className="spec-label">Length</label>
                          <CompactInput
                            value={level.length}
                            onChange={(e) =>
                              updateWallLevel('rbbLevels', rbbLevels, index, 'length', parseFloat(e.target.value) || 0)
                            }
                            unit="LNFT"
                            min="0"
                            step="1"
                          />
                        </div>

                        <div className="spec-field">
                          <label className="spec-label">Facing</label>
                          <select
                            className="compact-input"
                            value={normalizeMasonryFacingId(level.facing) || 'none'}
                            onChange={(e) => updateWallLevel('rbbLevels', rbbLevels, index, 'facing', e.target.value)}
                          >
                            <option value="none">None</option>
                            {getFacingSelectOptions(rbbFacingOptions, level.facing).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                          <label
                            className="form-checkbox"
                            style={{ opacity: (normalizeMasonryFacingId(level.facing) || 'none') === 'none' ? 0.6 : 1 }}
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(level.hasBacksideFacing)}
                              disabled={(normalizeMasonryFacingId(level.facing) || 'none') === 'none'}
                              onChange={(e) =>
                                updateWallLevel(
                                  'rbbLevels',
                                  rbbLevels,
                                  index,
                                  'hasBacksideFacing',
                                  e.target.checked
                                )
                              }
                            />
                            <span>Add Backside Facing</span>
                          </label>
                        </div>
                      </div>

                      <div className="action-row">
                        <button type="button" className="action-btn" onClick={() => setActiveRBBIndex(null)}>
                          Done
                        </button>
                        <button
                          type="button"
                          className="action-btn secondary"
                          onClick={() => addWallLevel('rbbLevels', rbbLevels, setActiveRBBIndex)}
                        >
                          Add Another
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <div className="empty-message" style={{ marginTop: '10px' }}>
            No Raised Bond Beams
          </div>
        )}
      </div>

      {/* ==================== COLUMNS BLOCK ==================== */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Columns</h2>
          <p className="spec-block-subtitle">Add columns to the project.</p>
        </div>

        <div className="pool-type-buttons stackable">
          <button
            type="button"
            className={`pool-type-btn ${!columnsActive ? 'active' : ''}`}
            onClick={handleNoColumns}
          >
            No Column
          </button>
          <button
            type="button"
            className={`pool-type-btn ${columnsActive ? 'active' : ''}`}
            onClick={openColumns}
          >
            Add Column
          </button>
        </div>

        {columnsActive ? (
            <div className="spec-subcard">
              <div className="spec-subcard-header">
                <div>
                  <div className="spec-subcard-title">{formatColumnsTitle(data.columns, rbbFacingOptions)}</div>
                  {!columnsEditing && (
                    <div className="spec-subcard-subtitle">
                      {data.columns.count && data.columns.count > 0 ? 'Column #1' : 'Columns'}
                    </div>
                  )}
                </div>
                <div className="spec-subcard-actions stacked-actions">
                  <div className="stacked-primary-actions">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => setColumnsEditing(!columnsEditing)}
                    >
                      {columnsEditing ? 'Collapse' : 'Edit'}
                    </button>
                    <button type="button" className="link-btn danger" onClick={handleNoColumns}>
                      Clear
                    </button>
                  </div>
                  {!columnsEditing && (
                    <button type="button" className="link-btn small" onClick={addAnotherColumn}>
                      Add Another
                    </button>
                  )}
                </div>
              </div>

            {columnsEditing && (
              <>
                <div className="spec-grid-5-tight">
                  <div className="spec-field">
                    <label className="spec-label">Number of Columns</label>
                    <CompactInput
                      value={data.columns.count}
                      onChange={(e) =>
                        handleChange('columns', {
                          ...data.columns,
                          count: parseInt(e.target.value) || 0,
                        })
                      }
                      unit="qty"
                      min="0"
                      step="1"
                    />
                  </div>
                  <div className="spec-field">
                    <label className="spec-label">Width</label>
                    <CompactInput
                      value={data.columns.width}
                      onChange={(e) =>
                        handleChange('columns', {
                          ...data.columns,
                          width: parseFloat(e.target.value) || 0,
                        })
                      }
                      unit="ft"
                      min="0"
                      step="0.5"
                    />
                  </div>
                  <div className="spec-field">
                    <label className="spec-label">Depth</label>
                    <CompactInput
                      value={data.columns.depth}
                      onChange={(e) =>
                        handleChange('columns', {
                          ...data.columns,
                          depth: parseFloat(e.target.value) || 0,
                        })
                      }
                      unit="ft"
                      min="0"
                      step="0.5"
                    />
                  </div>
                  <div className="spec-field">
                    <label className="spec-label">Height</label>
                    <CompactInput
                      value={data.columns.height}
                      onChange={(e) =>
                        handleChange('columns', {
                          ...data.columns,
                          height: parseFloat(e.target.value) || 0,
                        })
                      }
                      unit="ft"
                      min="0"
                      step="0.5"
                    />
                  </div>
                  <div className="spec-field">
                    <label className="spec-label">Facing</label>
                    <select
                      className="compact-input"
                      value={normalizeMasonryFacingId(data.columns.facing) || 'none'}
                      onChange={(e) =>
                        handleChange('columns', {
                          ...data.columns,
                          facing: normalizeMasonryFacingId(e.target.value) || 'none',
                        })
                      }
                    >
                      <option value="none">None</option>
                      {getFacingSelectOptions(rbbFacingOptions, data.columns.facing).map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="action-row">
                  <button type="button" className="action-btn" onClick={() => setColumnsEditing(false)}>
                    Done
                  </button>
                  <button type="button" className="action-btn secondary" onClick={addAnotherColumn}>
                    Add Another
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="empty-message" style={{ marginTop: '10px' }}>
            No Columns
          </div>
        )}
      </div>

      {/* ==================== RETAINING WALL BLOCK ==================== */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Retaining Wall</h2>
          <p className="spec-block-subtitle">Add Retaining Walls to the project.</p>
        </div>

        <div className="pool-type-buttons stackable">
          <button
            type="button"
            className={`pool-type-btn ${!retainingActive ? 'active' : ''}`}
            onClick={() => handleRetainingToggle(false)}
          >
            No Retaining Wall
          </button>
            <button
              type="button"
              className={`pool-type-btn ${retainingActive ? 'active' : ''}`}
              onClick={() => handleRetainingToggle(true)}
            >
              Add Retaining Wall
            </button>
          </div>

        {retainingActive ? (
          <>
            {retainingWalls.map((wall, index) => (
              <div key={`retaining-wall-${index}`} className="spec-subcard">
                <div className="spec-subcard-header">
                  <div>
                    <div className="spec-subcard-title">{`Retaining Wall #${index + 1}`}</div>
                    <div className="spec-subcard-subtitle">
                      {wall.type || defaultRetainingWallType}
                      {wall.length ? ` | ${formatNumber(wall.length)} ft` : ''}
                    </div>
                  </div>
                  <div className="spec-subcard-actions stacked-actions">
                    <div className="stacked-primary-actions">
                      <button type="button" className="link-btn danger" onClick={() => removeRetainingWall(index)}>
                        Remove
                      </button>
                    </div>
                    {index === retainingWalls.length - 1 && (
                      <button type="button" className="link-btn small" onClick={addRetainingWall}>
                        Add Another
                      </button>
                    )}
                  </div>
                </div>
                <div className="spec-grid-2">
                  <div className="spec-field">
                    <label className="spec-label">Retaining Wall Type</label>
                    <select
                      className="compact-input"
                      value={wall.type || defaultRetainingWallType}
                      onChange={(e) => updateRetainingWall(index, 'type', e.target.value)}
                    >
                      {retainingWallOptions.map((opt: any) => (
                        <option key={opt.name} value={opt.name}>
                          {opt.name} {opt.costPerSqft > 0 ? `- $${opt.costPerSqft}/SQFT` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="spec-field">
                    <label className="spec-label">Retaining Wall Length</label>
                    <CompactInput
                      value={wall.length || 0}
                      onChange={(e) => updateRetainingWall(index, 'length', parseFloat(e.target.value) || 0)}
                      unit="ft"
                      min="0"
                      step="1"
                    />
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : (
          <div className="empty-message" style={{ marginTop: '10px' }}>
            No Retaining Wall
          </div>
        )}
      </div>

      {/* ==================== EXPOSED POOL WALL BLOCK ==================== */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Exposed Pool Wall (Out of Ground Forming)</h2>
          <p className="spec-block-subtitle">Add exposed pool wall forming to the project.</p>
        </div>

        <div className="pool-type-buttons stackable">
          <button
            type="button"
            className={`pool-type-btn ${!hasExposedPoolWall ? 'active' : ''}`}
            onClick={() => clearWallLevels('exposedPoolWallLevels', setActiveExposedPoolWallIndex)}
          >
            No Exposed Pool Wall
          </button>
          <button
            type="button"
            className={`pool-type-btn ${hasExposedPoolWall ? 'active' : ''}`}
            onClick={() =>
              startWallFlow('exposedPoolWallLevels', exposedPoolWallLevels, setActiveExposedPoolWallIndex)
            }
          >
            Add Exposed Pool Wall
          </button>
        </div>

        {hasExposedPoolWall ? (
          <>
            {exposedPoolWallLevels.map((level, index) => {
              const isEditing = activeExposedPoolWallIndex === index;
              return (
                <div key={`exposed-pool-wall-${index}`} className="spec-subcard">
                  <div className="spec-subcard-header">
                    <div>
                      <div className="spec-subcard-title">{formatExposedPoolWallTitle(level, rbbFacingOptions)}</div>
                      {!isEditing && (
                        <div className="spec-subcard-subtitle">Exposed Pool Wall #{index + 1}</div>
                      )}
                    </div>
                    <div className="spec-subcard-actions stacked-actions">
                      <div className="stacked-primary-actions">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setActiveExposedPoolWallIndex(isEditing ? null : index)}
                        >
                          {isEditing ? 'Collapse' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() =>
                            removeWallLevel(
                              'exposedPoolWallLevels',
                              exposedPoolWallLevels,
                              index,
                              setActiveExposedPoolWallIndex
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                      {!isEditing && (
                        <button
                          type="button"
                          className="link-btn small"
                          onClick={() =>
                            addWallLevel(
                              'exposedPoolWallLevels',
                              exposedPoolWallLevels,
                              setActiveExposedPoolWallIndex
                            )
                          }
                        >
                          Add Another
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <>
                      <div className="spec-grid-3">
                        <div className="spec-field">
                          <label className="spec-label">Height</label>
                          <select
                            className="compact-input"
                            value={level.height}
                            onChange={(e) =>
                              updateWallLevel(
                                'exposedPoolWallLevels',
                                exposedPoolWallLevels,
                                index,
                                'height',
                                parseInt(e.target.value)
                              )
                            }
                          >
                            {wallHeightOptions.map((height) => (
                              <option key={height} value={height}>
                                {height}"
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="spec-field">
                          <label className="spec-label">Length</label>
                          <CompactInput
                            value={level.length}
                            onChange={(e) =>
                              updateWallLevel(
                                'exposedPoolWallLevels',
                                exposedPoolWallLevels,
                                index,
                                'length',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            unit="LNFT"
                            min="0"
                            step="1"
                          />
                        </div>

                        <div className="spec-field">
                          <label className="spec-label">Facing</label>
                          <select
                            className="compact-input"
                            value={normalizeMasonryFacingId(level.facing) || 'none'}
                            onChange={(e) =>
                              updateWallLevel(
                                'exposedPoolWallLevels',
                                exposedPoolWallLevels,
                                index,
                                'facing',
                                e.target.value
                              )
                            }
                          >
                            <option value="none">None</option>
                            {getFacingSelectOptions(rbbFacingOptions, level.facing).map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="action-row">
                        <button
                          type="button"
                          className="action-btn"
                          onClick={() => setActiveExposedPoolWallIndex(null)}
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          className="action-btn secondary"
                          onClick={() =>
                            addWallLevel(
                              'exposedPoolWallLevels',
                              exposedPoolWallLevels,
                              setActiveExposedPoolWallIndex
                            )
                          }
                        >
                          Add Another
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </>
        ) : (
          <div className="empty-message" style={{ marginTop: '10px' }}>
            No Exposed Pool Wall
          </div>
        )}
      </div>

      {/* ==================== ADDITIONAL OPTIONS BLOCK ==================== */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Additional Options</h2>
          <p className="spec-block-subtitle">Gravel Install and Dirt Haul included by default.</p>
        </div>
        <div className="pool-type-buttons stackable" style={{ marginTop: '10px' }}>
          <button
            type="button"
            className={`pool-type-btn ${gravelSelected ? 'active' : ''}`}
            onClick={() => handleChange('hasGravelInstall', !data.hasGravelInstall)}
          >
            Gravel Install
          </button>
          <button
            type="button"
            className={`pool-type-btn ${dirtSelected ? 'active' : ''}`}
            onClick={() => handleChange('hasDirtHaul', !data.hasDirtHaul)}
          >
            Dirt Haul
          </button>
          <button
            type="button"
            className={`pool-type-btn ${soilSelected ? 'active' : ''}`}
            onClick={() => handleChange('needsSoilSampleEngineer', !data.needsSoilSampleEngineer)}
          >
            Soil Sample / Engineer
          </button>
        </div>

        <div className="pool-type-buttons stackable" style={{ marginTop: '10px' }}>
          <button
            type="button"
            className={`pool-type-btn ${hasDoubleCurtain ? 'active' : ''}`}
            onClick={toggleDoubleCurtain}
          >
            Double Curtain
          </button>
          <button
            type="button"
            className={`pool-type-btn ${sitePrepActive ? 'active' : ''}`}
            onClick={toggleSitePrep}
          >
            Additional Site Prep
          </button>
        </div>

        {hasDoubleCurtain && (
          <div className="spec-grid-2">
            <div className="spec-field">
              <label className="spec-label">Double Curtain Length</label>
              <CompactInput
                value={data.doubleCurtainLength}
                onChange={(e) => handleChange('doubleCurtainLength', parseFloat(e.target.value) || 0)}
                unit="ft"
                min="0"
                step="1"
              />
            </div>
          </div>
        )}

        {sitePrepActive && (
          <div className="spec-grid-2">
            <div className="spec-field">
              <label className="spec-label">Additional Site Prep</label>
              <CompactInput
                value={data.additionalSitePrepHours}
                onChange={(e) => handleChange('additionalSitePrepHours', parseFloat(e.target.value) || 0)}
                unit="hrs"
                min="0"
                step="0.5"
              />
            </div>
          </div>
        )}
      </div>

      <CustomOptionsSection
        data={data.customOptions || []}
        onChange={(customOptions) => handleChange('customOptions', customOptions)}
      />
    </div>
  );
}

export default ExcavationSectionNew;
