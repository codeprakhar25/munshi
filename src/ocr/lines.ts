/**
 * One line of a prose udhaar notebook -> who, how much, which direction.
 *
 * The register we are targeting is not a ruled table. It reads like:
 *
 *   "ramesh ka 100rs dudh ka baaki h"
 *   "suresh ka 300 rs tel ka aur 200 rs biscuit ka baaki h usme se 50 jma h"
 *
 * So a line can name one person and carry several amounts pointing in opposite
 * directions. Direction is decided by the word nearest each number, not by
 * column position — there are no columns.
 *
 * This pass is deterministic and runs first. Whatever it cannot type gets
 * handed to the model (`structure.ts`), which may label and route but is never
 * allowed to restate a digit — same rule as the voice agent, for the same
 * reason: a model that can hallucinate must not decide how much money moved.
 *
 * No `react-native` / `expo-*` / Node imports.
 */
import { findAmounts, findDate, normalizeDigits, type FoundAmount } from './numerals';

export type ItemDirection = 'udhaar' | 'payment';

export interface LineItem {
  amount: number;
  direction: ItemDirection;
  /** What was bought / how it was paid. Free text, may be empty. */
  label: string;
  /** Which signal decided the direction — surfaced in the harness, not the UI. */
  reason: 'keyword' | 'sign' | 'default';
  raw: string;
}

export interface ParsedLine {
  /** Verbatim source line, kept for the review card and for the model prompt. */
  text: string;
  /** Name as written, before any matching or transliteration. Null if none found. */
  nameToken: string | null;
  date: string | null;
  items: LineItem[];
}

/**
 * Money came IN. `jama`/`जमा` is the word an Indian shopkeeper actually writes
 * for a deposit against an outstanding amount, and `usme se` ("out of that")
 * marks the partial-payment clause in the middle of an udhaar sentence.
 */
const PAYMENT_WORDS = [
  'जमा', 'जम', 'दिए', 'दिये', 'दिया', 'चुकाया', 'चुकता', 'वापस', 'भुगतान', 'अदा', 'मिले',
  'jama', 'jma', 'jamaa', 'diye', 'diya', 'diyo', 'chukaya', 'chukta', 'wapas', 'vapas',
  'bhugtan', 'paid', 'pay', 'payment', 'received', 'recd', 'cash',
];

/** Goods went OUT on credit. The default reading of an udhaar notebook line. */
const UDHAAR_WORDS = [
  'बाकी', 'बाक़ी', 'शेष', 'उधार', 'उधारी', 'नामे', 'लिया', 'लिये', 'ले', 'गया', 'माल',
  'baaki', 'baki', 'bakee', 'shesh', 'udhar', 'udhaar', 'udhari', 'liya', 'liye',
  'le gaya', 'legaya', 'due', 'balance', 'credit', 'kharida',
];

/** "out of that 50 is deposited" — the clause that flips direction mid-line. */
const PARTIAL_PAYMENT_MARKERS = ['usme se', 'usmese', 'उसमें से', 'उसमे से', 'us me se', 'out of'];

/**
 * Hindi case markers. The customer's name is what stands before the first one:
 * "ramesh KA 100rs" / "सुरेश KO 50". This is the whole trick, and it works
 * because a shopkeeper writes the name first — they are indexing by person.
 */
const CASE_MARKERS = ['ka', 'ke', 'ki', 'ne', 'ko', 'se', 'का', 'के', 'की', 'ने', 'को', 'से'];

/** Words that are never part of a name or a useful item label. */
const NOISE_WORDS = new Set([
  'aur', 'और', 'hai', 'h', 'है', 'ha', 'tha', 'the', 'था', 'थे', 'rs', 'rupees', 'rupaye',
  'रुपये', 'रुपए', 'रु', 'and', 'of', 'is', 'total', 'कुल', 'baki', 'बाकी',
  ...PAYMENT_WORDS, ...UDHAAR_WORDS, ...CASE_MARKERS,
]);

const lower = (s: string) => s.toLowerCase();

/** Leading list numbering: "1.", "२)", "- ". Not a name and not an amount. */
const BULLET_RE = /^\s*[-•*]?\s*\d{1,2}\s*[.)]\s+/;

function tokenize(text: string): string[] {
  return text.split(/[\s,;:।|]+/).filter(Boolean);
}

/**
 * Nearest direction keyword to an amount, searching the text that FOLLOWS it
 * first and then what precedes it.
 *
 * Forward-first is deliberate: Hindi puts the qualifier after the number
 * ("100 रुपये बाकी", "50 जमा"), so the word that describes an amount is
 * almost always to its right. Searching backwards first makes "300 tel aur
 * 200 biscuit ... 50 jama" read the 200 as a payment, because `jama` is
 * nearer to it than any udhaar word is.
 */
function directionFor(
  text: string,
  amount: FoundAmount,
  nextIndex: number,
): { direction: ItemDirection; reason: LineItem['reason'] } {
  if (amount.explicitlyNegative) return { direction: 'payment', reason: 'sign' };

  const hay = lower(text);
  const after = hay.slice(amount.index + amount.raw.length, nextIndex);
  const before = hay.slice(0, amount.index);

  const hit = (window: string, words: string[]) => words.some((w) => window.includes(lower(w)));

  if (hit(after, PAYMENT_WORDS)) return { direction: 'payment', reason: 'keyword' };
  if (hit(after, UDHAAR_WORDS)) return { direction: 'udhaar', reason: 'keyword' };

  // A partial-payment clause governs every amount that comes after it.
  const clause = PARTIAL_PAYMENT_MARKERS.some((m) => before.includes(lower(m)));
  if (clause) return { direction: 'payment', reason: 'keyword' };

  // Only now look leftward, and only within the tail of the preceding span so
  // a keyword three items ago cannot claim this number.
  const nearBefore = before.slice(-24);
  if (hit(nearBefore, PAYMENT_WORDS)) return { direction: 'payment', reason: 'keyword' };
  if (hit(nearBefore, UDHAAR_WORDS)) return { direction: 'udhaar', reason: 'keyword' };

  // An udhaar notebook records debts. Silence means debt.
  return { direction: 'udhaar', reason: 'default' };
}

/** Item label = the words sitting between this amount and the next one. */
function labelFor(text: string, amount: FoundAmount, nextIndex: number): string {
  const span = text.slice(amount.index + amount.raw.length, nextIndex);
  return tokenize(span)
    .filter((w) => !NOISE_WORDS.has(lower(w)) && !/^\d+$/.test(normalizeDigits(w)))
    .slice(0, 3)
    .join(' ')
    .trim();
}

/**
 * Name = everything before the first case marker, minus bullets and digits.
 *
 * Returns null rather than guessing when no marker is present. A wrong name
 * that looks confident is worse than an empty person chip: the merchant taps
 * through it. `null` routes the line to the contact picker instead.
 */
export function extractName(text: string): string | null {
  const stripped = text.replace(BULLET_RE, '');
  const tokens = tokenize(stripped);

  const parts: string[] = [];
  for (const tok of tokens) {
    const bare = tok.replace(/[.,;:]$/, '');
    if (CASE_MARKERS.includes(lower(bare))) break;
    // Hindi often writes the marker joined on: "रमेशका". Split it back off.
    const joined = CASE_MARKERS.find(
      (m) => /[ऀ-ॿ]/.test(bare) && bare.length > m.length + 1 && bare.endsWith(m),
    );
    if (joined) {
      parts.push(bare.slice(0, -joined.length));
      break;
    }
    if (/\d/.test(normalizeDigits(bare))) break;
    if (NOISE_WORDS.has(lower(bare))) break;
    parts.push(bare);
    // Two tokens is a full name; more than that and we are eating the sentence.
    if (parts.length === 2) break;
  }

  const name = parts.join(' ').trim();
  return name.length > 1 ? name : null;
}

export function parseLine(rawLine: string): ParsedLine | null {
  const text = rawLine.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  const amounts = findAmounts(text);
  const nameToken = extractName(text);

  // Nothing to record: no money on this line. Section headings, page numbers
  // and stray marks all land here and are dropped rather than becoming a row
  // the merchant has to dismiss one by one.
  if (amounts.length === 0) return null;

  const items: LineItem[] = amounts.map((amt, i) => {
    const nextIndex = i + 1 < amounts.length ? amounts[i + 1].index : text.length;
    const { direction, reason } = directionFor(text, amt, nextIndex);
    return {
      amount: amt.value,
      direction,
      label: labelFor(text, amt, nextIndex),
      reason,
      raw: amt.raw,
    };
  });

  return { text, nameToken, date: findDate(text), items };
}

/** Splits a Sarvam text block into candidate ledger lines. */
export function splitLines(blockText: string): string[] {
  return blockText
    .split(/\r?\n|<br\s*\/?>/i)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}
