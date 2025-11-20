import { WaterFeatures, DeckJet, Bubbler, WokPot } from '../types/proposal-new';
import './SectionStyles.css';

interface Props {
  data: WaterFeatures;
  onChange: (data: WaterFeatures) => void;
}

function WaterFeaturesSectionNew({ data, onChange }: Props) {
  const handleChange = (field: keyof WaterFeatures, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const addDeckJet = () => {
    const newJet: DeckJet = { quantity: 1, run: 0 };
    handleChange('deckJets', [...data.deckJets, newJet]);
  };

  const updateDeckJet = (index: number, field: keyof DeckJet, value: number) => {
    const updated = [...data.deckJets];
    updated[index] = { ...updated[index], [field]: value };
    handleChange('deckJets', updated);
  };

  const removeDeckJet = (index: number) => {
    handleChange('deckJets', data.deckJets.filter((_, i) => i !== index));
  };

  const addBubbler = () => {
    const newBubbler: Bubbler = { quantity: 1, run: 0 };
    handleChange('bubblers', [...data.bubblers, newBubbler]);
  };

  const updateBubbler = (index: number, field: keyof Bubbler, value: number) => {
    const updated = [...data.bubblers];
    updated[index] = { ...updated[index], [field]: value };
    handleChange('bubblers', updated);
  };

  const removeBubbler = (index: number) => {
    handleChange('bubblers', data.bubblers.filter((_, i) => i !== index));
  };

  const addWokPot = () => {
    const newWokPot: WokPot = { quantity: 1, type: '18-inch', run: 0 };
    handleChange('wokPots', [...data.wokPots, newWokPot]);
  };

  const updateWokPot = (index: number, field: keyof WokPot, value: any) => {
    const updated = [...data.wokPots];
    updated[index] = { ...updated[index], [field]: value };
    handleChange('wokPots', updated);
  };

  const removeWokPot = (index: number) => {
    handleChange('wokPots', data.wokPots.filter((_, i) => i !== index));
  };

  return (
    <div className="section-form">
      <h2>Water Features</h2>

      {/* Deck Jets */}
      <h3>Deck Jets</h3>
      {data.deckJets.map((jet, index) => (
        <div key={index} className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input
                type="number"
                className="form-input"
                value={jet.quantity}
                onChange={(e) => updateDeckJet(index, 'quantity', parseInt(e.target.value) || 0)}
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Run (LNFT)</label>
              <input
                type="number"
                className="form-input"
                value={jet.run}
                onChange={(e) => updateDeckJet(index, 'run', parseFloat(e.target.value) || 0)}
                min="0"
              />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => removeDeckJet(index)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
      {data.deckJets.length < 6 && (
        <button type="button" className="btn btn-add" onClick={addDeckJet}>
          + Add Deck Jet
        </button>
      )}

      {/* Bubblers */}
      <h3 style={{ marginTop: '2rem' }}>Bubblers</h3>
      {data.bubblers.map((bubbler, index) => (
        <div key={index} className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input
                type="number"
                className="form-input"
                value={bubbler.quantity}
                onChange={(e) => updateBubbler(index, 'quantity', parseInt(e.target.value) || 0)}
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Run (LNFT)</label>
              <input
                type="number"
                className="form-input"
                value={bubbler.run}
                onChange={(e) => updateBubbler(index, 'run', parseFloat(e.target.value) || 0)}
                min="0"
              />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => removeBubbler(index)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
      {data.bubblers.length < 3 && (
        <button type="button" className="btn btn-add" onClick={addBubbler}>
          + Add Bubbler
        </button>
      )}

      {/* Wok Pots */}
      <h3 style={{ marginTop: '2rem' }}>Wok Pots</h3>
      {data.wokPots.map((wokPot, index) => (
        <div key={index} className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Type</label>
              <select
                className="form-input"
                value={wokPot.type}
                onChange={(e) => updateWokPot(index, 'type', e.target.value)}
              >
                <option value="18-inch">18"</option>
                <option value="24-inch">24"</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Quantity</label>
              <input
                type="number"
                className="form-input"
                value={wokPot.quantity}
                onChange={(e) => updateWokPot(index, 'quantity', parseInt(e.target.value) || 0)}
                min="0"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Run (LNFT)</label>
              <input
                type="number"
                className="form-input"
                value={wokPot.run}
                onChange={(e) => updateWokPot(index, 'run', parseFloat(e.target.value) || 0)}
                min="0"
              />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => removeWokPot(index)}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
      {data.wokPots.length < 2 && (
        <button type="button" className="btn btn-add" onClick={addWokPot}>
          + Add Wok Pot
        </button>
      )}

      {/* Infinity Edge */}
      <h3 style={{ marginTop: '2rem' }}>Infinity Edge</h3>
      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasInfinityEdge}
            onChange={(e) => handleChange('hasInfinityEdge', e.target.checked)}
          />
          <span>Has Infinity Edge</span>
        </label>
      </div>
      {data.hasInfinityEdge && (
        <div className="form-group">
          <label className="form-label">Infinity Edge Length (LNFT)</label>
          <input
            type="number"
            className="form-input"
            value={data.infinityEdgeLength}
            onChange={(e) => handleChange('infinityEdgeLength', parseFloat(e.target.value) || 0)}
            min="0"
          />
        </div>
      )}

      {/* Spillway */}
      <h3 style={{ marginTop: '2rem' }}>Spillway</h3>
      <div className="form-group">
        <label className="form-checkbox">
          <input
            type="checkbox"
            checked={data.hasSpillway}
            onChange={(e) => handleChange('hasSpillway', e.target.checked)}
          />
          <span>Has Spillway</span>
        </label>
      </div>
      {data.hasSpillway && (
        <div className="form-group">
          <label className="form-label">Spillway Length (LNFT)</label>
          <input
            type="number"
            className="form-input"
            value={data.spillwayLength}
            onChange={(e) => handleChange('spillwayLength', parseFloat(e.target.value) || 0)}
            min="0"
          />
        </div>
      )}
    </div>
  );
}

export default WaterFeaturesSectionNew;
