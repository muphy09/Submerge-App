import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Proposal } from '../types/proposal-new';
import {
  ContractOverrides,
  ContractFieldRender,
  getEditableContractFields,
  listUnmappedFields,
  validateContractInputs,
} from '../services/contractGenerator';
import { buildContractPdf, ContractPdfFieldLayout } from '../services/contractPdf';
import { useToast } from './Toast';
import './ContractView.css';

GlobalWorkerOptions.workerSrc = pdfWorker;

const DISPLAY_SCALE = 1.6;
const MAX_RENDER_DPR = 2;

type ContractViewProps = {
  proposal: Proposal;
  overrides?: ContractOverrides;
  readOnly?: boolean;
  onOverridesChange?: (overrides: ContractOverrides) => void;
  onSave?: (overrides: ContractOverrides) => Promise<void> | void;
};

export default function ContractView({
  proposal,
  overrides: incomingOverrides,
  readOnly = false,
  onOverridesChange,
  onSave,
}: ContractViewProps) {
  const { showToast } = useToast();
  const [overrides, setOverrides] = useState<ContractOverrides>(incomingOverrides || {});
  const [exporting, setExporting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfFields, setPdfFields] = useState<ContractPdfFieldLayout[]>([]);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [fields, setFields] = useState<ContractFieldRender[]>([]);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    setOverrides(incomingOverrides || {});
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
          canvas.width = renderViewport.width;
          canvas.height = renderViewport.height;
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;
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

  const unmapped = useMemo(() => listUnmappedFields(fields), [fields]);
  const unmappedIds = useMemo(
    () => new Set(fields.filter((f) => !f.value && f.color === 'blue').map((f) => f.id)),
    [fields]
  );
  const warnings = useMemo(() => validateContractInputs(proposal), [proposal]);

  const valueMap = useMemo(() => {
    const map = new Map<string, string>();
    fields.forEach((field) => map.set(field.id, field.value));
    return map;
  }, [fields]);

  const handleCellChange = (cellAddress: string, value: string) => {
    const next = { ...overrides, [cellAddress]: value };
    setOverrides(next);
    setFields((prev) =>
      prev.map((field) => (field.id === cellAddress ? { ...field, value } : field))
    );
    onOverridesChange?.(next);
  };

  const handleSave = async () => {
    if (!onSave) return;
    try {
      await onSave(overrides);
      showToast({ type: 'success', message: 'Contract overrides saved.' });
    } catch (error) {
      console.error('Failed to save contract overrides', error);
      showToast({ type: 'error', message: 'Could not save contract overrides.' });
    }
  };

  const exportPdf = async () => {
    if (!fields.length) return;
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
      const blob = new Blob([result.pdfBytes], { type: 'application/pdf' });
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
  };

  if (!fields.length) {
    return <div className="contract-view-empty">No contract data available.</div>;
  }

  const pageCount = pageSizes.length || 0;
  const editableEnabled = !readOnly && !previewMode;

  return (
    <div className="contract-view">
      <div className="contract-toolbar">
        <div className="contract-toolbar-left">
          <button type="button" className="btn" onClick={() => setPreviewMode((prev) => !prev)}>
            {previewMode ? 'Exit Read Only' : 'Toggle Read Only'}
          </button>
          <button type="button" className="btn" onClick={exportPdf} disabled={exporting}>
            {exporting ? 'Exporting...' : 'Export PDF'}
          </button>
          <button type="button" className="btn" onClick={() => window.print()}>
            Print
          </button>
        </div>
        <div className="contract-toolbar-right">
          {onSave && (
            <button type="button" className="btn primary" onClick={handleSave}>
              Save Contract Overrides
            </button>
          )}
        </div>
      </div>

      {unmapped.length ? (
        <div className="contract-unmapped">
          <strong>Designer inputs:</strong>{' '}
          {unmapped.join(', ')} need manual confirmation.
        </div>
      ) : null}
      {warnings.length ? (
        <div className="contract-warnings">
          <strong>Missing data:</strong> {warnings.join(', ')}
        </div>
      ) : null}

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
                    const left = field.x * DISPLAY_SCALE;
                    const top = field.y * DISPLAY_SCALE;
                    const width = field.width * DISPLAY_SCALE;
                    const height = field.height * DISPLAY_SCALE;
                    const value = valueMap.get(field.name);
                    const isTextArea = field.height > 24;
                    const colorClass =
                      field.color === 'yellow' ? 'contract-input-yellow' : 'contract-input-blue';
                    const style: CSSProperties = {
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${width}px`,
                      height: `${height}px`,
                      fontSize: `${field.fontSize || 10}pt`,
                      textAlign: 'center',
                    };
                    const classNames = ['contract-input', colorClass];
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
    </div>
  );
}
