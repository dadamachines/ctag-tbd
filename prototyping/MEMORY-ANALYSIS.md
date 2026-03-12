# Macro Layer Memory Analysis

## Problem

Adding macro definitions causes memory issues on ESP32-P4. The macro/preset layer allocates all objects in **internal SRAM** (~768 KB total, heavily used) instead of **PSRAM** (~4 MB free).

## Root Cause

The SPIRAM config (`sdkconfig`) has `CONFIG_SPIRAM_USE_CAPS_ALLOC=y` but **not** `CONFIG_SPIRAM_USE_MALLOC=y`. This means every C++ `new` and `malloc` goes to internal SRAM only. PSRAM is only used when explicitly requested via `heap_caps_malloc(size, MALLOC_CAP_SPIRAM)`.

The macro layer files all use plain `new`:

| File | `new` calls | Objects allocated |
|---|---|---|
| `MacroDeviceDefinition.cpp` | 4 | Parameter, OutputMappingSource, ParameterGroup, OutputMapping |
| `MacroDeviceDefinitionDataModel.cpp` | 1 | MacroDeviceDefinition (per JSON file) |
| `MacroSoundPresetDataModel.cpp` | 2 | MacroSoundPreset objects |
| `MacroTranslator.cpp` | 1 | Deep copy of definition per track |
| `SynthDefinition.cpp` | 1 | SynthParameter |
| `SynthDefinitionDataModel.cpp` | 2 | SynthDefinition, TrackDefinition |

## Impact

Each macro device (~8 params, 9 mappings) uses ~2.1 KB of internal RAM. `ReloadMachineDefinitions()` loads **all** definitions at once.

| Scenario | Internal SRAM consumed |
|---|---|
| 20 macro devices | ~59 KB steady + 50–75 KB transient (JSON parsing) |
| 50 macro devices | ~123 KB steady + 50–75 KB transient |

This is significant for internal SRAM but trivial for the 4 MB of free PSRAM.

## Verdict

**Not a blocker.** The hardware has plenty of PSRAM — the code just isn't using it.

## What To Do

### 1. Move macro allocations to PSRAM (required)

`RestServer.cpp` already uses `heap_caps_malloc(size, MALLOC_CAP_SPIRAM)` for HTTP buffers. Apply the same pattern to macro layer objects.

Create a PSRAM-aware placement new helper (e.g. in a shared header):

```cpp
#include "esp_heap_caps.h"
#include <new>

template<typename T, typename... Args>
T* psram_new(Args&&... args) {
    void* mem = heap_caps_malloc(sizeof(T), MALLOC_CAP_SPIRAM);
    if (!mem) return nullptr;
    return new (mem) T(std::forward<Args>(args)...);
}

template<typename T>
void psram_delete(T* ptr) {
    if (ptr) { ptr->~T(); heap_caps_free(ptr); }
}
```

Replace every `new` in the macro layer files with `psram_new<T>(...)`. Files to update:

- `MacroDeviceDefinition.cpp`
- `MacroDeviceDefinitionDataModel.cpp`
- `MacroSoundPresetDataModel.cpp`
- `MacroTranslator.cpp`
- `SynthDefinition.cpp`
- `SynthDefinitionDataModel.cpp`

### 2. Eliminate deep copies in MacroTranslator (recommended)

`MacroTranslator::setDefinition()` deep-copies the entire definition when assigning to a track. Use `std::shared_ptr` to share definitions across tracks instead of copying.

### 3. Add lazy loading (recommended)

`ReloadMachineDefinitions()` loads every JSON file from `/sdcard/data/macrodefinitions/` into memory at startup. Instead:

- At startup, load only **metadata** (id, name, machine) — ~100 bytes per device
- Load full definitions on-demand when assigned to a track
- Release definitions not assigned to any track

### 4. Alternative quick fix (if time-constrained)

Set `CONFIG_SPIRAM_USE_MALLOC=y` in `sdkconfig.defaults`. This enables automatic PSRAM fallback for regular `malloc`/`new` when internal SRAM is exhausted. Requires no code changes but gives less control over what goes where.

## Verification

Use the existing `debug_task` in `SPManager.cpp` (logs free heap every 4 seconds) to confirm improvements. Check both:

```
heap_caps_get_free_size(MALLOC_CAP_INTERNAL)  // internal SRAM
heap_caps_get_free_size(MALLOC_CAP_SPIRAM)    // PSRAM
```
