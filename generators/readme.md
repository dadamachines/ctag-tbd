# Code generators for new sound processors and GrooveBoxRack machines

This folder has **two** generators (Node.js, no external deps):

- **`generator.js`** — scaffolds a *legacy* (standalone, Eurorack-style) `ctagSoundProcessor`
  plugin from a MUI parameter definition. Documented below.
- **`rackgen.js`** — scaffolds a *GrooveBoxRack machine* (a voice that lives inside the TBD-16's
  `GrooveBoxRack` rack — Per-Olov Jernberg & Johannes Lohbihler's macro/preset/rack layer, built
  on Robert Manzke's `DrumRack` engine). See
  [docs/plugins/rack-plugins.rst](../docs/plugins/rack-plugins.rst) for the design, and the
  section "Scaffold a GrooveBoxRack machine" below for the workflow.


## Scaffold a GrooveBoxRack machine — `rackgen.js`

Pick a **drum** voice (one-shot, triggered by a fixed note on a fixed channel — slots into drum
tracks CH01..CH08) or a **synth** voice (pitched, `noteOn`/`noteOff` — slots into synth tracks
CH09..CH15). Then it's **one command** to get to "fill in the DSP":

1. Copy `rack-template.json` to a new file (e.g. `rack-mybd.json`) and edit. Pick an `id`
   (≤6 chars, lowercase, no spaces), a `className` (PascalCase, conventionally `RackXxx`), a
   display `name`, the `type` (`drum` / `synth`), the target `track` index (0-based: drums 0..7,
   synths 8..14 — must agree with the track's `type` in `synthdefinitions.json`), and the
   param list with MIDI CC numbers and 0..127 defaults. The descriptor is field-by-field
   commented.

2. **Dry-run** to preview every patch — nothing is written to the source tree, the new
   `<className>.{hpp,cpp}` are dropped in `cwd` so you can eyeball them:

   ```
   node rackgen.js rack-mybd.json
   ```

3. **Apply with `-i`.** Writes the class into `components/ctagSoundProcessor/rack/`, patches
   the three JSON files in `sdcard_image/factory/plugins/`, **and** auto-inserts the five wiring lines
   into `ctagSoundProcessorGrooveBoxRack.{hpp,cpp}` (the `#include`, the member field, the
   `Init()` call, the `Process()` block, the `buildVoiceRegistry()` registration). A `.bak`
   is left next to every file we touched:

   ```
   node rackgen.js rack-mybd.json -i
   ```

   The report ends with a per-step ✓/✗ summary. ✗ means an anchor wasn't found in the
   GrooveBoxRack source — the tool prints the raw snippet you can paste manually (almost
   never needed; usually means you've heavily edited the rack source).

4. Re-configure CMake (the new `rack/RackMyBd.cpp` is picked up by a `file(GLOB ...)` that
   doesn't auto-refresh), then build:

   ```
   cd ../simulator/build && cmake . && make
   ```

5. Fill in the DSP in your new `RackMyVoice::Process()` (the templates are stubs with TODO
   comments and a few `MK_FLT_PAR_*` scaling examples). Iteration loop:

   ```
   ./load-test --machine <id>     # ~2 s smoke test — does my voice produce audio?
   ./routing-test                 # ~3 s regression — did I break any existing routing?
   ./tbd-sim -o                   # the audible test, when the headless tests say OK
   ```

   For hands-free dev: `../../tools/dev-watch.sh --machine <id>` re-runs the isolated test
   on every save (needs `fswatch` / `inotifywait`).

6. Before committing, run **`./rack-lint`** — cross-checks `synthdefinitions.json` against
   the rack's runtime voice registry, catches "machine X listed but not wired" and
   "duplicate ctrl numbers on a machine".

The descriptor is validated against `synthdefinitions.json` up front — duplicate ids,
type/track mismatches, CC collisions and reserved member names are caught before any
file is written. Templates live next to the script: `RackTemplateDrum.{hpp,cpp}` /
`RackTemplateSynth.{hpp,cpp}`. They use the same `// rackgen:…` marker convention
`generator.js` uses for its legacy templates.

For the end-to-end walk-through with a worked example, see
[docs/plugins/rack-tutorial.rst](../docs/plugins/rack-tutorial.rst) ("Hello, Rack").

For the full reference (parameter macros, registry helpers, channel-mixer surface), see
[docs/plugins/rack-plugins.rst](../docs/plugins/rack-plugins.rst).

For "what mustn't change without coordinating with the PICO firmware", see
[docs/CONTRACT-PICO.md](../docs/CONTRACT-PICO.md).


## Scaffold a legacy ctagSoundProcessor — `generator.js`

- mui-template.json: JSON template for the web ui definition file of your plugin
    - Copy this template to the sdcard_image/factory/plugins folder and rename it there to a name matching the id naming of your own processor, note that the id and hence the file name must be as short as possible i.e. mui-'xxx' with xxx <=8 letters due to restrictions of the spiffs file system
        - ```cp mui-template.json ../sdcard_image/factory/plugins/mui-myplug.json```
- ctagSoundProcessorTemplate.[c|h]pp
    - These are the template c++ source files which generator.js can take as a basis for creating a new sound processor
- generator.js
    - This is a node.js generator script which will take existing c++ sources and a web UI definition file mui-___.json to generate code
    - The generator in essence creates all the boring stuff for you, that is code that moves the data around due to parameter changes occuring in the web UI to be used as control data in the audio thread as well as persistence in the preset storage data model, you should focus on DSP only ;)
    - Usage of the generator script (requires node.js installed)
        - Creating new files from scratch after editing the ui description file, this generates new c++ files and the preset storage mp-___.json file, note results are in current directory.
        
            ```node generator.js mui-file.json```
        - Modifying existing files, use this option if you want to add / remove parameters to / from an existing processor, WARNING THIS OVERWRITES THE PRESET JSON FILE! Results are in written in the final source directories.
        
            ```node generator.js processor_name -i```
## Example steps for creating a new processor
- Create a new mui-SPName.json file and edit it, adding all parameters you want, e.g. you could copy mui-template.json to mui-myplug.json
- Then run the generator to create the c++ files and the mp-myplug.json preset file
- Move all created files to the system directories i.e.:
    
    ```mv m*myplug.json ../sdcard_image/factory/plugins/```
    
    ```mv *myplug*pp ../components/ctagSoundProcessor/```
## Example steps for modifying an existing processor, e.g. after the step above
- Change the corresponding mui file in ../sdcard_image/factory/plugins/
- Update the preset JSON file and the c++ files using the code generator, note that the preset file will be overwritten!
    - ```node generator.js myplug -i```
    - Files are then changed in place

## IMPORTANT
The TBD sound processor system is reconfigured only if the file sdcard_image/factory/spm_config.json is in initial state. The system the checks all available sound processors. If this file is not in initial state, your new plugin will not appear in the web UI.
This is particularly important, when you use the TBD simulator, as it modifies that file.
Probably this behaviour should be changed in future...
    
