/**
 * ScanItem[] → one Draft per person (itemized lines on `draft.items`).
 *
 * Lives in `src/ocr/` so the headless harness can group without crossing into
 * `src/lib/` (and so `priceAgainst` — unclamped — is the only pricer).
 *
 * No `react-native` / `expo-*` / Node imports.
 */
import type { Draft, DraftLineItem } from '../agent/types';
import { priceAgainst } from './resolve';
import type { ScanItem } from './types';

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Fold money facts into person-cards. Never sets `confirmed`. */
export function groupItemsToDrafts(items: ScanItem[]): Draft[] {
  const byKey = new Map<string, { draft: Draft; order: number }>();
  let order = 0;

  for (const it of items) {
    const key = (it.nameToken || it.rawText).toLowerCase().trim() || uid('anon');
    let slot = byKey.get(key);
    if (!slot) {
      const draft: Draft = {
        id: uid('sd'),
        kind: 'udhaar',
        name_spoken: it.nameToken,
        customer_id: null,
        person: null,
        amount: null,
        label: undefined,
        before: null,
        after: null,
        overpaid: 0,
        status: it.nameToken ? 'needs_customer' : 'unclear',
        options: [],
        items: [],
        confirmed: false,
        already_imported: false,
        scan: {
          rawText: it.rawText,
          date: it.date,
          directionReason: it.directionReason,
          ref: it.ref,
        },
      };
      slot = { draft, order: order++ };
      byKey.set(key, slot);
    } else if (slot.draft.scan) {
      // Keep provenance; append raw lines so the card can show the full reading.
      slot.draft.scan = {
        ...slot.draft.scan,
        rawText: `${slot.draft.scan.rawText}\n${it.rawText}`,
        date: slot.draft.scan.date ?? it.date,
      };
    }

    const line: DraftLineItem = {
      id: uid('li'),
      amount: it.amount,
      direction: it.direction,
      label: it.label || '',
    };
    slot.draft.items = [...(slot.draft.items || []), line];
  }

  return [...byKey.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ draft }) => {
      const priced = priceAgainst(draft, 0);
      return {
        ...priced,
        label: (draft.items || []).map((i) => i.label).filter(Boolean).join(', ') || undefined,
      };
    });
}
