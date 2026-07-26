/**
 * Sarvam `/transliterate` — the bridge that makes contact matching possible.
 *
 * The problem it solves is not cosmetic. The register is handwritten Devanagari
 * ("रमेश"); the phone's contact list is Latin ("Ramesh Uncle"). Comparing those
 * two strings fails 100% of the time, and fuzzy-matching across scripts is
 * meaningless — there is no edit distance between them. Normalizing one side
 * into the other's script turns it back into an ordinary string comparison.
 *
 * ARCHITECTURE.md §6 parked this for the voice path, where Saaras can already
 * return Latin. It is NOT deferrable here: OCR returns exactly what is on the
 * paper, and the paper is in Hindi.
 *
 * Cost control: one call per UNIQUE unseen name, memoized for the process
 * lifetime. A scanned page has ~5-15 distinct names, and device contacts are
 * transliterated only when they actually contain non-Latin characters — most
 * Indian phones store contacts in Latin already.
 *
 * No `react-native` / `expo-*` / Node imports.
 */
import { BASE, KEY, log } from '../agent/sarvam';

export type TransliterateSource =
  | 'auto' | 'bn-IN' | 'en-IN' | 'gu-IN' | 'hi-IN' | 'kn-IN'
  | 'ml-IN' | 'mr-IN' | 'od-IN' | 'pa-IN' | 'ta-IN' | 'te-IN';

/** True when the string contains anything outside Latin/digits/punctuation. */
export function isNonLatin(text: string): boolean {
  return /[^-ɏ]/.test(text);
}

const cache = new Map<string, string>();

/** Test seam + a way to prime the cache from persisted contact match keys. */
export function primeTransliterations(pairs: Record<string, string>): void {
  for (const [k, v] of Object.entries(pairs)) cache.set(k, v);
}

async function callTransliterate(input: string, source: TransliterateSource): Promise<string> {
  const res = await fetch(`${BASE}/transliterate`, {
    method: 'POST',
    headers: { 'api-subscription-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input,
      source_language_code: source,
      target_language_code: 'en-IN',
      // Names, not prose: we want "Ramesh", never "one hundred rupees".
      spoken_form: false,
      numerals_format: 'international',
    }),
  });
  const text = await res.text();
  log('translit', { input: input.slice(0, 200), status: res.status, body: text.slice(0, 500) });
  if (!res.ok) throw new Error(`transliterate -> ${res.status}: ${text.slice(0, 200)}`);
  const data = JSON.parse(text) as { transliterated_text?: string };
  return data.transliterated_text ?? '';
}

/**
 * Latin forms for a batch of names, in order, with a null for any that failed.
 *
 * Sends the batch as one newline-joined call and verifies the line count came
 * back intact; if the service reflows or drops a line the counts disagree and
 * we fall back to one call per name rather than silently pairing the wrong
 * Latin form to the wrong customer. A quietly mis-paired name maps money to
 * the wrong person, so this check is not optional.
 */
export async function transliterateNames(
  names: string[],
  source: TransliterateSource = 'hi-IN',
): Promise<(string | null)[]> {
  const result: (string | null)[] = names.map(() => null);

  const pending: { name: string; at: number[] }[] = [];
  names.forEach((name, i) => {
    const key = `${source}::${name}`;
    const hit = cache.get(key);
    if (hit !== undefined) {
      result[i] = hit;
      return;
    }
    if (!isNonLatin(name)) {
      cache.set(key, name);
      result[i] = name;
      return;
    }
    const existing = pending.find((p) => p.name === name);
    if (existing) existing.at.push(i);
    else pending.push({ name, at: [i] });
  });

  if (pending.length === 0) return result;

  const put = (name: string, latin: string, at: number[]) => {
    cache.set(`${source}::${name}`, latin);
    for (const i of at) result[i] = latin;
  };

  try {
    const joined = pending.map((p) => p.name).join('\n');
    const out = await callTransliterate(joined, source);
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length === pending.length) {
      pending.forEach((p, i) => put(p.name, lines[i], p.at));
      return result;
    }
    log('translit_batch_mismatch', { sent: pending.length, got: lines.length });
  } catch (err) {
    log('translit_batch_failed', { error: String(err) });
  }

  // One at a time. Slower, but each result is unambiguously its own input.
  await Promise.all(
    pending.map(async (p) => {
      try {
        put(p.name, (await callTransliterate(p.name, source)).trim(), p.at);
      } catch (err) {
        log('translit_failed', { name: p.name, error: String(err) });
      }
    }),
  );

  return result;
}
