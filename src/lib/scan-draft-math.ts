/**
 * Net / before→after helpers for scan person-cards (Draft + items).
 * Pure — safe for agent boundary consumers.
 *
 * Balance is NEVER clamped at zero. Negative `after` = customer in credit
 * (shop owes them). Same rule as `deriveBalance` / `ocr/resolve.priceAgainst`.
 */
import type { Draft, DraftLineItem, ItemDirection } from '@/agent/types';

export function itemNet(items: DraftLineItem[]): number {
  return items.reduce(
    (sum, i) => sum + (i.direction === 'udhaar' ? i.amount : -i.amount),
    0,
  );
}

export function priceDraft(draft: Draft, balance: number): Pick<Draft, 'kind' | 'amount' | 'before' | 'after' | 'overpaid'> {
  const items = draft.items ?? [];
  const net = items.length ? itemNet(items) : (draft.amount ?? 0) * (draft.kind === 'payment' ? -1 : 1);
  const abs = Math.abs(net);
  const kind: Draft['kind'] = net < 0 ? 'payment' : draft.kind === 'new_customer' ? 'new_customer' : 'udhaar';
  const before = balance;
  const after = kind === 'payment' ? before - abs : before + abs;
  const overpaid = kind === 'payment' && abs > before ? abs - before : 0;
  return {
    kind,
    amount: abs,
    before,
    after,
    overpaid,
  };
}

export function toggleDirection(dir: ItemDirection): ItemDirection {
  return dir === 'udhaar' ? 'payment' : 'udhaar';
}
