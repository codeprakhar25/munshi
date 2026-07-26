/**
 * Mic capture and playback. THE file LiveKit would replace — everything
 * platform-specific about audio is contained here (ARCHITECTURE.md §2).
 *
 * Two things worth knowing before editing:
 *
 *  - The recorder is asked for 16kHz because that is the only rate Saaras takes.
 *    Playback runs at the DEVICE's native rate instead, and Bulbul is asked to
 *    synthesise at that rate, so nothing resamples inside the audio graph.
 *  - `transmit` is the half-duplex gate. While the agent is speaking, mic frames
 *    are DROPPED, not queued — queuing would replay the echo a second later.
 */
import { AudioContext, AudioManager, AudioRecorder } from 'react-native-audio-api';

import { log } from '@/agent/sarvam';
import { bytesToBase64, floatToPcm16, pcm16ToFloat } from '@/voice/base64';
import { JitterBuffer } from '@/voice/jitter';

/** Saaras accepts 16kHz PCM16 and nothing else. */
export const MIC_RATE = 16000;
/**
 * Bulbul rejects anything outside {8000, 16000, 22050, 24000} with a 400 — so the
 * "match the device's native rate" idea does not survive contact: phones report
 * 48000. 24000 is the best it offers, and the platform resamples on output.
 */
export const TTS_RATE = 24000;
/** 100ms per frame, same cadence the POC's AudioWorklet posted at. */
const MIC_FRAME = 1600;
/** How long after playback ends before the mic is trusted again. */
const GATE_TAIL_MS = 250;

export interface AudioHandlers {
  /** base64 PCM16 @16kHz, ready for the STT socket. */
  onFrame: (b64: string) => void;
  onError?: (msg: string) => void;
}

export class VoiceAudio {
  private recorder: AudioRecorder | null = null;
  private ctx: AudioContext | null = null;
  private jitter: JitterBuffer | null = null;
  private gateTimer: ReturnType<typeof setTimeout> | null = null;
  private frames = 0;
  private gated = 0;

  /** False while the agent is speaking — see the half-duplex note above. */
  private transmit = true;
  private recording = false;
  private idleWaiters: Array<() => void> = [];

  readonly playbackRate: number;
  readonly deviceRate: number;

  constructor(private readonly h: AudioHandlers) {
    // Bulbul caps at 24kHz, so the graph runs at whatever Bulbul can actually
    // synthesise. Reported here for the record; see TTS_RATE above.
    this.deviceRate = AudioManager.getDevicePreferredSampleRate() || 48000;
    this.playbackRate = TTS_RATE;
    log('audio_rates', { device: this.deviceRate, playback: this.playbackRate, mic: MIC_RATE });
  }

  // ------------------------------------------------------------ session ----

  async prepare(): Promise<boolean> {
    try {
      const status = await AudioManager.requestRecordingPermissions();
      log('mic_permission', { status });
      if (status !== 'Granted') {
        this.h.onError?.('Microphone permission denied');
        return false;
      }
      // iOS only. voiceChat routes through VoiceProcessingIO, which is where
      // hardware echo cancellation lives. Android AEC is not exposed by this
      // library at all — which is exactly why the gate above carries the load.
      AudioManager.setAudioSessionOptions({
        iosCategory: 'playAndRecord',
        iosMode: 'voiceChat',
        iosOptions: ['defaultToSpeaker', 'allowBluetooth'],
      } as Parameters<typeof AudioManager.setAudioSessionOptions>[0]);
      await AudioManager.setAudioSessionActivity(true);
      return true;
    } catch (e) {
      this.h.onError?.(e instanceof Error ? e.message : 'audio session failed');
      return false;
    }
  }

  // ---------------------------------------------------------------- mic ----

  async startMic(): Promise<void> {
    if (this.recording) return;
    const rec = this.recorder ?? new AudioRecorder();
    this.recorder = rec;

    rec.onAudioReady({ sampleRate: MIC_RATE, bufferLength: MIC_FRAME, channelCount: 1 }, (ev) => {
      // Dropped, never buffered: a queued frame would be echo arriving late.
      if (!this.transmit) { this.gated++; return; }
      try {
        const pcm = ev.buffer.getChannelData(0);
        // Peak level, so a silent/dead mic is distinguishable from a broken socket.
        let peak = 0;
        for (let i = 0; i < pcm.length; i++) { const a = pcm[i] < 0 ? -pcm[i] : pcm[i]; if (a > peak) peak = a; }
        if (this.frames % 10 === 0) log('mic_frame', { n: this.frames, samples: pcm.length, peak: Number(peak.toFixed(3)) });
        this.frames++;
        this.h.onFrame(bytesToBase64(floatToPcm16(pcm)));
      } catch (e) {
        this.h.onError?.(e instanceof Error ? e.message : 'mic frame failed');
      }
    });

    const started = await rec.start();
    this.recording = true;
    log('mic_start', { rate: MIC_RATE, frame: MIC_FRAME, playbackRate: this.playbackRate, started });
    this.frames = 0;
  }

  async stopMic(): Promise<void> {
    if (!this.recording) return;
    this.recording = false;
    log('mic_stop', { frames: this.frames, gated: this.gated });
    try {
      this.recorder?.clearOnAudioReady();
      await this.recorder?.stop();
    } catch {
      /* stopping an already-stopped recorder is not an error worth surfacing */
    }
  }

  get isRecording(): boolean { return this.recording; }

  // ----------------------------------------------------------- playback ----

  private context(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: this.playbackRate });
    return this.ctx;
  }

  /** Called when the reply starts generating: close the gate and arm the buffer. */
  beginSpeaking(): void {
    this.setTransmit(false);
    const ctx = this.context();
    this.jitter = new JitterBuffer({
      // Bulbul generates roughly at speaking speed, so early chunks can arrive
      // slower than they play out — that is the gapping. A deeper cushion costs
      // a little latency once, at the start, and removes the dropouts entirely.
      prerollMs: 400,
      minChunkMs: 150,
      sampleRate: this.playbackRate,
      now: () => ctx.currentTime,
      schedule: (samples, at) => {
        const buf = ctx.createBuffer(1, samples.length, this.playbackRate);
        buf.copyToChannel(samples, 0);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(at);
      },
    });
  }

  /** Raw PCM16 straight off the Bulbul socket. */
  pushAudio(bytes: Uint8Array): void {
    this.jitter?.push(pcm16ToFloat(bytes));
  }

  /**
   * No more audio is coming. Reopen the mic only once the buffered audio has
   * actually PLAYED OUT — the socket finishing is not the same moment, and
   * reopening early is how the mic hears the tail of our own voice.
   */
  endSpeaking(): void {
    const j = this.jitter;
    if (!j) { this.setTransmit(true); return; }
    j.end();

    const ctx = this.context();
    const remainingMs = Math.max(0, (j.endsAt - ctx.currentTime) * 1000);
    if (this.gateTimer) clearTimeout(this.gateTimer);
    this.gateTimer = setTimeout(() => this.setTransmit(true), remainingMs + GATE_TAIL_MS);
  }

  /** Barge-in or hard stop. */
  stopPlayback(): void {
    this.jitter?.reset();
    this.jitter = null;
    if (this.gateTimer) clearTimeout(this.gateTimer);
    this.setTransmit(true);
  }

  setTransmit(on: boolean): void {
    if (this.transmit !== on) log('mic_gate', { open: on });
    this.transmit = on;
    if (on && this.idleWaiters.length) {
      const waiters = this.idleWaiters;
      this.idleWaiters = [];
      for (const w of waiters) w();
    }
  }

  /** Resolves when playback gate reopens (safe to listen again). */
  waitForIdle(): Promise<void> {
    if (this.transmit) return Promise.resolve();
    return new Promise((resolve) => { this.idleWaiters.push(resolve); });
  }

  get jitterStats() { return this.jitter?.stats ?? null; }

  async dispose(): Promise<void> {
    if (this.gateTimer) clearTimeout(this.gateTimer);
    await this.stopMic();
    this.stopPlayback();
    try { await this.ctx?.close(); } catch { /* already closed */ }
    this.ctx = null;
  }
}
