# Track MIDI Mapping Fix

## Bug Report

**Symptom:** When on Track 03 (Snare) and turning knobs, the parameters change on Track 02 (Kick2) instead.

## Root Cause

The Pico's track definitions in `initsong.cpp` and `songconstants.hpp` had MIDI channel and CC assignments that were **out of sync** with the P4's `synthdefinitions.json`.

### The Mismatch

The Pico assigned all 6 drum tracks to **MIDI channel 9** with CC spacing of 20 per track:

| Track | Name    | Pico `midi_ch` | Pico `device_start_cc` | P4 `midi_ch` | P4 `baseCC` |
|-------|---------|----------------|------------------------|--------------|-------------|
| 0     | Kick    | 9              | 0                      | 9            | 0           |
| 1     | Kick2   | 9              | **20**                 | 9            | **40**      |
| 2     | Snare   | 9              | **40**                 | 9            | **80**      |
| 3     | Hat     | **9**          | **60**                 | **10**       | **0**       |
| 4     | Rimshot | **9**          | **80**                 | **10**       | **40**      |
| 5     | Clap    | **9**          | **100**                | **10**       | **80**      |
| 6     | Rompler | 11             | 0                      | 11           | 0           |
| 7     | Rompler | **12**         | **0**                  | **11**       | **40**      |

Bold values indicate mismatches between Pico and P4.

### How It Caused the Bug

1. User is on **Track 03** (Snare, sequencer index 2) and turns a knob
2. The Pico's `seqapi.cpp` calculates the CC number: `device_start_cc + 8 + param` = `40 + 8 + 0` = **CC 48** on **channel 9**
3. The P4's `MacroTranslator` receives CC 48 on channel 9 and loops through all tracks on that channel:
   - **P4 Track 0** (Kick, `baseCC=0`): `macrocc = 48 - 0 - 8 = 40` → out of range, rejected
   - **P4 Track 1** (Kick2, `baseCC=40`): `macrocc = 48 - 40 - 8 = 0` → **accepted as param 0 of Kick2!**
   - **P4 Track 2** (Snare, `baseCC=80`): `macrocc = 48 - 80 - 8 = -40` → negative, rejected
4. The P4 applies the knob change to **Kick2** (displayed as Track 02) instead of **Snare** (Track 03)

### CC Collision Diagram

```
Channel 9 CC space:
                                                                         
Pico (WRONG):  |--Kick(0-19)--|--Kick2(20-39)--|--Snare(40-59)--|--Hat(60-79)--|--Rim(80-99)--|--Clap(100-119)--|
P4 (CORRECT):  |------Kick(0-39)------|------Kick2(40-79)------|------Snare(80-119)------|

Channel 10 CC space:
P4 (CORRECT):  |------Hat(0-39)------|------Rimshot(40-79)------|------Clap(80-119)------|
```

The Pico's 20-CC spacing caused every track's CCs to land in the **previous track's** range on the P4.

## Fix Applied

### `songconstants.hpp`

Updated `TRACK*_FIRST_CC` to match P4's `baseCC` values (40-CC spacing instead of 20):

```
TRACK1_FIRST_CC:  0  →  0  (unchanged)
TRACK2_FIRST_CC: 20  → 40
TRACK3_FIRST_CC: 40  → 80
TRACK4_FIRST_CC: 60  →  0  (now on channel 10)
TRACK5_FIRST_CC: 80  → 40  (now on channel 10)
TRACK6_FIRST_CC: 100 → 80  (now on channel 10)
TRACK7_FIRST_CC:  0  →  0  (unchanged)
TRACK8_FIRST_CC:  0  → 40
```

Updated `TRACK*_TRIGGER` to match P4's `drumnote` values:

```
TRACK4_TRIGGER: 3 → 0  (drumnote 36 on ch 10)
TRACK5_TRIGGER: 4 → 1  (drumnote 37 on ch 10)
TRACK6_TRIGGER: 5 → 2  (drumnote 38 on ch 10)
TRACK8_TRIGGER: 0 → 1  (drumnote 37 on ch 11)
```

### `initsong.cpp`

Updated `midi_channel` and `device_start_cc` for affected tracks:

| Track | Change |
|-------|--------|
| Kick2 (1)    | `device_start_cc` 20 → 40 |
| Snare (2)    | `device_start_cc` 40 → 80 |
| Hat (3)      | `midi_channel` 9 → 10, `device_start_cc` 60 → 0 |
| Rimshot (4)  | `midi_channel` 9 → 10, `device_start_cc` 80 → 40 |
| Clap (5)     | `midi_channel` 9 → 10, `device_start_cc` 100 → 80 |
| Rompler2 (7) | `midi_channel` 12 → 11, `device_start_cc` 0 → 40 |

## Status

- **Pre-existing bug** — present in `waveforms2`, not introduced by the deterministic track preset feature
- Fixed on branch `feature/deterministic-track-machines`
- Committed as `74f3c2b`

## Reference

The P4's authoritative track definitions live in:
```
ctag-tbd_hacking/sdcard_image/data/synthdefinitions.json
```

The Pico's track init must always match these values. If the P4 definitions change, the Pico's `songconstants.hpp` and `initsong.cpp` must be updated to match.
