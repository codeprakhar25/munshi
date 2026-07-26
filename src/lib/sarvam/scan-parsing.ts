import type { PageBlock } from '@/lib/sarvam/document-intelligence';
import type { ScanLineDraft } from '@/store/scan-store';

const ENTITY_MAP: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

function decodeEntities(text: string): string {
  return text.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (m) => ENTITY_MAP[m] ?? m);
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

const NUMERIC_RE = /^[₹]?\s?[\d,]+(\.\d+)?$/;
const DATE_RE = /^\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?$/;

function parseNumeric(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) && cleaned.length > 0 ? n : null;
}

function makeDraftId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function parseTableBlock(block: PageBlock): ScanLineDraft[] {
  // Strip <thead>...</thead> first: colspan only ever appears in header rows
  // in real samples, and we infer column meaning from cell content, not
  // header labels, so header rows can be dropped outright.
  const withoutHead = block.text.replace(/<thead[^>]*>[\s\S]*?<\/thead>/gi, '');
  const rowMatches = [...withoutHead.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];

  const drafts: ScanLineDraft[] = [];
  for (const rowMatch of rowMatches) {
    const cellMatches = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    const cells = cellMatches.map((m) => cellText(m[1])).filter((c) => c.length > 0 && c.toLowerCase() !== 'null');
    if (cells.length === 0) continue;

    let date: string | null = null;
    let amount: number | null = null;
    let particulars = '';
    for (const cell of cells) {
      if (DATE_RE.test(cell) && !date) {
        date = cell;
        continue;
      }
      if (NUMERIC_RE.test(cell)) {
        const n = parseNumeric(cell);
        if (n !== null && (amount === null || n > amount)) amount = n;
        continue;
      }
      if (cell.length > particulars.length) particulars = cell;
    }
    if (!particulars && amount === null && !date) continue;

    drafts.push({
      id: makeDraftId(),
      rawText: cells.join(' · '),
      date,
      particulars: particulars || cells.join(' '),
      amount,
      type: 'credit',
      nameToken: null,
      matchedPersonId: null,
      matchState: 'unresolved',
      confirmed: false,
    });
  }
  return drafts;
}

function parseParagraphBlock(block: PageBlock): ScanLineDraft {
  const amountMatch = block.text.match(/₹?\s?(\d[\d,]*)/);
  const amount = amountMatch ? parseNumeric(amountMatch[1]) : null;
  const particulars = amountMatch ? block.text.replace(amountMatch[0], '').trim() : block.text.trim();
  return {
    id: makeDraftId(),
    rawText: block.text,
    date: null,
    particulars,
    amount,
    type: 'credit',
    nameToken: null,
    matchedPersonId: null,
    matchState: 'unresolved',
    confirmed: false,
  };
}

const SKIP_LAYOUT_TAGS = new Set(['image', 'image-caption', 'footer', 'footnote']);

/**
 * Turns raw Sarvam page blocks into editable review drafts. No confidence
 * gating anywhere: table-level confidence doesn't reflect per-line accuracy,
 * and item-name transcription was observed to vary run-to-run on identical
 * input, so every draft gets the same "please check" treatment.
 */
export function parseBlocksToDrafts(blocks: PageBlock[]): ScanLineDraft[] {
  const drafts: ScanLineDraft[] = [];
  for (const block of blocks) {
    if (SKIP_LAYOUT_TAGS.has(block.layout_tag)) continue;
    if (block.layout_tag === 'table') {
      try {
        const tableDrafts = parseTableBlock(block);
        if (tableDrafts.length === 0) throw new Error('no rows parsed');
        drafts.push(...tableDrafts);
      } catch {
        // Malformed/nested table markup: don't lose the data, just fall
        // back to one flattened draft instead of debugging regex live.
        drafts.push(parseParagraphBlock({ ...block, text: cellText(block.text) }));
      }
    } else {
      const text = block.text.trim();
      if (text.length === 0) continue;
      drafts.push(parseParagraphBlock(block));
    }
  }
  return drafts;
}
