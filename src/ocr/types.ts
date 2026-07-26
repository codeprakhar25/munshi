/**
 * What the parser produces before anyone has been matched to it.
 *
 * A `ScanItem` is one money fact read off the page: one amount, one direction,
 * the name as written, and where on the page it came from. `resolve.ts` turns
 * these into the agent's `Draft` — the same type the voice path uses, so both
 * roads end at `commitDrafts()` and there is exactly one writer to the ledger.
 *
 * Lives under `src/ocr/` so the parser stays runnable under Node:
 * `scripts/ocr.ts` replays a saved page through it with no phone attached.
 *
 * No `react-native` / `expo-*` / Node imports.
 */

/** `udhaar` = goods out on credit (ADD). `payment` = money in (SUBTRACT). */
export type ItemDirection = 'udhaar' | 'payment';

/** Which signal decided the direction. Diagnostics — printed by the harness. */
export type DirectionReason = 'keyword' | 'sign' | 'column' | 'model' | 'default';

export interface ScanItem {
  /** The whole source line, verbatim, so the review card can show our reading. */
  rawText: string;
  /** Name exactly as written on the page, before any matching. */
  nameToken: string | null;
  date: string | null;
  amount: number;
  direction: ItemDirection;
  /** What was bought / how it was paid. May be empty. */
  label: string;
  directionReason: DirectionReason;
  /** Provenance, so a re-scan of the same page can be spotted rather than doubled. */
  ref: { blockId: string; row: number; item: number };
}
