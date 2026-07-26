/**
 * The step the whole scan flow exists for: attach a real person to each card,
 * using the phone's contacts and the khata roster.
 *
 * Takes cards that have ALREADY been grouped by name (`scan-parsing.ts` does
 * that) and fills in `person`, `options`, `status` and the priced preview.
 *
 * Order of operations matters and is not obvious:
 *
 *   1. collect the DISTINCT names on the page — a page repeats names constantly
 *   2. transliterate that small set once — Devanagari book vs Latin contacts
 *   3. rank candidates per name, not per card
 *
 * Doing it per card would fire one transliteration call per row and could rank
 * the same name differently on two cards of the same page.
 *
 * Never sets `confirmed`. The confirm tap is the write gate, and nothing here
 * may skip it however strong the match looked — a confident wrong match is
 * precisely the failure this flow is shaped around.
 *
 * No `react-native` / `expo-*` / Node imports.
 */
import { applyAction } from '../agent/agent';
import type { Draft, DraftLineItem, DraftPerson, Khata } from '../agent/types';
import { matchName, type MatchTarget } from './contact-match';
import { transliterateNames, type TransliterateSource } from './transliterate';

export interface MatchContext {
  khata: Khata;
  /** Device contacts, imported during onboarding. */
  contacts: { id: string; name: string; phone: string | null }[];
  /** Script the register is written in. Drives transliteration, not OCR. */
  language?: TransliterateSource;
}

export interface ResolveStats {
  cards: number;
  distinctNames: number;
  auto: number;
  ambiguous: number;
  unresolved: number;
  transliterated: number;
}

function pool(ctx: MatchContext): MatchTarget[] {
  return [
    ...ctx.khata.customers.map((c) => ({
      id: c.id,
      name: c.name,
      nameLatin: c.name_en ?? null,
      phone: c.phone ?? null,
      aliases: c.aliases ?? [],
      source: 'khata' as const,
    })),
    ...ctx.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      nameLatin: null,
      phone: c.phone,
      aliases: [],
      source: 'contact' as const,
    })),
  ];
}

const asDraftPerson = (t: MatchTarget, balance: number): DraftPerson => ({
  id: t.id,
  name: t.name,
  name_en: t.nameLatin || t.name,
  balance,
  phone: t.phone ?? null,
  from_contacts: t.source === 'contact',
});

/**
 * Net of a card's items. Udhaar adds, payment subtracts — identical to the fold
 * `deriveBalance` applies, so the preview cannot disagree with what commit
 * eventually writes.
 *
 * A negative result is NOT clamped: it means the customer has paid more than
 * they owed and the shop owes them. Clamping destroys that credit permanently
 * and re-bills money already handed over (ARCHITECTURE.md §1).
 */
export function netOfItems(items: DraftLineItem[]): number {
  return items.reduce((sum, i) => (i.direction === 'payment' ? sum - i.amount : sum + i.amount), 0);
}

/** Prices one card against a live balance. Pure — safe to call on every edit. */
export function priceAgainst(draft: Draft, balance: number): Draft {
  const items = draft.items ?? [];
  const net = items.length
    ? netOfItems(items)
    : (draft.amount ?? 0) * (draft.kind === 'payment' ? -1 : 1);
  const kind: Draft['kind'] = net < 0 ? 'payment' : 'udhaar';
  const amount = Math.abs(net);
  const after = applyAction(kind, balance, amount);
  return {
    ...draft,
    kind,
    amount,
    before: balance,
    after,
    overpaid: kind === 'payment' && amount > balance ? amount - balance : 0,
  };
}

/**
 * Fills person / options / status / preview on cards grouped by name.
 * Returns new objects; the input is not mutated.
 */
export async function attachContactMatches(
  drafts: Draft[],
  ctx: MatchContext,
): Promise<{ drafts: Draft[]; stats: ResolveStats }> {
  const targets = pool(ctx);
  const distinct = [...new Set(drafts.map((d) => d.name_spoken).filter((n): n is string => !!n))];
  const latin = await transliterateNames(distinct, ctx.language ?? 'hi-IN');

  const latinOf = new Map<string, string | null>();
  distinct.forEach((name, i) => latinOf.set(name, latin[i]));

  // One ranking per distinct name, reused by every card carrying it.
  const matches = new Map<string, ReturnType<typeof matchName>>();
  for (const name of distinct) {
    matches.set(name, matchName(name, latinOf.get(name) ?? null, targets));
  }

  const stats: ResolveStats = {
    cards: drafts.length,
    distinctNames: distinct.length,
    auto: 0,
    ambiguous: 0,
    unresolved: 0,
    transliterated: latin.filter((l, i) => l && l !== distinct[i]).length,
  };

  const balanceOf = (id: string) => ctx.khata.customers.find((c) => c.id === id)?.balance ?? 0;

  const out = drafts.map((input) => {
    const draft = { ...input };
    if (!draft.name_spoken) {
      stats.unresolved += 1;
      return { ...priceAgainst(draft, 0), status: 'needs_customer' as const, options: [] };
    }

    const match = matches.get(draft.name_spoken)!;
    draft.options = match.candidates.map((c) => asDraftPerson(c, balanceOf(c.id)));

    if (!match.auto) {
      if (match.candidates.length) stats.ambiguous += 1;
      else stats.unresolved += 1;
      return {
        ...priceAgainst(draft, 0),
        status: (match.candidates.length ? 'ambiguous' : 'needs_customer') as Draft['status'],
      };
    }

    const balance = balanceOf(match.auto.id);
    const priced = priceAgainst(draft, balance);
    stats.auto += 1;

    return {
      ...priced,
      person: asDraftPerson(match.auto, balance),
      // A device contact is not a customer yet; commit creates the row. A null
      // customer_id with a `from_contacts` person is what signals that.
      customer_id: match.auto.source === 'khata' ? match.auto.id : null,
      status: (priced.amount ?? 0) > 0 ? ('ready' as const) : ('needs_amount' as const),
      scan: draft.scan
        ? { ...draft.scan, matchVia: match.auto.via, matchScore: match.auto.score }
        : undefined,
    };
  });

  return { drafts: out, stats };
}
