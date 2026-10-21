# PICO ↔ P4 contract — what mustn't change without coordination

> **TL;DR**: The PICO firmware (`tbd-pico-seq3`, branch `dada-tbd-master`) and the P4 firmware
> (this repo) communicate over SPI through a fixed set of commands. The P4-side handler
> translates those commands into calls on the active sound processor — for the TBD-16 that
> is `ctagSoundProcessorGrooveBoxRack`. Any internal refactor of GrooveBoxRack is fair game
> **as long as the five public methods listed in §2 keep their signatures and
> externally-observable behaviour**. That equivalence is proven by
> `simulator/build/routing-test` against a checked-in golden file.

## 1. Wire-level contract (PICO side)

`tbd-pico-seq3/src/SpiAPI.h` defines the byte protocol. The commands relevant to
GrooveBoxRack are:

| Cmd | Name | Args | What the P4 must do |
|---:|------|------|---------------------|
| 0x04 | `SetActivePlugin` | (chan, pluginID cstring) | Construct the named sound processor for that channel. |
| 0x05 | `SetPluginParam` | (chan, paramID cstring, int32 value) | Call `sp->SetParamValue(paramID, "current", value)`. |
| 0x06 | `SetPluginParamCV` | (chan, paramID, int8) | Call `sp->SetParamValue(paramID, "cv", value)`. |
| 0x07 | `SetPluginParamTRIG` | (chan, paramID, int8) | Call `sp->SetParamValue(paramID, "trig", value)`. |
| 0x0B | `LoadPreset` | (chan, int8 presetID) | Call `sp->LoadPreset(presetID)`. |
| 0x14 | `SetPluginParamsJSON` | (chan, JSON cstring) | Apply a JSON blob of param values. |
| 0x17 | `SetActiveWaveTableBank` | (uint8 bank) | `WTOsc` plugin: switch wavetable bank. |
| 0x18 | `SetActiveSampleKit` | (uint8 kit) | Switch sample-rom bank for every track. |

The PICO **does not** know about `machineId` strings, `synthdefinitions.json`, or the rack's
internal voice layout. It speaks only at the level above: macros, presets, kits.

## 2. P4-side calls into GrooveBoxRack

`main/MacroTranslator.cpp` and `main/SPManager.cpp` are the only callers of the five
GrooveBoxRack-specific methods (everything else is on the base `ctagSoundProcessor` class):

| Method | Where called from | What it must do |
|--------|-------------------|------|
| `setTrackMachine(uint8_t trackIndex, std::string machineId, float volumeMultiplier)` | `MacroTranslator.cpp:447`, `SPManager.cpp:813` | Set every voice's `enabled` flag on the track to `(id == registered_id)`; set the channel mixer's `enabled` to `!id.empty()` and its `volumeMultiplier`. |
| `setTrackBank(uint8_t trackIndex, uint16_t bankIndex)` | `MacroTranslator.cpp:504` | Set that track's rompler's `bank_index`. |
| `handleMidiNoteOn(uint8_t channel, uint8_t note, uint8_t velocity)` | `MacroTranslator.cpp:350` | Dispatch to every enabled voice whose `(channel, trigger-note)` matches. Drums fire `trigger()` (vel > 0 only); pitched voices call `noteOn(note, vel)` (or `noteOff(note, 0)` if vel == 0). |
| `handleMidiNoteOff(uint8_t channel, uint8_t note, uint8_t velocity)` | `MacroTranslator.cpp:336, 352` | Same as above, mirror for note-off. |
| `handleMidiControlChange(uint8_t channel, uint8_t control, uint8_t value)` | `MacroTranslator.cpp:132, 390, 491` | Look the CC up in `pMapParCC` and run every registered setter. |

The signatures are public (in `ctagSoundProcessorGrooveBoxRack.hpp`) and their observable
state changes are captured by `GetRoutingSnapshot()`.

## 3. How we prove a refactor didn't break the contract

`simulator/tests/test_routing.cpp` (target `routing-test`) walks the entire
behaviour-affecting input space:

1. **`setTrackMachine` grid** — every `(trackIndex × machineId)` combination, dumps the
   full `GetRoutingSnapshot()` after each call.
2. **`setTrackBank` no-side-effects** — confirms it only touches the rompler's
   `bank_index`, not any `enabled` flag.
3. **`handleMidiNoteOn` / `handleMidiNoteOff` audio fingerprint** — for every
   `(channel × note × velocity)` triple, runs 64 audio blocks after the event and records
   the peak L/R amplitude. Any reroute (different voice triggered, or none) changes the
   peak measurably.

The output is diffed against `simulator/tests/golden/groovebox-routing.txt`. A passing
test means: **for every input you can drive from the PICO side, the externally-observable
result is byte-identical to the pre-refactor reference.**

Before merging any change that touches any of those five methods (or any code they
call), run:

```bash
cd simulator/build && cmake . && make routing-test load-test
./routing-test                        # must say PASS
./load-test GrooveBoxRack             # must report AUDIBLE / FX BUS WORKS / SAMPLES PLAY
```

If `routing-test` shows a diff, that's the change you have to justify or roll back.
**Never re-bless the golden (`./routing-test --regen`) without a coordinated change on
both sides — the new behaviour has to be agreed with the PICO firmware authors first.**

## 4. What this means for the registry refactor (May 2026)

The registry refactor (`refactor(groovebox): replace hand-rolled switch dispatch with
voice registry`) replaced four hand-written `switch` bodies with a single voice
registry built once in `Init()`. After the refactor:

- All five public methods kept their signatures.
- `routing-test` passes byte-identical against the pre-refactor golden.
- `load-test GrooveBoxRack` reports identical peaks (0.9304 / 2.6744 / 0.5852).
- The ESP-IDF firmware (`idf.py build`) compiles to 0x338fe0 bytes (was 0x338200 —
  +3.5 KB for `std::function` slots in the registry; still 36% partition headroom).
- No file under `main/` was modified.
- No file under `sdcard_image/factory/` was modified.

**Conclusion: the PICO ↔ P4 contract on `dada-tbd-master` is preserved.** Flashing
this firmware to a TBD-16 paired with a PICO running `tbd-pico-seq3@dada-tbd-master`
will behave the same as before the refactor.

## 5. Future direction

There is an open goal to remove `synthdefinitions.json` as an authored source of truth
(see ROADMAP / the registry refactor commit messages). The P4 side is already 80%
there — the registry encodes `track`, `channel`, `trigger-note` and `machineId` per
voice. What remains:

- `MacroTranslator.cpp` reads track→channel/cc mapping from `synthdefinitions.json` at
  boot; this should come from the registry instead.
- The WebUI's `mui-GrooveBoxRack.json` is still authored separately. Either keep
  authoring it (current state) or generate it from the registry + a per-param spec
  alongside the voice's `Init()`.

Any of those changes will require **coordinated work on the PICO side too**, because
the macro/preset JSON the PICO loads from the P4's SD card references `machineId`
strings indirectly through preset payloads. None of that is changed by the registry
refactor — that work is deferred.
