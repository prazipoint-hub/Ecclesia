import PDFDocument from 'pdfkit';

export type StatementLine = {
  issuedAt: Date;
  receiptNumber: string;
  description: string;
  paymentMethod: string;
  currency: string;
  amount: number;
};

export type StatementData = {
  churchName: string;
  memberName: string;
  membershipNumber: string;
  year: number;
  lines: StatementLine[];
};

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, currencyDisplay: 'code' }).format(amount);

const label = (value: string) => value.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

export function buildGivingStatementPdf(data: StatementData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(data.churchName);
    doc.moveDown(0.2).fontSize(13).text(`Statement of giving ${data.year}`);
    doc.moveDown(0.6).fontSize(10).fillColor('#444444');
    doc.text(`Member: ${data.memberName}`);
    doc.text(`Membership number: ${data.membershipNumber}`);
    doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`);
    doc.fillColor('#000000').moveDown();

    if (data.lines.length === 0) {
      doc.fontSize(11).text(`No contributions were recorded for ${data.year}.`);
    } else {
      const columns = [48, 120, 215, 345, 430];
      const header = (y: number) => {
        doc.fontSize(9).fillColor('#444444');
        ['Date', 'Receipt', 'Description', 'Method', 'Amount'].forEach((title, i) => doc.text(title, columns[i], y));
        doc.fillColor('#000000');
      };

      let y = doc.y;
      header(y);
      y += 16;
      for (const line of data.lines) {
        if (y > 760) {
          doc.addPage();
          y = 48;
          header(y);
          y += 16;
        }
        doc.fontSize(9);
        doc.text(line.issuedAt.toISOString().slice(0, 10), columns[0], y);
        doc.text(line.receiptNumber, columns[1], y, { width: 90 });
        doc.text(line.description, columns[2], y, { width: 125 });
        doc.text(label(line.paymentMethod), columns[3], y, { width: 80 });
        doc.text(money(line.amount, line.currency), columns[4], y, { width: 110 });
        y += 16;
      }

      const totals = new Map<string, number>();
      for (const line of data.lines) {
        totals.set(line.currency, Math.round(((totals.get(line.currency) ?? 0) + line.amount) * 100) / 100);
      }
      doc.x = 48;
      doc.y = y + 12;
      doc.fontSize(11).text('Totals', 48, doc.y);
      for (const [currency, total] of totals) {
        doc.fontSize(10).text(`${currency}: ${money(total, currency)}`, 48);
      }
      doc.moveDown().fontSize(8).fillColor('#666666');
      doc.text('Only receipts with status Issued are included. Voided or reversed receipts are excluded.', 48);
    }

    doc.end();
  });
}
