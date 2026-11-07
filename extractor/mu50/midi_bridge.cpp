// SPDX-License-Identifier: BSD-3-Clause
// KyraWeb: a bounded virtual MIDI-in port for the dedicated MU50 WASM build.
// This replaces the no-MIDI provider only in the external build checkout.
// It does not synthesize anything: bytes enter MAME's real MU50 serial interface.
#include "midi_module.h"
#include "modules/osdmodule.h"
#include "osdcore.h"

#include <cstdint>
#include <cstddef>
#include <deque>
#include <memory>
#include <string_view>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define KYRA_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define KYRA_EXPORT
#endif

namespace {
std::deque<std::uint8_t> midi_bytes;
constexpr std::size_t queue_limit = 32768;
}

extern "C" KYRA_EXPORT int kyra_mu50_midi_byte(unsigned int byte)
{
    if (byte > 255 || midi_bytes.size() >= queue_limit)
        return 0;
    midi_bytes.push_back(static_cast<std::uint8_t>(byte));
    return 1;
}

extern "C" KYRA_EXPORT unsigned int kyra_mu50_midi_pending()
{
    return static_cast<unsigned int>(midi_bytes.size());
}

extern "C" KYRA_EXPORT void kyra_mu50_midi_clear()
{
    midi_bytes.clear();
}

namespace osd {
namespace {
class kyra_input_port : public midi_input_port
{
public:
    bool poll() override { return !midi_bytes.empty(); }
    int read(std::uint8_t *out) override
    {
        int count = 0;
        while (!midi_bytes.empty() && count < 512) {
            out[count++] = midi_bytes.front();
            midi_bytes.pop_front();
        }
        return count;
    }
};

class none_module : public osd_module, public midi_module
{
public:
    none_module() : osd_module(OSD_MIDI_PROVIDER, "none"), midi_module() { }
    int init(osd_interface &osd, const osd_options &options) override { return 0; }
    void exit() override { midi_bytes.clear(); }
    std::unique_ptr<midi_input_port> create_input(std::string_view name) override
    {
        if (name != "kyraweb" && !name.empty())
            return nullptr;
        midi_bytes.clear();
        return std::make_unique<kyra_input_port>();
    }
    std::unique_ptr<midi_output_port> create_output(std::string_view name) override { return nullptr; }
    std::vector<midi_port_info> list_midi_ports() override
    {
        return { { "kyraweb", true, false, true, false } };
    }
};
} // anonymous namespace
} // namespace osd

MODULE_DEFINITION(MIDI_NONE, osd::none_module)
