import { PDFDocument, PDFFont, rgb, StandardFonts, TextAlignment } from 'pdf-lib';
import { ContractFieldRender } from './contractGenerator';
import { ContractTemplateId, getContractTemplate } from './contractTemplates';

export type ContractPdfFieldLayout = {
  name: string;
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
const BLUE_FILL = rgb(232 / 255, 240 / 255, 255 / 255);
const YELLOW_FILL = rgb(255 / 255, 247 / 255, 209 / 255);

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

function fitFontSizeForField(field: ContractFieldRender, font: PDFFont): number {
  const text = field.value || '';
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
  const templateBytes = await loadTemplateBytes(templateId);
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
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

  fields.forEach((field) => {
    if (!(field.label || '').trim()) return;
    const pageIndex = Math.max(0, Math.min(pdf.getPageCount() - 1, field.page - 1));
    const page = pdf.getPage(pageIndex);
    const pageHeight = page.getHeight();
    const width = field.width;
    const height = field.height;
    const x = field.x;
    const y = pageHeight - (field.y + height);
    const fontSize = fitFontSizeForField(field, font);

    pdfFields.push({
      name: field.id,
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
      const inset = 0.6; // leave the template grid lines intact while covering printed defaults
      const rectX = x + inset;
      const rectY = y + inset;
      const rectWidth = Math.max(0, width - inset * 2);
      const rectHeight = Math.max(0, height - inset * 2);
      if (rectWidth > 0 && rectHeight > 0) {
        page.drawRectangle({
          x: rectX,
          y: rectY,
          width: rectWidth,
          height: rectHeight,
          color: fillColor,
          borderWidth: 0,
        });
      }
    }

    if (shouldDrawText && (field.value || '').trim()) {
      const value = field.value || '';
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
    textField.setText(field.value || '');
    textField.setAlignment(TextAlignment.Center);
  });

  if (useFormFields) {
    form.updateFieldAppearances(font);
  }

  const pdfBytes = await pdf.save();
  return { pdfBytes, fields: pdfFields, pageSizes };
}
