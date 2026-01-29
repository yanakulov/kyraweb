import type { MaskData, SceneEmc, SceneMeta, SceneShapesData } from "./types";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export async function loadMask(src: string): Promise<MaskData> {
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to load mask: ${src}`);
  }
  const data = await res.json();
  return {
    width: data.width,
    height: data.height,
    pixels: data.pixels
  };
}

export async function loadSceneMeta(src: string): Promise<SceneMeta> {
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to load scene meta: ${src}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.drawLayerTable)) {
    throw new Error(`Scene meta missing drawLayerTable: ${src}`);
  }
  return {
    drawLayerTable: data.drawLayerTable.map((v: number) => Number(v) || 0),
    spriteDefs: Array.isArray(data.spriteDefs) ? data.spriteDefs : [],
    anims: Array.isArray(data.anims) ? data.anims : []
  };
}

export async function loadSceneShapes(src: string): Promise<SceneShapesData> {
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to load scene shapes: ${src}`);
  }
  const data = await res.json();
  return {
    width: Number(data.width) || 0,
    height: Number(data.height) || 0,
    palette: Array.isArray(data.palette) ? data.palette : [],
    rawBase64: String(data.rawBase64 || "")
  };
}

export async function loadSceneEmc(src: string): Promise<SceneEmc> {
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to load scene emc: ${src}`);
  }
  const data = await res.json();
  return {
    sceneAnimShapes: Array.isArray(data.sceneAnimShapes) ? data.sceneAnimShapes : []
  };
}

export async function loadEmcTextStrings(src: string): Promise<string[]> {
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to load emc text: ${src}`);
  }
  const buffer = await res.arrayBuffer();
  return parseEmcTextStrings(new Uint8Array(buffer));
}

export async function loadNpcTextJson(src: string): Promise<string[]> {
  const res = await fetch(src);
  if (!res.ok) {
    throw new Error(`Failed to load npc text: ${src}`);
  }
  const data = await res.json();
  return Array.isArray(data.strings) ? data.strings.map((s: unknown) => String(s ?? "")) : [];
}

export function decodeBase64Bytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i) & 0xFF;
  }
  return bytes;
}

function parseEmcTextStrings(bytes: Uint8Array): string[] {
  const textChunk = findIffChunk(bytes, "TEXT");
  if (!textChunk) return [];

  const offsets: number[] = [];
  let minOffset = textChunk.length;
  for (let i = 0; i + 1 < textChunk.length; i += 2) {
    const off = (textChunk[i] << 8) | textChunk[i + 1];
    offsets.push(off);
    if (off !== 0 && off < minOffset) {
      minOffset = off;
    }
  }

  if (minOffset === textChunk.length || minOffset === 0) return [];
  const tableEntries = Math.min(offsets.length, Math.floor(minOffset / 2));
  const decoder = new TextDecoder("latin1");
  const strings: string[] = [];
  for (let i = 0; i < tableEntries; i++) {
    const off = offsets[i];
    if (!off) {
      strings.push("");
      continue;
    }
    let end = off;
    while (end < textChunk.length && textChunk[end] !== 0) end += 1;
    const raw = textChunk.subarray(off, end);
    const value = decoder.decode(raw).replace(/\r/g, " ").trim();
    strings.push(value);
  }
  return strings;
}

function findIffChunk(bytes: Uint8Array, tag: string): Uint8Array | null {
  if (bytes.length < 12) return null;
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "FORM") return null;
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const chunkTag = String.fromCharCode(bytes[pos], bytes[pos + 1], bytes[pos + 2], bytes[pos + 3]);
    const size =
      (bytes[pos + 4] << 24) |
      (bytes[pos + 5] << 16) |
      (bytes[pos + 6] << 8) |
      bytes[pos + 7];
    pos += 8;
    if (pos + size > bytes.length) break;
    const chunk = bytes.subarray(pos, pos + size);
    if (chunkTag === tag) return chunk;
    pos += size + (size % 2);
  }
  return null;
}
