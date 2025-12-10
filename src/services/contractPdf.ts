import { PDFDocument, PDFFont, RGB, StandardFonts, TextAlignment, rgb } from 'pdf-lib';
import { ContractCellRender, ContractSheetRender } from './contractGenerator';

export type ContractPdfFieldLayout = {
  name: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  align?: 'left' | 'center' | 'right';
  wrap?: boolean;
};

export type ContractPdfResult = {
  pdfBytes: Uint8Array;
  fields: ContractPdfFieldLayout[];
  pageSizes: { width: number; height: number }[];
};

export type ContractPageBlock = {
  id: string;
  rows: ContractCellRender[][];
  startRow: number;
};

type ContractPdfBuildOptions = {
  flatten?: boolean;
  includeFormFields?: boolean;
  logoBytes?: ArrayBuffer | null;
  logoHeight?: number;
};

const PX_TO_PT = 72 / 96;
const LETTER = { width: 612, height: 792 };
const PAGE_MARGIN = 18;
const BASE_PADDING_PT = 2;
const BASE_LINE_GAP_PT = 1;

function hexToRgb(hex?: string): RGB | undefined {
  if (!hex || !/^#([0-9a-f]{6})$/i.test(hex)) return undefined;
  const value = hex.replace('#', '');
  const num = parseInt(value, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return rgb(r / 255, g / 255, b / 255);
}

function wrapTextIntoLines(
  value: string,
  maxWidth: number,
  font: PDFFont,
  fontSize: number
): string[] {
  if (!value) return [''];
  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  const pushLine = () => {
    if (current.trim().length) {
      lines.push(current.trim());
      current = '';
    }
  };

  for (const word of words) {
    const tentative = current.length ? `${current} ${word}` : word;
    const width = font.widthOfTextAtSize(tentative, fontSize);
    if (width <= maxWidth) {
      current = tentative;
    } else if (!current.length) {
      // single long word
      lines.push(tentative);
      current = '';
    } else {
      pushLine();
      current = word;
    }
  }

  pushLine();
  return lines.length ? lines : [''];
}

function getFontForCell(
  cell: ContractCellRender,
  fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont }
) {
  if (cell.style.bold && cell.style.italic) return fonts.boldItalic;
  if (cell.style.bold) return fonts.bold;
  if (cell.style.italic) return fonts.italic;
  return fonts.regular;
}

function normalizeRowHeightsForWrappedText(
  sheet: ContractSheetRender,
  colOffsetsPx: number[],
  fonts: { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont },
  scale: number
) {
  const defaultHeight = 20;
  const adjustedHeights = [...sheet.rowHeights];

  sheet.rows.forEach((row, rowIdx) => {
    row.forEach((cell) => {
      const rawValue = cell.value === null || cell.value === undefined ? '' : String(cell.value);
      if (!rawValue) return;

      const colIndex = cell.col - 1;
      const colSpan = cell.colSpan || 1;
      const leftPx = colOffsetsPx[colIndex] || 0;
      const rightPx = colOffsetsPx[colIndex + colSpan] || leftPx;
      const widthPx = Math.max(rightPx - leftPx, 1);
      const scaledPadding = BASE_PADDING_PT * scale;
      const widthPt = Math.max(widthPx * PX_TO_PT * scale - scaledPadding * 2, 4);

      const font = getFontForCell(cell, fonts);
      const fontSize = (cell.style.fontSize || 10) * scale;
      const lines = wrapTextIntoLines(rawValue, widthPt, font, fontSize);
      const textHeightPt = lines.length * fontSize + (lines.length - 1) * BASE_LINE_GAP_PT * scale;
      const neededPt = textHeightPt + scaledPadding * 2;
      const neededPx = neededPt / (PX_TO_PT * scale);

      const rowSpan = cell.rowSpan || 1;
      let spanHeight = 0;
      for (let i = 0; i < rowSpan; i += 1) {
        const targetIdx = rowIdx + i;
        if (adjustedHeights[targetIdx] === undefined) {
          adjustedHeights[targetIdx] = defaultHeight;
        }
        spanHeight += adjustedHeights[targetIdx] || defaultHeight;
      }

      if (neededPx > spanHeight) {
        const extraPerRow = (neededPx - spanHeight) / rowSpan;
        for (let i = 0; i < rowSpan; i += 1) {
          const targetIdx = rowIdx + i;
          adjustedHeights[targetIdx] = (adjustedHeights[targetIdx] || defaultHeight) + extraPerRow;
        }
      }
    });
  });

  return adjustedHeights.map((h) => (Number.isFinite(h) ? h : defaultHeight));
}

export function splitContractIntoPages(sheet: ContractSheetRender): ContractPageBlock[] {
  const breaks: number[] = [];
  sheet.rows.forEach((row, idx) => {
    const hasMarker = row.some(
      (cell) => typeof cell.value === 'string' && /Page \d+ of \d+/i.test(cell.value as string)
    );
    if (hasMarker) breaks.push(idx);
  });

  if (!breaks.length) {
    return [{ id: 'page-1', rows: sheet.rows, startRow: 0 }];
  }

  const pages: ContractPageBlock[] = [];
  let start = 0;
  breaks.forEach((brk, idx) => {
    pages.push({ id: `page-${idx + 1}`, rows: sheet.rows.slice(start, brk + 1), startRow: start });
    start = brk + 1;
  });
  if (start < sheet.rows.length) {
    pages.push({ id: `page-${pages.length + 1}`, rows: sheet.rows.slice(start), startRow: start });
  }
  return pages;
}

export async function buildContractPdf(
  sheet: ContractSheetRender,
  options: ContractPdfBuildOptions = {}
): Promise<ContractPdfResult> {
  const { flatten = false, includeFormFields = true, logoBytes, logoHeight = 60 } = options;
  const pdf = await PDFDocument.create();
  const form = pdf.getForm();
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const fontBoldItalic = await pdf.embedFont(StandardFonts.HelveticaBoldOblique);

  const colOffsetsPx: number[] = [0];
  sheet.colWidths.forEach((w) => colOffsetsPx.push(colOffsetsPx[colOffsetsPx.length - 1] + (w || 0)));

  const totalWidthPx = colOffsetsPx[colOffsetsPx.length - 1];
  const totalWidthPt = totalWidthPx * PX_TO_PT;
  const availableWidth = LETTER.width - PAGE_MARGIN * 2;
  const availableHeight = LETTER.height - PAGE_MARGIN * 2;

  const pages = splitContractIntoPages(sheet);

  const computeMaxPageHeightPx = (rowHeights: number[]) =>
    Math.max(
      ...pages.map((page) =>
        page.rows.reduce(
          (sum, _row, idx) => sum + (rowHeights[page.startRow + idx] || 20),
          0
        )
      )
    );

  const widthScale = totalWidthPt ? availableWidth / totalWidthPt : 1;
  const baseRowHeights = sheet.rowHeights.map((h) => (Number.isFinite(h) ? h : 20));
  const baseHeightPx = computeMaxPageHeightPx(baseRowHeights);
  const initialHeightScale = baseHeightPx ? availableHeight / (baseHeightPx * PX_TO_PT) : 1;
  const initialScale = Math.min(widthScale, initialHeightScale || 1);

  const fields: ContractPdfFieldLayout[] = [];
  const pageSizes: { width: number; height: number }[] = [];

  const logoImage = logoBytes ? await pdf.embedPng(logoBytes) : null;
  const fonts = { regular: fontRegular, bold: fontBold, italic: fontItalic, boldItalic: fontBoldItalic };
  const firstPassHeights = normalizeRowHeightsForWrappedText(sheet, colOffsetsPx, fonts, initialScale);
  const adjustedHeightPx = computeMaxPageHeightPx(firstPassHeights);
  const adjustedHeightScale = adjustedHeightPx ? availableHeight / (adjustedHeightPx * PX_TO_PT) : 1;
  let scale = Math.min(widthScale, adjustedHeightScale || 1);
  let normalizedRowHeights = normalizeRowHeightsForWrappedText(sheet, colOffsetsPx, fonts, scale);
  const finalHeightPx = computeMaxPageHeightPx(normalizedRowHeights);
  const finalHeightScale = finalHeightPx ? availableHeight / (finalHeightPx * PX_TO_PT) : 1;
  const finalScale = Math.min(widthScale, finalHeightScale || 1);
  if (finalScale !== scale) {
    scale = finalScale;
    normalizedRowHeights = normalizeRowHeightsForWrappedText(sheet, colOffsetsPx, fonts, scale);
  }

  pages.forEach((pageBlock, pageIndex) => {
    const rowHeightsPx = pageBlock.rows.map(
      (_row, idx) => normalizedRowHeights[pageBlock.startRow + idx] || 20
    );
    const pageHeightPx = rowHeightsPx.reduce((sum, h) => sum + h, 0);
    const pageHeightPt = pageHeightPx * PX_TO_PT;

    const pageScale = scale;
    const contentWidthPt = totalWidthPt * pageScale;
    const contentHeightPt = pageHeightPt * pageScale;
    const xStart =
      PAGE_MARGIN + Math.max((availableWidth - contentWidthPt) / 2, 0);
    const yStartFromTop =
      PAGE_MARGIN + Math.max((availableHeight - contentHeightPt) / 2, 0);

    const page = pdf.addPage([LETTER.width, LETTER.height]);
    pageSizes.push({ width: LETTER.width, height: LETTER.height });

    if (logoImage && pageIndex === 0) {
      const targetHeight = logoHeight;
      const ratio = logoImage.width / logoImage.height || 1;
      const width = targetHeight * ratio;
      const x = xStart;
      const y = LETTER.height - PAGE_MARGIN - targetHeight;
      page.drawImage(logoImage, { x, y, width, height: targetHeight });
    }

    const drawBorders = (
      cell: ContractCellRender,
      x: number,
      y: number,
      width: number,
      height: number
    ) => {
      const border = cell.style.border || {};
      const toWidth = (style?: string) => {
        if (!style) return 0;
        if (style === 'thick') return 2 * pageScale;
        if (style === 'medium') return 1.5 * pageScale;
        return 1 * pageScale;
      };
      const topWidth = toWidth(border.top?.style);
      const rightWidth = toWidth(border.right?.style);
      const bottomWidth = toWidth(border.bottom?.style);
      const leftWidth = toWidth(border.left?.style);
      const color = rgb(0, 0, 0);

      if (topWidth) page.drawLine({ start: { x, y: y + height }, end: { x: x + width, y: y + height }, thickness: topWidth, color });
      if (rightWidth) page.drawLine({ start: { x: x + width, y }, end: { x: x + width, y: y + height }, thickness: rightWidth, color });
      if (bottomWidth) page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: bottomWidth, color });
      if (leftWidth) page.drawLine({ start: { x, y }, end: { x, y: y + height }, thickness: leftWidth, color });
    };

    let rowOffsetPx = 0;
    pageBlock.rows.forEach((row, rowIdx) => {
      const rowHeightPx = rowHeightsPx[rowIdx] || 20;
      const rowTopPt = yStartFromTop + rowOffsetPx * PX_TO_PT * pageScale;
      row.forEach((cell) => {
        const colIndex = cell.col - 1;
        const colSpan = cell.colSpan || 1;
        const rowSpan = cell.rowSpan || 1;

        const leftPx = colOffsetsPx[colIndex] || 0;
        const widthPx = (colOffsetsPx[colIndex + colSpan] || 0) - leftPx;

        let heightPx = 0;
        for (let r = 0; r < rowSpan; r += 1) {
          const idxWithinSheet = cell.row - 1 + r;
          heightPx += normalizedRowHeights[idxWithinSheet] || 20;
        }

        const xPt = xStart + leftPx * PX_TO_PT * pageScale;
        const yBottomPt = LETTER.height - rowTopPt - heightPx * PX_TO_PT * pageScale;
        const cellWidthPt = widthPx * PX_TO_PT * pageScale;
        const cellHeightPt = heightPx * PX_TO_PT * pageScale;

        if (cell.style.background) {
          const fill = hexToRgb(cell.style.background);
          if (fill) {
            page.drawRectangle({
              x: xPt,
              y: yBottomPt,
              width: cellWidthPt,
              height: cellHeightPt,
              color: fill,
            });
          }
        }

        drawBorders(cell, xPt, yBottomPt, cellWidthPt, cellHeightPt);

        const baseFontSize = cell.style.fontSize || 10;
        const fontSize = Math.max(0.1, baseFontSize * pageScale);
        const font = getFontForCell(cell, fonts);
        const padding = BASE_PADDING_PT * pageScale;
        const contentWidth = Math.max(cellWidthPt - padding * 2, 4);
        const align = (cell.style.align || 'left') as 'left' | 'center' | 'right';
        const verticalAlign = cell.style.verticalAlign || 'middle';
        const rawValue = cell.value === null || cell.value === undefined ? '' : String(cell.value);

        if (cell.editable && includeFormFields) {
          let field;
          try {
            field = form.getTextField(cell.address);
          } catch (error) {
            field = form.createTextField(cell.address);
          }
          try {
            // Ensure default appearance exists before sizing or setting text
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (field as any).acroField?.setDefaultAppearance(`/${font.name} ${fontSize} Tf 0 g`);
          } catch (err) {
            // Ignore; pdf-lib will fallback to default Helv if not available
          }
          field.defaultUpdateAppearances(font);
          try {
            field.setFontSize(fontSize);
          } catch (err) {
            // If setting size fails due to DA, rely on default appearance
          }
          field.addToPage(page, {
            x: xPt,
            y: yBottomPt,
            width: cellWidthPt,
            height: cellHeightPt,
          });
          const alignKey = (align || 'left').toLowerCase();
          const pdfAlign =
            alignKey === 'center'
              ? TextAlignment.Center
              : alignKey === 'right'
                ? TextAlignment.Right
                : TextAlignment.Left;
          field.setAlignment(pdfAlign);
          field.enableMultiline();
          if (rawValue) {
            field.setText(rawValue);
          }
          fields.push({
            name: cell.address,
            pageIndex,
            x: xPt,
            y: LETTER.height - yBottomPt - cellHeightPt,
            width: cellWidthPt,
            height: cellHeightPt,
            fontSize,
            align,
            wrap: Boolean(cell.style.wrap),
          });
        } else if (rawValue) {
          const lines = wrapTextIntoLines(rawValue, contentWidth, font, fontSize);
          const lineGap = BASE_LINE_GAP_PT * pageScale;
          const totalHeight = lines.length * fontSize + (lines.length - 1) * lineGap;

          let cursorY: number;
          if (verticalAlign === 'top') {
            cursorY = yBottomPt + cellHeightPt - padding - fontSize;
          } else if (verticalAlign === 'bottom') {
            cursorY = yBottomPt + padding + totalHeight - fontSize;
          } else {
            cursorY = yBottomPt + (cellHeightPt + totalHeight) / 2 - fontSize;
          }

          lines.forEach((line, idx) => {
            const lineWidth = font.widthOfTextAtSize(line, fontSize);
            let textX = xPt + padding;
            if (align === 'center') {
              textX = xPt + (cellWidthPt - lineWidth) / 2;
            } else if (align === 'right') {
              textX = xPt + cellWidthPt - padding - lineWidth;
            }

            const textY = cursorY - idx * (fontSize + lineGap);
            page.drawText(line, {
              x: textX,
              y: textY,
              size: fontSize,
              font,
              color: rgb(0, 0, 0),
            });
          });
        }
      });
      rowOffsetPx += rowHeightPx;
    });
  });

  if (includeFormFields) {
    form.updateFieldAppearances(fontRegular);
  }

  if (flatten) {
    form.flatten();
  }

  const pdfBytes = await pdf.save();
  return { pdfBytes, fields, pageSizes };
}
