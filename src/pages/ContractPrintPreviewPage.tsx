import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDocument } from 'pdfjs-dist';
import './ContractPrintPreviewPage.css';

const DEFAULT_DISPLAY_SCALE = 1.2;
const MIN_DISPLAY_SCALE = 0.8;
const MAX_DISPLAY_SCALE = 1.8;
const DISPLAY_SCALE_STEP = 0.1;
const MAX_RENDER_DPR = 3;

function clampDisplayScale(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Math.max(MIN_DISPLAY_SCALE, Math.min(MAX_DISPLAY_SCALE, rounded));
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
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);

  const previewToken = useMemo(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    return params.get('previewToken');
  }, []);

  useEffect(() => {
    document.title = 'Contract Print Preview';
  }, []);

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

    loadingTask.promise
      .then(async (pdfDoc) => {
        const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR) : 1;

        for (let i = 1; i <= pdfDoc.numPages; i += 1) {
          if (canceled) break;
          const page = await pdfDoc.getPage(i);
          const cssViewport = page.getViewport({ scale: displayScale });
          const renderViewport = page.getViewport({ scale: dpr * displayScale });
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
          await page.render({ canvasContext: context, viewport: renderViewport, canvas }).promise;
        }
        pdfDoc.destroy();
      })
      .catch((renderError) => {
        console.error('Failed to render contract print preview PDF', renderError);
        if (!canceled) {
          setError('Could not render the contract print preview.');
        }
      });

    return () => {
      canceled = true;
      loadingTask.destroy();
    };
  }, [displayScale, pageCount, pageSizes, pdfBytes]);

  const handleZoomOut = useCallback(() => {
    setDisplayScale((prev) => clampDisplayScale(prev - DISPLAY_SCALE_STEP));
  }, []);

  const handleZoomIn = useCallback(() => {
    setDisplayScale((prev) => clampDisplayScale(prev + DISPLAY_SCALE_STEP));
  }, []);

  const handlePrint = useCallback(() => {
    if (!previewToken || printing) return;
    setPrinting(true);
    setError('');
    void window.electron
      .printContractPreviewPdf({ previewToken })
      .catch((printError) => {
        console.error('Failed to print contract preview PDF', printError);
        setPrinting(false);
        setError('Could not open the Windows print dialog for this contract.');
      });
  }, [previewToken, printing]);

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
            disabled={printing || !pdfBytes || loading || Boolean(error)}
          >
            <PrintIcon />
            {printing ? 'Opening Print...' : 'Print'}
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
        ) : (
          <div className="contract-print-preview-pages">
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
        )}
      </div>
    </div>
  );
}
