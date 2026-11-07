import test from 'node:test';
import assert from 'node:assert/strict';
import { MU50_ROMS, identifyMu50Rom, validateMu50RomSet } from '../extractor/mu50/roms.mjs';
test('MU50 metadata accepts the three known BIOS versions with the original two wave ROMs', () => {
  for (const bios of MU50_ROMS.filter((rom: { role: string }) => rom.role === 'bios')) {
    const result = validateMu50RomSet([bios, ...MU50_ROMS.filter((rom: { role: string }) => rom.role !== 'bios')]);
    assert.equal(result.bios, bios.version); assert.equal(result.bytes, 4.5 * 1024 * 1024);
    assert.equal(identifyMu50Rom(bios.sha1.toUpperCase(), bios.size)?.version, bios.version);
  }
});
test('MU50 ROM validation checks contents and size, not plausible filenames', () => {
  const bios = MU50_ROMS[0], waves = MU50_ROMS.slice(3);
  assert.throws(() => validateMu50RomSet([]), /exactly/);
  assert.throws(() => validateMu50RomSet([bios, bios, waves[0]]), /duplicate/);
  assert.throws(() => validateMu50RomSet([{ ...bios, name: 'xr174c0.ic7', sha1: '0'.repeat(40) }, ...waves]), /Unrecognized/);
  assert.equal(identifyMu50Rom(bios.sha1, bios.size - 1), undefined);
  assert.equal(identifyMu50Rom('a'.repeat(40), bios.size), undefined);
});
