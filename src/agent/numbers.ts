/**
 * Local rupee parsing.
 *
 * "How many rupees?" was costing a ~5s model round trip AND failing
 * intermittently — the harness caught "दो सौ पचास" coming back as null on two
 * runs out of three. It is a number. We can read a number.
 *
 * The model stays as the fallback for anything this does not recognise, so an
 * unusual phrasing degrades to slow-but-working rather than wrong.
 */

const UNITS: Record<string, number> = {
  // Hindi / Devanagari
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5, 'छह': 6, 'छै': 6,
  'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10, 'ग्यारह': 11, 'बारह': 12, 'पंद्रह': 15,
  'बीस': 20, 'पच्चीस': 25, 'तीस': 30, 'चालीस': 40, 'पचास': 50, 'साठ': 60,
  'सत्तर': 70, 'अस्सी': 80, 'नब्बे': 90,
  // Latin / Hinglish
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  ek: 1, do: 2, teen: 3, chaar: 4, paanch: 5, panch: 5, chah: 6, saat: 7, aath: 8,
  nau: 9, das: 10, bees: 20, tees: 30, chalees: 40, pachaas: 50, pachas: 50,
  saath: 60, sattar: 70, assi: 80, nabbe: 90,
};

const HUNDRED = /^(सौ|hundred|sau)$/;
const THOUSAND = /^(हज़ार|हजार|thousand|hazaar|hazar)$/;

/** Half-numbers are everyday shop speech and pure-word parsing misses them. */
const SPECIAL: [RegExp, number][] = [
  [/डेढ़\s*सौ|dedh\s*sau/, 150],
  [/ढाई\s*सौ|dhai\s*sau/, 250],
  [/साढ़े\s*तीन\s*सौ/, 350],
  [/डेढ़\s*हज़ार|डेढ़\s*हजार|dedh\s*hazaar/, 1500],
  [/ढाई\s*हज़ार|ढाई\s*हजार|dhai\s*hazaar/, 2500],
];

/**
 * Returns rupees, or null when unrecognised — null means "ask the model", never
 * "assume zero". Guessing at money is the one thing this system must not do.
 */
export function parseAmount(input: string): number | null {
  // Commas are DELETED, not spaced: "1,250" spaced becomes "1 250" and the digit
  // match then reads 1. Off by a factor of a thousand, on a ledger.
  const text = input.toLowerCase().replace(/,/g, '').replace(/₹/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return null;

  for (const [re, v] of SPECIAL) if (re.test(text)) return v;

  // Plain digits win outright — Saaras usually transcribes spoken numbers as digits.
  const digits = text.match(/\b(\d{1,7})\b/);
  if (digits) {
    const n = Number(digits[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Word form: accumulate within a scale, multiply on सौ / हज़ार, add across.
  const words = text.split(' ');
  let total = 0;
  let current = 0;
  let seen = false;

  for (const w of words) {
    const unit = UNITS[w];
    if (unit !== undefined) { current += unit; seen = true; continue; }
    if (HUNDRED.test(w)) { current = (current || 1) * 100; seen = true; continue; }
    if (THOUSAND.test(w)) { total += (current || 1) * 1000; current = 0; seen = true; continue; }
  }
  if (!seen) return null;

  const n = total + current;
  return n > 0 ? n : null;
}
