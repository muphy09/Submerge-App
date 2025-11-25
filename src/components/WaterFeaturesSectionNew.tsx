import { useMemo } from 'react';
import { WaterFeatures, WaterFeatureSelection, PlumbingRuns } from '../types/proposal-new';
import pricingData from '../services/pricingData';
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

const formatCurrency = (val: number) => `$${(val || 0).toLocaleString()}`;

const sortSheerOptions = (options: any[]) => {
  const parseSpan = (name: string) => {
    const matchInch = name.match(/(\d+)"?/);
    const matchFoot = name.match(/(\d+(?:\\.\\d+)?)'?/);
    if (matchInch) return parseFloat(matchInch[1]);
    if (matchFoot) return parseFloat(matchFoot[1]) * 12;
    return 0;
  };
  return [...options].sort((a, b) => parseSpan(a.name) - parseSpan(b.name));
};

function WaterFeaturesSectionNew({ data, onChange, plumbingRuns, onChangePlumbingRuns }: Props) {
  const catalog = pricingData.waterFeatures?.catalog ?? [];
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

  const sheerOptions = sortSheerOptions(catalogByCategory['Sheer Descents'] || []);
  const jetOptions = catalogByCategory['Jets'] || [];
  const wokWater = catalogByCategory['Precast Woks - Water Only'] || [];
  const wokFire = catalogByCategory['Precast Woks - Fire Only'] || [];
  const wokFireWater = catalogByCategory['Precast Woks - Fire & Water'] || [];
  const ledBubbler = catalogByCategory['Bubblers & Lighting']?.find((f) => f.id === 'led-bubbler');

  const selections = data?.selections ?? [];

  const calculateTotal = (selectionsList: WaterFeatureSelection[]) => {
    const lookup = new Map(catalog.map((entry) => [entry.id, entry.unitPrice]));
    return selectionsList.reduce((sum, sel) => sum + (lookup.get(sel.featureId) ?? 0) * (sel.quantity ?? 0), 0);
  };

  const updateSelections = (next: WaterFeatureSelection[]) => {
    onChange({
      ...data,
      selections: next,
      totalCost: calculateTotal(next),
    });
  };

  const setQuantityForFeature = (featureId: string, quantity: number) => {
    const sanitized = Math.max(0, quantity);
    const remaining = selections.filter((s) => s.featureId !== featureId);
    const next = sanitized > 0 ? [...remaining, { featureId, quantity: sanitized }] : remaining;
    updateSelections(next);
  };

  // =================== SHEER DESCENTS ===================
  const sheerSelections = selections.filter((sel) => sheerOptions.some((opt) => opt.id === sel.featureId));

  const addSheer = () => {
    const first = sheerOptions[0];
    if (!first) return;
    updateSelections([...selections, { featureId: first.id, quantity: 1 }]);
  };

  const updateSheer = (index: number, field: 'featureId' | 'quantity', value: any) => {
    const next = [...selections];
    const sheerIndexes = selections
      .map((sel, idx) => ({ sel, idx }))
      .filter(({ sel }) => sheerOptions.some((opt) => opt.id === sel.featureId))
      .map(({ idx }) => idx);
    const targetIdx = sheerIndexes[index];
    if (targetIdx === undefined) return;
    const target = { ...next[targetIdx] };
    if (field === 'featureId') {
      target.featureId = value;
      if (!target.quantity || target.quantity <= 0) target.quantity = 1;
    } else {
      target.quantity = Math.max(0, value);
    }
    next[targetIdx] = target;
    updateSelections(next);
  };

  const removeSheer = (index: number) => {
    const sheerIndexes = selections
      .map((sel, idx) => ({ sel, idx }))
      .filter(({ sel }) => sheerOptions.some((opt) => opt.id === sel.featureId))
      .map(({ idx }) => idx);
    const targetIdx = sheerIndexes[index];
    if (targetIdx === undefined) return;
    const next = selections.filter((_, i) => i !== targetIdx);
    updateSelections(next);
  };

  // =================== WOK POTS ===================
  const withoutWoks = () =>
    selections.filter(
      (sel) =>
        !wokWater.some((w) => w.id === sel.featureId) &&
        !wokFire.some((w) => w.id === sel.featureId) &&
        !wokFireWater.some((w) => w.id === sel.featureId)
    );

  const clearWoks = () => {
    updateSelections(withoutWoks());
  };

  const setWok = (category: 'water' | 'fire' | 'both') => {
    const options = category === 'water' ? wokWater : category === 'fire' ? wokFire : wokFireWater;
    if (options.length === 0) return;
    const base = withoutWoks();
    const preservedQty = Math.max(activeWok?.quantity ?? 1, 1);
    updateSelections([...base, { featureId: options[0].id, quantity: preservedQty }]);
  };

  const activeWok = selections.find(
    (sel) =>
      wokWater.some((w) => w.id === sel.featureId) ||
      wokFire.some((w) => w.id === sel.featureId) ||
      wokFireWater.some((w) => w.id === sel.featureId)
  );

  const wokCategory = activeWok
    ? wokWater.some((w) => w.id === activeWok.featureId)
      ? 'water'
      : wokFire.some((w) => w.id === activeWok.featureId)
        ? 'fire'
        : 'both'
    : 'none';

  const updateWokSelection = (featureId: string) => {
    const next = selections.filter(
      (sel) =>
        !wokWater.some((w) => w.id === sel.featureId) &&
        !wokFire.some((w) => w.id === sel.featureId) &&
        !wokFireWater.some((w) => w.id === sel.featureId)
    );
    const existingQty = activeWok?.quantity ?? 1;
    updateSelections([...next, { featureId, quantity: Math.max(1, existingQty) }]);
  };

  const updateWokQuantity = (qty: number) => {
    if (!activeWok) return;
    const sanitized = Math.max(0, qty);
    const next = selections.map((sel) =>
      sel.featureId === activeWok.featureId ? { ...sel, quantity: sanitized } : sel
    );
    updateSelections(next);
  };

  // =================== JETS ===================
  const clearJets = () => selections.filter((sel) => !jetOptions.some((j) => j.id === sel.featureId));
  const activeJet = selections.find((sel) => jetOptions.some((j) => j.id === sel.featureId));

  const setJet = (enabled: boolean) => {
    if (!enabled) {
      updateSelections(clearJets());
      return;
    }
    const first = jetOptions[0];
    if (!first) return;
    updateSelections([...clearJets(), { featureId: first.id, quantity: 1 }]);
  };

  const updateJetSelection = (featureId: string) => {
    const qty = activeJet?.quantity ?? 1;
    updateSelections([...clearJets(), { featureId, quantity: Math.max(1, qty) }]);
  };

  const updateJetQuantity = (qty: number) => {
    if (!activeJet) return;
    updateSelections(
      selections.map((sel) =>
        sel.featureId === activeJet.featureId ? { ...sel, quantity: Math.max(0, qty) } : sel
      )
    );
  };

  // =================== LED BUBBLERS ===================
  const bubblerQty = selections.find((sel) => sel.featureId === ledBubbler?.id)?.quantity ?? 0;
  const setBubblerEnabled = (enabled: boolean) => {
    if (!ledBubbler) return;
    if (!enabled) {
      setQuantityForFeature(ledBubbler.id, 0);
    } else {
      setQuantityForFeature(ledBubbler.id, Math.max(1, bubblerQty || 1));
    }
  };
  const addBubbler = () => {
    if (!ledBubbler) return;
    setQuantityForFeature(ledBubbler.id, Math.max(1, bubblerQty + 1));
  };

  // =================== RUN INPUTS ===================
  const renderRunInput = (label: string, field: keyof PlumbingRuns) => (
    <div className="spec-field">
      <label className="spec-label">{label}</label>
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

  const noSheer = sheerSelections.length === 0;
  const hasSheer = !noSheer;
  const noJets = !activeJet;
  const noBubbler = bubblerQty <= 0;
  const hasCatalogData = hasCatalog && sheerOptions.length > 0;

  return (
    <div className="section-form">
      {!hasCatalogData && (
        <div className="form-help" style={{ fontStyle: 'italic', marginBottom: '1rem' }}>
          No catalog data found. Verify pricing data is loaded from Regular pricing.xlsx (Equip tab, column S).
        </div>
      )}

      {/* ==================== SHEER DESCENTS ==================== */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Sheer Descents</h2>
          <p className="spec-block-subtitle">Add sheer descents with size and quantity.</p>
        </div>

        <div className="pool-type-buttons stackable">
          <button
            type="button"
            className={`pool-type-btn ${noSheer ? 'active' : ''}`}
            onClick={() => updateSelections(selections.filter((sel) => !sheerOptions.some((opt) => opt.id === sel.featureId)))}
          >
            No Sheer Descent
          </button>
          <button
            type="button"
            className={`pool-type-btn ${hasSheer ? 'active' : ''}`}
            onClick={() => (hasSheer ? null : addSheer())}
          >
            Add Sheer Descent
          </button>
        </div>

        {hasSheer && (
          <>
            {sheerSelections.map((sel, idx) => {
              const feature = catalog.find((f) => f.id === sel.featureId);
              const requiresPump = !!(feature?.note && feature.note.toLowerCase().includes('requires second pump'));
              return (
                <div key={`${sel.featureId}-${idx}`} className="spec-subcard">
                  <div className="spec-subcard-header">
                    <div>
                      <div className="spec-subcard-title">Sheer Descent #{idx + 1}</div>
                      {!requiresPump && feature && (
                        <div className="spec-subcard-subtitle">{feature.name}</div>
                      )}
                    </div>
                    <div className="spec-subcard-actions">
                      <button type="button" className="link-btn danger" onClick={() => removeSheer(idx)}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="spec-grid spec-grid-3">
                    <div className="spec-field">
                      <label className="spec-label">Select Size</label>
                      <select
                        className="compact-input"
                        value={sel.featureId}
                        onChange={(e) => updateSheer(idx, 'featureId', e.target.value)}
                      >
                        {sheerOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                      {requiresPump && (
                        <div
                          className="info-box"
                          style={{
                            marginTop: '6px',
                            background: '#fff7ed',
                            borderColor: '#fdba74',
                            color: '#9a3412',
                          }}
                        >
                          Will Require a 2nd Pump
                        </div>
                      )}
                    </div>
                    <div className="spec-field">
                      <label className="spec-label">Quantity</label>
                      <CompactInput
                        value={sel.quantity ?? 0}
                        onChange={(e) => updateSheer(idx, 'quantity', parseInt(e.target.value, 10) || 0)}
                        unit="ea"
                        min="0"
                        step="1"
                        placeholder="1"
                      />
                    </div>
                    <div className="spec-field">
                      <label className="spec-label">Unit Price</label>
                      <div className="form-value">
                        {feature ? formatCurrency(feature.unitPrice) : '--'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="action-row" style={{ marginTop: '12px' }}>
              <button type="button" className="action-btn secondary" onClick={addSheer}>
                Add Another
              </button>
            </div>
          </>
        )}
      </div>

      {/* ==================== WOK POTS ==================== */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Wok Pots</h2>
          <p className="spec-block-subtitle">Choose water, fire, or combination bowls.</p>
        </div>

        <div className="pool-type-buttons stackable">
          <button
            type="button"
            className={`pool-type-btn ${wokCategory === 'none' ? 'active' : ''}`}
            onClick={clearWoks}
          >
            No Wok Pot
          </button>
          <button
            type="button"
            className={`pool-type-btn ${wokCategory === 'water' ? 'active' : ''}`}
            onClick={() => setWok('water')}
          >
            Water Only
          </button>
          <button
            type="button"
            className={`pool-type-btn ${wokCategory === 'fire' ? 'active' : ''}`}
            onClick={() => setWok('fire')}
          >
            Fire Only
          </button>
          <button
            type="button"
            className={`pool-type-btn ${wokCategory === 'both' ? 'active' : ''}`}
            onClick={() => setWok('both')}
          >
            Water and Fire
          </button>
        </div>

        {activeWok && (
          <div className="spec-subcard">
            <div className="spec-subcard-header">
              <div>
                <div className="spec-subcard-title">Wok Pot Selection</div>
                <div className="spec-subcard-subtitle">
                  {catalog.find((f) => f.id === activeWok.featureId)?.name || 'Select Model'}
                </div>
              </div>
              <div className="spec-subcard-actions">
                <button type="button" className="link-btn danger" onClick={clearWoks}>
                  Remove
                </button>
              </div>
            </div>
            <div className="spec-grid spec-grid-3">
              <div className="spec-field">
                <label className="spec-label">Select Model</label>
                <select
                  className="compact-input"
                  value={activeWok.featureId}
                  onChange={(e) => updateWokSelection(e.target.value)}
                >
                  {(wokCategory === 'water' ? wokWater : wokCategory === 'fire' ? wokFire : wokFireWater).map(
                    (opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.name}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div className="spec-field">
                <label className="spec-label">Quantity</label>
                <CompactInput
                  value={activeWok.quantity ?? 0}
                  onChange={(e) => updateWokQuantity(parseInt(e.target.value, 10) || 0)}
                  unit="ea"
                  min="0"
                  step="1"
                  placeholder="1"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label">Unit Price</label>
                <div className="form-value">
                  {formatCurrency(catalog.find((f) => f.id === activeWok.featureId)?.unitPrice || 0)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== JETS ==================== */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">Jets</h2>
          <p className="spec-block-subtitle">Add deck or laminar jets.</p>
        </div>

        <div className="pool-type-buttons stackable">
          <button
            type="button"
            className={`pool-type-btn ${noJets ? 'active' : ''}`}
            onClick={() => setJet(false)}
          >
            No Jet
          </button>
          <button
            type="button"
            className={`pool-type-btn ${!noJets ? 'active' : ''}`}
            onClick={() => setJet(true)}
          >
            Add Jet
          </button>
        </div>

        {!noJets && activeJet && (
          <div className="spec-subcard">
            <div className="spec-subcard-header">
              <div>
                <div className="spec-subcard-title">Jet Selection</div>
                <div className="spec-subcard-subtitle">
                  {catalog.find((f) => f.id === activeJet.featureId)?.name || 'Select Jet'}
                </div>
              </div>
              <div className="spec-subcard-actions">
                <button type="button" className="link-btn danger" onClick={() => setJet(false)}>
                  Remove
                </button>
              </div>
            </div>
            <div className="spec-grid spec-grid-3">
              <div className="spec-field">
                <label className="spec-label">Jet Type</label>
                <select
                  className="compact-input"
                  value={activeJet.featureId}
                  onChange={(e) => updateJetSelection(e.target.value)}
                >
                  {jetOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="spec-field">
                <label className="spec-label">Quantity</label>
                <CompactInput
                  value={activeJet.quantity ?? 0}
                  onChange={(e) => updateJetQuantity(parseInt(e.target.value, 10) || 0)}
                  unit="ea"
                  min="0"
                  step="1"
                  placeholder="1"
                />
              </div>
              <div className="spec-field">
                <label className="spec-label">Unit Price</label>
                <div className="form-value">
                  {formatCurrency(catalog.find((f) => f.id === activeJet.featureId)?.unitPrice || 0)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== LED BUBBLERS ==================== */}
      <div className="spec-block">
        <div className="spec-block-header">
          <h2 className="spec-block-title">LED Bubblers</h2>
          <p className="spec-block-subtitle">Add LED bubblers with integrated lights.</p>
        </div>

        <div className="pool-type-buttons stackable">
          <button
            type="button"
            className={`pool-type-btn ${noBubbler ? 'active' : ''}`}
            onClick={() => setBubblerEnabled(false)}
          >
            No LED Bubbler
          </button>
          <button
            type="button"
            className={`pool-type-btn ${!noBubbler ? 'active' : ''}`}
            onClick={() => setBubblerEnabled(true)}
          >
            Add LED Bubbler
          </button>
        </div>

        {!noBubbler && ledBubbler && (
          <div className="spec-subcard">
            <div className="spec-subcard-header">
              <div>
                <div className="spec-subcard-title">{ledBubbler.name}</div>
                <div className="spec-subcard-subtitle">{formatCurrency(ledBubbler.unitPrice)}</div>
              </div>
              <div className="spec-subcard-actions">
                <button type="button" className="link-btn danger" onClick={() => setBubblerEnabled(false)}>
                  Remove
                </button>
              </div>
            </div>
            <div className="spec-field" style={{ maxWidth: '220px' }}>
              <label className="spec-label">Quantity</label>
              <CompactInput
                value={bubblerQty}
                onChange={(e) => setQuantityForFeature(ledBubbler.id, parseInt(e.target.value, 10) || 0)}
                unit="ea"
                min="0"
                step="1"
                placeholder="1"
              />
            </div>
            <div className="action-row" style={{ marginTop: '10px' }}>
              <button type="button" className="action-btn secondary" onClick={addBubbler}>
                Add Another
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== WATER FEATURE RUNS ==================== */}
      <div className="spec-block" style={{ marginTop: '1.5rem' }}>
        <div className="spec-block-header">
          <h2 className="spec-block-title">Water Feature Runs</h2>
          <p className="spec-block-subtitle">Enter LNFT per feature run.</p>
        </div>

        <div className="spec-grid spec-grid-2">
          {renderRunInput('Water Feature 1 Run', 'waterFeature1Run')}
          {renderRunInput('Water Feature 2 Run', 'waterFeature2Run')}
          {renderRunInput('Water Feature 3 Run', 'waterFeature3Run')}
          {renderRunInput('Water Feature 4 Run', 'waterFeature4Run')}
        </div>
        <div className="form-help" style={{ fontStyle: 'italic', fontSize: '0.9rem' }}>
          Pricing reflected in Plumbing
        </div>
      </div>
    </div>
  );
}

export default WaterFeaturesSectionNew;
