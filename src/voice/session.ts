/**
 * The turn loop, on the device: mic -> Saaras -> agent -> Bulbul -> speaker.
 *
 * Tap-to-talk keeps the mic open between turns (Saaras END_SPEECH ends each
 * utterance). Overlay API: startConversation / stopConversation / bargeIn.
 */
import { runTurn } from '@/agent/agent';
import { log } from '@/agent/sarvam';
import { newSession, type Draft, type Khata, type Session, type Stage } from '@/agent/types';
import { saveKhata } from '@/db/khata';
import { VoiceAudio } from '@/voice/audio';
import { SttSocket, TtsSocket } from '@/voice/sockets';

/**
 * Saaras sometimes delivers its final transcript slightly AFTER its own
 * END_SPEECH signal, so this cannot be zero — but every millisecond is dead air
 * the merchant feels.
 */
const END_SILENCE_MS = 400;

export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking';

export interface VoiceView {
  state: VoiceState;
  heard: string;
  reply: string;
  stage: Stage;
  drafts: Draft[];
  error: string | null;
}

export interface VoiceCallbacks {
  onView: (patch: Partial<VoiceView>) => void;
  onKhata: (k: Khata) => void;
}

export class VoiceSession {
  private readonly audio: VoiceAudio;
  private stt: SttSocket | null = null;
  private session: Session = newSession();
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  /** Held on the instance so dispose() can close a reply that is still streaming. */
  private tts: TtsSocket | null = null;
  private busy = false;
  private listening = false;
  private releasedAt = 0;

  constructor(private khata: Khata, private readonly cb: VoiceCallbacks) {
    this.audio = new VoiceAudio({
      onFrame: (b64) => this.stt?.send(b64),
      onError: (msg) => this.cb.onView({ error: msg }),
    });
  }

  setKhata(k: Khata): void { this.khata = k; }
  get conversation(): Session { return this.session; }
  get conversationSession(): Session { return this.session; }

  /** Clears pending drafts and dialogue memory — the between-demos reset. */
  resetConversation(): void {
    this.session = newSession();
    this.cb.onView({ stage: 'idle', drafts: [], heard: '', reply: '' });
  }

  // ----------------------------------------------------------- tap to talk ----

  /**
   * TAP to start, tap to stop. Between those, the mic stays open and Saaras'
   * own END_SPEECH decides when a sentence finished — so a follow-up ("हाँ")
   * needs no second tap, which is what makes a confirm-and-commit exchange feel
   * like a conversation rather than a form.
   *
   * The echo defence is now entirely the half-duplex gate (ARCHITECTURE.md §5),
   * since there is no finger-down window to lean on: frames are dropped while
   * the agent is speaking and for 250ms after it has finished playing out.
   */
  async toggle(): Promise<void> {
    if (this.listening) { await this.stop(); return; }
    await this.start();
  }

  async start(): Promise<void> {
    if (this.listening) return;

    const ok = await this.audio.prepare();
    if (!ok) return;

    this.listening = true;
    this.audio.stopPlayback();

    if (!this.stt?.live) {
      this.stt = new SttSocket({
        onOpen: () => this.cb.onView({ state: 'listening', error: null }),
        onPartial: (text) => this.cb.onView({ heard: text }),
        // In tap mode this IS the end of turn — the merchant never signals it.
        onSpeechEnd: () => { this.releasedAt = Date.now(); this.arm(); },
        onError: (msg) => this.cb.onView({ error: msg }),
        onClose: () => { if (this.listening) this.cb.onView({ state: 'idle' }); },
      });
      this.stt.connect();
    }
    this.cb.onView({ state: 'listening', heard: '', reply: '', error: null });
    await this.audio.startMic();
  }

  async stop(): Promise<void> {
    if (!this.listening) return;
    this.listening = false;
    if (this.endTimer) clearTimeout(this.endTimer);
    await this.audio.stopMic();
    this.stt?.close();
    this.stt = null;
    this.cb.onView({ state: 'idle' });
  }

  get isListening(): boolean { return this.listening; }

  private arm(): void {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.endTimer = setTimeout(() => void this.fire(), END_SILENCE_MS);
  }

  // -------------------------------------------------------------- turn ----

  /** Type instead of talk. Same machine, no audio — handy when the room is loud. */
  async say(text: string): Promise<void> {
    if (!text.trim() || this.busy) return;
    await this.turn(text.trim(), true);
  }

  private async fire(): Promise<void> {
    // Check busy BEFORE take(): take() clears the buffered transcript, so a stale
    // timer firing during an in-flight turn would swallow whatever the merchant
    // has said since, and they would just see themselves being ignored.
    if (this.busy) return;
    const text = this.stt?.take() ?? '';
    if (!text) {
      // Released without Saaras hearing anything. Without this the button stays
      // green and the status reads "listening" forever, so the merchant thinks
      // the phone is still recording them.
      if (!this.listening) this.cb.onView({ state: 'idle' });
      return;
    }
    await this.turn(text, true);
  }

  private async turn(transcript: string, speak: boolean): Promise<void> {
    this.busy = true;
    const t0 = Date.now();
    // Everything downstream is measured against release, not against this point,
    // because the END_SILENCE_MS debounce is dead air the merchant feels too.
    const sinceRelease = this.releasedAt ? t0 - this.releasedAt : null;
    let firstAudioAt = 0;
    this.cb.onView({ state: 'thinking', heard: transcript, error: null });

    // Open Bulbul NOW, in parallel with the model calls, so the handshake and
    // config round trip are already paid for by the time a sentence exists.
    let tts: TtsSocket | null = null;
    if (speak) {
      this.audio.beginSpeaking();
      tts = this.tts = new TtsSocket({
        onAudio: (bytes) => {
          if (!firstAudioAt) {
            firstAudioAt = Date.now();
            log('latency_first_audio', {
              // The number that matters: silence the merchant sits through.
              from_release_ms: this.releasedAt ? firstAudioAt - this.releasedAt : null,
              from_turn_ms: firstAudioAt - t0,
            });
          }
          this.audio.pushAudio(bytes);
        },
        onDone: () => this.audio.endSpeaking(),
        onError: (msg) => this.cb.onView({ error: msg }),
      });
      tts.warm(this.stt?.lang ?? 'hi-IN', this.audio.playbackRate);
    }

    try {
      const turn = await runTurn(transcript, this.session, this.khata, {
        lang: this.stt?.lang,
        // Paint the pending card the instant it is known, seconds before the
        // voice gets there.
        onStaged: (drafts, stage) => this.cb.onView({ drafts, stage }),
      });
      const tAgent = Date.now();

      // Only a commit changes the ledger; drafts are pending and unsaved.
      if (turn.wrote) {
        this.khata = await saveKhata(turn.khata);
        this.cb.onKhata(this.khata);
      }
      this.cb.onView({ stage: turn.stage, drafts: turn.drafts, reply: turn.reply });

      if (tts) {
        this.cb.onView({ state: 'speaking' });
        const tSpeak = Date.now();
        await tts.speak(turn.reply);
        await this.audio.waitForIdle();
        log('latency_turn', {
          debounce_ms: sinceRelease,
          route_ms: turn.timings.route_ms,
          phrase_ms: turn.timings.compose_ms,
          agent_ms: tAgent - t0,
          tts_wait_ms: firstAudioAt ? firstAudioAt - tSpeak : null,
          to_first_audio_ms: firstAudioAt && this.releasedAt ? firstAudioAt - this.releasedAt : null,
          reply_chars: turn.reply.length,
          jitter: this.audio.jitterStats,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'turn failed';
      log('turn_error', { msg });
      this.cb.onView({ error: msg });
      tts?.close();
      this.audio.stopPlayback();
    } finally {
      if (this.tts === tts) this.tts = null;
      this.busy = false;
      // Straight back to listening, so the merchant can just answer.
      this.cb.onView({ state: this.listening ? 'listening' : 'idle' });
    }
  }

  async dispose(): Promise<void> {
    this.listening = false;
    if (this.endTimer) clearTimeout(this.endTimer);
    this.stt?.close();
    // Without this, unmounting mid-reply leaves Bulbul streaming to nobody until
    // its own 25s guard fires.
    this.tts?.close();
    this.tts = null;
    await this.audio.dispose();
  }
}
