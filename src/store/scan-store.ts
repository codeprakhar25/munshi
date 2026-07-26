import { create } from 'zustand';

import type { Draft } from '@/agent/types';

export type ScanEntry = 'onboarding' | 'general';
export type ScanSourceType = 'image' | 'pdf';
/** Full ladder from Doc Intelligence + OCR pipeline. */
export type ScanJobPhase =
  | 'idle'
  | 'uploading'
  | 'processing'
  | 'downloading'
  | 'reading'
  | 'structuring'
  | 'matching'
  | 'done'
  | 'error';

interface ScanState {
  entry: ScanEntry;
  sourceUri: string | null;
  sourceType: ScanSourceType | null;
  jobId: string | null;
  jobPhase: ScanJobPhase;
  errorMessage: string | null;
  /** When true, next processing run appends drafts instead of replacing. */
  appendNext: boolean;
  /** One Draft per person card (itemized lines live on `draft.items`). */
  drafts: Draft[];
  setSource: (uri: string, type: ScanSourceType, entry: ScanEntry, opts?: { append?: boolean }) => void;
  setJobId: (jobId: string) => void;
  setJobPhase: (phase: ScanJobPhase, error?: string) => void;
  setDrafts: (drafts: Draft[]) => void;
  appendDrafts: (drafts: Draft[]) => void;
  updateDraft: (id: string, patch: Partial<Draft>) => void;
  clearAppendFlag: () => void;
  reset: () => void;
}

const initialState = {
  entry: 'general' as ScanEntry,
  sourceUri: null,
  sourceType: null,
  jobId: null,
  jobPhase: 'idle' as ScanJobPhase,
  errorMessage: null,
  appendNext: false,
  drafts: [] as Draft[],
};

export const useScanStore = create<ScanState>()((set) => ({
  ...initialState,
  setSource: (sourceUri, sourceType, entry, opts) =>
    set((state) => ({
      sourceUri,
      sourceType,
      entry,
      jobPhase: 'idle',
      errorMessage: null,
      appendNext: !!opts?.append,
      // Fresh scan clears cards; "add more" keeps what merchant already confirmed/edited.
      drafts: opts?.append ? state.drafts : [],
    })),
  setJobId: (jobId) => set({ jobId }),
  setJobPhase: (jobPhase, errorMessage) => set({ jobPhase, errorMessage: errorMessage ?? null }),
  setDrafts: (drafts) => set({ drafts, appendNext: false }),
  appendDrafts: (drafts) =>
    set((state) => ({ drafts: [...state.drafts, ...drafts], appendNext: false })),
  updateDraft: (id, patch) =>
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),
  clearAppendFlag: () => set({ appendNext: false }),
  reset: () => set(initialState),
}));
