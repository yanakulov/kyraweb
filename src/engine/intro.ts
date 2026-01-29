import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./constants";
import { loadImage, withBase } from "./assets";
import type { Vec2 } from "./types";

export type IntroStep = {
  id: string;
  durationMs: number;
  fadeInMs?: number;
  fadeOutMs?: number;
  bgSrc?: string;
  overlaySrc?: string;
  overlayPos?: Vec2;
  textLines?: string[];
  frames?: {
    src: string[];
    frameDurationMs: number;
    loop?: boolean;
    pos?: Vec2;
  };
  overlayFrames?: {
    src: string[];
    frameDurationMs: number;
    loop?: boolean;
    pos?: Vec2;
    holdLast?: boolean;
  };
  scroll?: {
    topSrc: string;
    bottomSrc: string;
    distance: number;
  };
  scrollIntro?: {
    baseSrc: string;
    bottomSrc: string;
    distance: number;
    baseY: number;
    baseHeight: number;
    bottomSrcY: number;
  };
  scrollSlices?: {
    topSrc: string;
    bottomSrc: string;
    topSlice: { x: number; y: number; w: number; h: number };
    bottomSlice: { x: number; y: number; w: number; h: number };
    distance: number;
    baseY: number;
  };
};

export type IntroPlayback = {
  skip: () => void;
  stop: () => void;
  done: Promise<void>;
};

export function buildIntroSteps(): IntroStep[] {
  const baseFrameMs = 100;
  const slowFrameMs = 120;
  const westwoodFrames = buildFrameList("assets/intro/frames/westwood", 23);
  const kyrandiaFrames = buildFrameList("assets/intro/frames/kyrandia", 30);
  const tree1Frames = buildFrameList("assets/intro/frames/tree1", 185);
  const tree2Frames = buildFrameList("assets/intro/frames/tree2", 20);
  const kallakFrames = buildFrameList("assets/intro/frames/kallak", 75);
  const malKalFrames = buildFrameList("assets/intro/frames/mal-kal", 325);
  const shoreFrames = buildFrameList("assets/intro/frames/shore", 12);
  const destructFrames = buildFrameList("assets/intro/frames/destruct", 44);
  const handFrames = buildLoopFrames(
    ["assets/intro/hand0.png", "assets/intro/hand1.png", "assets/intro/hand2.png", "assets/intro/hand1.png"],
    30
  );

  return [
    {
      id: "westwood",
      durationMs: westwoodFrames.length * slowFrameMs,
      fadeInMs: 0,
      fadeOutMs: 0,
      bgSrc: withBase("assets/intro/logo_bg.png"),
      frames: {
        src: westwoodFrames,
        frameDurationMs: baseFrameMs,
        loop: false,
        pos: { x: 0, y: 60 }
      }
    },
    {
      id: "kyrandia",
      durationMs: kyrandiaFrames.length * slowFrameMs,
      fadeInMs: 0,
      fadeOutMs: 0,
      bgSrc: withBase("assets/intro/logo_bg.png"),
      frames: {
        src: kyrandiaFrames,
        frameDurationMs: baseFrameMs,
        loop: false,
        pos: { x: 0, y: 48 }
      }
    },
    {
      id: "kyrandia_scroll",
      durationMs: 1800,
      scrollIntro: {
        baseSrc: withBase("assets/intro/scroll_bg.png"),
        bottomSrc: withBase("assets/intro/bottom.png"),
        distance: 112,
        baseY: 8,
        baseHeight: 168,
        bottomSrcY: 64
      }
    },
    {
      id: "kyrandia_fade",
      durationMs: Math.max(shoreFrames.length, destructFrames.length) * baseFrameMs,
      fadeInMs: 0,
      fadeOutMs: 0,
      frames: {
        src: shoreFrames,
        frameDurationMs: slowFrameMs,
        loop: true,
        pos: { x: 0, y: 8 }
      },
      overlayFrames: {
        src: destructFrames,
        frameDurationMs: slowFrameMs,
        loop: false,
        holdLast: true,
        pos: { x: 152, y: 56 }
      }
    },
    {
      id: "tree_anim_1",
      durationMs: tree1Frames.length * slowFrameMs,
      fadeInMs: 200,
      fadeOutMs: 0,
      frames: {
        src: tree1Frames,
        frameDurationMs: slowFrameMs,
        loop: false,
        pos: { x: 0, y: 8 }
      }
    },
    {
      id: "tree_anim_2",
      durationMs: tree2Frames.length * slowFrameMs,
      fadeInMs: 0,
      fadeOutMs: 200,
      frames: {
        src: tree2Frames,
        frameDurationMs: slowFrameMs,
        loop: false,
        pos: { x: 0, y: 8 }
      }
    },
    {
      id: "kallak_writing",
      durationMs: kallakFrames.length * slowFrameMs,
      fadeInMs: 250,
      fadeOutMs: 250,
      frames: {
        src: kallakFrames,
        frameDurationMs: slowFrameMs,
        loop: false,
        pos: { x: 0, y: 8 }
      },
      overlayFrames: {
        src: handFrames,
        frameDurationMs: slowFrameMs,
        loop: false,
        holdLast: false,
        pos: { x: 92, y: 20 }
      }
    },
    {
      id: "kallak_malcolm",
      bgSrc: withBase("assets/intro/gemcuti.png"),
      durationMs: malKalFrames.length * baseFrameMs,
      fadeInMs: 0,
      fadeOutMs: 250,
      frames: {
        src: malKalFrames,
        frameDurationMs: baseFrameMs,
        loop: false,
        pos: { x: 16, y: 58 }
      }
    }
  ];
}

export function playIntro(canvas: HTMLCanvasElement, steps: IntroStep[]): IntroPlayback {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      skip: () => {},
      stop: () => {},
      done: Promise.resolve()
    };
  }

  canvas.width = LOGICAL_WIDTH;
  canvas.height = LOGICAL_HEIGHT;

  const NO_UI_OVERLAY = new Set([
    "westwood",
    "kyrandia",
    "kyrandia_scroll",
    "kyrandia_fade"
  ]);

  const sources = new Map<string, Promise<HTMLImageElement>>();
  for (const step of steps) {
    if (step.bgSrc && !sources.has(step.bgSrc)) {
      sources.set(step.bgSrc, loadImage(step.bgSrc));
    }
    if (step.overlaySrc && !sources.has(step.overlaySrc)) {
      sources.set(step.overlaySrc, loadImage(step.overlaySrc));
    }
    if (step.frames) {
      for (const frameSrc of step.frames.src) {
        if (!sources.has(frameSrc)) {
          sources.set(frameSrc, loadImage(frameSrc));
        }
      }
    }
    if (step.overlayFrames) {
      for (const frameSrc of step.overlayFrames.src) {
        if (!sources.has(frameSrc)) {
          sources.set(frameSrc, loadImage(frameSrc));
        }
      }
    }
    if (step.scroll) {
      if (!sources.has(step.scroll.topSrc)) {
        sources.set(step.scroll.topSrc, loadImage(step.scroll.topSrc));
      }
      if (!sources.has(step.scroll.bottomSrc)) {
        sources.set(step.scroll.bottomSrc, loadImage(step.scroll.bottomSrc));
      }
    }
    if (step.scrollIntro) {
      if (!sources.has(step.scrollIntro.baseSrc)) {
        sources.set(step.scrollIntro.baseSrc, loadImage(step.scrollIntro.baseSrc));
      }
      if (!sources.has(step.scrollIntro.bottomSrc)) {
        sources.set(step.scrollIntro.bottomSrc, loadImage(step.scrollIntro.bottomSrc));
      }
    }
    if (step.scrollSlices) {
      if (!sources.has(step.scrollSlices.topSrc)) {
        sources.set(step.scrollSlices.topSrc, loadImage(step.scrollSlices.topSrc));
      }
      if (!sources.has(step.scrollSlices.bottomSrc)) {
        sources.set(step.scrollSlices.bottomSrc, loadImage(step.scrollSlices.bottomSrc));
      }
    }
  }

  let running = true;
  let skipRequested = false;
  let resolveDone: (() => void) | null = null;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  Promise.all(Array.from(sources.values()))
    .then((images) => {
      const imageMap = new Map<string, HTMLImageElement>();
      let idx = 0;
      for (const key of sources.keys()) {
        imageMap.set(key, images[idx++]);
      }

      let stepIndex = 0;
      let stepStart = performance.now();

      const drawText = (lines: string[]) => {
        ctx.save();
        ctx.font = "bold 14px 'Times New Roman', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#f2e6c9";
        ctx.shadowColor = "rgba(0, 0, 0, 0.75)";
        ctx.shadowBlur = 4;
        const startY = 146;
        const lineHeight = 16;
        lines.forEach((line, i) => {
          ctx.fillText(line, LOGICAL_WIDTH / 2, startY + i * lineHeight);
        });
        ctx.restore();
      };

      const loop = (now: number) => {
        if (!running) return;
        if (skipRequested) {
          running = false;
          resolveDone?.();
          return;
        }
        const step = steps[stepIndex];
        if (!step) {
          running = false;
          resolveDone?.();
          return;
        }

        const elapsed = now - stepStart;
        if (elapsed >= step.durationMs) {
          stepIndex += 1;
          stepStart = now;
          requestAnimationFrame(loop);
          return;
        }

        const fadeIn = step.fadeInMs ?? 0;
        const fadeOut = step.fadeOutMs ?? 0;
        let alpha = 1;
        if (fadeIn > 0 && elapsed < fadeIn) {
          alpha = elapsed / fadeIn;
        } else if (fadeOut > 0 && elapsed > step.durationMs - fadeOut) {
          alpha = Math.max(0, (step.durationMs - elapsed) / fadeOut);
        }

        ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

        ctx.save();
        ctx.globalAlpha = alpha;
        if (step.scrollIntro) {
          const base = imageMap.get(step.scrollIntro.baseSrc);
          const bottom = imageMap.get(step.scrollIntro.bottomSrc);
          const t = Math.min(1, Math.max(0, elapsed / step.durationMs));
          const distance = Math.round(step.scrollIntro.distance * t);
          const y1 = step.scrollIntro.baseY + distance;
          const h1 = step.scrollIntro.baseHeight - distance;
          const y2 = step.scrollIntro.baseY + step.scrollIntro.baseHeight - distance;
          const h2 = distance;
          if (base && h1 > 0) {
            ctx.drawImage(base, 0, y1, LOGICAL_WIDTH, h1, 0, step.scrollIntro.baseY, LOGICAL_WIDTH, h1);
          }
          if (bottom && h2 > 0) {
            ctx.drawImage(bottom, 0, step.scrollIntro.bottomSrcY, LOGICAL_WIDTH, h2, 0, y2, LOGICAL_WIDTH, h2);
          }
        } else if (step.scrollSlices) {
          const top = imageMap.get(step.scrollSlices.topSrc);
          const bottom = imageMap.get(step.scrollSlices.bottomSrc);
          const t = Math.min(1, Math.max(0, elapsed / step.durationMs));
          const offset = Math.round(step.scrollSlices.distance * t);
          const baseY = step.scrollSlices.baseY;
          if (bottom) {
            const s = step.scrollSlices.bottomSlice;
            ctx.drawImage(bottom, s.x, s.y, s.w, s.h, 0, baseY - offset, s.w, s.h);
          }
          if (top) {
            const s = step.scrollSlices.topSlice;
            ctx.drawImage(top, s.x, s.y, s.w, s.h, 0, baseY + step.scrollSlices.bottomSlice.h - offset, s.w, s.h);
          }
        } else if (step.scroll) {
          const top = imageMap.get(step.scroll.topSrc);
          const bottom = imageMap.get(step.scroll.bottomSrc);
          const t = Math.min(1, Math.max(0, elapsed / step.durationMs));
          const offset = Math.round(step.scroll.distance * t);
          if (top) ctx.drawImage(top, 0, -offset);
          if (bottom) ctx.drawImage(bottom, 0, LOGICAL_HEIGHT - offset);
        } else if (step.bgSrc) {
          const bg = imageMap.get(step.bgSrc);
          if (bg) ctx.drawImage(bg, 0, 0);
        }

        if (step.frames && step.frames.src.length) {
          const frameIdx = step.frames.loop
            ? Math.floor(elapsed / step.frames.frameDurationMs) % step.frames.src.length
            : Math.min(step.frames.src.length - 1, Math.floor(elapsed / step.frames.frameDurationMs));
          const frameSrc = step.frames.src[frameIdx];
          const frameImg = imageMap.get(frameSrc);
          const pos = step.frames.pos ?? { x: 0, y: 0 };
          if (frameImg) ctx.drawImage(frameImg, pos.x, pos.y);
        }
        if (step.overlayFrames && step.overlayFrames.src.length) {
          const overlayMaxTime = step.overlayFrames.src.length * step.overlayFrames.frameDurationMs;
          if (step.overlayFrames.loop || elapsed <= overlayMaxTime || step.overlayFrames.holdLast !== false) {
            const frameIdx = step.overlayFrames.loop
              ? Math.floor(elapsed / step.overlayFrames.frameDurationMs) % step.overlayFrames.src.length
              : Math.min(
                  step.overlayFrames.src.length - 1,
                  Math.floor(elapsed / step.overlayFrames.frameDurationMs)
                );
            const frameSrc = step.overlayFrames.src[frameIdx];
            const frameImg = imageMap.get(frameSrc);
            const pos = step.overlayFrames.pos ?? { x: 0, y: 0 };
            if (frameImg) ctx.drawImage(frameImg, pos.x, pos.y);
          }
        }

        if (step.overlaySrc) {
          const overlay = imageMap.get(step.overlaySrc);
          const pos = step.overlayPos ?? { x: 0, y: 0 };
          if (overlay) ctx.drawImage(overlay, pos.x, pos.y);
        }

        if (step.textLines && step.textLines.length) {
          drawText(step.textLines);
        }
        ctx.restore();

        // Mask the UI area like the original intro (black bar at the bottom).
        if (!NO_UI_OVERLAY.has(step.id)) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 136, LOGICAL_WIDTH, LOGICAL_HEIGHT - 136);
        }
        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    })
    .catch(() => {
      running = false;
      resolveDone?.();
    });

  return {
    skip: () => {
      skipRequested = true;
    },
    stop: () => {
      running = false;
      resolveDone?.();
    },
    done
  };
}

function buildFrameList(folder: string, count: number): string[] {
  const items: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const frame = String(i).padStart(4, "0");
    items.push(withBase(`${folder}/${frame}.png`));
  }
  return items;
}

function buildLoopFrames(sources: string[], count: number): string[] {
  const items: string[] = [];
  if (!sources.length) return items;
  for (let i = 0; i < count; i += 1) {
    items.push(withBase(sources[i % sources.length]));
  }
  return items;
}
