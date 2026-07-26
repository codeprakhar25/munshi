import { create } from 'zustand';

import type { Draft } from '@/agent/types';

export type ScanEntry = 'onboarding' | 'general';
export type ScanSourceType = 'image' | 'pdf';
/** Full ladder from Doc Intelligence + OCR pipeline (HANDOFF-OCR §5.3). */
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
  /** One Draft per person card (itemized lines live on `draft.items`). */
  drafts: Draft[];
  setSource: (uri: string, type: ScanSourceType, entry: ScanEntry) => void;
  setJobId: (jobId: string) => void;
  setJobPhase: (phase: ScanJobPhase, error?: string) => void;
  setDrafts: (drafts: Draft[]) => void;
  updateDraft: (id: string, patch: Partial<Draft>) => void;
  reset: () => void;
}

const initialState = {
  entry: 'general' as ScanEntry,
  sourceUri: null,
  sourceType: null,
  jobId: null,
  jobPhase: 'idle' as ScanJobPhase,
  errorMessage: null,
  drafts: [] as Draft[],
};

export const useScanStore = create<ScanState>()((set) => ({
  ...initialState,
  setSource: (sourceUri, sourceType, entry) =>
    set({ sourceUri, sourceType, entry, jobPhase: 'idle', errorMessage: null, drafts: [] }),
  setJobId: (jobId) => set({ jobId }),
  setJobPhase: (jobPhase, errorMessage) => set({ jobPhase, errorMessage: errorMessage ?? null }),
  setDrafts: (drafts) => set({ drafts }),
  updateDraft: (id, patch) =>
    set((state) => ({
      drafts: state.drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),
  reset: () => set(initialState),
}));
