/** Minimal RFC 5545 writer. Text is escaped and lines are folded at 75 octets so strict clients accept the feed. */
const escapeText = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, String.raw`\;`).replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function fold(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // never split inside a multi-byte character
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    parts.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }
  return parts.join('\r\n ');
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export type IcsEvent = { id: string; title: string; description: string | null; location: string | null; startDateTime: Date; endDateTime: Date | null; updatedAt: Date };

export function buildIcs(calendarName: string, events: IcsEvent[], now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ecclesia//Church Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escapeText(calendarName)}`];
  for (const e of events) {
    // Events without an end time are shown as one hour long.
    const end = e.endDateTime ?? new Date(e.startDateTime.getTime() + 60 * 60 * 1000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@ecclesia`,
      `DTSTAMP:${stamp(now)}`,
      `LAST-MODIFIED:${stamp(e.updatedAt)}`,
      `DTSTART:${stamp(e.startDateTime)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.location ? [`LOCATION:${escapeText(e.location)}`] : []),
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
