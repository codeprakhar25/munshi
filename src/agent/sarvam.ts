/**
 * Thin, verbatim-logging client for the Sarvam primitives we use.
 * Nothing here knows what a khata is — that lives in agent.ts.
 *
 * No `react-native`, `expo-*` or Node imports: only `fetch` and `WebSocket`,
 * which exist in both runtimes. See ARCHITECTURE.md §3.
 */

export const BASE = 'https://api.sarvam.ai';
export const STT_WS = 'wss://api.sarvam.ai/speech-to-text/ws';
export const TTS_WS = 'wss://api.sarvam.ai/text-to-speech/ws';

/**
 * `EXPO_PUBLIC_` is inlined into the bundle at build time, and `node --env-file=.env`
 * puts the same name on `process.env` — so one variable serves the app and the
 * headless harness.
 *
 * This ships the key in the APK. That is a recorded, accepted demo-stage trade
 * (ARCHITECTURE.md §3 and the risk table); when it moves behind a token service,
 * this constant is the only thing that changes.
 */
export const KEY: string = process.env.EXPO_PUBLIC_SARVAM_API_KEY ?? '';

/** WebSocket auth is a header. React Native can set one; browsers cannot. */
export const wsOptions = () => ({ headers: { 'api-subscription-key': KEY } });

// ------------------------------------------------------------- logging -----

export interface LogRow {
  t: string;
  kind: string;
  payload: unknown;
}

/**
 * Every partner exchange is kept verbatim. This is not debug scaffolding: the
 * POC's finding that sarvam-105b *silently drops* ledger actions was only
 * catchable by reading raw bodies, and it fails quietly with wrong money.
 * Keep this even when it feels redundant.
 */
const RING: LogRow[] = [];
const RING_MAX = 400;

/**
 * Defaults to the console so the app is debuggable at all — on device this is
 * the only way any of this traffic reaches logcat. The Node harness replaces it
 * with a file writer. Leaving it null means a silent app and blind debugging.
 */
const consoleSink = (row: LogRow) => {
  const body = typeof row.payload === 'string' ? row.payload : JSON.stringify(row.payload);
  console.log(`[sarvam] ${row.kind} ${body.slice(0, 600)}`);
};

export let sink: ((row: LogRow) => void) | null = consoleSink;
export const setSink = (fn: ((row: LogRow) => void) | null) => { sink = fn; };

export function log(kind: string, payload: unknown): void {
  const row: LogRow = { t: new Date().toISOString(), kind, payload };
  RING.push(row);
  if (RING.length > RING_MAX) RING.shift();
  try {
    sink?.(row);
  } catch {
    /* logging must never break a turn */
  }
}

export const recentLog = (n = 50): LogRow[] => RING.slice(-n);

// ---------------------------------------------------------------- http -----

async function post<T>(path: string, body: unknown): Promise<T> {
  log('req', { path, body });
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'api-subscription-key': KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  log('res', { path, status: r.status, body: text.slice(0, 4000) });

  if (!r.ok) throw new Error(`Sarvam ${path} -> ${r.status}: ${text.slice(0, 400)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Sarvam ${path} returned non-JSON: ${text.slice(0, 200)}`);
  }
}

// ---------------------------------------------------------------- chat -----

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ToolSchema {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export type ToolChoice = 'auto' | 'none' | { type: 'function'; function: { name: string } };

export interface ToolCall<A = Record<string, unknown>> {
  tool: string;
  args: A;
}

interface ChatResponse {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
      tool_calls?: { function: { name: string; arguments: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  tool_choice?: ToolChoice;
  /** Shows up in llm_timing so you can tell which call is slow. */
  label?: string;
}

/**
 * Tool-calling. Undocumented — `tools`/`tool_choice` appear nowhere in Sarvam's
 * published request schema — but verified on sarvam-30b and sarvam-105b, and it
 * is the ONLY reliable way to get structured output from these models: asked in
 * prose they burn 6000+ chars of hidden reasoning and often never answer at all.
 *
 * Returns ALL tool calls, because one utterance can legitimately be several
 * ledger actions in opposite directions.
 */
export async function chatTools<A = Record<string, unknown>>(
  messages: ChatMessage[],
  tools: ToolSchema[],
  { model = 'sarvam-30b', temperature = 0, max_tokens = 900, tool_choice = 'auto', label = 'chat' }: ChatOptions = {},
): Promise<ToolCall<A>[]> {
  const t0 = Date.now();
  const data = await post<ChatResponse>('/v1/chat/completions', {
    model, messages, tools, tool_choice, temperature, max_tokens,
  });
  const msg = data?.choices?.[0]?.message;
  // Reasoning length is the dial that actually moves latency on these models —
  // they think in hidden tokens you pay wall-clock for but never see.
  log('llm_timing', {
    label,
    ms: Date.now() - t0,
    prompt_chars: messages.reduce((n, m) => n + m.content.length, 0),
    reasoning_chars: (msg?.reasoning_content ?? '').length,
    prompt_tokens: data?.usage?.prompt_tokens,
    completion_tokens: data?.usage?.completion_tokens,
    finish: data?.choices?.[0]?.finish_reason,
  });
  const calls = msg?.tool_calls ?? [];
  if (!calls.length) {
    // Observed on device: after a long reasoning burn the model emits a
    // perfectly correct tool call as TEXT in `content` instead of in
    // `tool_calls`, and hits the token cap on the way —
    //   content: [{"name":"resolve_draft","parameters":{"decision":"amend",…}}]
    // Discarding that costs a correct answer and a ~40s retry, so parse it.
    const salvaged = salvageToolCall<A>(msg?.content ?? '', tools);
    log('no_tool_call', {
      finish: data?.choices?.[0]?.finish_reason,
      reasoning_chars: (msg?.reasoning_content ?? '').length,
      salvaged: salvaged.length,
    });
    return salvaged;
  }
  return calls.map((c) => {
    let args = {} as A;
    try {
      args = JSON.parse(c.function.arguments || '{}') as A;
    } catch {
      log('bad_tool_args', { raw: c.function.arguments });
    }
    return { tool: c.function.name, args };
  });
}

/**
 * Pull a tool call out of a prose/JSON `content` body. Only accepts names the
 * caller actually offered, so a hallucinated function name is still rejected.
 */
function salvageToolCall<A>(content: string, tools: ToolSchema[]): ToolCall<A>[] {
  if (!content.includes('{')) return [];
  const names = new Set(tools.map((t) => t.function.name));
  const out: ToolCall<A>[] = [];

  // Try progressively smaller slices: the tail is often truncated mid-object.
  const start = content.indexOf('[') >= 0 ? content.indexOf('[') : content.indexOf('{');
  for (let end = content.length; end > start; end--) {
    const slice = content.slice(start, end).trim();
    if (!/[\]}]$/.test(slice)) continue;
    try {
      const parsed = JSON.parse(slice);
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        const name = item?.name ?? item?.function?.name;
        const args = item?.parameters ?? item?.arguments ?? item?.function?.arguments;
        if (!name || !names.has(name)) continue;
        out.push({ tool: name, args: (typeof args === 'string' ? JSON.parse(args) : args ?? {}) as A });
      }
      if (out.length) return out;
    } catch {
      /* keep shrinking */
    }
  }
  return out;
}

// ----------------------------------------------------------------- tts -----

/** REST TTS. The safety net if the streaming socket misbehaves mid-demo. */
export async function ttsRest(
  text: string,
  target_language_code: string,
  speaker = 'priya',
  speech_sample_rate = 22050,
): Promise<string | null> {
  const data = await post<{ audios?: string[] }>('/text-to-speech', {
    text: text.slice(0, 2500),
    target_language_code,
    model: 'bulbul:v3',
    speaker,
    pace: 1.0,
    speech_sample_rate,
  });
  return data?.audios?.[0] ?? null;
}

/**
 * Bulbul speaks 11 languages — Urdu is NOT one of them, while Saaras STT *does*
 * accept ur-IN, so the two are not symmetric. Report the downgrade rather than
 * swallowing it: the main HTML prototype sends ur-IN to Bulbul and the call fails
 * silently behind a bare catch.
 */
const TTS_OK = new Set([
  'en-IN', 'hi-IN', 'bn-IN', 'ta-IN', 'te-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'pa-IN', 'od-IN',
]);

export function ttsLang(code: string | undefined | null): { code: string; fellBack: boolean } {
  if (code && TTS_OK.has(code)) return { code, fellBack: false };
  log('tts_lang_fallback', { requested: code, using: 'hi-IN' });
  return { code: 'hi-IN', fellBack: true };
}
