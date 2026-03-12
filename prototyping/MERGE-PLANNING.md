# Merge Planning: `feature/webui-persona-prototype` → `feature/webui-general-ui-rework`

**Branch A (source):** `feature/webui-persona-prototype` (current, persona/performer/designer UI + macro system)  
**Branch B (target):** `feature/webui-general-ui-rework` (Shoelace general UI + original plugin manager)

**Summary of scale:**  
520 files changed · +48,060 / −144,934 lines  
3,564 lines of new firmware (macro system)  
8,200 lines of new C++ DSP machines  
33 macro definitions + 58 sound presets (new in A, absent in B)

---

## 1. Documentation (`docs/`)

**Status:** `feature/webui-general-ui-rework` has **159 documentation files** (RST, CSS, HTML, images, firmware binaries) that were **deleted** in our branch.

**Content of B's docs:**
- Full developer and user documentation site (Sphinx/ABlog)
- Getting started, plugin tutorials, MIDI, WiFi, flash guides
- Firmware binaries for p4 and pico targets
- SD-card images and hash files

**Decision needed:**
- [x] **Restore docs/ from branch B** — we should bring these back as they are maintained/useful  
- [ ] Or: ignore docs/ divergence and handle separately

---

## 2. Unit Tests (`tests/`)

**Branch A adds:**
- `tests/test_dsp_json_alignment.py` — 6-test suite validating C++ ↔ JSON alignment, Mix pages, macro mappings

**Branch B has (deleted in A):**
- `tests/apitest/test-device-api.sh` — shell-based REST API test suite  
- `tests/apitest/reports/` — 2 historical test reports  
- `tests/webui/run-tests.js` — WebUI automation test runner (1,304 lines)

**Decision needed:**
- [x] **Keep both** — restore B's test files alongside our new test script  
- [ ] Our `test_dsp_json_alignment.py` remains, do not overwrite with B's tests

---

## 3. WebUI — `sdcard_image/www/` ⚠️ MAJOR CONFLICT

This is the most complex area. The two branches have **entirely different implementations** of the `sdcard_image/www/` UI.

### Branch A (our branch) — Old jQuery/OnsenUI multi-page app

- Multi-page HTML structure: `index.html`, `main.html`, `edit.html`, `macros.html`, `drumrack.html`, `fav.html`, `load.html`, `save.html`, `config.html`
- JS: `drumrack.js`, `macros.js`, `jquery`, `jszip`, `ajaxq`, `onsenui`
- CSS: `drumrack.css`, `macros.css`, `onsen-css`
- Built preseteditor: `preseteditor.html`, `preseteditor-*.css`, `preseteditor-*.js`

### Branch B (target) — Modern Shoelace single-page app

- Single `index.html` with all UI inline
- JS: `shoelace-bundle.js`, `app-bundle.js`, `app.js`, `plugin-manager.js`, `sample-manager.js`, `shared.js`, `display-hints.js`
- This is the "proper" modern UI that general-ui-rework is building toward

### Branch A also adds — `sdcard_image/www-prototype/` (NEW, not in B)

- Our newest, best Persona/Performer/Designer WebUI prototype
- Shoelace SPA with performer (knob view + preset browser), designer (macro editor), SPI configurator
- `app.css` v8, `shared.js` v10, `performer.js` v9, `designer.js` v9, `app.js`

**Decision needed:**
- [x] **Option 1 — Take B's `www/` Shoelace app, keep our `www-prototype/`**  
  Discard the old jQuery multi-page UI from A, restore B's modern `www/` as baseline, keep `www-prototype/` alongside for the new persona prototype work
- [ ] **Option 2 — Keep A's `www/` as-is (old multi-page)**  
  Not recommended — it's older than B's implementation
- [ ] **Regardless:** `sdcard_image/www-prototype/` must be preserved — this is our active development

---

## 4. WebUI Developer Tool — `www/preseteditor/` (TypeScript)

**Status:** Only in our branch A. Not in B.

**Content:**  
TypeScript + Vite preset editor tool with 9 source files: `main.ts`, `macropreset.ts`, `soundpreset.ts`, `outputmappinglist.ts`, `parameterlist.ts`, `preview.ts`, `basicprops.ts`, `device.ts`, `state.ts`

**Decision:**
- [x] **KEEP** — This is our work, not in target. No conflict.

---

## 5. SD Card Data — `sdcard_image/data/` ⚠️ IMPORTANT

**Status:** All macro/preset/synth data exists **only in branch A**. Branch B has none of this.

**Files unique to A:**
- `sdcard_image/data/synthdefinitions.json` — 23 machine definitions with Mix params
- `sdcard_image/data/macrodefinitions/*.json` — 33 macro definition files (all machines + custom presets)
- `sdcard_image/data/macrosoundpresets/*.json` — 58 sound presets

**Modified in both (`.jsn` plugin parameter files):**
- `sdcard_image/data/sp/mp-PicoSeqRack.jsn` — Large (3,199 lines added from possan merge)
- `sdcard_image/data/sp/mui-PicoSeqRack.jsn` — Large (4,566 lines added)
- All other `mp-*.jsn` files — Minor changes, likely compatible

**Decision:**
- [x] **KEEP all our data files** — macrodefinitions, macrosoundpresets, synthdefinitions.json — do not lose these
- [x] Review `.jsn` sp files for conflicts carefully during merge

---

## 6. Firmware — `main/` ⚠️ MAJOR ADDITIONS

### New files (only in A, not in B) — KEEP ALL:

| File | Lines | Purpose |
|------|-------|---------|
| `MacroAPI.cpp/.hpp` | 159 | REST API handler for macro operations |
| `MacroDeviceDefinition.cpp/.hpp` | 470 | Device-level macro definition model |
| `MacroDeviceDefinitionDataModel.cpp/.hpp` | 204 | JSON serialization for macro defs |
| `MacroSoundPreset.cpp/.hpp` | 124 | Sound preset data model |
| `MacroSoundPresetDataModel.cpp/.hpp` | 359 | JSON serialization for sound presets |
| `MacroSoundPresetGroup.cpp/.hpp` | 34 | Preset group structure |
| `MacroTranslator.cpp/.hpp` | 519 | MIDI CC → DSP parameter translation |
| `SynthDefinition.cpp/.hpp` | 155 | Machine parameter definitions |
| `SynthDefinitionDataModel.cpp/.hpp` | 266 | JSON serialization for synth defs |
| `TrackDefinition.cpp/.hpp` | 83 | Track-level machine assignment |
| `SpiProtocol.h` | 111 | SPI communication protocol header |
| `SpiProtocolHelper.cpp/.hpp` | 85 | SPI protocol helpers |

### Modified files (both branches changed) — REVIEW:

| File | A changes | Notes |
|------|-----------|-------|
| `RestServer.cpp` | +118 lines mixed | Added `/api/v1/macroapi` route, structural changes. **Need to merge MacroAPI route into B's version** |
| `RestServer.hpp` | +16 lines | Added MacroAPI include/declaration |
| `SPManager.cpp` | +476 lines | Massive additions: PicoSeqRack integration, macro system hookup. **B has no macro code** |
| `SPManager.hpp` | +34 lines | New macro/track fields |
| `SPManagerDataModel.cpp` | +2 lines | Minor additions |
| `SampleAPI.cpp` | +230 lines | Added `manage` action for file delete/rename |
| `SpiAPI.cpp` | +171 lines | SPI protocol changes |
| `SpiAPI.hpp` | +21 lines | SPI interface additions |
| `Control.cpp/.hpp` | Minor | Likely MIDI/SPI hookup changes |
| `CMakeLists.txt` | Minor | Source file additions |
| `component.mk` | +17 lines | Build system entries for new files |

**Decision:**
- [x] **All new files** → KEEP, no conflict  
- [x] `RestServer.cpp` → Manually merge: B's version as base, graft in our MacroAPI route registration  
- [ ] `SPManager.cpp` → Ours is the correct version (B's is the old baseline with no macro system)  
- [ ] `SampleAPI.cpp` → Ours (we added delete/rename, B doesn't have it)  
- [ ] `SpiAPI.cpp/.hpp` → Ours (SPI protocol additions)  
- [ ] `Control.cpp/.hpp` → Careful diff, take union of changes
Comment for the files with no checkbox. Check in detail what the differences are between B and A. For example the Sample Manager was working like it should in B - so we at least need to have all features that have been in B. If there are additions in A > we might need to check. The SpiAPI is probably the right one in A. Please check Control in detail but probably the Version in A is the correct one! 

---

## 7. DSP Components — `components/ctagSoundProcessor/` ⚠️ MAJOR ADDITIONS

### New files (only in A) — KEEP ALL:

The entire `rack/` subdirectory is new in A:  
`RackABD`, `RackASD`, `RackChannelMixer`, `RackClap`, `RackDBD`, `RackDSD`, `RackFMB`, `RackFxDelay`, `RackFxMaster`, `RackFxReverb`, `RackHH1`, `RackHH2`, `RackInput`, `RackMO`, `RackPolyPad`, `RackRimshot`, `RackRompler`, `RackSynth`, `RackTBD03`, `RackWTOsc` (+hpp files)

Also new: `ctagSoundProcessorPicoSeqRack.cpp/.hpp` (1,508 lines — the main PicoSeqRack sound processor)

### Modified files (both branches changed) — REVIEW:

| File | Notes |
|------|-------|
| `CMakeLists.txt` | Added PicoSeqRack and rack/ sources — **take ours** |
| `ctagSPDataModel.cpp` | +16 lines — likely component registration. **Diff carefully** |
| `ctagSoundProcessor.hpp` | +53 lines — base class interface. **Diff carefully** |
| `ctagSampleRom.cpp/.hpp` | +50 lines — sample ROM extensions. **Diff carefully, take union** |
| `ctagSampleRomModel.cpp/.hpp` | −21 lines — may have been refactored in B. **Diff carefully** |

**Decision:**
- [x] All `rack/` files and PicoSeqRack → KEEP (not in B)  
- [ ] Modified files → diff and take the union; prioritize our additions
Comment > usually for all DSP related stuff Branch A should be leading!

---

## 8. Simulator — `simulator/`

**Status:** Both branches modified the simulator. Our changes are **smaller** (we stripped it down: `www/ui.html` went from 568 lines in B to 287+287 in ours — net ~280 line reduction).

**Modified files:**

| File | Notes |
|------|-------|
| `WebServer.cpp` | We removed ~268 lines. B has richer simulator server. |
| `www/ui.html` | Heavily diverged — B has fuller WebUI, ours is stripped |
| `CMakeLists.txt` | Minor |
| `SimSPManager.cpp/.hpp` | Minor removals |
| `fake-idf/malloc.c/.h` | B added malloc.c (24 lines), we modified malloc.h |
| `data/cfg_tbd_sim.jsn` | Minor |

**Decision:**
- [x] **Take B's simulator as base** — it has the more complete WebServer/ui.html  
- [x] Ensure our `fake-idf/malloc.c` addition from B is included  
- [ ] Review if any of our simulator removals were intentional  

---

## 9. Build System & Root Files

| File | Notes | Decision |
|------|-------|----------|
| `CMakeLists.txt` | Both modified — our version adds PicoSeqRack. **Take ours.** | KEEP OURS |
| `.gitignore` | Both modified — minor differences | **Merge** (take union of entries) |
| `partitions_example.csv` | Both modified — partition sizes | **Diff and decide** |
| `sdkconfig.defaults` | Both modified | **Diff carefully** |
| `create_sd_archive.sh` | Both modified | **Diff and merge** |
| `LICENSE` | Both modified | **Keep B's** |
| `README.md` | Restore README.md from B, don't need the readme.md from A. 

---

## 10. Prototyping Notes (`prototyping/`)

**Branch B has:** 12 archived markdown files (planning docs, specs, implementation notes)  
**Our branch:** Deleted all of them, added `MACRO-AND-PRESET-CONCEPT.md`, `MACRO-PRESET-ALIGNMENT.md`, `MEMORY-ANALYSIS.md`, `SMART-HELPER-PROPOSAL.md`, `TODO.txt` at root level

**Decision:**
- [x] **Restore B's `prototyping/archived/` folder** — historical planning docs are useful  
- [x] Keep our root-level planning docs as-is  
- [x] Restore B's `prototyping/DEPLOYMENT-RULES.md` and `WEBUI-STATUS-AND-ROADMAP.md`

---

## 11. GitHub Workflows (`.github/workflows/`)

**Branch B has (deleted in A):**
- `build-docs.yml` — Automated documentation build  
- `deploy-docs.yml` — Automated documentation deployment

**Decision:**
- [ ] **Restore from B** — useful CI automation
Comment we don't need these for now as we don't deploy docs from this branch. 

---

## Summary Table

| Area | Action | Priority |
|------|--------|----------|
| `docs/` | **Restore from B** | Low |
| `tests/` | **Keep both** | Medium |
| `sdcard_image/www/` | **Take B's Shoelace SPA, discard A's jQuery app** | High |
| `sdcard_image/www-prototype/` | **KEEP OURS** (do not overwrite) | Critical |
| `sdcard_image/data/macrodefinitions/` | **KEEP OURS** | Critical |
| `sdcard_image/data/macrosoundpresets/` | **KEEP OURS** | Critical |
| `sdcard_image/data/synthdefinitions.json` | **KEEP OURS** | Critical |
| `sdcard_image/data/sp/*.jsn` | Diff and merge | High |
| `main/Macro*.cpp/.hpp` | **KEEP OURS** (not in B) | Critical |
| `main/Synth*.cpp/.hpp` | **KEEP OURS** (not in B) | Critical |
| `main/Track*.cpp/.hpp` | **KEEP OURS** (not in B) | Critical |
| `main/RestServer.cpp` | **Merge** (add MacroAPI route to B base) | High |
| `main/SPManager.cpp` | **KEEP OURS** | Critical |
| `main/SampleAPI.cpp` | **KEEP OURS** | Critical |
| `main/SpiAPI.cpp/.hpp` | **KEEP OURS** | High |
| `components/.../rack/*.cpp` | **KEEP OURS** (not in B) | Critical |
| `components/ctagSoundProcessorPicoSeqRack.*` | **KEEP OURS** (not in B) | Critical |
| `components/*` modified | Diff, take union | High |
| `simulator/` | **Take B as base**, review our removals | Medium |
| `prototyping/` | **Restore B's archived docs** | Low |
| `www/preseteditor/` | **KEEP OURS** | High |
| `.github/workflows/` | **Restore from B** | Low |
| Build files (CMakeLists, partitions, sdkconfig) | **Diff individually** | High |

---

## Suggested Merge Approach

1. **Start from B** (`feature/webui-general-ui-rework`) as the base
2. **Cherry-pick or patch in our critical additions:**
   - All new `main/Macro*`, `main/Synth*`, `main/Track*`, `main/Spi*` files  
   - All `components/ctagSoundProcessor/rack/*` files  
   - `ctagSoundProcessorPicoSeqRack.cpp/.hpp`
   - `sdcard_image/www-prototype/` (entire folder)
   - `sdcard_image/data/macrodefinitions/`, `macrosoundpresets/`, `synthdefinitions.json`
   - `www/preseteditor/` (TypeScript tool)
   - Root docs: `MACRO-AND-PRESET-CONCEPT.md`, `SMART-HELPER-PROPOSAL.md`, etc.
   - `tests/test_dsp_json_alignment.py`
3. **Manually reconcile** modified firmware files: RestServer.cpp, SPManager.cpp, components/ headers
4. **Restore from B:** `docs/`, `prototyping/`, `.github/workflows/`, `README.md`, simulator
5. **Build system:** Merge CMakeLists files, partitions_example.csv, sdkconfig.defaults

---

*Generated: 2026-03-04 | Branch comparison: `feature/webui-persona-prototype` → `feature/webui-general-ui-rework`*

---

## Execution Log

### Merge Execution — 2026-03-04

**Branch:** `feature/webui-merge-planning` (created from `feature/webui-persona-prototype`)  
**Commit:** `af1fa8d2` — *"Integrate webui-general-ui-rework content per MERGE-PLANNING.md"*  
**238 files changed in the merge commit.**

All decisions in sections 1–11 above were executed. Key actions taken:

#### Restored from Branch B (`feature/webui-general-ui-rework`):
- `docs/` — all 159 documentation files (RST/Sphinx site) restored
- `tests/apitest/` and `tests/webui/` — shell-based API test suite + WebUI test runner
- `sdcard_image/www/` — completely replaced with B's modern Shoelace SPA (discarded A's old jQuery/OnsenUI multi-page app). Content: `index.html`, `js/shoelace-bundle.js`, `js/app-bundle.js`, `js/app.js`, `js/plugin-manager.js`, `js/sample-manager.js`, `js/shared.js`, `js/display-hints.js`, `img/`, `shoelace/themes/`
- `prototyping/archived/` + `prototyping/DEPLOYMENT-RULES.md` + `prototyping/WEBUI-STATUS-AND-ROADMAP.md`
- `simulator/` — B's richer `WebServer.cpp` and fuller `www/ui.html` (568 lines vs our stripped 287-line version)
- `README.md` — B's version (note: macOS case-insensitive FS bug caused `rm readme.md` to delete `README.md`; fixed by re-checking out from B)
- `.gitignore`, `partitions_example.csv` (B's 5 MB `ota_0` partition, up from 4 MB), `create_sd_archive.sh`, `LICENSE`

#### Manually merged:
- `main/RestServer.cpp` — B's version as base (preserves `set_api_headers()` with keep-alive comment preventing ESP32 socket exhaustion) + grafted in from A: `#include "MacroAPI.hpp"`, `set_cors_headers()` static method, `cors_options_handler`, `/api/v1/macroapi` GET/POST routes, CORS OPTIONS preflight route for `/*`
- `main/RestServer.hpp` — B's base + added `static void set_cors_headers(httpd_req_t *req);` declaration
- `.gitignore` — B's base + added `www/preseteditor/dist` entry

#### Preserved from Branch A (our work, not touched):
- `sdcard_image/www-prototype/` — full Persona/Performer/Designer WebUI prototype
- `sdcard_image/data/macrodefinitions/` — 33 macro definition files
- `sdcard_image/data/macrosoundpresets/` — 58 sound presets
- `sdcard_image/data/synthdefinitions.json` — 23 machine definitions with Mix params
- All `main/Macro*.cpp/.hpp`, `main/Synth*.cpp/.hpp`, `main/Track*.cpp/.hpp`, `main/SpiProtocol*`
- `components/ctagSoundProcessor/rack/` — all 20 Rack DSP units
- `components/ctagSoundProcessor/ctagSoundProcessorPicoSeqRack.cpp/.hpp`
- `www/preseteditor/` — TypeScript Vite preset editor tool
- `tests/test_dsp_json_alignment.py`
- All modified firmware files where A is leading: `SPManager.cpp`, `SampleAPI.cpp`, `SpiAPI.cpp/.hpp`, `Control.cpp/.hpp`, `components/ctagSoundProcessor/ctagSPDataModel.cpp`, `ctagSoundProcessor.hpp`, `ctagSampleRomModel.cpp/.hpp`
- `CMakeLists.txt` (root) — our version which adds PicoSeqRack sources

#### Key technical findings during diff analysis:
- `Control.cpp/.hpp`: A changed `Update()` signature from `void Update(void **data, uint32_t ledStatus)` to `int Update(void *sendbuffer, void **receivebuffer)` — bidirectional SPI protocol; A is correct
- `ctagSoundProcessor.hpp`: A adds virtual MIDI methods (`handleMidiNoteOn`, `handleMidiNoteOff`, `handleMidiControlChange`, etc.) and `ProcessData` struct fields (`midi_bytes[400]`, `sequencer_tempo`, `sequencer_quantum`) required by PicoSeqRack — A is leading
- `SampleAPI.cpp`: A is strictly additive (adds `scan_json_files`, `getconfig`, `configfiles` listing) on top of B's baseline — A is correct
- `ota_1` partition overflow warning: expected and documented in `docs/plugins/building.rst` (ota_1 at 1 MB is too small for OTA updates, ota_0 at 5 MB is fine for initial flash)

#### Post-merge verification:
- `tests/test_dsp_json_alignment.py` — **119/128 passing** (same pass rate as before merge; 9 pre-existing failures in db/ab/td3/wtosc label mismatches unrelated to merge)
- GitHub Workflows (`.github/workflows/`) — **not restored** per user decision ("we don't need these for now")

---

### Post-Merge Tasks — 2026-03-04

**Commit:** `56b62bf1` — *"Move root planning/doc markdown files into prototyping/"*

#### 1. Root markdown files moved to `prototyping/`
All planning/documentation markdown files that had accumulated in the repo root were moved here using `git mv` (preserving history):
- `MACRO-AND-PRESET-CONCEPT.md`
- `MACRO-PRESET-ALIGNMENT.md`
- `MEMORY-ANALYSIS.md`
- `MERGE-PLANNING.md` ← this file
- `SMART-HELPER-PROPOSAL.md`
- `versions.md`

`README.md` was left at the repo root as intended.

#### 2. Firmware build verified ✅
Built from the merged branch using ESP-IDF v5.5.1:
```bash
source ~/esp/esp-idf/export.sh
idf.py build
```
- **Result:** `build/ctag-tbd.bin` generated successfully (1544/1544 build steps)
- **Warnings:** Only pre-existing warnings (unused vars, MIN/MAX redefinition, `volatile++` deprecation in `SPManager.cpp`) — no new issues introduced by the merge
- **Partition warning:** `ota_1` overflow (`0x248560` overflow) — expected, documented

#### 3. SD card archive script verified ✅
```bash
bash create_sd_archive.sh /path/to/repo /path/to/repo/build /opt/homebrew/bin/xxh128sum
```
- **Result:** `build/tbd-sd-card.zip` (25 MB) generated successfully
- **Hash:** `84f6eeb5803f5a536966749916cdf291` (written to `build/tbd-sd-card-hash.txt`)
- **Contents:** gzipped www/ (Shoelace SPA), data/, dbup/ (backup of data/), tbdsamples/
- Note: script requires absolute paths (it uses `cd` internally, breaking relative paths)

**Final state of `feature/webui-merge-planning`:** clean working tree, all pushed to `origin/feature/webui-merge-planning`.
