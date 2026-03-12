# Merge Plan: romplerfixes-nevvkid → dada-tbd-master

## Executive Summary

This document is the **merge plan** for bringing all work from `romplerfixes-nevvkid` 
into `dada-tbd-master` so it can be pushed to the upstream `dadamachines/ctag-tbd` repo.

**Bottom line**: The merge is feasible but requires careful conflict resolution.
A dry-run merge showed **46 conflicting files**, but the majority are **predictable 
and mechanical** (old WebUI deletion, add/add of identically-intended files, header 
differences). Only **~6 files require careful manual resolution** of genuinely 
divergent code.

---

## Constraints (from user)

1. **Squash merge** — No private repo development history visible on `dada-tbd-master`
2. **Exclude `prototyping/`** — 42 internal planning documents must not appear
3. **Must not break anything** — The merged result must build and boot
4. **Target**: Push to `upstream` remote (`dadamachines/ctag-tbd`) `dada-tbd-master`

---

## Licensing — Critical Context

The upstream LICENSE file defines a dual-license structure:

### 1. Core DSP Engine — GPL 3.0
(c) Robert Manzke / ctag-fh-kiel. The audio engine, sound processors, and platform core.

### 2. dadamachines Additions — LGPL 3.0
(c) Johannes Elias Lohbihler / dadamachines. WebUI, tools, documentation, build tools, utilities.

LGPL 3.0 means:
- Individual developers can freely use, modify, and contribute
- Modifications to LGPL'd code must be shared under the same terms if distributed
- **Other companies may NOT use these components commercially** without contributing back
- Commercial license available from dadamachines

### 3. possan's Work — LGPL, NOT for upstream
(c) Per-Olov Jernberg (possan) — https://github.com/possan / https://possan.codes / possan@possan.se

The following components were developed by possan and are licensed under LGPL 3.0
by agreement with dadamachines for use in the TBD-16 product:

| Component | Files | License |
|-----------|-------|---------|
| **PicoSeqRack** | `ctagSoundProcessorPicoSeqRack.cpp/hpp` | LGPL 3.0 (possan) |
| **Rack DSP machines** | `components/ctagSoundProcessor/rack/*` (~30 files) | LGPL 3.0 (possan) |
| **Macro/Preset system** | `main/MacroTranslator.*`, `main/MacroSoundPreset.*`, `main/MacroDeviceDefinition.*`, `main/SynthDefinition.*`, `main/TrackDefinition.*` | LGPL 3.0 (possan) |
| **Macro definitions** | `sdcard_image/data/macro-definitions/*.json` (~33 files) | LGPL 3.0 (possan) |
| **Macro presets** | `sdcard_image/data/macro-presets/*.json` (~40 files) | LGPL 3.0 (possan) |
| **Track defaults** | `sdcard_image/data/trackdefaults.json` | LGPL 3.0 (possan) |
| **SPI protocol additions** | `main/SpiProtocol.h`, `main/SpiProtocolHelper.*` | LGPL 3.0 (possan) |

**These must NOT be brought upstream to ctag-fh-kiel/ctag-tbd.** dadamachines has
a commercial license to use possan's work in the TBD-16 product. Other parties
cannot use it commercially.

### 4. WebUI & Update System — LGPL 3.0 (dadamachines)
(c) Johannes Elias Lohbihler / dadamachines

| Component | Files |
|-----------|-------|
| **New Shoelace SPA WebUI** | `sdcard_image/www/` (index.html, app.js, designer.js, performer.js, etc.) |
| **Preset/Macro Manager** | `sdcard_image/www/preset-macro-manager.html` |
| **WebUI Update System** | `sdcard_image/www/webui-update.html`, `create_webui_update.sh` |
| **REST API modules** | `main/PluginAPI.*`, `main/SampleAPI.*`, `main/MacroAPI.*`, `main/DeviceAPI.*` |
| **Build tooling** | `sdcard_image/www/build-webui.sh`, `create_sd_archive.sh` |

---

## Branch Topology

```
upstream/dada-tbd-master  (490b4309) — 36 commits ahead of local dada-tbd-master
    │
    │  merge base: b38cee4c ("SPI api addition (#81)")
    │
    ├── upstream side: 262 commits, 1,373 files changed
    │   (mostly: firmware binaries, docs, interviews, beta channel, SD recovery)
    │
    └── our side: 211 commits, 1,595 files changed  
        (macro system, WebUI rewrite, SPI protocol, rompler fixes, rack DSPs,
         update system, possan merge)

local dada-tbd-master     (b9499309) — 36 commits behind upstream
romplerfixes-nevvkid      (1781cee4) — our working branch
```

---

## Recommended Strategy

### Why `git merge --squash` (not rebase or regular merge)

- **Squash**: Single commit on `dada-tbd-master` with all our changes. Clean history.
  No private repo commit messages visible. This is what the user requested.
- **Regular merge**: Would expose all 211 commit messages from the private repo.
- **Rebase**: Would rewrite ~211 commits onto upstream, complex and still exposes history.

### Execution Plan

1. **Fast-forward local `dada-tbd-master`** to match `upstream/dada-tbd-master` (490b4309)
2. **Create temp branch** `merge-prep` from updated `dada-tbd-master`
3. **`git merge --squash romplerfixes-nevvkid`** on `merge-prep`
4. **Resolve 46 conflicts** (see conflict resolution guide below)
5. **Add LGPL license headers** to all new files (see License Headers section)
6. **Delete `prototyping/`** from the working tree before committing
7. **Delete `readme.md`** (lowercase) — upstream uses `README.md` (which is identical)
8. **Build firmware** to verify
9. **Commit** with a clean summary message
10. **Fast-forward `dada-tbd-master`** to `merge-prep`
11. **Push to `upstream/dada-tbd-master`**

---

## Conflict Analysis (46 files)

### Category A: Old WebUI Deletion — 16 files ⚡ EASY
**Resolution: Accept deletions (our version wins — we replaced the entire WebUI)**

These are `rename/delete` conflicts: upstream renamed `spiffs_image/www/*` → 
`sdcard_image/www/*`, but our branch completely replaced those files with the new 
Shoelace/SPA WebUI. The old files are dead code.

| File | Conflict Type | Resolution |
|------|--------------|------------|
| `sdcard_image/www/config.html` | rename/delete | **Delete** (replaced by new index.html) |
| `sdcard_image/www/drumrack.html` | rename/delete | **Delete** (no longer exists) |
| `sdcard_image/www/edit.html` | rename/delete | **Delete** |
| `sdcard_image/www/fav.html` | rename/delete | **Delete** |
| `sdcard_image/www/load.html` | rename/delete | **Delete** |
| `sdcard_image/www/main.html` | rename/delete | **Delete** |
| `sdcard_image/www/save.html` | rename/delete | **Delete** |
| `sdcard_image/www/css/drumrack.css` | rename/delete | **Delete** |
| `sdcard_image/www/css/onsen-css-c.min.css` | rename/delete | **Delete** |
| `sdcard_image/www/css/onsenui-cr.min.css` | rename/delete | **Delete** |
| `sdcard_image/www/css/sample-rom.css` | rename/delete | **Delete** |
| `sdcard_image/www/js/ajaxq.js` | rename/delete | **Delete** |
| `sdcard_image/www/js/drumrack.js` | rename/delete | **Delete** |
| `sdcard_image/www/js/jquery-3.4.1.min.js` | rename/delete | **Delete** |
| `sdcard_image/www/js/jszip.min.js` | rename/delete | **Delete** |
| `sdcard_image/www/js/onsenui.min.js` | rename/delete | **Delete** |

### Category B: WebUI — 1 conflict + 32 new files ⚡ EASY
**Resolution: Take ours for index.html conflict; 32 new files add cleanly**

Only `index.html` has a conflict (it exists on both branches). All other 32 new
WebUI files are brand-new and will be added cleanly by the squash merge — no
conflict resolution needed:

**Conflict (1 file):**

| File | Conflict Type | Resolution |
|------|--------------|------------|
| `sdcard_image/www/index.html` | add/add | **Take ours** — completely new SPA |

**Clean additions (32 files, no conflicts — added automatically by squash merge):**

| Category | Files |
|----------|-------|
| HTML pages | `preset-macro-manager.html`, `webui-update.html` |
| JS sources | `app.js`, `designer.js`, `performer.js`, `plugin-manager.js`, `sample-manager.js`, `shared.js`, `preset-macro-app.js`, `display-hints.js`, `track-defaults.js` |
| JS bundles | `app-bundle.js`, `macro-bundle.js`, `shoelace-bundle.js`, `webaudio-controls.js` |
| CSS | `css/app.css` |
| Themes | `shoelace/themes/dark.css`, `shoelace/themes/light.css` |
| Build/config | `build-webui.sh`, `package.json`, `.version`, `tools/dev-server.js` |
| Gzipped | `.gz` variants of all served files (8 files) |
| Shared assets | `favicon.ico`, `img/*`, `js/Sortable.min.js`, `readme-api.md` — unchanged, no conflict |

### Category C: Docs/Binary — 7 files ⚡ EASY
**Resolution: Take UPSTREAM for docs (they have later content); take ours for SD card archive**

Upstream's `dada-tbd-master` is the leading branch for documentation. The 36 new
commits on upstream were exclusively docs and firmware binaries — new interviews
(Daria Goremykina, JakoJako, Dasha Rush, Jammin Unit), SD card recovery page,
beta channel page, and updated firmware listings. Our branch has older versions
of these docs files.

| File | Conflict Type | Resolution |
|------|--------------|------------|
| `docs/_static/sdcard_image/tbd-sd-card-hash.txt` | add/add | **Take ours** (our build is newer) |
| `docs/_static/sdcard_image/tbd-sd-card.zip` | add/add (binary) | **Take ours** (our build is newer) |
| `docs/flash/25_flash_dsp.rst` | add/add | **Take UPSTREAM** (has newer firmware listings) |
| `docs/flash/30_flash_ui.rst` | add/add | **Take UPSTREAM** (has newer RP2350 firmware listings) |
| `docs/flash/index.rst` | add/add | **Take UPSTREAM** (has SD card recovery + full recovery links) |
| `docs/interviews/bill-youngman-en.md` | add/add | **Take UPSTREAM** (has full interview text; ours is placeholder) |
| `docs/interviews/index.rst` | add/add | **Take UPSTREAM** (has Daria Goremykina card; ours has old layout) |

### Category D: Build Scripts / Config — 5 files 🔧 MODERATE
**Resolution: Take ours, with verification**

| File | Conflict Type | Lines | Resolution |
|------|--------------|-------|------------|
| `.gitignore` | content | 2 markers | **Take ours** (we added build artifacts) |
| `CMakeLists.txt` (root) | content | 2 markers | **Take ours** (our build config) |
| `main/CMakeLists.txt` | content | 2 markers | **Take ours** (we added new source files) |
| `create_sd_archive.sh` | add/add | different | **Take ours** (104 lines, extended) |
| `create_unified_p4_firmware.sh` | add/add | different | **Take ours** (our build) |

### Category E: Other — 2 files ⚡ EASY

| File | Conflict Type | Resolution |
|------|--------------|------------|
| `readme.md` (lowercase) | modify/delete | **Delete** — upstream renamed to `README.md`, both `README.md` versions are identical |
| `simulator/data/cfg_tbd_sim.jsn` | content | **Take ours** |

### Category F: C++ Firmware — 15 files 🔴 CAREFUL RESOLUTION NEEDED

These are the substantive conflicts that require understanding the code.

#### F1: Components — add/add or content conflicts (8 files)

| File | Markers | Nature | Resolution |
|------|---------|--------|------------|
| `components/ableton_link/link.cpp` | 8 | add/add, slight differences | **Take ours** (4 extra lines) |
| `components/ctagSoundProcessor/helpers/ctagSampleRom.cpp` | 6 | content | **Take ours** (we have possan's latest) |
| `components/ctagSoundProcessor/helpers/ctagSampleRom.hpp` | 4 | content | **Take ours** |
| `components/ctagSoundProcessor/helpers/ctagSampleRomModel.cpp` | 4 | add/add, different | **Take ours** (possan's version with preset support) |
| `components/ctagSoundProcessor/helpers/ctagSampleRomModel.hpp` | 6 | add/add, different | **Take ours** |
| `components/drivers/fs.cpp` | 2 | content | **Take ours** (filesystem changes) |
| `components/drivers/rp2350_spi_stream.cpp` | 6 | content | **Take ours** (SPI protocol updates) |
| `components/drivers/rp2350_spi_stream.hpp` | 2 | content | **Take ours** |

#### F2: Main application — 7 files, MOST CRITICAL

| File | Markers | Nature |
|------|---------|--------|
| `main/SPManager.cpp` | **24** (12 conflicts) | Largest conflict — our SPI protocol handler vs upstream's simple ADC loop |
| `main/RestServer.cpp` | **14** (7 conflicts) | Our refactored REST server with modular API files vs upstream's monolith |
| `main/SpiAPI.cpp` | **8** (4 conflicts) | Our extended SPI API with possan's preset saving |
| `main/SpiAPI.hpp` | **4** (2 conflicts) | Header changes |
| `main/Control.cpp` | **2** (1 conflict) | Minor |
| `main/Control.hpp` | **2** (1 conflict) | Minor |
| `main/RestServer.hpp` | **2** (1 conflict) | Minor |

**Resolution strategy for F2**: **Take ours for all files**. 

Reasoning:
- `SPManager.cpp`: Our version has the complete SPI protocol handler with MIDI, 
  Ableton Link, waveform data, LED control, and the dummy CV/trig buffers. 
  Upstream's version is the simpler pre-SPI version. **Our code is a strict superset.**
- `RestServer.cpp`: We refactored the monolithic REST server into modular API files 
  (`PluginAPI`, `SampleAPI`, `MacroAPI`, `DeviceAPI`). Our version registers 9 URI 
  handlers that delegate to these modules. Upstream still has the old monolithic 
  handler with inline implementations. **Our code is the intended architecture.**
- `SpiAPI.cpp`: Our version includes possan's `PutSamplePresetJSON` and 
  `RefreshSoundPresets` handlers. **Our code is strictly newer.**
- Other files: Minor header/include differences where our version is correct.

---

## Files Only On Upstream We Must Preserve

These 43 files exist on `upstream/dada-tbd-master` but NOT on our branch. 
Since we're squash-merging INTO upstream's branch, **most survive automatically**.

**Upstream is the leading branch for docs/interviews/firmware binaries.** The 36
new commits on upstream are exclusively docs content and firmware files:

Files that survive naturally (no action needed):
- `.github/workflows/build-docs.yml` and `deploy-docs.yml` — CI pipelines
- `docs/_static/sdcard_image/2026-03-02/` and `2026-03-10/` — archived SD images
- `docs/flash/60_sd_card_recovery.rst` and `65_beta_channel.rst` — new doc pages
- `docs/interviews/` — 6 new interview files (JakoJako, Daria, Dasha Rush, Jammin Unit)
- `docs/_static/firmware/` — 8 firmware binary files
- `tools/docker/` — Docker build infrastructure
- `tools/tbdtools/` — Sphinx plugin

Files that our merge removes (correct — we replaced the WebUI):
- Old `sdcard_image/www/` files (config.html, drumrack.html, edit.html, etc.) — 
  **correctly removed**, replaced by new Shoelace SPA WebUI

---

## What Our Squash Commit Adds (net new to dada-tbd-master)

### New files (not on upstream)

**possan's work (LGPL 3.0, Per-Olov Jernberg):**
- **Rack DSP machines**: ~30 files in `components/ctagSoundProcessor/rack/`
- **PicoSeqRack**: `ctagSoundProcessorPicoSeqRack.cpp/hpp`
- **Macro/preset system**: `MacroTranslator`, `MacroSoundPreset`, `MacroDeviceDefinition`, 
  `SynthDefinition`, `TrackDefinition` in `main/`
- **SPI protocol**: `SpiProtocol.h`, `SpiProtocolHelper` in `main/`
- **Macro definitions**: ~33 JSON files in `sdcard_image/data/macro-definitions/`
- **Macro presets**: ~40 JSON files in `sdcard_image/data/macro-presets/`
- **Track defaults**: `sdcard_image/data/trackdefaults.json`

**dadamachines work (LGPL 3.0, Johannes Elias Lohbihler):**
- **WebUI**: All files in `sdcard_image/www/` — new Shoelace SPA architecture
- **REST API modules**: `PluginAPI`, `SampleAPI`, `MacroAPI`, `DeviceAPI` in `main/`
- **WebUI version**: `sdcard_image/data/webui-version.json`
- **Update system**: `sdcard_image/www/webui-update.html`
- **Build tooling**: `sdcard_image/www/build-webui.sh`, `create_sd_archive.sh` updates
- **Docs**: `docs/webui-updater.md`, `docs/_static/updates/latest.json`
- **Skills**: `.github/skills/` directory

### Modified files (changed from upstream's version)
- All 15 C++ files from Category F (firmware changes)
- 5 build scripts from Category D
- Sound processor data files (`mp-*.jsn`, `mui-*.jsn`)

---

## Excluded Content

The following will **NOT** appear on `dada-tbd-master`:
- `prototyping/` — 42 internal planning documents (explicitly excluded)
- `readme.md` (lowercase duplicate) — deleted, `README.md` stays
- Private repo commit history — squash merge hides all 211 commits

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| C++ conflicts resolved incorrectly | **HIGH** | Take-ours strategy is safe — our firmware is leading, strict superset of upstream |
| Docs content lost | **NONE** | Resolved: take upstream for docs conflicts, upstream-only files survive naturally |
| Old WebUI files not fully cleaned | **LOW** | Explicit `git rm` of all old files before commit |
| Build failure after merge | **MEDIUM** | Full firmware build verification step before commit |
| `prototyping/` accidentally included | **LOW** | Explicit `git rm -r` step + verification |
| possan's LGPL work leaks upstream | **LOW** | These files only exist in `dada-tbd-master`, never PRd to ctag-fh-kiel |

---

## License Headers Plan

### Current State

The upstream codebase has a consistent GPL 3.0 header block on all core files:

```c
/***************
CTAG TBD >>to be determined<< is an open source eurorack synthesizer module.

A project conceived within the Creative Technologies Arbeitsgruppe of
Kiel University of Applied Sciences: https://www.creative-technologies.de

(c) 2020 by Robert Manzke. All rights reserved.

The CTAG TBD software is licensed under the GNU General Public License
(GPL 3.0), available here: https://www.gnu.org/licenses/gpl-3.0.txt
...
***************/
```

Our new files currently have **NO license headers** — they jump straight into
`#include` or `#pragma once`. This needs to be fixed before committing to
`dada-tbd-master`.

### Files Needing Headers

#### possan's files — LGPL 3.0 (62 files)

| Location | Count | Examples |
|----------|-------|---------|
| `components/ctagSoundProcessor/rack/` | 39 | `RackMO.cpp/hpp`, `RackSynth.hpp`, `RackFxDelay.cpp/hpp`, etc. |
| `main/` (macro/preset system) | 21 | `MacroTranslator.cpp/hpp`, `MacroSoundPreset.cpp/hpp`, `SynthDefinition.cpp/hpp`, `SpiProtocol.h`, `SpiProtocolHelper.cpp/hpp`, etc. |
| `components/ctagSoundProcessor/` | 2 | `ctagSoundProcessorPicoSeqRack.cpp/hpp` |

**Proposed header for possan C++ files:**

```c
/***************
TBD-16 — Macro/Preset System & PicoSeqRack

(c) 2025-2026 Per-Olov Jernberg (possan). https://possan.codes

Licensed under the GNU Lesser General Public License (LGPL 3.0).
https://www.gnu.org/licenses/lgpl-3.0.txt

dadamachines has a commercial license to use this code in the TBD-16 product.
Other commercial use requires a separate license agreement.
***************/
```

#### dadamachines files — LGPL 3.0 (12 C++ files + 9 JS files)

**C++ files needing headers:**
- `main/MacroAPI.cpp`, `main/MacroAPI.hpp` — currently no header
- `main/PluginAPI.cpp/hpp`, `main/SampleAPI.cpp/hpp`, `main/DeviceAPI.cpp/hpp` — 
  currently have the *wrong* header (copy of upstream GPL 3.0 / Robert Manzke).
  These should be corrected to dadamachines LGPL.

**JS files** already have descriptive banners (`// TBD-16 WebUI — ...`) but no
license/copyright line. A one-line addition at the top is enough.

**Proposed header for dadamachines C++ files:**

```c
/***************
TBD-16 — dadamachines WebUI & REST API

(c) 2024-2026 Johannes Elias Lohbihler for dadamachines.

Licensed under the GNU Lesser General Public License (LGPL 3.0).
https://www.gnu.org/licenses/lgpl-3.0.txt
***************/
```

**Proposed one-liner for dadamachines JS files** (prepended above existing banner):

```js
// (c) 2024-2026 Johannes Elias Lohbihler for dadamachines. LGPL 3.0.
```

#### Files NOT touched (keep existing header)

All upstream core files (`SPManager.cpp`, `ctagSoundProcessor.hpp`, etc.) keep their
existing GPL 3.0 / Robert Manzke headers. We do NOT modify those headers.

---

## Commit Message Template

```
feat: TBD-16 macro/preset system, new WebUI, SPI protocol, rompler fixes

Major additions:
- Macro/preset system with 33 definitions and 40+ presets (possan, LGPL)
- PicoSeqRack DSP machine with 20 rack processors (possan, LGPL)
- SPI protocol handler with MIDI, Ableton Link, waveform data
- New Shoelace-based SPA WebUI replacing old Onsen UI (dadamachines, LGPL)
- Modular REST API: PluginAPI, SampleAPI, MacroAPI, DeviceAPI (dadamachines, LGPL)
- WebUI self-update system, offline + online from GitHub Pages (dadamachines, LGPL)
- Rompler voice fixes, sample ROM model improvements
- Track defaults and synth definition system

Bug fixes:
- RackMO noteOff was a no-op (ch12_mo called noteOn for vel==0)
- WebUI performer dense values save, designer rompler support
- Memory leak in preset saving (possan)
- WebUI displayHint/ui field type alignment

PicoSeqRack, rack DSP machines, macro/preset system by Per-Olov Jernberg (possan).
WebUI, update system, REST API modules by Johannes Elias Lohbihler (dadamachines).
All additions licensed LGPL 3.0 — see LICENSE file.
```

---

## Decision Points for User

1. ~~**Docs conflicts (Category C)**~~ — **RESOLVED**: Take upstream for docs 
   (they have the Bill Youngman interview, newer firmware listings, SD recovery page).
   Take ours only for `tbd-sd-card-hash.txt` and `tbd-sd-card.zip` (our build is newer).

2. **Are you ready to proceed?** The merge is mechanical once you approve the plan. 
   I can execute all steps and produce a build-verified result.

3. **Push target**: Push directly to `upstream/dada-tbd-master`, or create a PR on 
   the upstream repo?
