import React, {
  CSSProperties,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Proposal } from '../types/proposal-new';
import {
  ContractOverrides,
  ContractFieldRender,
  getEditableContractFields,
  validateContractInputs,
} from '../services/contractGenerator';
import { buildContractPdf, ContractPdfFieldLayout } from '../services/contractPdf';
import { ContractTemplateId, getContractTemplateIdForProposal } from '../services/contractTemplates';
import { useToast } from './Toast';
import './ContractView.css';

GlobalWorkerOptions.workerSrc = pdfWorker;

const DISPLAY_SCALE = 1.75;
const MAX_RENDER_DPR = 3;
const CONTRACT_DATE_FIELD_IDS = new Set(['p1_8', 'p1_9']);
const ADDITIONAL_SPEC_FIELD_IDS = [
  'p2_additional_spec_73',
  'p2_additional_spec_74',
  'p2_additional_spec_75',
  'p2_additional_spec_76',
  'p2_additional_spec_77',
  'p2_additional_spec_78',
  'p2_additional_spec_79',
  'p2_additional_spec_80',
  'p2_additional_spec_81',
  'p2_additional_spec_82',
];
const OPTIONAL_FIELD_IDS = new Set([
  'p1_16', // optional: freeform depth note
  'p1_rbb_6',
  'p1_rbb_12',
  'p1_rbb_18',
  'p1_rbb_24',
  'p1_rbb_30',
  'p1_rbb_36',
  'p1_rbb_42',
  'p1_rbb_48',
  ...ADDITIONAL_SPEC_FIELD_IDS,
]);
const BINARY_FIELD_GROUPS = [
  { yesId: 'p1_17', noId: 'p1_18' }, // HOA approval required
  { yesId: 'p1_19', noId: 'p1_20' }, // Financing required
] as const;
const RESPONSIBILITY_FIELD_IDS = new Set([
  'p1_gc_1',
  'p1_gc_2',
  'p1_gc_3',
  'p1_gc_4',
  'p1_gc_5',
  'p1_gc_6',
  'p1_gc_7',
  'p1_gc_8',
  'p1_gc_9',
  'p1_39', // Plumbing & Equipment - Decking drainage responsibility
  'p1_40', // Plumbing & Equipment - Downspout drainage responsibility
  'p1_15_resp', // Plumbing & Equipment - Skimmer responsibility (left column)
  'p1_16_resp', // Plumbing & Equipment - Surface Returns responsibility (left column)
  'p1_17_resp', // Plumbing & Equipment - Auto-Fill responsibility (left column)
  'p1_18_resp', // Plumbing & Equipment - Plumbing/piping responsibility (left column)
  'p1_19_resp', // Plumbing & Equipment - Equipment pad responsibility (left column)
  'p2_51', // Electrical connection responsibility
  'p2_55', // Electrical bonding responsibility
  'p2_57', // House panel upgrade responsibility
]);
const GENERAL_CONSTRUCTION_RESPONSIBILITY_IDS = new Set([
  'p1_gc_1',
  'p1_gc_2',
  'p1_gc_3',
  'p1_gc_4',
  'p1_gc_5',
  'p1_gc_6',
  'p1_gc_7',
  'p1_gc_8',
  'p1_gc_9',
]);
const GENERAL_CONSTRUCTION_MIN_WIDTH = 78;
const GENERAL_CONSTRUCTION_MIN_HEIGHT = 18;
const RESPONSIBILITY_OPTIONS = ['BY BUILDER', 'BY BUYER'];
const FIELD_PLACEHOLDERS: Record<string, string> = Object.fromEntries(
  ADDITIONAL_SPEC_FIELD_IDS.map((id) => [id, 'N/A'])
);
const CUSTOM_SELECT_FIELDS: Record<string, string[]> = {
  p1_28: ['None', 'BY BUILDER', 'BY BUYER'], // Gas line
  p1_29: ['None', 'NATURAL GAS', 'PROPANE'], // Line type
  p1_32: ['None', 'Trim Tile', 'Marker Tiles'], // Accent tile on steps/benches
  p2_68: ['NO', 'YES'], // Valve actuator for water features
  p2_74: ['NONE', 'CONCRETE', 'METAL', 'OTHER'], // Bowls
  p2_80: ['NONE', 'STANDARD', 'METAL'], // Scuppers or sconces
  p2_91: ['BY BUILDER', 'BY BUYER'], // Initial filling responsibility
  p2_92: ['BY BUILDER', 'BY BUYER'], // Brushing responsibility
  p2_93: ['BY BUILDER', 'BY BUYER'], // Start-up responsibility
  p2_94: ['YES', 'NO'], // 30 days service
  p2_56: ['NONE', 'Tile', 'Travertine', 'Stone'], // Damwall
  p2_58: ['NO', 'YES'], // Blower
  p2_62: ['NO', 'YES'], // Low water returns
  p2_65: ['NO', 'YES'], // Booster pump for spa jets
  p2_67: ['NO', 'YES'], // Raised spa
};
const BINARY_FIELD_MAP = new Map<string, { yesId: string; noId: string }>(
  BINARY_FIELD_GROUPS.flatMap((group) => [
    [group.yesId, group],
    [group.noId, group],
  ])
);

type DateParts = { year: number; month: number; day: number };

function parseDateParts(raw?: string | null): DateParts | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
  }

  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const [, m, d, y] = slashMatch;
    const month = Number(m);
    const day = Number(d);
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { year, month, day };
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return { year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate() };
  }

  return null;
}

function toDateInputValue(raw?: string | null): string {
  const parts = parseDateParts(raw);
  if (!parts) return '';
  const { year, month, day } = parts;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateForDisplay(raw?: string | null): string {
  const parts = parseDateParts(raw);
  if (!parts) return '';
  return `${parts.month}/${parts.day}/${parts.year}`;
}

type ContractViewProps = {
  proposal: Proposal;
  overrides?: ContractOverrides;
  readOnly?: boolean;
  contractTemplateId?: ContractTemplateId;
  onOverridesChange?: (overrides: ContractOverrides) => void;
  onSave?: (overrides: ContractOverrides) => Promise<void> | void;
  onDirtyChange?: (dirty: boolean) => void;
  onExportingChange?: (exporting: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
};

export type ContractViewHandle = {
  exportPdf: () => Promise<void>;
  printContract: () => void;
  saveOverrides: () => Promise<void> | void;
  hasUnsavedChanges: boolean;
  isExporting: boolean;
  isSaving: boolean;
};

function normalizeOverrides(map?: ContractOverrides): Record<string, string> {
  const result: Record<string, string> = {};
  if (!map) return result;
  Object.entries(map).forEach(([key, value]) => {
    if (value === undefined) return;
    result[key] = value === null ? '' : String(value);
  });
  return result;
}

function areOverridesEqual(a?: ContractOverrides, b?: ContractOverrides): boolean {
  const normalizedA = normalizeOverrides(a);
  const normalizedB = normalizeOverrides(b);
  const keys = new Set([...Object.keys(normalizedA), ...Object.keys(normalizedB)]);
  for (const key of keys) {
    if (normalizedA[key] !== normalizedB[key]) return false;
  }
  return true;
}

const ContractView = forwardRef<ContractViewHandle, ContractViewProps>(function ContractView(
  {
    proposal,
    overrides: incomingOverrides,
    readOnly = false,
    contractTemplateId,
    onOverridesChange,
    onSave,
    onDirtyChange,
    onExportingChange,
    onSavingChange,
  },
  ref
) {
  const { showToast } = useToast();
  const resolvedTemplateId = contractTemplateId || getContractTemplateIdForProposal(proposal);
  const [overrides, setOverrides] = useState<ContractOverrides>(incomingOverrides || {});
  const [baselineOverrides, setBaselineOverrides] = useState<ContractOverrides>(incomingOverrides || {});
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfFields, setPdfFields] = useState<ContractPdfFieldLayout[]>([]);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [fields, setFields] = useState<ContractFieldRender[]>([]);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    setOverrides(incomingOverrides || {});
    setBaselineOverrides(incomingOverrides || {});
  }, [incomingOverrides]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const hydrated = await getEditableContractFields(proposal, overrides, resolvedTemplateId);
        if (!canceled) setFields(hydrated);
      } catch (error) {
        console.error('Unable to build contract view', error);
        if (!canceled) {
          showToast({ type: 'error', message: 'Could not build contract view.' });
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [proposal, overrides, resolvedTemplateId, showToast]);

  useEffect(() => {
    if (!fields.length) return;
    let canceled = false;
    (async () => {
      try {
        const result = await buildContractPdf(fields, {
          includeFormFields: false,
          flatten: false,
          templateId: resolvedTemplateId,
        });
        if (!canceled) {
          setPdfBytes(result.pdfBytes);
          setPdfFields(result.fields);
          setPageSizes(result.pageSizes);
        }
      } catch (error) {
        console.error('Unable to build contract PDF', error);
        if (!canceled) {
          showToast({ type: 'error', message: 'Could not build contract PDF.' });
        }
      }
    })();
    return () => {
      canceled = true;
    };
  }, [fields, resolvedTemplateId, showToast]);

  useEffect(() => {
    if (!pdfBytes || !pageSizes.length) return;
    const loadingTask = getDocument({ data: pdfBytes });
    let canceled = false;

    loadingTask.promise
      .then(async (pdfDoc) => {
        for (let i = 1; i <= pdfDoc.numPages; i += 1) {
          if (canceled) break;
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: DISPLAY_SCALE });
          const dpr =
            typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR) : 1;
          const renderViewport = page.getViewport({ scale: dpr * DISPLAY_SCALE });
          const canvas = canvasRefs.current[i - 1];
          if (!canvas) continue;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.imageSmoothingEnabled = true;
          (ctx as any).imageSmoothingQuality = 'high';
          canvas.width = renderViewport.width;
          canvas.height = renderViewport.height;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          await page.render({ canvasContext: ctx, viewport: renderViewport, canvas }).promise;
        }
        pdfDoc.destroy();
      })
      .catch((error) => {
        console.error('Failed to render contract PDF', error);
      });

    return () => {
      canceled = true;
      loadingTask.destroy();
    };
  }, [pdfBytes, pageSizes]);

  const unmappedIds = useMemo(
    () => new Set(fields.filter((f) => !f.value && f.color === 'blue' && !OPTIONAL_FIELD_IDS.has(f.id)).map((f) => f.id)),
    [fields]
  );
  const warnings = useMemo(() => validateContractInputs(proposal), [proposal]);

  const hasUnsavedChanges = useMemo(
    () => !areOverridesEqual(overrides, baselineOverrides),
    [overrides, baselineOverrides]
  );

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  useEffect(() => {
    onExportingChange?.(exporting);
  }, [exporting, onExportingChange]);

  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);

  const valueMap = useMemo(() => {
    const map = new Map<string, string>();
    fields.forEach((field) => map.set(field.id, field.value));
    return map;
  }, [fields]);

  const fieldMetaMap = useMemo(() => {
    const map = new Map<string, ContractFieldRender>();
    fields.forEach((field) => map.set(field.id, field));
    return map;
  }, [fields]);

  const handleCellChange = useCallback(
    (cellAddress: string, value: string) => {
      const fieldTemplate = fields.find((f) => f.id === cellAddress);
      const autoValue = fieldTemplate?.autoValue ?? '';
      const normalizedValue = value;
      const next = { ...overrides };

      if (normalizedValue === autoValue || (!normalizedValue && !autoValue)) {
        delete next[cellAddress];
      } else {
        next[cellAddress] = normalizedValue;
      }

      setOverrides(next);
      setFields((prev) =>
        prev.map((field) => {
          if (field.id !== cellAddress) return field;
          const hasOverride = Object.prototype.hasOwnProperty.call(next, cellAddress);
          return {
            ...field,
            value: normalizedValue,
            isAutoFilled: !hasOverride && Boolean(field.autoValue),
            isOverridden: hasOverride,
          };
        })
      );
      onOverridesChange?.(next);
    },
    [fields, onOverridesChange, overrides]
  );

  const handleBinaryChoice = useCallback(
    (targetId: string) => {
      const group = BINARY_FIELD_MAP.get(targetId);
      if (!group) return;
      const otherId = targetId === group.yesId ? group.noId : group.yesId;
      const next = { ...overrides, [targetId]: 'X' };
      delete next[otherId];

      setOverrides(next);
      setFields((prev) =>
        prev.map((field) => {
          if (field.id === targetId) {
            return { ...field, value: 'X', isAutoFilled: false, isOverridden: true };
          }
          if (field.id === otherId) {
            const autoValue = field.autoValue || '';
            return { ...field, value: autoValue, isAutoFilled: Boolean(autoValue), isOverridden: false };
          }
          return field;
        })
      );
      onOverridesChange?.(next);
    },
    [overrides, onOverridesChange]
  );

  const handleSave = useCallback(async () => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await onSave(overrides);
      setBaselineOverrides(overrides);
    } catch (error) {
      console.error('Failed to save contract overrides', error);
      showToast({ type: 'error', message: 'Could not save contract overrides.' });
    } finally {
      setSaving(false);
    }
  }, [onSave, overrides, saving, showToast]);

  const exportPdf = useCallback(async () => {
    if (!fields.length || exporting) return;
    setExporting(true);
    try {
      if (warnings.length) {
        showToast({
          type: 'warning',
          message: `Missing data: ${warnings.join(', ')}`,
        });
      }
      const result = await buildContractPdf(fields, {
        flatten: true,
        includeFormFields: true,
        templateId: resolvedTemplateId,
      });

      const customerName = proposal.customerInfo.customerName || 'Proposal';
      const today = new Date();
      const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        today.getDate()
      ).padStart(2, '0')}`;
      const pdfBytes = new Uint8Array(result.pdfBytes);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${customerName}-contract-${formattedDate}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      showToast({ type: 'success', message: 'Contract PDF generated.' });
    } catch (error) {
      console.error('Failed to export contract PDF', error);
      showToast({ type: 'error', message: 'Could not export contract PDF.' });
    } finally {
      setExporting(false);
    }
  }, [exporting, fields, proposal.customerInfo.customerName, resolvedTemplateId, showToast, warnings]);

  const printContract = useCallback(() => {
    if (warnings.length) {
      showToast({
        type: 'warning',
        message: `Missing data: ${warnings.join(', ')}`,
      });
    }
    window.print();
  }, [showToast, warnings]);

  const pageCount = pageSizes.length || 0;
  const editableEnabled = !readOnly;

  useImperativeHandle(
    ref,
    () => ({
      exportPdf,
      printContract,
      saveOverrides: handleSave,
      hasUnsavedChanges,
      isExporting: exporting,
      isSaving: saving,
    }),
    [exportPdf, handleSave, hasUnsavedChanges, printContract, exporting, saving]
  );

  return (
    <div className="contract-view">
      {!fields.length ? (
        <div className="contract-view-empty">No contract data available.</div>
      ) : (
        <div className="contract-pages">
          {!pdfBytes || !pageCount ? (
            <div className="contract-view-empty">Preparing contract PDF...</div>
          ) : (
            Array.from({ length: pageCount }).map((_, pageIdx) => {
              const pageSize = pageSizes[pageIdx] || { width: 612, height: 792 };
              const pdfFieldsForPage = pdfFields.filter((f) => f.pageIndex === pageIdx);
              const responsibilityFallbackFields = fields
                .filter((f) => RESPONSIBILITY_FIELD_IDS.has(f.id) && f.page === pageIdx + 1)
                .filter((f) => !pdfFieldsForPage.some((pf) => pf.name === f.id))
                .map((f) => ({
                  name: f.id,
                  pageIndex: pageIdx,
                  x: f.x,
                  y: f.y,
                  width: f.width,
                  height: f.height,
                  fontSize: Math.min(10, f.height || 10),
                  color: f.color,
                }));
              const fieldsForPage = [...pdfFieldsForPage, ...responsibilityFallbackFields].sort((a, b) => {
                const aResp = RESPONSIBILITY_FIELD_IDS.has(a.name);
                const bResp = RESPONSIBILITY_FIELD_IDS.has(b.name);
                if (aResp === bResp) return 0;
                return aResp ? 1 : -1;
              });
              const pageWidth = pageSize.width * DISPLAY_SCALE;
              const pageHeight = pageSize.height * DISPLAY_SCALE;
              return (
                <div
                  className="contract-page"
                  key={`contract-page-${pageIdx + 1}`}
                  data-page={pageIdx + 1}
                  style={{ width: `${pageWidth}px`, height: `${pageHeight}px` }}
                >
                  <canvas
                    ref={(el) => {
                      canvasRefs.current[pageIdx] = el;
                    }}
                    className="contract-page-canvas"
                  />
                  <div className={`contract-field-layer ${editableEnabled ? '' : 'read-only'}`}>
                    {fieldsForPage.map((field) => {
                      const fieldMeta = fieldMetaMap.get(field.name);
                      const baseColor = fieldMeta?.color || field.color;
                      const baseLeft = field.x * DISPLAY_SCALE;
                      const baseTop = field.y * DISPLAY_SCALE;
                      const baseWidth = field.width * DISPLAY_SCALE;
                      const baseHeight = field.height * DISPLAY_SCALE;
                      const value = fieldMeta?.value ?? valueMap.get(field.name);
                      const isDateField = CONTRACT_DATE_FIELD_IDS.has(field.name);
                      const parsedDateValue = isDateField ? toDateInputValue(value ?? '') : '';
                      const displayValue = isDateField ? parsedDateValue : value ?? '';
                      const placeholderValue = isDateField
                        ? !parsedDateValue
                          ? value
                            ? String(value)
                            : undefined
                          : undefined
                        : FIELD_PLACEHOLDERS[field.name];
                      const readOnlyValue = isDateField ? formatDateForDisplay(value ?? '') || value : value;
                      const handleValueChange = (nextValue: string) =>
                        handleCellChange(field.name, isDateField ? formatDateForDisplay(nextValue) : nextValue);
                      const handleDateMouseDown = (event: React.MouseEvent<HTMLInputElement>) => {
                        if (!isDateField) return;
                        const input = event.currentTarget as HTMLInputElement & { showPicker?: () => void };
                        if (typeof input.showPicker === 'function') {
                          event.preventDefault();
                          input.showPicker();
                          return;
                        }
                        input.focus();
                      };
                      const isTextArea = (fieldMeta?.height ?? field.height) > 24;
                      const isResponsibilitySelect = RESPONSIBILITY_FIELD_IDS.has(field.name);
                      const isGeneralConstructionResponsibility =
                        isResponsibilitySelect && GENERAL_CONSTRUCTION_RESPONSIBILITY_IDS.has(field.name);
                      const customSelectOptions = CUSTOM_SELECT_FIELDS[field.name];
                      const isCustomSelect = Boolean(customSelectOptions);
                      const normalizedDisplayValue =
                        displayValue === undefined || displayValue === null ? '' : String(displayValue);
                      const displayMatchesCustomOption =
                        isCustomSelect && Boolean(customSelectOptions?.includes(normalizedDisplayValue));
                      const customSelectValue = isCustomSelect
                        ? displayMatchesCustomOption || !normalizedDisplayValue
                          ? normalizedDisplayValue || customSelectOptions?.[0] || ''
                          : normalizedDisplayValue
                        : '';
                      const hasCustomSelectValue = isCustomSelect && Boolean(normalizedDisplayValue) && !displayMatchesCustomOption;
                      const isAutoFilled = Boolean(fieldMeta?.isAutoFilled) && baseColor !== 'yellow';
                      const showAutoFilledState = isResponsibilitySelect ? false : isAutoFilled;
                      const colorClass =
                        baseColor === 'yellow'
                          ? 'contract-input-yellow'
                          : showAutoFilledState
                          ? 'contract-input-green'
                          : 'contract-input-blue';
                      let left = baseLeft;
                      let top = baseTop;
                      let width = baseWidth;
                      let height = baseHeight;
                      if (isGeneralConstructionResponsibility) {
                        if (width < GENERAL_CONSTRUCTION_MIN_WIDTH) {
                          const delta = GENERAL_CONSTRUCTION_MIN_WIDTH - width;
                          left -= delta / 2;
                          width = GENERAL_CONSTRUCTION_MIN_WIDTH;
                        }
                        if (height < GENERAL_CONSTRUCTION_MIN_HEIGHT) {
                          const delta = GENERAL_CONSTRUCTION_MIN_HEIGHT - height;
                          top -= delta / 2;
                          height = GENERAL_CONSTRUCTION_MIN_HEIGHT;
                        }
                      }
                      const style: CSSProperties = {
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                        fontSize: `${field.fontSize || 10}pt`,
                        textAlign: 'center',
                      };
                      const classNames = ['contract-input', colorClass];
                      if (showAutoFilledState) classNames.push('autofilled');
                      if (unmappedIds.has(field.name)) classNames.push('unmapped');
                      if (isGeneralConstructionResponsibility) classNames.push('gc-responsibility');
                      const binaryGroup = BINARY_FIELD_MAP.get(field.name);
                      const isBinaryChoice = Boolean(binaryGroup);
                      let binarySelectedId: string | null = null;
                      if (binaryGroup) {
                        const yesVal =
                          (fieldMetaMap.get(binaryGroup.yesId)?.value ?? valueMap.get(binaryGroup.yesId) ?? '').trim();
                        const noVal =
                          (fieldMetaMap.get(binaryGroup.noId)?.value ?? valueMap.get(binaryGroup.noId) ?? '').trim();
                        binarySelectedId = yesVal ? binaryGroup.yesId : noVal ? binaryGroup.noId : null;
                      }
                      const isBinarySelected = isBinaryChoice && field.name === binarySelectedId;
                      const hasBinarySelection = Boolean(binarySelectedId);
                      const binaryClasses = [
                        'contract-choice',
                        colorClass,
                        isBinarySelected ? 'selected' : '',
                        !hasBinarySelection ? 'unmapped' : '',
                        editableEnabled ? '' : 'read-only',
                      ]
                        .filter(Boolean)
                        .join(' ');
                      const wrapperClassNames = ['contract-input-wrapper'];
                      if (isResponsibilitySelect) wrapperClassNames.push('responsibility-wrapper');
                      if (isGeneralConstructionResponsibility) wrapperClassNames.push('gc-responsibility');
                      return (
                        <div key={`${field.name}-${pageIdx}`} className={wrapperClassNames.join(' ')} style={style}>
                          {isBinaryChoice ? (
                            <button
                              type="button"
                              className={binaryClasses}
                              onClick={() => {
                                if (!editableEnabled) return;
                                handleBinaryChoice(field.name);
                              }}
                              aria-pressed={isBinarySelected}
                              aria-label={`${field.label || field.name} ${isBinarySelected ? 'selected' : 'not selected'}`}
                            >
                              {isBinarySelected ? 'X' : ''}
                            </button>
                          ) : isResponsibilitySelect ? (
                            editableEnabled ? (
                              <select
                                className={[...classNames, 'contract-select'].join(' ')}
                                value={displayValue}
                                onChange={(e) => handleValueChange(e.target.value)}
                              >
                                {RESPONSIBILITY_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div
                                className={[
                                  'contract-readonly-value',
                                  colorClass,
                                  isGeneralConstructionResponsibility ? 'gc-responsibility' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                aria-label={field.name}
                              >
                                {readOnlyValue}
                              </div>
                            )
                          ) : isCustomSelect ? (
                            editableEnabled ? (
                              <select
                                className={[...classNames, 'contract-select'].join(' ')}
                                value={customSelectValue}
                                onChange={(e) => handleValueChange(e.target.value)}
                              >
                                {hasCustomSelectValue ? (
                                  <option value={normalizedDisplayValue}>{normalizedDisplayValue}</option>
                                ) : null}
                                {(customSelectOptions || []).map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div
                                className={['contract-readonly-value', colorClass].join(' ')}
                                aria-label={field.name}
                              >
                                {readOnlyValue}
                              </div>
                            )
                          ) : editableEnabled ? (
                            isTextArea ? (
                              <textarea
                                className={classNames.join(' ')}
                                value={displayValue}
                                onChange={(e) => handleValueChange(e.target.value)}
                              />
                            ) : (
                              <input
                                className={classNames.join(' ')}
                                type={isDateField ? 'date' : 'text'}
                                value={displayValue}
                                placeholder={placeholderValue}
                                onMouseDown={handleDateMouseDown}
                                onChange={(e) => handleValueChange(e.target.value)}
                              />
                            )
                          ) : (
                            <div
                              className={['contract-readonly-value', colorClass].join(' ')}
                              aria-label={field.name}
                            >
                              {readOnlyValue}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
});

export default ContractView;
