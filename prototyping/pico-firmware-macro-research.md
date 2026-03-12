# Pico Firmware Macro Parameter Research

## Architecture Overview

### Pico Side (tbd-pico-seq3)
- **NO macro translation or CC generation** on Pico
- Pico ONLY receives CC values from user/MIDI and passes them through to P4 via SPI  
- Pico queries P4 for macro definitions via SPI `0xA2 GetMacroDefinition`
- Uses macro definitions to display UI parameters (groups/pages) to user
- Does NOT process or map parameters itself

### P4 Side (ESP32-P4)
- **MacroTranslator** handles ALL CC→parameter mapping
- Loads macro device definitions (JSON files) from SD card
- Maintains `trackParameterValues[16][32]` array indexed by parameter idx
- On each frame: evaluates `TranslateInput()` which:
  1. For each dirty track, iterates through `definition[t]->outputMappings`
  2. For each output mapping (CC):
     - Compute final value = startValue + Σ(trackParameterValues[t][src.parameterIndex] × applyCurve → mul/div)
     - Clamp to 0-127
     - Call `soundProcessor->handleMidiControlChange(channel, baseCC+ctrl, finalvalue)`

## JSON Macro Definition Structure

```json
{
  "groups": [
    {"name": "SAMPLE", "parameters": [{"idx": 0, "name": "Bank", ...}, ...]},
    {"name": "PLAY", "parameters": [{"idx": 4, "name": "Speed", ...}, ...]}
  ],
  "mapping": [
    {"ctrl": 8, "start": 0, "add": [{"src": 0, "mul": 1, "div": 1}]},
    ...
  ]
}
```

Key facts:
- `idx` values identify parameters globally (NOT dependent on group/page order)
- `mapping.XXX.add[].src` refers directly to the `idx` value (NOT ordinal position)
- **"src" values MUST match "idx" values exactly** (test_dsp_json_alignment.py validates this)

## Critical Hardcoded Assumption in SpiAPI.cpp LoadTrackSoundPreset

Lines 802-806:
```cpp
CTAG::AUDIO::SoundProcessorManager::SetTrackParameter(trackIndex, 0, romBank);    // Bank = idx 0
CTAG::AUDIO::SoundProcessorManager::SetTrackParameter(trackIndex, 1, sampleSlice); // Slice = idx 1
```

**This hardcodes parameter indices 0 and 1 for Bank and Slice respectively.**
- Called when Pico loads a track preset with rompler overrides  
- If you reorder ro-allparams.json, you MUST keep idx 0→Bank and idx 1→Slice

## How Pico Uses Macro Definitions

1. Boot: Calls `GetTrackDefaultPresets` (SPI 0xA5) → Gets preset IDs from P4
2. For each preset: Calls `LoadTrackSoundPreset` (SPI 0xA4) with romBank/sampleSlice overrides
3. P4 responds by switching machines and calling SetTrackParameter(track, 0, romBank/Slice)
4. Pico later calls `GetMacroDefinition` (SPI 0xA2) to get JSON for UI display
5. Pico parses groups and displays them to user
6. **Pico NEVER cares about group/page ordering** - only the idx→CC mapping matters

## Pico Doesn't Care About Parameter Ordering In JSON

Only Pico UI display is affected by group ordering:
- User sees groups/pages in the order defined in JSON
- But USER ACTIONS translate directly to TrackParameter calls with the idx value
- P4's TranslateInput() uses idx to look up values in trackParameterValues array
- **Reordering groups changes only the UI presentation, not the behavior**

## Risk Assessment: Changing ro-allparams.json

### SAFE TO CHANGE:
✅ Reorder parameter groups/pages (SAMPLE, PLAY, FILTER, LOOP, STRETCH)
✅ Rename parameter names (e.g., "Bank" → "SampleBank")  
✅ Change min/max/default values (only affects UI constraints)
✅ Add new parameters with new idx values (as long as idx ≥ 18, doesn't collide)
✅ Change curve types in mapping (log/exp/linear)
✅ Change multiplier/divider in mapping[].add[]

### CRITICAL - MUST NOT CHANGE:
❌ Indices 0 and 1 (these are hardcoded in SpiAPI.cpp for Bank/Slice)
❌ The mapping src references (they must match idx values)
❌ CC numbers in mapping if the P4 plugin assumes specific CC assignments

### MUST VALIDATE:
⚠️ If you move parameters around, verify the "src" values in "mapping" still correctly reference the new idx positions
⚠️ The test_dsp_json_alignment.py validates that all "src" values reference valid "idx" values
