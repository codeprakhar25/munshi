# Munshi — मुंशी

**A voice-first khata clerk for India's udhaar-book merchants.**
Photograph the handwritten bahi you already keep; run it by talking. Built at the Sarvam Epoch Buildathon (Bengaluru, 26 Jul 2026).

> "कविता को साबुन चालीस का" → staged, read back with old and new balance → "हाँ" → written to the passbook, forever traceable.

## What it does

- **Scan** — one photo of a handwritten ledger page (Devanagari, Latin, Gurmukhi, Bengali, Tamil, Odia…) becomes structured person-cards, each traceable to the exact source line, reviewed and written into the khata. Re-scanning the same page is detected, never double-billed.
- **Talk** — tap Munshi and speak in Hindi, English, or the mix you actually use: new udhaar, payments, balance questions, corrections ("सौ नहीं, डेढ़ सौ"), deletions ("वो एंट्री हटा दो"), multiple customers in one breath. He asks when a name is ambiguous, asks when an amount is missing, and never writes without reading back.
- **Trust** — every entry lands in a per-customer passbook with the balance before and after frozen at write time. Balance is always re-derived from the entry log; overpayment becomes visible credit, never a clamped zero. One-turn voice undo; one-tap delete.

## Stack

Expo (React Native 0.86, New Architecture) · Sarvam **Saaras** streaming STT (code-mix, `language-code=unknown`) · **sarvam-30b** via forced tool-calling · **Bulbul v3** streaming TTS · Sarvam **Vision / Parse** for the scan pipeline · Reanimated 4 · AsyncStorage (event-sourced ledger). The agent runs **on the device** — no server (see below).

```bash
npm install
npx expo run:android      # dev build; Metro reloads JS
node --env-file=.env scripts/turns.ts   # the agent, headless, no phone
```

`EXPO_PUBLIC_SARVAM_API_KEY` in `.env` (demo-stage trade, documented in ARCHITECTURE.md §3).

## Every hard thing

The findings below were each paid for with a broken demo path. Raw request/response logging (`src/agent/sarvam.ts`) is why we caught them — several fail *silently, with wrong money*.

**1. sarvam-30b is a reasoning model — never ask it for prose or JSON.** Asked to "reply with JSON", it burns 3,000–6,000 characters of hidden reasoning and hits `finish_reason: length` without answering. Asked for a prose reply: 7.6s and it never finished. A **forced tool call** returns in ~530ms, clean. Everything — extraction, confirmation, disambiguation, even the spoken sentence — is a forced tool call with a stage-scoped schema.

**2. Parallel tool calls silently lose money.** Given one tool per action and a three-customer sentence, sarvam-30b returns *zero* calls and sarvam-105b returns *only the first* — the rest silently dropped. One tool taking an `actions[]` array returns all three, every time.

**3. STT hallucinates plausible ledger commands out of silence.** Saaras produced "गोपाल ने ₹100 दियो।" from a silent microphone — indistinguishable from a real command. That is why **nothing reaches the ledger unconfirmed**: the confirm gate is a correctness feature, not UX. (Later: unambiguous *appends* auto-commit for latency, protected by a one-turn voice undo. Deletes never auto-commit.)

**4. "सौ नहीं, डेढ़ सौ दिए थे" contains नहीं.** A yes/no regex reads a *correction* as a *rejection* and throws away the merchant's fix. Confirmation is a model decision with four outcomes (confirm / reject / amend / new-command), and an amend re-prices the pending draft in place — the flow never restarts.

**5. Only code does arithmetic.** The model classifies and phrases; every rupee figure is computed in `agent.ts` and handed to speech as fact, digit-exact. Balance is a fold over the entry log — assigned nowhere — so history and total cannot drift. Negative balance means the shop owes the customer; clamping it inside the fold would silently re-bill money already paid.

**6. Hindi number words are a minefield.** "दो सौ पचास" intermittently killed the model's amount extraction (hidden reasoning ate the token budget → no tool call → merchant stuck in a loop). We parse amounts deterministically first — and then found the traps: **"रहने दो" parses as ₹2** (दो the verb, not the number), "दो किलो चीनी" is a quantity not rupees, "2 सौ" must not read as 2. Guards for negation words, digit+scale, and rupee-marker adjacency; the model stays as fallback.

**7. Latency is hidden reasoning, and dead air is the product dying.** The second "phrase a reply" model call measured 1.1–14s — so common reply shapes are **templated locally in code** (which also means numbers reach the ear without a model ever touching them). Extraction **speculates on partial transcripts** while the merchant is still speaking. The Bulbul socket is warmed in parallel with the model call. First-audio-from-release is instrumented on every turn.

**8. There is no reliable echo cancellation on Android.** The design never depends on AEC: a half-duplex gate **drops** mic frames while the agent speaks (queuing would replay the echo late), Saaras's own END_SPEECH ends each utterance so a follow-up "हाँ" needs no tap, and barge-in cuts Bulbul mid-sentence without losing the pending draft.

**9. Streamed TTS stutters unless you build a real jitter buffer.** Venue WiFi delivers 100–300ms inter-arrival jitter; resetting the playback timeline on underrun *is* the stutter. Pre-roll, coalesced buffers, and a monotonic playhead that inserts silence instead of resetting.

**10. Cross-script names are the everyday case, not the edge.** The book is in Devanagari; the merchant may speak romanised Hindi or Odia. Deterministic tiered matching over aliases, transliterated match keys in the scan pipeline, and hard-won rules: reject the model's roster pick when the transcript was romanised (that's how ସୁରେଶ got credited to Sunita), prefer customers with actual history when a first name collides with a phonebook import, and never auto-create a customer in order to *delete* from them.

**11. The model invents new customers.** An ordinary udhaar classified as `new_customer` silently split one person across two khatas — half their money hiding under a second name. The deterministic roster match now runs *before* anyone is created; a genuinely unknown name opens a khata explicitly (dead-end "whose name?" loops were worse) and stays reversible.

**12. The server existed for one HTTP header.** Sarvam authenticates WebSockets with a header browsers can't set — React Native can. That one fact deleted the proxy: the agent runs on-device, works on mobile data, no laptop on stage.

**13. The agent imports nothing from React Native.** `src/agent/` runs identically under Node — every finding above was caught in a headless scripted harness (`scripts/turns.ts`), not by talking at a phone.

**14. This device renders radial gradients as rectangles.** Every radial-gradient became a hard-edged box on the demo phone. All ambience is linear-gradient or stacked translucent discs now; radials are banned in the repo.

**15. Android touch has opinions.** Children rendered outside a parent's bounds aren't tappable (a zero-sized Pressable made the close button dead); sibling draw order follows *elevation*, not zIndex; a translucent elevated overlay draws its own shadow through itself. Single-node animated pressables and ancestor-bubbling dismissal, everywhere.

**16. A dismissed agent must be provably silent.** Close the overlay while the model is thinking and the reply arrives seconds later — speaking into a closed room. A `deactivated` flag is checked at TTS creation, before speaking, and in every speak path; mid-flight replies are dropped and their stream closed.

**17. Scanned pages must stay traceable.** Every extracted card carries provenance — source line verbatim, row reference, *which signal decided credit-vs-payment* — and uncertainty is shown for review, never guessed over. Fingerprints of committed entries stop a re-scanned page from importing twice.

## Repo map

```
src/agent/     turn loop, tool schemas, all arithmetic — no RN imports, runs under Node
src/voice/     Saaras/Bulbul sockets, half-duplex gate, jitter buffer, session
src/ocr/       scan pipeline: structure, columns, direction, transliteration, provenance
src/app/       expo-router screens (home, voice overlay, person passbook, scan, onboarding)
scripts/       headless conversation harness
ARCHITECTURE.md  decision record — every choice, what it beat, and why
```

## Team

Built by Prakhar & Omm at Sarvam Epoch, one Saturday, on ₹100 of API credits and a phone.
