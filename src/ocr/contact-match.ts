/**
 * Scanned name -> a real person, from the phone's contacts and the khata roster.
 *
 * This is the part of the scan flow that actually matters. OCR that reads
 * "₹300 tel" perfectly is worth nothing if the 300 lands on the wrong Suresh,
 * and a shopkeeper's book is full of first names with no surname while their
 * phone is full of "Suresh Bhaiya", "Suresh Milk", "Suresh Tailor".
 *
 * Three outcomes, matching the branches the review UI already implements:
 *   exactly one strong candidate -> pre-filled, still needs the confirm tap
 *   several                      -> pick from those N, nothing else offered
 *   none                         -> contacts search, or walk-in with no phone
 *
 * Nothing here auto-commits. A confident wrong match is the failure mode this
 * whole flow is shaped around.
 *
 * No `react-native` / `expo-*` / Node imports.
 */

export type CandidateSource = 'khata' | 'contact';

export interface MatchTarget {
  id: string;
  /** Display name, in whatever script it is stored in. */
  name: string;
  /** Latin form when known — transliterated once at import, then cached. */
  nameLatin?: string | null;
  phone?: string | null;
  aliases?: string[];
  source: CandidateSource;
}

export interface RankedCandidate extends MatchTarget {
  /** 0..1. Only meaningful for ordering and for the auto-accept threshold. */
  score: number;
  /** Which comparison produced the score — read in the harness, not the UI. */
  via: 'exact' | 'first-name' | 'token' | 'prefix' | 'fuzzy';
}

export interface MatchResult {
  candidates: RankedCandidate[];
  /** Set only when one candidate is both strong and clearly ahead of the rest. */
  auto: RankedCandidate | null;
  state: 'auto' | 'ambiguous' | 'unresolved';
}

/**
 * A name reduced to something comparable: case folded, punctuation and honorifics
 * dropped, spacing collapsed. Devanagari and Latin both survive this unchanged
 * apart from case, which is why the transliterated form has to be supplied
 * separately rather than produced here.
 */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Words that describe a person rather than name them. A contact saved as
 * "Ramesh Uncle" or "सुरेश भैया" must match a book that just says "Ramesh".
 */
const HONORIFICS = new Set([
  'uncle', 'aunty', 'bhai', 'bhaiya', 'bhaiyya', 'ji', 'sir', 'madam', 'didi', 'chacha',
  'kaka', 'mama', 'seth', 'sahab', 'saab', 'bhaisahab', 'shop', 'store', 'kirana',
  'अंकल', 'भाई', 'भैया', 'जी', 'दीदी', 'चाचा', 'काका', 'मामा', 'सेठ', 'साहब',
]);

function tokensOf(s: string): string[] {
  return normalizeName(s)
    .split(' ')
    .filter((t) => t.length > 1 && !HONORIFICS.has(t));
}

/** Standard Levenshtein, iterative, single row. Names are short; this is free. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

const similarity = (a: string, b: string): number => {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 0 : 1 - editDistance(a, b) / longest;
};

/**
 * Best score between one written form of the scanned name and one candidate.
 *
 * Ordered strongest first and returns on the first hit, so a full-name match
 * can never be outranked by a loose fuzzy hit on a different person — the same
 * tiering principle `agent.ts matchCustomers` uses, and for the same reason:
 * writing MORE of the name is how a merchant disambiguates, so a longer match
 * has to win outright.
 */
function scorePair(query: string, target: string): { score: number; via: RankedCandidate['via'] } | null {
  const q = normalizeName(query);
  const t = normalizeName(target);
  if (!q || !t) return null;

  if (q === t) return { score: 1, via: 'exact' };

  const qt = tokensOf(query);
  const tt = tokensOf(target);
  if (!qt.length || !tt.length) return null;

  // The book writes a first name; the phone stores a full name.
  if (qt[0] === tt[0]) return { score: 0.92, via: 'first-name' };
  if (qt.some((x) => tt.includes(x))) return { score: 0.85, via: 'token' };

  for (const a of qt) {
    for (const b of tt) {
      if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) {
        return { score: 0.78, via: 'prefix' };
      }
    }
  }

  // Handwriting and transliteration both wobble a letter or two: Suresh /
  // Sursh / Suresth. Below 0.72 the pairs stop being the same name.
  let best = 0;
  for (const a of qt) {
    for (const b of tt) best = Math.max(best, similarity(a, b));
  }
  if (best >= 0.72) return { score: 0.45 + 0.3 * best, via: 'fuzzy' };

  return null;
}

/** Everything a candidate can be called. */
const formsOf = (t: MatchTarget): string[] =>
  [t.name, t.nameLatin ?? '', ...(t.aliases ?? [])].filter((s) => s && s.trim().length > 0);

/** Accepted without asking. Below this the merchant picks. */
const AUTO_THRESHOLD = 0.85;
/** Shown as a candidate at all. */
const CANDIDATE_FLOOR = 0.5;
/** How far ahead the leader must be to be treated as unambiguous. */
const LEAD_REQUIRED = 0.1;

export function matchName(
  nameToken: string | null,
  /** Transliterated Latin form of the same token, when we have one. */
  nameLatin: string | null,
  pool: MatchTarget[],
): MatchResult {
  const queries = [nameToken, nameLatin].filter((q): q is string => !!q && q.trim().length > 1);
  if (!queries.length) return { candidates: [], auto: null, state: 'unresolved' };

  const ranked: RankedCandidate[] = [];
  for (const target of pool) {
    let best: { score: number; via: RankedCandidate['via'] } | null = null;
    for (const query of queries) {
      for (const form of formsOf(target)) {
        const hit = scorePair(query, form);
        if (hit && (!best || hit.score > best.score)) best = hit;
      }
    }
    if (best && best.score >= CANDIDATE_FLOOR) ranked.push({ ...target, ...best });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // A person already in the khata beats a raw contact at equal strength —
    // they have a balance and a history; the contact is only a phone number.
    if (a.source !== b.source) return a.source === 'khata' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const candidates = ranked.slice(0, 6);
  if (!candidates.length) return { candidates, auto: null, state: 'unresolved' };

  const top = candidates[0];
  const second = candidates[1];
  const clear = !second || top.score - second.score >= LEAD_REQUIRED;

  if (top.score >= AUTO_THRESHOLD && clear) {
    return { candidates, auto: top, state: 'auto' };
  }
  return { candidates, auto: null, state: 'ambiguous' };
}
