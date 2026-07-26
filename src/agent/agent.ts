/**
 * The agent. Sarvam has no orchestration primitive, so the turn loop, the state
 * and the memory all live here. The models are organs; this is the nervous system.
 *
 * Two hard rules, enforced structurally rather than by prompt:
 *
 *  1. The LLM classifies and the LLM phrases. ONLY this file does arithmetic.
 *     A model that can hallucinate must never decide how much money someone owes.
 *  2. Nothing reaches the ledger until the merchant confirms. Saaras will
 *     confidently transcribe a plausible ledger command out of room noise
 *     (POC README finding #4), and such a transcript is indistinguishable from a
 *     real one. A confirm step is the only thing that catches it.
 *
 * Everything goes through TOOL CALLS rather than "reply with JSON", because
 * sarvam-30b is a reasoning model: asked in prose it burns 6000+ characters of
 * hidden thinking and frequently never reaches an answer.
 *
 * No `react-native` / `expo-*` / Node imports — see ARCHITECTURE.md §3.
 */
import { parseAmount } from './numbers';
import { templateReply, replyLangFor, type ReplyContext } from './reply';
import { chatTools, log, transliterate, type ChatMessage, type ToolSchema } from './sarvam';
import type {
  Customer, Draft, DraftPerson, Entry, Khata, Session, Stage, Turn,
} from './types';

// ------------------------------------------------------------- matching -----

/** Indic scripts other than Devanagari — unmatchable against the roster as-is. */
export const FOREIGN_SCRIPT = /[\u0980-\u0DFF\u0A80-\u0AFF\u0A00-\u0A7F]/;

/** Case/space normalization. Cross-script matching leans on `aliases` until §6 lands. */
export const norm = (s: string): string =>
  s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const namesOf = (c: Customer): string[] => [c.name, c.name_en, ...(c.aliases ?? [])];

/**
 * Deterministic backstop for person resolution. The roster is handed to the model
 * every turn so the *model* does most of the matching; this exists to catch the
 * case the model cannot see — that a spoken name matches two people. It is asked
 * to pick one, and will, silently.
 */
export function matchCustomers(khata: Khata, spoken: string | null | undefined): Customer[] {
  const q = norm(spoken ?? '');
  if (!q) return [];

  // Tiered, because a looser rule makes the fuller name USELESS for
  // disambiguating. "रमेश कुमार" must not also match Ramesh Joshi just because
  // "रमेश" is one of his aliases — saying more of the name is exactly how a
  // merchant answers "which Ramesh?", so a stronger match has to win outright.
  const tier = (c: Customer): number => {
    let best = 99;
    for (const n of namesOf(c)) {
      const v = norm(n);
      if (!v) continue;
      if (v === q) best = Math.min(best, 0);                            // exact
      else if (q.startsWith(`${v} `) || v.startsWith(`${q} `)) best = Math.min(best, 1); // one extends the other
      else if (v.split(' ').includes(q)) best = Math.min(best, 2);      // a word within the name
    }
    return best;
  };

  const scored = khata.customers.map((c) => ({ c, t: tier(c) })).filter((s) => s.t < 99);
  if (!scored.length) return [];
  const best = Math.min(...scored.map((s) => s.t));
  const top = scored.filter((s) => s.t === best).map((s) => s.c);
  if (top.length < 2) return top;

  // Contact import gives every imported person a first-name alias, so a phone
  // book with a "Ramesh Uncle" in it makes plain "रमेश" ambiguous against the
  // Ramesh the merchant actually trades with — and they get asked to choose on
  // every single utterance. Somebody with no transactions is far less likely to
  // be meant than somebody with a running balance, so active khatas win.
  // Two ACTIVE customers with the same name stay ambiguous, which is correct:
  // that is the Ramesh Kumar / Ramesh Joshi case, and it must still be asked.
  const active = top.filter((c) => c.entries.length > 0 || c.balance !== 0);
  return active.length && active.length < top.length ? active : top;
}

/**
 * Is this plausibly a person's name?
 *
 * Creating customers without asking means whatever the model puts in
 * name_spoken becomes a row in the merchant's book. On the device that produced
 * a customer literally called "ऊपर जाता है नहीं।" — a whole sentence — sitting in
 * the ledger owing ₹1. A name is short and has no sentence punctuation.
 */
export function looksLikeName(n: string | null | undefined): boolean {
  const t = (n ?? '').trim();
  if (t.length < 2 || t.length > 30) return false;
  if (/[।?!,;:]/.test(t)) return false;              // sentence punctuation
  if (t.split(/\s+/).length > 4) return false;        // names are not clauses
  if (/\d/.test(t)) return false;                     // amounts are not names
  // Verbs and fillers that show up when the model grabs the wrong span.
  if (/\b(hai|hain|nahi|nahin|kya|jata|jaata|karo|karna|diye|liya|bolo|boliye)\b/i.test(t)) return false;
  if (/(है|हैं|नहीं|क्या|जाता|करो|दिये|दिए|लिया|बोलो)/.test(t)) return false;
  return true;
}

const asPerson = (c: Customer): DraftPerson => ({
  id: c.id, name: c.name, name_en: c.name_en, balance: c.balance, phone: c.phone ?? null,
});

// ------------------------------------------------------ ledger arithmetic ---

/**
 * Balance is DERIVED — a fold over the passbook, never a field we assign to.
 * `correction` sets an absolute figure, so this cannot be a plain sum.
 *
 * A balance never goes below zero. In practice a negative came from a misheard
 * amount or an udhaar misread as a payment, not from a real advance, and with no
 * approval step those landed silently.
 *
 * The excess is NOT silently swallowed, though — that was the original bug. It is
 * recorded on the entry as `overpaid` and spoken back, so money handed over that
 * did not land on a balance is still visible.
 */
export function deriveBalance(entries: Entry[]): number {
  let b = 0;
  for (const e of entries) {
    b = e.action === 'payment' ? Math.max(0, b - e.amount)
      : e.action === 'correction' ? Math.max(0, e.amount)
      : b + e.amount;
  }
  return b;
}

/**
 * Seed data carries a `balance` with no entries behind it. Synthesize the opening
 * row so the fold reproduces it, otherwise deriving would zero every customer.
 */
export function normalizeKhata(k: Khata): Khata {
  for (const c of k.customers) {
    // `history` is the POC's field name for the same thing.
    const legacy = (c as unknown as { history?: Entry[] }).history;
    if (!c.entries) c.entries = legacy ?? [];
    if (!c.entries.length && c.balance) {
      c.entries = [{ ts: new Date(0).toISOString(), action: 'opening', amount: c.balance, before: 0, after: c.balance }];
    }
    c.balance = deriveBalance(c.entries);
    c.phone = c.phone ?? null;
  }
  k.audit ??= [];
  return k;
}

const nextId = (prefix: string, taken: string[]): string => {
  const n = taken.reduce((m, id) => {
    const v = Number(id.startsWith(prefix) ? id.slice(prefix.length) : NaN);
    return Number.isFinite(v) && v > m ? v : m;
  }, 0);
  return `${prefix}${n + 1}`;
};

// ---------------------------------------------------------------- tools -----

/**
 * ONE tool taking an ARRAY, not one tool per action. Measured: asked to emit
 * parallel tool calls, sarvam-30b returns none at all, and sarvam-105b returns
 * only the FIRST action and silently drops the rest — invisible data loss in a
 * ledger. With an actions[] array both models return every action correctly.
 */
const LEDGER_TOOLS: ToolSchema[] = [{
  type: 'function',
  function: {
    name: 'apply_ledger_actions',
    description:
      'Record every action the merchant just described. Call this exactly once per command, with one entry in `actions` for each customer mentioned.',
    parameters: {
      type: 'object',
      properties: {
        actions: {
          type: 'array',
          description:
            'One entry per customer mentioned, in the order spoken. Never merge two customers into one entry, and never drop the last item in a list.',
          items: {
            type: 'object',
            properties: {
              kind: {
                type: 'string',
                enum: ['payment', 'udhaar', 'correction', 'new_customer', 'delete_last', 'balance_query', 'unclear'],
                description:
                  'payment = money came IN, the customer HANDED OVER cash (Ramesh NE 200 diye, chukaya, wapas, paid, cleared). '
                  + 'udhaar = goods went OUT on credit (liya, le gaya, saaman liya, likh do, add, aur de do). '
                  + 'CRITICAL: "<name> KO <item> <amount> ka" — Kavita ko saabun chalees ka, Rajesh ko doodh pachaas ka — '
                  + 'means goods worth that much were GIVEN TO them on credit. That is udhaar, never payment. '
                  + 'The giveaway is KO plus a named item; contrast with NE plus diye, which is payment. '
                  + 'Whenever a purchasable item is named at all, it is almost certainly udhaar. '
                  + 'correction = set the balance to an exact figure (galat hai, actually it is). '
                  + 'new_customer = open a NEW khata for somebody not in the roster (naya khata, new account). '
                  + 'delete_last = ERASE an existing entry from the book: hatao, hata do, mita do, delete karo, remove karo, '
                  + 'entry galat thi hatao. Targets that customer\'s most recent entry. This is removal of a written line, '
                  + 'never a payment — no money moved. '
                  + 'balance_query = merchant is only asking, nothing changes. '
                  + 'unclear = no amount stated, or you cannot tell which customer.',
              },
              customer_id: {
                type: 'string',
                description: 'Customer id from the roster, e.g. c1. Match any name form, Devanagari or Latin, first name or full. Omit for new_customer.',
              },
              name_spoken: {
                type: 'string',
                description: 'The person\'s name COPIED CHARACTER FOR CHARACTER out of the user message. '
                  + 'If the user message is in Devanagari the name must be in Devanagari, if Odia then Odia, if Latin then Latin. '
                  + 'NEVER transliterate or romanise it: from "प्रखर ने सौ का आलू लिया" the name is "प्रखर", not "Prakhar". '
                  + 'This name is written into the shopkeeper\'s book as-is. Always fill it in whenever a name was spoken.',
              },
              amount: {
                type: 'number',
                description: 'Rupees, plain number. ONLY what the merchant actually said — never add, subtract or infer.',
              },
              label: {
                type: 'string',
                description:
                  'What the money was for, if mentioned — copy it VERBATIM in the words and script spoken, all of it: '
                  + 'a single item (doodh, sabun), a list (aalu pyaaz tamatar), or a category (kirana ka saaman, sabzi). '
                  + 'Never translate it and never shorten a list to one item. Omit only when nothing was named.',
              },
              missing: {
                type: 'string',
                enum: ['amount', 'customer', 'meaning'],
                description: 'For kind=unclear only: what stopped you acting.',
              },
            },
            required: ['kind'],
          },
        },
      },
      required: ['actions'],
    },
  },
}];

/**
 * The confirm-stage tool. This is why confirmation cannot be a yes/no regex:
 * "रमेश ने 100 नहीं 150 दिए थे" contains नहीं, so a regex reads an AMEND as a
 * REJECTION and throws away a correction the merchant just made.
 */
const RESOLVE_TOOL: ToolSchema[] = [{
  type: 'function',
  function: {
    name: 'resolve_draft',
    description: 'The merchant is looking at pending ledger entries that have NOT been saved yet. Decide what they just did about them.',
    parameters: {
      type: 'object',
      properties: {
        decision: {
          type: 'string',
          enum: ['confirm', 'reject', 'amend', 'new_command'],
          description:
            'Decide by asking ONE question first: did the merchant say a NEGATIVE word (nahi / nahin / no / galat / mat)? '
            + 'NO negative  -> confirm. '
            + 'Negative AND a replacement value follows (a different number, or a different person) -> amend. '
            + 'Negative and NO replacement value -> reject. '
            + 'confirm = save them. Only for a clean affirmative: haan, ha, ji, theek hai, sahi hai, likh do, yes, ok, done, '
            + 'bilkul. NEVER answer confirm when a negative word was spoken — that is always reject or amend. '
            + 'reject = discard them, save nothing: "nahi", "nahi, rehne do", "rehne do", "chhod do", "cancel", "mat likho", '
            + '"hatao", "galat hai" — all with no replacement figure. '
            + 'amend = they are correcting a detail: "100 nahi, 150 diye the", "wo Gopal tha, Ramesh nahi". An amend almost '
            + 'always contains nahi too, so the negative alone does not decide it — what decides it is the replacement. '
            + 'new_command = no negative and no affirmative; they ignored the question and said something unrelated about a '
            + 'different customer.',
        },
        amendments: {
          type: 'array',
          description: 'For decision=amend only. One entry per pending line being corrected.',
          items: {
            type: 'object',
            properties: {
              target_name: { type: 'string', description: 'Which pending line, by the customer name on it. Omit if there is only one.' },
              amount: { type: 'number', description: 'The corrected rupee figure, if the amount was what changed.' },
              kind: { type: 'string', enum: ['payment', 'udhaar', 'correction'], description: 'The corrected direction, if THAT was what changed.' },
              name_spoken: { type: 'string', description: 'The corrected person, verbatim, if they named the wrong person.' },
            },
          },
        },
      },
      required: ['decision'],
    },
  },
}];

const PICK_TOOL: ToolSchema[] = [{
  type: 'function',
  function: {
    name: 'pick_person',
    description: 'The merchant was asked WHICH person they meant. Interpret their answer.',
    parameters: {
      type: 'object',
      properties: {
        choice: {
          type: 'string',
          enum: ['existing', 'new_person', 'unclear'],
          description: 'existing = they picked somebody from the list offered. '
            + 'new_person = open a new khata: either they said none of the options match, OR they were asked '
            + '"X is not in the book, open a new khata?" and simply agreed (haan, ha, ji, theek hai, yes, ok, kholo, likh do). '
            + 'A bare yes when NO options were offered always means new_person. '
            + 'unclear = they did not answer the question at all.',
        },
        customer_id: { type: 'string', description: 'For choice=existing: the id from the list offered, e.g. c1.' },
        name_spoken: { type: 'string', description: 'For choice=new_person: the name, verbatim.' },
      },
      required: ['choice'],
    },
  },
}];

const AMOUNT_TOOL: ToolSchema[] = [{
  type: 'function',
  function: {
    name: 'supply_amount',
    description: 'The merchant was asked HOW MANY RUPEES. Interpret their answer.',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'The rupee figure they said, plain number. Omit if they did not give one.' },
        unclear: { type: 'boolean', description: 'True if they did not actually state an amount.' },
      },
    },
  },
}];

const SAY_TOOL: ToolSchema[] = [{
  type: 'function',
  function: {
    name: 'say',
    description: 'Speak one short sentence back to the merchant, out loud.',
    parameters: {
      type: 'object',
      properties: {
        sentence: {
          type: 'string',
          description:
            'ONE natural sentence, under 25 words, in the SAME language and script the merchant used '
            + '(Hindi in -> Hindi out, English in -> English out, Hinglish in -> Hinglish out). Warm and quick, like a '
            + 'trusted shop assistant, never robotic. '
            + 'MONEY RULE: copy every rupee figure through EXACTLY as the Arabic digits you were given — write 520, '
            + 'not "पाँच सौ बीस" and never "पचास". Spelling a number out in words gets it wrong and the merchant hears '
            + 'the wrong balance. Digits plus the word for rupees; never the ₹ symbol. Use only the numbers given — '
            + 'never compute, round or invent one. No emoji, no markdown, no greeting preamble.',
        },
      },
      required: ['sentence'],
    },
  },
}];

// --------------------------------------------------------------- prompts ----

/** Re-rendered every turn. Cache this and the agent starts quoting stale balances. */
const roster = (k: Khata): string =>
  k.customers.map((c) => `${c.id} = ${c.name} / ${c.name_en} (owes ${c.balance})`).join('\n');

const EXTRACT_SYSTEM = (k: Khata): string => `You are the ledger assistant for an Indian shopkeeper's udhaar (credit) book.

Customers:
${roster(k)}

A shopkeeper often settles several customers in one breath, and money can move in both
directions in the same sentence. Put EVERY customer mentioned into the actions array,
in the order spoken.

Whenever a person is named, ALWAYS fill in name_spoken with their name exactly as you
heard it, even when you are confident which roster id it is.

If the merchant is only ASKING something ("Ramesh ka kitna baaki hai?", "how much does
Kavita owe?") that is one action of kind balance_query — never unclear.

If one part of the command is unusable — no amount, or you cannot tell who — mark only
that entry unclear and still act on the parts you did understand.

When goods are named — an item, a list, or a category like "kirana ka saaman" — copy them
into label exactly as spoken. The merchant reads the khata back later; the label is how
they remember what a line was for.

Report only the amount the merchant actually said. Never add, subtract or infer a number.
The merchant speaks Hindi, English, or a mix of both.`;

const SPEAK_SYSTEM = `You are the voice of a shopkeeper's udhaar-book assistant.
The arithmetic has already been done for you and is given below as fact.
Never compute, never round, never invent a number. Say only what the facts support.`;

/**
 * Naming the language explicitly matters: told only "use the same language the
 * merchant used", the model answered an Odia speaker in broken Hinglish. Hindi
 * and English are templated locally, so this list is the languages that actually
 * reach the phrasing model.
 */
const LANG_NAME: Record<string, string> = {
  'od-IN': 'Odia (ଓଡ଼ିଆ)', 'or-IN': 'Odia (ଓଡ଼ିଆ)',
  'bn-IN': 'Bengali (বাংলা)', 'ta-IN': 'Tamil (தமிழ்)', 'te-IN': 'Telugu (తెలుగు)',
  'mr-IN': 'Marathi (मराठी)', 'gu-IN': 'Gujarati (ગુજરાતી)', 'kn-IN': 'Kannada (ಕನ್ನಡ)',
  'ml-IN': 'Malayalam (മലയാളം)', 'pa-IN': 'Punjabi (ਪੰਜਾਬੀ)', 'ur-IN': 'Urdu (اردو)',
  'hi-IN': 'Hindi (हिन्दी)', 'en-IN': 'English',
};

// ---------------------------------------------------------------- drafts ----

interface RawAction {
  kind?: string;
  customer_id?: string;
  name_spoken?: string;
  amount?: number;
  label?: string;
  missing?: string;
}

/** Must apply exactly the same arithmetic as `deriveBalance`, or the preview lies. */
export const applyAction = (kind: Draft['kind'], base: number, amount: number): number =>
  kind === 'payment' ? Math.max(0, base - amount)
    : kind === 'correction' ? Math.max(0, amount)
    : base + amount;

const price = (d: Draft, base: number): void => {
  const amt = d.amount ?? 0;
  d.before = base;
  d.after = applyAction(d.kind, base, amt);
  d.overpaid = d.kind === 'payment' && amt > base ? amt - base : 0;
};

/**
 * The write gate, moved earlier: this decides what we KNOW, and prices the
 * preview. It never writes. A voice agent that silently guesses at money is
 * worse than one that asks again.
 */
export function stageIntent(
  khata: Khata,
  act: RawAction,
  id: string,
  projected?: Map<string, number>,
  /** The raw utterance, used ONLY to recover an amount the model dropped, and
   *  only when this is the sole action — with several actions in one breath
   *  there is no way to know which one a stray number belongs to. */
  soleUtterance?: string,
  /** True when the transcript was romanised — the model's id guess is then
   *  unreliable, because it never saw the original script. */
  romanised?: boolean,
): Draft {
  const kindIn = act?.kind ?? 'unclear';
  const spoken = act?.name_spoken?.trim() || null;
  let amount = Number.isFinite(Number(act?.amount)) && Number(act?.amount) > 0 ? Number(act.amount) : null;
  if (amount === null && soleUtterance) {
    const recovered = parseAmount(soleUtterance);
    if (recovered !== null) {
      log('amount_recovered', { from: soleUtterance, amount: recovered });
      amount = recovered;
    }
  }

  const draft: Draft = {
    id,
    kind: (kindIn === 'new_customer' ? 'new_customer' : kindIn === 'udhaar' ? 'udhaar' : kindIn === 'correction' ? 'correction' : kindIn === 'delete_last' ? 'delete_last' : 'payment'),
    name_spoken: spoken,
    customer_id: null,
    person: null,
    amount,
    label: act?.label,
    before: null,
    after: null,
    overpaid: 0,
    status: 'unclear',
    options: [],
  };

  if (kindIn === 'unclear' || !['payment', 'udhaar', 'correction', 'new_customer', 'delete_last'].includes(kindIn)) {
    draft.status = act?.missing === 'amount' ? 'needs_amount' : act?.missing === 'customer' ? 'needs_customer' : 'unclear';
  }

  // Opening a brand-new khata — but ONLY if the name really is new.
  //
  // Seen on device: a duplicate "गोपाल" khata appeared alongside the existing
  // "गोपाल यादव", because the model classified an ordinary udhaar as
  // new_customer and nothing checked the roster first. Splitting one customer
  // across two khatas is silent, permanent, and exactly what a shopkeeper cannot
  // afford — half their money hides under a second name. So the deterministic
  // match runs BEFORE we agree to create anybody.
  if (draft.kind === 'new_customer' && draft.status !== 'needs_customer') {
    if (!spoken) { draft.status = 'needs_customer'; return draft; }

    const existing = matchCustomers(khata, spoken);
    if (existing.length === 1) {
      log('new_customer_exists', { spoken, matched: existing[0].id });
      // They already have a khata. Treat it as ordinary credit against it.
      draft.kind = 'udhaar';
    } else if (existing.length > 1) {
      draft.options = existing.map(asPerson);
      draft.status = 'ambiguous';
      return draft;
    }
  }

  if (draft.kind === 'new_customer' && draft.status !== 'needs_customer') {
    // Assuming zero is a guess about money. Number words in Odia, Tamil, Bengali
    // are not parsed locally, so a dropped amount used to open the khata at 0
    // and lose the udhaar the merchant just dictated. Ask instead.
    if (amount === null) {
      draft.status = 'needs_amount';
      draft.before = 0;
      return draft;
    }
    draft.amount = amount;
    price(draft, 0);
    draft.kind = 'new_customer';
    draft.status = 'ready';
    return draft;
  }

  // Resolve WHO. The model's pick is a hint; the deterministic match decides,
  // because the model cannot tell us that a name was ambiguous — it just picks.
  const byName = matchCustomers(khata, spoken);
  const byId = khata.customers.find((c) => c.id === act?.customer_id) ?? null;

  let person: Customer | null = null;
  if (byName.length === 1) person = byName[0];
  else if (byName.length > 1) {
    // The model's choice only breaks the tie if it is one of the real candidates.
    draft.options = byName.map(asPerson);
    draft.status = 'ambiguous';
    return draft;
  } else if (byId && !romanised) {
    // Only trust the model's id when we had no better way to check. If the name
    // WAS romanised and still matched nobody, that customer is not in the book,
    // and the model's pick is the nearest-sounding roster entry — which is how
    // "ସୁରେଶ" (Suresh) got credited to Sunita Devi.
    person = byId;
  } else if (byId && romanised) {
    log('rejected_model_pick', { spoken, wouldHaveBeen: byId.id });
  }

  if (!person && draft.kind === 'delete_last') {
    // NEVER auto-create a customer just to delete from them.
    draft.status = 'needs_customer';
    return draft;
  }

  if (!person) {
    // A name we do not recognise is a NEW customer, so open the khata and write
    // it — asking "whose name?" was a dead end the merchant could not get out of.
    // Cost of this choice: a mis-transcription creates a junk row (प्रख्यात vs
    // प्रखर), recoverable for one turn via `undo`.
    if (spoken && !looksLikeName(spoken)) {
      // Do not put a sentence in the book as a person.
      log('rejected_as_name', { spoken });
      draft.name_spoken = null;
      draft.status = 'needs_customer';
      return draft;
    }
    if (spoken) {
      log('auto_new_customer', { spoken, amount });
      draft.kind = 'new_customer';
      if (amount === null) { draft.status = 'needs_amount'; draft.before = 0; return draft; }
      draft.amount = amount;
      price(draft, 0);
      draft.status = 'ready';
      return draft;
    }
    draft.status = 'needs_customer';
    return draft;
  }

  // Cross-script safety net. An Odia or Tamil name cannot be compared to a
  // Devanagari roster, so `byName` is empty and we are trusting the model's pick
  // alone — and the model cannot tell us a name was ambiguous, it just chooses.
  // With no approval step that would be a silent write to the wrong person, so
  // check whether the customer it picked shares a first name with anybody else.
  if (!byName.length && person) {
    const siblings = matchCustomers(khata, person.aliases?.[0] ?? person.name);
    if (siblings.length > 1) {
      log('cross_script_ambiguous', { spoken, picked: person.id, siblings: siblings.map((c) => c.id) });
      draft.options = siblings.map(asPerson);
      draft.status = 'ambiguous';
      return draft;
    }
  }

  draft.customer_id = person.id;
  draft.person = asPerson(person);

  // Deleting: the target is the customer's LAST entry — no amount needed, the
  // preview comes from the entry being removed. Removing the final entry
  // returns the balance to that entry's frozen `before`, by construction.
  if (draft.kind === 'delete_last') {
    const last = person.entries[person.entries.length - 1];
    if (!last) { draft.status = 'unclear'; return draft; }
    draft.amount = last.amount;
    draft.label = last.label ?? (last.action === 'payment' ? 'जमा' : undefined);
    draft.before = person.balance;
    draft.after = last.before;
    draft.overpaid = 0;
    draft.status = 'ready';
    return draft;
  }

  // A merchant can name the same person twice in one breath ("Ramesh ne 100 diye,
  // aur Ramesh ko 50 ka saaman bhi de do"). Price against the running projection
  // so the second line follows the first, instead of both quoting the pre-turn
  // balance and the reply speaking a figure that was never going to be true.
  const base = projected?.get(person.id) ?? person.balance;

  if (draft.status === 'needs_amount' || amount === null) {
    draft.status = 'needs_amount';
    draft.before = base;
    return draft;
  }

  price(draft, base);
  projected?.set(person.id, draft.after ?? base);
  draft.status = 'ready';
  return draft;
}

/** Re-resolve and re-price a pending line after the merchant corrects it. */
export function amendDraft(
  khata: Khata,
  draft: Draft,
  patch: { amount?: number; kind?: Draft['kind']; name_spoken?: string },
): Draft {
  if (patch.kind) draft.kind = patch.kind;
  if (Number.isFinite(Number(patch.amount)) && Number(patch.amount) > 0) draft.amount = Number(patch.amount);

  if (patch.name_spoken) {
    const hits = matchCustomers(khata, patch.name_spoken);
    draft.name_spoken = patch.name_spoken;
    if (hits.length === 1) {
      draft.customer_id = hits[0].id;
      draft.person = asPerson(hits[0]);
      draft.status = 'ready';
    } else if (hits.length > 1) {
      draft.options = hits.map(asPerson);
      draft.status = 'ambiguous';
      return draft;
    } else {
      draft.status = 'needs_customer';
      return draft;
    }
  }

  // A delete previews from the entry being removed, not from price() — recompute
  // it against whoever the draft now points at.
  if (draft.kind === 'delete_last') {
    const c = draft.customer_id ? khata.customers.find((x) => x.id === draft.customer_id) : null;
    const last = c?.entries[c.entries.length - 1];
    if (c && last) {
      draft.amount = last.amount;
      draft.label = last.label;
      draft.before = c.balance;
      draft.after = last.before;
      draft.status = 'ready';
    } else {
      draft.status = 'unclear';
    }
    return draft;
  }

  if (draft.amount === null) { draft.status = 'needs_amount'; return draft; }
  if (draft.kind !== 'new_customer' && !draft.person) { draft.status = 'needs_customer'; return draft; }

  price(draft, draft.kind === 'new_customer' ? 0 : (draft.person?.balance ?? 0));
  draft.status = 'ready';
  return draft;
}

const ENTRY_ACTION = { payment: 'payment', udhaar: 'new_udhaar', correction: 'correction', new_customer: 'opening' } as const;

/**
 * The ONLY writer. Appends to the passbook and re-derives every balance it
 * touched — balance is never assigned directly, so history and total can't drift.
 */
export function commitDrafts(khata: Khata, drafts: Draft[]): Turn['committed'] {
  const committed: Turn['committed'] = [];
  const ts = new Date().toISOString();

  for (const d of drafts) {
    if (d.status !== 'ready') continue;

    // Deletion: pop the last entry and re-derive. Earlier entries' frozen
    // before/after stay valid because only the FINAL entry is ever removed.
    if (d.kind === 'delete_last') {
      const cust = khata.customers.find((c) => c.id === d.customer_id);
      if (!cust || !cust.entries.length) continue;
      const before = cust.balance;
      const removed = cust.entries.pop() as Entry;
      cust.balance = deriveBalance(cust.entries);
      for (let i = khata.audit.length - 1; i >= 0; i--) {
        if (khata.audit[i].customer_id === cust.id) { khata.audit.splice(i, 1); break; }
      }
      log('entry_deleted', { customer_id: cust.id, amount: removed.amount, label: removed.label });
      committed.push({ customer_id: cust.id, name: cust.name, name_en: cust.name_en, before, after: cust.balance, amount: removed.amount });
      continue;
    }

    let cust: Customer | undefined;
    if (d.kind === 'new_customer') {
      const name = d.name_spoken ?? 'Walk-in';
      cust = {
        id: nextId('c', khata.customers.map((c) => c.id)),
        name,
        name_en: name,
        aliases: [name],
        phone: null,
        balance: 0,
        entries: [],
      };
      khata.customers.push(cust);
    } else {
      cust = khata.customers.find((c) => c.id === d.customer_id);
    }
    if (!cust) continue;

    const action = ENTRY_ACTION[d.kind];
    const amount = d.amount ?? 0;
    // Recompute against the LIVE balance rather than trusting the staged preview.
    // Two drafts for the same customer in one breath are both priced off the
    // pre-turn balance, so the second one's `after` is stale by the first one's
    // amount — and that stale figure is what the merchant reads back later in
    // the passbook. Deriving here keeps every row consistent with the fold.
    const before = cust.balance;
    const after = applyAction(d.kind === 'new_customer' ? 'udhaar' : d.kind, before, amount);
    const overpaid = d.kind === 'payment' && amount > before ? amount - before : 0;
    const entry: Entry = { ts, action, amount, before, after, label: d.label, ...(overpaid ? { overpaid } : {}) };
    cust.entries.push(entry);
    cust.balance = deriveBalance(cust.entries);
    khata.audit.push({ ...entry, customer_id: cust.id });

    committed.push({ customer_id: cust.id, name: cust.name, name_en: cust.name_en, before, after: cust.balance, amount, ...(overpaid ? { overpaid } : {}) });
  }
  return committed;
}

/**
 * Undo the entries a set of drafts just wrote. Entries are append-only in
 * spirit, but an immediate correction is not history — it is the merchant
 * fixing what they just said, and leaving both rows in the passbook would show
 * money that never moved.
 */
export function reverseCommitted(khata: Khata, drafts: Draft[]): void {
  for (const d of drafts) {
    const cust = khata.customers.find((c) => c.id === d.customer_id);
    if (!cust || !cust.entries.length) continue;
    cust.entries.pop();
    cust.balance = deriveBalance(cust.entries);
    for (let i = khata.audit.length - 1; i >= 0; i--) {
      if (khata.audit[i].customer_id === cust.id) { khata.audit.splice(i, 1); break; }
    }
  }
}

// ----------------------------------------------------------------- reply ----

/**
 * The model still slips a ₹ in sometimes despite being told not to, and Saaras
 * itself transcribes spoken "do sau rupaye" AS "₹200" — so the symbol arrives
 * from both directions. Bulbul has no reliable pronunciation for it.
 */
export function speechSafe(s: string): string {
  const devanagari = /[ऀ-ॿ]/.test(s);
  return s
    .replace(/₹\s*([\d,]+)/g, devanagari ? '$1 रुपये' : '$1 rupees')
    .replace(/([\d,]+)\s*₹/g, devanagari ? '$1 रुपये' : '$1 rupees')
    .replace(/₹/g, devanagari ? 'रुपये' : 'rupees')
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[*_`#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Facts are prose, not JSON — the phrasing model reads them better that way. */
function draftFacts(d: Draft): string {
  const who = d.person ? `${d.person.name_en} (${d.person.name})` : (d.name_spoken ?? 'someone');
  switch (d.status) {
    case 'ready': {
      if (d.kind === 'delete_last') {
        return `REMOVE ${who}'s last entry (${d.label ?? 'entry'}, ${d.amount} rupees) from the book. `
          + `Balance would go from ${d.before} back to ${d.after}. NOT DELETED YET — ask the merchant to confirm the deletion.`;
      }
      if (d.kind === 'new_customer') {
        return `NEW khata for ${who}, opening balance ${d.after} rupees. NOT SAVED YET — ask the merchant to confirm.`;
      }
      const verb = d.kind === 'payment' ? 'paid back' : d.kind === 'udhaar' ? 'took new credit of' : 'had their balance set to';
      // A negative balance is the customer in CREDIT — the shop owes them. Say so
      // in those words, because "minus fifty rupees baaki" would be read as a debt.
      const after = (d.after ?? 0) < 0
        ? `the SHOP would owe THEM ${Math.abs(d.after ?? 0)} rupees (they are in credit, they owe nothing)`
        : `${d.after}`;
      const over = d.overpaid ? ` They paid ${d.overpaid} rupees more than they owed.` : '';
      return `${who} ${verb} ${d.amount} rupees. Balance would go from ${d.before} to ${after}.${over}`
        + ' NOT SAVED YET — state the old and new balance and ask the merchant to confirm.';
    }
    case 'ambiguous':
      return `The name "${d.name_spoken}" matches more than one person: ${d.options.map((o) => `${o.name_en} (owes ${o.balance})`).join(', ')}.`
        + ' Ask WHICH ONE, naming them, and mention they can say it is a NEW person instead.'
        + ' Do not state any new balance.';
    case 'needs_amount':
      return `${who} currently owes ${d.before ?? 0} rupees. The merchant did NOT say how many rupees. Ask how much. Do NOT state any new balance.`;
    case 'needs_customer':
      return d.name_spoken
        ? `"${d.name_spoken}" is not in the book at all. Ask whether to open a NEW khata for them. Do NOT state any balance.`
        : 'You could not tell which customer they meant. Ask whose name it is. Do NOT state any balance.';
    default:
      return 'You did not understand the command. Ask the merchant to repeat it simply, for example "Ramesh ne 200 diye".';
  }
}

async function composeReply(facts: string, transcript: string, terse: boolean, langCode?: string | null): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: SPEAK_SYSTEM },
    {
      role: 'user',
      // Every extra word is another second the merchant stands there waiting.
      content: `The merchant said: "${transcript}"\n\nFacts you must use:\n${facts}`
        // Name the language rather than saying "the same one" — the model does
        // not reliably infer it from a non-Devanagari script and drifts to Hinglish.
        + (langCode && LANG_NAME[langCode]
          ? `\n\nYou MUST reply in ${LANG_NAME[langCode]}, in that language's own script. Not Hindi, not English.`
          : '')
        + (terse ? '\n\nKeep it to 10 words or fewer.' : ''),
    },
  ];
  const calls = await chatTools<{ sentence?: string }>(messages, SAY_TOOL, {
    tool_choice: { type: 'function', function: { name: 'say' } },
    temperature: 0.4,
    max_tokens: 900,
    label: 'phrase',
  });
  // Silence is the one unacceptable reply — the merchant is left wondering
  // whether the phone heard them at all.
  return speechSafe(calls[0]?.args?.sentence ?? '') || 'फिर से बोलिए।';
}

// ------------------------------------------------------------ the machine ---

/** Which question is on the table decides which tool schema the model gets next. */
function recompute(session: Session): void {
  const blocked = session.drafts.find((d) => d.status === 'ambiguous' || d.status === 'needs_customer');
  if (blocked) { session.stage = 'picking'; session.focus = blocked.id; return; }
  const noAmount = session.drafts.find((d) => d.status === 'needs_amount');
  if (noAmount) { session.stage = 'awaiting_amount'; session.focus = noAmount.id; return; }
  if (session.drafts.some((d) => d.status === 'ready')) { session.stage = 'confirming'; session.focus = null; return; }
  session.stage = 'idle';
  session.drafts = [];
  session.focus = null;
}

/**
 * Speculative extraction.
 *
 * Extraction is 1.5-4.5s of server time no matter how the prompt is shaped, and
 * it currently starts only once the merchant stops talking — so they wait for
 * all of it. But partial transcripts arrive WHILE they speak, so the call can be
 * started early and be finished, or nearly, by the time they stop.
 *
 * Only ever a read: results are cached by transcript text and thrown away if the
 * final transcript differs. Nothing may be written from a partial — "Ramesh ne
 * pachaas" becoming "pachaas hazaar" after a write is unrecoverable.
 */
const SPECULATIVE = new Map<string, Promise<RawAction[]>>();

const specKey = (t: string) => t.replace(/\s+/g, ' ').trim().toLowerCase();

export function speculate(transcript: string, khata: Khata, session: Session): void {
  const key = specKey(transcript);
  if (!key || SPECULATIVE.has(key)) return;
  if (SPECULATIVE.size > 8) SPECULATIVE.clear();
  log('speculate', { transcript });
  // Swallow failures: a speculative miss must never surface as a turn error.
  SPECULATIVE.set(key, extractUncached(transcript, khata, session).catch(() => []));
}

async function extract(transcript: string, khata: Khata, session: Session) {
  const key = specKey(transcript);
  const hit = SPECULATIVE.get(key);
  if (hit) {
    SPECULATIVE.delete(key);
    const actions = await hit;
    if (actions.length) {
      log('speculate_hit', { transcript });
      return actions;
    }
  }
  SPECULATIVE.clear();
  return extractUncached(transcript, khata, session);
}

async function extractUncached(transcript: string, khata: Khata, session: Session) {
  const messages: ChatMessage[] = [
    { role: 'system', content: EXTRACT_SYSTEM(khata) },
    ...session.history.slice(-6),
    { role: 'user', content: transcript },
  ];
  const calls = await chatTools<{ actions?: RawAction[] }>(messages, LEDGER_TOOLS, {
    // FORCED, not 'auto'. Left on auto, sarvam-30b intermittently burns ~1000
    // chars of hidden reasoning and then returns finish_reason:stop with no tool
    // call — the merchant's command simply vanishes and the agent says "say that
    // again" to a sentence it understood perfectly well. There is no outcome where
    // we don't want an actions array: `unclear` already covers "couldn't parse it".
    tool_choice: { type: 'function', function: { name: 'apply_ledger_actions' } },
    max_tokens: 2500,
    label: 'extract',
  });
  const actions = calls[0]?.args?.actions;
  return Array.isArray(actions) && actions.length ? actions : [{ kind: 'unclear', missing: 'meaning' } as RawAction];
}

/**
 * One full turn. `khata` comes in as an argument and goes out (possibly mutated)
 * — this function never reads or writes storage, which is what keeps it runnable
 * under Node with no phone attached.
 */
export interface TurnOptions {
  /** Saaras' detected language for this utterance. */
  lang?: string | null;
  /** The language the merchant chose at onboarding — the default to answer in. */
  appLang?: string | null;
  /** Fired as soon as drafts are known — lets the UI paint ~seconds before the voice. */
  onStaged?: (drafts: Draft[], stage: Stage) => void;
}

export async function runTurn(
  transcript: string,
  session: Session,
  khata: Khata,
  opts: TurnOptions = {},
): Promise<Turn> {
  const t0 = Date.now();
  const stageIn: Stage = session.stage;
  let committed: Turn['committed'] = [];
  const notes: string[] = [];
  const ctxExtra: Pick<ReplyContext, 'rejected' | 'amended' | 'queries'> = {};

  const seq = () => `d${session.drafts.length + 1}_${Date.now().toString(36)}`;

  const stageFresh = async (text: string) => {
    // Asked to read an Odia sentence against a Devanagari roster, the model
    // transliterates the name ITSELF and mangles it on the way — "ସୁରେଶ" came
    // back as "सुनील", which then matched nobody (or worse, matched Sunita).
    // Romanising the whole transcript first means the model never crosses
    // scripts: it sees Latin, and Latin compares directly to name_en.
    let text2 = text;
    let romanised = false;
    if (FOREIGN_SCRIPT.test(text)) {
      const r = await transliterate(text, opts.lang ?? 'od-IN', 'en-IN');
      if (r) {
        log('romanised_transcript', { from: text, to: r });
        text2 = r;
        romanised = true;
      }
    }
    const actions = await extract(text2, khata, session);
    const queries: string[] = [];
    // Running balances for anyone already touched by a draft this turn, so a
    // second mention of the same person chains off the first.
    const projected = new Map<string, number>(
      session.drafts.filter((d) => d.customer_id && d.after !== null).map((d) => [d.customer_id as string, d.after as number]),
    );
    for (const a of actions) {
      if (a.kind === 'balance_query') {
        const hits = matchCustomers(khata, a.name_spoken);
        const c = hits.length === 1 ? hits[0] : khata.customers.find((x) => x.id === a.customer_id);
        if (c) (ctxExtra.queries ??= []).push([c.name, c.balance]);
        queries.push(c
          ? `${c.name_en} (${c.name}) currently owes ${c.balance} rupees. Nothing changed — just tell the merchant this balance.`
          : 'You could not tell which customer they asked about. Ask which one.');
        continue;
      }
      session.drafts.push(stageIntent(khata, a, seq(), projected, actions.length === 1 ? text2 : undefined, romanised));
    }
    notes.push(...queries);
  };

  switch (stageIn) {
    case 'confirming': {
      const calls = await chatTools<{ decision?: string; amendments?: { target_name?: string; amount?: number; kind?: Draft['kind']; name_spoken?: string }[] }>(
        [
          { role: 'system', content: `You are a shopkeeper's ledger assistant. These entries are pending and NOT yet saved:\n${pendingSummary(session)}` },
          { role: 'user', content: transcript },
        ],
        RESOLVE_TOOL,
        { tool_choice: { type: 'function', function: { name: 'resolve_draft' } }, max_tokens: 2000, label: 'resolve' },
      );
      const decision = calls[0]?.args?.decision ?? 'new_command';

      if (decision === 'confirm') {
        committed = commitDrafts(khata, session.drafts);
        session.drafts = [];
        notes.push(committed.length
          ? `SAVED to the book: ${committed.map((c) => `${c.name_en} now owes ${c.after} rupees (was ${c.before})`).join('; ')}. Confirm briefly.`
          : 'There was nothing left to save. Say so briefly.');
      } else if (decision === 'reject') {
        session.drafts = [];
        ctxExtra.rejected = true;
        notes.push('The merchant cancelled the pending entries. Nothing was saved. Acknowledge in a few words and invite them to say it again.');
      } else if (decision === 'amend') {
        const patches = calls[0]?.args?.amendments ?? [];
        if (!patches.length) {
          notes.push('They are correcting something but you could not tell what. Ask them to repeat the correction.');
        }
        for (const p of patches) {
          const target = pickTarget(session, p.target_name);
          if (!target) continue;
          amendDraft(khata, target, p);
        }
        ctxExtra.amended = true;
        notes.push('The merchant CORRECTED a pending entry. It is still NOT saved. Read back the corrected figures and ask them to confirm.');
      } else {
        // They ignored the question and said something else entirely.
        session.drafts = [];
        await stageFresh(transcript);
      }
      break;
    }

    case 'picking': {
      const focus = session.drafts.find((d) => d.id === session.focus);
      const offered = focus?.options ?? [];
      const calls = await chatTools<{ choice?: string; customer_id?: string; name_spoken?: string }>(
        [
          {
            role: 'system',
            content: `The merchant was asked which person they meant${focus?.name_spoken ? ` by "${focus.name_spoken}"` : ''}.\n`
              + `Options offered:\n${offered.map((o) => `${o.id} = ${o.name} / ${o.name_en} (owes ${o.balance})`).join('\n') || '(none — nobody matched)'}`,
          },
          { role: 'user', content: transcript },
        ],
        PICK_TOOL,
        { tool_choice: { type: 'function', function: { name: 'pick_person' } }, max_tokens: 600, label: 'pick' },
      );
      const a = calls[0]?.args ?? {};
      if (focus && a.choice === 'existing') {
        const c = khata.customers.find((x) => x.id === a.customer_id)
          ?? matchCustomers(khata, transcript).find((x) => offered.some((o) => o.id === x.id));
        if (c) {
          focus.customer_id = c.id;
          focus.person = asPerson(c);
          focus.options = [];
          focus.status = focus.amount === null ? 'needs_amount' : 'ready';
          if (focus.status === 'ready') price(focus, c.balance); else focus.before = c.balance;
        } else {
          notes.push('You could not tell which of the options they picked. Ask again, naming the options.');
        }
      } else if (focus && a.choice === 'new_person') {
        focus.kind = 'new_customer';
        // Keep the name we already heard: answering "haan" carries no name, and
        // overwriting it with undefined loses the customer entirely.
        focus.name_spoken = a.name_spoken ?? focus.name_spoken;
        focus.options = [];
        focus.status = focus.amount === null ? 'needs_amount' : 'ready';
        if (focus.status === 'ready') price(focus, 0); else focus.before = 0;
      } else {
        // No escape from this stage was the actual loop: an unanswered "which
        // one?" just asked again, forever, and the merchant could not get out by
        // saying anything else. Two strikes, then treat the utterance as a fresh
        // command — abandoning a draft costs nothing, since nothing was written.
        session.stuck = (session.stuck ?? 0) + 1;
        if (session.stuck >= 2) {
          log('pick_gave_up', { transcript, after: session.stuck });
          session.drafts = [];
          session.stuck = 0;
          await stageFresh(transcript);
        } else {
          notes.push('They did not answer which person. Ask again, briefly, naming the options.');
        }
      }
      break;
    }

    case 'awaiting_amount': {
      const focus = session.drafts.find((d) => d.id === session.focus);

      // Read it ourselves first. This was a ~5s model round trip that also failed
      // intermittently on "दो सौ पचास"; when we can read the number, there is no
      // reason to ask. The model remains the fallback for odd phrasings.
      const local = parseAmount(transcript);
      if (focus && local !== null) {
        log('amount_local', { transcript, amount: local });
        amendDraft(khata, focus, { amount: local });
        break;
      }

      const calls = await chatTools<{ amount?: number; unclear?: boolean }>(
        [
          {
            role: 'system',
            content: `The merchant was asked how many rupees${focus?.person ? ` for ${focus.person.name_en}` : ''}. Extract the number.`,
          },
          { role: 'user', content: transcript },
        ],
        AMOUNT_TOOL,
        { tool_choice: { type: 'function', function: { name: 'supply_amount' } }, max_tokens: 400, label: 'amount' },
      );
      const amt = Number(calls[0]?.args?.amount);
      if (focus && Number.isFinite(amt) && amt > 0) amendDraft(khata, focus, { amount: amt });
      else notes.push('They still did not state an amount. Ask how many rupees, in a few words.');
      break;
    }

    default: {
      // Nothing is pending, but something may have JUST been written. A negation
      // now is the merchant correcting that, not a new command — without an
      // approval step this is the only way back.
      const CORRECTION = /नहीं|नही|गलत|हटा|nahi|nahin|\bno\b|galat|hatao|wrong|cancel/i;
      if (session.undo?.drafts.length && CORRECTION.test(transcript)) {
        const prior = session.undo.drafts;
        session.undo = null;
        reverseCommitted(khata, prior);
        session.drafts = prior.map((d) => ({ ...d }));
        // Re-price against the restored balances, then let resolve_draft amend.
        for (const d of session.drafts) {
          const c = khata.customers.find((x) => x.id === d.customer_id);
          if (c) { d.person = asPerson(c); price(d, c.balance); }
        }
        log('undo_reopened', { drafts: session.drafts.length });
        session.stage = 'confirming';
        return runTurn(transcript, session, khata, opts);
      }
      session.undo = null;
      await stageFresh(transcript);
    }
  }

  if (session.stage !== 'picking') session.stuck = 0;
  recompute(session);

  // AUTO-COMMIT. When every line is unambiguous there is nothing to ask about,
  // so asking is pure latency — it doubles the turns for the common case. Only a
  // genuine conflict (which customer? how much?) still stops and asks.
  // The write stays recoverable: `undo` holds it for one turn.
  // No stageIn guard: a corrected line is just as unambiguous as a fresh one, and
  // leaving it at "सही है?" reintroduces the approval turn for exactly the case
  // the merchant has already had to speak twice.
  if (session.stage === 'confirming' && !committed.length) {
    const ready = session.drafts.filter((d) => d.status === 'ready');
    // Deletions NEVER auto-commit: erasing a written line on a possibly
    // hallucinated transcript is not recoverable by undo the way an extra
    // append is. A delete always hears "हाँ" first.
    if (ready.length && ready.length === session.drafts.length && !session.drafts.some((d) => d.kind === 'delete_last')) {
      committed = commitDrafts(khata, session.drafts);
      session.undo = { drafts: session.drafts.map((d) => ({ ...d })) };
      session.drafts = [];
      recompute(session);
      // The templated path reads `committed` directly, but the phrasing model
      // only sees `facts` — without this it was handed "nothing is pending" and
      // replied "what would you like to record?" to an entry it had just saved.
      notes.push(
        `SAVED to the book: ${committed
          .map((c) => `${c.name_en} now owes ${c.after} rupees (was ${c.before})`)
          .join('; ')}. Tell the merchant this is done, briefly.`,
      );
    }
  }

  const tRoute = Date.now();

  // The screen can be right long before the voice is. Emitting here means the
  // ledger and the pending card update while the reply is still being produced,
  // which removes most of the *felt* wait even when the wait is unchanged.
  opts.onStaged?.(session.drafts.map((d) => ({ ...d })), session.stage);

  // Build the facts. Only our arithmetic gets in here — the model phrases, and
  // phrases only from these lines.
  const factLines = [
    ...notes,
    ...session.drafts.map((d, i) => (session.drafts.length > 1 ? `Pending ${i + 1}: ${draftFacts(d)}` : draftFacts(d))),
  ];
  if (session.drafts.length > 1) {
    factLines.push(`There are ${session.drafts.length} pending entries. Confirm them all in ONE short sentence, naming each person. Do not use bullet points — say it as a shopkeeper would.`);
  }
  const facts = factLines.join('\n') || 'Nothing is pending. Ask what they would like to record.';

  // Templated locally where we can (see reply.ts): this used to be a second
  // model call measured at 1.1s-14s, and it is pure phrasing over numbers we
  // already computed.
  const templated = templateReply(
    { drafts: session.drafts, committed, ...ctxExtra },
    replyLangFor(opts.appLang ?? 'hi', transcript, opts.lang),
  );
  const reply = templated
    ? speechSafe(templated)
    : await composeReply(facts, transcript, session.drafts.length <= 1 && !notes.length, opts.lang);
  log('reply_source', { templated: !!templated, chars: reply.length });

  // Plain-text history: replaying raw tool_calls would need matching tool-result
  // messages, and the extra protocol surface buys us nothing here.
  session.history.push({ role: 'user', content: transcript });
  session.history.push({ role: 'assistant', content: `[stage=${session.stage} ${pendingSummary(session) || 'none'}]` });
  session.history = session.history.slice(-12);

  log('turn', { transcript, stage_in: stageIn, stage_out: session.stage, drafts: session.drafts.length, wrote: committed.length });

  return {
    transcript,
    stage: session.stage,
    drafts: session.drafts.map((d) => ({ ...d })),
    committed,
    wrote: committed.length > 0,
    khata,
    reply,
    timings: { route_ms: tRoute - t0, compose_ms: Date.now() - tRoute, total_ms: Date.now() - t0 },
  };
}

function pickTarget(session: Session, name?: string): Draft | undefined {
  if (!name) return session.drafts.find((d) => d.status === 'ready') ?? session.drafts[0];
  const q = norm(name);
  return session.drafts.find((d) => {
    const hay = [d.person?.name, d.person?.name_en, d.name_spoken].filter(Boolean).map((s) => norm(s as string));
    return hay.some((h) => h === q || h.includes(q) || q.includes(h));
  }) ?? session.drafts[0];
}

const pendingSummary = (session: Session): string =>
  session.drafts
    .map((d) => `${d.person?.name_en ?? d.name_spoken ?? '?'} ${d.kind} ${d.amount ?? '?'} (${d.status})`)
    .join('; ');
