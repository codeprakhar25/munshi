/**
 * Playback jitter buffer. ARCHITECTURE.md §5.
 *
 * The browser POC scheduled each network chunk 40ms ahead and, on underrun, did
 * `nextTime = now + 0.04` — which RESTARTS the timeline. Venue WiFi delivers
 * 100-300ms of inter-arrival jitter, so that fires over and over, and that reset
 * IS the stutter people hear.
 *
 * Three rules here instead:
 *   1. Pre-roll before scheduling anything, so a late chunk has slack to land in.
 *   2. Coalesce into buffers of at least MIN_CHUNK_MS, so we schedule tens of
 *      nodes per reply rather than hundreds.
 *   3. Keep the playhead MONOTONIC. On underrun, let the gap pass as silence and
 *      keep counting; never rewind. A late chunk then lands seamlessly after the
 *      one before it instead of clipping it.
 *
 * Deliberately free of react-native-audio-api types: it takes a `schedule`
 * callback, so it can be exercised with synthetic arrival times in a test rather
 * than by listening to it.
 */

export interface JitterOptions {
  /** Audio to bank before the first buffer is scheduled. */
  prerollMs?: number;
  /** Never schedule a buffer shorter than this. */
  minChunkMs?: number;
  /** Minimum lead over the clock when scheduling, so we never schedule into the past. */
  leadMs?: number;
  sampleRate: number;
  /** Current audio-clock time, in seconds. */
  now: () => number;
  /** Hand a PCM buffer to the audio graph, to start at `at` seconds on the same clock. */
  schedule: (samples: Float32Array, at: number) => void;
}

export interface JitterStats {
  scheduled: number;
  /** Times the queue ran dry mid-reply. The number to watch: it should be 0. */
  underruns: number;
  /** Times the playhead had to be pushed forward because it fell behind the clock. */
  resets: number;
  bufferedMs: number;
}

export class JitterBuffer {
  private queue: Float32Array[] = [];
  private queued = 0;
  private playhead = 0;
  private started = false;
  private ended = false;
  readonly stats: JitterStats = { scheduled: 0, underruns: 0, resets: 0, bufferedMs: 0 };

  private readonly preroll: number;
  private readonly minChunk: number;
  private readonly lead: number;

  constructor(private readonly o: JitterOptions) {
    this.preroll = ((o.prerollMs ?? 200) / 1000) * o.sampleRate;
    this.minChunk = ((o.minChunkMs ?? 100) / 1000) * o.sampleRate;
    this.lead = (o.leadMs ?? 60) / 1000;
  }

  /** Samples as they arrive off the socket, in order. */
  push(samples: Float32Array): void {
    if (this.ended) return;
    this.queue.push(samples);
    this.queued += samples.length;
    this.stats.bufferedMs = (this.queued / this.o.sampleRate) * 1000;
    this.pump();
  }

  /** No more audio is coming; flush whatever is left, however short. */
  end(): void {
    this.ended = true;
    this.pump(true);
  }

  /** Barge-in or stop: drop everything and rewind, since nothing is playing after this. */
  reset(): void {
    this.queue = [];
    this.queued = 0;
    this.playhead = 0;
    this.started = false;
    this.ended = false;
    this.stats.bufferedMs = 0;
  }

  /** When the currently scheduled audio finishes, on the audio clock. */
  get endsAt(): number {
    return this.playhead;
  }

  private pump(flush = false): void {
    // Hold until there is a cushion — this is what buys tolerance for a late chunk.
    if (!this.started && !flush && this.queued < this.preroll) return;

    while (this.queued > 0 && (flush || this.queued >= this.minChunk)) {
      const want = flush ? this.queued : Math.max(this.minChunk, 0);
      const take = Math.min(this.queued, Math.max(want, this.minChunk));
      const buf = this.drain(take);
      if (!buf.length) break;

      const now = this.o.now();
      if (!this.started) {
        this.playhead = now + this.lead;
        this.started = true;
      } else if (this.playhead < now) {
        // We ran dry and the clock overtook us. Skip forward rather than
        // scheduling into the past — but only ever forward.
        this.stats.underruns++;
        this.stats.resets++;
        this.playhead = now + this.lead;
      }

      this.o.schedule(buf, this.playhead);
      this.playhead += buf.length / this.o.sampleRate;
      this.stats.scheduled++;
    }

    this.stats.bufferedMs = (this.queued / this.o.sampleRate) * 1000;
  }

  private drain(n: number): Float32Array {
    const out = new Float32Array(Math.min(n, this.queued));
    let off = 0;
    while (off < out.length && this.queue.length) {
      const head = this.queue[0];
      const need = out.length - off;
      if (head.length <= need) {
        out.set(head, off);
        off += head.length;
        this.queue.shift();
      } else {
        out.set(head.subarray(0, need), off);
        this.queue[0] = head.subarray(need);
        off += need;
      }
    }
    this.queued -= out.length;
    return out;
  }
}
