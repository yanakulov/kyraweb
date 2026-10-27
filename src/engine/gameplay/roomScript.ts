export type RoomAction =
  | { op: "scene"; name: string; x: number; y: number; facing: number; visible: boolean }
  | { op: "walk"; x: number; y: number }
  | { op: "actor"; x: number; y: number; facing: number; visible: boolean }
  | { op: "visible"; visible: boolean }
  | { op: "face"; facing: number; shape: number }
  | { op: "movie"; clip: string; x: number; y: number; ticks: number }
  | { op: "frame"; clip: string; index: number; x: number; y: number; ms: number }
  | { op: "close"; clip: string }
  | { op: "say"; text: string; voiceId: number; ms: number; x: number; y: number; color: number; blocking: boolean }
  | { op: "clearText" | "waitVoice" }
  | { op: "wait"; ms: number }
  | { op: "ambient"; index: number; enabled: boolean }
  | { op: "commit"; x: number; y: number; w: number; h: number }
  | { op: "message"; text: string };

export type OpeningScript = { opening: RoomAction[]; tree: RoomAction[] };

/** A single cancellable clock for frames, subtitles and original script waits.
 * Walking is owned by the game; input stays locked until it actually arrives.
 */
export class RoomScript {
  private actions: RoomAction[];
  private index = 0;
  private wait = 0;
  private voice = 0;
  private clearAfterWait = false;
  private cancelled = false;
  constructor(actions: RoomAction[], private host: {
    apply: (action: RoomAction) => void;
    walking: () => boolean;
    frames: (clip: string) => number;
  }) {
    this.actions = actions.flatMap(action => action.op === "movie"
      ? Array.from({ length: host.frames(action.clip) }, (_, index): RoomAction => ({
        op: "frame", clip: action.clip, index, x: action.x, y: action.y, ms: action.ticks * 1000 / 60
      })) : [action]);
  }
  get done() { return this.cancelled || (this.index >= this.actions.length && this.wait <= 0 && !this.host.walking()); }
  stop() { this.cancelled = true; this.host.apply({ op: "clearText" }); }
  update(elapsedMs: number) {
    if (this.cancelled) return;
    let budget = Math.max(0, elapsedMs);
    if (this.host.walking()) { this.voice = Math.max(0, this.voice - budget); return; }
    while (true) {
      const used = Math.min(this.wait, budget);
      this.wait -= used; budget -= used; this.voice = Math.max(0, this.voice - used);
      if (this.wait > 1e-6) return;
      if (this.clearAfterWait) { this.host.apply({ op: "clearText" }); this.clearAfterWait = false; }
      const action = this.actions[this.index];
      if (!action) return;
      // customPrintTalkString waits for the previous CD voice before replacing it.
      if (action.op === "say" && this.voice > 0) { this.wait = this.voice; continue; }
      this.index++;
      if (action.op === "waitVoice") this.wait = this.voice;
      else if (action.op === "wait") this.wait = action.ms;
      else {
        this.host.apply(action);
        if (action.op === "frame") this.wait = action.ms;
        if (action.op === "say") {
          this.voice = action.ms;
          if (action.blocking) { this.wait = action.ms; this.clearAfterWait = true; }
        }
      }
      if (this.host.walking()) return;
    }
  }
}
