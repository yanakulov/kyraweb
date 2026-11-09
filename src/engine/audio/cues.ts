// ScummVM engines/kyra/resource/staticres.cpp, KyraEngine_LoK::_dosTrackMap.
// SPDX-License-Identifier: GPL-3.0-or-later
import { isFaeriewoodRoom, isShadowrealmRoom } from '../core/constants';

export type MusicCue = { file: string; track: number };
export const MUSIC_FILES = ['KYRA1A', 'KYRA1B', 'KYRA2A', 'KYRA3A', 'KYRA4A', 'KYRA4B', 'KYRA5A', 'KYRA5B', 'KYRAMISC'];
const map = [
  -1,0,-1,1,0,3,0,2,0,4,1,2,1,3,1,4,1,92,1,6,1,7,2,2,2,3,2,4,2,5,2,6,2,7,3,3,3,4,1,8,
  1,9,4,2,4,3,4,4,4,5,4,6,4,7,4,8,1,11,1,12,1,14,1,13,4,9,5,12,6,2,6,6,6,7,6,8,6,9,6,3,
  6,4,6,5,7,2,7,3,7,4,7,5,7,6,7,7,7,8,7,9,8,2,8,3,8,4,8,5,6,11,5,11
];
export function wanderCue(command: number, currentFile = 'KYRA1B'): MusicCue | null {
  if (!Number.isInteger(command) || command < 0 || command * 2 + 1 >= map.length) throw new Error('Invalid music command');
  return command === 1 ? null : { file: MUSIC_FILES[map[command * 2]] ?? currentFile, track: map[command * 2 + 1] };
}
export function introCue(step: string): MusicCue | undefined {
  const track = ({ westwood: 2, tree_anim_1: 3, kallak_writing: 4, kallak_malcolm: 5 } as Record<string, number>)[step];
  return track === undefined ? undefined : { file: 'INTRO', track };
}

const roomCommands: Record<number, number> = { 0: 41, 2: 5, 7: 3, 8: 7, 27: 12, 36: 4, 45: 22, 113: 18 };
export function roomMusicCommand(room: number, wisp = false) {
  return roomCommands[room] ?? (isFaeriewoodRoom(room) ? 21 : isShadowrealmRoom(room) ? (wisp ? 17 : 3) : room >= 17 ? 11 : 2);
}
