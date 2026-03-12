# Rompler (RackRompler) Parameter Fix & Reorganization

## Summary

Fixed multiple broken Rompler parameters reported by users when controlled via the Pico sequencer,
and reorganized the parameter pages for better musical workflow.

## Bug Fixes

### Mapping Fixes (ro-allparams.json)

| Parameter | Issue | Root Cause | Fix |
|-----------|-------|-----------|-----|
| Attack | "If Attack is > 0 we don't have sound" | `start: 0` + exp curve → value 0 → CC 0 → `SetAttack(0.0)` → division by zero → NaN → silence | Changed `start: 0` → `start: 1` so minimum CC is always ≥ 1 |
| Decay | "Decay does nothing except if 0 we don't have sound" | Same div-by-zero issue as Attack | Changed `start: 0` → `start: 1` |
| TSMode | "Nothing at all for TSMode" | `mul: 1` → value 1 → CC 1 → `MK_INT_PAR_ABS_NOCV(…, 2.0f)` → integer truncation to 0 | Changed `mul: 1` → `mul: 64` so TSMode values map to CC 0/64/127 → int 0/1/2 |

### C++ Engine Fixes

| File | Fix | Details |
|------|-----|---------|
| `RackRompler.cpp` | **Speed**: Note trigger uses `autoSpeed * userSpeed` | Previously hardcoded `playbackSpeed = 1.0` at note trigger, ignoring the Speed knob. Now stores `userSpeed` from the CC and multiplies with auto-fit speed. |
| `RackRompler.cpp` | **Pitch**: Uses semitone offset `fS1Pitch - 64.f` | Previously used `midi_note` (always 36 for drum tracks) as pitch in non-timestretch mode, making the Pitch knob useless. Now 64 = no change, ±63 = ±63 semitones. |
| `RackRompler.cpp` | **Attack/Decay safety clamps** | Added `if (fS1Attack < 0.001f) fS1Attack = 0.001f` and `if (fS1Decay < 0.01f) fS1Decay = 0.01f` as defense-in-depth against div-by-zero in ctagADEnv. |
| `RackRompler.hpp` | Added `float userSpeed {1.0f}` member | Stores the user's Speed knob value for use at note trigger time. |
| `RomplerVoiceMinimal.cpp` | **Loop envelope**: `ad.SetLoop(params.loop)` | Previously the AD envelope didn't loop even when sample looping was enabled, causing the envelope to reach IDLE → buffer stopped → noise/silence during loop playback. |

### Parameters That Were Already Working

| Parameter | Why it seemed broken |
|-----------|---------------------|
| Cutoff, Reso, Type | Filter requires `Type > 0` to enable. Type was buried on page 2, users didn't know to set it first. |
| PingPong, PPStart | Depend on Loop being enabled. With Loop fix, these work correctly. |

## UX: Parameter Page Reorganization

**Before (confusing):**
- Page 1 SAMPLE: Bank, Slice, Start, End
- Page 2: Cutoff, Reso, Type, Bit.CR ← Type buried at position 3
- Page 3: Attack, Decay, Speed, Pitch ← envelope mixed with playback
- Page 4: Loop, PingPong, PPStart, EG2FM ← EG2FM doesn't belong here
- Page 5: TSMode, TSAmt

**After (musical flow):**
- Page 1 **SAMPLE**: Bank, Slice, Start, End — *what* to play
- Page 2 **PLAY**: Speed, Pitch, Attack, Decay — *how* it plays (most-tweaked knobs)
- Page 3 **FILTER**: Type, Cutoff, Reso, EG2FM — Type first (enable), then shape
- Page 4 **LOOP**: Loop, PingPong, PPStart, Bit.CR — advanced playback
- Page 5 **STRETCH**: TSMode, TSAmt — timestretch

### Key Design Decisions
- **Bank stays at idx 0, Slice at idx 1** — hardcoded in `SpiAPI.cpp` for boot-time track defaults
- **CC numbers unchanged** (8–25) — no changes needed on the Pico sequencer firmware side
- Only the `src` references in the mapping array were updated to point to the new parameter indices
- The preset values array in `ro-all-def.json` was reordered to match

## Files Changed

| File | Type |
|------|------|
| `sdcard_image/data/macrodefinitions/ro-allparams.json` | Mapping fixes + page reorder |
| `sdcard_image/data/macrosoundpresets/ro-all-def.json` | Preset values reordered |
| `components/ctagSoundProcessor/rack/RackRompler.cpp` | Speed, Pitch, Attack/Decay fixes |
| `components/ctagSoundProcessor/rack/RackRompler.hpp` | Added `userSpeed` member |
| `components/ctagSoundProcessor/synthesis/RomplerVoiceMinimal.cpp` | Envelope loop fix |

## Data Flow Reference

```
Preset value (0-127)
  → applyCurve(val, curve)     [linear/log/exp, integer math]
  → val * mul / div + start    [mapping transform]
  → clamp 0-127                [final CC value]
  → handleMidiControlChange(ch, baseCC + ctrl, value)
  → cv_value = value * 4096 / 128   [~0-4095]
  → stored in atomic<int16_t>
  → MK_FLT_PAR_ABS_NOCV(out, in, norm, scale)  → float out = in / norm * scale
  → used by RomplerVoiceMinimal
```

## Validation

- All 145 checks in `tests/test_dsp_json_alignment.py` pass
- Dedicated Rompler validation confirms:
  - idx 0 = Bank, idx 1 = Slice (SpiAPI.cpp constraint)
  - 18 params with sequential idx 0–17
  - All preset values match parameter defaults
  - All mapping `src` references valid
  - All mapping `ctrl` numbers match synthdefinitions.json and C++ `registerParamAndCC` offsets
  - Attack/Decay `start: 1`, TSMode `mul: 64`
  - All C++ fixes present
- **Pico sequencer firmware**: No changes required. The Pico doesn't parse mapping definitions — it only displays groups for UI. CC numbers are unchanged.
