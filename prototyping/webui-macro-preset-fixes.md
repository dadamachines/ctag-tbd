# WebUI Macro & Preset Creation Fixes

## Summary

Fixed multiple issues in the WebUI's macro definition builder and preset system that caused
broken macros and presets to be created — particularly for Rompler tracks. Also hardened
the entire workflow for all machine types.

## Root Cause

The WebUI's `createOneToOneMapping()` function in `designer.js` treated all machines identically:
- All pages named "Page 1", "Page 2", etc. — Rompler requires "SAMPLE" as first page name for Pico waveform display
- All parameters used `ui: 'bignum'` — Rompler needs `samplebank`, `sampleslice`, `sampleoffset` for Bank/Slice/Start/End
- All mapping entries used `start: 0, mul: 1` — Rompler Attack/Decay need `start: 1` (div-by-zero safety), TSMode needs `mul: 64` (proper 0/1/2 integer mapping)

Additionally, several data integrity issues existed across the entire macro/preset pipeline that
could produce broken output for any machine type.

## CC Validation

All 18 Rompler CC parameters (CC 8–25) were validated against the DSP C++ code in `RackRompler.cpp`.
Every `registerParamAndCC` offset matches the `ctrl` value in `synthdefinitions.json` exactly.

| CC | JSON id | C++ suffix | Parameter |
|----|---------|------------|-----------|
| 8 | bank | bank | Bank |
| 9 | slice | slice | Slice |
| 10 | start | start | Start |
| 11 | end | end | End |
| 12 | cutoff | fc | Cutoff |
| 13 | reso | fq | Reso |
| 14 | type | ft | Filter Type |
| 15 | bitcr | brr | Bit.CR |
| 16 | attack | atk | Attack |
| 17 | decay | dcy | Decay |
| 18 | speed | speed | Speed |
| 19 | pitch | pitch | Pitch |
| 20 | loop | lp | Loop |
| 21 | pingpong | lp_pp | PingPong |
| 22 | ppstart | lp_pos | PPStart |
| 23 | eg2fm | eg2fm | EG2FM |
| 24 | tsmode | tsmode | TSMode |
| 25 | tsamt | tsamount | TSAmt |

## Gold Standard Audit

All 33 existing macro definitions and 40+ presets were audited:
- Every definition has **contiguous 0-based indices** `[0, 1, 2, ..., N-1]`
- Every preset `values` array length exactly matches its macro's parameter count
- All mapping `src` references point to valid parameter indices
- No nulls, no gaps, no sparse arrays

## Fixes Applied

### designer.js — Macro Builder

| Fix | Location | Description |
|-----|----------|-------------|
| `reindexParameters()` helper | New function | Re-indexes all parameters to contiguous 0..N-1 and updates mapping `src` refs |
| `createOneToOneMapping()` rompler support | L1268 | Detects `machine === 'ro'`, sets first page to "SAMPLE", uses proper `ui` types, `start:1` for Attack/Decay, `mul:64` for TSMode |
| Group rename guard | L864 | Prevents renaming first page away from "SAMPLE" on rompler macros |
| `cleanDefinitionForSave()` re-indexes | L270 | Every saved/exported definition is guaranteed clean contiguous indices |
| Remove-knob re-indexes | L976 | Closes index gaps after knob deletion |
| `createSoundPresetForDef()` dense values | L1415 | Produces dense values array with no sparse holes |
| Import definition validation | L1665 | Warns on machine mismatch, re-indexes imported definitions |

### performer.js — Preset Performer

| Fix | Location | Description |
|-----|----------|-------------|
| `savePresetDialog()` dense values | L755 | Replaces null/undefined with 0 in saved values |
| `loadPreset()` null safety | L588 | Sanitizes null/undefined values and fills missing params from defaults |
| `importSinglePreset()` validation | L904 | Verifies macro exists, warns on value count mismatch |

### Build Pipeline

The `macro-bundle.js` is a concatenation of source files built by `build-webui.sh`.
All fixes were applied to the **source files** (`designer.js`, `performer.js`), then the
bundle was rebuilt. The bundle must always be rebuilt after editing source files:

```bash
cd sdcard_image/www && bash build-webui.sh
```

## Files Changed

| File | Type |
|------|------|
| `sdcard_image/www/js/designer.js` | WebUI source — macro builder |
| `sdcard_image/www/js/performer.js` | WebUI source — preset performer |
| `sdcard_image/www/js/macro-bundle.js` | Rebuilt bundle (concatenation of sources) |
| `sdcard_image/www/js/macro-bundle.js.gz` | Gzipped bundle for ESP32 |
| `sdcard_image/data/macrodefinitions/ro-allnewrompler.json` | New rompler macro (18 params, 5 pages) |
| `sdcard_image/data/macrosoundpresets/allnewrompler-def.json` | Default preset for new rompler macro |

## Data Files: ro-allnewrompler

The new macro `ro-allnewrompler` maps all 18 rompler CCs across 5 pages following
the musical flow from `rompler-parameter-fixes.md`:

- Page 1 **SAMPLE**: Bank, Slice, Start, End — *what* to play
- Page 2 **PLAY**: Speed, Pitch, Attack, Decay — *how* it plays
- Page 3 **FILTER**: Type, Cutoff, Reso, EG2FM — filter shaping
- Page 4 **LOOP**: Loop, PingPong, PPStart, Bit.CR — advanced playback
- Page 5 **STRETCH**: TSMode, TSAmt — timestretch
