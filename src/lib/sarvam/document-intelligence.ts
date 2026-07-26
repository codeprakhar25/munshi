import { unzipSync, zipSync } from 'fflate';

const BASE_URL = 'https://api.sarvam.ai';

function apiKey(): string {
  const key = process.env.EXPO_PUBLIC_SARVAM_API_KEY;
  if (!key) throw new Error('EXPO_PUBLIC_SARVAM_API_KEY is not set');
  return key;
}

function headers(extra?: Record<string, string>) {
  return {
    'api-subscription-key': apiKey(),
    'Content-Type': 'application/json',
    ...extra,
  };
}

export type DocLanguage =
  | 'hi-IN' | 'en-IN' | 'bn-IN' | 'gu-IN' | 'kn-IN' | 'ml-IN' | 'mr-IN' | 'or-IN'
  | 'pa-IN' | 'ta-IN' | 'te-IN' | 'ur-IN' | 'as-IN' | 'bodo-IN' | 'doi-IN' | 'ks-IN'
  | 'kok-IN' | 'mai-IN' | 'mni-IN' | 'ne-IN' | 'sa-IN' | 'sat-IN' | 'sd-IN';

interface CreateJobResponse {
  job_id: string;
}

interface UploadLinksResponse {
  upload_urls: Record<string, { file_url: string; file_metadata?: Record<string, string> }>;
}

interface JobStatusResponse {
  job_state: 'Accepted' | 'Pending' | 'Running' | 'Completed' | 'PartiallyCompleted' | 'Failed';
  job_details?: {
    total_pages: number;
    pages_processed: number;
    pages_succeeded: number;
    pages_failed: number;
    page_errors: unknown[];
  }[];
}

interface DownloadLinksResponse {
  download_urls: Record<string, { file_url: string }>;
}

async function createJob(language: DocLanguage): Promise<string> {
  const res = await fetch(`${BASE_URL}/doc-digitization/job/v1`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ job_parameters: { language, output_format: 'md' } }),
  });
  if (!res.ok) throw new Error(`createJob failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as CreateJobResponse;
  return data.job_id;
}

async function uploadFile(jobId: string, filename: string, body: Blob): Promise<void> {
  const linkRes = await fetch(`${BASE_URL}/doc-digitization/job/v1/upload-files`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ job_id: jobId, files: [filename] }),
  });
  if (!linkRes.ok) throw new Error(`getUploadLinks failed: ${linkRes.status} ${await linkRes.text()}`);
  const linkData = (await linkRes.json()) as UploadLinksResponse;
  const uploadInfo = Object.values(linkData.upload_urls)[0];
  if (!uploadInfo?.file_url) throw new Error('No upload URL returned from server');

  const putHeaders: Record<string, string> = { 'x-ms-blob-type': 'BlockBlob' };
  if (uploadInfo.file_metadata) {
    for (const [k, v] of Object.entries(uploadInfo.file_metadata)) {
      if (typeof v === 'string') putHeaders[k] = v;
    }
  }
  const putRes = await fetch(uploadInfo.file_url, { method: 'PUT', headers: putHeaders, body });
  if (!putRes.ok) throw new Error(`file upload failed: ${putRes.status}`);
}

async function startJob(jobId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/doc-digitization/job/v1/${jobId}/start`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) throw new Error(`startJob failed: ${res.status} ${await res.text()}`);
}

async function getStatus(jobId: string): Promise<JobStatusResponse> {
  const res = await fetch(`${BASE_URL}/doc-digitization/job/v1/${jobId}/status`, {
    method: 'GET',
    headers: headers(),
  });
  if (!res.ok) throw new Error(`getStatus failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as JobStatusResponse;
}

async function waitUntilComplete(jobId: string, onPhase?: (phase: JobStatusResponse['job_state']) => void): Promise<JobStatusResponse> {
  const startedAt = Date.now();
  const timeoutMs = 90_000;
  while (true) {
    const status = await getStatus(jobId);
    onPhase?.(status.job_state);
    if (status.job_state === 'Completed' || status.job_state === 'PartiallyCompleted' || status.job_state === 'Failed') {
      return status;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Sarvam OCR job timed out after 90s');
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}

async function downloadOutputZip(jobId: string): Promise<Uint8Array> {
  const linkRes = await fetch(`${BASE_URL}/doc-digitization/job/v1/${jobId}/download-files`, {
    method: 'POST',
    headers: headers(),
  });
  if (!linkRes.ok) throw new Error(`getDownloadLinks failed: ${linkRes.status} ${await linkRes.text()}`);
  const linkData = (await linkRes.json()) as DownloadLinksResponse;
  const downloadInfo = Object.values(linkData.download_urls)[0];
  if (!downloadInfo?.file_url) throw new Error('No download URL returned from server');

  const fileRes = await fetch(downloadInfo.file_url);
  if (!fileRes.ok) throw new Error(`download failed: ${fileRes.status}`);
  const buffer = await fileRes.arrayBuffer();
  return new Uint8Array(buffer);
}

// ---- Page metadata shapes (confirmed against real Sarvam output samples) ----

export interface PageBlock {
  block_id: string;
  coordinates: { x1: number; y1: number; x2: number; y2: number };
  layout_tag: 'section-title' | 'header' | 'paragraph' | 'table' | 'image' | 'image-caption' | 'footnote' | 'footer';
  confidence: number;
  reading_order: number;
  text: string;
}

interface PageMetadata {
  page_num: number;
  image_width: number;
  image_height: number;
  created_at: string;
  blocks: PageBlock[];
}

function extractPageMetadataBlocks(zipBytes: Uint8Array): PageBlock[] {
  const files = unzipSync(zipBytes);
  const decoder = new TextDecoder();
  const blocks: PageBlock[] = [];
  for (const [name, bytes] of Object.entries(files)) {
    if (!name.startsWith('metadata/') || !name.endsWith('.json')) continue;
    const json = JSON.parse(decoder.decode(bytes)) as PageMetadata;
    blocks.push(...json.blocks);
  }
  return blocks.sort((a, b) => a.reading_order - b.reading_order);
}

/**
 * Runs a full Document Intelligence job (image or PDF) against Sarvam and
 * returns the raw, reading-order-sorted page blocks. Table-vs-paragraph
 * parsing into line-item drafts happens separately (see scan-parsing.ts).
 */
export async function runDocumentIntelligence(
  source: { uri: string; type: 'image' | 'pdf' },
  language: DocLanguage,
  onPhase?: (phase: 'uploading' | 'processing') => void
): Promise<PageBlock[]> {
  const jobId = await createJob(language);

  let uploadBlob: Blob;
  let filename: string;
  if (source.type === 'pdf') {
    uploadBlob = await (await fetch(source.uri)).blob();
    filename = 'document.pdf';
  } else {
    const bytes = new Uint8Array(await (await fetch(source.uri)).arrayBuffer());
    const zipped = zipSync({ 'scan.jpg': bytes });
    uploadBlob = new Blob([zipped], { type: 'application/zip' });
    filename = 'scan.zip';
  }

  onPhase?.('uploading');
  await uploadFile(jobId, filename, uploadBlob);
  await startJob(jobId);

  onPhase?.('processing');
  const status = await waitUntilComplete(jobId);
  if (status.job_state === 'Failed') {
    throw new Error('Sarvam OCR job failed');
  }

  const zipBytes = await downloadOutputZip(jobId);
  return extractPageMetadataBlocks(zipBytes);
}
