/**
 * Thin RN-facing adapter: page blocks → person Draft[] for the scan review UI.
 * Grouping lives in `src/ocr/group` so the headless harness shares one path.
 */
import type { Draft, DraftPerson, Khata } from '@/agent/types';
import type { PageBlock as DiPageBlock } from '@/lib/sarvam/document-intelligence';
import { groupItemsToDrafts } from '@/ocr/group';
import { parseBlocksToItems, type PageBlock as OcrPageBlock } from '@/ocr/page';
import { priceAgainst } from '@/ocr/resolve';

function toOcrBlocks(blocks: DiPageBlock[]): OcrPageBlock[] {
  return blocks.map((b) => ({
    block_id: b.block_id,
    coordinates: b.coordinates,
    layout_tag: b.layout_tag as OcrPageBlock['layout_tag'],
    confidence: b.confidence,
    reading_order: b.reading_order,
    text: b.text,
  }));
}

/** Fold Sarvam page blocks into one Draft per person (keyword path, no match). */
export function parseBlocksToDrafts(blocks: DiPageBlock[]): Draft[] {
  const items = parseBlocksToItems(toOcrBlocks(blocks));
  return groupItemsToDrafts(items);
}

/** Attach a resolved person + reprice before/after. Never sets confirmed. */
export function attachPerson(draft: Draft, person: DraftPerson): Draft {
  // Prefer ocr pricer (same arithmetic as commit); fall back keeps UI editable.
  const priced = priceAgainst({ ...draft, person }, person.balance ?? 0);
  return {
    ...priced,
    person,
    // Review finish creates the khata row when missing; keep id so commit can land.
    // (Full pipeline sets null for contacts — see resolve.attachContactMatches.)
    customer_id: person.id,
    status: 'ready',
    options: [],
    confirmed: false,
  };
}

/** Fingerprints of ledger rows for re-scan dedupe (name|amount|label|direction). */
export function fingerprintsFromKhata(khata: Khata): Set<string> {
  const set = new Set<string>();
  for (const c of khata.customers) {
    const names = [c.name, c.name_en, ...c.aliases]
      .filter(Boolean)
      .map((n) => n.toLowerCase());
    for (const e of c.entries) {
      const dir = e.action === 'payment' ? 'payment' : 'udhaar';
      const label = (e.label || '').toLowerCase();
      for (const n of names) {
        set.add(`${n}|${e.amount}|${label}|${dir}`);
      }
    }
  }
  return set;
}

/**
 * Mark person-cards whose line items already exist in khata.
 * Never sets `confirmed` — imported cards stay visually distinct + unconfirmed.
 */
export function markAlreadyImported(drafts: Draft[], fingerprints: Set<string>): Draft[] {
  return drafts.map((d) => {
    const name = (d.name_spoken || '').toLowerCase();
    if (!name) return d;
    const items = d.items ?? [];
    let hit = false;
    if (items.length) {
      hit = items.every((i) =>
        fingerprints.has(`${name}|${i.amount}|${(i.label || '').toLowerCase()}|${i.direction}`),
      );
    } else {
      const dir = d.kind === 'payment' ? 'payment' : 'udhaar';
      hit = fingerprints.has(`${name}|${d.amount ?? 0}|${(d.label || '').toLowerCase()}|${dir}`);
    }
    if (!hit) return d;
    return { ...d, already_imported: true, confirmed: false };
  });
}
