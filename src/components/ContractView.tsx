import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Proposal } from '../types/proposal-new';
import {
  ContractOverrides,
  ContractSheetRender,
  getEditableContractJson,
  listUnmappedFields,
  validateContractInputs,
} from '../services/contractGenerator';
import { buildContractPdf, ContractPdfFieldLayout } from '../services/contractPdf';
import { useToast } from './Toast';
import './ContractView.css';
import submergeLogo from '../../Submerge Logo.png';

GlobalWorkerOptions.workerSrc = pdfWorker;

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
  const [sheet, setSheet] = useState<ContractSheetRender | null>(null);
  const [exporting, setExporting] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfFields, setPdfFields] = useState<ContractPdfFieldLayout[]>([]);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [logoBytes, setLogoBytes] = useState<ArrayBuffer | null>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  useEffect(() => {
    setOverrides(incomingOverrides || {});
  }, [incomingOverrides]);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const response = await fetch(submergeLogo);
        const data = await response.arrayBuffer();
        if (!canceled) setLogoBytes(data);
      } catch (error) {
        console.warn('Unable to load contract logo', error);
      }
    })();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const hydrated = await getEditableContractJson(proposal, overrides);
        if (!canceled) setSheet(hydrated);
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
    if (!sheet) return;
    let canceled = false;
    (async () => {
      try {
        const result = await buildContractPdf(sheet, {
          includeFormFields: true,
          flatten: false,
          logoBytes,
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
  }, [sheet, logoBytes, showToast]);

  useEffect(() => {
    if (!pdfBytes || !pageSizes.length) return;
    const loadingTask = getDocument({ data: pdfBytes });
    let canceled = false;

    loadingTask.promise
      .then(async (pdfDoc) => {
        for (let i = 1; i <= pdfDoc.numPages; i += 1) {
          if (canceled) break;
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
          const renderViewport = page.getViewport({ scale: dpr });
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

  const unmapped = useMemo(() => listUnmappedFields(), []);
  const unmappedCells = useMemo(() => new Set(unmapped.map((f) => f.cell)), [unmapped]);
  const warnings = useMemo(() => validateContractInputs(proposal), [proposal]);

  const cellValueMap = useMemo(() => {
    const map = new Map<string, string | number | null>();
    sheet?.rows.forEach((row) =>
      row.forEach((cell) => {
        map.set(cell.address, cell.value);
      })
    );
    return map;
  }, [sheet]);

  const handleCellChange = (cellAddress: string, value: string) => {
    const next = { ...overrides, [cellAddress]: value };
    setOverrides(next);
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
    if (!sheet) return;
    setExporting(true);
    try {
      if (warnings.length) {
        showToast({
          type: 'warning',
          message: `Missing data: ${warnings.join(', ')}`,
        });
      }
      const result = await buildContractPdf(sheet, {
        flatten: true,
        includeFormFields: true,
        logoBytes,
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

  if (!sheet) {
    return <div className="contract-view-empty">No contract data available.</div>;
  }

  const pageCount = pageSizes.length || 0;
  const editableEnabled = !readOnly && !previewMode;

  const getFieldValue = (address: string) => {
    if (overrides[address] !== undefined && overrides[address] !== null) {
      return overrides[address] as string | number;
    }
    return cellValueMap.get(address) ?? '';
  };

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
          {unmapped.map((f) => f.label || f.cell).join(', ')} need manual confirmation.
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
            return (
              <div
                className="contract-page"
                key={`contract-page-${pageIdx + 1}`}
                data-page={pageIdx + 1}
                style={{ width: `${pageSize.width}px`, height: `${pageSize.height}px` }}
              >
                <canvas
                  ref={(el) => {
                    canvasRefs.current[pageIdx] = el;
                  }}
                  className="contract-page-canvas"
                />
                <div className={`contract-field-layer ${editableEnabled ? '' : 'read-only'}`}>
                  {fieldsForPage.map((field) => {
                    const left = (field.x / pageSize.width) * 100;
                    const top = (field.y / pageSize.height) * 100;
                    const width = (field.width / pageSize.width) * 100;
                    const height = (field.height / pageSize.height) * 100;
                    const value = getFieldValue(field.name);
                    const isTextArea = field.wrap || field.height > 28;
                    const style: CSSProperties = {
                      left: `${left}%`,
                      top: `${top}%`,
                      width: `${width}%`,
                      height: `${height}%`,
                      fontSize: `${field.fontSize || 10}pt`,
                      textAlign: field.align || 'left',
                    };
                    const classNames = ['contract-input'];
                    if (unmappedCells.has(field.name)) classNames.push('unmapped');

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
                          <div className="contract-readonly-value">{value}</div>
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
