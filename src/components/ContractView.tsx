import {
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
import { useToast } from './Toast';
import './ContractView.css';

GlobalWorkerOptions.workerSrc = pdfWorker;

const DISPLAY_SCALE = 1.75;
const MAX_RENDER_DPR = 3;

type ContractViewProps = {
  proposal: Proposal;
  overrides?: ContractOverrides;
  readOnly?: boolean;
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
    onOverridesChange,
    onSave,
    onDirtyChange,
    onExportingChange,
    onSavingChange,
  },
  ref
) {
  const { showToast } = useToast();
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
        const hydrated = await getEditableContractFields(proposal, overrides);
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
  }, [proposal, overrides, showToast]);

  useEffect(() => {
    if (!fields.length) return;
    let canceled = false;
    (async () => {
      try {
        const result = await buildContractPdf(fields, {
          includeFormFields: false,
          flatten: false,
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
  }, [fields, showToast]);

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
    () => new Set(fields.filter((f) => !f.value && f.color === 'blue').map((f) => f.id)),
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
  }, [exporting, fields, proposal.customerInfo.customerName, showToast, warnings]);

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
              const fieldsForPage = pdfFields.filter((f) => f.pageIndex === pageIdx);
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
                      const left = field.x * DISPLAY_SCALE;
                      const top = field.y * DISPLAY_SCALE;
                      const width = field.width * DISPLAY_SCALE;
                      const height = field.height * DISPLAY_SCALE;
                      const value = fieldMeta?.value ?? valueMap.get(field.name);
                      const isTextArea = (fieldMeta?.height ?? field.height) > 24;
                      const isAutoFilled = Boolean(fieldMeta?.isAutoFilled) && baseColor !== 'yellow';
                      const colorClass =
                        baseColor === 'yellow'
                          ? 'contract-input-yellow'
                          : isAutoFilled
                          ? 'contract-input-green'
                          : 'contract-input-blue';
                      const style: CSSProperties = {
                        left: `${left}px`,
                        top: `${top}px`,
                        width: `${width}px`,
                        height: `${height}px`,
                        fontSize: `${field.fontSize || 10}pt`,
                        textAlign: 'center',
                      };
                      const classNames = ['contract-input', colorClass];
                      if (isAutoFilled) classNames.push('autofilled');
                      if (unmappedIds.has(field.name)) classNames.push('unmapped');

                      return (
                        <div key={`${field.name}-${pageIdx}`} className="contract-input-wrapper" style={style}>
                          {editableEnabled ? (
                            isTextArea ? (
                              <textarea
                                className={classNames.join(' ')}
                                value={value ?? ''}
                                onChange={(e) => handleCellChange(field.name, e.target.value)}
                              />
                            ) : (
                              <input
                                className={classNames.join(' ')}
                                value={value ?? ''}
                                onChange={(e) => handleCellChange(field.name, e.target.value)}
                              />
                            )
                          ) : (
                            <div
                              className={['contract-readonly-value', colorClass].join(' ')}
                              aria-label={field.name}
                            >
                              {value}
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
