import { create } from 'zustand';

export type ScanEntry = 'onboarding' | 'general';
export type ScanSourceType = 'image' | 'pdf';
export type ScanJobPhase = 'idle' | 'uploading' | 'processing' | 'parsing' | 'done' | 'error';

export interface ScanLineDraft {
  id: string;
  rawText: string;
  date: string | null;
  particulars: string;
  amount: number | null;
  type: 'credit' | 'payment';
  nameToken: string | null;
  matchedPersonId: string | null;
  matchState: 'auto' | 'unresolved' | 'confirmed';
  confirmed: boolean;
}

interface ScanState {
  entry: ScanEntry;
  sourceUri: string | null;
  sourceType: ScanSourceType | null;
  jobId: string | null;
  jobPhase: ScanJobPhase;
  errorMessage: string | null;
  drafts: ScanLineDraft[];
  setSource: (uri: string, type: ScanSourceType, entry: ScanEntry) => void;
  setJobId: (jobId: string) => void;
  setJobPhase: (phase: ScanJobPhase, error?: string) => void;
  setDrafts: (drafts: ScanLineDraft[]) => void;
  updateDraft: (id: string, patch: Partial<ScanLineDraft>) => void;
  reset: () => void;
}

const initialState = {
  entry: 'general' as ScanEntry,
  sourceUri: null,
  sourceType: null,
  jobId: null,
  jobPhase: 'idle' as ScanJobPhase,
  errorMessage: null,
  drafts: [] as ScanLineDraft[],
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
