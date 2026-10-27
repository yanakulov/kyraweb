// Decode the DOS floppy sequence timing documented by ScummVM's SeqPlayer.
// Usage: node extractor/intro_timeline.mjs /path/to/lok_dos.h
// Source: https://github.com/scummvm/scummvm/blob/master/devtools/create_kyradat/resources/lok_dos.h
// Opcode semantics: engines/kyra/sequence/seqplayer_lok.cpp (ScummVM).
import fs from "node:fs";

const source = fs.readFileSync(process.argv[2], "utf8");
const sizes = [3, 2, 6, 2, 2, 5, 3, 3, 1, 1, 2, 4, 2, 2, 1, 2, 6, 1, 1, 1, 1, 3, 2, 9, 2, 2, 1, 1, 1, 1];
const movieNames = ["kallak", "tree1", "tree2", "westwood", "mal-kal"];
const frameCounts = [75, 185, 20, 23, 325];
const output = {};
const round = (n) => Math.round(n * 1000) / 1000;
for (const name of ["KallakWriting", "MalcolmTree", "KallakMalcolm"]) {
  const match = source.match(new RegExp(`k1${name}SeqDOS\\[\\d+\\] = \\{([\\s\\S]*?)\\};`));
  if (!match) throw new Error(`Missing sequence ${name}`);
  const bytes = [...match[1].matchAll(/0x([\da-f]+)/gi)].map((m) => parseInt(m[1], 16));
  let ip = 0, time = 0, activeMovie = 0, activeSubtitle = null;
  let hand = null;
  const loops = [], movies = [], subtitles = [], tracks = {};
  const closeText = () => {
    if (activeSubtitle) activeSubtitle.endMs = round(time);
    activeSubtitle = null;
  };
  const display = () => {
    const movie = movies[activeMovie];
    if (!movie) return;
    const track = tracks[movieNames[activeMovie]] ??= { startMs: round(time), frames: [], hand: [] };
    const previous = track.frames.at(-1);
    if (!previous || previous[1] !== movie.frame) track.frames.push([round(time), movie.frame]);
    if (activeMovie === 0 && hand && movie.frame < 30) {
      const previousHand = track.hand.at(-1);
      if (!previousHand || previousHand.slice(1).join() !== hand.join()) track.hand.push([round(time), ...hand]);
    } else if (track.hand.length && track.hand.at(-1)[1] !== -1) {
      track.hand.push([round(time), -1, 0, 0]);
    }
  };
  for (let guard = 0; ip < bytes.length; guard++) {
    if (guard > 100000) throw new Error(`Unbounded sequence ${name}`);
    const op = bytes[ip];
    if (!sizes[op]) throw new Error(`Unknown opcode ${op} at ${ip}`);
    const p = bytes.slice(ip + 1, ip + sizes[op]);
    ip += sizes[op];
    if (op === 0) { activeMovie = p[0]; movies[p[0]] = { frame: 0, offscreen: p[1] !== 0 }; }
    if (op === 2 || op === 3 || op === 4) {
      activeMovie = p[0];
      const movie = movies[activeMovie];
      movie.frame = op === 2 ? p[1] : (movie.frame + (op === 3 ? 1 : frameCounts[activeMovie] - 1)) % frameCounts[activeMovie];
      if (!movie.offscreen) display();
    }
    if (op === 5) hand = [p[0], p[1] + 256 * p[2], p[3]];
    if (op === 7 || op === 9) display();
    if (op === 6 || op === 7) time += (p[0] + 256 * p[1]) * 1000 / 60;
    if (op === 10) loops[p[0]] = { ip, count: null };
    if (op === 11) {
      const loop = loops[p[0]];
      if (loop.count === null) loop.count = p[1] + 256 * p[2];
      if (loop.count-- > 0) ip = loop.ip;
      else loop.count = null;
    }
    if (op === 15 || op === 16) {
      closeText();
      activeSubtitle = { startMs: round(time), endMs: 0, textId: p[0], x: op === 15 ? 160 : p[1] + 256 * p[2], y: op === 15 ? 180 : p[3], type: op === 15 ? "text" : "talk" };
      subtitles.push(activeSubtitle);
    }
    if (op === 17 || op === 18) closeText();
    // SeqPlayer yields 8 ms after every command, including explicit waits.
    time += 8;
    if (op === 29) break;
  }
  closeText();
  output[name] = { durationMs: round(time), tracks, subtitles };
}
fs.writeFileSync(new URL("../src/engine/intro/introTimeline.json", import.meta.url), JSON.stringify(output, null, 2) + "\n");
