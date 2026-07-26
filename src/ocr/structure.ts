/**
 * The sarvam-30b pass over OCR text: who does each amount belong to, and did
 * the money come in or go out.
 *
 * Why a model at all, when `lines.ts` already parses these sentences: the target
 * register is HANDWRITTEN prose. Sarvam transcribes it faithfully, which means
 * it transcribes the mess faithfully — missing case markers, spellings that
 * drift mid-page, "usme se" clauses, two customers on one line. Keyword rules
 * cover the clean cases and this covers the rest.
 *
 * THE CONSTRAINT THAT MAKES THIS SAFE
 * -----------------------------------
 * The model never sees a rupee figure it could restate, and never returns one.
 * `numerals.ts` extracts every amount with its position; each is replaced by an
 * opaque tag (a1, a2, ...) before the text is sent, and the model answers per
 * tag. So the worst a hallucination can do is put the right money on the wrong
 * person or the wrong side — both of which the merchant sees on the review card
 * — and it can never invent ₹4000 that was not on the page.
 *
 * This is the same rule `agent.ts` enforces for voice ("the LLM classifies and
 * the LLM phrases; only our code does arithmetic"), applied to paper.
 *
 * Failure is not fatal: if the call errors, times out or returns nothing, the
 * deterministic reading stands and the scan continues. A model outage must not
 * cost the merchant their page.
 *
 * No `react-native` / `expo-*` / Node imports.
 */
import { chatTools, log, type ChatMessage, type ToolSchema } from '../agent/sarvam';
import type { ScanItem } from './types';

interface StructuredAmount {
  tag?: string;
  owner?: string;
  direction?: string;
  label?: string;
}

interface StructuredLine {
  line?: number;
  amounts?: StructuredAmount[];
}

/**
 * ONE tool taking an ARRAY of every line on the page, not one call per line.
 * The POC measured sarvam-30b returning zero parallel tool calls and
 * sarvam-105b returning only the first and silently dropping the rest —
 * invisible data loss, which in a ledger means a customer's debt vanishes.
 * See ARCHITECTURE.md §4.
 */
const STRUCTURE_TOOL: ToolSchema[] = [{
  type: 'function',
  function: {
    name: 'structure_ledger_lines',
    description:
      'Read every line of a shopkeeper\'s handwritten udhaar (credit) book and say, for each tagged amount, '
      + 'whose it is and which way the money moved. Call this exactly once, with one entry in `lines` for every '
      + 'line you were given.',
    parameters: {
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          description: 'One entry per input line, in the order given. Never merge two lines and never drop the last one.',
          items: {
            type: 'object',
            properties: {
              line: { type: 'number', description: 'The line number shown at the start of the input line.' },
              amounts: {
                type: 'array',
                description: 'One entry per amount tag (a1, a2, ...) appearing on that line. Cover every tag.',
                items: {
                  type: 'object',
                  properties: {
                    tag: {
                      type: 'string',
                      description: 'The tag exactly as it appeared in the line, e.g. "a1". Never invent a tag that was not shown.',
                    },
                    owner: {
                      type: 'string',
                      description:
                        'The customer this amount belongs to, copied VERBATIM from the line in the script it was written in. '
                        + 'A line usually names the person once at the start and every amount on it belongs to them. '
                        + 'Leave empty only if the line truly names nobody.',
                    },
                    direction: {
                      type: 'string',
                      enum: ['udhaar', 'payment'],
                      description:
                        'udhaar = the shopkeeper GAVE goods on credit and this is money OWED to them '
                        + '(baaki, baki, udhar, liya, le gaya, or a bare "<name> ka 100 rs dudh ka"). '
                        + 'payment = the customer HANDED OVER money against what they owed '
                        + '(jama, jma, diye, diya, chukaya, wapas, paid). '
                        + 'CRITICAL: "usme se 50 jma h" means "out of that, 50 has been deposited" — the 50 is a PAYMENT '
                        + 'even though every other amount on the same line is udhaar. '
                        + 'When a line names goods (dudh, tel, biscuit, saabun) next to an amount with no payment word, it is udhaar.',
                    },
                    label: {
                      type: 'string',
                      description: 'What was bought, if the line says (dudh, tel, biscuit). Copy it verbatim. Omit if not stated.',
                    },
                  },
                  required: ['tag', 'direction'],
                },
              },
            },
            required: ['line', 'amounts'],
          },
        },
      },
      required: ['lines'],
    },
  },
}];

const SYSTEM = `You read pages from an Indian shopkeeper's handwritten udhaar (credit) notebook.

Each line records what one customer owes, and sometimes what they have paid back.
The lines are informal Hindi, English or a mix, transcribed exactly as written — spellings
vary, words are missing, the same name may be spelled two ways on one page.

Rupee amounts have ALREADY been read off the page for you and replaced with tags like a1, a2.
You must never write a rupee figure. Refer to money only by its tag.

For every tag say who it belongs to and which way it moved. Cover every tag on every line.`;

/** A line, its tags, and the items those tags stand for. */
interface TaggedLine {
  index: number;
  text: string;
  items: ScanItem[];
}

/**
 * Group items back into the lines they came from, and rewrite each line with
 * its amounts replaced by tags.
 */
function tagLines(items: ScanItem[]): TaggedLine[] {
  const byLine = new Map<string, ScanItem[]>();
  for (const item of items) {
    const key = `${item.ref.blockId}#${item.ref.row}`;
    const bucket = byLine.get(key);
    if (bucket) bucket.push(item);
    else byLine.set(key, [item]);
  }

  return [...byLine.values()].map((group, index) => {
    let text = group[0].rawText;
    // Longest raw first, so replacing "50" cannot chew a digit out of "150".
    const ordered = [...group].sort((a, b) => b.amount.toString().length - a.amount.toString().length);
    ordered.forEach((item) => {
      const tag = `a${group.indexOf(item) + 1}`;
      const pattern = String(item.amount);
      const at = text.indexOf(pattern);
      if (at >= 0) text = `${text.slice(0, at)}${tag}${text.slice(at + pattern.length)}`;
    });
    return { index, text, items: group };
  });
}

export interface StructureStats {
  lines: number;
  amounts: number;
  named: number;
  directionChanged: number;
  used: boolean;
  error?: string;
}

/**
 * Enriches items in place-by-copy: owner name and direction from the model,
 * amounts untouched. Returns the deterministic input unchanged on any failure.
 */
export async function structureItems(
  items: ScanItem[],
): Promise<{ items: ScanItem[]; stats: StructureStats }> {
  const stats: StructureStats = {
    lines: 0, amounts: items.length, named: 0, directionChanged: 0, used: false,
  };
  if (!items.length) return { items, stats };

  const tagged = tagLines(items);
  stats.lines = tagged.length;

  const prompt = tagged.map((l) => `${l.index + 1}. ${l.text}`).join('\n');
  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Lines from the page:\n\n${prompt}` },
  ];

  let lines: StructuredLine[] = [];
  try {
    const calls = await chatTools<{ lines?: StructuredLine[] }>(messages, STRUCTURE_TOOL, {
      // FORCED, not 'auto'. On 'auto' sarvam-30b intermittently burns a thousand
      // characters of hidden reasoning and returns no tool call at all, and the
      // page silently falls back to keyword rules with nobody the wiser.
      tool_choice: { type: 'function', function: { name: 'structure_ledger_lines' } },
      max_tokens: 2500,
    });
    lines = calls[0]?.args?.lines ?? [];
  } catch (err) {
    stats.error = String(err);
    log('ocr_structure_failed', { error: stats.error });
    return { items, stats };
  }

  if (!lines.length) {
    log('ocr_structure_empty', { lines: tagged.length });
    return { items, stats };
  }
  stats.used = true;

  const out = items.map((i) => ({ ...i }));

  for (const line of lines) {
    const source = tagged[(line.line ?? 0) - 1];
    if (!source) continue;
    for (const answer of line.amounts ?? []) {
      const tagIndex = Number(String(answer.tag ?? '').replace(/\D/g, '')) - 1;
      const item = source.items[tagIndex];
      if (!item) continue;
      const target = out[items.indexOf(item)];
      if (!target) continue;

      const owner = answer.owner?.trim();
      if (owner && owner.length > 1) {
        if (!target.nameToken) stats.named += 1;
        target.nameToken = owner;
      }
      if (answer.direction === 'udhaar' || answer.direction === 'payment') {
        if (target.direction !== answer.direction) {
          stats.directionChanged += 1;
          target.direction = answer.direction;
          target.directionReason = 'model';
        }
      }
      const label = answer.label?.trim();
      if (label && !target.label) target.label = label;
    }
  }

  log('ocr_structure', stats);
  return { items: out, stats };
}
