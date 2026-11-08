// SPDX-License-Identifier: LGPL-2.1-or-later
#include <new>
#include "adl-driver.inc"

extern "C" {
#include "nukedopl.h"
}

// Copl's virtual destructor needs a deleting variant even with static storage.
void operator delete(void *, std::size_t) noexcept { __builtin_trap(); }

namespace {
class Opl2 : public Copl {
public:
  unsigned rate = 48000;
  opl3_chip chip;

  void write(int reg, int value) override { OPL3_WriteRegBuffered(&chip, reg, value); }
  void init() override { OPL3_Reset(&chip, rate); }
};

alignas(Opl2) uint8_t oplStorage[sizeof(Opl2)];
alignas(AdLibDriver) uint8_t driverStorage[sizeof(AdLibDriver)];
Opl2 *opl;
AdLibDriver *driver;
uint8_t bank[32768];
int16_t output[128 * 2];
int tickPhase;
}

extern "C" uint8_t *adl_bank() { return bank; }
extern "C" int16_t *adl_output() { return output; }

extern "C" void adl_play(unsigned size, unsigned track, unsigned rate, unsigned syncMask) {
  // ADL v3 uses a 120-byte track table followed by the program and instrument offsets.
  if (driver) driver->~AdLibDriver();
  if (!opl) opl = new (oplStorage) Opl2;
  opl->rate = rate;
  opl->init();
  driver = new (driverStorage) AdLibDriver(opl);
  driver->setVersion(3);
  driver->initDriver();
  driver->setSyncJumpMask(syncMask);
  tickPhase = 0;
  if (size < 1120 || size > sizeof(bank) || track >= 120 || bank[track] == 0xff) return;
  driver->setSoundData(bank + 120, size - 120);
  driver->startSound(bank[track], 255);
}

extern "C" void adl_render(int frames) {
  for (int offset = 0; offset < frames;) {
    if (tickPhase <= 0) {
      driver->callback();
      tickPhase += opl->rate;
    }
    const int remaining = frames - offset;
    const int untilTick = (tickPhase + 71) / 72;
    const int count = remaining < untilTick ? remaining : untilTick;
    OPL3_GenerateStream(&opl->chip, output + offset * 2, count);
    tickPhase -= count * 72;
    offset += count;
  }
}
