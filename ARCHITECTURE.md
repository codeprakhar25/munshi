# Munshi — architecture review

**Status:** reviewed 2026-07-26 — building.
**Scope:** the voice agent (add / resolve / edit khatas). Scanner and collections are separate beats.

This is a decision record. Every entry is a choice, what it was chosen over, and why.

**Review outcome:**

- **§1 Storage — AsyncStorage: confirmed.** Building on it.
- **§6 Language — deferred.** `appLang`, the store-in-app-script rule, i18n and the
  `/transliterate` bridge are all out of this pass. This costs nothing today: Saaras already runs
  with `language-code=unknown` in codemix mode, so Hindi / English / Hinglish input works as-is,
  and the `say` tool already replies in whatever language was spoken. What we lose until later is
  only the *storage script* guarantee — a name heard in English is stored as it was heard.
  §7's contact matching therefore falls back to the `aliases` already on each row plus plain
  case/space normalization, instead of a transliterated Latin match key.
- **§3 Agent location — revised: the agent runs in the app, no server.** See §3.
- Remaining open questions (barge-in, launch language set) parked with §6.

---

## 0. What we are building

A voice loop where the shopkeeper speaks and the khata updates — but **nothing is written to the
ledger until they confirm.**

```
speak  →  DRAFT  →  resolve who  →  confirm / edit by voice  →  commit to passbook
                    (2 Rameshes?)   ("100 nahi, 150 the")
```

Three jobs, deliberately separated because today's POC collapses all three into a single immediate
write:

1. **Add** — hear the entry, stage it, show a balance preview computed by our code, not the model.
2. **Resolve** — link the spoken name to a person. Ambiguous → ask. Unknown → offer device
   contacts, or walk-in with no phone.
3. **Edit, then commit** — amend the *pending* draft by voice; only हाँ writes it.

### Why the confirm gate is a correctness feature, not UX polish

The POC (`../poc/voice-edit/README.md`, finding #4) recorded Saaras producing confident, plausible
ledger commands from a **silent** microphone — *"गोपाल ने ₹100 दियो।"* — and one of them wrote to
the ledger. A hallucination that names a real customer *and* a real amount is indistinguishable
from a real command, so no write gate can catch it. Behind a confirm step, the worst it can do is
put a line on screen that the merchant declines.

---

## 1. Storage — AsyncStorage

**Decision:** `@react-native-async-storage/async-storage`, holding one JSON blob shaped exactly
like the POC's `khata.json`.

**Over:** `expo-sqlite`, `react-native-mmkv`.

**Why.** The agent takes the whole khata as an argument on every turn regardless of how it's
stored (§3). Keeping it as a JSON document identical to the POC's `khata.json` means the headless
harness feeds the agent exactly the bytes the app does — **zero translation layer**, and the POC's
verified-working table stays a valid regression suite. Volume is tens of people and hundreds of
entries; nothing here needs an index.

`expo-sqlite` buys transactions and queries that start to matter around 10k rows, and costs a
schema, migrations, and a serialize-back-to-JSON step on every turn. None of that earns anything
today. MMKV is faster but is a third-party native module solving a speed problem we do not have.

**Revisit when** the Vision/OCR flow starts importing whole registers at once, or a merchant's book
passes a few thousand entries.

**Discipline that does not depend on the database.** The ledger is event-sourced: `entries` is
append-only and `balance` is **recomputed from entries on every write**, never mutated on its own.
That is a rule in the store module, not a feature of sqlite, and it is what makes edit and undo
safe later.

```jsonc
// one AsyncStorage key: "khata.v1"
{
  "shop": "...", "currency": "INR",
  "customers": [{
    "id": "c1", "name": "रमेश कुमार", "name_en": "Ramesh Kumar",
    "aliases": [...], "match_key": "ramesh kumar",   // normalized, for script-agnostic matching
    "phone": "+91...",                                // set when linked to a contact
    "items": "दूध, चीनी", "lang": "hi-IN",
    "balance": 500,                                   // DERIVED — sum of entries, never set directly
    "entries": [{ "ts": "...", "action": "payment", "amount": 200, "before": 500, "after": 300 }]
  }],
  "audit": [...]
}
```

---

## 2. Audio — `react-native-audio-api`

**Decision:** `react-native-audio-api` (Software Mansion).
**Over:** LiveKit, `expo-audio`.

**`expo-audio` is disqualified outright** — it records to *files*. Streaming STT needs a live PCM
stream, so there is nothing to feed the socket with.

**Why `react-native-audio-api`.** It implements Web Audio on React Native, so the browser POC ports
almost directly:

- `AudioRecorder.onAudioReady({sampleRate: 16000, bufferLength: 1600}, cb)` delivers Float32 PCM at
  exactly the rate and frame size `mic-worklet.js` already produces. The worklet becomes ~10 lines.
- Playback is `AudioContext` + `createBuffer` + `BufferSource` — the existing scheduling code moves
  across nearly verbatim.
- `WorkletNode` requires `react-native-worklets ≥ 0.6.0`. We have **0.10.0**.

**Why not LiveKit, which is the better answer on the merits.** It genuinely solves echo (WebRTC
AEC/NS/AGC), network jitter (a real jitter buffer), and barge-in. That is not in dispute. It costs a
LiveKit server plus an agent worker process and moves the turn loop out of our control. The
deciding factor is narrower than cost, though:

> **LiveKit's agent pipeline asks the LLM for a prose reply.** The POC measured that exact path on
> `sarvam-30b`: **7667ms, 6225 characters of hidden reasoning, and it never finished.** The POC is
> fast (~1500ms) only because it *forces a `say()` tool call* instead. Adopting LiveKit means
> re-fighting a fight that is already won here.

**Containment.** All of it lives behind `src/voice/audio.ts`. If we later need real AEC for
speakerphone-on-a-counter, LiveKit replaces that one file.

**Known risk, stated plainly:** Android echo cancellation is **unverified** in this library.
`AudioManager` exposes `setAudioSessionOptions` on iOS only, and the upstream issue on full-duplex
voice chat ([#670](https://github.com/software-mansion/react-native-audio-api/issues/670)) is open
with no maintainer answer. We do not depend on it — see §5.

---

## 3. Agent location — in the app. No server.

**Decision (revised 2026-07-26):** the agent runs **on the device**, in the app, talking to
`api.sarvam.ai` directly. There is no proxy process.

**Over:** the POC's Node proxy (`../poc/voice-edit/server.mjs`).

**What made this possible.** The POC needs a server for one reason only: Sarvam authenticates its
WebSockets with an `api-subscription-key` **header**, and browsers cannot set headers on a
WebSocket. React Native can — verified in this repo at
`node_modules/react-native/Libraries/WebSocket/WebSocket.js:98`:

```js
constructor(url, protocols, options: ?{headers?: {...}})
  → NativeWebSocketModule.connect(url, protocols, {headers}, this._socketId)
```

So `new WebSocket(url, null, { headers: { 'api-subscription-key': KEY } })` reaches Sarvam from the
phone. The proxy's entire reason for existing disappears.

**What we gain.** No LAN IP to configure, no cleartext-`ws://` exemption, no server process to
babysit, no laptop dependency — the app works on mobile data anywhere. And one less network hop:
the POC measured a US round trip at 250–400ms *each way*, and the proxy was adding a hop of its own.

**What it costs, plainly: the Sarvam key ships in the APK.** The POC README explicitly warns against
this, and it is the right warning for a product. It is accepted here as a **demo-stage** trade.
Before this is put in a real merchant's hands the key moves behind a thin token-issuing service —
the agent code does not change when that happens, only `sarvam.ts`'s credential source does.

**Hard rule, preserved and now more important:** the LLM classifies and the LLM phrases — **only
our code does arithmetic.** The "balance after ₹270" on a pending line is computed in `agent.ts`
and handed to the phrasing call as fact. A model doing mental math will eventually read a wrong
rupee figure aloud.

**The refactor:** `applyIntent` currently computes *and* writes in one breath. It splits into
`stageIntent` (compute, no write) / `amendDraft` / `commitDrafts` (the only writer), and `runTurn`
takes the khata as an argument rather than reading a file.

### Keeping the headless test loop

This is the POC's most valuable property and moving into the app must not cost it. So
**`src/agent/` imports nothing from `react-native`** — only `fetch` and `WebSocket`, which exist in
both runtimes. Node 24 strips TypeScript natively, so the *same* `.ts` files run under Node with no
build step and no `tsx`:

```bash
node --env-file=.env scripts/turns.ts     # scripted conversation, no phone, no mic
```

That boundary is load-bearing. A single `react-native` import inside `src/agent/` breaks headless
testing, which is how every finding in the POC README was found.

---

## 4. Structured output — state-scoped tool schemas

**Decision:** every model call is a forced tool call, and **which schema we send depends on
conversation state.**

**Over:** regex intent matching, prose replies, `response_format: json_object`.

**Why not prose.** `sarvam-30b` is a reasoning model. Asked for JSON in prose it fills
`reasoning_content` with 3000–6000 characters, leaves `content` null, and hits
`finish_reason: "length"` without answering. Measured:

| approach | latency | hidden thinking | result |
|---|---|---|---|
| "reply with JSON only" | ~2500ms | ~2900 chars | usually **fails** |
| plain prose reply | 7667ms | 6225 chars | **never finished** |
| **tool schema** | **531ms** | 372 chars | clean |

`reasoning_effort`, `thinking:false`, `response_format`, and assistant-prefill were all tested and
all failed. A tool schema is the only thing that reins it in.

**Why not regex.** The HTML mock resolves confirmation with `isYes` / `isNo` regexes. That breaks on
the single most important sentence in this feature:

> *"रमेश ने 100 नहीं 150 दिए थे"* contains **नहीं**, so a regex reads an **amend** as a **rejection**.

**The state machine:**

```
IDLE ──────speak───────►  apply_ledger_actions   { actions[] }        ← stages, does not write
                            │
        needs person?  ──►  pick_person          { customer_id | contact_id | new_walk_in }
        needs amount?  ──►  supply_amount        { amount }
        complete       ──►  resolve_draft        { confirm | reject | amend | new_command }
                                                   amend: { target_line, field, value }
```

`resolve_draft`'s `new_command` escape hatch matters — merchants abandon a confirm and start a
different sentence.

**One tool with an array, never parallel tool calls.** Given five separate tools and a
three-action sentence, the POC measured:

| | calls returned |
|---|---|
| `sarvam-30b`, separate tools | **0** |
| `sarvam-105b`, separate tools | **1 of 3** — silently dropped the rest |
| either model, one `actions[]` tool | **3/3 correct** |

The 105b behaviour is the dangerous one: in a ledger, silently dropping actions is invisible data
loss. Hence a single `actions[]` array everywhere.

Multi-action therefore keeps working end to end: a three-customer sentence stages **three draft
lines under one lock**, and an amend targets a line by name (*"गोपाल वाला 100 नहीं 150"*).

---

## 5. Echo and jitter on a phone speaker

Two distinct problems that get conflated.

### Echo — mic hears our own voice

**Primary defence is the interaction model:** hold-to-talk. The mic is only open while the button is
held, so the merchant physically cannot be recording while the agent talks. This is also the POC's
recommendation for noisy rooms.

**Safety net:** a client-side half-duplex gate for the case where they hold the button while audio
is still playing out. Frames are **dropped, not queued**, from `speak_start` until
`scheduledPlaybackEnd + 250ms` — queuing would just replay the echo late. The gate is client-side
because only the client knows when audio truly finishes: `audio_end` fires when the last *chunk
arrives*, well before it plays.

Plus `high_vad_sensitivity=false` (already set), and iOS `playAndRecord` / `voiceChat` /
`defaultToSpeaker` so hardware AEC engages where it exists. **We do not depend on Android AEC** —
see the risk in §2.

**Cost:** no barge-in. Acceptable: replies are capped at ≤8 words for single actions.

### Jitter — the audio stutters

This is not vague. The browser POC schedules playback with **40ms of lead**, and on underrun does:

```js
if (nextTime < now) nextTime = now + 0.04;   // ← restarts the timeline
```

Venue WiFi delivers 100–300ms of inter-arrival jitter, so this fires repeatedly. **That reset is the
stutter.** The fix is a real jitter buffer:

- **Pre-roll** ~200ms before scheduling anything — invisible against a 2.3–4.3s turn.
- **Coalesce** into ≥100ms buffers rather than one `BufferSource` per network chunk.
- **Monotonic playhead** — schedule at `max(playhead, currentTime + LEAD)`; on underrun insert
  silence for the gap and **never reset**, so a late chunk lands seamlessly instead of clipping.
- **Match the device sample rate.** The POC forces `AudioContext({sampleRate: 22050})`; Android is
  natively 48000, which pushes a resample into the audio graph. Open at the device rate and request
  `speech_sample_rate: 48000` from Bulbul.
- Coalesce Bulbul's bursty frames to ~120ms as they arrive, before handing them to the scheduler.

Isolated in `src/voice/jitter.ts` so it is testable with synthetic arrival times rather than by
listening to it.

---

## 6. Language — app language ≠ spoken language  ⏸ DEFERRED

> **Not in this pass.** Kept here as the agreed target. What ships now is Saaras auto-detect
> (`language-code=unknown`, codemix) with the reply in whatever language was spoken — already
> verified working across Hindi, English and Hinglish, and requiring no work. The rest of this
> section lands when we pick it up.

| | source | drives |
|---|---|---|
| **`appLang`** | picked once, persisted | UI strings, **the script names and items are stored in**, number formatting |
| **`spokenLang`** | Saaras `language_code`, per turn | the reply sentence and the Bulbul voice |

Worked example — app set to Hindi, merchant speaks English:

> *"add Rakesh, three hundred udhaar"* → agent replies **in English** → row stored as
> **राकेश**, with `name_en: "Rakesh"`.

The bridge is Sarvam `/transliterate` (23 languages): one call into `appLang` for the display name,
one into `en-IN` for the match key. The reply side needs no change — the `say` tool already
instructs "SAME language and script the merchant used".

**Launch languages:** hi / en / mr / ta. All four are valid Bulbul voices.

**Bulbul has no Urdu** (11 languages: en, hi, bn, ta, te, gu, kn, ml, mr, pa, od) while Saaras STT
*does* support `ur-IN` — the two are not symmetric. `ttsLang()` falls back to Hindi, and the
fallback must be **reported**, not swallowed. The main HTML prototype currently sends `ur-IN` to
Bulbul for Abdul; that call fails silently behind a bare `catch`.

**i18n:** a typed TypeScript module, not `i18n-js`. ~40 keys with a few interpolating functions;
a library adds a dependency and a runtime for something a `Record` and a lookup function do, and a
typed dictionary catches missing keys at compile time.

---

## 7. Contacts — `expo-contacts` + a match key

**Decision:** normalize every name — khata rows, device contacts, the spoken token — to a single
`match_key` and compare on that.

**Over:** fuzzy string matching on the display names.

**Why.** The merchant may speak English while their book is in Devanagari. Direct comparison across
scripts fails at 100%, and fuzzy matching across scripts is meaningless. Normalizing both sides to
one form makes it an ordinary comparison.

**Now (language deferred):** the key is built from the `aliases` already carried on each row — the
seed data lists each customer in both scripts — plus lowercase/trim normalization. Good enough
because the roster is handed to the model every turn, so the *model* does most of the matching;
`match_key` is the deterministic backstop.

**Later (with §6):** build the key with Sarvam `/transliterate` → `en-IN`, cached per contact, so
it costs one call per new contact rather than one per turn. That's what makes an English-spoken
name find a Devanagari row without the alias having been written down in advance.

**Resolution order:**

| khata matches | behaviour |
|---|---|
| exactly 1 | stage straight to confirm |
| >1 | speak the choice (*"दो रमेश हैं — जोशी या शर्मा?"*) and accept **"शर्मा वाला" by voice** |
| 0 | offer device-contact matches, or walk-in with no phone |

Linking writes `phone` onto the person row. That is the step that turns a static ledger into
something that can remind and collect later.

---

## 8. Styling — NativeWind

**Decision:** NativeWind `className`. It is already wired (`src/global.css`, `metro.config.js`,
`nativewind-env.d.ts`, NativeWind 5 preview + Tailwind 4).
**Over:** `StyleSheet.create`.

Mixing both is the actual failure mode, so: utility classes only, no `StyleSheet` in new code.

**For this phase the UI is deliberately throwaway** — one screen, a plain list, plain pressables,
plain text. No avatar, no cards, no animations. The HTML mock is a spec for *what state exists*,
not what it looks like. The design overhaul comes after the machinery works.

---

## 9. Module boundaries

The layering exists so the later UI overhaul is cheap. **Test of whether it was drawn correctly:
the redesign should touch only `src/app/*` and new `src/components/*`.** If it needs changes inside
`voice/`, `db/` or `state/`, these boundaries were wrong.

```
src/
  agent/sarvam.ts    Sarvam client — fetch + WebSocket, verbatim logging   ┐ NO react-native
  agent/agent.ts     draft machine, tool schemas, all arithmetic           │ imports — these
  agent/types.ts     khata / draft / message shapes                        ┘ run under Node too
  voice/audio.ts     AudioRecorder, AudioContext, mic gate   ← the file LiveKit would replace
  voice/jitter.ts    buffer + scheduling (unit-testable)
  voice/session.ts   wires audio ↔ agent ↔ store; owns the stage machine
  db/khata.ts        AsyncStorage store, append-only entries, derived balance
  contacts.ts        expo-contacts + match key
  app/index.tsx      the entire (throwaway) UI for now
  i18n/              ⏸ deferred with §6
scripts/turns.ts     headless harness — imports src/agent/* directly
```

**The `agent/` boundary is a rule, not a convention:** nothing in it may import `react-native`,
`expo-*`, or any Node built-in. That is what keeps `scripts/turns.ts` runnable and the money logic
testable without a phone.

---

## 10. Native dependencies — one rebuild

A build is already live on device and reloads JS instantly, but **it will not pick up native
modules.** Every dep discovered later costs another build cycle, so the full list is pinned here
and we rebuild **once**:

| package | native? | for |
|---|---|---|
| `react-native-audio-api` | yes | mic capture + playback |
| `@react-native-async-storage/async-storage` | yes | the khata |
| `expo-contacts` | yes | contact linking |

`expo-localization` is dropped from this pass — it existed only to guess a default `appLang` (§6).

**Permissions:** `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`,
`READ_CONTACTS`. Call `AudioManager.requestRecordingPermissions()` and
`setAudioSessionActivity(true)` before the first frame.

---

## 11. Known risks

| risk | mitigation | residual |
|---|---|---|
| **Sarvam key ships in the APK** (§3) | accepted as a demo-stage trade; isolated in `sarvam.ts` so only its credential source changes later | anyone with the APK can extract the key — rotate after the demo |
| Android AEC unverified in `react-native-audio-api` | hold-to-talk + half-duplex gate; never depend on AEC | speakerphone-on-counter needs LiveKit eventually |
| Saaras hallucinates commands from non-speech audio | confirm gate — nothing writes unattended | a merchant confirming without reading |
| `sarvam-105b` silently drops actions | single `actions[]` tool everywhere | keep verbatim logging to catch regressions |
| A `react-native` import creeps into `src/agent/` | headless harness breaks loudly on the next run | none if `scripts/turns.ts` is run regularly |
| Bulbul has no Urdu | `ttsLang()` falls back to Hindi and **reports** it | Urdu-speaking customers hear a Hindi voice |

**Keep the verbatim request/response logging in `sarvam.mjs`.** Every finding cited in this document
came from reading raw bodies, and the dropped-actions failure is *silent and involves wrong money*.
Inside a framework's abstraction it would have been much harder to catch.

---

## Parked

1. ~~AsyncStorage vs `expo-sqlite`~~ — **settled: AsyncStorage.** Revisit when the OCR flow starts
   importing whole registers.
2. **Barge-in** — §5 trades it away for echo safety. Worth revisiting if the demo wants an
   interrupt moment.
3. **Launch languages** — hi / en / mr / ta from the mock. Cheap for STT; each needs its own i18n
   strings, so it lands with §6.
4. ~~Where the server runs on demo day~~ — **moot: there is no server** (§3). The app talks to
   `api.sarvam.ai` directly, so it works on mobile data with no laptop present.
