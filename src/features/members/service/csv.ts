/** Minimal RFC 4180 CSV reader/writer: quoted fields, escaped quotes, CRLF, optional BOM. */

export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += char;
    } else if (char === '"' && field === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(field); field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += char;
  }
  if (quoted) throw new Error('Unterminated quoted field');
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Spreadsheet apps run cells that start with these characters as formulas, so defuse them. */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const toCsv = (header: string[], rows: unknown[][]): string =>
  [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
