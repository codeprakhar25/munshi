/**
 * Shapes shared by the agent, the store and the UI.
 *
 * This file — and everything else in `src/agent/` — must not import from
 * `react-native`, `expo-*` or any Node built-in. That boundary is what lets
 * `scripts/turns.ts` run the real money logic under Node with no phone and no
 * build step. See ARCHITECTURE.md §3.
 */

/** ISO-8601. */
export type Timestamp = string;

export type EntryAction = 'payment' | 'new_udhaar' | 'correction' | 'opening';

/** One immutable row of the passbook. Entries are append-only; balance is derived. */
export interface Entry {
  ts: Timestamp;
  action: EntryAction;
  amount: number;
  /** Balance before and after this entry, frozen at write time so history reads back exactly. */
  before: number;
  after: number;
  /** Free text: what was bought, or how it was paid. */
  label?: string;
  /**
   * Rupees paid beyond what was owed. Balances never go negative, but the excess
   * must not vanish either — it is recorded here and spoken aloud, so a merchant
   * can see money that was handed over and did not land on a balance.
   */
  overpaid?: number;
}

export interface Customer {
  id: string;
  /** Display name, in whatever script it was created in. */
  name: string;
  /** Latin form — the roster handed to the model, and the fallback match key. */
  name_en: string;
  aliases: string[];
  items?: string;
  lang?: string;
  /** Set when linked to a device contact. Null for walk-ins. */
  phone?: string | null;
  /** DERIVED from `entries` — never assign to this outside the store. */
  balance: number;
  entries: Entry[];
}

export interface AuditRow extends Entry {
  customer_id: string;
}

export interface Khata {
  shop: string;
  currency: string;
  customers: Customer[];
  audit: AuditRow[];
}

// ---------------------------------------------------------------- drafts ----

/**
 * What the merchant said, resolved as far as we can get, but NOT yet written.
 * Everything in the ledger passes through this state first — see ARCHITECTURE.md §0
 * for why the confirm gate is a correctness feature rather than UX polish.
 */
export type DraftKind = 'payment' | 'udhaar' | 'correction' | 'new_customer' | 'delete_last';

export type DraftStatus =
  /** Complete and priced — waiting only for confirmation. */
  | 'ready'
  /** We know who, not how much. */
  | 'needs_amount'
  /** The name matched nothing we recognise. */
  | 'needs_customer'
  /** The name matched more than one person — `options` holds the candidates. */
  | 'ambiguous'
  /** We could not make sense of it at all. */
  | 'unclear';

/** Direction of one itemized amount on a scan person-card (OCR may get this wrong). */
export type ItemDirection = 'udhaar' | 'payment';

export interface DraftLineItem {
  id: string;
  amount: number;
  direction: ItemDirection;
  /** What was bought / how it was paid. */
  label: string;
}

export interface DraftPerson {
  id: string;
  name: string;
  name_en: string;
  balance: number;
  phone?: string | null;
  /** True for a candidate sourced from device contacts rather than the khata. */
  from_contacts?: boolean;
}

export interface Draft {
  id: string;
  kind: DraftKind;
  /** Verbatim as heard, before any matching. Kept so questions can quote it back. */
  name_spoken: string | null;
  customer_id: string | null;
  person: DraftPerson | null;
  amount: number | null;
  label?: string;
  /** Preview only — nothing is written until commit. Null while the draft is incomplete. */
  before: number | null;
  after: number | null;
  /** Payment larger than the outstanding balance; surfaced so the reply can mention it. */
  overpaid: number;
  status: DraftStatus;
  /** Candidates when `status === 'ambiguous'`, or contact suggestions when `needs_customer`. */
  options: DraftPerson[];
  /**
   * Scan person-card: several amounts on one name (तेल 300, बिस्कुट 200, जमा 50).
   * Voice drafts leave this undefined / empty.
   */
  items?: DraftLineItem[];
  /** Scan UI: merchant tapped confirm on this person card. */
  confirmed?: boolean;
  /** Scan dedupe: already landed in khata from a prior scan — show, do not pre-confirm. */
  already_imported?: boolean;
  /** Present only on drafts read off a scanned page. Provenance + diagnostics. */
  scan?: ScanProvenance;
}

/** Where a scanned card came from, and what decided how we read it. */
export interface ScanProvenance {
  /** The source line(s), verbatim, so the review card can show our reading. */
  rawText: string;
  /** As written on the page. Free text — deliberately never parsed into a Date. */
  date: string | null;
  /** Which signal decided credit-vs-payment. */
  directionReason: 'keyword' | 'sign' | 'column' | 'model' | 'default';
  /** Identifies the exact row, so a re-scan of the same page can be spotted. */
  ref: { blockId: string; row: number; item: number };
  /** How the person was matched, when one was. */
  matchVia?: string;
  /** 0..1 confidence of that match. Ordering and thresholds only, never a gate. */
  matchScore?: number;
}

// ------------------------------------------------------------- the stage ----

/**
 * Which question is on the table. This decides which tool schema the model is
 * given — the single most important design decision in the agent, because a
 * yes/no regex reads "100 नहीं 150" as a rejection when it is an amend.
 * See ARCHITECTURE.md §4.
 */
export type Stage = 'idle' | 'picking' | 'awaiting_amount' | 'confirming';

export interface Session {
  stage: Stage;
  /** Plain-text dialogue, so pronouns ("usko pachaas aur de do") resolve. */
  history: { role: 'user' | 'assistant'; content: string }[];
  drafts: Draft[];
  /** Which draft the current question is about. */
  focus: string | null;
  /** Consecutive unanswered questions, so a stage cannot ask forever. */
  stuck?: number;
  /**
   * What was just written, kept for exactly one turn so "नहीं, 150 थे" can still
   * reverse and rewrite it. Without an approval step this is the ONLY way a
   * mistake is recoverable by voice.
   */
  undo?: { drafts: Draft[] } | null;
}

export const newSession = (): Session => ({ stage: 'idle', history: [], drafts: [], focus: null });

// ------------------------------------------------------------ turn result ----

export interface TurnTimings {
  route_ms: number;
  compose_ms: number;
  total_ms: number;
}

export interface Turn {
  transcript: string;
  stage: Stage;
  drafts: Draft[];
  /** Non-empty only on the turn that commits. */
  committed: { customer_id: string; name: string; name_en: string; before: number; after: number; amount: number; overpaid?: number }[];
  /** True if this turn changed the khata. */
  wrote: boolean;
  khata: Khata;
  reply: string;
  timings: TurnTimings;
}
