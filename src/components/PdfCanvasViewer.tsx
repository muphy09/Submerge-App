import { useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import './PdfCanvasViewer.css';

GlobalWorkerOptions.workerSrc = pdfWorker;

type PdfCanvasViewerProps = {
  src: string;
  ariaLabel: string;
};

function isCanceledRender(error: unknown) {
  const name =
    typeof error === 'object' && error && 'name' in error
      ? String((error as { name?: unknown }).name || '')
      : '';
  return name === 'RenderingCancelledException' || name === 'AbortException';
}

function PdfCanvasPage({ document, pageNumber }: { document: any; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let canceled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let page: any = null;

    void (async () => {
      try {
        page = await document.getPage(pageNumber);
        if (canceled || !canvasRef.current) return;
        const displayScale = 1.25;
        const renderScale = displayScale * Math.min(window.devicePixelRatio || 1, 2);
        const displayViewport = page.getViewport({ scale: displayScale });
        const renderViewport = page.getViewport({ scale: renderScale });
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('Canvas rendering is unavailable.');

        canvas.width = Math.ceil(renderViewport.width);
        canvas.height = Math.ceil(renderViewport.height);
        canvas.style.width = `${Math.ceil(displayViewport.width)}px`;
        canvas.style.height = `${Math.ceil(displayViewport.height)}px`;
        const task = page.render({ canvasContext: context, viewport: renderViewport, canvas });
        renderTask = task;
        await task.promise;
      } catch (renderError) {
        if (!canceled && !isCanceledRender(renderError)) {
          console.error('Unable to render contract template page', renderError);
          setError(`Page ${pageNumber} could not be rendered.`);
        }
      }
    })();

    return () => {
      canceled = true;
      try {
        renderTask?.cancel();
      } catch {
        // The task may already be complete.
      }
      try {
        page?.cleanup();
      } catch {
        // PDF.js cleanup is best effort during modal close.
      }
    };
  }, [document, pageNumber]);

  return (
    <div className="pdf-canvas-viewer__page">
      {error ? <div className="pdf-canvas-viewer__status is-error">{error}</div> : null}
      <canvas ref={canvasRef} aria-label={`Contract template page ${pageNumber}`} />
    </div>
  );
}

export default function PdfCanvasViewer({ src, ariaLabel }: PdfCanvasViewerProps) {
  const [document, setDocument] = useState<any>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let canceled = false;
    let loadingTask: ReturnType<typeof getDocument> | null = null;
    let loadedDocument: any = null;

    setDocument(null);
    setPageCount(0);
    setLoading(true);
    setError('');

    void (async () => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) throw new Error(`Template download failed (${response.status}).`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (canceled) return;
        loadingTask = getDocument({ data: bytes });
        loadedDocument = await loadingTask.promise;
        if (canceled) return;
        setDocument(loadedDocument);
        setPageCount(loadedDocument.numPages || 0);
      } catch (loadError: any) {
        if (!canceled && loadError?.name !== 'AbortError') {
          console.error('Unable to load blank contract template', loadError);
          setError(loadError?.message || 'The blank contract template could not be loaded.');
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => {
      canceled = true;
      controller.abort();
      void loadingTask?.destroy();
    };
  }, [src]);

  return (
    <div className="pdf-canvas-viewer" role="document" aria-label={ariaLabel}>
      {loading ? <div className="pdf-canvas-viewer__status">Rendering blank contract template...</div> : null}
      {!loading && error ? <div className="pdf-canvas-viewer__status is-error">{error}</div> : null}
      {!loading && !error && pageCount === 0 ? (
        <div className="pdf-canvas-viewer__status is-error">This contract template has no pages.</div>
      ) : null}
      {document
        ? Array.from({ length: pageCount }).map((_, index) => (
            <PdfCanvasPage key={index + 1} document={document} pageNumber={index + 1} />
          ))
        : null}
    </div>
  );
}
