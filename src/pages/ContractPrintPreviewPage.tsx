import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './ContractPrintPreviewPage.css';

const DEFAULT_DISPLAY_SCALE = 1.2;
const MIN_DISPLAY_SCALE = 0.8;
const MAX_DISPLAY_SCALE = 1.8;
const DISPLAY_SCALE_STEP = 0.1;
const MAX_RENDER_DPR = 3;
const MIN_PRINT_PREVIEW_RENDER_SCALE = 3;

GlobalWorkerOptions.workerSrc = pdfWorker;

function getPreviewTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;

  const searchToken = new URLSearchParams(window.location.search).get('previewToken');
  if (searchToken) return searchToken;

  const hash = window.location.hash || '';
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return null;

  return new URLSearchParams(hash.slice(queryIndex + 1)).get('previewToken');
}

function clampDisplayScale(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Math.max(MIN_DISPLAY_SCALE, Math.min(MAX_DISPLAY_SCALE, rounded));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

function isIgnorablePdfRenderError(error: unknown): boolean {
  const name = typeof error === 'object' && error && 'name' in error ? String((error as { name?: unknown }).name) : '';
  const message = getErrorMessage(error);

  return (
    name === 'RenderingCancelledException' ||
    name === 'AbortException' ||
    /cancelled|canceled/i.test(message) ||
    /multiple render\(\) operations/i.test(message)
  );
}

function ZoomIcon({ direction }: { direction: 'in' | 'out' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="contract-print-preview-toolbar-icon">
      <circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15.2 15.2 20 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M7.5 10.5h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      {direction === 'in' ? (
        <path d="M10.5 7.5v6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      ) : null}
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="contract-print-preview-toolbar-icon">
      <path
        d="M7 8V4h10v4M6 18H5a2 2 0 0 1-2-2v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4a2 2 0 0 1-2 2h-1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M7 14h10v6H7zM17 12h.01"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export default function ContractPrintPreviewPage() {
  const [fileName, setFileName] = useState('Contract');
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageSizes, setPageSizes] = useState<{ width: number; height: number }[]>([]);
  const [displayScale, setDisplayScale] = useState(DEFAULT_DISPLAY_SCALE);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [initialRenderComplete, setInitialRenderComplete] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const [nativePreviewUrl, setNativePreviewUrl] = useState<string | null>(null);
  const [useNativePreview, setUseNativePreview] = useState(false);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const printResetTimeoutRef = useRef<number | null>(null);
  const renderTasksRef = useRef<Array<{ cancel: () => void; promise: Promise<unknown> }>>([]);

  const previewToken = useMemo(() => {
    return getPreviewTokenFromLocation();
  }, []);

  useEffect(() => {
    document.title = 'Contract Print Preview';
  }, []);

  const clearPrintResetTimeout = useCallback(() => {
    if (printResetTimeoutRef.current !== null) {
      window.clearTimeout(printResetTimeoutRef.current);
      printResetTimeoutRef.current = null;
    }
  }, []);

  const finishPrint = useCallback(() => {
    clearPrintResetTimeout();
    setPrinting(false);
  }, [clearPrintResetTimeout]);

  const cancelActiveRenderTasks = useCallback(() => {
    const tasks = renderTasksRef.current;
    renderTasksRef.current = [];
    const settle = Promise.allSettled(
      tasks.map((task) => {
        try {
          task.cancel();
        } catch {
          // Ignore task cancellation errors during rerenders/unmounts.
        }
        return task.promise;
      })
    ).then(() => undefined);
    return settle;
  }, []);

  useEffect(() => {
    const handleAfterPrint = () => {
      finishPrint();
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      clearPrintResetTimeout();
      void cancelActiveRenderTasks();
    };
  }, [cancelActiveRenderTasks, clearPrintResetTimeout, finishPrint]);

  useEffect(() => {
    if (!previewToken) {
      setError('Missing print preview token.');
      setLoading(false);
      return;
    }

    let canceled = false;

    (async () => {
      try {
        const result = await window.electron.getContractPrintPreviewData({ previewToken });
        if (canceled) return;
        if (!result) {
          setError('This contract preview is no longer available. Reopen it from the contract screen.');
          setLoading(false);
          return;
        }

        const nextBytes = Uint8Array.from(result.pdfBytes || []);

        setFileName(result.fileName || 'Contract');
        setPdfBytes(nextBytes);
        setError('');
      } catch (loadError) {
        console.error('Failed to load contract print preview data', loadError);
        if (!canceled) {
          setError('Could not load the contract print preview.');
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [previewToken]);

  useEffect(() => {
    setPageCount(0);
    setPageSizes([]);
    setInitialRenderComplete(false);
    setRendering(false);
    setUseNativePreview(false);
    canvasRefs.current = [];
  }, [pdfBytes]);

  useEffect(() => {
    if (!pdfBytes) {
      setNativePreviewUrl(null);
      return;
    }

    const normalizedPdfBytes = new Uint8Array(Array.from(pdfBytes));
    const nextUrl = URL.createObjectURL(new Blob([normalizedPdfBytes], { type: 'application/pdf' }));
    setNativePreviewUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [pdfBytes]);

  useEffect(() => {
    if (!pdfBytes) return;

    let canceled = false;
    const loadingTask = getDocument({ data: pdfBytes });

    loadingTask.promise
      .then(async (pdfDoc) => {
        const nextPageSizes: { width: number; height: number }[] = [];
        for (let i = 1; i <= pdfDoc.numPages; i += 1) {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          nextPageSizes.push({
            width: viewport.width,
            height: viewport.height,
          });
        }
        if (!canceled) {
          setPageCount(pdfDoc.numPages);
          setPageSizes(nextPageSizes);
        }
        pdfDoc.destroy();
      })
      .catch((metadataError) => {
        console.error('Failed to read contract preview PDF metadata', metadataError);
        if (!canceled) {
          setRendering(false);
          setError('Could not read the contract preview.');
        }
      });

    return () => {
      canceled = true;
      loadingTask.destroy();
    };
  }, [pdfBytes]);

  useEffect(() => {
    if (!pdfBytes || !pageCount || !pageSizes.length) return;

    let canceled = false;
    const loadingTask = getDocument({ data: pdfBytes });
    setRendering(true);
    setError('');

    void (async () => {
      try {
        await cancelActiveRenderTasks();
        const pdfDoc = await loadingTask.promise;

        try {
          const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR) : 1;

          for (let i = 1; i <= pdfDoc.numPages; i += 1) {
            if (canceled) break;
            const page = await pdfDoc.getPage(i);
            const cssViewport = page.getViewport({ scale: displayScale });
            const renderScale = Math.max(dpr * displayScale, MIN_PRINT_PREVIEW_RENDER_SCALE);
            const renderViewport = page.getViewport({ scale: renderScale });
            const canvas = canvasRefs.current[i - 1];
            if (!canvas) continue;
            const context = canvas.getContext('2d');
            if (!context) continue;
            context.imageSmoothingEnabled = true;
            (context as CanvasRenderingContext2D & { imageSmoothingQuality?: string }).imageSmoothingQuality = 'high';
            canvas.width = renderViewport.width;
            canvas.height = renderViewport.height;
            canvas.style.width = `${cssViewport.width}px`;
            canvas.style.height = `${cssViewport.height}px`;
            const renderTask = page.render({ canvasContext: context, viewport: renderViewport, canvas });
            renderTasksRef.current.push(renderTask);
            try {
              await renderTask.promise;
            } finally {
              renderTasksRef.current = renderTasksRef.current.filter((task) => task !== renderTask);
            }
          }
          if (!canceled) {
            setRendering(false);
            setInitialRenderComplete(true);
          }
        } finally {
          pdfDoc.destroy();
        }
      } catch (renderError) {
        if (canceled || isIgnorablePdfRenderError(renderError)) {
          return;
        }

        console.error('Failed to render contract print preview PDF', renderError);
        if (!canceled) {
          setRendering(false);
          if (nativePreviewUrl) {
            setUseNativePreview(true);
            setInitialRenderComplete(true);
            setError('');
          } else {
            setError('Could not render the contract preview.');
          }
        }
      }
    })();

    return () => {
      canceled = true;
      loadingTask.destroy();
      void cancelActiveRenderTasks();
    };
  }, [cancelActiveRenderTasks, displayScale, nativePreviewUrl, pageCount, pageSizes, pdfBytes]);

  const handleZoomOut = useCallback(() => {
    setDisplayScale((prev) => clampDisplayScale(prev - DISPLAY_SCALE_STEP));
  }, []);

  const handleZoomIn = useCallback(() => {
    setDisplayScale((prev) => clampDisplayScale(prev + DISPLAY_SCALE_STEP));
  }, []);

  const handlePrint = useCallback(() => {
    if (!previewToken || printing || !pdfBytes || loading || Boolean(error) || rendering || !initialRenderComplete) {
      return;
    }

    setPrinting(true);
    setError('');

    if (!useNativePreview && typeof window.print === 'function') {
      window.requestAnimationFrame(() => {
        window.print();
        clearPrintResetTimeout();
        printResetTimeoutRef.current = window.setTimeout(() => {
          finishPrint();
        }, 1200);
      });
      return;
    }

    void window.electron
      .printContractPreviewPdf({ previewToken })
      .catch((printError) => {
        console.error('Failed to print contract preview PDF', printError);
        finishPrint();
        setError('Could not open the Windows print dialog for this contract.');
      });
  }, [
    clearPrintResetTimeout,
    error,
    finishPrint,
    initialRenderComplete,
    loading,
    pdfBytes,
    previewToken,
    printing,
    rendering,
    useNativePreview,
  ]);

  const handleClose = useCallback(() => {
    window.close();
  }, []);

  return (
    <div className="contract-print-preview-page">
      <div className="contract-print-preview-toolbar">
        <div className="contract-print-preview-title-group">
          <p className="contract-print-preview-eyebrow">Contract</p>
          <h1>{fileName}</h1>
        </div>
        <div className="contract-print-preview-toolbar-actions">
          <div className="contract-print-preview-zoom-group" aria-label="Preview zoom controls">
            <button type="button" onClick={handleZoomOut} disabled={displayScale <= MIN_DISPLAY_SCALE}>
              <ZoomIcon direction="out" />
            </button>
            <span>{Math.round(displayScale * 100)}%</span>
            <button type="button" onClick={handleZoomIn} disabled={displayScale >= MAX_DISPLAY_SCALE}>
              <ZoomIcon direction="in" />
            </button>
          </div>
          <button
            type="button"
            className="contract-print-preview-primary"
            onClick={handlePrint}
            disabled={printing || !pdfBytes || loading || Boolean(error) || rendering || !initialRenderComplete}
          >
            <PrintIcon />
            {printing ? 'Opening Print...' : rendering || !initialRenderComplete ? 'Rendering...' : 'Print'}
          </button>
          <button type="button" className="contract-print-preview-secondary" onClick={handleClose}>
            Close
          </button>
        </div>
      </div>

      <div className="contract-print-preview-content">
        {loading ? (
          <div className="contract-print-preview-status">Loading contract preview...</div>
        ) : error ? (
          <div className="contract-print-preview-status error">{error}</div>
        ) : useNativePreview && nativePreviewUrl ? (
          <div className="contract-print-preview-native-shell">
            <iframe
              className="contract-print-preview-native-frame"
              src={nativePreviewUrl}
              title="Contract Preview"
            />
          </div>
        ) : (
          <>
            {!initialRenderComplete ? (
              <div className="contract-print-preview-status">Rendering contract preview...</div>
            ) : null}
            <div
              className="contract-print-preview-pages"
              aria-hidden={!initialRenderComplete}
              style={
                initialRenderComplete
                  ? undefined
                  : {
                      position: 'absolute',
                      left: '-100000px',
                      top: 0,
                    }
              }
            >
              {Array.from({ length: pageCount }).map((_, index) => {
                const pageSize = pageSizes[index] || { width: 612, height: 792 };
                return (
                  <div
                    className="contract-print-preview-sheet"
                    key={`contract-preview-page-${index + 1}`}
                    style={{
                      width: `${pageSize.width * displayScale}px`,
                      height: `${pageSize.height * displayScale}px`,
                    }}
                  >
                    <canvas
                      ref={(element) => {
                        canvasRefs.current[index] = element;
                      }}
                      className="contract-print-preview-canvas"
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
