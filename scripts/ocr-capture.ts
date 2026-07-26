/**
 * Runs a real register photo through Sarvam Document Intelligence and saves the
 * raw page metadata as a fixture.
 *
 *   npm run ocr:capture -- ./assets/images/khata1.jpeg
 *   npm run ocr:capture -- ./photos/khata1.jpg --name daily-ledger
 *
 * Works from Windows PowerShell or WSL (same repo path). Needs .env with
 * EXPO_PUBLIC_SARVAM_API_KEY.
 *
 * Writes:
 *   fixtures/<name>/page_1.json   the blocks, exactly as Sarvam returned them
 *   fixtures/<name>/blocks.txt    the same thing readable, for eyeballing
 *
 * Run this ONCE per photo. After that `npm run ocr -- fixtures/<name>` replays
 * the saved page through the parser instantly and for free.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

import { KEY, setSink } from '../src/agent/sarvam';
import { runDocumentJob, type DocLanguage } from '../src/ocr/client';

// Wrapped rather than top-level await: package.json has no "type":"module"
// (Metro reads that file too), so tsx transpiles these scripts to CJS.
async function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));

  if (!KEY) {
    console.error('\n  EXPO_PUBLIC_SARVAM_API_KEY is not set. Put it in munshi/.env\n');
    process.exit(1);
  }
  if (!file) {
    console.error(
      '\n  usage: npm run ocr:capture -- ./assets/images/khata1.jpeg [--name my-page] [--lang hi-IN]\n',
    );
    process.exit(1);
  }

  const flag = (name: string, fallback: string): string => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };

  const source = resolve(process.cwd(), file);
  const name = flag('name', basename(file, extname(file)));
  const language = flag('lang', 'hi-IN') as DocLanguage;
  const kind = extname(file).toLowerCase() === '.pdf' ? 'pdf' : 'image';

  const outDir = join(process.cwd(), 'fixtures', name);
  mkdirSync(outDir, { recursive: true });

  // Keep the verbatim exchange next to the fixture: when a page comes back empty
  // the answer is almost always in the job status, not in the parser.
  const logPath = join(outDir, 'sarvam.log');
  writeFileSync(logPath, '');
  setSink((row) => {
    writeFileSync(logPath, `${JSON.stringify(row)}\n`, { flag: 'a' });
  });

  const bytes = new Uint8Array(readFileSync(source));
  console.log(`\n  ${name}  <-  ${file}  (${kind}, ${language}, ${(bytes.length / 1024).toFixed(0)} KB)`);

  const result = await runDocumentJob(bytes, kind, language, (phase) => console.log(`  ${phase}...`));

  result.pages.forEach((page) => {
    writeFileSync(join(outDir, `page_${page.page_num}.json`), JSON.stringify(page, null, 2));
  });

  const readable = result.blocks
    .map((b) => `--- ${b.reading_order}  [${b.layout_tag}]  conf=${b.confidence}\n${b.text}`)
    .join('\n\n');
  writeFileSync(join(outDir, 'blocks.txt'), readable);

  console.log(`\n  job ${result.jobId}`);
  console.log(`  ${result.pages.length} page(s), ${result.blocks.length} blocks -> fixtures/${name}/`);
  console.log(`\n  next:  npm run ocr -- fixtures/${name}\n`);
}

void main().catch((err) => {
  console.error('\n  capture failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
