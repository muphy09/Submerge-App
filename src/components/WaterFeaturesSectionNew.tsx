import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { WaterFeatures, WaterFeatureSelection, PlumbingRuns } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import {
  flattenWaterFeatures,
  getWaterFeatureCogs,
  WATER_FEATURE_RUN_FIELDS,
  waterFeatureNeedsConduitRun,
  waterFeatureNeedsGasRun,
} from '../utils/waterFeatureCost';
import { TooltipAnchor } from './AppTooltip';
import CustomOptionsSection from './CustomOptionsSection';
import './SectionStyles.css';

interface Props {
  data: WaterFeatures;
  onChange: (data: WaterFeatures) => void;
  plumbingRuns: PlumbingRuns;
  onChangePlumbingRuns: (runs: Partial<PlumbingRuns>) => void;
  disabledReason?: string;
  packageWarningMessage?: string;
}

type WaterFeatureOption = {
  id: string;
  name: string;
  category: string;
  requiresConduit?: boolean;
  basePrice?: number;
  addCost1?: number;
  addCost2?: number;
  note?: string;
  needsPoolLight?: boolean;
};

type CategoryConfig = {
  title: string;
  subtitle: string;
  emptyLabel: string;
  noLabel: string;
  addLabel: string;
  itemLabel: string;
  typeLabel: string;
  options: WaterFeatureOption[];
  selections: WaterFeatureSelection[];
  runKeys: string[];
  activeIndex: number | null;
  setActiveIndex: Dispatch<SetStateAction<number | null>>;
  footer?: ReactNode;
};

const CompactInput = ({
  type = 'number',
  value,
  onChange,
  unit,
  min,
  step,
  placeholder,
}: {
  type?: string;
  value: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  unit?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) => {
  const displayValue = type === 'number' && value === 0 ? '' : value;
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
        placeholder={finalPlaceholder}
      />
      {unit && <span className="compact-input-unit">{unit}</span>}
    </div>
  );
};

const sortSheerOptions = (options: WaterFeatureOption[]) => {
  const parseSpan = (name: string) => {
    const matchInch = name.match(/(\d+)"?/);
    const matchFoot = name.match(/(\d+(?:\.\d+)?)'?/);
    if (matchInch) return parseFloat(matchInch[1]);
    if (matchFoot) return parseFloat(matchFoot[1]) * 12;
    return 0;
  };
  return [...options].sort((a, b) => parseSpan(a.name) - parseSpan(b.name));
};

const buildRunKeys = (prefix: string, selections: WaterFeatureSelection[]) => {
  const counts = new Map<string, number>();
  return selections.map((selection) => {
    const featureId = selection.featureId || 'unknown';
    const count = counts.get(featureId) ?? 0;
    counts.set(featureId, count + 1);
    return `${prefix}-${featureId}-${count}`;
  });
};

const isValveActuatorIncluded = (selection?: WaterFeatureSelection | null) =>
  selection?.includeValveActuator !== false;

const formatNumber = (value: number) => {
  const safeValue = Number(value) || 0;
  return Number.isInteger(safeValue) ? String(safeValue) : safeValue.toFixed(2).replace(/\.?0+$/, '');
};

function WaterFeaturesSectionNew({
  data,
  onChange,
  plumbingRuns,
  onChangePlumbingRuns,
  disabledReason,
  packageWarningMessage,
}: Props) {
  const [activeSheerIndex, setActiveSheerIndex] = useState<number | null>(null);
  const [activeWokIndex, setActiveWokIndex] = useState<number | null>(null);
  const [activeJetIndex, setActiveJetIndex] = useState<number | null>(null);
  const [activeBubblerIndex, setActiveBubblerIndex] = useState<number | null>(null);

  const catalog = flattenWaterFeatures(pricingData.waterFeatures) as WaterFeatureOption[];
  const hasCatalog = catalog.length > 0;
  const isDisabled = Boolean(disabledReason);

  const catalogByCategory = useMemo(() => {
    const grouped: Record<string, WaterFeatureOption[]> = {};
    catalog.forEach((item) => {
      const group = item.category || 'Other';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(item);
    });
    return grouped;
  }, [catalog]);

  const sheerOptions = sortSheerOptions(catalogByCategory['Sheer Descent'] || []);
  const jetOptions = catalogByCategory['Jets'] || [];
  const wokWaterOptions = catalogByCategory['Wok Pots - Water Only'] || [];
  const wokFireOptions = catalogByCategory['Wok Pots - Fire Only'] || [];
  const wokFireWaterOptions = catalogByCategory['Wok Pots - Water & Fire'] || [];
  const wokOptions = [...wokWaterOptions, ...wokFireOptions, ...wokFireWaterOptions];
  const bubblerOptions = catalogByCategory['Bubbler'] || [];

  const selections = data?.selections ?? [];

  const catalogLookup = useMemo(() => new Map(catalog.map((entry) => [entry.id, entry])), [catalog]);

  const resolveCatalogEntry = (featureId?: string) => {
    if (!featureId) return undefined;
    return catalogLookup.get(featureId) || catalog.find((entry) => entry.name === featureId);
  };

  const matchesOption = (selection: WaterFeatureSelection, option: WaterFeatureOption) =>
    option.id === selection.featureId || option.name === selection.featureId;

  const calculateTotal = (selectionsList: WaterFeatureSelection[]) =>
    selectionsList.reduce((sum, selection) => {
      const feature = resolveCatalogEntry(selection.featureId);
      return sum + getWaterFeatureCogs(feature) * Math.max(selection.quantity ?? 0, 0);
    }, 0);

  const updateSelections = (next: WaterFeatureSelection[]) => {
    onChange({
      ...data,
      selections: next,
      totalCost: calculateTotal(next),
    });
  };

  const filterSelections = (options: WaterFeatureOption[]) =>
    selections.filter((selection) => options.some((option) => matchesOption(selection, option)));

  const updateCategorySelections = (
    options: WaterFeatureOption[],
    nextCategorySelections: WaterFeatureSelection[]
  ) => {
    const remaining = selections.filter((selection) => !options.some((option) => matchesOption(selection, option)));
    updateSelections([...remaining, ...nextCategorySelections]);
  };

  const isCategoryValveActuatorEnabled = (categorySelections: WaterFeatureSelection[]) =>
    categorySelections.some((selection) => isValveActuatorIncluded(selection));

  const createDefaultSelection = (
    options: WaterFeatureOption[],
    categorySelections: WaterFeatureSelection[]
  ): WaterFeatureSelection | null => {
    const firstOption = options[0];
    if (!firstOption) return null;

    return {
      featureId: firstOption.id,
      quantity: 1,
      includeValveActuator:
        categorySelections.length > 0 ? isCategoryValveActuatorEnabled(categorySelections) : true,
    };
  };

  const clearCategorySelections = (
    options: WaterFeatureOption[],
    setActiveIndex: Dispatch<SetStateAction<number | null>>
  ) => {
    updateCategorySelections(options, []);
    setActiveIndex(null);
  };

  const startCategoryFlow = (
    options: WaterFeatureOption[],
    categorySelections: WaterFeatureSelection[],
    setActiveIndex: Dispatch<SetStateAction<number | null>>
  ) => {
    if (categorySelections.length > 0) {
      setActiveIndex(categorySelections.length - 1);
      return;
    }

    const nextSelection = createDefaultSelection(options, categorySelections);
    if (!nextSelection) return;

    updateCategorySelections(options, [nextSelection]);
    setActiveIndex(0);
  };

  const addCategorySelection = (
    options: WaterFeatureOption[],
    categorySelections: WaterFeatureSelection[],
    setActiveIndex: Dispatch<SetStateAction<number | null>>
  ) => {
    const nextSelection = createDefaultSelection(options, categorySelections);
    if (!nextSelection) return;

    const nextSelections = [...categorySelections, nextSelection];
    updateCategorySelections(options, nextSelections);
    setActiveIndex(nextSelections.length - 1);
  };

  const removeCategorySelection = (
    options: WaterFeatureOption[],
    categorySelections: WaterFeatureSelection[],
    index: number,
    setActiveIndex: Dispatch<SetStateAction<number | null>>
  ) => {
    updateCategorySelections(
      options,
      categorySelections.filter((_, selectionIndex) => selectionIndex !== index)
    );
    setActiveIndex(null);
  };

  const updateCategoryFeature = (
    options: WaterFeatureOption[],
    categorySelections: WaterFeatureSelection[],
    index: number,
    featureId: string
  ) => {
    if (!categorySelections[index]) return;

    const nextSelections = [...categorySelections];
    nextSelections[index] = {
      ...nextSelections[index],
      featureId,
      quantity: Math.max(nextSelections[index].quantity ?? 0, 1),
    };
    updateCategorySelections(options, nextSelections);
  };

  const updateCategoryQuantity = (
    options: WaterFeatureOption[],
    categorySelections: WaterFeatureSelection[],
    index: number,
    quantity: number
  ) => {
    if (!categorySelections[index]) return;

    const nextSelections = [...categorySelections];
    nextSelections[index] = { ...nextSelections[index], quantity: Math.max(0, quantity) };
    updateCategorySelections(options, nextSelections);
  };

  const updateCategoryValveActuator = (
    options: WaterFeatureOption[],
    categorySelections: WaterFeatureSelection[],
    enabled: boolean
  ) => {
    updateCategorySelections(
      options,
      categorySelections.map((selection) => ({ ...selection, includeValveActuator: enabled }))
    );
  };

  const sheerSelections = filterSelections(sheerOptions);
  const wokSelections = filterSelections(wokOptions);
  const jetSelections = filterSelections(jetOptions);
  const bubblerSelections = filterSelections(bubblerOptions);

  useEffect(() => {
    if (sheerSelections.length === 0) {
      setActiveSheerIndex(null);
      return;
    }
    if (activeSheerIndex !== null && activeSheerIndex >= sheerSelections.length) {
      setActiveSheerIndex(sheerSelections.length - 1);
    }
  }, [activeSheerIndex, sheerSelections.length]);

  useEffect(() => {
    if (wokSelections.length === 0) {
      setActiveWokIndex(null);
      return;
    }
    if (activeWokIndex !== null && activeWokIndex >= wokSelections.length) {
      setActiveWokIndex(wokSelections.length - 1);
    }
  }, [activeWokIndex, wokSelections.length]);

  useEffect(() => {
    if (jetSelections.length === 0) {
      setActiveJetIndex(null);
      return;
    }
    if (activeJetIndex !== null && activeJetIndex >= jetSelections.length) {
      setActiveJetIndex(jetSelections.length - 1);
    }
  }, [activeJetIndex, jetSelections.length]);

  useEffect(() => {
    if (bubblerSelections.length === 0) {
      setActiveBubblerIndex(null);
      return;
    }
    if (activeBubblerIndex !== null && activeBubblerIndex >= bubblerSelections.length) {
      setActiveBubblerIndex(bubblerSelections.length - 1);
    }
  }, [activeBubblerIndex, bubblerSelections.length]);

  const sheerRunKeys = useMemo(() => buildRunKeys('sheer', sheerSelections), [sheerSelections]);
  const wokRunKeys = useMemo(() => buildRunKeys('wok', wokSelections), [wokSelections]);
  const jetRunKeys = useMemo(() => buildRunKeys('jet', jetSelections), [jetSelections]);
  const bubblerRunKeys = useMemo(() => buildRunKeys('bubbler', bubblerSelections), [bubblerSelections]);

  const runOrderKeys = useMemo(
    () => [...sheerRunKeys, ...wokRunKeys, ...jetRunKeys, ...bubblerRunKeys],
    [sheerRunKeys, wokRunKeys, jetRunKeys, bubblerRunKeys]
  );

  const runKeyByFeature = useMemo(() => {
    const map = new Map<string, keyof PlumbingRuns>();
    runOrderKeys.forEach((key, index) => {
      const runField = WATER_FEATURE_RUN_FIELDS[index];
      if (runField) {
        map.set(key, runField);
      }
    });
    return map;
  }, [runOrderKeys]);

  const prevRunKeysRef = useRef<string[] | null>(null);
  const runOrderSignature = runOrderKeys.join('|');

  useEffect(() => {
    if (prevRunKeysRef.current === null) {
      prevRunKeysRef.current = runOrderKeys;
      return;
    }

    const prevKeys = prevRunKeysRef.current;
    if (prevKeys.join('|') === runOrderSignature) {
      return;
    }

    const nextRuns = { ...plumbingRuns };
    const prevValueMap = new Map<string, number>();

    if (prevKeys.length > 0) {
      prevKeys.forEach((key, index) => {
        const runField = WATER_FEATURE_RUN_FIELDS[index];
        if (!runField) return;
        prevValueMap.set(key, plumbingRuns[runField] ?? 0);
      });
    }

    WATER_FEATURE_RUN_FIELDS.forEach((runField) => {
      nextRuns[runField] = 0;
    });

    runOrderKeys.forEach((key, index) => {
      const runField = WATER_FEATURE_RUN_FIELDS[index];
      if (!runField) return;
      const preservedValue =
        prevKeys.length > 0 ? (prevValueMap.get(key) ?? 0) : (plumbingRuns[runField] ?? 0);
      nextRuns[runField] = preservedValue;
    });

    const runUpdates = WATER_FEATURE_RUN_FIELDS.reduce<Partial<PlumbingRuns>>((updates, runField) => {
      if ((nextRuns[runField] ?? 0) !== (plumbingRuns[runField] ?? 0)) {
        updates[runField] = nextRuns[runField] ?? 0;
      }
      return updates;
    }, {});
    if (Object.keys(runUpdates).length > 0) {
      onChangePlumbingRuns(runUpdates);
    }

    prevRunKeysRef.current = runOrderKeys;
  }, [runOrderKeys, runOrderSignature, plumbingRuns, onChangePlumbingRuns]);

  const renderRunInput = (label: string, field?: keyof PlumbingRuns) => {
    if (!field) return null;

    return (
      <div className="spec-field">
        <label className="spec-label">{label}</label>
        <CompactInput
          value={plumbingRuns[field] ?? 0}
          onChange={(e) => onChangePlumbingRuns({ [field]: parseFloat(e.target.value) || 0 })}
          unit="LNFT"
          min="0"
          step="1"
          placeholder="0"
        />
      </div>
    );
  };

  const getRunLabel = (feature?: WaterFeatureOption) => {
    const needsConduitRun = waterFeatureNeedsConduitRun(feature);
    const needsGasRun = waterFeatureNeedsGasRun(feature);

    if (needsGasRun && needsConduitRun) {
      return 'Gas, Water Feature and Conduit Run';
    }
    if (needsConduitRun) {
      return 'Water Feature and Conduit Run';
    }
    if (needsGasRun) {
      return 'Gas and Water Feature Run';
    }
    return 'Water Feature Run';
  };

  const formatSelectionTitle = (
    selection: WaterFeatureSelection,
    runField?: keyof PlumbingRuns
  ) => {
    const feature = resolveCatalogEntry(selection.featureId);
    const run = runField ? Math.max(plumbingRuns[runField] ?? 0, 0) : 0;
    const parts = [feature?.name || selection.featureId || 'Water Feature', `x${formatNumber(selection.quantity ?? 0)}`];

    if (run > 0) {
      parts.push(`${formatNumber(run)} LNFT`);
    }
    if (selection.includeValveActuator !== false) {
      parts.push('Valve Actuator');
    }

    return parts.join(' | ');
  };

  const selectedBubblerAddsPoolLight = bubblerSelections.some((selection) => {
    if ((selection.quantity ?? 0) <= 0) return false;
    return Boolean(resolveCatalogEntry(selection.featureId)?.needsPoolLight);
  });

  const renderCategoryBlock = ({
    title,
    subtitle,
    emptyLabel,
    noLabel,
    addLabel,
    itemLabel,
    typeLabel,
    options,
    selections: categorySelections,
    runKeys,
    activeIndex,
    setActiveIndex,
    footer,
  }: CategoryConfig) => {
    const hasSelections = categorySelections.length > 0;
    const canAdd = options.length > 0;

    return (
      <div className="spec-block" key={title}>
        <div className="spec-block-header">
          <h2 className="spec-block-title">{title}</h2>
          <p className="spec-block-subtitle">{subtitle}</p>
        </div>

        <div className="pool-type-buttons stackable">
          <button
            type="button"
            className={`pool-type-btn ${!hasSelections ? 'active' : ''}`}
            onClick={() => clearCategorySelections(options, setActiveIndex)}
          >
            {noLabel}
          </button>
          <button
            type="button"
            className={`pool-type-btn ${hasSelections ? 'active' : ''}`}
            onClick={() => startCategoryFlow(options, categorySelections, setActiveIndex)}
            disabled={!canAdd}
          >
            {addLabel}
          </button>
        </div>

        {hasSelections ? (
          <>
            {categorySelections.map((selection, index) => {
              const isEditing = activeIndex === index;
              const runField = runKeyByFeature.get(runKeys[index]);
              const feature = resolveCatalogEntry(selection.featureId);
              const runLabel = getRunLabel(feature);
              const valveActuatorEnabled = isCategoryValveActuatorEnabled(categorySelections);

              return (
                <div key={`${title}-${selection.featureId || 'feature'}-${index}`} className="spec-subcard">
                  <div className="spec-subcard-header">
                    <div>
                      <div className="spec-subcard-title">{formatSelectionTitle(selection, runField)}</div>
                      {!isEditing && <div className="spec-subcard-subtitle">{itemLabel} #{index + 1}</div>}
                    </div>
                    <div className="spec-subcard-actions stacked-actions">
                      <div className="stacked-primary-actions">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setActiveIndex(isEditing ? null : index)}
                        >
                          {isEditing ? 'Collapse' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="link-btn danger"
                          onClick={() => removeCategorySelection(options, categorySelections, index, setActiveIndex)}
                        >
                          Remove
                        </button>
                      </div>
                      {!isEditing && index === categorySelections.length - 1 && canAdd && (
                        <button
                          type="button"
                          className="link-btn small"
                          onClick={() => addCategorySelection(options, categorySelections, setActiveIndex)}
                        >
                          Add Another
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <>
                      <div className="spec-grid-4-fixed">
                        <div className="spec-field">
                          <label className="spec-label">{typeLabel}</label>
                          <select
                            className="compact-input"
                            value={feature?.id || selection.featureId}
                            onChange={(e) =>
                              updateCategoryFeature(options, categorySelections, index, e.target.value)
                            }
                          >
                            {options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="spec-field">
                          <label className="spec-label">Quantity</label>
                          <CompactInput
                            value={selection.quantity ?? 0}
                            onChange={(e) =>
                              updateCategoryQuantity(
                                options,
                                categorySelections,
                                index,
                                parseInt(e.target.value, 10) || 0
                              )
                            }
                            unit="ea"
                            min="0"
                            step="1"
                            placeholder="1"
                          />
                        </div>

                        {runField ? (
                          renderRunInput(runLabel, runField)
                        ) : (
                          <div className="spec-field water-feature-placeholder" aria-hidden="true" />
                        )}

                        <div className="spec-field">
                          <label className="spec-label">Valve Actuator</label>
                          <label
                            className={`link-btn small water-feature-actuator-toggle ${valveActuatorEnabled ? 'active' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={valveActuatorEnabled}
                              onChange={(e) =>
                                updateCategoryValveActuator(options, categorySelections, e.target.checked)
                              }
                            />
                            <span>Include</span>
                          </label>
                        </div>
                      </div>

                      <div className="action-row">
                        <button type="button" className="action-btn" onClick={() => setActiveIndex(null)}>
                          Done
                        </button>
                        {canAdd && (
                          <button
                            type="button"
                            className="action-btn secondary"
                            onClick={() => addCategorySelection(options, categorySelections, setActiveIndex)}
                          >
                            Add Another
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {footer}
          </>
        ) : (
          <>
            <div className="empty-message" style={{ marginTop: '10px' }}>
              {canAdd ? emptyLabel : `No ${title.toLowerCase()} pricing configured.`}
            </div>
            {footer}
          </>
        )}
      </div>
    );
  };

  const categoryBlocks: CategoryConfig[] = [
    {
      title: 'Sheer Descents',
      subtitle: 'Add Sheer Descents to the project.',
      emptyLabel: 'No Sheer Descents',
      noLabel: 'No Sheer Descent',
      addLabel: 'Add Sheer Descent',
      itemLabel: 'Sheer Descent',
      typeLabel: 'Sheer Descent Type',
      options: sheerOptions,
      selections: sheerSelections,
      runKeys: sheerRunKeys,
      activeIndex: activeSheerIndex,
      setActiveIndex: setActiveSheerIndex,
    },
    {
      title: 'Wok Pots',
      subtitle: 'Add Wok Pots to the project.',
      emptyLabel: 'No Wok Pots',
      noLabel: 'No Wok Pot',
      addLabel: 'Add Wok Pot',
      itemLabel: 'Wok Pot',
      typeLabel: 'Wok Pot Type',
      options: wokOptions,
      selections: wokSelections,
      runKeys: wokRunKeys,
      activeIndex: activeWokIndex,
      setActiveIndex: setActiveWokIndex,
    },
    {
      title: 'Jets',
      subtitle: 'Add Jets to the project.',
      emptyLabel: 'No Jets',
      noLabel: 'No Jet',
      addLabel: 'Add Jet',
      itemLabel: 'Jet',
      typeLabel: 'Jet Type',
      options: jetOptions,
      selections: jetSelections,
      runKeys: jetRunKeys,
      activeIndex: activeJetIndex,
      setActiveIndex: setActiveJetIndex,
    },
    {
      title: 'Bubblers',
      subtitle: 'Add Bubblers to the project.',
      emptyLabel: 'No Bubblers',
      noLabel: 'No Bubbler',
      addLabel: 'Add Bubbler',
      itemLabel: 'Bubbler',
      typeLabel: 'Bubbler Type',
      options: bubblerOptions,
      selections: bubblerSelections,
      runKeys: bubblerRunKeys,
      activeIndex: activeBubblerIndex,
      setActiveIndex: setActiveBubblerIndex,
      footer: selectedBubblerAddsPoolLight ? (
        <div className="info-box" style={{ marginTop: '8px' }}>
          A Pool Light has been automatically included with the chosen Bubbler.
        </div>
      ) : undefined,
    },
  ];

  const hasCatalogData =
    hasCatalog &&
    (sheerOptions.length > 0 || jetOptions.length > 0 || wokOptions.length > 0 || bubblerOptions.length > 0);

  return (
    <div className="section-form">
      {packageWarningMessage && <div className="package-warning">{packageWarningMessage}</div>}
      {!hasCatalogData && (
        <div className="form-help" style={{ fontStyle: 'italic', marginBottom: '1rem' }}>
          No water feature pricing found. Add items in the Admin Pricing Model under Water Features (Name + Base/Adders).
        </div>
      )}

      <TooltipAnchor
        as="div"
        className={`package-disabled-shell${isDisabled ? ' is-disabled' : ''}`}
        tooltip={disabledReason}
      >
        {isDisabled && <div className="package-warning secondary">{disabledReason}</div>}
        <div className="package-disabled-content">
          {categoryBlocks.map(renderCategoryBlock)}

          <CustomOptionsSection
            data={data.customOptions || []}
            onChange={(customOptions) => onChange({ ...data, customOptions })}
          />
        </div>
        {isDisabled && <div className="package-disabled-overlay" aria-hidden="true" />}
      </TooltipAnchor>
    </div>
  );
}

export default WaterFeaturesSectionNew;
