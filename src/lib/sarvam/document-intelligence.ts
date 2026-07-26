/**
 * React Native adapter over `src/ocr/client.ts`.
 *
 * The only thing that lives here is turning a device URI into bytes. All six
 * Sarvam calls, the zipping and the metadata extraction sit in `src/ocr/`, so
 * `scripts/ocr-capture.ts` can run the identical path from a file on disk.
 */
import { runDocumentJob, type DocLanguage, type DocPhase } from '@/ocr/client';
import type { PageBlock } from '@/ocr/page';

export type { DocLanguage, DocPhase };
export type { PageBlock };

async function readBytes(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`could not read ${uri.slice(0, 60)} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

export async function runDocumentIntelligence(
  source: { uri: string; type: 'image' | 'pdf' },
  language: DocLanguage,
  onPhase?: (phase: DocPhase) => void,
): Promise<PageBlock[]> {
  const bytes = await readBytes(source.uri);
  const { blocks } = await runDocumentJob(bytes, source.type, language, onPhase);
  return blocks;
}
