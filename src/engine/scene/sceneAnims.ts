import { TICK_MS } from "../core/constants";
import type { SceneAnimDef, SceneAnimState, SceneSpriteDef } from "../core/types";

export function buildSceneAnimStates(anims: SceneAnimDef[]): SceneAnimState[] {
  return anims
    .map((anim) => ({
      sprite: anim.sprite,
      x: anim.defaultX,
      y: anim.defaultY,
      renderX: anim.defaultX,
      renderY: anim.defaultY,
      defaultX: anim.defaultX,
      defaultY: anim.defaultY,
      flipX: anim.flipX,
      play: anim.play, visible: anim.play,
      script: anim.script,
      ip: 0,
      nextRun: 0, lastRefresh: 0, loopsLeft: 0, loopStart: 0
    }));
}

export function updateSceneAnims(anims: SceneAnimState[], nowMs: number, actor?: (opcode:number,value:number)=>void, sound?: (track:number)=>void, random = Math.random) {
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
      case 0xFF88:
      case 0xFF8D: {
        anim.sprite = script[ip++] ?? anim.sprite;
        ip++; // unused
        anim.renderX = anim.x = script[ip++] ?? anim.x;
        anim.renderY = anim.y = script[ip++] ?? anim.y;
        anim.flipX = opcode === 0xFF8D;
        anim.lastRefresh = nowMs;
        break;
      }
      case 0xFF8A: {
        const wait = script[ip++] ?? 0;
        anim.nextRun = anim.lastRefresh + wait * TICK_MS;
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
      case 0xFF90:
      case 0xFF91: {
        anim.sprite = script[ip++] ?? anim.sprite;
        // DAT moves the working coordinates separately from refreshing the visible frame.
        anim.renderX = anim.x;
        anim.renderY = anim.y;
        anim.flipX = opcode === 0xFF91;
        anim.lastRefresh = nowMs;
        break;
      }
      case 0xFF97: {
        anim.x = script[ip++] ?? anim.x;
        break;
      }
      case 0xFF98: {
        anim.y = script[ip++] ?? anim.y;
        break;
      }
      case 0xFF92: {
        anim.x += script[ip++] ?? 0;
        break;
      }
      case 0xFF93: {
        anim.y += script[ip++] ?? 0;
        break;
      }
      case 0xFF94: {
        anim.x -= script[ip++] ?? 0;
        break;
      }
      case 0xFF95: {
        anim.y -= script[ip++] ?? 0;
        break;
      }
      case 0xFF96: {
        const animIndex = script[ip++] ?? -1;
        if (anims[animIndex]) {
          anims[animIndex].play = false;
          // Stopping the interpreter retains the animator’s last drawn shape.
        }
        break;
      }
      case 0xFFA7: {
        const animIndex = script[ip++] ?? -1;
        if (anims[animIndex]) anims[animIndex].play = true;
        break;
      }
      case 0xFF8E: anim.loopsLeft=script[ip++];anim.loopStart=ip;break;
      case 0xFF8F: if(anim.loopsLeft>0){anim.loopsLeft--;ip=anim.loopStart;}break;
      case 0xFFB3: {const min=script[ip++],max=script[ip++];anim.nextRun=anim.lastRefresh+(min+Math.floor(random()*(max-min+1)))*TICK_MS;break;}
      case 0xFFB0: { const track=script[ip++];sound?.(track);break; }
      case 0xFFB4: { const track=script[ip++],percent=script[ip++];if(Math.floor(random()*101)<=percent)sound?.(track);break; }
      case 0xFF99:case 0xFF9A:case 0xFFB1:case 0xFFB2:break;
      case 0xFFAD:case 0xFFAE:case 0xFFAF: { const value=script[ip++];actor?.(opcode,value);break; }
      case 0xFFAA:case 0xFFAB: actor?.(opcode,0);break;
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
    if (!anim.visible || anim.sprite < 0) continue;
    const def = spriteDefMap.get(anim.sprite);
    if (!def) continue;
    const x = anim.renderX ?? anim.x, y = anim.renderY ?? anim.y;
    if (anim.flipX) {
      ctx.save();
      ctx.translate(x + def.w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(bg, def.x, def.y, def.w, def.h, 0, y, def.w, def.h);
      ctx.restore();
    } else {
      ctx.drawImage(bg, def.x, def.y, def.w, def.h, x, y, def.w, def.h);
    }
  }
}
