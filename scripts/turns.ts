/**
 * Headless harness: replays a scripted conversation through the real agent with
 * no phone, no microphone and no STT. This is the POC's single most valuable
 * property and the reason `src/agent/` may not import react-native — see
 * ARCHITECTURE.md §3.
 *
 *   npm run turns              # the whole script
 *   npm run turns -- add edit  # only the named scenes
 *
 * If a balance is wrong, this tells you whether the model misheard or the ledger
 * misapplied, without you having to talk to a phone.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { deriveBalance, normalizeKhata, runTurn } from '../src/agent/agent';
import { KEY, setSink } from '../src/agent/sarvam';
import { newSession, type Khata, type Session, type Turn } from '../src/agent/types';
import { SEED } from '../src/db/seed';

const HERE = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(HERE, '..', 'logs');

if (!KEY) {
  console.error('\n  EXPO_PUBLIC_SARVAM_API_KEY is not set.');
  console.error('  Put it in munshi/.env, then:  npm run turns\n');
  process.exit(1);
}

// Every partner exchange verbatim on disk. Finding #3 (silently dropped ledger
// actions) fails quietly with wrong money; raw bodies are how it was caught.
mkdirSync(LOG_DIR, { recursive: true });
const LOG = join(LOG_DIR, 'sarvam.jsonl');
writeFileSync(LOG, '');
setSink((row) => appendFileSync(LOG, `${JSON.stringify(row)}\n`));

// --------------------------------------------------------------- scenes -----

interface Scene {
  name: string;
  why: string;
  turns: string[];
  /** Throws to fail the scene. `k` is the ledger after the last turn. */
  expect?: (turns: Turn[], k: Khata) => void;
}

const bal = (k: Khata, id: string) => k.customers.find((c) => c.id === id)?.balance;
const entryCount = (k: Khata) => k.customers.reduce((n, c) => n + c.entries.length, 0);

const SCENES: Scene[] = [
  {
    name: 'add',
    why: 'a plain credit stages a priced draft and writes NOTHING',
    turns: ['कविता को साबुन चालीस का'],
    expect: ([t], k) => {
      if (t.wrote) throw new Error('wrote to the ledger before any confirmation');
      if (t.stage !== 'confirming') throw new Error(`expected stage=confirming, got ${t.stage}`);
      const d = t.drafts[0];
      if (!d) throw new Error('no draft staged');
      if (d.person?.id !== 'c7') throw new Error(`expected Kavita (c7), got ${d.person?.id}`);
      if (d.amount !== 40) throw new Error(`expected amount 40, got ${d.amount}`);
      if (d.after !== (d.before ?? 0) + 40) throw new Error(`preview wrong: ${d.before} -> ${d.after}`);
      if (bal(k, 'c7') !== 520) throw new Error(`ledger moved early: c7 = ${bal(k, 'c7')}`);
    },
  },
  {
    name: 'commit',
    why: 'हाँ writes exactly one entry and the balance equals the fold over entries',
    turns: ['कविता को साबुन चालीस का', 'हाँ'],
    expect: ([, t2], k) => {
      if (!t2.wrote) throw new Error('confirmation did not write');
      if (t2.committed.length !== 1) throw new Error(`expected 1 committed, got ${t2.committed.length}`);
      if (bal(k, 'c7') !== 560) throw new Error(`expected c7 = 560, got ${bal(k, 'c7')}`);
      if (t2.stage !== 'idle') throw new Error(`expected stage=idle after commit, got ${t2.stage}`);
    },
  },
  {
    name: 'conflict',
    why: 'two Rameshes -> ask which, and "Joshi wala" resolves it BY VOICE',
    turns: ['रमेश ने दो सौ दिए', 'जोशी वाला', 'हाँ'],
    expect: ([t1, t2, t3], k) => {
      if (t1.stage !== 'picking') throw new Error(`expected stage=picking, got ${t1.stage}`);
      if (t1.drafts[0]?.options.length !== 2) throw new Error(`expected 2 candidates, got ${t1.drafts[0]?.options.length}`);
      if (t2.drafts[0]?.person?.id !== 'c8') throw new Error(`voice pick failed: got ${t2.drafts[0]?.person?.id}`);
      if (!t3.wrote) throw new Error('did not commit after the pick');
      if (bal(k, 'c8') !== 140) throw new Error(`expected Joshi 340-200=140, got ${bal(k, 'c8')}`);
      if (bal(k, 'c1') !== 500) throw new Error(`wrong Ramesh moved: c1 = ${bal(k, 'c1')}`);
    },
  },
  {
    name: 'edit',
    why: 'THE regression test — "100 नहीं 150" is an AMEND, not a rejection, and not a second entry',
    turns: ['गोपाल ने सौ रुपये दिए', 'नहीं नहीं, गोपाल ने सौ नहीं डेढ़ सौ दिए थे', 'हाँ'],
    expect: ([, t2, t3], k) => {
      if (t2.wrote) throw new Error('amend wrote to the ledger — it must stay pending');
      if (t2.drafts.length !== 1) throw new Error(`amend created ${t2.drafts.length} drafts; must stay at 1`);
      if (t2.drafts[0]?.amount !== 150) throw new Error(`expected amount amended to 150, got ${t2.drafts[0]?.amount}`);
      if (bal(k, 'c5') !== 1950) throw new Error(`expected Gopal 2100-150=1950, got ${bal(k, 'c5')}`);
      if (t3.committed.length !== 1) throw new Error(`expected exactly 1 entry, got ${t3.committed.length}`);
    },
  },
  {
    name: 'reject',
    why: 'a bare नहीं with no replacement throws the draft away and writes nothing',
    turns: ['सुनीता को तेल सौ का', 'नहीं, रहने दो'],
    expect: ([, t2], k) => {
      if (t2.wrote) throw new Error('rejection wrote to the ledger');
      if (t2.drafts.length) throw new Error(`rejection left ${t2.drafts.length} drafts pending`);
      if (bal(k, 'c2') !== 1250) throw new Error(`ledger moved on a rejection: c2 = ${bal(k, 'c2')}`);
    },
  },
  {
    name: 'gate',
    why: 'no amount stated -> ask, never guess',
    turns: ['सुनीता ने पैसे दे दिए'],
    expect: ([t], k) => {
      if (t.wrote) throw new Error('wrote without an amount');
      if (t.stage !== 'awaiting_amount') throw new Error(`expected awaiting_amount, got ${t.stage}`);
      if (entryCount(k) !== k.customers.filter((c) => c.balance > 0).length) throw new Error('entries changed');
    },
  },
  {
    name: 'amount',
    why: 'the follow-up number lands on the waiting draft',
    turns: ['सुनीता ने पैसे दे दिए', 'दो सौ पचास', 'हाँ'],
    expect: ([, t2, t3], k) => {
      if (t2.drafts[0]?.amount !== 250) throw new Error(`expected 250, got ${t2.drafts[0]?.amount}`);
      if (!t3.wrote) throw new Error('did not commit');
      if (bal(k, 'c2') !== 1000) throw new Error(`expected 1250-250=1000, got ${bal(k, 'c2')}`);
    },
  },
  {
    name: 'query',
    why: 'a question reads the balance and writes nothing, staying idle',
    turns: ['गोपाल का कितना बाकी है?'],
    expect: ([t], k) => {
      if (t.wrote) throw new Error('a query wrote to the ledger');
      if (t.stage !== 'idle') throw new Error(`a query left stage=${t.stage}`);
      if (bal(k, 'c5') !== 2100) throw new Error('a query moved a balance');
    },
  },
  {
    name: 'multi',
    why: 'the POC\'s strongest case — three people, both directions, one lock',
    turns: ['लक्ष्मी ने तीन सौ दिए, हरी ने सौ दिए और कविता ने दो सौ का सामान लिया', 'हाँ'],
    expect: ([t1, t2], k) => {
      if (t1.drafts.length !== 3) throw new Error(`expected 3 drafts in one breath, got ${t1.drafts.length}`);
      if (t1.wrote) throw new Error('staged AND wrote');
      if (t2.committed.length !== 3) throw new Error(`expected 3 commits, got ${t2.committed.length}`);
      if (bal(k, 'c4') !== 130) throw new Error(`Lakshmi 430-300=130, got ${bal(k, 'c4')}`);
      if (bal(k, 'c6') !== 175) throw new Error(`Hari 275-100=175, got ${bal(k, 'c6')}`);
      if (bal(k, 'c7') !== 720) throw new Error(`Kavita 520+200=720, got ${bal(k, 'c7')}`);
    },
  },
  {
    name: 'newkhata',
    why: 'opening a khata for somebody not in the book',
    turns: ['राकेश का नया खाता खोलो, तीन सौ उधार', 'हाँ'],
    expect: ([t1, t2], k) => {
      if (t1.drafts[0]?.kind !== 'new_customer') throw new Error(`expected new_customer, got ${t1.drafts[0]?.kind}`);
      if (!t2.wrote) throw new Error('did not create the customer');
      const fresh = k.customers.find((c) => c.id === 'c9');
      if (!fresh) throw new Error('no new customer row');
      if (fresh.balance !== 300) throw new Error(`expected opening 300, got ${fresh.balance}`);
    },
  },
  {
    name: 'overpay',
    why: 'overpaying leaves CREDIT, and a later purchase spends it instead of re-billing it',
    // Abdul owes 85. He pays 200, so the shop owes him 115. He then takes 50 of
    // goods, which must come out of that credit -> shop still owes 65.
    // A ledger that clamps the overpayment to zero would say he owes 50 — money
    // he already handed over. Found by review; this scene is why it stays fixed.
    turns: ['अब्दुल ने दो सौ रुपये दे दिए', 'हाँ', 'अब्दुल को पचास रुपये का सामान दे दिया', 'हाँ'],
    expect: (_t, k) => {
      const abdul = k.customers.find((c) => c.id === 'c3');
      if (!abdul) throw new Error('no Abdul');
      if (abdul.balance !== -65) throw new Error(`expected -65 (shop owes him 65), got ${abdul.balance}`);
      // The invariant that matters: stored history must reproduce the balance.
      if (deriveBalance(abdul.entries) !== abdul.balance) {
        throw new Error(`balance ${abdul.balance} does not match the fold ${deriveBalance(abdul.entries)}`);
      }
    },
  },
  {
    name: 'sameperson',
    why: 'the same customer twice in one breath — the second line must follow the first, not the pre-turn balance',
    turns: ['रमेश कुमार ने सौ दिए और रमेश कुमार को पचास का सामान भी दे दो', 'हाँ'],
    expect: ([t1], k) => {
      const c1 = k.customers.find((c) => c.id === 'c1');
      if (!c1) throw new Error('no Ramesh Kumar');
      // 500 - 100 = 400, then 400 + 50 = 450. Pricing both off 500 would preview 550.
      if (c1.balance !== 450) throw new Error(`expected 500-100+50=450, got ${c1.balance}`);
      if (deriveBalance(c1.entries) !== c1.balance) throw new Error('entries do not reproduce the balance');
      // Every stored row must be consistent with the fold, since this is what the
      // merchant reads back in the passbook.
      let running = 0;
      for (const e of c1.entries) {
        running = deriveBalance([...c1.entries.slice(0, c1.entries.indexOf(e) + 1)]);
        if (e.after !== running) throw new Error(`entry after=${e.after} but fold says ${running}`);
      }
      if (t1.drafts.length !== 2) throw new Error(`expected 2 drafts, got ${t1.drafts.length}`);
    },
  },
  {
    name: 'english',
    why: 'English in -> English out, same machine',
    turns: ['Kavita took three hundred and fifty rupees of goods'],
    expect: ([t]) => {
      if (t.drafts[0]?.amount !== 350) throw new Error(`expected 350, got ${t.drafts[0]?.amount}`);
      if (/[ऀ-ॿ]/.test(t.reply)) throw new Error(`replied in Devanagari to an English command: "${t.reply}"`);
    },
  },
];

// ----------------------------------------------------------------- run ------

const only = process.argv.slice(2).filter((a: string) => !a.startsWith("-"));
const chosen = only.length ? SCENES.filter((s) => only.includes(s.name)) : SCENES;

const money = (n: number | null | undefined) => (n === null || n === undefined ? '  ?  ' : String(n).padStart(5));

// Wrapped rather than using top-level await: package.json has no "type":"module"
// (Metro reads that file too), so the script transpiles to CJS.
async function main() {
  let passed = 0;
  const failures: string[] = [];
  const skipped: string[] = [];

  console.log(`\n  Munshi agent — scripted conversation, no mic, no STT`);
  console.log(`  ${chosen.length} scene${chosen.length === 1 ? '' : 's'}\n${'='.repeat(94)}`);

  for (const scene of chosen) {
    // Each scene starts from a pristine ledger so failures don't cascade.
    const khata: Khata = normalizeKhata(structuredClone(SEED));
    const session: Session = newSession();
    const results: Turn[] = [];

    console.log(`\n\x1b[1m${scene.name}\x1b[0m — ${scene.why}`);

    try {
      for (const text of scene.turns) {
        const t = await runTurn(text, session, khata);
        results.push(t);
        console.log(`\n  say     "${text}"`);
        console.log(`  stage   ${t.stage}${t.wrote ? '  \x1b[32mWROTE\x1b[0m' : '  (nothing written)'}`);
        for (const d of t.drafts) {
          const who = d.person?.name_en ?? d.name_spoken ?? '—';
          const move = d.status === 'ready' ? `${money(d.before)} ->${money(d.after)}` : `      ${d.status}`;
          const opts = d.options.length ? `  [${d.options.map((o) => o.name_en).join(' | ')}]` : '';
          console.log(`  draft   ${who.padEnd(16)} ${d.kind.padEnd(13)} ${money(d.amount)}  ${move}${opts}`);
        }
        for (const c of t.committed) console.log(`  saved   ${c.name_en.padEnd(16)} ${money(c.before)} ->${money(c.after)}`);
        console.log(`  says    "${t.reply}"`);
        console.log(`  timing  route ${t.timings.route_ms}ms · phrase ${t.timings.compose_ms}ms · total ${t.timings.total_ms}ms`);
      }
      scene.expect?.(results, khata);
      console.log(`\n  \x1b[32mPASS\x1b[0m ${scene.name}`);
      passed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A dropped connection is not a failed assertion. Reported identically,
      // it reads as a regression and sends you hunting for a bug that isn't there.
      if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT|socket hang up/i.test(msg)) {
        console.log(`\n  \x1b[33mSKIP\x1b[0m ${scene.name}: network — ${msg}`);
        skipped.push(`${scene.name}: ${msg}`);
      } else {
        console.log(`\n  \x1b[31mFAIL\x1b[0m ${scene.name}: ${msg}`);
        failures.push(`${scene.name}: ${msg}`);
      }
    }
  }

  console.log(`\n${'='.repeat(94)}`);
  console.log(`  ${passed}/${chosen.length} scenes passed${skipped.length ? `, ${skipped.length} skipped (network)` : ''}`);
  for (const f of failures) console.log(`  \x1b[31m·\x1b[0m ${f}`);
  for (const s2 of skipped) console.log(`  \x1b[33m·\x1b[0m ${s2}`);
  console.log(`  verbatim Sarvam traffic: ${LOG}\n`);
  process.exit(failures.length ? 1 : 0);
}

void main();
