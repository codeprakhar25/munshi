# Munshi — architecture review

**Status:** proposed, for review. No implementation until this is signed off.
**Date:** 2026-07-26 · **Scope:** the voice agent (add / resolve / edit khatas). Scanner and
collections are separate beats.

This is a decision record. Every entry is a choice, what it was chosen over, and why. Disagree with
any row and the code that depends on it hasn't been written yet.

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

1. **Add** — hear the entry, stage it, show a server-computed balance preview.
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

**Why.** The khata is serialized and sent to the agent on every turn regardless of how it's stored.
Keeping it as a JSON document identical to `khata.json` means the POC's existing headless tests
(`e2e.mjs`, `test-turns.mjs`) run against real app data with **zero translation layer** — that is
the whole argument. Volume is tens of people and hundreds of entries; nothing here needs an index.

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
  "shop": "...", "currency": "INR", "appLang": "hi-IN",
  "customers": [{
    "id": "c1", "name": "रमेश कुमार", "name_en": "Ramesh Kumar",
    "aliases": [...], "match_key": "ramesh kumar",   // Latin, for script-agnostic matching
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
almost directly and, critically, **the server does not change at all**:

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

## 3. Agent location — server-side, stateless per turn

**Decision:** the agent (`../poc/voice-edit/agent.mjs`) keeps running in Node. The app sends the
khata up with each turn; the server returns drafts or the mutated khata and holds no state.

**Over:** running the agent on-device.

**Why.** Two reasons, one hard and one practical.

1. **The Sarvam key must never ship in the APK.** React Native *can* set WebSocket headers, so
   talking to Sarvam directly from the phone is technically possible and is exactly the wrong move.
2. Stateless means a server restart mid-demo costs nothing, and the same `agent.mjs` stays testable
   headlessly with no phone attached.

The refactor this requires: `applyIntent` currently computes *and* writes in one breath. It splits
into `stageIntent` (compute, no write) / `amendDraft` / `commitDrafts` (the only writer), and
`runTurn` takes the khata as an argument instead of reading it off disk.

**Hard rule, preserved:** the LLM classifies and the LLM phrases — **only the server does
arithmetic.** The "balance after ₹270" on a pending line is server-computed and handed to the
phrasing call as fact. A model doing mental math will eventually read a wrong rupee figure aloud.

**Deployment note:** if the server ever leaves the laptop, host it in `ap-south-1`. A US hop was
measured at 250–400ms *each way* — larger than any model-side optimisation available to us.

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
- Server-side, coalesce Bulbul's bursty frames to ~120ms before forwarding.

Isolated in `src/voice/jitter.ts` so it is testable with synthetic arrival times rather than by
listening to it.

---

## 6. Language — app language ≠ spoken language

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

## 7. Contacts — `expo-contacts` + a Latin match key

**Decision:** normalize every name — khata rows, device contacts, the spoken token — to a Latin
`match_key` via Sarvam `/transliterate` → `en-IN`, cached per contact. Match on that.

**Over:** fuzzy string matching on the display names.

**Why.** The merchant may speak English while their book is in Devanagari. Direct string comparison
across scripts fails at 100%, and fuzzy matching across scripts is meaningless. Transliterating both
sides to one script makes it an ordinary comparison. Cached, so it costs one call per new contact,
not one per turn.

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
  voice/audio.ts     AudioRecorder, AudioContext, mic gate   ← the file LiveKit would replace
  voice/jitter.ts    buffer + scheduling (unit-testable)
  voice/socket.ts    ws client + message protocol
  db/khata.ts        AsyncStorage store, append-only entries, derived balance
  contacts.ts        expo-contacts + cached Latin match key
  state/session.ts   client mirror of the draft machine — what the UI binds to
  i18n/              typed string dictionary
  app/index.tsx      the entire (throwaway) UI for now
```

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
| `expo-localization` | yes | default `appLang` guess |

**Permissions:** `RECORD_AUDIO`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MICROPHONE`,
`READ_CONTACTS`. Call `AudioManager.requestRecordingPermissions()` and
`setAudioSessionActivity(true)` before the first frame.

---

## 11. Known risks

| risk | mitigation | residual |
|---|---|---|
| Android AEC unverified in `react-native-audio-api` | hold-to-talk + half-duplex gate; never depend on AEC | speakerphone-on-counter needs LiveKit eventually |
| Saaras hallucinates commands from non-speech audio | confirm gate — nothing writes unattended | a merchant confirming without reading |
| `sarvam-105b` silently drops actions | single `actions[]` tool everywhere | keep verbatim logging to catch regressions |
| Cleartext `ws://` to a LAN IP | `expo.android.usesCleartextTraffic: true` | dev-only; TLS before any real deployment |
| Bulbul has no Urdu | `ttsLang()` falls back to Hindi and **reports** it | Urdu-speaking customers hear a Hindi voice |

**Keep the verbatim request/response logging in `sarvam.mjs`.** Every finding cited in this document
came from reading raw bodies, and the dropped-actions failure is *silent and involves wrong money*.
Inside a framework's abstraction it would have been much harder to catch.

---

## Open questions for review

1. **AsyncStorage vs `expo-sqlite`** — §1 argues AsyncStorage on the "no translation layer" ground.
   If the OCR register import is landing sooner than expected, sqlite now is defensible.
2. **Barge-in** — §5 trades it away for echo safety. Worth keeping if the demo wants an interrupt
   moment.
3. **Launch languages** — hi / en / mr / ta from the mock. Adding more is cheap for STT, but each
   one needs its own i18n strings.
4. **Where the server runs on demo day** — laptop on venue WiFi is simplest; `ap-south-1` is
   250–400ms/hop faster than anything US-hosted if we need it off the laptop.
