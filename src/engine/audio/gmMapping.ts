// ScummVM audio/mididrv.cpp, MidiDriver::_mt32ToGm. GPL-3.0-or-later.
// This is an APPROXIMATION: Kyrandia's custom MT-32 timbres cannot be represented
// faithfully by choosing General MIDI program numbers from an unrelated SF2 bank.
export const MT32_TO_GM = [
  0,1,0,2,4,4,5,3,16,17,18,16,16,19,20,21,
  6,6,6,7,7,7,8,112,62,62,63,63,38,38,39,39,
  88,95,52,98,97,99,14,54,102,96,53,102,81,100,14,80,
  48,48,49,45,41,40,42,42,43,46,45,24,25,28,27,104,
  32,32,34,33,36,37,35,35,79,73,72,72,74,75,64,65,
  66,67,71,71,68,69,70,22,56,59,57,57,60,60,58,61,
  61,11,11,98,14,9,14,13,12,107,107,77,78,78,76,76,
  47,117,127,118,118,116,115,119,115,112,55,124,123,0,14,117
];
