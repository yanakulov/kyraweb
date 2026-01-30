import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../core/constants";
import { loadImage, loadSceneMeta, loadSceneShapes } from "../core/assets";
import { buildSceneAnimStates, drawSceneAnims, updateSceneAnims } from "../scene/sceneAnims";
import { buildSceneShapesCanvas, buildSpriteDefMap } from "../scene/sceneShapes";
import type { SceneAnimState, SceneMeta, SceneShapesData, SceneSpriteDef } from "../core/types";
import type { IntroPlayback, IntroStep } from "./types";

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
    "story_text",
    "shore_anim",
    "shore_destruct"
  ]);

  const sources = new Map<string, Promise<HTMLImageElement>>();
  const sceneMetaSources = new Map<string, Promise<SceneMeta>>();
  const sceneShapesSources = new Map<string, Promise<SceneShapesData>>();
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
    if (step.bgFrames) {
      for (const frameSrc of step.bgFrames.src) {
        if (!sources.has(frameSrc)) {
          sources.set(frameSrc, loadImage(frameSrc));
        }
      }
    }
    if (step.overlayFrames) {
      for (const frameSrc of step.overlayFrames.src) {
        if (!frameSrc) continue;
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
    if (step.sceneAnim) {
      if (!sceneMetaSources.has(step.sceneAnim.metaSrc)) {
        sceneMetaSources.set(step.sceneAnim.metaSrc, loadSceneMeta(step.sceneAnim.metaSrc));
      }
      if (!sceneShapesSources.has(step.sceneAnim.shapesSrc)) {
        sceneShapesSources.set(step.sceneAnim.shapesSrc, loadSceneShapes(step.sceneAnim.shapesSrc));
      }
    }
  }

  let running = true;
  let skipRequested = false;
  let resolveDone: (() => void) | null = null;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const imageKeys = Array.from(sources.keys());
  const sceneMetaKeys = Array.from(sceneMetaSources.keys());
  const sceneShapesKeys = Array.from(sceneShapesSources.keys());

  Promise.all([
    ...Array.from(sources.values()),
    ...Array.from(sceneMetaSources.values()),
    ...Array.from(sceneShapesSources.values())
  ])
    .then((images) => {
      const imageMap = new Map<string, HTMLImageElement>();
      let idx = 0;
      for (const key of imageKeys) {
        imageMap.set(key, images[idx++] as HTMLImageElement);
      }
      const sceneMetaMap = new Map<string, SceneMeta>();
      for (const key of sceneMetaKeys) {
        sceneMetaMap.set(key, images[idx++] as SceneMeta);
      }
      const sceneShapesMap = new Map<string, HTMLCanvasElement>();
      for (const key of sceneShapesKeys) {
        const data = images[idx++] as SceneShapesData;
        sceneShapesMap.set(key, buildSceneShapesCanvas(data));
      }
      const spriteDefMapCache = new Map<string, Map<number, SceneSpriteDef>>();
      for (const [key, meta] of sceneMetaMap) {
        spriteDefMapCache.set(key, buildSpriteDefMap(meta.spriteDefs));
      }

      let stepIndex = 0;
      let stepStart = performance.now();
      let activeSceneAnim: {
        anims: SceneAnimState[];
        spriteDefMap: Map<number, SceneSpriteDef>;
        shapesImage: CanvasImageSource;
      } | null = null;
      let activeSceneAnimStep: string | null = null;

      const drawText = (lines: string[]) => {
        ctx.save();
        ctx.font = "14px 'Kyrandia', 'Times New Roman', serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#f2e6c9";
        const startY = 146;
        const lineHeight = 16;
        lines.forEach((line, i) => {
          ctx.fillText(line, LOGICAL_WIDTH / 2, startY + i * lineHeight);
        });
        ctx.restore();
      };
      const drawFooterText = (text: string, y: number) => {
        ctx.save();
        ctx.font = "12px 'Kyrandia', 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#f2f2f2";
        ctx.fillText(text, LOGICAL_WIDTH / 2, y);
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

        if (step.id !== activeSceneAnimStep) {
          activeSceneAnimStep = step.id;
          if (step.sceneAnim) {
            const meta = sceneMetaMap.get(step.sceneAnim.metaSrc);
            const shapes = sceneShapesMap.get(step.sceneAnim.shapesSrc);
            const spriteDefMap = spriteDefMapCache.get(step.sceneAnim.metaSrc);
            if (meta && shapes && spriteDefMap) {
              const animDefs = step.sceneAnim.animIndices?.length
                ? step.sceneAnim.animIndices
                    .map((idx) => meta.anims[idx])
                    .filter((anim): anim is NonNullable<typeof anim> => Boolean(anim))
                : meta.anims;
              activeSceneAnim = {
                anims: buildSceneAnimStates(animDefs),
                spriteDefMap,
                shapesImage: shapes
              };
            } else {
              activeSceneAnim = null;
            }
          } else {
            activeSceneAnim = null;
          }
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

        if (activeSceneAnim) {
          updateSceneAnims(activeSceneAnim.anims, now);
          drawSceneAnims(ctx, activeSceneAnim.shapesImage, activeSceneAnim.spriteDefMap, activeSceneAnim.anims);
        }

        if (step.bgFrames && step.bgFrames.src.length) {
          const frameIdx = step.bgFrames.loop
            ? Math.floor(elapsed / step.bgFrames.frameDurationMs) % step.bgFrames.src.length
            : Math.min(step.bgFrames.src.length - 1, Math.floor(elapsed / step.bgFrames.frameDurationMs));
          const frameSrc = step.bgFrames.src[frameIdx];
          const frameImg = imageMap.get(frameSrc);
          const pos = step.bgFrames.pos ?? { x: 0, y: 0 };
          if (frameImg) ctx.drawImage(frameImg, pos.x, pos.y);
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
            if (frameSrc) {
              const frameImg = imageMap.get(frameSrc);
              const pos = step.overlayFrames.pos ?? { x: 0, y: 0 };
              let drawX = pos.x;
              let drawY = pos.y;
              const oscillateX = step.overlayFrames.oscillateX;
              if (oscillateX && oscillateX.periodMs > 0) {
                const t = (elapsed % oscillateX.periodMs) / oscillateX.periodMs;
                const tri = t < 0.5 ? t * 2 : (1 - t) * 2;
                drawX = Math.round(drawX + tri * oscillateX.amplitude);
              }
              if (frameImg) ctx.drawImage(frameImg, drawX, drawY);
            }
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
        if (step.footerText) {
          drawFooterText(step.footerText, step.footerTextY ?? 179);
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
