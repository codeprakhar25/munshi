/**
 * The scan pipeline, end to end, with no React and no phone in it.
 *
 *   bytes -> Sarvam Document Intelligence -> blocks
 *         -> deterministic line/table reading  (numerals, lines, columns)
 *         -> sarvam-30b pass for name + direction only  (structure)
 *         -> group by person                       (group)
 *         -> contacts + khata matching             (resolve)
 *         -> priced Drafts awaiting confirmation
 *
 * `processing.tsx` should call `runScan`; `scripts/ocr.ts` calls `parseAndResolve`
 * on a saved page so the parser can be iterated without a rebuild.
 *
 * No `react-native` / `expo-*` / Node imports.
 */
import type { Draft, Khata } from '../agent/types';
import { runDocumentJob, type DocLanguage, type DocPhase } from './client';
import { groupItemsToDrafts } from './group';
import { parseBlocksToItems, type PageBlock } from './page';
import { attachContactMatches, type ResolveStats } from './resolve';
import { structureItems, type StructureStats } from './structure';
import type { TransliterateSource } from './transliterate';

export type ScanPhase = DocPhase | 'reading' | 'structuring' | 'matching';

export interface ScanReport {
  drafts: Draft[];
  blocks: number;
  items: number;
  structure: StructureStats;
  match: ResolveStats;
}

export interface ParseOptions {
  khata: Khata;
  contacts: { id: string; name: string; phone: string | null }[];
  /** Script the register is written in — drives transliteration, not OCR. */
  scriptLanguage?: TransliterateSource;
  /** Skip the model pass. The harness uses this to see the raw keyword reading. */
  skipModel?: boolean;
  onPhase?: (phase: ScanPhase) => void;
}

/** blocks -> confirmation-pending drafts. */
export async function parseAndResolve(
  blocks: PageBlock[],
  options: ParseOptions,
): Promise<ScanReport> {
  options.onPhase?.('reading');
  const raw = parseBlocksToItems(blocks);

  options.onPhase?.('structuring');
  // Fail-open: model outage degrades to keyword rules, never drops the page.
  const { items, stats: structure } = options.skipModel
    ? { items: raw, stats: { lines: 0, amounts: raw.length, named: 0, directionChanged: 0, used: false } }
    : await structureItems(raw);

  const grouped = groupItemsToDrafts(items);

  options.onPhase?.('matching');
  const { drafts, stats: match } = await attachContactMatches(grouped, {
    khata: options.khata,
    contacts: options.contacts,
    language: options.scriptLanguage,
  });

  return { drafts, blocks: blocks.length, items: items.length, structure, match };
}

export async function runScan(
  bytes: Uint8Array,
  kind: 'image' | 'pdf',
  docLanguage: DocLanguage,
  options: ParseOptions,
): Promise<ScanReport & { jobId: string }> {
  const { jobId, blocks } = await runDocumentJob(bytes, kind, docLanguage, options.onPhase);
  const report = await parseAndResolve(blocks, options);
  return { ...report, jobId };
}

export type { PageBlock, DocLanguage, ResolveStats, StructureStats };
export { groupItemsToDrafts } from './group';
