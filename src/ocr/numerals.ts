/**
 * Number and currency normalization for scanned Indian ledger text.
 *
 * No `react-native` / `expo-*` / Node imports — everything under `src/ocr/`
 * runs under Node too, so `scripts/ocr.ts` can replay a saved page through the
 * whole parser with no phone attached. See ARCHITECTURE.md §3 for why that
 * boundary is load-bearing.
 *
 * Why this file exists at all: `Number('५०')` is NaN. A handwritten Hindi
 * register uses Devanagari digits freely, mixed with Latin ones in the same
 * line, and Sarvam transcribes them through as-is. Every amount in the book
 * would silently become null without this.
 */

/**
 * Per-script decimal digit bases. Unicode lays each of these out as ten
 * consecutive code points starting at the zero, so one subtraction converts.
 */
const DIGIT_BASES = [
  0x0966, // Devanagari  ०-९   (hi, mr, sa, ne)
  0x09e6, // Bengali     ০-৯
  0x0a66, // Gurmukhi    ੦-੯   (pa)
  0x0ae6, // Gujarati    ૦-૯
  0x0b66, // Oriya       ୦-୯
  0x0be6, // Tamil       ௦-௯
  0x0c66, // Telugu      ౦-౯
  0x0ce6, // Kannada     ೦-೯
  0x0d66, // Malayalam   ൦-൯
];

/** Rewrites every Indic digit to its ASCII equivalent, leaving all else alone. */
export function normalizeDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    let mapped = ch;
    for (const base of DIGIT_BASES) {
      if (cp >= base && cp <= base + 9) {
        mapped = String(cp - base);
        break;
      }
    }
    out += mapped;
  }
  return out;
}

/** Currency marks and the `/-` suffix, which carry no numeric meaning. */
const CURRENCY_RE = /₹|रु\.?|रू\.?|रुपये|रुपए|ரூ\.?|\bRs\.?|\bINR\b/gi;
const TRAILING_SLASH_RE = /\/-(?=\s|$)/g;

/** Strips currency noise so what remains is a bare number (or isn't one). */
export function stripCurrency(text: string): string {
  return text.replace(CURRENCY_RE, ' ').replace(TRAILING_SLASH_RE, ' ');
}

/**
 * A whole cell/token to a number, or null.
 *
 * Accounting parentheses mean negative — `(200)` is a credit note in a printed
 * book and a struck-through correction in a handwritten one. We return the sign
 * and let the caller decide what it means, rather than guessing here.
 */
export function parseAmount(text: string): number | null {
  const negated = /^\s*\(.*\)\s*$/.test(text.trim());
  const cleaned = stripCurrency(normalizeDigits(text))
    .replace(/[(),\s]/g, '')
    .replace(/^[+]/, '');
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return negated ? -Math.abs(n) : n;
}

/** `10/7`, `10-7-25`, `१०/७/२५` — matched so amount scanning can skip them. */
const DATE_RE = /\b\d{1,2}\s*[/\-.]\s*\d{1,2}(\s*[/\-.]\s*\d{2,4})?\b/g;

export function looksLikeDate(text: string): boolean {
  const t = normalizeDigits(text).trim();
  return /^\d{1,2}\s*[/\-.]\s*\d{1,2}(\s*[/\-.]\s*\d{2,4})?$/.test(t);
}

/** First date-shaped token in a line, normalized to ASCII digits. */
export function findDate(text: string): string | null {
  DATE_RE.lastIndex = 0;
  const m = DATE_RE.exec(normalizeDigits(text));
  return m ? m[0].replace(/\s+/g, '') : null;
}

export interface FoundAmount {
  /** Always positive here; direction is decided by `lines.ts`, not by the sign. */
  value: number;
  /** Verbatim substring, kept so the review card can show what was actually read. */
  raw: string;
  /** Offset into the (digit-normalized) line — direction keywords are matched by proximity. */
  index: number;
  /** True when the token itself carried a minus or accounting parentheses. */
  explicitlyNegative: boolean;
}

const AMOUNT_TOKEN_RE = /\(?\s*-?\s*\d[\d,]*(\.\d{1,2})?\s*\)?/g;

/**
 * Every number in a line, with position, EXCLUDING dates.
 *
 * Positions matter: in "300 tel aur 200 biscuit usme se 50 jama", which amount
 * is the payment is decided by which one sits next to "jama". A parser that
 * only collects values loses that and has to ask a model what it could have
 * read off the string.
 */
export function findAmounts(line: string): FoundAmount[] {
  const text = normalizeDigits(line);

  // Blank out date spans first so `10/7` never contributes a 10 and a 7.
  const masked = text.replace(DATE_RE, (m) => ' '.repeat(m.length));

  const out: FoundAmount[] = [];
  AMOUNT_TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = AMOUNT_TOKEN_RE.exec(masked)) !== null) {
    const raw = m[0].trim();
    const parsed = parseAmount(raw);
    if (parsed === null) continue;
    // A bare 0 in a ledger column is "nothing here", not an entry.
    if (parsed === 0) continue;
    out.push({
      value: Math.abs(parsed),
      raw,
      index: m.index,
      explicitlyNegative: parsed < 0,
    });
  }
  return out;
}
