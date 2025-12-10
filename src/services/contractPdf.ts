import { PDFDocument, StandardFonts, TextAlignment } from 'pdf-lib';
import { ContractFieldRender } from './contractGenerator';

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
};

const TEMPLATE_URL = new URL('../../docs/Contracts/PPAS Contract Template.pdf', import.meta.url).href;
const DEFAULT_FONT_SIZE = 10;

async function loadTemplateBytes(): Promise<Uint8Array> {
  // Browser
  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    const res = await fetch(TEMPLATE_URL);
    const buffer = await res.arrayBuffer();
    return new Uint8Array(buffer);
  }

  // Node / Electron
  const fs = await import('fs');
  const path = new URL('../../docs/Contracts/PPAS Contract Template.pdf', import.meta.url).pathname;
  return fs.readFileSync(path);
}

export async function buildContractPdf(
  fields: ContractFieldRender[],
  options: ContractPdfBuildOptions = {}
): Promise<ContractPdfResult> {
  const { flatten = false, includeFormFields = true } = options;
  const templateBytes = await loadTemplateBytes();
  const pdf = await PDFDocument.load(templateBytes);
  const form = pdf.getForm();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

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

    pdfFields.push({
      name: field.id,
      pageIndex,
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
      fontSize: DEFAULT_FONT_SIZE,
      color: field.color,
    });

    if (!includeFormFields) return;

    const textField = form.createTextField(field.id);
    textField.addToPage(page, { x, y, width, height });
    textField.setFontSize(DEFAULT_FONT_SIZE);
    textField.enableMultiline();
    textField.setText(field.value || '');
    textField.setAlignment(TextAlignment.Left);
  });

  if (includeFormFields) {
    form.updateFieldAppearances(font);
  }

  if (flatten) {
    form.flatten();
  }

  const pdfBytes = await pdf.save();
  return { pdfBytes, fields: pdfFields, pageSizes };
}
