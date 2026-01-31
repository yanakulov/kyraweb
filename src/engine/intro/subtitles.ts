import introText from "./introText.json";
import type { IntroSubtitle } from "./types";

type SubtitleEvent = {
  startMs: number;
  text: string;
  x?: number;
  y: number;
  align?: CanvasTextAlign;
  maxWidth?: number;
  type?: "text" | "talk";
  color?: string;
};

export const KALLAK_WRITING_EVENTS: SubtitleEvent[] = [
  { startMs: 0, text: introText.kallak_writing.dear_brynn, x: 160, y: 180, align: "center", maxWidth: 300, type: "text", color: "#f2e6c9" },
  { startMs: 2900, text: introText.kallak_writing.malcolm_free, x: 160, y: 180, align: "center", maxWidth: 300, type: "text", color: "#f2e6c9" },
  { startMs: 6100, text: introText.kallak_writing.soon_come, x: 160, y: 180, align: "center", maxWidth: 300, type: "text", color: "#f2e6c9" },
  { startMs: 10400, text: introText.kallak_writing.help_brandon, x: 160, y: 180, align: "center", maxWidth: 300, type: "text", color: "#f2e6c9" }
];

export const TREE_EVENTS: SubtitleEvent[] = [
  { startMs: 200, text: introText.tree.laugh, x: 80, y: 45, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 1000, text: introText.tree.how_dare, x: 80, y: 45, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 2133, text: introText.tree.something_special, x: 80, y: 45, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 3333, text: introText.tree.humorous_hex, x: 80, y: 45, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 6667, text: introText.tree.warning, x: 80, y: 45, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 7667, text: introText.tree.dont_jump, x: 80, y: 45, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 7767, text: introText.tree.boo, x: 240, y: 45, align: "center", maxWidth: 120, type: "talk", color: "#f2f2f2" },
  { startMs: 8967, text: introText.tree.funnier, x: 80, y: 45, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 9367, text: introText.tree.is_it_not, x: 80, y: 45, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" }
];

export const KALLAK_MALCOLM_EVENTS: SubtitleEvent[] = [
  { startMs: 117, text: introText.kallak_malcolm.greetings, x: 80, y: 58, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 1583, text: introText.kallak_malcolm.royal_mystics, x: 80, y: 58, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 2683, text: introText.kallak_malcolm.frighten, x: 80, y: 58, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 4033, text: introText.kallak_malcolm.malcolm, x: 240, y: 58, align: "center", maxWidth: 120, type: "talk", color: "#f2f2f2" },
  { startMs: 5367, text: introText.kallak_malcolm.heard_escape, x: 240, y: 58, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 7133, text: introText.kallak_malcolm.expected, x: 240, y: 58, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 8450, text: introText.kallak_malcolm.why_rush, x: 80, y: 58, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 9817, text: introText.kallak_malcolm.rule, x: 80, y: 58, align: "center", maxWidth: 240, type: "talk", color: "#f2f2f2" },
  { startMs: 11167, text: introText.kallak_malcolm.puny_curse, x: 80, y: 58, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 12283, text: introText.kallak_malcolm.slay, x: 80, y: 58, align: "center", maxWidth: 240, type: "talk", color: "#f2f2f2" },
  { startMs: 14450, text: introText.kallak_malcolm.little_magic, x: 240, y: 58, align: "center", maxWidth: 240, type: "talk", color: "#f2f2f2" },
  { startMs: 16233, text: introText.kallak_malcolm.mean_harm, x: 240, y: 58, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 17833, text: introText.kallak_malcolm.stone, x: 80, y: 58, align: "center", maxWidth: 240, type: "talk", color: "#f2f2f2" },
  { startMs: 19067, text: introText.kallak_malcolm.leave_eyes, x: 80, y: 58, align: "center", maxWidth: 240, type: "talk", color: "#f2f2f2" },
  { startMs: 20300, text: introText.kallak_malcolm.no_tears, x: 240, y: 58, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" },
  { startMs: 21533, text: introText.kallak_malcolm.deny_yours, x: 240, y: 58, align: "center", maxWidth: 280, type: "talk", color: "#f2f2f2" }
];

export function buildSubtitles(events: SubtitleEvent[], totalMs: number, options?: { originalTotalMs?: number; holdMs?: number }): IntroSubtitle[] {
  const sorted = [...events].sort((a, b) => a.startMs - b.startMs);
  const holdMs = options?.holdMs ?? 1200;
  const originalTotalMs = options?.originalTotalMs ?? (sorted.length ? sorted[sorted.length - 1].startMs + holdMs : totalMs);
  const scale = originalTotalMs > 0 ? totalMs / originalTotalMs : 1;

  return sorted.map((event, idx) => {
    const next = sorted[idx + 1];
    const scaledStart = event.startMs * scale;
    const scaledNext = next ? next.startMs * scale : totalMs;
    const endMs = Math.min(totalMs, scaledNext);
    return {
      startMs: scaledStart,
      endMs,
      text: event.text,
      x: event.x,
      y: event.y,
      align: event.align,
      maxWidth: event.maxWidth,
      type: event.type,
      color: event.color
    } satisfies IntroSubtitle;
  });
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
