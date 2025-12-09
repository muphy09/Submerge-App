import { CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { Proposal } from '../types/proposal-new';
import {
  ContractOverrides,
  ContractSheetRender,
  getEditableContractJson,
  listUnmappedFields,
  validateContractInputs,
} from '../services/contractGenerator';
import { useToast } from './Toast';
import './ContractView.css';

type ContractViewProps = {
  proposal: Proposal;
  overrides?: ContractOverrides;
  readOnly?: boolean;
  onOverridesChange?: (overrides: ContractOverrides) => void;
  onSave?: (overrides: ContractOverrides) => Promise<void> | void;
};

type PageBlock = {
  id: string;
  rows: ContractSheetRender['rows'];
};

function splitIntoPages(sheet: ContractSheetRender): PageBlock[] {
  const breaks: number[] = [];
  sheet.rows.forEach((row, idx) => {
    const hasMarker = row.some(
      (cell) => typeof cell.value === 'string' && /Page \\d+ of 6/i.test(cell.value as string)
    );
    if (hasMarker) breaks.push(idx);
  });

  if (!breaks.length) {
    return [{ id: 'page-1', rows: sheet.rows }];
  }

  const pages: PageBlock[] = [];
  let start = 0;
  breaks.forEach((brk, idx) => {
    pages.push({ id: `page-${idx + 1}`, rows: sheet.rows.slice(start, brk + 1) });
    start = brk + 1;
  });
  if (start < sheet.rows.length) {
    pages.push({ id: `page-${pages.length + 1}`, rows: sheet.rows.slice(start) });
  }
  return pages;
}

function cellKey(cell: { address: string; row: number; col: number }) {
  return `${cell.address}-${cell.row}-${cell.col}`;
}

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
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOverrides(incomingOverrides || {});
  }, [incomingOverrides]);

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

  const pages = useMemo(() => (sheet ? splitIntoPages(sheet) : []), [sheet]);
  const naturalWidth = useMemo(
    () => (sheet?.colWidths || []).reduce((sum, width) => sum + (width || 0), 0),
    [sheet]
  );
  const pageWidth = Math.max(Math.ceil(naturalWidth || 0), 816);
  const pageStyle = useMemo(
    () => ({ '--contract-page-width': `${pageWidth}px` } as CSSProperties),
    [pageWidth]
  );
  const unmapped = useMemo(() => listUnmappedFields(), []);
  const unmappedCells = useMemo(() => new Set(unmapped.map((f) => f.cell)), [unmapped]);
  const warnings = useMemo(() => validateContractInputs(proposal), [proposal]);

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
    if (!containerRef.current) return;
    setExporting(true);
    try {
      if (warnings.length) {
        showToast({
          type: 'warning',
          message: `Missing data: ${warnings.join(', ')}`,
        });
      }
      const pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'letter' });
      const pageNodes = Array.from(
        containerRef.current.querySelectorAll('.contract-page')
      ) as HTMLElement[];

      for (let i = 0; i < pageNodes.length; i += 1) {
        const page = pageNodes[i];
        const canvas = await html2canvas(page, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
        });
        const imgData = canvas.toDataURL('image/png');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
        const imgWidth = canvas.width * ratio;
        const imgHeight = canvas.height * ratio;
        const marginX = (pageWidth - imgWidth) / 2;
        const marginY = (pageHeight - imgHeight) / 2;
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', marginX, marginY, imgWidth, imgHeight);
      }

      const customerName = proposal.customerInfo.customerName || 'Proposal';
      const today = new Date();
      const formattedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
        today.getDate()
      ).padStart(2, '0')}`;
      pdf.save(`${customerName}-contract-${formattedDate}.pdf`);
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

      <div className="contract-pages" ref={containerRef}>
        {pages.map((page, idx) => (
          <div className="contract-page" key={page.id} data-page={idx + 1} style={pageStyle}>
            <div className="contract-page-inner">
              <table className="contract-table" aria-label={`Contract page ${idx + 1}`}>
                <colgroup>
                  {sheet.colWidths.map((w, colIdx) => (
                    <col key={`col-${colIdx}`} style={{ width: `${w}px` }} />
                  ))}
                </colgroup>
                <tbody>
                  {page.rows.map((row, rowIdx) => (
                    <tr
                      key={`row-${rowIdx}-${row[0]?.row || rowIdx}`}
                      style={{ height: `${sheet.rowHeights[row[0]?.row - 1] || 18}px` }}
                    >
                      {row.map((cell) => {
                        const editable = cell.editable && !readOnly && !previewMode;
                        const hasFill = Boolean(cell.style.background && cell.style.background !== '#fff');
                        const classNames = ['contract-cell'];
                        if (editable) classNames.push('editable');
                        if (hasFill) classNames.push('has-fill');
                      return (
                          <td
                            key={cellKey(cell)}
                            colSpan={cell.colSpan}
                            rowSpan={cell.rowSpan}
                            title={unmappedCells.has(cell.address) ? 'Needs manual input' : undefined}
                            style={{
                              background: cell.style.background || '#fff',
                              fontWeight: cell.style.bold ? 700 : 400,
                              fontStyle: cell.style.italic ? 'italic' : 'normal',
                              fontSize: cell.style.fontSize ? `${cell.style.fontSize}px` : undefined,
                              textAlign: cell.style.align || 'left',
                              verticalAlign: cell.style.verticalAlign || 'top',
                              whiteSpace: cell.style.wrap ? 'pre-wrap' : 'pre-line',
                              wordBreak: cell.style.wrap ? 'break-word' : 'normal',
                            }}
                            className={classNames.join(' ')}
                          >
                            {editable ? (
                              <input
                                className="contract-input"
                                value={cell.value ?? ''}
                                onChange={(e) => handleCellChange(cell.address, e.target.value)}
                              />
                            ) : (
                              cell.value
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

