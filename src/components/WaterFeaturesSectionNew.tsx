import { useEffect, useMemo, useRef } from 'react';
import { WaterFeatures, WaterFeatureSelection, PlumbingRuns } from '../types/proposal-new';
import pricingData from '../services/pricingData';
import { flattenWaterFeatures, getWaterFeatureCogs } from '../utils/waterFeatureCost';
import './SectionStyles.css';

interface Props {
  data: WaterFeatures;
  onChange: (data: WaterFeatures) => void;
  plumbingRuns: PlumbingRuns;
  onChangePlumbingRuns: (runs: PlumbingRuns) => void;
}

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

const waterFeatureRunFields: Array<keyof PlumbingRuns> = [
  'waterFeature1Run',
  'waterFeature2Run',
  'waterFeature3Run',
  'waterFeature4Run',
];

const noneOptionValue = 'none';

const sortSheerOptions = (options: any[]) => {
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
  return selections.map((sel) => {
    const featureId = sel.featureId || 'unknown';
    const count = counts.get(featureId) ?? 0;
    counts.set(featureId, count + 1);
    return `${prefix}-${featureId}-${count}`;
  });
};

function WaterFeaturesSectionNew({ data, onChange, plumbingRuns, onChangePlumbingRuns }: Props) {
  const catalog = flattenWaterFeatures(pricingData.waterFeatures);
  const hasCatalog = catalog.length > 0;

  const catalogByCategory = useMemo(() => {
    const grouped: Record<string, typeof catalog> = {};
    catalog.forEach((item) => {
      const group = item.category || 'Other';
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(item);
    });
    return grouped;
  }, [catalog]);

  const sheerOptions = sortSheerOptions(catalogByCategory['Sheer Descent'] || []);
  const jetOptions = catalogByCategory['Jets'] || [];
  const wokWater = catalogByCategory['Wok Pots - Water Only'] || [];
  const wokFire = catalogByCategory['Wok Pots - Fire Only'] || [];
  const wokFireWater = catalogByCategory['Wok Pots - Water & Fire'] || [];
  const wokOptions = [...wokWater, ...wokFire, ...wokFireWater];
  const bubblerOptions = catalogByCategory['Bubbler'] || [];

  const selections = data?.selections ?? [];

  const cogsLookup = useMemo(
    () => new Map(catalog.map((entry) => [entry.id, getWaterFeatureCogs(entry)])),
    [catalog]
  );

  const calculateTotal = (selectionsList: WaterFeatureSelection[]) =>
    selectionsList.reduce((sum, sel) => sum + (cogsLookup.get(sel.featureId) ?? 0) * (sel.quantity ?? 0), 0);

  const updateSelections = (next: WaterFeatureSelection[]) => {
    onChange({
      ...data,
      selections: next,
      totalCost: calculateTotal(next),
    });
  };

  const filterSelections = (options: Array<{ id: string }>) =>
    selections.filter((sel) => options.some((opt) => opt.id === sel.featureId));

  const updateCategorySelections = (options: Array<{ id: string }>, nextCategorySelections: WaterFeatureSelection[]) => {
    const remaining = selections.filter((sel) => !options.some((opt) => opt.id === sel.featureId));
    updateSelections([...remaining, ...nextCategorySelections]);
  };

  const updateCategoryFeature = (
    options: Array<{ id: string }>,
    categorySelections: WaterFeatureSelection[],
    index: number,
    featureId: string
  ) => {
    if (featureId === noneOptionValue) {
      const next = categorySelections.filter((_, rowIndex) => rowIndex !== index);
      updateCategorySelections(options, next);
      return;
    }

    const next = [...categorySelections];
    if (next[index]) {
      const existingQty = next[index].quantity ?? 1;
      next[index] = { ...next[index], featureId, quantity: existingQty };
    } else {
      next.push({ featureId, quantity: 1 });
    }
    updateCategorySelections(options, next);
  };

  const updateCategoryQuantity = (
    options: Array<{ id: string }>,
    categorySelections: WaterFeatureSelection[],
    index: number,
    quantity: number
  ) => {
    if (!categorySelections[index]) return;
    const next = [...categorySelections];
    next[index] = { ...next[index], quantity: Math.max(0, quantity) };
    updateCategorySelections(options, next);
  };

  const addCategorySelection = (options: Array<{ id: string }>, categorySelections: WaterFeatureSelection[]) => {
    const first = options[0];
    if (!first) return;
    updateCategorySelections(options, [...categorySelections, { featureId: first.id, quantity: 1 }]);
  };

  const sheerSelections = filterSelections(sheerOptions);
  const wokSelections = filterSelections(wokOptions);
  const jetSelections = filterSelections(jetOptions);
  const bubblerSelections = filterSelections(bubblerOptions);

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
      const runField = waterFeatureRunFields[index];
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
        const runField = waterFeatureRunFields[index];
        if (!runField) return;
        prevValueMap.set(key, plumbingRuns[runField] ?? 0);
      });
    }

    waterFeatureRunFields.forEach((runField) => {
      nextRuns[runField] = 0;
    });

    runOrderKeys.forEach((key, index) => {
      const runField = waterFeatureRunFields[index];
      if (!runField) return;
      const preservedValue =
        prevKeys.length > 0
          ? (prevValueMap.get(key) ?? 0)
          : (plumbingRuns[runField] ?? 0);
      nextRuns[runField] = preservedValue;
    });

    const runsChanged = waterFeatureRunFields.some(
      (runField) => (nextRuns[runField] ?? 0) !== (plumbingRuns[runField] ?? 0)
    );
    if (runsChanged) {
      onChangePlumbingRuns(nextRuns);
    }

    prevRunKeysRef.current = runOrderKeys;
  }, [runOrderSignature, runOrderKeys, plumbingRuns, onChangePlumbingRuns]);

  const renderRunInput = (field?: keyof PlumbingRuns) => {
    if (!field) return null;
    return (
      <div className="spec-field">
        <label className="spec-label">Water Feature Run</label>
        <CompactInput
          value={plumbingRuns[field] ?? 0}
          onChange={(e) => onChangePlumbingRuns({ ...plumbingRuns, [field]: parseFloat(e.target.value) || 0 })}
          unit="LNFT"
          min="0"
          step="1"
          placeholder="0"
        />
      </div>
    );
  };

  const buildRowLabel = (label: string, index: number) =>
    index === 0 ? label : `Additional ${label} ${index}`;

  const renderCategoryRows = (
    label: string,
    options: Array<{ id: string; name: string }>,
    categorySelections: WaterFeatureSelection[],
    runKeys: string[]
  ) => {
    const rows = categorySelections.length > 0 ? categorySelections : [null];
    return rows.map((selection, index) => {
      const isSelected = Boolean(selection);
      const runField = isSelected ? runKeyByFeature.get(runKeys[index]) : undefined;
      const showAddAnother = isSelected && index === categorySelections.length - 1;
      return (
        <div
          key={`${label}-${selection?.featureId || 'none'}-${index}`}
          className="spec-grid-4-fixed water-feature-row"
        >
          <div className="spec-field">
            <label className="spec-label">{buildRowLabel(label, index)}</label>
            <select
              className="compact-input"
              value={selection?.featureId ?? noneOptionValue}
              onChange={(e) => updateCategoryFeature(options, categorySelections, index, e.target.value)}
            >
              <option value={noneOptionValue}>None</option>
              {options.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
          </div>

          {isSelected && (
            <>
              <div className="spec-field">
                <label className="spec-label">Quantity</label>
                <CompactInput
                  value={selection?.quantity ?? 0}
                  onChange={(e) =>
                    updateCategoryQuantity(options, categorySelections, index, parseInt(e.target.value, 10) || 0)
                  }
                  unit="ea"
                  min="0"
                  step="1"
                  placeholder="1"
                />
              </div>
              {runField ? renderRunInput(runField) : <div className="spec-field water-feature-placeholder" aria-hidden="true" />}
              <div className="spec-field water-feature-action">
                <label className="spec-label" aria-hidden="true">&nbsp;</label>
                {showAddAnother && (
                  <button
                    type="button"
                    className="link-btn small"
                    onClick={() => addCategorySelection(options, categorySelections)}
                  >
                    Add Another
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      );
    });
  };

  const hasCatalogData =
    hasCatalog &&
    (sheerOptions.length > 0 || jetOptions.length > 0 || wokOptions.length > 0 || bubblerOptions.length > 0);

  return (
    <div className="section-form">
      {!hasCatalogData && (
        <div className="form-help" style={{ fontStyle: 'italic', marginBottom: '1rem' }}>
          No water feature pricing found. Add items in the Admin Pricing Model under Water Features (Name + Base/Adders).
        </div>
      )}

      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Sheer Descents</h2>
        </div>
        {renderCategoryRows('Sheer Descent', sheerOptions, sheerSelections, sheerRunKeys)}
      </div>

      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Wok Pots</h2>
        </div>
        {renderCategoryRows('Wok Pot', wokOptions, wokSelections, wokRunKeys)}
      </div>

      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Jets</h2>
        </div>
        {renderCategoryRows('Jet Type', jetOptions, jetSelections, jetRunKeys)}
      </div>

      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">LED Bubblers</h2>
        </div>
        {renderCategoryRows('LED Bubbler', bubblerOptions, bubblerSelections, bubblerRunKeys)}
      </div>
    </div>
  );
}

export default WaterFeaturesSectionNew;
