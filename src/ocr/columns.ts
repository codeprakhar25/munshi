/**
 * Ruled-register support: HTML table -> typed columns -> rows.
 *
 * Secondary to `lines.ts` (the demo register is prose), but cheap and it fixes
 * the single worst bug in the old parser: taking the LARGEST number in a row as
 * the amount. In a ruled khata the largest number is the RUNNING BALANCE
 * column, so every scanned page posted the balance as a fresh credit and the
 * ledger inflated on every import.
 *
 * The fix is to read the header row instead of throwing it away. `जमा` vs
 * `उधार` vs `बाकी` is the direction signal, written on the page, free.
 *
 * No `react-native` / `expo-*` / Node imports.
 */
import { looksLikeDate, parseAmount } from './numerals';

export type ColumnRole = 'date' | 'name' | 'particulars' | 'payment' | 'udhaar' | 'balance' | 'unknown';

/**
 * Header keyword -> column meaning. Matched as a substring on the normalized
 * header cell, longest first, so "बाकी रकम" hits `balance` and not `unknown`.
 */
const HEADER_KEYWORDS: [ColumnRole, string[]][] = [
  ['date', ['तारीख', 'दिनांक', 'तिथि', 'date', 'dt', 'tarikh']],
  ['name', ['नाम', 'ग्राहक', 'पार्टी', 'name', 'customer', 'party', 'naam']],
  ['particulars', ['विवरण', 'सामान', 'माल', 'वस्तु', 'particular', 'item', 'detail', 'description', 'samaan']],
  ['payment', ['जमा', 'भुगतान', 'प्राप्त', 'credit', 'paid', 'payment', 'received', 'jama', 'cr']],
  ['udhaar', ['उधार', 'नामे', 'देना', 'debit', 'udhar', 'udhaar', 'amount', 'dr', 'रकम']],
  ['balance', ['बाकी', 'शेष', 'बकाया', 'balance', 'baaki', 'baki', 'outstanding', 'total', 'कुल']],
];

const norm = (s: string) => s.toLowerCase().normalize('NFKC').replace(/\s+/g, ' ').trim();

export function roleFromHeader(headerCell: string): ColumnRole {
  const h = norm(headerCell);
  if (!h) return 'unknown';
  // `balance` is checked before `udhaar` because "बाकी रकम" contains both and
  // reading it as an amount column is exactly the bug being fixed.
  const ordered: ColumnRole[] = ['balance', 'payment', 'udhaar', 'date', 'name', 'particulars'];
  for (const role of ordered) {
    const entry = HEADER_KEYWORDS.find(([r]) => r === role);
    if (entry && entry[1].some((kw) => h.includes(norm(kw)))) return role;
  }
  return 'unknown';
}

/**
 * Column roles when there is no readable header.
 *
 * The balance column is identified structurally rather than by name: its values
 * track a running fold of the other numeric column(s). That test is exact and
 * needs no keyword — if column B's row-to-row deltas equal column A's values on
 * most rows, B is the balance and A is the amount.
 */
export function inferRoles(rows: string[][], columnCount: number): ColumnRole[] {
  const roles: ColumnRole[] = Array.from({ length: columnCount }, () => 'unknown');
  const column = (i: number) => rows.map((r) => r[i] ?? '');

  const numericCols: number[] = [];
  for (let i = 0; i < columnCount; i += 1) {
    const cells = column(i).filter((c) => c.trim().length > 0);
    if (!cells.length) continue;
    const dates = cells.filter(looksLikeDate).length;
    const nums = cells.filter((c) => parseAmount(c) !== null).length;

    if (dates / cells.length >= 0.6) roles[i] = 'date';
    else if (nums / cells.length >= 0.7) numericCols.push(i);
    else roles[i] = 'unknown'; // name vs particulars decided by the caller, on match rate
  }

  // A balance column agrees with the running fold of another numeric column.
  for (const b of numericCols) {
    const bVals = rows.map((r) => parseAmount(r[b] ?? ''));
    for (const a of numericCols) {
      if (a === b) continue;
      const aVals = rows.map((r) => parseAmount(r[a] ?? ''));
      let agree = 0;
      let checked = 0;
      for (let i = 1; i < rows.length; i += 1) {
        const prev = bVals[i - 1];
        const cur = bVals[i];
        const delta = aVals[i];
        if (prev === null || cur === null || delta === null) continue;
        checked += 1;
        if (Math.abs(Math.abs(cur - prev) - Math.abs(delta)) <= 1) agree += 1;
      }
      if (checked >= 2 && agree / checked >= 0.7) {
        roles[b] = 'balance';
        roles[a] = roles[a] === 'unknown' ? 'udhaar' : roles[a];
      }
    }
  }

  for (const i of numericCols) if (roles[i] === 'unknown') roles[i] = 'udhaar';
  return roles;
}

export interface TableShape {
  roles: ColumnRole[];
  rows: string[][];
}

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
};

export function cellText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

const rowsOf = (html: string): string[][] =>
  [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((tr) =>
    [...tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((td) => cellText(td[1])),
  );

/**
 * Splits a table into typed columns and body rows.
 *
 * The header is READ, not stripped. Colspan only ever appeared in header rows
 * in real samples, so a header whose cell count disagrees with the body is
 * discarded and roles fall back to inference rather than mis-aligning every
 * column by one.
 */
export function parseTable(html: string): TableShape | null {
  const headMatch = html.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
  const body = html.replace(/<thead[^>]*>[\s\S]*?<\/thead>/gi, '');

  const bodyRows = rowsOf(body).filter((r) => r.some((c) => c.length > 0 && c.toLowerCase() !== 'null'));
  if (!bodyRows.length) return null;

  const columnCount = Math.max(...bodyRows.map((r) => r.length));
  let roles: ColumnRole[] | null = null;

  const headerCells = headMatch ? rowsOf(headMatch[1])[0] : undefined;
  if (headerCells && headerCells.length === columnCount) {
    const fromHeader = headerCells.map(roleFromHeader);
    if (fromHeader.filter((r) => r !== 'unknown').length >= 2) roles = fromHeader;
  }

  return { roles: roles ?? inferRoles(bodyRows, columnCount), rows: bodyRows };
}
