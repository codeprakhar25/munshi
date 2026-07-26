/**
 * The turn loop, on the device: mic -> Saaras -> agent -> Bulbul -> speaker.
 *
 * Owns the wiring and nothing else. All money logic lives in `@/agent`, all
 * audio specifics in `@/voice/audio`, so this file stays small enough to read in
 * one sitting when something misbehaves on stage.
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
  private held = false;

  constructor(private khata: Khata, private readonly cb: VoiceCallbacks) {
    this.audio = new VoiceAudio({
      onFrame: (b64) => this.stt?.send(b64),
      onError: (msg) => this.cb.onView({ error: msg }),
    });
  }

  setKhata(k: Khata): void { this.khata = k; }
  get conversation(): Session { return this.session; }

  /** Clears pending drafts and dialogue memory — the between-demos reset. */
  resetConversation(): void {
    this.session = newSession();
    this.cb.onView({ stage: 'idle', drafts: [], heard: '', reply: '' });
  }

  // ------------------------------------------------------- hold to talk ----

  /**
   * Press. Hold-to-talk is the primary defence against the agent hearing itself
   * (ARCHITECTURE.md §5) — the mic simply is not open unless a finger is down.
   */
  async press(): Promise<void> {
    if (this.busy || this.held) return;
    this.held = true;

    const ok = await this.audio.prepare();
    if (!ok) { this.held = false; return; }

    // A quick tap can release BEFORE prepare() resolves. Without this check the
    // mic would open with no finger down and no pending release to close it —
    // which is precisely the guarantee hold-to-talk exists to provide.
    if (!this.held) return;

    // Cut any playback the moment they start talking over it.
    this.audio.stopPlayback();

    if (!this.stt?.live) {
      this.stt = new SttSocket({
        onOpen: () => this.cb.onView({ state: 'listening', error: null }),
        onPartial: (text) => this.cb.onView({ heard: text }),
        onSpeechEnd: () => this.arm(),
        onError: (msg) => this.cb.onView({ error: msg }),
        onClose: () => this.cb.onView({ state: 'idle' }),
      });
      this.stt.connect();
    }
    this.cb.onView({ state: 'listening', heard: '', reply: '', error: null });
    await this.audio.startMic();
  }

  /** Release. Give Saaras a beat to deliver its tail, then run the turn. */
  async release(): Promise<void> {
    if (!this.held) return;
    this.held = false;
    await this.audio.stopMic();
    this.arm();
  }

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
    if (!text) return;
    await this.turn(text, true);
  }

  private async turn(transcript: string, speak: boolean): Promise<void> {
    this.busy = true;
    this.cb.onView({ state: 'thinking', heard: transcript, error: null });

    // Open Bulbul NOW, in parallel with the model calls, so the handshake and
    // config round trip are already paid for by the time a sentence exists.
    let tts: TtsSocket | null = null;
    if (speak) {
      this.audio.beginSpeaking();
      tts = this.tts = new TtsSocket({
        onAudio: (bytes) => this.audio.pushAudio(bytes),
        onDone: () => this.audio.endSpeaking(),
        onError: (msg) => this.cb.onView({ error: msg }),
      });
      tts.warm(this.stt?.lang ?? 'hi-IN', this.audio.playbackRate);
    }

    try {
      const turn = await runTurn(transcript, this.session, this.khata);

      // Only a commit changes the ledger; drafts are pending and unsaved.
      if (turn.wrote) {
        this.khata = await saveKhata(turn.khata);
        this.cb.onKhata(this.khata);
      }
      this.cb.onView({ stage: turn.stage, drafts: turn.drafts, reply: turn.reply });

      if (tts) {
        this.cb.onView({ state: 'speaking' });
        await tts.speak(turn.reply);
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
      this.cb.onView({ state: this.held ? 'listening' : 'idle' });
    }
  }

  async dispose(): Promise<void> {
    if (this.endTimer) clearTimeout(this.endTimer);
    this.stt?.close();
    // Without this, unmounting mid-reply leaves Bulbul streaming to nobody until
    // its own 25s guard fires.
    this.tts?.close();
    this.tts = null;
    await this.audio.dispose();
  }
}
