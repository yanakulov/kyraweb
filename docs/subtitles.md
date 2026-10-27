# Intro subtitles and timing

**Language:** English | [Русский](subtitles.ru.md)

Kallak writing, Malcolm at the tree, and Kallak/Malcolm share one script clock for images and subtitles. `introTimeline.json` contains frame changes, hand poses, text positions, and explicit text-clear events decoded from the DOS floppy sequences. Loops are expanded before calculating timestamps. Wait commands use 60 Hz ticks; each opcode also includes ScummVM's 8 ms sequence yield. Dialogue is never stretched to the number of PNG frames.

Regenerate with `node extractor/intro_timeline.mjs /path/to/lok_dos.h`. Input: ScummVM's [DOS sequence resource](https://github.com/scummvm/scummvm/blob/master/devtools/create_kyradat/resources/lok_dos.h). Command semantics: [SeqPlayer](https://github.com/scummvm/scummvm/blob/master/engines/kyra/sequence/seqplayer_lok.cpp). English strings remain in `introText.json`.

The player emits active lines, including empty lists on gaps, cuts, stop, skip and completion. Canvas text is opt-in; the app uses `SubtitleOverlay.vue`. Text is laid out at logical 320×200 resolution, kept within screen edges, then scaled with the canvas. Talk text is bottom-anchored; letter text starts at y=180.

The main-menu demo repeats the first writing cycle without dialogue. Start resumes the full writing sequence, including all four letter lines. Debug scene selection plays without the menu. The hand and background use the same clock.

Run `npm test`, `npm run typecheck`, and `npm run build`. Tests cover timing, speaker anchors, subtitle gaps, demo exit, cancellation and frame boundaries. This is the DOS text sequence, not CD voice synchronization. Palette-transition duration, typewriter letter reveal and the existing PNG artwork offsets are not a pixel-perfect ScummVM implementation.
