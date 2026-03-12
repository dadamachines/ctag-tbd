# TBD-16 Sample Manager — First Iteration Concept

> **Status:** Concept / Implementation Plan — v1  
> **Date:** 2026-02-25  
> **Goal:** Ship a working browser-based sample manager that uploads, converts,
> renames, deletes, and organizes WAV files directly on the device — replacing
> the Python-script-plus-SD-card workflow with a single web interface.  
> **Stack:** Vanilla JS + Shoelace Web Components + ESP32-P4 REST API  
> **Reference:** [ESPFMfGK](https://github.com/holgerlembke/ESPFMfGK) for
> ESP32 file management patterns, specialized for our audio sample use case.  
> **Design Reference:** [Bastl Wave Bard Sample Loader](https://apps.bastl-instruments.com/wave-bard-sample-loader/)
> (named track groups with N sample slots each, per-track waveform icons),
> [Teenage Engineering EP-133 Sample Tool](https://teenage.engineering/apps/ep-sample-tool)
> (category tabs, numbered slot list, memory gauge, drag-and-drop assignment).

---

## Table of Contents

1.  [Problem & Goal](#1-problem--goal)
2.  [What We Have Today](#2-what-we-have-today)
3.  [Pool, Kits, Banks & Slices](#3-pool-kits-banks--slices)
4.  [Architecture Overview](#4-architecture-overview)
5.  [Client-Side WAV Conversion Pipeline](#5-client-side-wav-conversion-pipeline)
6.  [New REST API Endpoints](#6-new-rest-api-endpoints)
7.  [WebUI Design — Left/Right Split](#7-webui-design--leftright-split)
8.  [File & Data Model](#8-file--data-model)
9.  [Shoelace Component Map](#9-shoelace-component-map)
10. [Upload Flow — End to End](#10-upload-flow--end-to-end)
11. [Rename & Delete Flows](#11-rename--delete-flows)
12. [Kit & Bank Management](#12-kit--bank-management)
13. [Constraints & Limits](#13-constraints--limits)
14. [Serving Strategy](#14-serving-strategy)
15. [Implementation Plan](#15-implementation-plan)
16. [File Structure](#16-file-structure)
17. [Open Questions](#17-open-questions)

---

## 1. Problem & Goal

### The Problem

Loading custom samples onto the TBD-16 currently requires:

1. Running `wav_info_parser.py` (Python 3.10+) to convert files to 44.1 kHz / mono / 16-bit PCM
2. Opening `sample_bank_manager.html` locally to arrange slots and export a bank JSON
3. Powering off the device, removing the SD card, copying files, reinserting, powering on

Step 1 blocks non-technical users. Step 3 breaks the creative flow and risks data
corruption. The entire process is offline — you can't hear whether a sample works
in context until after the SD card round-trip.

### The Goal

Connect to the TBD-16 over WiFi (AP/STA) or USB-NCM. Open one web page. Drag audio
files onto it. They get converted in the browser, uploaded to the device, and are
immediately available for playback by the Rompler plugin. No Python. No SD card removal.
No power cycle.

### First Iteration Scope

| In scope | Out of scope (future) |
|----------|----------------------|
| Upload WAV/MP3/AIFF/OGG/FLAC → auto-convert to 44.1k/mono/16-bit | Browser-side waveform editor (trim, normalize, fade) |
| Rename samples on device | Wavetable bank management (focus on sample banks only) |
| Delete samples from device | Real-time PSRAM usage monitoring |
| Browse samples on device with folder view | Integration with plugin parameter UI |
| Preview/audition samples from the device | Batch download / backup to ZIP |
| **Kit management** — create / edit Kits (sample packs) from the Pool | Wavetable bank management |
| **Bank grouping within Kits** (KICK, SNARE, HIHAT, etc.) | More than 8 banks per Kit (future: configurable) |
| Update the active Kit descriptor on SD | |
| Drag-and-drop reordering of slices within a bank | |
| Basic progress feedback during upload | |
| Dark theme (Shoelace built-in) | |

---

## 2. What We Have Today

### SD Card Sample Layout

```
/sdcard/tbdsamples/
├── sample_rom.jsn              ← master index
├── def_smp.jsn                 ← default Kit descriptor (called "sample bank" in code)
├── a4_dub.jsn                  ← additional Kit descriptor
├── def_wt.jsn                  ← wavetable bank descriptor (out of scope)
├── drums/
│   ├── factory/
│   │   ├── BD0.wav
│   │   ├── BD1.wav
│   │   └── ...
│   └── loops/
│       └── cw_amen13_173.wav
├── other/
│   └── ...
└── wavetables/
    └── ...
```

### Master Index (`sample_rom.jsn`)

```json
{
  "wt_banks": ["def_wt.jsn"],
  "wt_bank_names": ["Default"],
  "wt_bank_tags": [["basic", "stock"]],
  "smp_banks": ["def_smp.jsn", "a4_dub.jsn"],
  "smp_bank_names": ["Default", "A4 Dub"],
  "smp_bank_tags": [["basic", "stock"], ["analog 4", "dub", "chords", "c-minor"]],
  "active_wt_bank": 0,
  "active_smp_bank": 0
}
```

### Kit Descriptor (e.g. `def_smp.jsn`)

> **Note:** The existing firmware calls these "sample bank descriptors" — we call
> them **Kit descriptors** to distinguish from the Rompler `bank` sub-group param.

An array of slot entries:

```json
[
  { "filename": "BD0", "path": "drums/factory", "nsamples": 11466, "sname": "" },
  { "filename": "BD1", "path": "drums/factory", "nsamples": 32193, "sname": "" },
  { "filename": "cw_amen13_173", "path": "drums/loops", "nsamples": 244716, "sname": "", "bpm": 173, "bars": 4 }
]
```

- `filename`: stem only (no extension), max 32 characters
- `path`: relative to `/sdcard/tbdsamples/`
- `nsamples`: total sample frames at 44.1 kHz
- `sname`: optional display name
- `offset`: optional (default 44 = standard WAV header)

### Sample Loading at Runtime (`ctagSampleRom`)

1. Reads `sample_rom.jsn` → gets active Kit index
2. Reads the active Kit descriptor → gets array of `{filename, path, nsamples}`
3. Allocates one contiguous PSRAM block (~28 MB max)
4. Loads wavetables first, then samples, tracking `sliceOffsets[]` and `sliceSizes[]`
5. DSP plugins access slices by index via `ReadSliceAsFloat()`

### Kit Switching (already implemented)

The SPI API already supports Kit switching from the RP2350:
```
DisablePluginProcessing() → switch active Kit index → RefreshDataStructure() → EnablePluginProcessing()
```

This same sequence can be triggered from an HTTP endpoint.

### Current REST Server

- **16 of 20** URI handler slots used
- **4 slots available** for new sample management endpoints
- Core 0 handles HTTP; Core 1 handles audio DSP — no contention
- POST body reading via `httpd_req_recv()` in chunks — proven pattern (see `set_configuration_post_handler`)
- SPIRAM allocation for request bodies: `heap_caps_malloc(req->content_len + 1, MALLOC_CAP_SPIRAM)`
- Static files served from `/sdcard/www/` with gzip encoding
- Scratch buffer: 10 KB (`SCRATCH_BUFSIZE = 10240`)

### Audio Format Requirements

| Property | Required Value |
|----------|---------------|
| Sample rate | 44,100 Hz |
| Bit depth | 16-bit signed integer |
| Channels | 1 (mono) |
| Container | RIFF WAV |
| Filename stem | Max 32 ASCII characters, alphanumeric + underscore |

---

## 3. Pool, Kits, Banks & Slices

### The Four-Level Hierarchy

```
SD Card — SAMPLE POOL (all WAV files, potentially many GB)
 └── Kit / Sample Pack ("Berlin Techno", "Deep House", …)
      └── Bank (sub-group: KICK, SNARE, HIHAT, …) — Rompler bank param 0-31
           └── Slice (individual sample) — Rompler slice param 0-31
```

| Level | What it is | Where it lives | Size constraint |
|---|---|---|---|
| **Pool** | Every WAV file on the SD card — the user's full sample collection | `/sdcard/tbdsamples/**/*.wav` | SD card capacity (8-64 GB) |
| **Kit** | A curated selection of samples loaded into PSRAM for a project / song | `sample_rom.jsn` → `smp_banks[i]` → e.g. `berlin_techno.jsn` | ~28 MB PSRAM max |
| **Bank** | A sub-group within a Kit (e.g. kicks, snares) — one per Rompler `bank` value | Entries at index `[bank*32 .. bank*32+31]` in the Kit descriptor | 32 slices max |
| **Slice** | A single WAV sample within a Bank — one per Rompler `slice` value | One entry in the Kit descriptor array | ~2 MB practical max |

### How Slices Work Today

A **slice** is a single WAV file loaded into PSRAM. The mapping is 1:1:

```
Slice 0  →  BD0.wav      (11,466 samples)
Slice 1  →  BD1.wav      (32,193 samples)
Slice 2  →  SNARE_01.wav (14,230 samples)
...
Slice 68 →  cw_amen13_173.wav (244,716 samples)
```

The Rompler plugin addresses slices using two parameters:

```
flat_index = bank × 32 + slice

bank:  0–31  (which group of 32)
slice: 0–31  (which sample within that group)
```

With `skpwt` (skip wavetables) enabled, the index starts after any loaded
wavetable slices. This gives the Rompler a **32 × 32 = 1024 slot** address space
within a single loaded Kit.

### Kit = Sample Pack = What Gets Loaded into PSRAM

A **Kit** is what `sample_rom.jsn` calls a "sample bank" (`smp_banks` entry).
It's a JSON descriptor listing which samples to load into PSRAM — typically themed
around a genre or project:

- **"Berlin Techno"** — TR-style kicks, metallic hihats, industrial FX
- **"Deep House"** — warm pads, organic percussion, vocal chops
- **"Hip Hop"** — boom bap kicks, crisp snares, vinyl textures
- **"My Song v3"** — custom selection for a specific performance

Loading a Kit fills the ~28 MB PSRAM buffer. This is a **heavyweight operation**
(~50-200ms audio mute) and typically happens once per project/song. Switching
Kits means reloading all samples from SD card — you don't do this mid-performance.

The existing `smp_banks` array in `sample_rom.jsn` already supports multiple Kits:
```json
{
  "smp_banks": ["def_smp.jsn", "a4_dub.jsn", "berlin_techno.jsn"],
  "smp_bank_names": ["Default", "A4 Dub", "Berlin Techno"],
  "active_smp_bank": 2
}
```

### Banks = Sub-Groups Within a Kit

Within a loaded Kit, the Rompler's `bank` parameter (0–31) selects **sub-groups**.
We use this for a drum-machine-style organization:

| Rompler `bank` | Bank Name | Sample Slots (slice 0–31) | Drum Machine Semantic |
|:-:|---|---|---|
| 0 | **KICK** | Kick variations: 808, 909, acoustic, etc. | BD (Bass Drum) |
| 1 | **SNARE** | Snare variations: tight, loose, clap-snare | SD (Snare Drum) |
| 2 | **HIHAT CL** | Closed hihat variations | CH (Closed HiHat) |
| 3 | **HIHAT OP** | Open hihat variations | OH (Open HiHat) |
| 4 | **CLAP** | Clap and hand-percussion | CP (Clap) |
| 5 | **RIM** | Rimshot and sidestick | RS (Rimshot) |
| 6 | **PERC** | Cowbell, shaker, tambourine, conga | Misc Percussion |
| 7 | **OTHER** | Loops, FX, stabs, one-shots | Utility |

This maps to the standard Roland TR-x0x / General MIDI percussion categories:

> **TR-808/909:** BD, SD, LT, MT, HT, RS, CP, CB, CY, OH, CH  
> **General MIDI:** Kick (35-36), Snare (38-40), HiHat (42,44,46), Tom (41,43,45,47,48,50), Clap (39), Ride (51,59), Crash (49,57)  
> **TE EP-133 K.O.II:** DRUMS, PERC, BASS, KEYS, LOOPS, USER 1-4, SFX  
> **Bastl Wave Bard:** XOX, PERKS, TENSE, LOOPS, PLUCKS, SFX (6 named groups × 8 slots)

### Fallback: No Banks = Flat Browsing

**If a Kit has no bank sub-grouping** (all samples packed sequentially starting
from slot 0), every Rompler simply browses the same flat list. Bank 0 covers
slices 0–31, Bank 1 covers slices 32–63, etc. — but there's no semantic meaning
to the groups. This is the **default fallback** and is how existing Kits work today.

The Sample Manager UI handles both modes:
- **Flat mode:** show all samples in one scrollable list (traditional view)
- **Banked mode:** show named bank groups (drum machine view)

Users can switch between modes or start flat and organize into banks later.

### The Shared PSRAM Architecture

**Critical constraint:** The loaded Kit is **global**. There is one `ctagSampleRom`
static instance with one contiguous PSRAM buffer (~28 MB). All plugin instances
(every Rompler on every channel, every DrumRack voice) read from the same buffer.
`SetActiveSampleBank()` changes the active Kit for the **entire system** and
requires `RefreshDataStructure()` to reload from SD.

This means all Romplers share the same Kit — which is exactly what we want.
A Kit is the project's sample palette. Individual Romplers pick different
bank+slice combinations from that shared palette.

### PicoSeqRack: 4 Independent Rompler Tracks

The PicoSeqRack plugin has 16 channels, of which 4 are Romplers:

| Channel | Component | Role |
|:-:|---|---|
| ch7 | `RackRompler` | Rompler Track A — independently selects `bank` + `slice` |
| ch8 | `RackRompler` | Rompler Track B — independently selects `bank` + `slice` |
| ch13 | `RackRompler` | Rompler Track C — independently selects `bank` + `slice` |
| ch14 | `RackRompler` | Rompler Track D — independently selects `bank` + `slice` |

All 4 share the same `ctagSampleRom sampleRom;` instance (`idata.sampleRom = &sampleRom;`).
Each Rompler independently selects which bank and slice to play:

- **Track A** (ch7) → `bank=0` (KICK), `slice=3` → plays `sub_kick.wav`
- **Track B** (ch8) → `bank=1` (SNARE), `slice=0` → plays `snare_tight.wav`
- **Track C** (ch13) → `bank=2` (HIHAT CL), `slice=1` → plays `hat_pedal.wav`
- **Track D** (ch14) → `bank=7` (OTHER), `slice=0` → plays `cw_amen13_173.wav`

DrumRack works the same way — 4 `RomplerVoiceMinimal` voices, each with
independent `bank` and `slice` parameters selecting from the shared Kit.

The addressing math is identical in both plugins:
```cpp
iSlice = iSNBank * 32 + iSNSlice + firstNonWtSlice;
```

### Bank Count: 4 or 8?

The current firmware supports 4 Rompler tracks (via PicoSeqRack's 4 Romplers or
DrumRack's 4 voices). The user may want 8 banks in a future firmware. Since the
`bank` parameter ranges 0–31, we have headroom for up to 32 banks.

**For v1:** Default to **8 named banks** in the WebUI Kit Editor (matching the
common TR-style layout). Users fill what they need. If only 4 Rompler tracks are
available in the firmware, banks 4–7 are simply "staged" — the samples are loaded
into PSRAM and ready for future Rompler voices or manual bank-switching.

---

## 4. Architecture Overview

```
┌───────────────────────────────────────────────────────────────────┐
│  Browser                                                          │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  samples.html (Shoelace Web Components + Vanilla JS)      │   │
│  │                                                           │   │
│  │  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐  │   │
│  │  │ File Drop   │  │ AudioContext  │  │ WAV Encoder     │  │   │
│  │  │ Zone        │→ │ decodeAudio  │→ │ (mono 16-bit    │  │   │
│  │  │ (any audio) │  │ Data()       │  │  44.1k PCM)     │  │   │
│  │  └─────────────┘  └──────────────┘  └────────┬────────┘  │   │
│  │                                               │           │   │
│  │                                          Blob (WAV)       │   │
│  │                                               │           │   │
│  │  ┌────────────────────────────────────────────┴────────┐  │   │
│  │  │  Upload Manager                                     │  │   │
│  │  │  POST /api/v1/samples/upload  (chunked if needed)   │  │   │
│  │  └────────────────────────────────────────────────────┘  │   │
│  │                                                           │   │
│  │  ┌─────────────────────────────────────────────────────┐  │   │
│  │  │  Sample Browser (table, preview, rename, delete)    │  │   │
│  │  │  Shoelace: sl-tree, sl-card, sl-dialog, sl-button   │  │   │
│  │  └─────────────────────────────────────────────────────┘  │   │
│  └───────────────────────────────────────────────────────────┘   │
│                          │ HTTP / JSON                            │
└──────────────────────────┼────────────────────────────────────────┘
                           │
┌──────────────────────────┼────────────────────────────────────────┐
│  ESP32-P4                │                                        │
│                          ▼                                        │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │  RestServer.cpp — new endpoints                            │   │
│  │                                                            │   │
│  │  GET  /api/v1/samples/list         → file listing          │   │
│  │  POST /api/v1/samples/upload       → receive WAV file      │   │
│  │  POST /api/v1/samples/rename       → rename file on SD     │   │
│  │  POST /api/v1/samples/delete       → delete file from SD   │   │
│  │  GET  /api/v1/samples/bank         → get active Kit JSON   │   │
│  │  POST /api/v1/samples/bank         → update bank JSON      │   │
│  │  POST /api/v1/samples/bank/reload  → reload PSRAM          │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  /sdcard/tbdsamples/  ← WAV files + Kit descriptors               │
│  PSRAM (~28 MB)       ← loaded samples for DSP playback           │
└───────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **All conversion happens in the browser** | ESP32-P4 has no spare cycles for audio format conversion. The browser has `AudioContext.decodeAudioData()` which handles WAV, MP3, AIFF, OGG, and FLAC natively. Zero server-side processing. |
| **Only valid 44.1k/mono/16-bit WAV reaches the device** | The device stores exactly what the Rompler reads — no runtime conversion, no ambiguity. |
| **Shoelace Web Components via CDN bundle, self-hosted** | Shoelace's `/cdn/` build is pre-bundled (no build step needed). We download the Shoelace CDN files once and serve them as gzipped static assets from the device, just like we serve jQuery and Onsen UI today. No external CDN dependency at runtime. |
| **New page, not a rewrite** | `samples.html` is a standalone page linked from the existing UI. This avoids touching the working Onsen UI code while proving the Shoelace + Vanilla JS approach. |
| **4 new API endpoints** | Fits within the 4 remaining URI handler slots. We combine bank read/write into one path and use POST body to distinguish operations. |
| **Bank groups via Rompler bank parameter** | The Rompler already addresses samples as `bank × 32 + slice`. We use this to present up to 8 named banks of 32 sample slots each within a Kit — no firmware changes needed. |
| **Left/right split layout** | Left = Sample Pool (source), Right = Kit Editor (destination). Mirrors the drag-from-library-to-device workflow of Bastl Wave Bard and Ableton's browser-to-device pattern. |

---

## 5. Client-Side WAV Conversion Pipeline

The browser converts any supported audio file to the exact format the device expects.
This replaces the Python `wav_info_parser.py` script entirely for the upload use case.

### Pipeline

```
User drops file(s)
        │
        ▼
  File / Blob
        │
        ▼
  AudioContext.decodeAudioData(arrayBuffer)
        │
        ▼
  AudioBuffer {
    sampleRate: (original),
    numberOfChannels: (original),
    length: (original frames),
    getChannelData(0): Float32Array
  }
        │
        ▼
  OfflineAudioContext({
    numberOfChannels: 1,
    length: Math.ceil(duration * 44100),
    sampleRate: 44100
  })
  + ChannelMergerNode (if stereo → mono: average L+R)
  + AudioBufferSourceNode
  .startRendering()
        │
        ▼
  AudioBuffer {
    sampleRate: 44100,
    numberOfChannels: 1,
    length: N,
    getChannelData(0): Float32Array [-1.0 … +1.0]
  }
        │
        ▼
  encodeWAV(float32Array)  // pure JS function
        │
        ▼
  Blob (RIFF WAV, 44.1 kHz, mono, 16-bit PCM)
  + metadata: { filename, nsamples, byteLength }
```

### `encodeWAV()` Implementation

```javascript
/**
 * Encode a Float32Array of mono samples into a 16-bit PCM WAV Blob.
 * @param {Float32Array} samples - Mono audio samples in [-1, 1]
 * @param {number} sampleRate - Must be 44100
 * @returns {Blob}
 */
function encodeWAV(samples, sampleRate = 44100) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataBytes = samples.length * bytesPerSample;
    const headerBytes = 44;
    const totalBytes = headerBytes + dataBytes;

    const buffer = new ArrayBuffer(totalBytes);
    const view = new DataView(buffer);

    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalBytes - 8, true);
    writeString(view, 8, 'WAVE');

    // fmt chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);           // chunk size
    view.setUint16(20, 1, true);            // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataBytes, true);

    // PCM samples — clamp and convert float → int16
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
    }
}
```

### Filename Sanitization (Client-Side)

Matches the rules from `wav_info_parser.py`:

```javascript
function sanitizeFilename(name, maxLen = 32) {
    // Remove extension
    let stem = name.replace(/\.[^.]+$/, '');
    // Normalize unicode to ASCII
    stem = stem.normalize('NFKD').replace(/[^\x00-\x7F]/g, '');
    // Replace separators with underscore
    stem = stem.replace(/[\s\-]+/g, '_');
    // Remove non-alphanumeric except underscore
    stem = stem.replace(/[^A-Za-z0-9_]/g, '');
    // Collapse multiple underscores
    stem = stem.replace(/_+/g, '_').replace(/^_|_$/g, '');
    // Fallback
    if (!stem) stem = 'SAMPLE';
    // Truncate
    if (stem.length > maxLen) {
        const half = Math.floor((maxLen - 1) / 2);
        stem = stem.slice(0, half) + '_' + stem.slice(-(maxLen - 1 - half));
    }
    return stem;
}
```

### Validation Before Upload

Before sending to the device, the client validates:

| Check | Action if failed |
|-------|-----------------|
| File decodes successfully | Show error: "Unsupported audio format" |
| Converted WAV size ≤ 2 MB | Show warning with file size; allow override |
| Filename ≤ 32 chars after sanitization | Auto-truncate, show the result to user |
| Filename unique in target folder | Append `_2`, `_3`, etc. or prompt user |
| Total bank size won't exceed ~26 MB PSRAM | Show warning: "Bank will exceed PSRAM capacity" |

---

## 6. New REST API Endpoints

### Endpoint Summary

We need 4 URI handler registrations (fitting the 4 remaining slots):

| # | URI Pattern | Methods | Purpose |
|---|-------------|---------|---------|
| 1 | `/api/v1/samples/list*` | GET | List files and Kit data |
| 2 | `/api/v1/samples/upload` | POST | Upload a WAV file |
| 3 | `/api/v1/samples/manage` | POST | Rename, delete, update bank |
| 4 | `/api/v1/samples/reload` | POST | Reload sample ROM into PSRAM |

### 5.1 `GET /api/v1/samples/list`

Returns the contents of `/sdcard/tbdsamples/` and current bank state.

**Response:**

```json
{
    "files": [
        { "name": "BD0.wav", "path": "drums/factory", "size": 22976 },
        { "name": "BD1.wav", "path": "drums/factory", "size": 64430 },
        { "name": "cw_amen13_173.wav", "path": "drums/loops", "size": 489476 }
    ],
    "kits": {
        "smp_banks": ["def_smp.jsn", "a4_dub.jsn"],
        "smp_bank_names": ["Default", "A4 Dub"],
        "active_smp_bank": 0
    },
    "active_kit_entries": [
        { "filename": "BD0", "path": "drums/factory", "nsamples": 11466, "sname": "" },
        { "filename": "BD1", "path": "drums/factory", "nsamples": 32193, "sname": "" }
    ],
    "capacity": {
        "psram_max_bytes": 29360128,
        "active_bank_bytes": 0
    }
}
```

**Implementation approach:**
```cpp
// Scan /sdcard/tbdsamples/ recursively for .wav files
// Read sample_rom.jsn for Kit metadata
// Read active Kit descriptor for entry list
// Build JSON response using rapidjson StringBuffer + Writer
// Allocate response buffer in SPIRAM if needed
```

### 5.2 `POST /api/v1/samples/upload`

Receives a pre-converted WAV file and writes it to the SD card. The file is already
in the correct 44.1 kHz / mono / 16-bit format (converted by the browser).

**Request:** `multipart/form-data` with fields:
- `file`: the WAV binary
- `path`: target subfolder under `/sdcard/tbdsamples/` (e.g. `drums/user`)
- `filename`: sanitized stem (no extension)

**Alternative (simpler):** Raw binary POST with metadata in query params:
```
POST /api/v1/samples/upload?path=drums/user&filename=MY_KICK
Content-Type: application/octet-stream
Body: <raw WAV bytes>
```

The simpler approach avoids multipart parsing on the ESP32 (no multipart library
in esp_http_server). The existing `set_configuration_post_handler` already shows
the pattern for reading raw POST bodies.

**Implementation:**

```cpp
esp_err_t samples_upload_handler(httpd_req_t *req) {
    // 1. Extract path and filename from query string
    char path[64], filename[48];
    // httpd_req_get_url_query_str() + httpd_query_key_value()

    // 2. Create target directory if needed
    //    mkdir_p("/sdcard/tbdsamples/" + path)

    // 3. Open target file for writing
    //    /sdcard/tbdsamples/<path>/<filename>.wav
    FILE *f = fopen(fullpath, "wb");

    // 4. Stream POST body to file in chunks
    char buf[4096];
    int remaining = req->content_len;
    while (remaining > 0) {
        int recv = httpd_req_recv(req, buf, MIN(remaining, sizeof(buf)));
        if (recv <= 0) { /* error handling */ }
        fwrite(buf, 1, recv, f);
        remaining -= recv;
    }
    fclose(f);

    // 5. Validate the written file is a valid WAV
    //    Quick check: first 4 bytes = "RIFF", bytes 8-12 = "WAVE"

    // 6. Respond with success + file info
    //    { "ok": true, "filename": "MY_KICK", "path": "drums/user",
    //      "size": 23456, "nsamples": 11706 }
}
```

**Chunked streaming** is critical — we never buffer the entire file in RAM. The 4 KB
read buffer keeps internal SRAM usage minimal. The file writes directly to SD card.

**Size limit:** The `httpd_req_recv()` loop handles files of any size. The practical
limit is SD card space. We'll set a soft limit of 10 MB per upload (= ~57 seconds of
mono audio at 44.1 kHz) in the client, with a hard limit checked server-side.

### 5.3 `POST /api/v1/samples/manage`

A single endpoint for file operations, distinguished by a JSON body field:

**Rename:**
```json
{
    "action": "rename",
    "path": "drums/factory",
    "oldName": "BD0",
    "newName": "KICK_ANALOG"
}
```
```cpp
// rename("/sdcard/tbdsamples/drums/factory/BD0.wav",
//        "/sdcard/tbdsamples/drums/factory/KICK_ANALOG.wav")
// Also update any Kit descriptor that references this file
```

**Delete:**
```json
{
    "action": "delete",
    "path": "drums/factory",
    "filename": "BD0"
}
```
```cpp
// remove("/sdcard/tbdsamples/drums/factory/BD0.wav")
// Also remove from any Kit descriptor that references this file
```

**Update Kit descriptor:**
```json
{
    "action": "updateBank",
    "bankIndex": 0,
    "entries": [
        { "filename": "BD0", "path": "drums/factory", "nsamples": 11466, "sname": "" },
        { "filename": "MY_KICK", "path": "drums/user", "nsamples": 11706, "sname": "Fav Kick" }
    ]
}
```
```cpp
// Overwrite the Kit descriptor file with the new entries array
// This is how the user adds/removes/reorders samples in a Kit
```

**Response** (all actions):
```json
{ "ok": true }
```
or
```json
{ "ok": false, "error": "File not found" }
```

### 5.4 `POST /api/v1/samples/reload`

Triggers a full PSRAM reload of the active Kit. This is the same sequence
the SPI API uses when the RP2350 switches banks:

```cpp
esp_err_t samples_reload_handler(httpd_req_t *req) {
    // 1. Disable plugin processing (mute audio briefly)
    CTAG::AUDIO::SoundProcessorManager::DisablePluginProcessing();

    // 2. Reload sample ROM data from SD card into PSRAM
    //    ctagSampleRom::RefreshDataStructureFromSDCard()

    // 3. Re-enable plugin processing
    CTAG::AUDIO::SoundProcessorManager::EnablePluginProcessing();

    // Response
    httpd_resp_set_type(req, "application/json");
    httpd_resp_sendstr(req, "{\"ok\":true}");
    return ESP_OK;
}
```

**Important:** This causes a brief audio mute (~50-200ms depending on bank size).
The UI should warn the user and show a loading indicator.

### URI Handler Registration

```cpp
// In RestServer::StartRestServer(), before the wildcard /* handler:

httpd_uri_t samples_list_uri = {
    .uri = "/api/v1/samples/list*",
    .method = HTTP_GET,
    .handler = &RestServer::samples_list_handler,
    .user_ctx = rest_context
};
httpd_register_uri_handler(server, &samples_list_uri);

httpd_uri_t samples_upload_uri = {
    .uri = "/api/v1/samples/upload",
    .method = HTTP_POST,
    .handler = &RestServer::samples_upload_handler,
    .user_ctx = rest_context
};
httpd_register_uri_handler(server, &samples_upload_uri);

httpd_uri_t samples_manage_uri = {
    .uri = "/api/v1/samples/manage",
    .method = HTTP_POST,
    .handler = &RestServer::samples_manage_handler,
    .user_ctx = rest_context
};
httpd_register_uri_handler(server, &samples_manage_uri);

httpd_uri_t samples_reload_uri = {
    .uri = "/api/v1/samples/reload",
    .method = HTTP_POST,
    .handler = &RestServer::samples_reload_handler,
    .user_ctx = rest_context
};
httpd_register_uri_handler(server, &samples_reload_uri);
```

That's exactly 4 new handlers → filling the remaining 4 slots (16 + 4 = 20).

---

## 7. WebUI Design — Left/Right Split

### Layout Philosophy

The UI splits into two side-by-side panels — **Sample Pool** on the left,
**Kit Editor** on the right — inspired by the Bastl Wave Bard Sample Loader
and Teenage Engineering EP-133 Sample Tool. This left/right split is natural
for a "source → destination" workflow: browse the full sample collection on
the left, build and organize Kits on the right.

### Layout

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│  TBD-16 Sample Manager                    4.2 MB / 28 MB ████░░░  [← Main UI]  │
├───────────────────────────────────┬──────────────────────────────────────────────┤
│                                   │                                              │
│  ── SAMPLE POOL ──                │  ── KIT EDITOR ──                            │
│                                   │                                              │
│  ╔═══════════════════════════╗    │  Kit: [Berlin Techno ▼] [+ New] [🔄 Reload] │
│  ║  Drop files to upload     ║    │                                              │
│  ║  WAV·MP3·AIFF·OGG·FLAC   ║    │  ┌─ 0 KICK ──────────────────── 4/32 ──┐   │
│  ║               [Browse...] ║    │  │  ⫶ ♫ 808_kick        0.32s  [▶][✎][×]│   │
│  ╚═══════════════════════════╝    │  │  ⫶ ♫ 909_kick        0.27s  [▶][✎][×]│   │
│                                   │  │  ⫶ ♫ acoustic_kick   0.41s  [▶][✎][×]│   │
│  Upload queue:                    │  │  ⫶ ♫ sub_kick        0.55s  [▶][✎][×]│   │
│  funky_kick.mp3  ████████ ✓ Done  │  │  + ADD SAMPLE                         │   │
│  snare_01.wav    ██████ Uploading  │  └──────────────────────────────────────┘   │
│  hihat.aif              Queued    │                                              │
│                                   │  ┌─ 1 SNARE ─────────────────── 3/32 ──┐   │
│  ── Files on Device ──            │  │  ⫶ ♫ snare_tight     0.18s  [▶][✎][×]│   │
│  Target: [drums/user ▼] [+New]    │  │  ⫶ ♫ snare_loose     0.23s  [▶][✎][×]│   │
│                                   │  │  ⫶ ♫ snare_rim       0.15s  [▶][✎][×]│   │
│  📁 drums/                        │  │  + ADD SAMPLE                         │   │
│    📁 factory/                    │  └──────────────────────────────────────┘   │
│      ♫ BD0         0.26s [▶][✎][🗑]│                                              │
│      ♫ BD1         0.73s [▶][✎][🗑]│  ┌─ 2 HIHAT CL ────────────── 2/32 ──┐   │
│      ♫ SNARE_01    0.32s [▶][✎][🗑]│  │  ⫶ ♫ hat_closed      0.08s [▶][✎][×]│   │
│    📁 user/                       │  │  ⫶ ♫ hat_pedal       0.12s  [▶][✎][×]│   │
│      ♫ MY_KICK     0.27s [▶][✎][🗑]│  │  + ADD SAMPLE                         │   │
│    📁 loops/                      │  └──────────────────────────────────────┘   │
│      ♫ cw_amen13   5.55s [▶][✎][🗑]│                                              │
│  📁 other/                        │  ┌─ 3 HIHAT OP ────────────── 1/32 ──┐   │
│    ♫ ...                          │  │  ⫶ ♫ hat_open        0.35s  [▶][✎][×]│   │
│                                   │  │  + ADD SAMPLE                         │   │
│                                   │  └──────────────────────────────────────┘   │
│                                   │                                              │
│                                   │  ┌─ 4 CLAP ──────────────────── 2/32 ──┐   │
│                                   │  │  ⫶ ♫ clap_808        0.22s  [▶][✎][×]│   │
│                                   │  │  ⫶ ♫ clap_stack      0.30s  [▶][✎][×]│   │
│                                   │  │  + ADD SAMPLE                         │   │
│                                   │  └──────────────────────────────────────┘   │
│                                   │                                              │
│                                   │  ┌─ 5 RIM ───────────────────── 0/32 ──┐   │
│                                   │  │  (empty — drop samples here)          │   │
│                                   │  │  + ADD SAMPLE                         │   │
│                                   │  └──────────────────────────────────────┘   │
│                                   │                                              │
│                                   │  ┌─ 6 PERC ──────────────────── 0/32 ──┐   │
│                                   │  │  (empty)           + ADD SAMPLE       │   │
│                                   │  └──────────────────────────────────────┘   │
│                                   │                                              │
│                                   │  ┌─ 7 OTHER ─────────────────── 0/32 ──┐   │
│                                   │  │  (empty)           + ADD SAMPLE       │   │
│                                   │  └──────────────────────────────────────┘   │
│                                   │                                              │
├───────────────────────────────────┴──────────────────────────────────────────────┤
│  Connected to TBD-16  ·  WiFi AP  ·  192.168.4.1                                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### Left Panel — Sample Pool

The full collection of all samples on the SD card. Contains:

1. **Drop zone** — drag audio files here (any format). Auto-converts in browser.
2. **Upload queue** — progress indicators for files being converted/uploaded.
3. **File browser** — tree view of all WAV files on the device (`/sdcard/tbdsamples/`).
   Each file has preview (▶), rename (✎), and delete (🗑) actions.
4. **Target folder selector** — where uploads land on the SD card.

Files in the Pool exist on the SD card but are not necessarily assigned to any Kit.
The Pool may be much larger than what fits in PSRAM — the user curates Kits from it.

### Right Panel — Kit Editor

The destination. Shows the active Kit organized into **named bank groups**,
matching the drum machine paradigm:

- **Kit selector** at the top — choose which Kit to edit, create new Kits
- Each bank is a collapsible card showing its assigned samples
- Bank header shows: index, name, fill count (e.g., "4/32")
- Drag handles (⫶) for reordering slices within a bank
- Per-sample: preview, rename (display name), remove from bank
- "+ ADD SAMPLE" opens a picker or accepts drag-from-left-panel
- Banks are scrollable independently of the left panel
- **Flat/Banked toggle** — switch between flat view (all slices in one list)
  and banked view (organized into named groups)

### Sample Assignment: How Samples Move Pool → Kit

| Method | Flow |
|--------|------|
| **Drag and drop** | Drag a file from the left panel into a bank card on the right. The sample is appended to that bank's slice list. |
| **"+ ADD SAMPLE" button** | Click on a bank → opens a picker showing available files from the Pool. Select one or more. |
| **Auto-assign on upload** | Optional: when uploading, a "Target bank" dropdown lets the user assign directly during upload. |
| **Drop on drop zone with bank selected** | If a bank is "active" (highlighted), dropping files auto-assigns to that bank after conversion + upload. |

### Interaction Model

| Action | How |
|--------|-----|
| **Upload** | Drag files onto drop zone (left panel), or click "Browse." Files auto-convert and upload sequentially. |
| **Preview** | Click ▶ on any sample (left or right panel). Fetches from device, plays via Web Audio. |
| **Rename file** | Click ✎ in left panel. `sl-dialog` with `sl-input`. Renames the WAV on disk. |
| **Delete file** | Click 🗑 in left panel. Confirm via `sl-dialog`. Removes WAV from disk + any Kit references. |
| **Assign to bank** | Drag from left → right, or use "+ ADD SAMPLE" in a bank card. |
| **Remove from bank** | Click × on a sample in a bank card. Removes from Kit descriptor, WAV stays on disk (in Pool). |
| **Reorder in bank** | Drag handle (⫶) within a bank card. Updates slice order. |
| **Rename bank** | Click on bank name → inline edit. Stored in Kit metadata. |
| **Reload PSRAM** | Click "🔄 Reload" in the top bar. Brief audio mute. New Kit takes effect. |
| **Switch Kit** | Kit selector dropdown. Loads a different Kit configuration. |
| **Create new Kit** | Click "+ New" next to Kit selector. Clone active Kit or start empty. |

---

## 8. File & Data Model

### Client State

```javascript
const state = {
    // Files on device — the SAMPLE POOL (from /api/v1/samples/list)
    files: [],           // [{ name, path, size }]

    // Kit index (from sample_rom.jsn)
    kits: {},            // { smp_banks, smp_bank_names, active_smp_bank }

    // Active Kit's slice array (flat — banks are virtual groups)
    kitEntries: [],      // Active Kit descriptor: [{ filename, path, nsamples, sname }, ...]

    // Bank metadata (names/colors for the active Kit's sub-groups)
    banks: [
        { name: 'KICK',     color: '#4CAF50', collapsed: false },
        { name: 'SNARE',    color: '#2196F3', collapsed: false },
        { name: 'HIHAT CL', color: '#FFC107', collapsed: false },
        { name: 'HIHAT OP', color: '#FF9800', collapsed: false },
        { name: 'CLAP',     color: '#E91E63', collapsed: false },
        { name: 'RIM',      color: '#9C27B0', collapsed: true  },
        { name: 'PERC',     color: '#00BCD4', collapsed: true  },
        { name: 'OTHER',    color: '#607D8B', collapsed: true  },
    ],
    activeBank: 0,       // Currently selected bank (for auto-assign)
    slicesPerBank: 32,   // Matches Rompler bank×32 addressing
    viewMode: 'banked',  // 'banked' (organized) or 'flat' (all slices in one list)

    // Upload queue (client-only)
    uploadQueue: [],     // [{ file, originalName, sanitizedName, targetPath, targetBank, status, progress, blob }]

    // UI state
    selectedFiles: new Set(),
    currentFolder: '',
    previewPlaying: null,
};
```

### Folder Structure Convention

Uploaded files go into a user-chosen subfolder. Suggested defaults:

| Source | Default folder |
|--------|---------------|
| User uploads | `drums/user` or `samples/user` |
| Factory (shipped) | `drums/factory`, `other/`, etc. |

The user can create new subfolders from the UI (client sends the path with the upload).

---

## 9. Shoelace Component Map

Shoelace provides the building blocks. Here's what we use:

| UI Element | Shoelace Component | Purpose |
|---|---|---|
| File drop zone | Custom `<div>` + drag events | Shoelace doesn't have a drop zone; simple CSS + JS |
| Upload progress | `<sl-progress-bar>` | Per-file upload progress |
| Upload status | `<sl-badge>` | "Queued" / "Converting" / "Uploading" / "Done" / "Error" |
| File browser tree | `<sl-tree>` + `<sl-tree-item>` | Folder hierarchy with expand/collapse (left panel) |
| Sample row actions | `<sl-icon-button>` | Play, Rename, Delete icons |
| Bank card | `<sl-card>` | Each bank group is a card with colored header (right panel) |
| Bank name (editable) | `<sl-input size="small">` | Inline-editable bank name in card header |
| Bank collapse | `<sl-details>` | Collapsible bank cards for compact view |
| Drag-and-drop reorder | Sortable.js or native drag | Reorder slices within a bank |
| Bank sample count | `<sl-badge variant="neutral">` | "4/32" fill indicator on bank header |
| Bank/Kit selector | `<sl-select>` + `<sl-option>` | Choose active Kit (sample pack) |
| Folder selector | `<sl-select>` + `<sl-option>` | Choose upload target folder |
| Target bank selector | `<sl-select>` + `<sl-option>` | Choose which bank to auto-assign uploads to |
| New folder dialog | `<sl-dialog>` + `<sl-input>` | Create new subfolder |
| Rename dialog | `<sl-dialog>` + `<sl-input>` | Rename a sample |
| Delete confirmation | `<sl-dialog>` | "Are you sure?" |
| Reload button | `<sl-button variant="warning"` | Trigger PSRAM reload |
| Toast notifications | `<sl-alert>` (toast) | Success/error feedback |
| Capacity bar | `<sl-progress-bar>` | PSRAM usage: used / max (top bar) |
| Dark/light toggle | `<sl-switch>` | Toggle `sl-theme-dark` class |
| Page header | `<sl-breadcrumb>` | Navigation back to main UI |
| Loading spinner | `<sl-spinner>` | During reload or initial load |
| Split panel | `<sl-split-panel>` | Left/right resizable layout |

### Shoelace Loading

Since the device serves static files from `/sdcard/www/` and we can't assume internet
connectivity, we **self-host Shoelace**. Download the CDN bundle and include it in
our www folder:

```
sdcard_image/www/
├── shoelace/
│   ├── shoelace-autoloader.js
│   ├── themes/
│   │   ├── light.css
│   │   └── dark.css
│   └── chunks/
│       └── ... (lazy-loaded component chunks)
├── samples.html
└── js/
    └── sample-manager.js
```

In `samples.html`:
```html
<link rel="stylesheet" href="/shoelace/themes/dark.css">
<script type="module" src="/shoelace/shoelace-autoloader.js"></script>
```

The autoloader only downloads component chunks when they're first used in the DOM,
keeping initial load fast. Gzipped, the Shoelace core is ~15 KB and each component
chunk is 2-8 KB.

**Important trade-off:** The Shoelace bundle adds ~200-300 KB to the SD card image
(pre-gzip), but loads incrementally. This is comparable to Onsen UI (~200 KB) + jQuery
(~87 KB) which we already ship. For this first iteration we keep both — `samples.html`
uses Shoelace while the existing pages continue using Onsen UI.

---

## 10. Upload Flow — End to End

```
 User drags "funky_kick.mp3" onto drop zone
          │
          ▼
 1. File enters upload queue  (status: "queued")
          │
          ▼
 2. Read file as ArrayBuffer   (FileReader.readAsArrayBuffer)
          │
          ▼
 3. Decode audio               (AudioContext.decodeAudioData)
    status: "converting"
          │
          ▼
 4. Resample + mono downmix    (OfflineAudioContext.startRendering)
    Target: 44100 Hz, 1 channel
          │
          ▼
 5. Encode to WAV Blob          (encodeWAV function)
    Result: Blob { type: "audio/wav", size: 23456 }
    metadata: { nsamples: 11706, filename: "funky_kick" }
          │
          ▼
 6. Validate                    (size check, name check, capacity check)
          │
          ▼
 7. Upload via fetch()          (status: "uploading")
    POST /api/v1/samples/upload?path=drums/user&filename=funky_kick
    Content-Type: application/octet-stream
    Body: <raw WAV bytes>
          │
          ├─── Progress via ReadableStream if supported,
          │    otherwise just start/end
          │
          ▼
 8. Server streams to SD card, responds with { ok: true, nsamples: 11706 }
          │
          ▼
 9. Client updates file list     (status: "done")
    Optionally: auto-add to active Kit's target bank
          │
          ▼
10. User clicks "🔄 Reload Samples" when ready
    POST /api/v1/samples/reload
    Brief audio mute → samples available to Rompler
```

### Upload Progress

The `fetch()` API doesn't natively support upload progress. Two options:

**Option A (simple, first iteration):**
Show per-file progress as indeterminate during upload, determinate for conversion.
The conversion step is usually longer than upload on a local WiFi network anyway.

**Option B (XMLHttpRequest fallback):**
```javascript
function uploadFile(blob, path, filename, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/v1/samples/upload?path=${encodeURIComponent(path)}&filename=${encodeURIComponent(filename)}`);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100));
        };
        xhr.onload = () => resolve(JSON.parse(xhr.responseText));
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(blob);
    });
}
```

**Recommendation:** Use Option B (XHR) for real upload progress bars. It's a few more
lines of code but the UX improvement is significant for larger files.

### Sequential Upload Queue

Files upload one at a time to avoid overwhelming the ESP32's limited sockets:

```javascript
async function processUploadQueue() {
    while (uploadQueue.length > 0) {
        const item = uploadQueue[0];
        try {
            item.status = 'converting';
            updateUI();
            const wavBlob = await convertToWAV(item.file);

            item.status = 'uploading';
            updateUI();
            await uploadFile(wavBlob, item.targetPath, item.sanitizedName, (pct) => {
                item.progress = pct;
                updateUI();
            });

            item.status = 'done';
        } catch (e) {
            item.status = 'error';
            item.error = e.message;
        }
        updateUI();
        uploadQueue.shift();
    }
}
```

---

## 11. Rename & Delete Flows

### Rename

```
User clicks ✎ on "BD0"
        │
        ▼
sl-dialog opens with sl-input prefilled "BD0"
User types "KICK_909"
        │
        ▼
Client validates: sanitizeFilename("KICK_909") → "KICK_909" ✓
        │
        ▼
POST /api/v1/samples/manage
Body: { "action": "rename", "path": "drums/factory", "oldName": "BD0", "newName": "KICK_909" }
        │
        ▼
Server:
  1. rename("/sdcard/tbdsamples/drums/factory/BD0.wav",
           "/sdcard/tbdsamples/drums/factory/KICK_909.wav")
  2. Scan active Kit descriptor: find entry with filename="BD0", path="drums/factory"
     → update filename to "KICK_909"
  3. Write updated Kit descriptor to SD
        │
        ▼
Response: { "ok": true }
        │
        ▼
Client refreshes file list
```

### Delete

```
User clicks 🗑 on "BD0"
        │
        ▼
sl-dialog: "Delete BD0.wav from drums/factory? This cannot be undone."
        │
        ▼
POST /api/v1/samples/manage
Body: { "action": "delete", "path": "drums/factory", "filename": "BD0" }
        │
        ▼
Server:
  1. remove("/sdcard/tbdsamples/drums/factory/BD0.wav")
  2. Scan active Kit descriptor: remove entry with filename="BD0", path="drums/factory"
  3. Write updated Kit descriptor to SD
        │
        ▼
Response: { "ok": true }
        │
        ▼
Client refreshes file list + Kit entries
```

---

## 12. Kit & Bank Management

### How Banks Map to the Kit Descriptor

A Kit descriptor is a flat JSON array of sample entries. Banks are **virtual
groups** — the first 32 entries are Bank 0, the next 32 are Bank 1, etc.

```
Kit descriptor array index:
  [ 0.. 31] → Bank 0 (KICK)     — Rompler bank=0, slice=0..31
  [32.. 63] → Bank 1 (SNARE)    — Rompler bank=1, slice=0..31
  [64.. 95] → Bank 2 (HIHAT CL) — Rompler bank=2, slice=0..31
  [96..127] → Bank 3 (HIHAT OP) — Rompler bank=3, slice=0..31
  [128..159] → Bank 4 (CLAP)    — Rompler bank=4, slice=0..31
  [160..191] → Bank 5 (RIM)     — Rompler bank=5, slice=0..31
  [192..223] → Bank 6 (PERC)    — Rompler bank=6, slice=0..31
  [224..255] → Bank 7 (OTHER)   — Rompler bank=7, slice=0..31
```

**Sparse banks are fine.** If Bank 0 only has 4 samples, slots 4–31 are empty
(null entries or omitted). The Kit descriptor only stores the non-empty entries
but the Sample Manager UI tracks their position.

### Flat Fallback: No Banks

If the user doesn't organize into banks, all samples simply sit sequentially
starting from index 0. This is the traditional behaviour and is fully backwards-
compatible with existing Kit descriptors. In this case:

- All 4 Romplers browse the same flat address space
- Bank 0 = slices 0–31, Bank 1 = slices 32–63, etc. (no semantic grouping)
- The WebUI shows a single flat list in the Kit Editor

The user can switch to "banked" view at any time and start organizing.

### Extended Kit Metadata Format

To support bank metadata (names, colors), we extend `sample_rom.jsn` with an
optional `smp_bank_meta` field:

```json
{
  "smp_banks": ["berlin_techno.jsn"],
  "smp_bank_names": ["Berlin Techno"],
  "smp_bank_tags": [["techno", "berlin", "TR-style"]],
  "smp_bank_meta": [
    {
      "banks": [
        { "name": "KICK",     "color": "#4CAF50" },
        { "name": "SNARE",    "color": "#2196F3" },
        { "name": "HIHAT CL", "color": "#FFC107" },
        { "name": "HIHAT OP", "color": "#FF9800" },
        { "name": "CLAP",     "color": "#E91E63" },
        { "name": "RIM",      "color": "#9C27B0" },
        { "name": "PERC",     "color": "#00BCD4" },
        { "name": "OTHER",    "color": "#607D8B" }
      ]
    }
  ],
  "active_smp_bank": 0
}
```

Bank names and colors are purely UI metadata — the firmware ignores them.
If `smp_bank_meta` is absent, the UI falls back to default names (KICK, SNARE,
etc.) matching the standard drum machine convention.

### Adding a Sample to a Bank

```javascript
async function addToBank(bankIndex, filename, path) {
    // 1. Get nsamples from file metadata
    const fileInfo = state.files.find(f => f.name === filename + '.wav' && f.path === path);
    const nsamples = Math.floor((fileInfo.size - 44) / 2);

    // 2. Find the offset for this bank group (bankIndex * 32)
    const bankOffset = bankIndex * 32;
    const bankEntries = getBankEntries(bankIndex);

    if (bankEntries.length >= 32) {
        showError(`Bank ${state.banks[bankIndex].name} is full (32 slices max)`);
        return;
    }

    // 3. Insert at the correct position in the flat Kit array
    const insertPos = bankOffset + bankEntries.length;
    state.kitEntries[insertPos] = {
        filename: filename,
        path: path,
        nsamples: nsamples,
        sname: ''
    };

    // 4. Save Kit descriptor to device
    await saveKitToDevice();
}

function getBankEntries(bankIndex) {
    const start = bankIndex * 32;
    const end = start + 32;
    return state.kitEntries.slice(start, end).filter(e => e !== null);
}
```

### Reordering Within a Bank

Drag-and-drop reordering within a bank card swaps entries within that bank's
32-slot range — entries [start..start+31]. This changes which `slice` index each
sample occupies, which affects which sample the Rompler plays when sweeping
the slice knob/CV.

### Bank-Aware Upload Flow

When uploading files, the user can optionally pre-select a target bank:

1. User selects "KICK" as target bank (right panel)
2. Drops files onto the drop zone (left panel)
3. Each file converts → uploads to Pool → auto-assigns to KICK bank in active Kit
4. No extra dialog needed

This mirrors the Bastl Wave Bard pattern where each group has its own
"+ ADD SAMPLES" button.

### Kit Lifecycle

A **Kit** is a complete sample pack — the full set of samples loaded into PSRAM
for a project or song. The data model already supports multiple Kits via
`smp_banks` array. The WebUI provides Kit management:

| Operation | v1 | Future |
|---|---|---|
| Edit active Kit's banks | ✓ | ✓ |
| Switch between Kits (reload PSRAM) | ✓ (existing mechanism) | ✓ |
| Create new Kit from Pool | ✓ (new in v1) | ✓ |
| Clone active Kit as template | ✓ | ✓ |
| Delete Kit | — | ✓ |
| Export/import Kit as JSON | — | ✓ (backup/share) |

### Creating a New Kit

The user builds a Kit from the Sample Pool:

```
1. Click "+ New Kit" → enter name (e.g., "Berlin Techno")
   → creates empty Kit descriptor on SD

2. Browse Pool (left panel) → drag samples into bank cards (right panel)
   → builds the Kit's slot assignments

3. Repeat until all desired samples are assigned

4. Click "🔄 Reload" → Kit loads into PSRAM → Romplers play the new samples

5. Each Rompler (ch7, ch8, ch13, ch14 in PicoSeqRack) independently
   selects bank + slice from the loaded Kit
```

**Important:** The Pool may contain hundreds of samples (10+ GB on SD), but a Kit
can only hold ~28 MB in PSRAM. The Kit Editor shows a capacity bar to prevent
the user from exceeding PSRAM limits.

---

## 13. Constraints & Limits

| Constraint | Value | Source |
|---|---|---|
| Max samples per bank | 128 (configurable 32–1024) | `CONFIG_MAX_SAMPLES_IN_SAMPLE_ROM` |
| Max PSRAM for samples | ~28 MB | `CONFIG_MAX_ALLOC_BYTES_PSRAM_SAMPLE_DATA` = 29,360,128 |
| Max filename stem length | 32 characters | `wav_info_parser.py` convention |
| Max simultaneously open sockets | 7 | ESP-IDF httpd default |
| Max URI handlers | 20 (16 used + 4 new) | `config.max_uri_handlers = 20` |
| HTTP scratch buffer | 10 KB | `SCRATCH_BUFSIZE = 10240` |
| SD card throughput | ~4-8 MB/s write (4-bit SDMMC, DDR50) | Hardware spec |
| WAV format | RIFF, PCM, 44.1 kHz, mono, 16-bit | Rompler requirement |
| Audio during upload | Continues playing | HTTP on Core 0, DSP on Core 1 |
| Audio during reload | Brief mute (~50-200ms) | `DisablePluginProcessing()` |

### WiFi Upload Speed Expectation

| Mode | Typical throughput | 1 MB sample upload time |
|------|-------------------|------------------------|
| WiFi AP | ~2-4 Mbit/s | ~2-4 seconds |
| WiFi STA | ~5-15 Mbit/s | ~0.5-1.5 seconds |
| USB-NCM | ~5-10 Mbit/s | ~1-2 seconds |

These are acceptable for interactive use. A 30-sample batch (typical drum kit)
at ~500 KB average = ~15 MB total would take about 30-60 seconds over WiFi AP.

---

## 14. Serving Strategy

### How the New Page Gets to the Device

The existing `create_sd_archive.sh` handles this automatically:

1. Place `samples.html` and `js/sample-manager.js` in `sdcard_image/www/`
2. Place the Shoelace bundle in `sdcard_image/www/shoelace/`
3. `create_sd_archive.sh` gzips everything into the SD card ZIP
4. The ESP32 serves `*.gz` files with `Content-Encoding: gzip`

No changes needed to `rest_common_get_handler` — it already serves any file under
`/sdcard/www/` by path.

### Linking from Existing UI

Add a "Sample Manager" button/link to `main.html`:

```html
<ons-list-item tappable onclick="window.location.href='samples.html'">
    Sample Manager
</ons-list-item>
```

Or simply navigate directly to `http://<device-ip>/samples.html`.

### Gzip Consideration for Shoelace Chunks

The Shoelace autoloader dynamically fetches component chunks (e.g., `chunks/chunk.XXXXX.js`).
Our static file server appends `.gz` to every path and sets `Content-Encoding: gzip`.
This means **all Shoelace files must be pre-gzipped** — which `create_sd_archive.sh`
already does for all files under `www/`.

One catch: the autoloader requests `/shoelace/chunks/chunk.XXXXX.js` but the server
looks for `/sdcard/www/shoelace/chunks/chunk.XXXXX.js.gz`. This works as long as
`create_sd_archive.sh` gzips the chunk files. No code changes needed.

---

## 15. Implementation Plan

### Phase 1: Backend API (~3-4 days)

| Task | Est. | Details |
|------|------|---------|
| `samples_list_handler` | 1 day | Recursive dir scan of `/sdcard/tbdsamples/`, build JSON response. Use `std::filesystem` for iteration. Include Kit metadata. |
| `samples_upload_handler` | 1 day | Stream POST body to file, create dirs with `mkdir -p` equivalent, validate WAV header, compute nsamples, return metadata. |
| `samples_manage_handler` | 1 day | Parse JSON body, dispatch to rename/delete/updateBank. Update Kit descriptors on rename/delete. |
| `samples_reload_handler` | 0.5 day | Call existing `DisablePluginProcessing()` / `RefreshDataStructureFromSDCard()` / `EnablePluginProcessing()` sequence. |
| Register URI handlers | 0.5 day | Wire up all 4 handlers in `StartRestServer()`. Test with `curl`. |

**Deliverable:** `curl` can list, upload, rename, delete, and reload samples.

### Phase 2: Client Conversion Pipeline (~2-3 days)

| Task | Est. | Details |
|------|------|---------|
| `encodeWAV()` function | 0.5 day | Float32Array → WAV Blob. Unit-test in browser console. |
| `convertToWAV(file)` function | 1 day | File → AudioContext.decodeAudioData → OfflineAudioContext resample → encodeWAV. Test with MP3, AIFF, OGG, WAV inputs. |
| `sanitizeFilename()` function | 0.25 day | Port from Python. |
| Upload function with progress | 0.5 day | XHR-based upload with progress callback. |
| Sequential queue processor | 0.5 day | Process files one at a time, update status. |

**Deliverable:** JS module that converts any audio file and uploads it. Testable in
browser console without UI.

### Phase 3: WebUI (~3-4 days)

| Task | Est. | Details |
|------|------|---------|
| `samples.html` page skeleton | 0.5 day | Shoelace imports, dark theme, left/right split layout (`sl-split-panel`). |
| Drop zone + file picker | 0.5 day | Drag-and-drop + `<input type="file">` fallback (left panel). |
| Upload queue display | 0.5 day | `sl-progress-bar` + `sl-badge` per file. |
| File browser tree | 1 day | `sl-tree` populated from `/api/v1/samples/list`. Folders expand/collapse (left panel). |
| Bank cards (right panel) | 1 day | 8 `sl-card`/`sl-details` components with color-coded headers, editable names, sample lists with drag handles, "+ ADD SAMPLE" buttons. Flat/banked toggle. |
| Drag-from-pool-to-bank | 0.5 day | Drag a sample from the left tree into a bank card on the right. |
| Preview playback | 0.5 day | Fetch WAV from device, play via AudioContext. |
| Rename dialog | 0.25 day | `sl-dialog` + `sl-input` + POST rename. |
| Delete confirmation | 0.25 day | `sl-dialog` + POST delete. |
| Reorder within bank | 0.5 day | Drag handle (⫶) reordering within bank cards (Sortable.js or native). |
| Reload button | 0.25 day | `sl-button` + POST reload + loading spinner. |
| Capacity indicator | 0.25 day | `sl-progress-bar` showing PSRAM usage. |

**Deliverable:** Fully functional sample manager page.

### Phase 4: Integration & Polish (~1-2 days)

| Task | Est. | Details |
|------|------|---------|
| Add Shoelace to `sdcard_image/www/` | 0.5 day | Download CDN bundle, place in `www/shoelace/`. Verify gzip serving works. |
| Link from main UI | 0.25 day | Add "Sample Manager" entry to `main.html`. |
| Test on device (WiFi AP + STA) | 0.5 day | Upload various formats, rename, delete, reload. |
| Test on simulator | 0.25 day | REST API endpoints work in `tbd-sim`. |
| Error handling polish | 0.5 day | Network errors, file not found, capacity exceeded, decode failures. |

**Total: ~10-13 days** for a fully working first iteration.

---

## 16. File Structure

### New Files

```
sdcard_image/www/
├── samples.html                    ← NEW: Sample manager page
├── js/
│   └── sample-manager.js           ← NEW: Conversion, upload, UI logic
├── shoelace/                        ← NEW: Self-hosted Shoelace bundle
│   ├── shoelace-autoloader.js
│   ├── themes/
│   │   ├── light.css
│   │   └── dark.css
│   └── chunks/
│       └── ... (lazy-loaded)
└── (existing files untouched)

main/
├── RestServer.cpp                  ← MODIFIED: Add 4 new handlers
└── RestServer.hpp                  ← MODIFIED: Declare new handler methods
```

### Modified Files

| File | Change |
|------|--------|
| `main/RestServer.cpp` | Add `samples_list_handler`, `samples_upload_handler`, `samples_manage_handler`, `samples_reload_handler` + URI registration |
| `main/RestServer.hpp` | Declare the 4 new static handler methods |
| `sdcard_image/www/main.html` | Add "Sample Manager" link |
| `create_sd_archive.sh` | No changes needed — already gzips all `www/` files |

---

## 17. Open Questions

| Question | Options | Recommendation |
|----------|---------|----------------|
| **Preview: stream from device or re-use converted blob?** | Stream from device (proves file integrity) vs. play from local memory (faster) | **Stream from device** — confirms the upload worked and matches what the Rompler will play |
| **Auto-add uploaded files to active bank?** | Always add / ask / never auto-add | **Yes, if a target bank is selected** — the bank selector in the right panel determines where uploads land. If no bank selected, files go to Pool only. |
| **New folder creation** | Allow arbitrary nesting? Flat list of folders? | **One level deep** — `drums/user`, `samples/pads`, etc. Keep it simple. |
| **What if user uploads a file that's already 44.1k/mono/16-bit?** | Convert anyway? Skip conversion? | **Always convert** — ensures consistency, handles edge cases (weird headers, metadata), minimal overhead |
| **Bank editing: reorder slots across banks?** | Drag between bank cards? | **No** — only reorder within a bank for v1. Moving between banks = remove + add. |
| **Default bank count** | 4, 8, or configurable? | **8 banks** — matches common TR-style layout. Unused banks stay collapsed/empty. Future: user-configurable. |
| **Bank names: editable or fixed?** | Let users rename banks? | **Editable** — stored in `smp_bank_meta` metadata. Defaults to drum machine names. |
| **Kit vs. Bank naming** | Should the UI call them "kits" or "banks"? | **Kits** for the top-level sample packs ("Berlin Techno"), **Banks** for sub-groups within a Kit ("KICK", "SNARE"). The API data model uses `smp_banks` for historical reasons (referring to Kits). |
| **File serving: gzip the WAV files too?** | Serve WAV raw or gzipped? | **Raw** for preview playback — add WAV to the non-gzipped content type list in `set_content_type_from_file()`. WAV files are not served from `/www/` but from `/sdcard/tbdsamples/` which needs a new static handler or inline content serving within the list handler. |
| **Preview endpoint** | New endpoint? Or serve directly? | **Inline in list handler** — `GET /api/v1/samples/list?preview=drums/factory/BD0.wav` returns raw WAV bytes. Avoids consuming another URI handler slot. |
| **Shoelace version** | Latest 2.20.1 (last release before Web Awesome) | **2.20.1** — stable, no migration concerns, Shoelace docs still available |
| **Sparse vs. dense Kit descriptor** | Store empty slots as null or omit them? | **Sparse with bank offsets** — each bank starts at index `bankIndex × 32`. Entries within a bank are packed. Keeps the descriptor human-readable and compatible with the flat-index Rompler addressing. |

### Preview File Serving — Important Detail

The existing `rest_common_get_handler` serves files from `/sdcard/www/` and adds
`Content-Encoding: gzip`. But sample files live in `/sdcard/tbdsamples/` and must
be served as raw binary (not gzipped).

**Solution:** Extend the `GET /api/v1/samples/list*` handler to support a `preview`
query parameter that streams the raw WAV file:

```
GET /api/v1/samples/list?preview=drums/factory/BD0
→ Content-Type: audio/wav
→ Body: raw WAV bytes (streamed in chunks)
```

This reuses the existing URI handler slot. The handler checks for the `preview`
parameter and switches behavior: if present, stream the file; if absent, return
the JSON listing.

---

## Summary

This first iteration replaces the three-step offline workflow (Python script →
local HTML → SD card swap) with a single web page that:

1. **Browses the Sample Pool** — all WAV files on the SD card, the user's full collection
2. **Converts** any audio format to 44.1k/mono/16-bit in the browser
3. **Uploads** the converted WAV directly to the device over WiFi/USB
4. **Manages** files on the device (rename, delete, organize)
5. **Builds Kits (sample packs)** from the Pool using a left/right split UI —
   Pool on the left, Kit Editor (KICK, SNARE, HIHAT, etc.) on the right
6. **Leverages the existing Rompler addressing** (`bank × 32 + slice`) to map
   named banks to sample groups — no firmware changes required
7. **Reloads** the Kit into PSRAM with one click

### The Correct Hierarchy

```
Pool (all WAV files on SD card — may be 10+ GB)
 └── Kit / Sample Pack ("Berlin Techno" — loaded into ~28MB PSRAM)
      └── Bank (sub-group, e.g. "KICK" — Rompler bank param 0-31)
           └── Slice (individual sample — Rompler slice param 0-31)
```

- **Kit ≠ Bank.** A Kit is the whole sample pack loaded for a project.
  Banks are sub-groups *within* a Kit.
- Each PicoSeqRack Rompler track (ch7, ch8, ch13, ch14) independently
  selects which bank + slice to play from the shared loaded Kit.
- If a Kit has no bank structure, all Romplers browse the same flat list
  (fallback mode — backwards compatible with existing Kit descriptors).

The stack is deliberately minimal: Vanilla JS + Shoelace Web Components + 4 new
REST endpoints. No build step for JS. No framework runtime. The Shoelace components
give us a polished UI (dialogs, trees, progress bars, dark theme, split panels)
without writing low-level DOM code.

The bank-based organization follows the drum machine paradigm established by
Roland TR-x0x, Teenage Engineering EP-133, and Bastl Wave Bard: named instrument
groups, each with a pool of sample variations the player selects between — exactly
what the Rompler's `bank` and `slice` parameters already provide.

The architecture proves the pattern we'll use for the full WebUI rewrite: self-hosted
Shoelace replacing Onsen UI + jQuery, schema-driven rendering, and a clean REST API.
