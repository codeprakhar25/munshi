/**
 * Sarvam Document Intelligence, over raw bytes.
 *
 * Bytes rather than a URI on purpose: the app hands it a photo read from an
 * `expo-image-picker` uri, and `scripts/ocr-capture.ts` hands it a file read
 * from disk. Same six calls either way, and the harness can hit the real API
 * with no phone attached.
 *
 * Every request and response goes through `log()` from `agent/sarvam.ts` —
 * ARCHITECTURE.md §11: the failures that cost money here are silent, and the
 * old standalone client had no logging at all.
 *
 * No `react-native` / `expo-*` / Node imports.
 */
import { unzipSync, zipSync } from 'fflate';

import { KEY, log } from '../agent/sarvam';
import type { PageBlock } from './page';

const BASE_URL = 'https://api.sarvam.ai';

export type DocLanguage =
  | 'hi-IN' | 'en-IN' | 'bn-IN' | 'gu-IN' | 'kn-IN' | 'ml-IN' | 'mr-IN' | 'or-IN'
  | 'pa-IN' | 'ta-IN' | 'te-IN' | 'ur-IN' | 'as-IN' | 'bodo-IN' | 'doi-IN' | 'ks-IN'
  | 'kok-IN' | 'mai-IN' | 'mni-IN' | 'ne-IN' | 'sa-IN' | 'sat-IN' | 'sd-IN';

export type DocPhase = 'uploading' | 'processing' | 'downloading';

function headers(extra?: Record<string, string>): Record<string, string> {
  if (!KEY) throw new Error('EXPO_PUBLIC_SARVAM_API_KEY is not set');
  return { 'api-subscription-key': KEY, 'Content-Type': 'application/json', ...extra };
}

async function json<T>(step: string, url: string, init: RequestInit): Promise<T> {
  log('doc_req', { step, url: url.split('?')[0] });
  const res = await fetch(url, init);
  const text = await res.text();
  log('doc_res', { step, status: res.status, body: text.slice(0, 1500) });
  if (!res.ok) throw new Error(`${step} -> ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

interface UploadLinks {
  upload_urls: Record<string, { file_url: string; file_metadata?: Record<string, string> }>;
}
interface JobStatus {
  job_state: 'Accepted' | 'Pending' | 'Running' | 'Completed' | 'PartiallyCompleted' | 'Failed';
  job_details?: { total_pages: number; pages_processed: number; pages_succeeded: number; pages_failed: number }[];
}

export interface PageMetadata {
  page_num: number;
  image_width: number;
  image_height: number;
  created_at: string;
  blocks: PageBlock[];
}

export interface DocResult {
  jobId: string;
  pages: PageMetadata[];
  blocks: PageBlock[];
}

/**
 * Runs the full job. Returns page metadata, never `document.md` — that file
 * embeds base64 page images and is megabytes of nothing we use.
 */
export async function runDocumentJob(
  bytes: Uint8Array,
  kind: 'image' | 'pdf',
  language: DocLanguage,
  onPhase?: (phase: DocPhase) => void,
): Promise<DocResult> {
  const { job_id: jobId } = await json<{ job_id: string }>(
    'createJob',
    `${BASE_URL}/doc-digitization/job/v1`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ job_parameters: { language, output_format: 'md' } }) },
  );

  // Doc Intelligence takes PDF or ZIP only, so a photo is zipped client-side.
  const filename = kind === 'pdf' ? 'document.pdf' : 'scan.zip';
  const payload = kind === 'pdf' ? bytes : zipSync({ 'scan.jpg': bytes });

  const links = await json<UploadLinks>(
    'uploadLinks',
    `${BASE_URL}/doc-digitization/job/v1/upload-files`,
    { method: 'POST', headers: headers(), body: JSON.stringify({ job_id: jobId, files: [filename] }) },
  );
  const target = Object.values(links.upload_urls)[0];
  if (!target?.file_url) throw new Error('no upload url returned');

  onPhase?.('uploading');
  // Presigned Azure Blob PUT — raw bytes, no multipart, and the blob-type
  // header is mandatory or the PUT is rejected.
  const putHeaders: Record<string, string> = { 'x-ms-blob-type': 'BlockBlob' };
  for (const [k, v] of Object.entries(target.file_metadata ?? {})) {
    if (typeof v === 'string') putHeaders[k] = v;
  }
  const put = await fetch(target.file_url, { method: 'PUT', headers: putHeaders, body: payload as BodyInit });
  log('doc_upload', { status: put.status, bytes: payload.length, filename });
  if (!put.ok) throw new Error(`upload -> ${put.status}`);

  await json('startJob', `${BASE_URL}/doc-digitization/job/v1/${jobId}/start`, {
    method: 'POST',
    headers: headers(),
  });

  onPhase?.('processing');
  const startedAt = Date.now();
  let status: JobStatus;
  for (;;) {
    status = await json<JobStatus>('status', `${BASE_URL}/doc-digitization/job/v1/${jobId}/status`, {
      method: 'GET',
      headers: headers(),
    });
    if (['Completed', 'PartiallyCompleted', 'Failed'].includes(status.job_state)) break;
    if (Date.now() - startedAt > 90_000) throw new Error('Sarvam OCR job timed out after 90s');
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (status.job_state === 'Failed') throw new Error('Sarvam OCR job failed');

  onPhase?.('downloading');
  const dl = await json<{ download_urls: Record<string, { file_url: string }> }>(
    'downloadLinks',
    `${BASE_URL}/doc-digitization/job/v1/${jobId}/download-files`,
    { method: 'POST', headers: headers() },
  );
  const out = Object.values(dl.download_urls)[0];
  if (!out?.file_url) throw new Error('no download url returned');

  const zipRes = await fetch(out.file_url);
  if (!zipRes.ok) throw new Error(`download -> ${zipRes.status}`);
  const zipBytes = new Uint8Array(await zipRes.arrayBuffer());

  const files = unzipSync(zipBytes);
  const decoder = new TextDecoder();
  const pages: PageMetadata[] = [];
  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith('metadata/') || !name.endsWith('.json')) continue;
    pages.push(JSON.parse(decoder.decode(data)) as PageMetadata);
  }
  pages.sort((a, b) => a.page_num - b.page_num);

  const blocks = pages.flatMap((p) => p.blocks).sort((a, b) => a.reading_order - b.reading_order);
  log('doc_done', { jobId, pages: pages.length, blocks: blocks.length, state: status.job_state });

  return { jobId, pages, blocks };
}
