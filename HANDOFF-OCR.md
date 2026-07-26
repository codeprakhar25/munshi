# Handoff — Munshi OCR / scan pipeline

**Repo:** `D:\sarvam-epoch\munshi` (WSL: `/mnt/d/sarvam-epoch/munshi`)
**Date:** 2026-07-26 · hackathon build · reason for handoff: Claude rate limit
**Companion docs:** `ARCHITECTURE.md` (voice agent, still authoritative), `DIAGNOSTIC_RUNBOOK.md` (adb)

---

## 0. HARD CONSTRAINTS — read before doing anything

1. **Never run install / build / dev-server / adb commands from WSL.** The user runs everything
   themselves on Windows at `D:\sarvam-epoch\munshi`. File reads/writes/edits only. Collect any
   commands the user must run and list them at the end of your message.
2. **A second agent is editing this repo concurrently** and owns the UI. It has already written
   `src/app/scan/review.tsx`, `src/lib/scan-draft-math.ts`, `src/lib/sarvam/scan-parsing.ts`,
   `src/app/home.tsx`, `src/components/scan/*`. **Re-read any file before editing it** — several
   writes in this session failed with "file has been modified since read". Prefer surgical `Edit`
   over `Write` on files that agent owns.
3. **Only our code does arithmetic.** The LLM classifies and labels; it never produces or restates
   a rupee figure. This is enforced structurally (see §3, the tag scheme) and is the single most
   important invariant in the codebase.
4. **Nothing reaches the ledger without an explicit confirm tap.** No auto-commit, ever, however
   strong a match looks.
5. **Balance is never clamped at zero.** A negative balance means the customer is in credit and the
   shop owes them. Clamping destroys that credit and re-bills money already handed over
   (`ARCHITECTURE.md` §1). There is a live clamp bug — see §6.

---

## 1. What the user asked for, in their words

- "now we donot work on the UI part anymore only and only on the OCR working and architecture"
- The register is a **prose udhaar notebook**, name per line, not a ruled table:
  > "ramesh ka 100rs dudh ka baaki h suresh ka 300 rs tel ka aur 200 rs biscuit ka baaki h usme se 50 jma h"
- "**after scan the main part is the contact mapping** — pull contacts from the system and match
  with the name" ← this is the centrepiece of the demo, not the OCR itself
- "it would be as a doc is scanned and it would be **line by line**"
- "shall we include a **sarvam 30B** model here which takes OCR output and gives us the needed info"
  → yes, built, see §3
- Demo target: **real handwritten register**, photos to be supplied by the user
- Import mode chosen: opening-balance-only. Reconciled to: since a prose notebook has no running
  balance column, posting each line additively lands on the same total and is simpler.

**OPEN / BLOCKING:** the user said the demo images are at `~/sarvam-epoch/assets` ("WhatsApp..."),
i.e. `/home/prakh/sarvam-epoch/assets`. **That directory was never listed successfully** — the
lookup was blocked by the quota gate. `/mnt/d/sarvam-epoch/munshi/assets/` contains only UI art
(`bahi-hero.png`, `munshi-face.png`). **First action on pickup: find those two images.** They are
the only real ground truth for tuning the parser.

---

## 2. Architecture — how the two paths fit together

There are two ways an entry reaches the khata, and they deliberately converge:

```
VOICE:  mic -> Saaras -> agent.ts apply_ledger_actions -> Draft -> commitDrafts()
SCAN:   photo -> Doc Intelligence -> src/ocr/* -> Draft -> commitDrafts()
                                                  ^^^^^            ^^^^^^^^^^^^
                                            same type          ONE writer
```

`Draft` (`src/agent/types.ts`) is the shared currency. The scan path fills the same fields the
voice path does, plus scan-only optional fields (`items[]`, `confirmed`, `already_imported`,
`scan` provenance).

**`src/ocr/` may not import `react-native`, `expo-*`, or Node built-ins.** Same rule as
`src/agent/`. That is what lets `scripts/ocr.ts` replay a real page through the real parser under
`tsx` with no phone. `scripts/tsconfig.json` has been widened to include `../src/ocr/**/*.ts`.

---

## 3. What was built this session — all NEW, all complete

| file | what it does |
|---|---|
| `src/ocr/numerals.ts` | Devanagari/Tamil/Bengali/… digit → ASCII (`Number('५०')` was NaN), ₹ / रु / Rs / `500/-` / `1,500` / `(200)` negatives. `findAmounts()` returns every number **with its position**, dates masked out first so `10/7` never yields a 10 and a 7. |
| `src/ocr/lines.ts` | Prose line → `{nameToken, date, items[{amount, direction, label, reason}]}`. Name = tokens before the first case marker (का/के/की/ने/को/ka/ke/ki), also handles joined forms (`रमेशका`). Direction by nearest keyword, **searching forward first** — Hindi puts the qualifier after the number, and searching backwards makes "300 tel aur 200 biscuit … 50 jama" read the 200 as a payment. `usme se` clause flips everything after it to payment. Default when silent = udhaar. |
| `src/ocr/columns.ts` | Ruled-table path. **Reads `<thead>` instead of stripping it** — जमा / उधार / बाकी is the direction signal. Header-less fallback identifies the balance column structurally (its row deltas equal another column's values). |
| `src/ocr/page.ts` | `parseBlocksToItems(blocks)` → `ScanItem[]`, reading-order sorted. Skips `image`/`header`/`footer`/`section-title` blocks. **The balance column is read but never posted.** |
| `src/ocr/transliterate.ts` | Sarvam `POST /transliterate` (verified against docs: `input`, `source_language_code` accepts `auto`, `target_language_code`, `numerals_format`). Batches newline-joined, **verifies the returned line count matches** and falls back to per-name calls if not — a silently mis-paired name maps money to the wrong person. Memoized; Latin-only names never hit the API. |
| `src/ocr/contact-match.ts` | The centrepiece. Tiered scoring: exact 1.0 → first-name 0.92 → token 0.85 → prefix 0.78 → Levenshtein ≥0.72 fuzzy. Honorifics stripped (`uncle`, `bhaiya`, `भैया`, `seth`…) so "Ramesh Uncle" matches a book that says "Ramesh". Auto-accept needs score ≥0.85 **and** a ≥0.1 lead over second place; khata customers outrank raw contacts at equal score. |
| `src/ocr/structure.ts` | **The sarvam-30b pass.** One forced tool call per page (`structure_ledger_lines`), one `lines[]` array — never parallel calls (POC: 105b silently drops all but the first). **Amounts are replaced by opaque tags `a1`/`a2` before sending**; the model answers per tag with owner + direction + label and can never emit a digit. Fails open: on error/empty the keyword reading stands. |
| `src/ocr/resolve.ts` | `attachContactMatches(drafts, {khata, contacts, language})` — transliterates the distinct names once, ranks per name (not per card), fills `person` / `options` / `status` / `before` / `after`. Also exports `netOfItems()` and `priceAgainst()` (unclamped). Never sets `confirmed`. |
| `src/ocr/client.ts` | Doc Intelligence on **raw bytes** (app reads a URI, harness reads a file — same six calls). Every request/response through `log()` from `agent/sarvam.ts`; the old client had zero logging. |
| `src/ocr/index.ts` | `runScan()` / `parseAndResolve()` — the whole pipeline. **NOTE: written before the merge with the other agent's grouping; see §5, it still calls a removed `resolveScanItems`. Fix or delete.** |
| `src/ocr/types.ts` | `ScanItem`, `ItemDirection`, `DirectionReason`. |
| `scripts/ocr-capture.ts` | `npm run ocr:capture -- ./photos/khata1.jpg` → `fixtures/<name>/page_N.json` + `blocks.txt` + `sarvam.log`. |
| `scripts/ocr.ts` | `npm run ocr -- fixtures/khata1 [--no-model] [--verbose] [--contacts f.json]` → prints the card table the merchant would see. `--no-model` shows exactly what sarvam-30b adds over the keyword rules. |

Also edited:
- `src/lib/sarvam/document-intelligence.ts` — now a thin RN adapter (URI → bytes → `src/ocr/client`), re-exports `DocLanguage` / `PageBlock` so existing imports keep working.
- `src/agent/types.ts` — added `scan?: ScanProvenance` to `Draft` + the `ScanProvenance` interface.
- `scripts/tsconfig.json` — include `../src/ocr/**/*.ts`.
- `package.json` — added `ocr` and `ocr:capture` scripts.

---

## 4. Bugs found in the pre-existing OCR path (context for why this was rewritten)

| file:line (original) | bug |
|---|---|
| `scan-parsing.ts:59` | largest-numeric-wins picked the **running balance column** as the amount → every scan inflated the ledger |
| `scan-parsing.ts:40` | `<thead>` stripped, discarding the direction signal |
| `scan-parsing.ts:73,92` | `type: 'credit'` hardcoded — payments were impossible |
| `scan-parsing.ts:100` | `header`/`section-title` not skipped → page title became a line item |
| `scan-parsing.ts:83` | first-number regex grabbed `10` out of the date in "10/7 दूध 50" |
| `scan-parsing.ts:26` | `Number('५०')` = NaN; no `/-`, no `(200)` |
| `khata-sync.ts:90` | `Math.max(0, before - amount)` clamped credit to zero, then `normalizeKhata` re-derived unclamped → stored row and balance disagreed |
| `khata-sync.ts:22` | customer match on `name_en.toLowerCase()` — Devanagari row vs Latin person never matches → duplicate customers per import |
| `review.tsx:42` | matched against `people-store` only, so khata customers who were never contacts never resolved |

All addressed by the new `src/ocr/*` path except the two marked in §6.

---

## 5. IMMEDIATE NEXT STEPS (in order)

1. **Find the demo images.** `/home/prakh/sarvam-epoch/assets` — the user says two WhatsApp photos
   are there. Confirm, then have the user copy them into `D:\sarvam-epoch\munshi\photos\` and run:
   ```
   npm run ocr:capture -- ./photos/khata1.jpg
   npm run ocr:capture -- ./photos/khata2.jpg
   ```
   You can also just `Read` the images directly — they render, so you can see the real handwriting
   and tune `lines.ts` / `columns.ts` keyword tables against actual content before any API call.

2. **Fix `src/ocr/index.ts`.** It imports `resolveScanItems` from `./resolve`, which was replaced by
   `attachContactMatches` when the two agents' designs were merged. Rewrite `parseAndResolve` as:
   `parseBlocksToItems` → `structureItems` → the other agent's `groupItemsToDrafts`
   (`src/lib/sarvam/scan-parsing.ts`) → `attachContactMatches`. Note `scan-parsing.ts` currently
   lives under `src/lib/` so importing it from `src/ocr/` would break the no-RN boundary — either
   move the grouping into `src/ocr/` or have `scan-parsing.ts` own the whole async entry.
   **`scripts/ocr.ts` will not run until this is resolved.**

3. **Wire `src/app/scan/processing.tsx`.** It still calls the old sync
   `runDocumentIntelligence` + `parseBlocksToDrafts`. It needs to await the full pipeline and
   pass `{khata: await loadKhata(), contacts: useDeviceContactsStore.getState().contacts}`.
   Phase captions: `uploading → processing → downloading → reading → structuring → matching`
   (i18n keys needed in `src/lib/i18n.ts`).

4. **Fix the clamp in `src/lib/scan-draft-math.ts`** — `priceDraft` returns
   `after: Math.max(0, after)`. Remove the clamp (see constraint #5). `src/ocr/resolve.ts`
   `priceAgainst()` is the correct implementation; consider deleting `priceDraft` in favour of it.

5. **Commit path for contact-sourced people.** When a card's `person.from_contacts === true`,
   `customer_id` is null and `commitDrafts()` will skip it. Something must create the khata
   customer from the picked contact first, then call `commitDrafts`. Put it in `khata-sync.ts`.

6. **Dedupe / `already_imported`.** `Draft.scan.ref` carries `{blockId, row, item}`. Add a
   `source` field to `Entry` and skip/flag rows already present, so re-scanning a page does not
   double-post.

---

## 6. Commands for the user to run on Windows (`D:\sarvam-epoch\munshi`)

Nothing new needs installing — `fflate`, `zustand`, `@react-native-async-storage/async-storage`,
`expo-contacts`, `expo-image-picker`, `expo-document-picker`, `tsx` are all already in
`package.json`.

```
:: capture fixtures from the demo photos (run once per photo)
npm run ocr:capture -- ./photos/khata1.jpg

:: replay through the parser after every parser edit — no phone, no rebuild
npm run ocr -- fixtures/khata1
npm run ocr -- fixtures/khata1 --no-model     :: keyword rules only, shows what the LLM adds

:: typecheck both the app and the harness
npm run typecheck

:: app
npx expo start -c
```

`.env` must contain `EXPO_PUBLIC_SARVAM_API_KEY=...` (already present). After editing `.env`,
Metro must be restarted with `-c` or the stale value stays baked into the bundle.

---

## 7. Design decisions worth not re-litigating

- **Tool calls, never "reply with JSON".** sarvam-30b is a reasoning model; asked in prose it burns
  6000+ chars of hidden reasoning and often never answers. Measured: tool schema 531ms vs 7667ms.
- **One tool with an `actions[]` / `lines[]` array, never parallel tool calls.** 105b silently drops
  all but the first — invisible data loss in a ledger.
- **No confidence gating anywhere.** Sarvam reports one score per table, not per line, and the same
  handwritten page OCR'd twice produced different item names. Every card gets identical
  "please check" treatment.
- **Transliteration is not optional here.** The book is Devanagari, the contacts are Latin; direct
  comparison fails 100% and cross-script fuzzy matching is meaningless.
- **The model never sees or emits a rupee figure** (tag scheme in `structure.ts`). Worst case is
  right money on the wrong person — visible on the review card — never invented money.
