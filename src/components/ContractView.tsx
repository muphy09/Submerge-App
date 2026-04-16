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
  CONTRACT_DEPOSIT_SCHEDULE_FIELD_IDS,
  CONTRACT_DEPOSIT_SOURCE_FIELD_IDS,
  ContractOverrides,
  ContractFieldRender,
  getMirroredContractFieldIds,
  getContractDepositFieldAutoValue,
  getContractDepositSchedulePercentages,
  getContractTotalCashPrice,
  getEditableContractFields,
  validateContractInputs,
} from '../services/contractGenerator';
import { buildContractPdf, ContractPdfFieldLayout } from '../services/contractPdf';
import { ContractTemplateId, getContractTemplateIdForProposal } from '../services/contractTemplates';
import { useToast } from './Toast';
import { TooltipAnchor } from './AppTooltip';
import './ContractView.css';

GlobalWorkerOptions.workerSrc = pdfWorker;

const DEFAULT_DISPLAY_SCALE = 1.85;
const MIN_DISPLAY_SCALE = 1;
const MAX_DISPLAY_SCALE = 2.5;
const DISPLAY_SCALE_STEP = 0.05;
const MAX_RENDER_DPR = 3;
const PRINT_PREVIEW_RENDER_SCALE = 2.2;
const CONTRACT_TOAST_WARNING_EXCLUSIONS = new Set(['Customer name', 'Job site address', 'City']);
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
  'p1_37_size',
  'p1_38_qty',
  'p1_40_qty',
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
const CONTRACT_DEPOSIT_SOURCE_FIELD_ID_SET = new Set<string>(CONTRACT_DEPOSIT_SOURCE_FIELD_IDS);
const CONTRACT_DEPOSIT_SCHEDULE_FIELD_ID_SET = new Set<string>(CONTRACT_DEPOSIT_SCHEDULE_FIELD_IDS);

type DateParts = { year: number; month: number; day: number };

function clampDisplayScale(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Math.max(MIN_DISPLAY_SCALE, Math.min(MAX_DISPLAY_SCALE, rounded));
}

function sanitizeFileNameSegment(value?: string | null): string {
  const normalized = (value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'Proposal';
}

function ZoomIcon({ direction }: { direction: 'in' | 'out' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="contract-zoom-icon">
      <circle cx="10.5" cy="10.5" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15.2 15.2 20 20" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      <path d="M7.5 10.5h6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      {direction === 'in' ? (
        <path d="M10.5 7.5v6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      ) : null}
    </svg>
  );
}

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

type ContractPrintPreviewWindow = Window;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function writePrintPreviewWindowShell(
  previewWindow: ContractPrintPreviewWindow,
  options: {
    title: string;
    fileName: string;
    showPrintButton?: boolean;
    content: string;
  }
) {
  previewWindow.document.open();
  previewWindow.document.write(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(options.title)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", Tahoma, sans-serif;
        --preview-bg: #d8dee8;
        --preview-panel: #eef2f8;
        --preview-border: rgba(57, 78, 115, 0.18);
        --preview-text: #163055;
        --preview-muted: #55709a;
        --preview-accent: #1d4f91;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        min-height: 100%;
        background: var(--preview-bg);
        color: var(--preview-text);
      }

      body {
        font-family: inherit;
      }

      .preview-toolbar {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        padding: 16px 20px;
        background: rgba(238, 242, 248, 0.96);
        border-bottom: 1px solid var(--preview-border);
        backdrop-filter: blur(12px);
      }

      .preview-title {
        min-width: 0;
      }

      .preview-title p {
        margin: 0 0 2px;
        color: var(--preview-muted);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .preview-title h1 {
        margin: 0;
        font-size: 22px;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .preview-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .preview-actions button {
        border: 1px solid rgba(55, 83, 128, 0.22);
        border-radius: 999px;
        padding: 0 16px;
        height: 40px;
        background: #ffffff;
        color: var(--preview-text);
        cursor: pointer;
        font: inherit;
        font-weight: 700;
      }

      .preview-actions button.primary {
        background: var(--preview-accent);
        border-color: var(--preview-accent);
        color: #ffffff;
      }

      .preview-status {
        width: min(560px, calc(100vw - 48px));
        margin: 72px auto 0;
        padding: 24px 28px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.96);
        border: 1px solid var(--preview-border);
        box-shadow: 0 20px 44px rgba(34, 55, 97, 0.12);
        text-align: center;
        font-size: 16px;
        font-weight: 600;
      }

      .preview-status.error {
        color: #8d1d1d;
      }

      .preview-pages {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        padding: 24px 18px 40px;
      }

      .preview-sheet {
        width: min(8.5in, calc(100vw - 36px));
        background: #ffffff;
        border: 1px solid var(--preview-border);
        box-shadow: 0 28px 60px rgba(34, 55, 97, 0.18);
      }

      .preview-sheet img {
        display: block;
        width: 100%;
        height: auto;
      }

      @media (max-width: 800px) {
        .preview-toolbar {
          flex-direction: column;
          align-items: stretch;
        }

        .preview-actions {
          justify-content: space-between;
        }
      }

      @media print {
        @page {
          size: letter;
          margin: 0;
        }

        html, body {
          background: #ffffff !important;
        }

        .preview-toolbar {
          display: none !important;
        }

        .preview-pages {
          padding: 0 !important;
          gap: 0 !important;
        }

        .preview-sheet {
          width: 8.5in !important;
          border: none !important;
          box-shadow: none !important;
          break-after: page;
          page-break-after: always;
        }

        .preview-sheet img {
          width: 8.5in !important;
          height: 11in !important;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
      }
    </style>
  </head>
  <body>
    <div class="preview-toolbar">
      <div class="preview-title">
        <p>Contract</p>
        <h1>${escapeHtml(options.fileName)}</h1>
      </div>
      <div class="preview-actions">
        ${
          options.showPrintButton
            ? '<button type="button" class="primary" id="preview-print">Print</button>'
            : ''
        }
        <button type="button" id="preview-close">Close</button>
      </div>
    </div>
    ${options.content}
  </body>
</html>`);
  previewWindow.document.close();
}

function bindPrintPreviewWindowControls(previewWindow: ContractPrintPreviewWindow) {
  const closeButton = previewWindow.document.getElementById('preview-close');
  closeButton?.addEventListener('click', () => {
    previewWindow.close();
  });

  const printButton = previewWindow.document.getElementById('preview-print') as HTMLButtonElement | null;
  if (printButton) {
    printButton.addEventListener('click', () => {
      printButton.disabled = true;
      previewWindow.focus();
      previewWindow.print();
    });
  }

  previewWindow.onafterprint = () => {
    const currentPrintButton = previewWindow.document.getElementById('preview-print') as HTMLButtonElement | null;
    if (currentPrintButton) {
      currentPrintButton.disabled = false;
    }
  };
}

function openPrintPreviewWindow(fileName: string): ContractPrintPreviewWindow | null {
  const previewWindow = window.open('', '_blank', 'width=1120,height=1400');
  if (!previewWindow) {
    return null;
  }

  writePrintPreviewWindowShell(previewWindow, {
    title: `${fileName} Print Preview`,
    fileName,
    content: '<div class="preview-status">Preparing contract print preview...</div>',
  });
  bindPrintPreviewWindowControls(previewWindow);
  previewWindow.focus();
  return previewWindow;
}

function showPrintPreviewError(previewWindow: ContractPrintPreviewWindow, fileName: string, message: string) {
  writePrintPreviewWindowShell(previewWindow, {
    title: `${fileName} Print Preview`,
    fileName,
    content: `<div class="preview-status error">${escapeHtml(message)}</div>`,
  });
  bindPrintPreviewWindowControls(previewWindow);
}

function showPrintPreviewPages(previewWindow: ContractPrintPreviewWindow, fileName: string, pageImages: string[]) {
  writePrintPreviewWindowShell(previewWindow, {
    title: `${fileName} Print Preview`,
    fileName,
    showPrintButton: true,
    content: '<div class="preview-pages" id="preview-pages"></div>',
  });
  bindPrintPreviewWindowControls(previewWindow);

  const pagesRoot = previewWindow.document.getElementById('preview-pages');
  if (!pagesRoot) {
    showPrintPreviewError(previewWindow, fileName, 'Could not open the contract print preview.');
    return;
  }

  pageImages.forEach((src, index) => {
    const sheet = previewWindow.document.createElement('div');
    sheet.className = 'preview-sheet';
    const image = previewWindow.document.createElement('img');
    image.src = src;
    image.alt = `Contract page ${index + 1}`;
    image.loading = 'eager';
    sheet.appendChild(image);
    pagesRoot.appendChild(sheet);
  });
  previewWindow.focus();
}

async function renderContractPrintPreviewPages(pdfBytes: Uint8Array): Promise<string[]> {
  const loadingTask = getDocument({ data: pdfBytes });

  try {
    const pdfDoc = await loadingTask.promise;

    try {
      const pageImages: string[] = [];

      for (let i = 1; i <= pdfDoc.numPages; i += 1) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: PRINT_PREVIEW_RENDER_SCALE });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new Error('Could not prepare the contract preview canvas.');
        }
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        pageImages.push(canvas.toDataURL('image/png'));
      }

      return pageImages;
    } finally {
      pdfDoc.destroy();
    }
  } finally {
    loadingTask.destroy();
  }
}

function hasContractFieldValue(
  fields: ContractFieldRender[],
  predicate: (field: ContractFieldRender, label: string) => boolean
): boolean {
  return fields.some((field) => {
    const label = (field.label || '').toLowerCase();
    return predicate(field, label) && Boolean((field.value || '').trim());
  });
}

function validateContractWarnings(proposal: Proposal, fields: ContractFieldRender[]): string[] {
  const baseWarnings = validateContractInputs(proposal).filter(
    (warning) => warning !== 'Customer name' && warning !== 'Job site address' && warning !== 'City'
  );
  const info = proposal.customerInfo || {};
  const warnings: string[] = [];

  const hasCustomerName =
    Boolean(info.customerName?.trim()) ||
    hasContractFieldValue(fields, (_, label) => (/customer/.test(label) || /buyer/.test(label)) && /name/.test(label));
  const hasAddress =
    Boolean(info.address?.trim()) ||
    hasContractFieldValue(fields, (_, label) => /job site/.test(label) || /address/.test(label));
  const hasCity =
    Boolean(info.city?.trim()) ||
    hasContractFieldValue(fields, (_, label) => /city/.test(label) && !/surface/.test(label));

  if (!hasCustomerName) warnings.push('Customer name');
  if (!hasAddress) warnings.push('Job site address');
  if (!hasCity) warnings.push('City');

  return [...warnings, ...baseWarnings];
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
  exportPdf: () => Promise<boolean>;
  printContract: () => Promise<boolean>;
  saveOverrides: () => Promise<boolean>;
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
  const [displayScale, setDisplayScale] = useState(DEFAULT_DISPLAY_SCALE);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const latestSavePromiseRef = useRef<Promise<boolean> | null>(null);
  const previousIncomingOverridesRef = useRef<ContractOverrides>(incomingOverrides || {});
  const previousProposalVersionIdRef = useRef(proposal.versionId || 'original');

  useEffect(() => {
    const nextIncomingOverrides = incomingOverrides || {};
    const nextProposalVersionId = proposal.versionId || 'original';
    const proposalVersionChanged = previousProposalVersionIdRef.current !== nextProposalVersionId;
    const incomingOverridesChanged = !areOverridesEqual(previousIncomingOverridesRef.current, nextIncomingOverrides);

    if (!proposalVersionChanged && !incomingOverridesChanged) return;

    previousIncomingOverridesRef.current = nextIncomingOverrides;
    previousProposalVersionIdRef.current = nextProposalVersionId;
    setOverrides(nextIncomingOverrides);
    setBaselineOverrides(nextIncomingOverrides);
  }, [incomingOverrides, proposal.versionId]);

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
          const viewport = page.getViewport({ scale: DEFAULT_DISPLAY_SCALE });
          const dpr =
            typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, MAX_RENDER_DPR) : 1;
          const renderViewport = page.getViewport({ scale: dpr * displayScale });
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
  }, [displayScale, pageSizes, pdfBytes]);

  const unmappedIds = useMemo(
    () => new Set(fields.filter((f) => !f.value && f.color === 'blue' && !OPTIONAL_FIELD_IDS.has(f.id)).map((f) => f.id)),
    [fields]
  );
  const warnings = useMemo(() => validateContractWarnings(proposal, fields), [fields, proposal]);
  const exportWarnings = useMemo(
    () => warnings.filter((warning) => !CONTRACT_TOAST_WARNING_EXCLUSIONS.has(warning)),
    [warnings]
  );

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

  const totalCashPrice = useMemo(() => getContractTotalCashPrice(proposal), [proposal]);
  const contractDepositSchedulePercentages = useMemo(
    () => getContractDepositSchedulePercentages(proposal),
    [proposal]
  );

  const handleCellChange = useCallback(
    (cellAddress: string, value: string) => {
      const isDepositSourceField = CONTRACT_DEPOSIT_SOURCE_FIELD_ID_SET.has(cellAddress);
      if (isDepositSourceField) {
        const normalizedValue = value;
        const next = { ...overrides };
        const hasDepositValue = normalizedValue.trim().length > 0;

        CONTRACT_DEPOSIT_SOURCE_FIELD_IDS.forEach((fieldId) => {
          if (hasDepositValue) {
            next[fieldId] = normalizedValue;
          } else {
            delete next[fieldId];
          }
        });
        CONTRACT_DEPOSIT_SCHEDULE_FIELD_IDS.forEach((fieldId) => {
          delete next[fieldId];
        });

        setOverrides(next);
        setFields((prev) =>
          prev.map((field) => {
            if (CONTRACT_DEPOSIT_SOURCE_FIELD_ID_SET.has(field.id)) {
              const nextAutoValue = getContractDepositFieldAutoValue(
                field.id,
                normalizedValue,
                totalCashPrice,
                contractDepositSchedulePercentages
              );
              return {
                ...field,
                value: normalizedValue,
                autoValue: nextAutoValue,
                isAutoFilled: false,
                isOverridden: hasDepositValue,
              };
            }

            if (CONTRACT_DEPOSIT_SCHEDULE_FIELD_ID_SET.has(field.id)) {
              const nextAutoValue = getContractDepositFieldAutoValue(
                field.id,
                normalizedValue,
                totalCashPrice,
                contractDepositSchedulePercentages
              );
              return {
                ...field,
                value: nextAutoValue,
                autoValue: nextAutoValue,
                isAutoFilled: Boolean(nextAutoValue),
                isOverridden: false,
              };
            }

            return field;
          })
        );
        onOverridesChange?.(next);
        return;
      }

      const fieldTemplate = fields.find((f) => f.id === cellAddress);
      const autoValue = fieldTemplate?.autoValue ?? '';
      const normalizedValue = value;
      const next = { ...overrides };
      const mirroredFieldIds = getMirroredContractFieldIds(cellAddress);
      const shouldClearOverrides = normalizedValue === autoValue || (!normalizedValue && !autoValue);

      if (shouldClearOverrides) {
        mirroredFieldIds.forEach((fieldId) => {
          delete next[fieldId];
        });
      } else {
        mirroredFieldIds.forEach((fieldId) => {
          next[fieldId] = normalizedValue;
        });
      }

      setOverrides(next);
      setFields((prev) =>
        prev.map((field) => {
          if (!mirroredFieldIds.includes(field.id)) return field;
          const hasOverride = Object.prototype.hasOwnProperty.call(next, field.id);
          return {
            ...field,
            value: hasOverride ? normalizedValue : field.autoValue || '',
            isAutoFilled: !hasOverride && Boolean(field.autoValue),
            isOverridden: hasOverride,
          };
        })
      );
      onOverridesChange?.(next);
    },
    [contractDepositSchedulePercentages, fields, onOverridesChange, overrides, totalCashPrice]
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

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!onSave || !hasUnsavedChanges) return true;
    if (latestSavePromiseRef.current) return latestSavePromiseRef.current;

    const overridesToSave = overrides;
    const savePromise = (async () => {
      setSaving(true);
      try {
        await onSave(overridesToSave);
        setBaselineOverrides(overridesToSave);
        previousIncomingOverridesRef.current = overridesToSave;
        return true;
      } catch (error) {
        console.error('Failed to save contract overrides', error);
        showToast({ type: 'error', message: 'Could not save contract overrides.' });
        return false;
      } finally {
        latestSavePromiseRef.current = null;
        setSaving(false);
      }
    })();

    latestSavePromiseRef.current = savePromise;
    return savePromise;
  }, [hasUnsavedChanges, onSave, overrides, showToast]);

  const getContractPdfFileName = useCallback(() => {
    const customerName = sanitizeFileNameSegment(proposal.customerInfo.customerName);
    const today = new Date();
    const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
      today.getDate()
    ).padStart(2, '0')}`;
    return `${customerName}-contract-${formattedDate}.pdf`;
  }, [proposal.customerInfo.customerName]);

  const buildFlattenedContractPdf = useCallback(async () => {
    const result = await buildContractPdf(fields, {
      flatten: true,
      includeFormFields: true,
      templateId: resolvedTemplateId,
    });
    return {
      pdfBytes: new Uint8Array(result.pdfBytes),
      fileName: getContractPdfFileName(),
    };
  }, [fields, getContractPdfFileName, resolvedTemplateId]);

  const exportPdf = useCallback(async (): Promise<boolean> => {
    if (!fields.length || exporting) return false;
    const saveSucceeded = await handleSave();
    if (!saveSucceeded) return false;
    setExporting(true);
    try {
      if (exportWarnings.length) {
        showToast({
          type: 'warning',
          message: `Missing data: ${exportWarnings.join(', ')}`,
        });
      }
      const { pdfBytes, fileName } = await buildFlattenedContractPdf();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      showToast({ type: 'success', message: 'Contract PDF generated.' });
      return true;
    } catch (error) {
      console.error('Failed to export contract PDF', error);
      showToast({ type: 'error', message: 'Could not export contract PDF.' });
      return false;
    } finally {
      setExporting(false);
    }
  }, [buildFlattenedContractPdf, exportWarnings, exporting, fields, handleSave, showToast]);

  const printContract = useCallback(async (): Promise<boolean> => {
    if (!fields.length || exporting) return false;
    const previewWindow = openPrintPreviewWindow(getContractPdfFileName());
    const saveSucceeded = await handleSave();
    if (!saveSucceeded) {
      previewWindow?.close();
      return false;
    }
    setExporting(true);
    if (exportWarnings.length) {
      showToast({
        type: 'warning',
        message: `Missing data: ${exportWarnings.join(', ')}`,
      });
    }
    try {
      const { pdfBytes, fileName } = await buildFlattenedContractPdf();
      if (previewWindow) {
        if (previewWindow.closed) {
          return false;
        }
        try {
          const pageImages = await renderContractPrintPreviewPages(pdfBytes);
          showPrintPreviewPages(previewWindow, fileName, pageImages);
          return true;
        } catch (previewError) {
          console.error('Failed to render contract print preview in renderer', previewError);
          showPrintPreviewError(previewWindow, fileName, 'Could not render the contract print preview.');
          return false;
        }
      }

      const result = await window.electron.openContractPrintPreview({ pdfBytes, fileName });
      return Boolean(result?.success);
    } catch (error) {
      console.error('Failed to print contract PDF', error);
      if (previewWindow && !previewWindow.closed) {
        showPrintPreviewError(previewWindow, getContractPdfFileName(), 'Could not open contract print preview.');
      }
      showToast({ type: 'error', message: 'Could not open contract print preview.' });
      return false;
    } finally {
      setExporting(false);
    }
  }, [buildFlattenedContractPdf, exportWarnings, exporting, fields, getContractPdfFileName, handleSave, showToast]);

  const handleZoomOut = useCallback(() => {
    setDisplayScale((prev) => clampDisplayScale(prev - DISPLAY_SCALE_STEP));
  }, []);

  const handleZoomIn = useCallback(() => {
    setDisplayScale((prev) => clampDisplayScale(prev + DISPLAY_SCALE_STEP));
  }, []);

  const pageCount = pageSizes.length || 0;
  const editableEnabled = !readOnly;
  const canZoomOut = displayScale > MIN_DISPLAY_SCALE;
  const canZoomIn = displayScale < MAX_DISPLAY_SCALE;

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
        <>
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
                    label: f.label,
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
                const pageWidth = pageSize.width * DEFAULT_DISPLAY_SCALE;
                const pageHeight = pageSize.height * DEFAULT_DISPLAY_SCALE;
                const zoomRatio = displayScale / DEFAULT_DISPLAY_SCALE;
                const zoomedPageWidth = pageWidth * zoomRatio;
                const zoomedPageHeight = pageHeight * zoomRatio;
                return (
                  <div
                    className="contract-page-shell"
                    key={`contract-page-${pageIdx + 1}`}
                    style={{ width: `${zoomedPageWidth}px`, height: `${zoomedPageHeight}px` }}
                  >
                    <div
                      className="contract-page"
                      data-page={pageIdx + 1}
                      style={{
                        width: `${pageWidth}px`,
                        height: `${pageHeight}px`,
                        transform: `scale(${zoomRatio})`,
                        transformOrigin: 'top left',
                      }}
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
                        const baseLeft = field.x * DEFAULT_DISPLAY_SCALE;
                        const baseTop = field.y * DEFAULT_DISPLAY_SCALE;
                        const baseWidth = field.width * DEFAULT_DISPLAY_SCALE;
                        const baseHeight = field.height * DEFAULT_DISPLAY_SCALE;
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
                        const isPaymentScheduleField = field.name.startsWith('p1_pay_');
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
                        const hasCustomSelectValue =
                          isCustomSelect && Boolean(normalizedDisplayValue) && !displayMatchesCustomOption;
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
                        if (isPaymentScheduleField) wrapperClassNames.push('payment-schedule-field');
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
                                <div className={['contract-readonly-value', colorClass].join(' ')} aria-label={field.name}>
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
                              <div className={['contract-readonly-value', colorClass].join(' ')} aria-label={field.name}>
                                {readOnlyValue}
                              </div>
                            )}
                          </div>
                        );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {pdfBytes && pageCount ? (
            <div className="contract-zoom-controls" aria-label="Contract zoom controls">
              <div className="contract-zoom-controls-inner">
                <TooltipAnchor tooltip="Zoom out">
                  <button
                    type="button"
                    className="contract-zoom-button"
                    onClick={handleZoomOut}
                    disabled={!canZoomOut}
                    aria-label="Zoom out contract preview"
                  >
                    <ZoomIcon direction="out" />
                  </button>
                </TooltipAnchor>
                <TooltipAnchor tooltip="Zoom in">
                  <button
                    type="button"
                    className="contract-zoom-button"
                    onClick={handleZoomIn}
                    disabled={!canZoomIn}
                    aria-label="Zoom in contract preview"
                  >
                    <ZoomIcon direction="in" />
                  </button>
                </TooltipAnchor>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
});

export default ContractView;
