import introText from "./introText.json";
import type { IntroSubtitle } from "./types";

const textById: Record<number, string> = {
  2: introText.kallak_malcolm.greetings,
  3: introText.kallak_malcolm.royal_mystics,
  4: introText.kallak_malcolm.frighten,
  5: introText.kallak_malcolm.malcolm,
  6: introText.kallak_malcolm.heard_escape,
  7: introText.kallak_malcolm.expected,
  8: introText.kallak_malcolm.why_rush,
  9: introText.kallak_malcolm.rule,
  10: introText.kallak_malcolm.puny_curse,
  11: introText.kallak_malcolm.slay,
  12: introText.kallak_malcolm.little_magic,
  13: introText.kallak_malcolm.mean_harm,
  14: introText.kallak_malcolm.stone,
  15: introText.kallak_malcolm.leave_eyes,
  16: introText.kallak_malcolm.no_tears,
  17: introText.kallak_malcolm.deny_yours,
  46: introText.kallak_writing.dear_brynn,
  47: introText.kallak_writing.malcolm_free,
  48: introText.kallak_writing.soon_come,
  49: introText.kallak_writing.help_brandon,
  31: introText.tree.laugh,
  22: introText.tree.how_dare,
  23: introText.tree.something_special,
  24: introText.tree.humorous_hex,
  25: introText.tree.warning,
  26: introText.tree.dont_jump,
  28: introText.tree.boo,
  29: introText.tree.funnier,
  30: introText.tree.is_it_not
};

// Frames and text use the same decoded DOS script clock; do not stretch the dialogue.
export function timelineSubtitles(events: { startMs: number; endMs: number; textId: number; x: number; y: number; type: string }[]): IntroSubtitle[] {
  return events.map(({ textId, ...event }) => ({
    ...event,
    text: textById[textId] ?? "",
    type: event.type as "text" | "talk",
    align: "center" as const,
    maxWidth: event.type === "talk" ? 220 : 300,
    color: event.type === "talk" ? "#f2f2f2" : "#f2e6c9"
  })).filter((line) => line.text.length > 0);
}

export function sliceSubtitles(subtitles: IntroSubtitle[], startMs: number, endMs: number): IntroSubtitle[] {
  return subtitles
    .filter((line) => line.endMs > startMs && line.startMs < endMs)
    .map((line) => ({
      ...line,
      startMs: Math.max(0, line.startMs - startMs),
      endMs: Math.max(0, Math.min(endMs, line.endMs) - startMs)
    }));
}
