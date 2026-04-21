import { PDFDocument, PDFFont, rgb, StandardFonts, TextAlignment } from 'pdf-lib';
import { ContractFieldRender } from './contractGenerator';
import { ContractStaticPatch, ContractTemplateId, getContractTemplate } from './contractTemplates';

export type ContractPdfFieldLayout = {
  name: string;
  label: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: 'blue' | 'yellow';
};

export type ContractPdfResult = {
  pdfBytes: Uint8Array;
  fields: ContractPdfFieldLayout[];
  pageSizes: { width: number; height: number }[];
};

type ContractPdfBuildOptions = {
  flatten?: boolean;
  includeFormFields?: boolean;
  templateId?: ContractTemplateId;
};

const DEFAULT_FONT_SIZE = 10;
const MIN_FONT_SIZE = 6;
const HEIGHT_MARGIN = 2; // leave more headroom so text sits cleanly inside shallow fields
const HEIGHT_SCALE = 0.92; // reduce further to account for field padding/appearance
const WIDTH_PADDING = 2;
const BLUE_FILL = rgb(221 / 255, 235 / 255, 247 / 255);
const YELLOW_FILL = rgb(255 / 255, 247 / 255, 209 / 255);
const FIELD_BORDER = rgb(26 / 255, 26 / 255, 26 / 255);
const WHITE_FILL = rgb(1, 1, 1);
const HEADER_GRAY_FILL = rgb(174 / 255, 170 / 255, 170 / 255);
const PDF_SAFE_CHARACTER_FALLBACK = '?';

const PDF_TEXT_SUBSTITUTIONS: Record<string, string> = {
  '\u00a0': ' ',
  '\u200b': '',
  '\u200c': '',
  '\u200d': '',
  '\ufeff': '',
  '\u2018': "'",
  '\u2019': "'",
  '\u201a': "'",
  '\u201b': "'",
  '\u201c': '"',
  '\u201d': '"',
  '\u201e': '"',
  '\u201f': '"',
  '\u2022': '*',
  '\u2026': '...',
  '\u00a9': '(C)',
  '\u00ae': '(R)',
  '\u2122': 'TM',
  '\u2010': '-',
  '\u2011': '-',
  '\u2012': '-',
  '\u2013': '-',
  '\u2014': '-',
  '\u2015': '-',
};

function resolvePatchFillColor(fill: ContractStaticPatch['fill']) {
  if (fill === 'headerGray') return HEADER_GRAY_FILL;
  return WHITE_FILL;
}

async function loadTemplateBytes(templateId?: ContractTemplateId): Promise<Uint8Array> {
  const template = getContractTemplate(templateId);
  // Browser
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    const res = await fetch(template.pdfUrl);
    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  }

  // Node / Electron
  const fs = await import('fs');
  return fs.readFileSync(template.pdfPath);
}

function canEncodePdfText(font: PDFFont, value: string): boolean {
  try {
    font.widthOfTextAtSize(value, 1);
    return true;
  } catch {
    return false;
  }
}

function sanitizePdfText(value: string, font: PDFFont): string {
  if (!value) return '';

  const normalizedWhitespace = value
    .replace(/\r\n?/g, ' ')
    .replace(/[\n\t\f\v]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let sanitized = '';
  for (const char of Array.from(normalizedWhitespace)) {
    const replacement = PDF_TEXT_SUBSTITUTIONS[char] ?? char;
    for (const candidate of Array.from(replacement)) {
      sanitized += canEncodePdfText(font, candidate) ? candidate : PDF_SAFE_CHARACTER_FALLBACK;
    }
  }

  return sanitized;
}

function fitFontSizeForField(field: ContractFieldRender, text: string, font: PDFFont): number {
  const maxTextHeight = Math.max(4, field.height - HEIGHT_MARGIN);
  let fontSize = Math.min(DEFAULT_FONT_SIZE, font.sizeAtHeight(maxTextHeight) * HEIGHT_SCALE);

  if (text) {
    const usableWidth = Math.max(4, field.width - WIDTH_PADDING);
    const widthAtSizeOne = font.widthOfTextAtSize(text, 1);
    if (widthAtSizeOne > 0) {
      fontSize = Math.min(fontSize, usableWidth / widthAtSizeOne);
    }
  }

  if (!Number.isFinite(fontSize) || fontSize <= 0) return MIN_FONT_SIZE;
  return Math.max(MIN_FONT_SIZE, Math.min(DEFAULT_FONT_SIZE, fontSize));
}

export async function buildContractPdf(
  fields: ContractFieldRender[],
  options: ContractPdfBuildOptions = {}
): Promise<ContractPdfResult> {
  const { flatten = false, includeFormFields = true, templateId } = options;
  const template = getContractTemplate(templateId);
  const templateBytes = await loadTemplateBytes(templateId);
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const shouldDrawText = flatten;
  const useFormFields = includeFormFields && !flatten;

  // When exporting (flatten), strip existing form fields so only our drawn text remains.
  if (flatten) {
    form.getFields().forEach((field) => {
      try {
        form.removeField(field);
      } catch {
        /* ignore */
      }
    });
    try {
      form.flatten();
    } catch {
      /* ignore */
    }
  }

  const pageSizes: { width: number; height: number }[] = pdf.getPages().map((p) => ({
    width: p.getWidth(),
    height: p.getHeight(),
  }));

  const pdfFields: ContractPdfFieldLayout[] = [];

  template.staticPatches.forEach((patch) => {
    const pageIndex = Math.max(0, Math.min(pdf.getPageCount() - 1, patch.page - 1));
    const page = pdf.getPage(pageIndex);
    const [x, y, width, height] = patch.rect;

    page.drawRectangle({
      x,
      y,
      width,
      height,
      color: resolvePatchFillColor(patch.fill),
      borderWidth: 0,
    });

    (patch.texts || []).forEach((text) => {
      const textFont = text.fontStyle === 'bold' ? boldFont : font;
      const textWidth = textFont.widthOfTextAtSize(text.text, text.fontSize);
      const drawX =
        text.align === 'center' && text.width
          ? text.x + Math.max(0, (text.width - textWidth) / 2)
          : text.x;
      page.drawText(text.text, {
        x: drawX,
        y: text.y,
        size: text.fontSize,
        font: textFont,
        color: rgb(0, 0, 0),
      });
    });
  });

  fields.forEach((field) => {
    if (!(field.label || '').trim()) return;

    try {
      const value = sanitizePdfText(field.value || '', font);
      const pageIndex = Math.max(0, Math.min(pdf.getPageCount() - 1, field.page - 1));
      const page = pdf.getPage(pageIndex);
      const pageHeight = page.getHeight();
      const width = field.width;
      const height = field.height;
      const x = field.x;
      const y = pageHeight - (field.y + height);
      const fontSize = fitFontSizeForField(field, value, font);

      pdfFields.push({
        name: field.id,
        label: field.label,
        pageIndex,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        fontSize,
        color: field.color,
      });

      if (flatten) {
        const fillColor = field.color === 'yellow' ? YELLOW_FILL : BLUE_FILL;
        if (width > 0 && height > 0) {
          page.drawRectangle({
            x,
            y,
            width,
            height,
            color: fillColor,
            borderColor: FIELD_BORDER,
            borderWidth: 0.9,
          });
        }
      }

      if (shouldDrawText && value) {
        const availableWidth = Math.max(4, width - WIDTH_PADDING);
        let drawFontSize = fontSize;
        const measuredWidth = font.widthOfTextAtSize(value, drawFontSize);
        if (measuredWidth > availableWidth) {
          drawFontSize = Math.max(MIN_FONT_SIZE, (availableWidth / measuredWidth) * drawFontSize);
        }
        const textWidth = font.widthOfTextAtSize(value, drawFontSize);
        const textHeight = font.heightAtSize(drawFontSize);
        const textX = x + Math.max(1, (width - textWidth) / 2);
        const textY = y + Math.max(0.5, (height - textHeight) / 2);
        page.drawText(value, {
          x: textX,
          y: textY,
          size: drawFontSize,
          font,
          color: rgb(0, 0, 0),
          maxWidth: availableWidth,
        });
      }

      if (!useFormFields) return;

      const textField = form.createTextField(field.id);
      textField.addToPage(page, { x, y, width, height });
      textField.setFontSize(fontSize);
      textField.enableMultiline();
      textField.setText(value);
      textField.setAlignment(TextAlignment.Center);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to render contract field "${field.id}" on page ${field.page}: ${message}`);
    }
  });

  if (useFormFields) {
    form.updateFieldAppearances(font);
  }

  const pdfBytes = await pdf.save();
  return { pdfBytes, fields: pdfFields, pageSizes };
}
