/**
 * Sarvam's streaming sockets, opened straight from the device.
 *
 * This is the file the whole no-server design rests on: Sarvam authenticates
 * WebSockets with an `api-subscription-key` HEADER, browsers cannot set one, and
 * React Native can (WebSocket.js:98 takes a third `options` arg). ARCHITECTURE.md §3.
 */
import { KEY, STT_WS, TTS_WS, log, ttsLang } from '@/agent/sarvam';
import { base64ToBytes } from '@/voice/base64';

/** RN's WebSocket takes options; the DOM lib's type does not. */
type WSCtor = new (url: string, protocols: string | string[] | null, options?: { headers: Record<string, string> }) => WebSocket;
const open = (url: string): WebSocket =>
  new (WebSocket as unknown as WSCtor)(url, null, { headers: { 'api-subscription-key': KEY } });

// ------------------------------------------------------------------ STT -----

export interface SttHandlers {
  onOpen?: () => void;
  onPartial?: (text: string, lang?: string) => void;
  /** Saaras' own turn-taking signals — free, no silence timer needed. */
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onError?: (msg: string) => void;
  onClose?: () => void;
}

export class SttSocket {
  private ws: WebSocket | null = null;
  private parts: string[] = [];
  lang = 'hi-IN';

  constructor(private readonly h: SttHandlers) {}

  connect(): void {
    const q = new URLSearchParams({
      model: 'saaras:v3',
      'language-code': 'unknown',
      mode: 'codemix',
      vad_signals: 'true',
      // high_vad_sensitivity=true makes room noise register as speech, and Saaras
      // will confidently hallucinate a plausible ledger command out of it. With a
      // confirm gate that is now a spurious CARD rather than a spurious write,
      // but it still wastes the merchant's attention. Keep it off.
      high_vad_sensitivity: 'false',
      sample_rate: '16000',
      input_audio_codec: 'pcm_s16le',
    });
    const ws = open(`${STT_WS}?${q}`);
    this.ws = ws;

    ws.onopen = () => { log('stt_open', { url: STT_WS, keyLen: KEY.length }); this.h.onOpen?.(); };
    ws.onmessage = (ev: WebSocketMessageEvent) => {
      let m: any;
      try { m = JSON.parse(String(ev.data)); } catch { return; }

      log('stt_msg', { type: m.type, sig: m.data?.signal_type, transcript: m.data?.transcript });
      if (m.type === 'data' && m.data?.transcript?.trim()) {
        this.parts.push(m.data.transcript.trim());
        if (m.data.language_code) this.lang = m.data.language_code;
        this.h.onPartial?.(this.text(), m.data.language_code);
      }
      if (m.type === 'events') {
        if (m.data?.signal_type === 'START_SPEECH') this.h.onSpeechStart?.();
        if (m.data?.signal_type === 'END_SPEECH') this.h.onSpeechEnd?.();
      }
      if (m.type === 'error') {
        log('stt_ws_error', m.data);
        this.h.onError?.(JSON.stringify(m.data).slice(0, 200));
      }
    };
    ws.onerror = (e: Event) => {
      log('stt_ws_error', { msg: String((e as any)?.message ?? e) });
      this.h.onError?.('speech connection failed');
    };
    ws.onclose = (e: WebSocketCloseEvent) => { log('stt_close', { code: e?.code, reason: e?.reason }); this.ws = null; this.h.onClose?.(); };
  }

  /** base64 PCM16 @16kHz, exactly what the recorder produces. */
  sent = 0;
  send(b64: string): void {
    if (this.ws?.readyState !== 1) {
      if (this.sent === 0) log('stt_send_dropped', { readyState: this.ws?.readyState ?? 'no socket' });
      return;
    }
    this.sent++;
    this.ws.send(JSON.stringify({ audio: { data: b64, sample_rate: '16000', encoding: 'audio/wav' } }));
  }

  text(): string { return this.parts.join(' ').replace(/\s+/g, ' ').trim(); }
  take(): string { const t = this.text(); this.parts = []; return t; }
  get live(): boolean { return this.ws?.readyState === 1; }
  close(): void { try { this.ws?.close(); } catch { /* already gone */ } this.ws = null; }
}

// ------------------------------------------------------------------ TTS -----

export interface TtsHandlers {
  /** Raw PCM16 bytes, RIFF header already stripped. */
  onAudio: (bytes: Uint8Array) => void;
  onDone: () => void;
  onError?: (msg: string) => void;
}

/**
 * Opened BEFORE the sentence exists, while the model is still thinking, so the
 * handshake and config round trip are already paid for by the time we have text.
 */
export class TtsSocket {
  private ws: WebSocket | null = null;
  private ready: Promise<void> | null = null;
  private done: Promise<void> | null = null;

  constructor(private readonly h: TtsHandlers) {}

  /** `sampleRate` should be the device's native rate — see ARCHITECTURE.md §5. */
  /**
   * `neha` — "warm female, conversational" on the v3 roster. The previous default
   * `priya` is documented as "good for product / IVR", which is precisely why it
   * reads as mechanical: it is an IVR voice.
   */
  warm(langCode: string, sampleRate: number, speaker = 'neha'): void {
    // Defaults to bulbul:v2; v3 must be asked for explicitly, and the docs'
    // example speaker `anushka` is a v2 voice that mismatches v3.
    const ws = open(`${TTS_WS}?model=bulbul:v3&send_completion_event=true`);
    this.ws = ws;

    this.done = new Promise<void>((resolve) => {
      const finish = () => { try { ws.close(); } catch { /* already gone */ } resolve(); };
      const guard = setTimeout(finish, 25000);

      ws.onmessage = (ev: WebSocketMessageEvent) => {
        let m: any;
        try { m = JSON.parse(String(ev.data)); } catch { return; }

        if (m.type === 'audio' && m.data?.audio) {
          const bytes = base64ToBytes(m.data.audio);
          // Chunk 0 is a bare 44-byte RIFF header; everything after is raw PCM16.
          if (bytes.length <= 44 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF') return;
          this.h.onAudio(bytes);
        }
        if (m.type === 'error') {
          log('tts_ws_error', m.data);
          this.h.onError?.('voice failed');
          clearTimeout(guard); this.h.onDone(); finish();
        }
        if (m.type === 'event' && m.data?.event_type === 'final') {
          clearTimeout(guard); this.h.onDone(); finish();
        }
      };
      ws.onerror = () => { clearTimeout(guard); this.h.onError?.('voice connection failed'); this.h.onDone(); finish(); };
    });

    const lang = ttsLang(langCode);
    this.ready = new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
      const bail = setTimeout(resolve, 5000);
      void bail;
    }).then(() => {
      if (ws.readyState !== 1) return;
      ws.send(JSON.stringify({
        type: 'config',
        data: {
          target_language_code: lang.code,
          speaker,
          model: 'bulbul:v3',
          speech_sample_rate: String(sampleRate),
          // wav is 163ms to first audio; mp3 is 394ms and pcm_s16le is rejected outright.
          output_audio_codec: 'wav',
          // Default 1.0 plods for a short confirmation. Range is 0.3-3.0; 1.15 is
          // brisk without clipping the rupee figures, which are the words that
          // actually have to land.
          pace: 1.15,
        },
      }));
    });
  }

  /** Hand the finished sentence to the already-warm socket. */
  async speak(text: string): Promise<void> {
    if (!text || !this.ws) { this.h.onDone(); return; }
    await this.ready;
    if (this.ws.readyState !== 1) { this.h.onDone(); return; }
    this.ws.send(JSON.stringify({ type: 'text', data: { text } }));
    this.ws.send(JSON.stringify({ type: 'flush' }));
    await this.done;
  }

  close(): void { try { this.ws?.close(); } catch { /* already gone */ } this.ws = null; }
}
