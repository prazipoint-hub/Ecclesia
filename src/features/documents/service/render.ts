import PDFDocument from 'pdfkit';

/** The only placeholders a template may use. `field.name` placeholders are filled from values supplied at generation. */
export const KNOWN_PLACEHOLDERS = ['memberName', 'memberFirstName', 'memberLastName', 'membershipNumber', 'churchName', 'date', 'serial'] as const;
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9.]+)\s*\}\}/g;

export function placeholdersIn(text: string): string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}

export function unknownPlaceholders(text: string): string[] {
  return placeholdersIn(text).filter((p) => !(KNOWN_PLACEHOLDERS as readonly string[]).includes(p) && !/^field\.[A-Za-z][A-Za-z0-9]{0,29}$/.test(p));
}

/** Plain substitution only: values are treated as text, never as template code, and a missing value is an error. */
export function fill(text: string, values: Record<string, string | undefined>): string {
  return text.replace(PLACEHOLDER, (_m, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Missing value for ${key}`);
    return value;
  });
}

export function renderPdf(doc: { title: string; content: string; serial: string; churchName: string; voided: boolean; type: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({ margin: 64, size: 'A4', info: { Title: doc.title } });
    const chunks: Buffer[] = [];
    pdf.on('data', (c: Buffer) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    if (doc.type === 'CERTIFICATE') pdf.rect(32, 32, pdf.page.width - 64, pdf.page.height - 64).lineWidth(2).stroke('#444444');
    pdf.fillColor('#000000').fontSize(12).text(doc.churchName, { align: 'center' });
    pdf.moveDown(1.5).fontSize(doc.type === 'CERTIFICATE' ? 26 : 18).text(doc.title, { align: 'center' });
    pdf.moveDown(1.5).fontSize(12).text(doc.content, { align: doc.type === 'CERTIFICATE' ? 'center' : 'left', lineGap: 4 });
    pdf.fontSize(9).fillColor('#666666').text(`Serial ${doc.serial}`, 64, pdf.page.height - 80, { align: 'left' });
    if (doc.voided) {
      pdf.save().rotate(-30, { origin: [pdf.page.width / 2, pdf.page.height / 2] }).fontSize(96).fillColor('#cc0000').opacity(0.25)
        .text('VOID', 0, pdf.page.height / 2 - 48, { align: 'center', width: pdf.page.width }).restore();
    }
    pdf.end();
  });
}
