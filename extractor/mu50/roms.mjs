// Firmware metadata from MAME src/mame/yamaha/ymmu50.cpp (BSD-3-Clause).
// No Yamaha firmware bytes are included. Hashes refer to the original unswapped dumps.
export const MU50_ROMS = [
  { role: 'bios', version: '1.05', name: 'xr174c0.ic7', size: 0x80000, sha1: '9ca892920598f9fdf08544dac4c0e54e7d46ee3c' },
  { role: 'bios', version: '1.04', name: 'yamaha_mu50.bin', size: 0x80000, sha1: '58c41f10d292cac35ef0e8f93029fbc4685df586' },
  { role: 'bios', version: '1.02', name: 'xq332e0.bin', size: 0x80000, sha1: '74bb630f8cc575e059cc52cd43b3310e09f26a49' },
  { role: 'wave-a', name: 'xq057c0.ic18', size: 0x200000, sha1: '32f653c7644d060f5a6d63a435ae3a7412386d92' },
  { role: 'wave-b', name: 'xq058c0.ic19', size: 0x200000, sha1: 'adf68689b4842ec5bc9b0ea1bb99cf66d2dec4de' }
];
export function identifyMu50Rom(sha1, size) {
  return MU50_ROMS.find(rom => rom.sha1 === String(sha1).toLowerCase() && rom.size === size);
}
export function validateMu50RomSet(entries) {
  if (entries.length !== 3) throw new Error('MU50 needs exactly one BIOS and two wave ROMs (4.5 MiB total).');
  const identified = entries.map(entry => {
    const rom = identifyMu50Rom(entry.sha1, entry.size);
    if (!rom) throw new Error(`Unrecognized MU50 ROM contents: ${entry.name ?? 'unnamed file'}`);
    return rom;
  });
  if (new Set(identified.map(rom => rom.role)).size !== 3) throw new Error('MU50 needs one BIOS, wave-a and wave-b; duplicate roles are not accepted.');
  return { bios: identified.find(rom => rom.role === 'bios').version, bytes: identified.reduce((sum, rom) => sum + rom.size, 0), roms: identified };
}
