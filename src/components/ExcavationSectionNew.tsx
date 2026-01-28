import { useEffect, useState } from 'react';
import { Excavation, RBBLevel } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import './SectionStyles.css';

interface Props {
  data: Excavation;
  onChange: (data: Excavation) => void;
}

const defaultRBBLevel: RBBLevel = {
  height: 6,
  length: 0,
  facing: 'none',
};

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

const formatFacingLabel = (facing: RBBLevel['facing']) => {
  if (facing === 'panel-ledge') return 'Panel Ledge';
  if (facing === 'stacked-stone') return 'Stacked Stone';
  return facing === 'none' ? 'No Facing' : facing.charAt(0).toUpperCase() + facing.slice(1);
};

const formatNumber = (value: number) => {
  const num = Number(value) || 0;
  return Number.isInteger(num) ? num.toString() : num.toFixed(2).replace(/\.?0+$/, '');
};

const formatRBBTitle = (level: RBBLevel) => {
  const parts = [`${formatNumber(level.height)}" RBB`, `${formatNumber(level.length)} LNFT`];
  if (level.facing && level.facing !== 'none') {
    parts.push(formatFacingLabel(level.facing));
  }
  return parts.join(' | ');
};

const formatColumnsTitle = (columns: Excavation['columns']) => {
  const count = formatNumber(columns.count || 0);
  const parts = [
    `${count} ${columns.count === 1 ? 'Column' : 'Columns'}`,
    `${formatNumber(columns.width || 0)} FT W x ${formatNumber(columns.depth || 0)} FT D`,
    `${formatNumber(columns.height || 0)} FT H`,
  ];
  if (columns.facing && columns.facing !== 'none') {
    parts.push(formatFacingLabel(columns.facing as RBBLevel['facing']));
  }
  return parts.join(' | ');
};

function ExcavationSectionNew({ data, onChange }: Props) {
  const [activeRBBIndex, setActiveRBBIndex] = useState<number | null>(null);
  const [columnsEditing, setColumnsEditing] = useState<boolean>(data.columns.count > 0);
  const [doubleCurtainActive, setDoubleCurtainActive] = useState<boolean>(data.doubleCurtainLength > 0);
  const [sitePrepActive, setSitePrepActive] = useState<boolean>(data.additionalSitePrepHours > 0);
  const retainingWallOptions = pricingData.masonry.retainingWalls.filter(
    (option: any) => option.name && option.name !== 'No Retaining Wall' && option.name !== 'None',
  );
  const defaultRetainingWallType =
    retainingWallOptions[0]?.name ||
    pricingData.masonry.retainingWalls[0]?.name ||
    'No Retaining Wall';
  const retainingWalls = data.retainingWalls ?? [];
  const retainingActive = retainingWalls.length > 0;

  useEffect(() => {
    if (data.rbbLevels.length === 0) {
      setActiveRBBIndex(null);
    }
  }, [data.rbbLevels.length]);

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

  const updateRBBLevel = (index: number, field: keyof RBBLevel, value: any) => {
    const updated = [...data.rbbLevels];
    updated[index] = { ...updated[index], [field]: value };
    handleChange('rbbLevels', updated);
  };

  const removeRBBLevel = (index: number) => {
    const updated = data.rbbLevels.filter((_, i) => i !== index);
    handleChange('rbbLevels', updated);
    setActiveRBBIndex(null);
  };

  const startRBBFlow = () => {
    if (data.rbbLevels.length === 0) {
      handleChange('rbbLevels', [{ ...defaultRBBLevel }]);
      setActiveRBBIndex(0);
    } else {
      setActiveRBBIndex(data.rbbLevels.length - 1);
    }
  };

  const addRBBLevel = () => {
    const updated = [...data.rbbLevels, { ...defaultRBBLevel }];
    handleChange('rbbLevels', updated);
    setActiveRBBIndex(updated.length - 1);
  };

  const handleNoRBB = () => {
    handleChange('rbbLevels', []);
    setActiveRBBIndex(null);
  };

  const hasRBB = data.rbbLevels.length > 0;

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
            onClick={handleNoRBB}
          >
            No RBB
          </button>
          <button
            type="button"
            className={`pool-type-btn ${hasRBB ? 'active' : ''}`}
            onClick={startRBBFlow}
          >
            Add RBB
          </button>
        </div>

        {hasRBB ? (
          <>
            {data.rbbLevels.map((level, index) => {
              const isEditing = activeRBBIndex === index;
              return (
                <div key={index} className="spec-subcard">
                  <div className="spec-subcard-header">
                    <div>
                      <div className="spec-subcard-title">{formatRBBTitle(level)}</div>
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
                          onClick={() => removeRBBLevel(index)}
                        >
                          Remove
                        </button>
                      </div>
                      {!isEditing && (
                        <button type="button" className="link-btn small" onClick={addRBBLevel}>
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
                            onChange={(e) => updateRBBLevel(index, 'height', parseInt(e.target.value))}
                          >
                            <option value={6}>6"</option>
                            <option value={12}>12"</option>
                            <option value={18}>18"</option>
                            <option value={24}>24"</option>
                            <option value={30}>30"</option>
                            <option value={36}>36"</option>
                          </select>
                        </div>

                        <div className="spec-field">
                          <label className="spec-label">Length</label>
                          <CompactInput
                            value={level.length}
                            onChange={(e) => updateRBBLevel(index, 'length', parseFloat(e.target.value) || 0)}
                            unit="LNFT"
                            min="0"
                            step="1"
                          />
                        </div>

                        <div className="spec-field">
                          <label className="spec-label">Facing</label>
                          <select
                            className="compact-input"
                            value={level.facing}
                            onChange={(e) => updateRBBLevel(index, 'facing', e.target.value)}
                          >
                            <option value="none">None</option>
                            <option value="tile">Tile</option>
                            <option value="panel-ledge">Panel Ledge</option>
                            <option value="stacked-stone">Stacked Stone</option>
                          </select>
                        </div>
                      </div>

                      <div className="action-row">
                        <button type="button" className="action-btn" onClick={() => setActiveRBBIndex(null)}>
                          Done
                        </button>
                        <button type="button" className="action-btn secondary" onClick={addRBBLevel}>
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
                  <div className="spec-subcard-title">{formatColumnsTitle(data.columns)}</div>
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
                      value={data.columns.facing}
                      onChange={(e) => handleChange('columns', { ...data.columns, facing: e.target.value })}
                    >
                      <option value="none">None</option>
                      <option value="tile">Tile</option>
                      <option value="panel-ledge">Panel Ledge</option>
                      <option value="stacked-stone">Stacked Stone</option>
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
    </div>
  );
}

export default ExcavationSectionNew;
