/**
 * Locally-composed replies.
 *
 * The agent used to make a SECOND model call just to turn facts into a sentence.
 * Measured on device that call ran 1.1s to 14s — by far the largest thing between
 * the merchant finishing a sentence and hearing an answer, because prompt length
 * drives hidden reasoning on these models and reasoning is wall-clock you pay for
 * and never see.
 *
 * Every reply we actually make is one of a handful of shapes, and we already hold
 * every number in it. So we write them here, in code, and the phrasing call
 * becomes a fallback for languages we have not templated.
 *
 * This makes the "only our code does arithmetic" rule STRONGER, not weaker: the
 * numbers now reach the merchant's ear without a model ever touching them.
 */
import type { Draft, Turn } from './types';

/** Which template set to use. Anything else falls through to the model. */
export type ReplyLang = 'hi' | 'en';

export const replyLangFor = (code: string | null | undefined): ReplyLang | null => {
  if (!code) return null;
  if (code.startsWith('hi')) return 'hi';
  if (code.startsWith('en')) return 'en';
  return null; // Marathi, Tamil, Bengali… -> let the model phrase it
};

const rupees = (n: number, l: ReplyLang) =>
  n < 0
    ? (l === 'hi' ? `${Math.abs(n)} रुपये जमा` : `${Math.abs(n)} rupees in credit`)
    : (l === 'hi' ? `${n} रुपये` : `${n} rupees`);

/** Name in the script of the reply — a Devanagari name inside an English
 *  sentence is jarring to read and worse to hear Bulbul attempt. */
const who = (d: Draft, l: ReplyLang) =>
  (l === 'en' ? d.person?.name_en : d.person?.name) ?? d.name_spoken ?? '';

/** A single pending line, read back with both balances so it can be checked. */
function pending(d: Draft, l: ReplyLang): string | null {
  if (d.status === 'ready') {
    if (d.kind === 'new_customer') {
      return l === 'hi'
        ? `${who(d, l)} का नया खाता, ${rupees(d.amount ?? 0, l)} उधार। लिख दूँ?`
        : `New khata for ${who(d, l)}, ${rupees(d.amount ?? 0, l)} udhaar. Save it?`;
    }
    return l === 'hi'
      ? `${who(d, l)} — पुराना ${rupees(d.before ?? 0, l)}, नया ${rupees(d.after ?? 0, l)}। सही है?`
      : `${who(d, l)} — was ${rupees(d.before ?? 0, l)}, now ${rupees(d.after ?? 0, l)}. Correct?`;
  }
  if (d.status === 'ambiguous') {
    const names = d.options.map((o) => (l === 'en' ? o.name_en : o.name)).join(l === 'hi' ? ' या ' : ' or ');
    return l === 'hi' ? `कौन सा — ${names}?` : `Which one — ${names}?`;
  }
  if (d.status === 'needs_amount') {
    return l === 'hi' ? `${who(d, l)} के कितने रुपये?` : `How many rupees for ${who(d, l)}?`;
  }
  if (d.status === 'needs_customer') {
    return l === 'hi' ? 'किसका नाम बोलिए?' : 'Which customer?';
  }
  return null;
}

export interface ReplyContext {
  drafts: Draft[];
  committed: Turn['committed'];
  /** Set when the merchant cancelled the pending lines. */
  rejected?: boolean;
  /** Set when a pending line was just corrected. */
  amended?: boolean;
  /** Balance questions answered this turn: [name, balance]. */
  queries?: [string, number][];
}

/** Returns null when the shape isn't templated — the caller then asks the model. */
export function templateReply(ctx: ReplyContext, l: ReplyLang | null): string | null {
  if (!l) return null;

  if (ctx.committed.length) {
    // Past three names, reading every balance back is a recital the merchant
    // stands through — and they can see the rows update. Acknowledge and stop.
    if (ctx.committed.length >= 3) {
      return l === 'hi' ? 'सब अपडेट कर दिया है।' : 'All updated.';
    }
    const parts = ctx.committed.map((c) => `${l === 'en' ? c.name_en : (c.name ?? c.name_en)} ${rupees(c.after, l)}`);
    return l === 'hi' ? `हो गया। ${parts.join(', ')}।` : `Done. ${parts.join(', ')}.`;
  }

  if (ctx.rejected) return l === 'hi' ? 'ठीक है, छोड़ दिया। फिर से बोलिए।' : 'Okay, cancelled. Say it again.';

  if (ctx.queries?.length) {
    return ctx.queries
      .map(([name, bal]) => (l === 'hi' ? `${name} का ${rupees(bal, l)} बाकी है।` : `${name} owes ${rupees(bal, l)}.`))
      .join(' ');
  }

  if (!ctx.drafts.length) return null;

  const lines = ctx.drafts.map((d) => pending(d, l));
  if (lines.some((x) => x === null)) return null;

  const head = ctx.amended ? (l === 'hi' ? 'ठीक किया। ' : 'Fixed. ') : '';
  if (lines.length === 1) return head + lines[0];

  // Several lines at once: name each with its new balance, one lock for all.
  const ready = ctx.drafts.filter((d) => d.status === 'ready');
  if (ready.length === ctx.drafts.length) {
    // Same reasoning as the commit case: the pending card already lists every
    // line with both balances, so speaking them too is duplicated effort the
    // merchant pays for in seconds. Point at the screen instead.
    if (ready.length >= 3) {
      return l === 'hi'
        ? `${head}सारी ${ready.length} एंट्री डाल दी हैं, एक बार देख लीजिए। सही है?`
        : `${head}All ${ready.length} entries are in — have a look. Correct?`;
    }
    const parts = ready.map((d) => `${who(d, l)} ${rupees(d.after ?? 0, l)}`);
    return l === 'hi'
      ? `${head}${parts.join(', ')}। सब सही है?`
      : `${head}${parts.join(', ')}. All correct?`;
  }
  return head + lines.join(' ');
}
