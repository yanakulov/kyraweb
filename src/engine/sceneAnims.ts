import { TICK_MS } from "./constants";
import type { SceneAnimDef, SceneAnimState, SceneSpriteDef } from "./types";

export function buildSceneAnimStates(anims: SceneAnimDef[]): SceneAnimState[] {
  return anims
    .filter((anim) => anim.script && anim.script.length > 0)
    .map((anim) => ({
      sprite: anim.sprite,
      x: anim.defaultX,
      y: anim.defaultY,
      defaultX: anim.defaultX,
      defaultY: anim.defaultY,
      flipX: anim.flipX,
      play: anim.play,
      script: anim.script,
      ip: 0,
      nextRun: 0
    }));
}

export function updateSceneAnims(anims: SceneAnimState[], nowMs: number) {
  for (let i = 0; i < anims.length; i++) {
    const anim = anims[i];
    if (!anim.play) continue;
    if (anim.nextRun && anim.nextRun > nowMs) continue;

    const script = anim.script;
    if (!script.length) continue;

    const startIp = anim.ip;
    let ip = startIp;
    let update = true;
    const opcode = script[ip++] ?? 0xFF87;

    switch (opcode) {
      case 0xFF88: {
        anim.sprite = script[ip++] ?? anim.sprite;
        ip++; // unused
        anim.x = script[ip++] ?? anim.x;
        anim.y = script[ip++] ?? anim.y;
        anim.flipX = false;
        break;
      }
      case 0xFF8D: {
        anim.sprite = script[ip++] ?? anim.sprite;
        ip++; // unused
        anim.x = script[ip++] ?? anim.x;
        anim.y = script[ip++] ?? anim.y;
        anim.flipX = true;
        break;
      }
      case 0xFF8A: {
        const wait = script[ip++] ?? 0;
        anim.nextRun = nowMs + wait * TICK_MS;
        break;
      }
      case 0xFF8C: {
        update = anim.nextRun < nowMs;
        break;
      }
      case 0xFF8B: {
        ip = 0;
        anim.nextRun = nowMs;
        break;
      }
      case 0xFF90: {
        anim.sprite = script[ip++] ?? anim.sprite;
        ip++; // unused
        anim.x = anim.defaultX;
        anim.y = anim.defaultY;
        anim.flipX = false;
        break;
      }
      case 0xFF91: {
        anim.sprite = script[ip++] ?? anim.sprite;
        ip++; // unused
        anim.x = anim.defaultX;
        anim.y = anim.defaultY;
        anim.flipX = true;
        break;
      }
      case 0xFF97: {
        anim.defaultX = script[ip++] ?? anim.defaultX;
        break;
      }
      case 0xFF98: {
        anim.defaultY = script[ip++] ?? anim.defaultY;
        break;
      }
      case 0xFF92: {
        anim.defaultX += script[ip++] ?? 0;
        break;
      }
      case 0xFF93: {
        anim.defaultY += script[ip++] ?? 0;
        break;
      }
      case 0xFF94: {
        anim.defaultX -= script[ip++] ?? 0;
        break;
      }
      case 0xFF95: {
        anim.defaultY -= script[ip++] ?? 0;
        break;
      }
      case 0xFF96: {
        const animIndex = script[ip++] ?? -1;
        if (anims[animIndex]) {
          anims[animIndex].play = false;
          anims[animIndex].sprite = -1;
        }
        break;
      }
      case 0xFFA7: {
        const animIndex = script[ip++] ?? -1;
        if (anims[animIndex]) anims[animIndex].play = true;
        break;
      }
      case 0xFF87:
      default: {
        anim.play = false;
        update = false;
        break;
      }
    }

    if (update) {
      anim.ip = ip;
    } else {
      anim.ip = startIp;
    }

    if (anim.ip < script.length && script[anim.ip] === 0xFF87) {
      anim.play = false;
    }
  }
}

export function drawSceneAnims(
  ctx: CanvasRenderingContext2D,
  bg: CanvasImageSource,
  spriteDefMap: Map<number, SceneSpriteDef>,
  anims: SceneAnimState[]
) {
  for (const anim of anims) {
    if (!anim.play || anim.sprite < 0) continue;
    const def = spriteDefMap.get(anim.sprite);
    if (!def) continue;
    if (anim.flipX) {
      ctx.save();
      ctx.translate(anim.x + def.w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(bg, def.x, def.y, def.w, def.h, 0, anim.y, def.w, def.h);
      ctx.restore();
    } else {
      ctx.drawImage(bg, def.x, def.y, def.w, def.h, anim.x, anim.y, def.w, def.h);
    }
  }
}
