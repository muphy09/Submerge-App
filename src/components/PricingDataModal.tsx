import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addPricingListItem,
  getPricingDataSnapshot,
  initPricingDataStore,
  getActiveFranchiseId,
  getActivePricingModelMeta,
  clearActivePricingModelMeta,
  savePricingModelSnapshot,
  setActivePricingModel,
  removePricingListItem,
  resetPricingData,
  subscribeToPricingData,
  updatePricingListItem,
  updatePricingValue,
} from '../services/pricingDataStore';
import {
  listPricingModels,
  setDefaultPricingModel,
  deletePricingModel as deletePricingModelRemote,
} from '../services/pricingModelsAdapter';
import './PricingDataModal.css';

type Path = (string | number)[];

type ScalarField = {
  label: string;
  path: Path;
  type: 'number' | 'boolean' | 'text';
  note?: string;
  tooltip?: string;
  prefix?: string;
};

type ListField = {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'text';
  placeholder?: string;
  prefix?: string;
};

type ListConfig = {
  title: string;
  path: Path;
  fields: ListField[];
  addLabel: string;
};

type Group = {
  title: string;
  scalars?: ScalarField[];
  lists?: ListConfig[];
  render?: () => JSX.Element;
};

type Section = {
  title: string;
  groups: Group[];
};

const getValue = (target: any, path: Path) =>
  path.reduce((acc, key) => (acc ? acc[key] : undefined), target);

const toNumber = (value: string) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const emptyFromFields = (fields: ListField[]) =>
  fields.reduce<Record<string, any>>((acc, field) => {
    acc[field.key] = field.type === 'number' ? 0 : field.type === 'boolean' ? false : '';
    return acc;
  }, {});

interface PricingDataModalProps {
  onClose: () => void;
  franchiseId?: string | null;
}

const PricingDataModal: React.FC<PricingDataModalProps> = ({ onClose, franchiseId }) => {
  const [data, setData] = useState(getPricingDataSnapshot());
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [pricingModels, setPricingModels] = useState<any[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(() => {
    const meta = getActivePricingModelMeta();
    return meta.pricingModelId || null;
  });
  const [modelName, setModelName] = useState('');
  const [savingModel, setSavingModel] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingAsNew, setSavingAsNew] = useState(false);
  const [activatedFlash, setActivatedFlash] = useState(false);
  const activateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const backdropMouseDownRef = useRef(false);
  const currentFranchiseId = franchiseId || getActiveFranchiseId() || 'N/A';
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<{ id: string; name: string } | null>(null);
  const updateTooltipAlign = (e: React.MouseEvent<HTMLSpanElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const ratio = center / vw;
    let align: 'left' | 'right' | 'center' = 'center';
    if (ratio < 0.4) align = 'left';
    else if (ratio > 0.6) align = 'right';
    e.currentTarget.dataset.align = align;
  };

  useEffect(() => {
    const targetFranchise = franchiseId || getActiveFranchiseId();
    // Reset state when switching franchises to avoid leaking names/models between franchises
    clearActivePricingModelMeta();
    setModelName('');
    setSelectedModelId(null);
    setHasChanges(false);
    initPricingDataStore(targetFranchise);
    const unsubscribe = subscribeToPricingData(setData);
    void loadModels(targetFranchise);
    return unsubscribe;
  }, [franchiseId]);

  const emitModelsUpdated = () => {
    window.dispatchEvent(new Event('pricing-models-updated'));
  };

  const loadModels = async (targetFranchiseId?: string) => {
    const idToUse = targetFranchiseId || getActiveFranchiseId();
    try {
      const rows = await listPricingModels(idToUse);
      setPricingModels(rows || []);
      const activeMeta = getActivePricingModelMeta();
      if (rows?.length) {
        if (activeMeta.pricingModelId) {
          setSelectedModelId(activeMeta.pricingModelId);
          if (activeMeta.pricingModelName && !modelName) {
            setModelName(activeMeta.pricingModelName);
          }
        } else {
          const fallback = rows.find((m) => m.isDefault) || rows[0];
          setSelectedModelId(fallback?.id ?? null);
          setModelName(fallback?.name || '');
        }
      } else {
        // New franchise: keep name empty, no selected model
        setSelectedModelId(null);
        setModelName('');
      }
      setHasChanges(false);
    } catch (error) {
      console.warn('Unable to load pricing models', error);
    }
  };

  const handleLoadModel = async (modelId: string) => {
    setSelectedModelId(modelId);
    await setActivePricingModel(modelId);
    const meta = getActivePricingModelMeta();
    setModelName(meta.pricingModelName || '');
    setPricingModels((prev) =>
      prev.map((m) => ({ ...m, isDefault: m.id === modelId ? m.isDefault : m.isDefault }))
    );
    setHasChanges(false);
  };

  const handleSelectModel = async (modelId: string) => {
    if (!modelId) {
      setSelectedModelId(null);
      return;
    }
    await handleLoadModel(modelId);
    setHasChanges(false);
  };

  const handleSaveModel = async () => {
    if (!modelName.trim()) {
      setSaveError('Please provide a model name.');
      return;
    }
    setSaveError(null);
    setSavingModel(true);
    try {
      await savePricingModelSnapshot({
        name: modelName.trim(),
        setDefault: false,
        updatedBy: 'admin',
        createNew: savingAsNew,
      });
      setSavingAsNew(false);
      await loadModels();
      emitModelsUpdated();
      setHasChanges(false);
    } catch (error: any) {
      setSaveError(error?.message || 'Unable to save pricing model.');
    } finally {
      setSavingModel(false);
    }
  };

  const handleCreateNewModel = async () => {
    try {
      const defaultModel = pricingModels.find((m) => m.isDefault) || pricingModels[0];
      if (defaultModel) {
        await setActivePricingModel(defaultModel.id);
      } else {
        await initPricingDataStore(franchiseId || getActiveFranchiseId());
      }
      clearActivePricingModelMeta();
      setSelectedModelId(null);
      setModelName('');
      setSavingAsNew(true);
      setHasChanges(false);
    } catch (error) {
      console.warn('Unable to start new pricing model', error);
    }
  };

  const handleDeleteModel = async (modelId: string, isDefault: boolean) => {
    if (isDefault) {
      setSaveError('Cannot delete the active pricing model. Set another model as active first.');
      return;
    }
    try {
      await deletePricingModelRemote({
        franchiseId: franchiseId || getActiveFranchiseId(),
        pricingModelId: modelId,
      });
      if (modelId === getActivePricingModelMeta().pricingModelId) {
        const def = pricingModels.find((m) => m.isDefault && m.id !== modelId) || pricingModels.find((m) => m.id !== modelId);
        if (def) {
          await handleLoadModel(def.id);
        }
      }
      await loadModels(franchiseId || getActiveFranchiseId());
    } catch (error: any) {
      setSaveError(error?.message || 'Unable to delete pricing model.');
    }
  };

  const handleSetDefault = async (modelId: string) => {
    try {
      await setDefaultPricingModel({
        franchiseId: franchiseId || getActiveFranchiseId(),
        pricingModelId: modelId,
      });
      await loadModels(franchiseId || getActiveFranchiseId());
      emitModelsUpdated();
      const meta = getActivePricingModelMeta();
      setModelName(meta.pricingModelName || modelName);
      setHasChanges(false);
    } catch (error) {
      console.warn('Unable to set active pricing model', error);
    }
  };

  const toggleSection = (title: string) => {
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    backdropMouseDownRef.current = event.target === event.currentTarget;
  };

  const handleBackdropMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    if (backdropMouseDownRef.current && event.target === event.currentTarget) {
      onClose();
    }
    backdropMouseDownRef.current = false;
  };

  const handleBackdropMouseLeave = () => {
    backdropMouseDownRef.current = false;
  };

  const handleScalarChange = (field: ScalarField, value: string | boolean) => {
    if (field.type === 'number') {
      updatePricingValue(field.path, typeof value === 'string' ? toNumber(value) : value);
    } else if (field.type === 'boolean') {
      updatePricingValue(field.path, Boolean(value));
    } else {
      updatePricingValue(field.path, value);
    }
    setHasChanges(true);
  };

  const handleListChange = (list: ListConfig, index: number, field: ListField, raw: any) => {
    const parsed =
      field.type === 'number' ? toNumber(String(raw)) : field.type === 'boolean' ? Boolean(raw) : raw;
    updatePricingListItem(list.path, index, field.key, parsed);
    setHasChanges(true);
  };


  const handleAddListItem = (list: ListConfig) => {
    addPricingListItem(list.path, emptyFromFields(list.fields));
    setHasChanges(true);
  };

  const handleRemoveListItem = (list: ListConfig, index: number) => {
    removePricingListItem(list.path, index);
    setHasChanges(true);
  };

  const selectedModel = selectedModelId ? pricingModels.find((m) => m.id === selectedModelId) : null;
  const selectedModelIsDefault = Boolean(selectedModel?.isDefault);
  const getSectionGlyph = (title: string) => {
    const parts = title.split(' ').filter(Boolean);
    const abbreviation = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).trim();
    return (abbreviation || title.slice(0, 2) || '•').toUpperCase().slice(0, 2);
  };

  const renderSectionIcon = (title: string) => {
    const icons: Record<string, JSX.Element> = {
      'Plans & Engineering': (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="5" y="4" width="12" height="14" rx="2" />
          <path d="M9 8h4M9 11h6M9 14h3" />
        </svg>
      ),
      'Layout & Permit': (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="5" width="12" height="14" rx="2" />
          <path d="M9 3h6v4H9z" />
          <path d="M9 10h6M9 13h6M9 16h4" />
        </svg>
      ),
      Excavation: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 13l4-4 2 2-4 4-2 2-2-2z" />
          <path d="M14 5l3-3 2 2-3 3z" />
          <path d="M13 6l2 2" />
        </svg>
      ),
      Plumbing: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 10h8a2 2 0 012 2v6" />
          <path d="M12 6V4a2 2 0 012-2h4" />
          <path d="M16 12h4" />
          <circle cx="16" cy="18" r="2" />
        </svg>
      ),
      'Water Features': (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5s5 5.2 5 9a5 5 0 11-10 0c0-3.8 5-9 5-9z" />
        </svg>
      ),
      'Electrical & Gas': (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M13 2L5 14h6l-2 8 8-12h-6z" />
        </svg>
      ),
      Steel: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 8h14M5 12h14M5 16h14" />
          <path d="M7 6v12M17 6v12" />
        </svg>
      ),
      'Shotcrete Labor': (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 8l5-4 3 3-2 2 6 6-2 2-6-6-2 2z" />
        </svg>
      ),
      'Shotcrete Material': (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 5l5-3 5 3v6l-5 3-5-3z" />
          <path d="M12 11v6" />
          <path d="M17 14l-5 3-5-3" />
        </svg>
      ),
      'Tile, Coping & Decking': (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" />
        </svg>
      ),
      'Water Treatment': (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3.5s5 5.2 5 9a5 5 0 11-10 0c0-3.8 5-9 5-9z" />
          <path d="M9.5 14.5c.5 1 1.7 1.8 3 1.8a3 3 0 002.5-1.4" />
        </svg>
      ),
      Lighting: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3a5 5 0 015 5 5 5 0 01-2.5 4.3L14 15h-4l-.5-2.7A5 5 0 017 8a5 5 0 015-5z" />
          <path d="M10 18h4M11 21h2" />
        </svg>
      ),
      Cleanup: (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 19h14" />
          <path d="M7 19l2-9h6l2 9" />
          <path d="M9 7h6" />
        </svg>
      ),
    };

    return (
      <span className="pricing-section__icon">
        {icons[title] || <span className="pricing-section__glyph-letter">{getSectionGlyph(title)}</span>}
      </span>
    );
  };

  const handleActivateSelected = async () => {
    if (!selectedModelId) return;
    if (activateTimerRef.current) {
      clearTimeout(activateTimerRef.current);
    }
    await handleSetDefault(selectedModelId);
    setActivatedFlash(true);
    activateTimerRef.current = setTimeout(() => setActivatedFlash(false), 1000);
    setHasChanges(false);
  };

  const displayModelName = modelName || selectedModel?.name || 'New Pricing Model';
  const showSetActiveButton = (Boolean(selectedModelId) && !selectedModelIsDefault) || activatedFlash;

  useEffect(() => {
    return () => {
      if (activateTimerRef.current) {
        clearTimeout(activateTimerRef.current);
      }
    };
  }, []);

  const sections: Section[] = useMemo(
    () => [
      {
        title: 'Plans & Engineering',
        groups: [
          {
            title: 'Base Costs',
            scalars: [
              {
                label: 'Pool',
                path: ['plans', 'poolOnly'],
                type: 'number',
                tooltip: 'Added when a pool is defined. Quantity is always 1 if defined.',
                prefix: '$',
              },
              {
                label: 'Spa',
                path: ['plans', 'spa'],
                type: 'number',
                tooltip: 'Added when a spa exists. Quantity is always 1 if spa exists.',
                prefix: '$',
              },
              {
                label: 'Waterfall',
                path: ['plans', 'waterfall'],
                type: 'number',
                tooltip: 'Added when a waterfall exists. Quantity equals the total waterfall count.',
                prefix: '$',
              },
              {
                label: 'Water Feature',
                path: ['plans', 'waterFeature'],
                type: 'number',
                tooltip: 'Applies when a water feature exists. Quantity equals total water feature count.',
                prefix: '$',
              },
              {
                label: 'Soil Sample / Engineer',
                path: ['plans', 'soilSampleEngineer'],
                type: 'number',
                tooltip: 'Added when the soil sample / engineer input is activated.',
                prefix: '$',
              },
            ],
          },
        ],
      },
      {
        title: 'Layout & Permit',
        groups: [
          {
            title: 'Layout',
            scalars: [
              {
                label: 'Pool',
                path: ['misc', 'layout', 'poolOnly'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Spa',
                path: ['misc', 'layout', 'spa'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Silt Fencing',
                path: ['misc', 'layout', 'siltFencing'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
            ],
          },
          {
            title: 'Permit',
            scalars: [
              {
                label: 'Pool',
                path: ['misc', 'permit', 'poolOnly'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Spa',
                path: ['misc', 'permit', 'spa'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Permit Runner',
                path: ['misc', 'permit', 'permitRunner'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
            ],
          },
        ],
      },
      {
        title: 'Excavation',
        groups: [
          {
            title: 'Base & allowances',
            scalars: [
              {
                label: 'Base excavation (project)',
                path: ['excavation', 'basePricePerSqft'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Over 1,000 sqft surcharge',
                path: ['excavation', 'over1000Sqft'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Additional 6" depth (per sqft)',
                path: ['excavation', 'additional6InchDepth'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Site prep (per hour)',
                path: ['excavation', 'sitePrep'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Backfill',
                path: ['excavation', 'backfill'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Gravel install (per ton)',
                path: ['excavation', 'gravelPerTon'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Dirt haul (per load)',
                path: ['excavation', 'dirtHaulPerLoad'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Cover box',
                path: ['excavation', 'coverBox'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Travel (per mile)',
                path: ['excavation', 'travelPerMile'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Miscellaneous',
                path: ['excavation', 'misc'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
            ],
          },
          {
            title: 'Base Ranges - Surface Area Breakpoints',
            render: renderBaseRanges,
          },
          {
            title: 'Spa excavation',
            scalars: [
              {
                label: 'Spa base excavation',
                path: ['excavation', 'baseSpa'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
              {
                label: 'Raised spa excavation',
                path: ['excavation', 'raisedSpa'],
                type: 'number',
                tooltip: 'Placeholder',
                prefix: '$',
              },
            ],
          },
          {
            title: 'Raised bond beam (per lnft)',
            scalars: [
              { label: '6" RBB', path: ['excavation', 'rbb6'], type: 'number', tooltip: 'Placeholder', prefix: '$' },
              { label: '12" RBB', path: ['excavation', 'rbb12'], type: 'number', tooltip: 'Placeholder', prefix: '$' },
              { label: '18" RBB', path: ['excavation', 'rbb18'], type: 'number', tooltip: 'Placeholder', prefix: '$' },
              { label: '24" RBB', path: ['excavation', 'rbb24'], type: 'number', tooltip: 'Placeholder', prefix: '$' },
              { label: '30" RBB', path: ['excavation', 'rbb30'], type: 'number', tooltip: 'Placeholder', prefix: '$' },
              { label: '36" RBB', path: ['excavation', 'rbb36'], type: 'number', tooltip: 'Placeholder', prefix: '$' },
            ],
          },
        ],
      },
      {
        title: 'Plumbing',
        groups: [
          {
            title: 'Base & overruns',
            scalars: [
              { label: 'Short stub / base plumbing', path: ['plumbing', 'shortStub'], type: 'number' },
              { label: 'Spa base plumbing', path: ['plumbing', 'spaBase'], type: 'number' },
              {
                label: 'Pool overrun per ft',
                path: ['plumbing', 'poolOverrunPerFt'],
                type: 'number',
                note: `Applies over ${data.plumbing.poolOverrunThreshold} ft`,
              },
              {
                label: 'Spa overrun per ft',
                path: ['plumbing', 'spaOverrunPerFt'],
                type: 'number',
                note: `Applies over ${data.plumbing.spaOverrunThreshold} ft`,
              },
              {
                label: 'Gas overrun per ft',
                path: ['plumbing', 'gasOverrunPerFt'],
                type: 'number',
                note: `Applies over ${data.plumbing.gasOverrunThreshold} ft`,
              },
              { label: 'Spa plumbing (per ft)', path: ['plumbing', 'spaPlumbing'], type: 'number' },
            ],
          },
          {
            title: 'Water feature plumbing',
            scalars: [
              { label: 'Setup (per run)', path: ['plumbing', 'waterFeatureRun', 'setup'], type: 'number' },
              { label: 'Base allowance (ft)', path: ['plumbing', 'waterFeatureRun', 'baseAllowanceFt'], type: 'number' },
              { label: 'Per ft over allowance', path: ['plumbing', 'waterFeatureRun', 'perFt'], type: 'number' },
            ],
          },
          {
            title: 'Misc plumbing',
            scalars: [
              { label: 'Cleaner line (per ft)', path: ['plumbing', 'cleanerPerFt'], type: 'number' },
              { label: 'Auto-fill (per ft)', path: ['plumbing', 'autoFillPerFt'], type: 'number' },
              { label: 'Additional skimmer', path: ['plumbing', 'additionalSkimmer'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Water Features',
        groups: [
          {
            title: 'Equip tab catalog (column S)',
            lists: [
              {
                title: 'Available water features',
                path: ['waterFeatures', 'catalog'],
                addLabel: 'Add water feature',
                fields: [
                  { key: 'id', label: 'Key', type: 'text', placeholder: 'unique-id' },
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Feature name' },
                  { key: 'category', label: 'Category', type: 'text', placeholder: 'Group heading' },
                  { key: 'unitPrice', label: 'Price (Equip!S)', type: 'number', placeholder: '0' },
                  { key: 'note', label: 'Note', type: 'text', placeholder: 'Optional note' },
                ],
              },
            ],
          },
        ],
      },
      {
        title: 'Electrical & Gas',
        groups: [
          {
            title: 'Electrical runs',
            scalars: [
              { label: 'Base electrical', path: ['electrical', 'baseElectrical'], type: 'number' },
              {
                label: 'Electrical overrun per ft',
                path: ['electrical', 'overrunPerFt'],
                type: 'number',
                note: `Applies over ${data.electrical.overrunThreshold} ft`,
              },
              { label: 'Spa electrical', path: ['electrical', 'spaElectrical'], type: 'number' },
              { label: 'Light additional (each)', path: ['electrical', 'lightAdditionalPerLight'], type: 'number' },
              { label: 'Light run per ft', path: ['electrical', 'lightRunPerFt'], type: 'number' },
              { label: 'Heat pump electrical base', path: ['electrical', 'heatPumpElectricalBase'], type: 'number' },
              { label: 'Heat pump overrun per ft', path: ['electrical', 'heatPumpPerFtOver'], type: 'number' },
              { label: 'Automation add', path: ['electrical', 'automation'], type: 'number' },
              { label: 'Salt system add', path: ['electrical', 'saltSystem'], type: 'number' },
              { label: 'Bonding', path: ['electrical', 'bonding'], type: 'number' },
              { label: 'Outlet', path: ['electrical', 'outlet'], type: 'number' },
              { label: 'Auto-fill (per ft)', path: ['electrical', 'autoFillPerFt'], type: 'number' },
              { label: 'Travel per mile', path: ['electrical', 'travelPerMile'], type: 'number' },
            ],
          },
          {
            title: 'Gas',
            scalars: [
              { label: 'Base gas set', path: ['electrical', 'baseGas'], type: 'number' },
              {
                label: 'Gas overrun per ft',
                path: ['electrical', 'gasPerFtOverThreshold'],
                type: 'number',
                note: `Applies over ${data.plumbing.gasOverrunThreshold} ft`,
              },
            ],
          },
        ],
      },
      {
        title: 'Steel',
        groups: [
          {
            title: 'Rebar',
            scalars: [
              { label: 'Pool base (per sqft)', path: ['steel', 'poolBase'], type: 'number' },
              { label: 'Spa base', path: ['steel', 'spaBase'], type: 'number' },
              { label: '4-bar beam', path: ['steel', 'fourBarBeam'], type: 'number' },
              { label: 'Steps & bench (per lnft)', path: ['steel', 'stepsPerLnft'], type: 'number' },
              { label: 'Tanning shelf', path: ['steel', 'tanningShelf'], type: 'number' },
              { label: 'Depth over 8ft (per 6")', path: ['steel', 'depthOver8Ft'], type: 'number' },
              { label: '6" RBB steel (per lnft)', path: ['steel', 'rbb6PerLnft'], type: 'number' },
              { label: '12" RBB steel (per lnft)', path: ['steel', 'rbb12PerLnft'], type: 'number' },
              { label: '18" RBB steel (per lnft)', path: ['steel', 'rbb18PerLnft'], type: 'number' },
              { label: '24" RBB steel (per lnft)', path: ['steel', 'rbb24PerLnft'], type: 'number' },
              { label: '30" RBB steel (per lnft)', path: ['steel', 'rbb30PerLnft'], type: 'number' },
              { label: '36" RBB steel (per lnft)', path: ['steel', 'rbb36PerLnft'], type: 'number' },
              { label: 'Double curtain (per lnft)', path: ['steel', 'doubleCurtainPerLnft'], type: 'number' },
              { label: 'Spa double curtain', path: ['steel', 'spaDoubleCurtain'], type: 'number' },
              { label: 'Pool bonding', path: ['steel', 'poolBonding'], type: 'number' },
              { label: 'Travel per mile', path: ['steel', 'travelPerMile'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Shotcrete Labor',
        groups: [
          {
            title: 'Crew rates',
            scalars: [
              { label: 'Pool base (per yard)', path: ['shotcrete', 'labor', 'poolBase'], type: 'number' },
              { label: 'Minimum yards', path: ['shotcrete', 'labor', 'minimumYards'], type: 'number' },
              { label: 'Spa', path: ['shotcrete', 'labor', 'spa'], type: 'number' },
              { label: 'Auto cover', path: ['shotcrete', 'labor', 'autoCover'], type: 'number' },
              { label: 'Distance 251-300', path: ['shotcrete', 'labor', 'distance250to300'], type: 'number' },
              { label: 'Distance 301-350', path: ['shotcrete', 'labor', 'distance300to350'], type: 'number' },
              { label: 'Travel per mile', path: ['shotcrete', 'labor', 'travelPerMile'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Shotcrete Material',
        groups: [
          {
            title: 'Material rates',
            scalars: [
              { label: 'Material per yard', path: ['shotcrete', 'material', 'perYard'], type: 'number' },
              { label: 'Clean-out', path: ['shotcrete', 'material', 'cleanOut'], type: 'number' },
              { label: 'Env/Fuel per yard', path: ['shotcrete', 'material', 'envFuelPerYard'], type: 'number' },
              { label: 'Miscellaneous', path: ['shotcrete', 'material', 'misc'], type: 'number' },
              { label: 'Travel per mile', path: ['shotcrete', 'material', 'travelPerMile'], type: 'number' },
              { label: 'Tax rate', path: ['shotcrete', 'material', 'taxRate'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Tile, Coping & Decking',
        groups: [
          {
            title: 'Tile labor (per lnft)',
            scalars: [
              { label: 'Level 1', path: ['tileCoping', 'tile', 'labor', 'level1'], type: 'number' },
              { label: 'Level 2', path: ['tileCoping', 'tile', 'labor', 'level2'], type: 'number' },
              { label: 'Level 3', path: ['tileCoping', 'tile', 'labor', 'level3'], type: 'number' },
              { label: 'Step trim tile', path: ['tileCoping', 'tile', 'labor', 'stepTrim'], type: 'number' },
            ],
          },
          {
            title: 'Tile material',
            scalars: [
              { label: 'Level 1 included', path: ['tileCoping', 'tile', 'material', 'level1Included'], type: 'boolean' },
              { label: 'Level 2 upgrade (per lnft)', path: ['tileCoping', 'tile', 'material', 'level2Upgrade'], type: 'number' },
              { label: 'Level 3 upgrade (per lnft)', path: ['tileCoping', 'tile', 'material', 'level3Upgrade'], type: 'number' },
            ],
          },
          {
            title: 'Coping labor (per lnft)',
            scalars: [
              { label: 'Cantilever', path: ['tileCoping', 'coping', 'cantilever'], type: 'number' },
              { label: 'Flagstone', path: ['tileCoping', 'coping', 'flagstone'], type: 'number' },
              { label: 'Pavers', path: ['tileCoping', 'coping', 'pavers'], type: 'number' },
              { label: 'Travertine level 1', path: ['tileCoping', 'coping', 'travertineLevel1'], type: 'number' },
              { label: 'Travertine level 2', path: ['tileCoping', 'coping', 'travertineLevel2'], type: 'number' },
              { label: 'Concrete', path: ['tileCoping', 'coping', 'concrete'], type: 'number' },
            ],
          },
          {
            title: 'Decking labor (per sqft unless noted)',
            scalars: [
              { label: 'Pavers', path: ['tileCoping', 'decking', 'labor', 'pavers'], type: 'number' },
              { label: 'Travertine', path: ['tileCoping', 'decking', 'labor', 'travertine'], type: 'number' },
              { label: 'Concrete', path: ['tileCoping', 'decking', 'labor', 'concrete'], type: 'number' },
              { label: 'Concrete steps (each)', path: ['tileCoping', 'decking', 'labor', 'concreteSteps'], type: 'number' },
            ],
          },
          {
            title: 'Decking material (per sqft unless noted)',
            scalars: [
              { label: 'Pavers', path: ['tileCoping', 'decking', 'material', 'pavers'], type: 'number' },
              { label: 'Travertine level 1', path: ['tileCoping', 'decking', 'material', 'travertineLevel1'], type: 'number' },
              { label: 'Travertine level 2', path: ['tileCoping', 'decking', 'material', 'travertineLevel2'], type: 'number' },
              { label: 'Concrete', path: ['tileCoping', 'decking', 'material', 'concrete'], type: 'number' },
              { label: 'Concrete steps (each)', path: ['tileCoping', 'decking', 'material', 'concreteSteps'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Equipment',
        groups: [
          {
            title: 'Pumps',
            lists: [
              {
                title: 'Pump models',
                path: ['equipment', 'pumps'],
                addLabel: 'Add pump',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Pump name' },
                  { key: 'model', label: 'Model', type: 'text', placeholder: 'Model' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                ],
              },
            ],
          },
          {
            title: 'Filters',
            lists: [
              {
                title: 'Filter models',
                path: ['equipment', 'filters'],
                addLabel: 'Add filter',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Filter name' },
                  { key: 'sqft', label: 'SQFT', type: 'number', placeholder: '0' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                ],
              },
            ],
          },
          {
            title: 'Cleaners',
            lists: [
              {
                title: 'Cleaner models',
                path: ['equipment', 'cleaners'],
                addLabel: 'Add cleaner',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Cleaner name' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                ],
              },
            ],
          },
          {
            title: 'Heaters',
            lists: [
              {
                title: 'Heater models',
                path: ['equipment', 'heaters'],
                addLabel: 'Add heater',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Heater name' },
                  { key: 'btu', label: 'BTU', type: 'number', placeholder: '0' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                  { key: 'isVersaFlo', label: 'VersaFlo capable', type: 'boolean' },
                ],
              },
            ],
          },
          {
            title: 'Lighting & automation rates',
            scalars: [
              { label: 'Niche light', path: ['equipment', 'lights', 'nicheLightPrice'], type: 'number' },
              { label: 'Spa light add-on', path: ['equipment', 'lights', 'spaLightAddon'], type: 'number' },
              { label: 'Additional light', path: ['equipment', 'lights', 'additionalLightPrice'], type: 'number' },
              { label: 'Automation extra zone', path: ['equipment', 'automationZoneAddon'], type: 'number' },
            ],
            lists: [
              {
                title: 'Automation kits',
                path: ['equipment', 'automation'],
                addLabel: 'Add automation',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Automation name' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                  { key: 'hasChemistry', label: 'Includes chemistry', type: 'boolean' },
                ],
              },
            ],
          },
          {
            title: 'Salt & accessories',
            scalars: [
              { label: 'Blanket reel', path: ['equipment', 'blanketReel'], type: 'number' },
              { label: 'Solar blanket', path: ['equipment', 'solarBlanket'], type: 'number' },
              { label: 'Auto-fill', path: ['equipment', 'autoFill'], type: 'number' },
              { label: 'Handrail', path: ['equipment', 'handrail'], type: 'number' },
              { label: 'Startup chemicals', path: ['equipment', 'startupChemicals'], type: 'number' },
            ],
            lists: [
              {
                title: 'Salt systems',
                path: ['equipment', 'saltSystem'],
                addLabel: 'Add salt system',
                fields: [
                  { key: 'name', label: 'Name', type: 'text', placeholder: 'Salt system name' },
                  { key: 'model', label: 'Model', type: 'text', placeholder: 'Model' },
                  { key: 'price', label: 'Price', type: 'number', placeholder: '0' },
                ],
              },
            ],
          },
        ],
      },
      {
        title: 'Interior Finish',
        groups: [
          {
            title: 'Prep & extras',
            scalars: [
              { label: 'Minimum charge sqft', path: ['interiorFinish', 'minimumChargeSqft'], type: 'number' },
              { label: 'Pool prep base', path: ['interiorFinish', 'extras', 'poolPrepBase'], type: 'number' },
              { label: 'Pool prep threshold', path: ['interiorFinish', 'extras', 'poolPrepThreshold'], type: 'number' },
              { label: 'Pool prep over rate (per sqft)', path: ['interiorFinish', 'extras', 'poolPrepOverRate'], type: 'number' },
              { label: 'Spa prep', path: ['interiorFinish', 'extras', 'spaPrep'], type: 'number' },
              { label: 'Misc', path: ['interiorFinish', 'extras', 'misc'], type: 'number' },
              { label: 'Travel per mile', path: ['interiorFinish', 'extras', 'travelPerMile'], type: 'number' },
              { label: 'Step detail per lnft over 20', path: ['interiorFinish', 'extras', 'stepDetailPerLnftOver20'], type: 'number' },
            ],
          },
          {
            title: 'Labor (per sqft unless noted)',
            scalars: [
              { label: 'Plaster base', path: ['interiorFinish', 'labor', 'plasterBase'], type: 'number' },
              { label: 'Plaster per 100 sqft over 500', path: ['interiorFinish', 'labor', 'plasterPer100SqftOver500'], type: 'number' },
              { label: 'Pebble base', path: ['interiorFinish', 'labor', 'pebbleBase'], type: 'number' },
              { label: 'Pebble per 100 sqft over 500', path: ['interiorFinish', 'labor', 'pebblePer100SqftOver500'], type: 'number' },
              { label: 'Quartz base', path: ['interiorFinish', 'labor', 'quartzBase'], type: 'number' },
              { label: 'Quartz per 100 sqft over 500', path: ['interiorFinish', 'labor', 'quartzPer100SqftOver500'], type: 'number' },
              { label: 'Polished base', path: ['interiorFinish', 'labor', 'polishedBase'], type: 'number' },
              { label: 'Polished per 100 sqft over 500', path: ['interiorFinish', 'labor', 'polishedPer100SqftOver500'], type: 'number' },
              { label: 'Tile base', path: ['interiorFinish', 'labor', 'tileBase'], type: 'number' },
              { label: 'Tile per 100 sqft over 500', path: ['interiorFinish', 'labor', 'tilePer100SqftOver500'], type: 'number' },
              { label: 'Spa labor', path: ['interiorFinish', 'labor', 'spa'], type: 'number' },
            ],
          },
          {
            title: 'Material (per sqft unless noted)',
            scalars: [
              { label: 'Plaster', path: ['interiorFinish', 'material', 'plaster'], type: 'number' },
              { label: 'PebbleTec', path: ['interiorFinish', 'material', 'pebbleTec'], type: 'number' },
              { label: 'PebbleSheen', path: ['interiorFinish', 'material', 'pebbleSheen'], type: 'number' },
              { label: 'PebbleFina', path: ['interiorFinish', 'material', 'pebbleFina'], type: 'number' },
              { label: 'Mini pebble', path: ['interiorFinish', 'material', 'miniPebble'], type: 'number' },
              { label: 'Beadcrete', path: ['interiorFinish', 'material', 'beadcrete'], type: 'number' },
              { label: 'QuartzScapes', path: ['interiorFinish', 'material', 'quartzScapes'], type: 'number' },
              { label: 'Hydrazzo', path: ['interiorFinish', 'material', 'hydrazzo'], type: 'number' },
              { label: 'Tile finish', path: ['interiorFinish', 'material', 'tile'], type: 'number' },
              { label: 'Spa finish', path: ['interiorFinish', 'material', 'spaFinish'], type: 'number' },
            ],
          },
          {
            title: 'Water truck',
            scalars: [
              { label: 'Base load', path: ['interiorFinish', 'waterTruck', 'base'], type: 'number' },
              { label: 'Load size (gallons)', path: ['interiorFinish', 'waterTruck', 'loadSizeGallons'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Cleanup',
        groups: [
          {
            title: 'Final cleanup',
            scalars: [
              { label: 'Pool cleanup', path: ['cleanup', 'basePool'], type: 'number' },
              { label: 'Spa cleanup add-on', path: ['cleanup', 'spa'], type: 'number' },
              { label: 'Per sqft over 500', path: ['cleanup', 'perSqftOver500'], type: 'number' },
              { label: 'RBB cleanup (per sqft)', path: ['cleanup', 'rbbPerSqft'], type: 'number' },
              { label: 'Travel per mile', path: ['cleanup', 'travelPerMile'], type: 'number' },
              { label: 'Rough grading', path: ['cleanup', 'roughGrading'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Fiberglass Shells',
        groups: [
          {
            title: 'Pool shells',
            scalars: [
              { label: 'Small shell', path: ['fiberglass', 'small'], type: 'number' },
              { label: 'Medium shell', path: ['fiberglass', 'medium'], type: 'number' },
              { label: 'Large shell', path: ['fiberglass', 'large'], type: 'number' },
              { label: 'Crystite upgrade', path: ['fiberglass', 'crystite'], type: 'number' },
            ],
          },
          {
            title: 'Spa shells & options',
            scalars: [
              { label: 'Small spa shell', path: ['fiberglass', 'spaSmall'], type: 'number' },
              { label: 'Medium spa shell', path: ['fiberglass', 'spaMedium'], type: 'number' },
              { label: 'Large spa shell', path: ['fiberglass', 'spaLarge'], type: 'number' },
              { label: 'Spillover', path: ['fiberglass', 'spillover'], type: 'number' },
              { label: 'Crane allowance', path: ['fiberglass', 'crane'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Equipment Set & Drainage',
        groups: [
          {
            title: 'Equipment set labor',
            scalars: [
              { label: 'Base equipment set', path: ['misc', 'equipmentSet', 'base'], type: 'number' },
              { label: 'Spa equipment add-on', path: ['misc', 'equipmentSet', 'spa'], type: 'number' },
              { label: 'Automation add-on', path: ['misc', 'equipmentSet', 'automation'], type: 'number' },
              { label: 'Heat pump add-on', path: ['misc', 'equipmentSet', 'heatPump'], type: 'number' },
            ],
          },
          {
            title: 'Drainage (per lnft)',
            scalars: [
              { label: 'Base cost (includes first 10ft)', path: ['misc', 'drainage', 'baseCost'], type: 'number' },
              { label: 'Included feet', path: ['misc', 'drainage', 'includedFt'], type: 'number' },
              { label: 'Per ft over included', path: ['misc', 'drainage', 'perFtOver'], type: 'number' },
            ],
          },
        ],
      },
      {
        title: 'Masonry',
        groups: [
          {
            title: 'Columns & facing (labor)',
            scalars: [
              { label: 'Column base (per column)', path: ['masonry', 'columnBase'], type: 'number' },
              { label: 'RBB facing labor - tile', path: ['masonry', 'labor', 'rbbFacing', 'tile'], type: 'number' },
              { label: 'RBB facing labor - panel ledge', path: ['masonry', 'labor', 'rbbFacing', 'panelLedge'], type: 'number' },
              { label: 'RBB facing labor - stacked stone', path: ['masonry', 'labor', 'rbbFacing', 'stackedStone'], type: 'number' },
              { label: 'Raised spa facing labor - tile', path: ['masonry', 'labor', 'raisedSpaFacing', 'tile'], type: 'number' },
              { label: 'Raised spa facing labor - ledgestone', path: ['masonry', 'labor', 'raisedSpaFacing', 'ledgestone'], type: 'number' },
              { label: 'Raised spa facing labor - stacked stone', path: ['masonry', 'labor', 'raisedSpaFacing', 'stackedStone'], type: 'number' },
              { label: 'Spillway labor', path: ['masonry', 'labor', 'spillway'], type: 'number' },
            ],
          },
          {
            title: 'Columns & facing (material)',
            scalars: [
              { label: 'Raised spa facing - tile', path: ['masonry', 'raisedSpaFacing', 'tile'], type: 'number' },
              { label: 'Raised spa facing - ledge stone', path: ['masonry', 'raisedSpaFacing', 'ledgestone'], type: 'number' },
              { label: 'Raised spa facing - stacked stone', path: ['masonry', 'raisedSpaFacing', 'stackedStone'], type: 'number' },
              { label: 'RBB facing - tile', path: ['masonry', 'rbbFacing', 'tile'], type: 'number' },
              { label: 'RBB facing - panel ledge', path: ['masonry', 'rbbFacing', 'panelLedge'], type: 'number' },
              { label: 'RBB facing - stacked stone', path: ['masonry', 'rbbFacing', 'stackedStone'], type: 'number' },
              { label: 'RBB facing material - tile', path: ['masonry', 'material', 'rbbFacing', 'tile'], type: 'number' },
              { label: 'RBB facing material - panel ledge', path: ['masonry', 'material', 'rbbFacing', 'panelLedge'], type: 'number' },
              { label: 'RBB facing material - stacked stone', path: ['masonry', 'material', 'rbbFacing', 'stackedStone'], type: 'number' },
              { label: 'Raised spa facing material - tile', path: ['masonry', 'material', 'raisedSpaFacing', 'tile'], type: 'number' },
              { label: 'Raised spa facing material - ledgestone', path: ['masonry', 'material', 'raisedSpaFacing', 'ledgestone'], type: 'number' },
              { label: 'Raised spa facing material - stacked stone', path: ['masonry', 'material', 'raisedSpaFacing', 'stackedStone'], type: 'number' },
              { label: 'Spillway material', path: ['masonry', 'material', 'spillway'], type: 'number' },
            ],
          },
        ],
      },
    ],
    [data.electrical.overrunThreshold, data.plumbing.gasOverrunThreshold, data.plumbing.poolOverrunThreshold, data.plumbing.spaOverrunThreshold],
  );

  const renderScalar = (field: ScalarField) => {
    const value = getValue(data, field.path);
    if (field.type === 'boolean') {
      return (
        <label className="pricing-field">
          <div className="pricing-field__label">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => handleScalarChange(field, e.target.checked)}
            />
            <span>{field.label}</span>
            {field.tooltip && (
              <span
                className="pricing-field__info"
                data-tooltip={field.tooltip}
                aria-label={field.tooltip}
                role="img"
                onMouseEnter={updateTooltipAlign}
              >
                i
              </span>
            )}
          </div>
          {field.note && <div className="pricing-field__note">{field.note}</div>}
        </label>
      );
    }

    return (
      <label className="pricing-field">
        <div className="pricing-field__label">
          <span>{field.label}</span>
            {field.tooltip && (
              <span
                className="pricing-field__info"
                data-tooltip={field.tooltip}
                aria-label={field.tooltip}
                role="img"
                onMouseEnter={updateTooltipAlign}
              >
                i
              </span>
            )}
          </div>
        <div className={`pricing-field__input-wrap${field.prefix ? ' has-prefix' : ''}`}>
          {field.prefix && <span className="pricing-field__prefix">{field.prefix}</span>}
          <input
            className={`pricing-field__input${field.prefix ? ' pricing-field__input--bare' : ''}`}
            type={field.type === 'number' ? 'number' : 'text'}
            value={typeof value === 'number' ? value : value ?? ''}
            onChange={(e) => handleScalarChange(field, e.target.value)}
          />
        </div>
        {field.note && <div className="pricing-field__note">{field.note}</div>}
      </label>
    );
  };

  const renderList = (config: ListConfig) => {
    const entries = (getValue(data, config.path) as any[]) || [];

    return (
      <div className="pricing-list-card">
        <div className="pricing-list-card__header">
          <h5>{config.title}</h5>
          <button className="pricing-chip-button" onClick={() => handleAddListItem(config)}>
            Add
          </button>
        </div>
        <div className="pricing-list-card__body">
          {entries.map((entry, index) => (
            <div key={`${config.title}-${index}`} className="pricing-list-row">
              <div className="pricing-list-row__fields">
                {config.fields.map((field) => {
                  const fieldValue = entry ? entry[field.key] : '';
                  if (field.type === 'boolean') {
                    return (
                      <label key={field.key} className="pricing-field inline">
                        <div className="pricing-field__label">
                          <input
                            type="checkbox"
                            checked={Boolean(fieldValue)}
                            onChange={(e) => handleListChange(config, index, field, e.target.checked)}
                          />
                          <span>{field.label}</span>
                        </div>
                      </label>
                    );
                  }

                  return (
                    <label key={field.key} className="pricing-field inline">
                      <div className="pricing-field__label">{field.label}</div>
                      <div className={`pricing-field__input-wrap${field.prefix ? ' has-prefix' : ''}`}>
                        {field.prefix && <span className="pricing-field__prefix">{field.prefix}</span>}
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          className={`pricing-field__input${field.prefix ? ' pricing-field__input--bare' : ''}`}
                          value={field.type === 'number' ? fieldValue ?? 0 : fieldValue ?? ''}
                          placeholder={field.placeholder}
                          onChange={(e) => handleListChange(config, index, field, e.target.value)}
                        />
                      </div>
                    </label>
                  );
                })}
              </div>
              <button
                className="pricing-chip-button danger"
                onClick={() => handleRemoveListItem(config, index)}
                aria-label="Remove item"
              >
                Remove
              </button>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="pricing-empty">No items yet. Add one to get started.</div>
          )}
        </div>
      </div>
    );
  };

  function renderBaseRanges() {
    const baseRanges = ((getValue(data, ['excavation', 'baseRanges']) as any[]) || []).sort(
      (a, b) => (a?.max ?? 0) - (b?.max ?? 0)
    );
    let previousMax = 0;

    return (
      <div className="pricing-list-card base-ranges-card">
        <div className="pricing-list-card__body base-ranges-body">
          <div className="pricing-fields-grid base-ranges-grid">
            {baseRanges.map((range, index) => {
              const max = range?.max ?? 0;
              const min = index === 0 ? 0 : previousMax + 1;
              const label = `${min}-${max}`;
              previousMax = max;
              const price = range?.price ?? 0;
              return (
                <label key={`base-range-${index}`} className="pricing-field inline">
                  <div className="pricing-field__label">{label}</div>
                  <div className="pricing-field__input-wrap has-prefix">
                    <span className="pricing-field__prefix">$</span>
                    <input
                      type="number"
                      className="pricing-field__input pricing-field__input--bare"
                      value={price}
                      onChange={(e) =>
                        handleListChange(
                          {
                            title: 'Surface area breakpoints',
                            path: ['excavation', 'baseRanges'],
                            fields: [],
                            addLabel: '',
                          },
                          index,
                          { key: 'price', label: 'Price', type: 'number' },
                          e.target.value
                        )
                      }
                    />
                  </div>
                </label>
              );
            })}
            <label className="pricing-field inline">
              <div className="pricing-field__label">1000+</div>
              <div className="pricing-field__input-wrap has-prefix">
                <span className="pricing-field__prefix">$</span>
                <input
                  type="number"
                  className="pricing-field__input pricing-field__input--bare"
                  value={getValue(data, ['excavation', 'over1000Sqft']) ?? ''}
                  onChange={(e) =>
                    handleScalarChange(
                      { label: 'over1000', path: ['excavation', 'over1000Sqft'], type: 'number' },
                      e.target.value
                    )
                  }
                />
              </div>
            </label>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div
      className="pricing-modal-backdrop"
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      onMouseLeave={handleBackdropMouseLeave}
    >
      <div className="pricing-modal">
        <div className="pricing-hero">
          <div>
            <p className="pricing-hero__eyebrow">{currentFranchiseId}</p>
            <h2>Admin Pricing Model Editor</h2>
            <p className="pricing-modal__lede">
              Adjust labor, material, equipment costs, and discounts for each Pricing Model. Select an existing model to edit or create a new one.
            </p>
          </div>
          <button className="pricing-close" onClick={onClose} aria-label="Close pricing data">
            Close
          </button>
        </div>

        <div className="pricing-card pricing-model-panel">
          <div className="pricing-model-panel__header">
            <label className="pricing-input-block grow">
              <span className="pricing-input-block__label">Select Existing Model</span>
              <div className="pricing-select">
                <select value={selectedModelId || ''} onChange={(e) => void handleSelectModel(e.target.value)}>
                  <option value="">Start a new pricing model</option>
                  {pricingModels.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name} {model.isDefault ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            <button className="pricing-chip-button ghost" type="button" onClick={handleCreateNewModel}>
              Create New Model
            </button>
            <button
              className="pricing-chip-button ghost align-right"
              onClick={() => setConfirmResetOpen(true)}
              type="button"
            >
              Reset to Defaults
            </button>
          </div>

          <div className="pricing-model-panel__row">
            <label className="pricing-input-block grow">
              <span className="pricing-input-block__label">Model Name</span>
              <input
                type="text"
                className="pricing-input"
                value={modelName}
                placeholder="'Black Friday', 'Summer Promo', etc."
                onChange={(e) => {
                  setModelName(e.target.value);
                  setHasChanges(true);
                }}
              />
            </label>
            <div className="pricing-model-panel__actions">
              <div
                className="pricing-tooltip"
                data-tooltip={!hasChanges ? 'No changes made' : 'Save recently made changes'}
              >
                <button
                  className={`pricing-chip-button primary ${!hasChanges ? 'disabled' : ''}`}
                  onClick={handleSaveModel}
                  disabled={!hasChanges || savingModel}
                >
                  {savingModel ? 'Saving...' : 'Save Model'}
                </button>
              </div>
            </div>
          </div>

          <div className="pricing-model-panel__info-bar">
            <div className="pricing-model-panel__info-text">
              <span className="pricing-label muted">Editing Pricing Model:</span>{' '}
              <span className="pricing-model-panel__name">{displayModelName}</span>
              {selectedModelIsDefault && <span className="pricing-pill success">Active</span>}
            </div>
            <div className="pricing-model-panel__meta-actions">
              <div
                className="pricing-tooltip"
                data-tooltip={!hasChanges ? 'No changes made' : 'Reset recently made changes'}
              >
                <button
                  className={`pricing-chip-button ${!hasChanges ? 'disabled' : ''}`}
                  type="button"
                  disabled={!selectedModelId || !hasChanges}
                  onClick={() => selectedModelId && void handleLoadModel(selectedModelId)}
                >
                  Reset Changes
                </button>
              </div>
              {showSetActiveButton && (
                <button
                  className="pricing-chip-button"
                  type="button"
                  disabled={!selectedModelId || activatedFlash}
                  onClick={handleActivateSelected}
                >
                  {activatedFlash ? 'Activated!' : 'Set Active'}
                </button>
              )}
              <div
                className="pricing-tooltip"
                data-tooltip={selectedModelIsDefault ? 'Cannot delete active model' : undefined}
              >
                <button
                  className={`pricing-chip-button danger ${selectedModelIsDefault ? 'disabled' : ''}`}
                  type="button"
                  disabled={!selectedModelId || selectedModelIsDefault}
                  onClick={() => {
                    if (!selectedModelId || selectedModelIsDefault) return;
                    setConfirmDeleteModel({
                      id: selectedModelId,
                      name: selectedModel?.name || displayModelName,
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
        </div>
        {saveError && <div className="pricing-model-error">{saveError}</div>}
        </div>


        <div className="pricing-modal__content">
          {sections.map((section) => {
            const open = openSections[section.title] ?? false;
            return (
              <section key={section.title} className={`pricing-section ${open ? 'open' : ''}`}>
                <button className="pricing-section__header" onClick={() => toggleSection(section.title)}>
                  <div className="pricing-section__header-left">
                    {renderSectionIcon(section.title)}
                    <span className="pricing-section__title">{section.title}</span>
                  </div>
                  <span className={`chevron ${open ? 'open' : ''}`}>{'>'}</span>
                </button>
                <div
                  className={`pricing-section__body ${
                    open ? 'pricing-section__body--open' : 'pricing-section__body--closed'
                  }`}
                >
                  <div className="pricing-section__body-content">
                    {section.groups.map((group) => (
                      <div key={group.title} className="pricing-group">
                      <div className="pricing-group__heading">
                        <h4>{group.title}</h4>
                      </div>
                      {group.render && <div className="pricing-group__custom">{group.render()}</div>}
                      {group.scalars && (
                        <div className="pricing-fields-grid">
                          {group.scalars.map((field) => (
                            <React.Fragment key={`${section.title}-${group.title}-${field.label}`}>
                              {renderScalar(field)}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        {group.lists && (
                          <div className="pricing-lists">
                            {group.lists.map((list) => (
                              <React.Fragment key={`${group.title}-${list.title}`}>
                                {renderList(list)}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {(confirmDeleteModel || confirmResetOpen) && (
        <div className="pricing-confirm-backdrop">
          <div className="pricing-confirm-card">
            <div className="pricing-confirm-message">
              {confirmDeleteModel
                ? `Are you sure you want to remove the '${confirmDeleteModel.name}' price model?`
                : `Are you sure you want to reset '${displayModelName}' back to default?`}
            </div>
            <div className="pricing-confirm-actions">
              <button
                className="pricing-chip-button danger"
                type="button"
                onClick={() => {
                  if (confirmDeleteModel) {
                    void handleDeleteModel(confirmDeleteModel.id, false);
                    setConfirmDeleteModel(null);
                    setHasChanges(false);
                  } else {
                    resetPricingData();
                    setConfirmResetOpen(false);
                    setHasChanges(true);
                  }
                }}
              >
                I'm sure
              </button>
              <button
                className="pricing-chip-button ghost"
                type="button"
                onClick={() => {
                  setConfirmDeleteModel(null);
                  setConfirmResetOpen(false);
                }}
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PricingDataModal;
