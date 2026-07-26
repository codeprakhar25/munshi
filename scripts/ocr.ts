/**
 * Headless scan harness: replays a saved page through the REAL parser and
 * prints what the merchant would have been shown.
 *
 *   npm run ocr -- fixtures/khata1
 *   npm run ocr -- fixtures/khata1 --no-model     # keyword rules only
 *   npm run ocr -- fixtures/khata1 --contacts ./fixtures/contacts.json
 *
 * Works from Windows PowerShell or WSL. Same CJS wrap as `turns.ts` /
 * `ocr-capture.ts` (package.json has no "type":"module").
 *
 * `--no-model` shows exactly what sarvam-30b adds over the keyword rules.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { normalizeKhata } from '../src/agent/agent';
import { setSink } from '../src/agent/sarvam';
import type { Draft, Khata } from '../src/agent/types';
import { SEED } from '../src/db/seed';
import { parseAndResolve } from '../src/ocr';
import type { PageBlock } from '../src/ocr/page';

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  const skipModel = args.includes('--no-model');
  const verbose = args.includes('--verbose');

  if (!dir) {
    console.error('\n  usage: npm run ocr -- fixtures/<name> [--no-model] [--contacts file.json]\n');
    process.exit(1);
  }

  if (verbose) setSink((row) => console.log(`  · ${row.kind} ${JSON.stringify(row.payload).slice(0, 300)}`));

  const fixtureDir = resolve(process.cwd(), dir);
  const blocks: PageBlock[] = readdirSync(fixtureDir)
    .filter((f) => f.startsWith('page_') && f.endsWith('.json'))
    .sort()
    .flatMap((f) => (JSON.parse(readFileSync(join(fixtureDir, f), 'utf8')) as { blocks: PageBlock[] }).blocks);

  if (!blocks.length) {
    console.error(`\n  no page_*.json in ${dir} — run npm run ocr:capture first\n`);
    process.exit(1);
  }

  const contactsFlag = args.indexOf('--contacts');
  const contacts: { id: string; name: string; phone: string | null }[] =
    contactsFlag >= 0 && args[contactsFlag + 1]
      ? JSON.parse(readFileSync(resolve(process.cwd(), args[contactsFlag + 1]), 'utf8'))
      : [];

  const khata: Khata = normalizeKhata(structuredClone(SEED));

  const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));

  const describe = (d: Draft): string => {
    const who = d.person
      ? `${d.person.name}${d.person.from_contacts ? ' (contact)' : ''}`
      : d.status === 'ambiguous'
        ? `? ${d.options.map((o) => o.name).join(' / ')}`
        : '—';
    const money = `${d.kind === 'payment' ? '-' : '+'}${d.amount}`;
    const prices = d.before === null ? '' : `  ${d.before} -> ${d.after}`;
    return `${pad(d.name_spoken ?? '(no name)', 16)} ${pad(who, 26)} ${pad(money, 7)} ${pad(d.status, 14)}${prices}`;
  };

  // Script autodetection: Odia/Tamil/… pages must not be forced through hi-IN.
  const report = await parseAndResolve(blocks, {
    khata,
    contacts,
    skipModel,
    scriptLanguage: 'auto',
  });

  console.log(`\n  ${blocks.length} blocks -> ${report.items} items -> ${report.match.cards} cards`);
  console.log(
    `  model: ${report.structure.used ? `used, renamed ${report.structure.named}, flipped ${report.structure.directionChanged}` : `SKIPPED${report.structure.error ? ` (${report.structure.error.slice(0, 80)})` : ''}`}`,
  );
  console.log(
    `  match: ${report.match.auto} auto · ${report.match.ambiguous} ambiguous · ${report.match.unresolved} unresolved · ${report.match.transliterated} transliterated`,
  );
  console.log(`  contacts pool: ${contacts.length}   khata roster: ${khata.customers.length}\n`);

  console.log(`  ${pad('NAME ON PAGE', 16)} ${pad('MATCHED TO', 26)} ${pad('NET', 7)} ${pad('STATUS', 14)}  BALANCE`);
  console.log(`  ${'-'.repeat(88)}`);
  for (const d of report.drafts) {
    console.log(`  ${describe(d)}`);
    for (const item of d.items ?? []) {
      console.log(
        `      ${item.direction === 'payment' ? '-' : '+'}${pad(String(item.amount), 8)} ${pad(item.label || '—', 20)}`,
      );
    }
    if (verbose && d.scan) console.log(`      raw: ${d.scan.rawText.slice(0, 100)}  [${d.scan.directionReason}]`);
  }

  const unresolved = report.drafts.filter((d) => d.status !== 'ready');
  console.log(
    `\n  ${report.drafts.length - unresolved.length}/${report.drafts.length} cards ready to confirm; ${unresolved.length} need a person picked.\n`,
  );
}

void main().catch((err) => {
  console.error('\n  ocr failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
