/**
 * Sarvam page blocks -> one item per money fact, in reading order.
 *
 * Line by line, as scanned. A line naming two purchases and a part-payment
 * ("suresh ka 300 tel ka aur 200 biscuit ka baaki h usme se 50 jma h") becomes
 * three items sharing one name and one source line — each with a single amount
 * and a single direction, which is the only shape the review card can honestly
 * let the merchant edit.
 *
 * What this deliberately does NOT do: gate on confidence. Sarvam reports one
 * score per table, not per line, and the same handwritten page OCR'd twice
 * produced different item names. Every item gets identical "please check"
 * treatment.
 *
 * No `react-native` / `expo-*` / Node imports.
 */
import { parseTable, type ColumnRole } from './columns';
import { looksLikeContinuation, parseLine, splitLines } from './lines';
import { parseAmount } from './numerals';
import type { ItemDirection, ScanItem } from './types';

export interface PageBlock {
  block_id: string;
  coordinates: { x1: number; y1: number; x2: number; y2: number };
  layout_tag:
    | 'section-title' | 'header' | 'paragraph' | 'table'
    | 'image' | 'image-caption' | 'footnote' | 'footer'
    | 'sidebar'
    | string;
  confidence: number;
  reading_order: number;
  text: string;
}

/**
 * `image` blocks are dropped outright: on non-text regions (a QR code, a stain)
 * Sarvam emitted confident hallucinated captions during testing. `header`,
 * `footer`, `section-title`, `sidebar` are page furniture — the old parser
 * turned the page title into a line item the merchant had to dismiss.
 */
const SKIP_TAGS = new Set([
  'image', 'image-caption', 'footer', 'footnote', 'header', 'section-title', 'sidebar',
]);

function fromTextBlock(block: PageBlock): ScanItem[] {
  const out: ScanItem[] = [];
  // Carry the last named person across continuation rows:
  //   "रमेश सोलंकी -> 50 Rs दूध +"
  //   "100 ₹ हल्दी"          ← same person
  //   "+ 50 Rs चाय पत्ती"    ← same person as line above
  let lastName: string | null = null;

  splitLines(block.text).forEach((line, row) => {
    const parsed = parseLine(line);
    if (!parsed) return;

    if (parsed.nameToken) {
      lastName = parsed.nameToken;
    } else if (looksLikeContinuation(line) && lastName) {
      parsed.nameToken = lastName;
    }

    parsed.items.forEach((item, i) =>
      out.push({
        rawText: parsed.text,
        nameToken: parsed.nameToken,
        date: parsed.date,
        amount: item.amount,
        direction: item.direction,
        label: item.label,
        directionReason: item.reason,
        ref: { blockId: block.block_id, row, item: i },
      }),
    );
  });
  return out;
}

/** Which columns may contribute an amount, and with what direction. */
const AMOUNT_ROLES: Partial<Record<ColumnRole, ItemDirection>> = {
  udhaar: 'udhaar',
  payment: 'payment',
};

function fromTableBlock(block: PageBlock): ScanItem[] {
  const table = parseTable(block.text);
  // Malformed or nested markup: flatten to text rather than debug regex live.
  if (!table) return fromTextBlock({ ...block, text: block.text.replace(/<[^>]+>/g, ' ') });

  const { roles, rows } = table;
  const out: ScanItem[] = [];

  rows.forEach((cells, row) => {
    const at = (role: ColumnRole) => {
      const i = roles.indexOf(role);
      return i >= 0 ? (cells[i] ?? '') : '';
    };
    const name = at('name') || null;
    const date = at('date') || null;
    const particulars = at('particulars');

    // The balance column is READ but never posted — it is a running total, not
    // a transaction. Taking it as an amount is what inflated the ledger on
    // every import in the previous parser.
    const typed: { amount: number; direction: ItemDirection }[] = [];
    roles.forEach((role, i) => {
      const direction = AMOUNT_ROLES[role];
      if (!direction) return;
      const amount = parseAmount(cells[i] ?? '');
      if (amount === null || amount === 0) return;
      typed.push({ amount: Math.abs(amount), direction: amount < 0 ? 'payment' : direction });
    });

    if (typed.length) {
      typed.forEach((item, i) =>
        out.push({
          rawText: cells.filter(Boolean).join(' · '),
          nameToken: name,
          date,
          amount: item.amount,
          direction: item.direction,
          label: particulars,
          directionReason: 'column',
          ref: { blockId: block.block_id, row, item: i },
        }),
      );
      return;
    }

    // No typed amount column: the row may still be prose in a single cell.
    const joined = cells.filter(Boolean).join(' ');
    const parsed = parseLine(joined);
    if (!parsed) return;
    parsed.items.forEach((item, i) =>
      out.push({
        rawText: joined,
        nameToken: name ?? parsed.nameToken,
        date: date ?? parsed.date,
        amount: item.amount,
        direction: item.direction,
        label: item.label || particulars,
        directionReason: item.reason,
        ref: { blockId: block.block_id, row, item: i },
      }),
    );
  });

  return out;
}

/** Blocks in reading order -> items. Person matching happens in `resolve.ts`. */
export function parseBlocksToItems(blocks: PageBlock[]): ScanItem[] {
  const ordered = [...blocks].sort((a, b) => a.reading_order - b.reading_order);
  const out: ScanItem[] = [];
  for (const block of ordered) {
    if (SKIP_TAGS.has(block.layout_tag)) continue;
    if (!block.text || !block.text.trim()) continue;
    out.push(...(block.layout_tag === 'table' ? fromTableBlock(block) : fromTextBlock(block)));
  }
  return out;
}
