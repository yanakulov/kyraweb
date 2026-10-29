export type RoomAction =
  | {
      op: "scene";
      name: string;
      x: number;
      y: number;
      facing: number;
      visible: boolean;
    }
  | { op: "walkDelay"; ticks: number }
  | { op: "walk"; x: number; y: number }
  | { op: "actor"; x: number; y: number; facing: number; visible: boolean }
  | { op: "visible"; visible: boolean }
  | { op: "face"; facing: number; shape: number }
  | { op: "movie"; clip: string; x: number; y: number; ticks: number }
  | {
      op: "frame";
      clip: string;
      index: number;
      x: number;
      y: number;
      ms: number;
      permanent?: boolean;
    }
  | { op: "close"; clip: string }
  | {
      op: "say";
      text: string;
      voiceId: number;
      ms: number;
      x: number;
      y: number;
      color: number;
      blocking: boolean;
      speaker?: number;
    }
  | { op: "flag"; flag: number; value: boolean }
  | { op: "sceneFile"; room: number; name: string }
  | {
      op: "npc";
      character: number;
      x: number;
      y: number;
      facing: number;
      shape: number;
      room: number;
      visible: boolean;
    }
  | { op: "phase"; active: boolean }
  | { op: "shape"; shape: number; x: number; y: number; flags: number }
  | { op: "mask"; x: number; y: number; w: number; h: number; blocked: boolean }
  | { op: "noDrop"; x: number; y: number; w: number; h: number }
  | { op: "hand"; item: import("../core/types").InventoryItemId | null }
  | {
      op: "item";
      item: import("../core/types").InventoryItemId;
      x: number;
      y: number;
    }
  | { op: "confirm" }
  | { op: "choice"; resume: (point: { x: number; y: number }) => RoomAction[] }
  | { op: "vase"; item: number }
  | { op: "exit"; target: number; entry?: { x: number; y: number } }
  | { op: "death" }
  | { op: "palette"; start: number; colors: number[]; ms: number }
  | { op: "ambientRun" | "ambientWait"; index: number }
  | { op: "clearText" | "waitVoice" }
  | { op: "wait"; ms: number; movement?: boolean }
  | { op: "ambient"; index: number; enabled: boolean; internal?: boolean }
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
  private waitingForVoice = false;
  private clearAfterWait = false;
  private cancelled = false;
  /** Dismiss only the current line; movement, movies and choices still complete. */
  skipLine() {
    if (this.cancelled || this.awaiting || this.voice <= 0) return false;
    this.voice = 0;
    if (this.waitingForVoice) this.wait = 0;
    this.clearAfterWait = false;
    this.host.apply({ op: "clearText" });
    return true;
  }
  awaiting = false;
  private resume: ((point: { x: number; y: number }) => RoomAction[]) | null =
    null;
  confirm(point = { x: 160, y: 100 }) {
    if (this.cancelled) return;
    if (this.resume) {
      this.actions.push(...this.expand(this.resume(point)));
      this.resume = null;
    }
    this.awaiting = false;
  }
  constructor(
    actions: RoomAction[],
    private host: {
      apply: (action: RoomAction) => void;
      walking: () => boolean;
      movementTempo?: () => number;
      frames: (clip: string) => number;
    },
  ) {
    this.actions = this.expand(actions);
  }
  private expand(actions: RoomAction[]) {
    return actions.flatMap((action) =>
      action.op === "movie"
        ? Array.from(
            { length: this.host.frames(action.clip) },
            (_, index): RoomAction => ({
              op: "frame",
              clip: action.clip,
              index,
              x: action.x,
              y: action.y,
              ms: (action.ticks * 1000) / 60,
            }),
          )
        : [action],
    );
  }
  get done() {
    return (
      this.cancelled ||
      (!this.awaiting &&
        this.index >= this.actions.length &&
        this.wait <= 0 &&
        !this.host.walking())
    );
  }
  stop() {
    this.cancelled = true;
    this.host.apply({ op: "clearText" });
  }
  update(elapsedMs: number) {
    if (this.cancelled) return;
    if (this.awaiting) {
      this.voice = Math.max(0, this.voice - elapsedMs);
      return;
    }
    let budget = Math.max(0, elapsedMs);
    if (this.host.walking()) {
      this.voice = Math.max(0, this.voice - budget);
      return;
    }
    while (true) {
      const used = Math.min(this.wait, budget);
      this.wait -= used;
      budget -= used;
      this.voice = Math.max(0, this.voice - used);
      if (this.wait > 1e-6) return;
      this.waitingForVoice = false;
      if (this.clearAfterWait) {
        this.host.apply({ op: "clearText" });
        this.clearAfterWait = false;
      }
      const action = this.actions[this.index];
      if (!action) return;
      // customPrintTalkString waits for the previous CD voice before replacing it.
      if (action.op === "say" && this.voice > 0) {
        this.wait = this.voice;
        this.waitingForVoice = true;
        continue;
      }
      this.index++;
      if (action.op === "choice") {
        this.resume = action.resume;
        this.awaiting = true;
        this.host.apply(action);
        return;
      }
      if (action.op === "confirm") {
        this.awaiting = true;
        this.host.apply(action);
        return;
      }
      if (action.op === "waitVoice") { this.wait = this.voice; this.waitingForVoice = true; }
      else if (action.op === "wait") this.wait = action.ms * (action.movement ? (this.host.movementTempo?.() ?? 1) : 1);
      else {
        this.host.apply(action);
        if (action.op === "frame" || action.op === "palette")
          this.wait = action.ms;
        if (action.op === "say") {
          this.voice = action.ms;
          if (action.blocking) {
            this.wait = action.ms;
            this.waitingForVoice = true;
            this.clearAfterWait = true;
          }
        }
      }
      if (this.host.walking()) return;
    }
  }
}
