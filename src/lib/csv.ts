/**
 * Minimal RFC-4180-ish CSV parser (no dependency). Handles quoted fields,
 * escaped quotes ("") and newlines inside quotes - enough for Goodreads /
 * StoryGraph exports. A quote in the middle of an unquoted field (5'10" tall)
 * is taken literally: opening quoted mode there swallowed the rest of the file.
 * The delimiter is sniffed from the header line: a Goodreads or StoryGraph
 * file re-saved by Excel in a locale whose list separator is ";" (Italian,
 * German, French…) arrives semicolon-separated, and tab-separated exports
 * exist too.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows = parseRows(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0].trim() === '') continue; // skip blank lines
    const obj: Record<string, string> = {};
    headers.forEach((h, j) => {
      obj[h] = (r[j] ?? '').trim();
    });
    out.push(obj);
  }
  return out;
}

const DELIMITERS = [',', ';', '\t'] as const;

/**
 * The field separator used by a CSV's header line: whichever of ",", ";"
 * and tab occurs most often outside quotes (comma on a tie, and when none
 * occurs: a one-column file). Only the header is looked at - a title can
 * contain any of them, a header name can't.
 */
export function sniffDelimiter(headerLine: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const c of headerLine) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c in counts) counts[c]++;
  }
  let best: ',' | ';' | '\t' = ',';
  for (const d of DELIMITERS) if (counts[d] > counts[best]) best = d;
  return best;
}

function parseRows(text: string): string[][] {
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const delimiter = sniffDelimiter(s.slice(0, s.indexOf('\n') >>> 0));
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field.trim() === '') {
      // A quote after only whitespace (`a, "b, c"` as some spreadsheets
      // write it) still opens the field; the padding isn't part of it.
      field = '';
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
