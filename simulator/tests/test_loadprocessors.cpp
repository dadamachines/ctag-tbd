// Smoke test: construct + Init + LoadPreset + Process(once) for one (or every)
// sound processor — catches "loading plugin X crashes the simulator" bugs
// without needing an audio device.  Build: target `load-test` (see CMakeLists).
// Usage:  ./load-test [PluginId]      (default: GrooveBoxRack)
//         ./load-test --all           (every registered sound processor)
//         ./load-test --machine <id>  (load GrooveBoxRack, isolate one voice,
//                                      fire a note, report dry & FX-bus peak)
//
// The --machine mode is the fast iteration loop when you're tuning a single rack
// voice's DSP.  It uses a small id→(track, channel, drumnote) table; when adding
// a new voice via rackgen.js, append one line there to make it testable.

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>
#include "ctagSoundProcessor.hpp"
#include "ctagSoundProcessorFactory.hpp"
#include "ctagSPAllocator.hpp"
#include "ctagSoundProcessorGrooveBoxRack.hpp"
#include "helpers/ctagSampleRom.hpp"
#include "rapidjson/document.h"
extern "C" {
#include "esp_spi_flash.h"
}

using namespace CTAG::SP;

// VoiceLookup table — populated at startup from synthdefinitions.json (the same
// file the WebUI and the MacroTranslator both source from).  For each track, every
// machine id that has a per-track voice gets one entry: the track index, the MIDI
// channel (0-based), and a note number to play.  Drum tracks all share a "drumnote";
// synth tracks just use note 60 as a default pitch.
//
// "ro" is the rompler — every track has one, so the id alone is ambiguous.  Disambig
// by appending "_t<N>" (e.g. ro_t7).  Bare id "ro" defaults to the first track with
// a rompler.  "nodrum"/"nosynth"/"extdrum"/"extsynth"/"inp" are placeholders without
// a real voice — they're filtered out at load time.
//
// Used only by --machine mode; the default and --all modes don't need this table.
struct VoiceLookup { std::string id; int track; int channel; int note; };
static std::vector<VoiceLookup> g_voices;

// Try to load + parse synthdefinitions.json at process startup.  Returns true on
// success.  We fall back to "feature unavailable" rather than aborting load-test
// if the file is missing — the default + --all modes don't need this.
static bool loadVoiceTableFromSynthdef() {
    g_voices.clear();
    // load-test runs from simulator/build; synthdefinitions.json lives at
    // ../../sdcard_image/factory/synthdefinitions.json (same relative path the rest
    // of the simulator uses; see SimSPManager.cpp).
    const char* path = "../../sdcard_image/factory/synthdefinitions.json";
    std::ifstream in(path);
    if (!in) return false;
    std::stringstream ss; ss << in.rdbuf();
    rapidjson::Document d;
    if (d.Parse(ss.str().c_str()).HasParseError()) return false;
    if (!d.IsObject() || !d.HasMember("tracks") || !d["tracks"].IsArray()) return false;

    // Skip ids that have no per-track DSP voice (they're just UI placeholders).
    static const char* skip[] = { "nodrum", "nosynth", "extdrum", "extsynth", "inp", nullptr };
    auto isSkip = [&](const std::string& id) {
        for (const char** s = skip; *s; s++) if (id == *s) return true;
        return false;
    };

    for (auto& t : d["tracks"].GetArray()) {
        if (!t.IsObject()) continue;
        if (!t.HasMember("index") || !t["index"].IsInt()) continue;
        const int trackIdx = t["index"].GetInt();
        const std::string type = t.HasMember("type") && t["type"].IsString()
                                    ? t["type"].GetString() : "";
        // Skip bus FX (tracks 16/17/18) — they aren't dispatched by handleMidiNoteOn
        // and don't make sense in --machine isolation mode.
        if (type == "fx") continue;
        const int chan     = t.HasMember("midichannel") && t["midichannel"].IsInt()
                                ? t["midichannel"].GetInt() : -1;
        // drum tracks use the track's drumnote; synth tracks default to 60 (~C4).
        const int note = (type == "drum" && t.HasMember("drumnote") && t["drumnote"].IsInt())
                            ? t["drumnote"].GetInt() : 60;
        if (!t.HasMember("machines") || !t["machines"].IsArray()) continue;
        for (auto& m : t["machines"].GetArray()) {
            if (!m.IsString()) continue;
            std::string id = m.GetString();
            if (isSkip(id)) continue;
            g_voices.push_back({ id, trackIdx, chan, note });
        }
    }
    return !g_voices.empty();
}

// Look up a voice by user-supplied id.  Three matching modes, tried in order:
//   1. exact match against "<id>_t<N>"  (unambiguous, picks track N)
//   2. exact match against the bare id  (works iff that id is unique across tracks,
//                                         e.g. "db" only exists on track 0)
//   3. first-match against the bare id  (fallback for ambiguous ids like "ro")
static const VoiceLookup* findVoice(const std::string& id) {
    // Try "id_tN" disambiguation first.
    auto pos = id.find("_t");
    if (pos != std::string::npos) {
        std::string bare = id.substr(0, pos);
        int wantTrack = std::atoi(id.c_str() + pos + 2);
        for (const auto& v : g_voices) {
            if (v.id == bare && v.track == wantTrack) return &v;
        }
        return nullptr;
    }
    // Bare id: count matches.  If exactly one, return it; otherwise return first.
    const VoiceLookup* first = nullptr;
    int count = 0;
    for (const auto& v : g_voices) {
        if (v.id == id) { if (!first) first = &v; count++; }
    }
    return first;     // null if no match
}

// Pretty-print every known voice (for the error message when an unknown id is given).
static void listKnownVoices() {
    std::vector<std::string> seen;
    for (const auto& v : g_voices) {
        // bare id (always)
        if (std::find(seen.begin(), seen.end(), v.id) == seen.end()) {
            seen.push_back(v.id);
        }
    }
    std::sort(seen.begin(), seen.end());
    printf("Try one of: ");
    for (size_t i = 0; i < seen.size(); i++) {
        if (i) printf(", ");
        printf("%s", seen[i].c_str());
    }
    printf("\n(ambiguous ids like \"ro\" need a \"_t<N>\" suffix to pick the track;\n"
           " e.g. ./load-test --machine ro_t7 for the CH08 sampler-only track.)\n");
}

// the simulator defines this in SimSPManager.cpp; the load-test doesn't link that
namespace CTAG { namespace RESOURCES { std::string sdcardRoot {"../../sdcard_image"}; } }

static float blockPeak(const float* buf, int frames) {
    float p = 0.f;
    for (int i = 0; i < frames * 2; i++) { float a = buf[i] < 0 ? -buf[i] : buf[i]; if (a > p) p = a; }
    return p;
}

static int test_one(const std::string& id) {
    printf("=== load-test: %s ===\n", id.c_str()); fflush(stdout);
    // most rack/sample plugins are stereo → allocate STEREO (matches SimSPManager)
    auto aType = ctagSPAllocator::AllocationType::STEREO;
    printf("  Create()...\n"); fflush(stdout);
    ctagSoundProcessor* sp = ctagSoundProcessorFactory::Create(id, aType);
    if (sp == nullptr) { printf("  -> Create returned nullptr (not stereo? unknown id?)\n"); return 0; }
    printf("  LoadPreset(0)...\n"); fflush(stdout);
    sp->LoadPreset(0);
    printf("  Process()...\n"); fflush(stdout);
    float buf[32 * 2];
    float cv[4] = {0,0,0,0};
    uint8_t trig[2] = {0,0};
    ProcessData pd;
    pd.buf = buf; pd.cv = cv; pd.trig = trig;
    pd.sequencer_tempo = 12000; pd.sequencer_quantum = 4;
    pd.midi_bytes_length = 0; memset(pd.midi_bytes, 0, sizeof(pd.midi_bytes));
    for (int i = 0; i < 4; i++) { memset(buf, 0, sizeof(buf)); sp->Process(pd); }

    // For GrooveBoxRack: inject a few MIDI notes (kick=36, snare=38 on ch 10; a melodic
    // note on ch 1) and check that something actually comes out — exercises the whole
    // parseIncomingMidiMessages → handleMidiNoteOn → voice → mix chain headlessly.
    if (id == "GrooveBoxRack") {
        auto fireAndPeak = [&](int warmupBlocks) {
            const uint8_t notes[][3] = {{0x99,36,110},{0x99,38,100},{0x90,48,100}}; // ch10 kick, ch10 snare, ch1 note
            float pL = 0.f, pR = 0.f;
            for (auto& m : notes) { memcpy(pd.midi_bytes, m, 3); pd.midi_bytes_length = 3; memset(buf,0,sizeof(buf)); sp->Process(pd); pd.midi_bytes_length = 0; }
            for (int i = 0; i < warmupBlocks; i++) {
                memset(buf, 0, sizeof(buf)); sp->Process(pd);
                for (int s = 0; s < 32; s++) { float l = std::fabs(buf[s*2]), r = std::fabs(buf[s*2+1]); if (l > pL) pL = l; if (r > pR) pR = r; }
            }
            return std::make_pair(pL, pR);
        };

        auto [peakL, peakR] = fireAndPeak(200);
        printf("  GrooveBoxRack dry: peak L=%.4f R=%.4f  -> %s, %s\n", peakL, peakR,
               (peakL > 1e-4f && peakR > 1e-4f) ? "AUDIBLE" : "SILENT (bug?)",
               (peakL > 1e-4f && peakR > 1e-4f && std::fabs(peakL - peakR) < 0.5f * std::max(peakL, peakR)) ? "STEREO" : "not stereo?!");

        // Exercise the FX bus: turn the kick's FX Send 2 (reverb) up and check the wet path
        // actually adds signal. With the sim's loadPresetInternal() override fx2_amount = 2000
        // and ch1_fx2 = 4000 here, the reverb tail should be clearly audible after the kick decays.
        sp->SetParamValue("ch1_fx2", "current", 4000);
        // process a few blocks for the level change to settle, then fire a kick and look at the tail
        for (int i = 0; i < 16; i++) { memset(buf, 0, sizeof(buf)); sp->Process(pd); }
        const uint8_t kick[3] = {0x99, 36, 110};
        memcpy(pd.midi_bytes, kick, 3); pd.midi_bytes_length = 3;
        memset(buf, 0, sizeof(buf)); sp->Process(pd);
        pd.midi_bytes_length = 0;
        // run ~4096 blocks (~3 s of audio) and measure the tail starting after the dry kick has decayed (~200 blocks in)
        float tailPeak = 0.f;
        for (int i = 0; i < 4096; i++) {
            memset(buf, 0, sizeof(buf)); sp->Process(pd);
            if (i < 200) continue;
            for (int s = 0; s < 32; s++) { float v = std::fabs(buf[s*2]); if (v > tailPeak) tailPeak = v; }
        }
        printf("  GrooveBoxRack wet (ch1_fx2=4000): reverb tail peak = %.4f  -> %s\n",
               tailPeak, (tailPeak > 1e-3f) ? "FX BUS WORKS" : "FX BUS SILENT (bug)");

        // Exercise the Rompler/sample path: track 6 (CH07 Rompler, MIDI ch 12 note 36)
        // defaults to the "ro" machine and should play from the bundled sample-rom.
        sp->SetParamValue("ch1_fx2", "current", 0);             // turn the reverb send back off
        for (int i = 0; i < 16; i++) { memset(buf, 0, sizeof(buf)); sp->Process(pd); }
        const uint8_t smpHit[3] = {0x9B, 36, 110};              // ch 12 (0x9B = 0x90|0x0B), note 36
        memcpy(pd.midi_bytes, smpHit, 3); pd.midi_bytes_length = 3;
        memset(buf, 0, sizeof(buf)); sp->Process(pd);
        pd.midi_bytes_length = 0;
        float smpPeak = 0.f;
        for (int i = 0; i < 200; i++) {
            memset(buf, 0, sizeof(buf)); sp->Process(pd);
            for (int s = 0; s < 32; s++) { float v = std::fabs(buf[s*2]); if (v > smpPeak) smpPeak = v; }
        }
        printf("  GrooveBoxRack sampler (ch7_smp, MIDI 12 / note 36): peak = %.4f  -> %s\n",
               smpPeak, (smpPeak > 1e-4f) ? "SAMPLES PLAY" : "SILENT (sample-rom missing or rompler default-bank empty)");
    }
    delete sp;
    printf("  OK: %s constructed, init'd, preset-loaded and processed without crashing.\n", id.c_str());
    return 0;
}

// Single-voice isolation mode (`load-test --machine <id>`):
//   1. Construct GrooveBoxRack, load preset 0 (every track gets its first machine).
//   2. setTrackMachine(t, id, 1.0) for the requested voice's track — disables every
//      other voice on that track, enables only the one we're testing.
//   3. Inject one note (drum: trigger note on the track's drum channel; synth: note
//      60 on the track's synth channel) and run ~64 audio blocks.
//   4. Report dry peak L/R.  Optionally crank ch<N>_fx2 to verify the FX bus path.
//
// This is the tightest "did my DSP change something?" loop while you're tuning a
// new rack voice — much faster than booting the simulator and clicking through
// the WebUI.  Returns 0 if the voice produced audible output, 1 if it was silent
// (probably a bug worth investigating).
static int test_machine(const std::string& argId) {
    if (g_voices.empty()) {
        printf("=== load-test --machine: synthdefinitions.json could not be loaded ===\n");
        printf("Expected at ../../sdcard_image/factory/synthdefinitions.json — run load-test\n"
               "from simulator/build/ (the same cwd the rest of the simulator uses).\n");
        return 2;
    }
    const VoiceLookup* v = findVoice(argId);
    if (!v) {
        printf("=== load-test --machine: unknown voice id \"%s\" ===\n", argId.c_str());
        listKnownVoices();
        return 2;
    }
    // The id the rack knows is always the bare one (no "_t<N>" suffix); v->id stripped that already.
    const std::string id = v->id;
    printf("=== load-test --machine %s (id=\"%s\" on track %d, ch %d, note %d) ===\n",
           argId.c_str(), id.c_str(), v->track, v->channel, v->note);

    auto* sp = ctagSoundProcessorFactory::Create("GrooveBoxRack",
                                                  ctagSPAllocator::AllocationType::STEREO);
    if (!sp) { printf("  -> Create returned nullptr — sample-rom missing?\n"); return 2; }
    sp->LoadPreset(0);
    auto* rack = static_cast<ctagSoundProcessorGrooveBoxRack*>(sp);
    rack->setTrackMachine(static_cast<uint8_t>(v->track), id, 1.0f);

    float buf[32 * 2];
    float cv[4] = {0, 0, 0, 0};
    uint8_t trig[2] = {0, 0};
    ProcessData pd;
    pd.buf = buf; pd.cv = cv; pd.trig = trig;
    pd.sequencer_tempo = 12000; pd.sequencer_quantum = 4;
    pd.midi_bytes_length = 0; std::memset(pd.midi_bytes, 0, sizeof(pd.midi_bytes));

    // Settle: a few empty blocks to clear any startup transient.
    for (int i = 0; i < 4; i++) { std::memset(buf, 0, sizeof(buf)); sp->Process(pd); }

    // Fire one note event directly into the rack (bypass the MIDI parser).
    rack->handleMidiNoteOn(static_cast<uint8_t>(v->channel), static_cast<uint8_t>(v->note), 110);

    float pL = 0.f, pR = 0.f;
    for (int i = 0; i < 200; i++) {
        std::memset(buf, 0, sizeof(buf)); sp->Process(pd);
        for (int s = 0; s < 32; s++) {
            float l = std::fabs(buf[s * 2]), r = std::fabs(buf[s * 2 + 1]);
            if (l > pL) pL = l;
            if (r > pR) pR = r;
        }
    }
    printf("  dry peak: L=%.4f R=%.4f  -> %s\n", pL, pR,
           (pL > 1e-4f || pR > 1e-4f) ? "AUDIBLE" : "SILENT (bug? voice not enabled? note routed wrong?)");

    // Bonus: crank this track's FX Send 2 and check the reverb tail.
    char fx2Id[32]; std::snprintf(fx2Id, sizeof(fx2Id), "ch%d_fx2", v->track + 1);
    sp->SetParamValue(fx2Id, "current", 4000);
    for (int i = 0; i < 16; i++) { std::memset(buf, 0, sizeof(buf)); sp->Process(pd); }
    rack->handleMidiNoteOn(static_cast<uint8_t>(v->channel), static_cast<uint8_t>(v->note), 110);
    float tail = 0.f;
    for (int i = 0; i < 4096; i++) {
        std::memset(buf, 0, sizeof(buf)); sp->Process(pd);
        if (i < 200) continue;       // ignore dry transient
        for (int s = 0; s < 32; s++) { float v2 = std::fabs(buf[s * 2]); if (v2 > tail) tail = v2; }
    }
    printf("  FX2-bus tail peak: %.4f  -> %s\n", tail,
           (tail > 1e-3f) ? "FX BUS REACHES THIS VOICE" : "FX BUS SILENT FOR THIS VOICE");

    delete sp;
    return (pL > 1e-4f || pR > 1e-4f) ? 0 : 1;
}

int main(int argc, char** argv) {
    // give ctagSampleRom data (rompler/wavetable channels need it) — robust if missing
    spi_flash_emu_init("../../tools/sample-tools/sample-rom.tbd");
    CTAG::SP::HELPERS::ctagSampleRom::RefreshDataStructure();

    // Populate the voice lookup table from synthdefinitions.json — only needed by
    // --machine mode; the default and --all modes work without it.  Robust to a
    // missing file (test_machine reports the failure with a clear error message).
    loadVoiceTableFromSynthdef();

    // Argument parsing — three modes (default / --all / --machine <id>).
    int rc = 0;
    if (argc >= 3 && std::strcmp(argv[1], "--machine") == 0) {
        rc = test_machine(argv[2]);
    } else {
        std::string which = (argc > 1) ? argv[1] : "GrooveBoxRack";
        if (which == "--all") {
            const char* ids[] = { "TBD03","MacOsc","Subbotnik","Karpuskl","SubSynth","Talkbox",
                                   "GrooveBoxRack","DrumRack","Rompler","WTOsc","PolyPad","Void", nullptr };
            for (int i = 0; ids[i]; i++) test_one(ids[i]);
        } else {
            rc = test_one(which);
        }
    }
    spi_flash_emu_release();
    printf("done.\n");
    return rc;
}
