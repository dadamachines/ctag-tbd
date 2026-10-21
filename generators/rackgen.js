#!/usr/bin/env node
/***************
TBD-16 — GrooveBoxRack machine scaffolder.

Reads a small descriptor JSON (see rack-template.json) and emits:
  - components/ctagSoundProcessor/rack/<className>.{hpp,cpp}  — class boilerplate
    (atomic param members, registerParamAndCC() calls in Init(), Process() skeleton)
  - patches for sdcard_image/factory/synthdefinitions.json
                 sdcard_image/factory/plugins/mui-GrooveBoxRack.json
                 sdcard_image/factory/plugins/mp-GrooveBoxRack.json
  - in -i mode, ALSO auto-inserts 4 wiring snippets directly into
    components/ctagSoundProcessor/ctagSoundProcessorGrooveBoxRack.{hpp,cpp}:
      * one member line  (hpp)
      * one Init() call  (cpp, in the track's Init block)
      * one Process() block (cpp, in the track's Process block)
      * one buildVoiceRegistry() call (cpp, at the "rackgen:registry-track-N" marker)
    After -i succeeds, only the DSP body inside RackXxx::Process() is left to write.

Usage:
  node rackgen.js <descriptor.json>          # dry run: write .hpp/.cpp to cwd, PRINT patches
  node rackgen.js <descriptor.json> -i       # in-place: write everything into the source tree
                                             # (a *.bak is left next to each file we touch)

Mirrors generator.js (for legacy ctag-tbd plugins). Node.js, no external deps.

SPDX-License-Identifier: GPL-3.0-only
***************/

'use strict';
const fs = require('fs');
const path = require('path');

// ------ args + descriptor -----------------------------------------------------------------
const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2 || (args[1] && args[1] !== '-i')) {
    console.error('usage:  node rackgen.js <descriptor.json> [-i]'); process.exit(2);
}
const descPath = args[0];
const inPlace  = args[1] === '-i';

let desc;
try { desc = JSON.parse(fs.readFileSync(descPath, 'utf8')); }
catch (e) { console.error(`could not parse ${descPath}: ${e.message}`); process.exit(2); }

// ------ paths ----------------------------------------------------------------------------
// the descriptor / generators live in <repo>/generators ; resolve repo root from this script
const repoRoot     = path.resolve(__dirname, '..');
const synthdefPath = path.join(repoRoot, 'sdcard_image/factory/synthdefinitions.json');
const muiPath      = path.join(repoRoot, 'sdcard_image/factory/plugins/mui-GrooveBoxRack.json');
const mpPath       = path.join(repoRoot, 'sdcard_image/factory/plugins/mp-GrooveBoxRack.json');
const rackDir      = path.join(repoRoot, 'components/ctagSoundProcessor/rack');
const tmplDrumHpp  = path.join(__dirname, 'RackTemplateDrum.hpp');
const tmplDrumCpp  = path.join(__dirname, 'RackTemplateDrum.cpp');
const tmplSyHpp    = path.join(__dirname, 'RackTemplateSynth.hpp');
const tmplSyCpp    = path.join(__dirname, 'RackTemplateSynth.cpp');

// ------ validate descriptor --------------------------------------------------------------
const need = ['id','className','name','type','track','params'];
for (const k of need) if (!(k in desc)) die(`descriptor missing required field "${k}"`);
if (!/^[a-z][a-z0-9]{0,11}$/.test(desc.id))        die(`id "${desc.id}" must be 1..12 chars, lowercase / digits, starting with a letter`);
if (!/^[A-Z][A-Za-z0-9]*$/.test(desc.className))   die(`className "${desc.className}" must be PascalCase`);
if (!['drum','synth'].includes(desc.type))         die(`type must be "drum" or "synth" (got "${desc.type}")`);
if (!Number.isInteger(desc.track) || desc.track < 0 || desc.track > 15) die(`track must be an integer 0..15`);
if (!Array.isArray(desc.params) || desc.params.length === 0)            die(`params must be a non-empty array`);

const RESERVED = new Set(['out','enabled','midi_trig','trig_prev','gate','cur_note','cur_vel','this']);
const seenP = new Set(), seenCC = new Set();
for (const p of desc.params) {
    for (const k of ['id','name','ctrl','def']) if (!(k in p)) die(`param missing "${k}": ${JSON.stringify(p)}`);
    if (!/^[a-z_][a-z0-9_]*$/.test(p.id)) die(`param id "${p.id}" must be a snake_case C++ identifier`);
    if (RESERVED.has(p.id))               die(`param id "${p.id}" clashes with a reserved member name`);
    if (seenP.has(p.id))                  die(`duplicate param id "${p.id}"`);
    seenP.add(p.id);
    if (!Number.isInteger(p.ctrl) || p.ctrl < 1 || p.ctrl > 127) die(`param "${p.id}" ctrl must be 1..127`);
    if (p.ctrl < 8) console.warn(`! warning: param "${p.id}" ctrl=${p.ctrl} is in the channel mixer's range (1..7) — will likely collide`);
    if (seenCC.has(p.ctrl))               die(`duplicate ctrl ${p.ctrl} on params "${p.id}" / "${[...seenCC].find(c=>c===p.ctrl)}"`);
    seenCC.add(p.ctrl);
    if (!Number.isInteger(p.def) || p.def < 0 || p.def > 127) die(`param "${p.id}" def must be 0..127 (MIDI-CC default)`);
}

// ------ cross-check against synthdefinitions.json ----------------------------------------
let synth;
try { synth = JSON.parse(fs.readFileSync(synthdefPath, 'utf8')); }
catch (e) { die(`could not read ${synthdefPath}: ${e.message}`); }

const track = (synth.tracks || []).find(t => t.index === desc.track);
if (!track) die(`track index ${desc.track} not found in synthdefinitions.json`);
if (track.type !== desc.type)
    die(`track ${desc.track} ("${track.name}") is type "${track.type}" — descriptor type "${desc.type}" doesn't match`);
if ((track.machines || []).includes(desc.id))
    die(`track ${desc.track} already has a machine with id "${desc.id}"`);
if ((synth.machines || []).some(m => m.id === desc.id))
    die(`a machine with id "${desc.id}" already exists in synthdefinitions.json (machines[])`);

const chN     = desc.track + 1;            // WebUI CHnn (1-based)
const prefix  = `ch${chN}_${desc.id}_`;    // C++ / param-id prefix

// ------ render the C++ from the template -------------------------------------------------
const tHpp = fs.readFileSync(desc.type === 'drum' ? tmplDrumHpp : tmplSyHpp, 'utf8');
const tCpp = fs.readFileSync(desc.type === 'drum' ? tmplDrumCpp : tmplSyCpp, 'utf8');
const tName = desc.type === 'drum' ? 'RackTemplateDrum' : 'RackTemplateSynth';

const hppMembers = '\t\tatomic<int16_t> ' + desc.params.map(p => p.id).join(', ') + ';';
const cppRegs = desc.params.map(p =>
    `\tinitdata->rack->registerParamAndCC(initdata, "${p.id}", ${p.ctrl}, [&](const int val){ this->${p.id} = val; });`
).join('\n');

const hppOut = replaceSection(
    tHpp.replace(new RegExp(tName, 'g'), desc.className),
    'rackgen:hppMembers', '\n' + hppMembers + '\n\t');
const cppOut = replaceSection(
    tCpp.replace(new RegExp(tName, 'g'), desc.className),
    'rackgen:cppRegs', '\n' + cppRegs + '\n');

// ------ build the JSON patches -----------------------------------------------------------
const synthdefMachineEntry = {
    id: desc.id, name: desc.name, type: desc.type,
    parameters: desc.params.map(p => ({ id: p.id, name: p.name, type: 'cc', ctrl: p.ctrl, def: p.def }))
};
const insertBefore = desc.type === 'drum' ? 'extdrum' : 'extsynth';
const machinesPatched = [...track.machines];
const at = machinesPatched.indexOf(insertBefore);
if (at >= 0) machinesPatched.splice(at, 0, desc.id);
else         machinesPatched.push(desc.id);

const muiGroup = {
    id: `ch${chN}_${desc.id}`,
    name: `Channel ${chN} - ${desc.name}`,
    type: 'group',
    params: desc.params.map(p => ({ id: prefix + p.id, name: p.name, type: 'int', min: 0, max: 4095 }))
};
const mpDefaults = desc.params.map(p => ({
    id: prefix + p.id,
    current: Math.round(p.def * 4096 / 128),       // CC default 0..127 → preset value 0..4096
    cv: -1
}));

// ------ build the GrooveBoxRack wiring snippets ------------------------------------------
// Four small snippets get inserted into ctagSoundProcessorGrooveBoxRack.{hpp,cpp}:
//   1. .hpp class body: one member line ("RackMyVoice chN_myv;")
//   2. .cpp Init():     one prefix-and-Init line
//   3. .cpp Process():  the voice's Process() call + mixRenderOutputMono() guard
//   4. .cpp buildVoiceRegistry(): one addDrumTrig/addSynth/addNoMidi call
// The registry block goes inside the "rackgen:registry-track-N" marker; the other
// three use simple text anchors (the source has a very regular per-track structure).
const ch0  = track.midichannel;            // 0-based MIDI channel
const midi = ch0 + 1;                       // 1-based for developer-facing prints

// 1. .hpp member line
const hppMemberLine = `\t\t\t${desc.className} ch${chN}_${desc.id};`;

// 2. Init() prefix-and-Init line (one line per voice, indented to match)
const initLine = `    dri.prefix = "${prefix}"; ch${chN}_${desc.id}.Init(&dri);`;

// 3. Process() block — call the voice and mix its output if enabled
const processBlock = (
    `\n        ch${chN}_${desc.id}.Process(idata);\n` +
    `        if (ch${chN}_${desc.id}.enabled) {\n` +
    `            mixRenderOutputMono(ch${chN}_${desc.id}.out, ch${chN}.level, ch${chN}.pan, ch${chN}.send1, ch${chN}.send2);\n` +
    `        }\n`
);

// 4. buildVoiceRegistry() block — one self-contained add* call
//    drum-channel voice: addDrumTrig(track, "id", &chN_x.enabled, channel, note, [this](){ chN_x.trigger(); });
//    synth-channel voice: addSynth(track, "id", &chN_x.enabled, channel, on_lambda, off_lambda);
let registryBlock;
if (desc.type === 'drum') {
    registryBlock =
        `    addDrumTrig(${desc.track}, "${desc.id}", &ch${chN}_${desc.id}.enabled, ${ch0}, ${track.drumnote}, [this]() { ch${chN}_${desc.id}.trigger(); });\n`;
} else {
    registryBlock =
        `    addSynth(${desc.track}, "${desc.id}", &ch${chN}_${desc.id}.enabled, ${ch0},\n` +
        `        [this](uint8_t n, uint8_t v) { if (v > 0) ch${chN}_${desc.id}.noteOn(n, v); else ch${chN}_${desc.id}.noteOff(n, 0); },\n` +
        `        [this](uint8_t n, uint8_t /*v*/) { ch${chN}_${desc.id}.noteOff(n, 0); });\n`;
}

// ------ apply (in-place) OR print (dry-run) ----------------------------------------------
const outDir = inPlace ? rackDir : process.cwd();
fs.writeFileSync(path.join(outDir, desc.className + '.hpp'), hppOut);
fs.writeFileSync(path.join(outDir, desc.className + '.cpp'), cppOut);

const rackHppPath = path.join(repoRoot, 'components/ctagSoundProcessor/ctagSoundProcessorGrooveBoxRack.hpp');
const rackCppPath = path.join(repoRoot, 'components/ctagSoundProcessor/ctagSoundProcessorGrooveBoxRack.cpp');

let muiPatched = false, mpPatched = false, synthPatched = false;
let hppWired = false, initWired = false, processWired = false, registryWired = false;

if (inPlace) {
    // synthdefinitions.json
    backup(synthdefPath);
    synth.tracks.find(t => t.index === desc.track).machines = machinesPatched;
    synth.machines = synth.machines || [];
    synth.machines.push(synthdefMachineEntry);
    fs.writeFileSync(synthdefPath, JSON.stringify(synth, null, 2) + '\n');
    synthPatched = true;

    // mui-GrooveBoxRack.json — append the group to params[trackIndex]
    const mui = JSON.parse(fs.readFileSync(muiPath, 'utf8'));
    backup(muiPath);
    if (Array.isArray(mui.params) && mui.params[desc.track] && Array.isArray(mui.params[desc.track].params)) {
        // mui's params[N] is each channel's group; the machines hang off its `params` array as sub-groups.
        mui.params[desc.track].params.push(muiGroup);
        fs.writeFileSync(muiPath, JSON.stringify(mui, null, 2) + '\n');
        muiPatched = true;
    } else {
        console.warn(`! mui-GrooveBoxRack.json: couldn't find params[${desc.track}] — paste the group manually (see below)`);
    }

    // mp-GrooveBoxRack.json — append default values into patches[0].params
    const mp = JSON.parse(fs.readFileSync(mpPath, 'utf8'));
    backup(mpPath);
    if (mp.patches && mp.patches[0] && Array.isArray(mp.patches[0].params)) {
        mp.patches[0].params.push(...mpDefaults);
        fs.writeFileSync(mpPath, JSON.stringify(mp, null, 2) + '\n');
        mpPatched = true;
    } else {
        console.warn(`! mp-GrooveBoxRack.json: unexpected shape — paste defaults manually (see below)`);
    }

    // -------- Auto-wire into ctagSoundProcessorGrooveBoxRack.{hpp,cpp} ------------------
    // The four insertions use stable anchors that have been the source's structure since
    // the GrooveBoxRack was written: the per-track "chN_render_time" lines bookend
    // each track's Init() block, "chN_smp.track_length = chN.track_length;" sits at the
    // start of the rompler block in Process() (we insert just before it so new voices go
    // between the existing drum/synth voices and the rompler), and the .hpp's
    // "uint32_t chN_render_time;" lines bookend each track's member block in the class.
    // The registry uses paired markers ("rackgen:registry-track-N") in buildVoiceRegistry().
    let rackHpp = fs.readFileSync(rackHppPath, 'utf8');
    let rackCpp = fs.readFileSync(rackCppPath, 'utf8');
    backup(rackHppPath);
    backup(rackCppPath);

    // 1a. .hpp include: insert the new "rack/<ClassName>.hpp" include line after the
    //     last existing "#include "rack/Rack*.hpp"" line so the member declaration below
    //     sees the type.  We use the trailing "#include "rack/RackChannelMixer.hpp""
    //     (always present and conventionally last in the rack-includes block) as the anchor.
    const includeAnchor = '#include "rack/RackChannelMixer.hpp"';
    const includeLine   = `#include "rack/${desc.className}.hpp"`;
    if (rackHpp.includes(includeAnchor) && !rackHpp.includes(includeLine)) {
        rackHpp = rackHpp.replace(includeAnchor, includeAnchor + '\n' + includeLine);
    }

    // 1b. .hpp member: insert before "uint32_t chN_render_time;" (one anchor per track)
    const hppAnchor = `uint32_t ch${chN}_render_time;`;
    if (rackHpp.includes(hppAnchor)) {
        rackHpp = rackHpp.replace(hppAnchor, hppMemberLine + '\n\t\t\t' + hppAnchor);
        hppWired = true;
    }

    // 2. .cpp Init(): insert before "chN_render_time = 0;" (in the track-N block)
    const initAnchor = `    ch${chN}_render_time = 0;`;
    // there's only ONE occurrence per track, so a single-replace is safe
    if (rackCpp.includes(initAnchor)) {
        rackCpp = rackCpp.replace(initAnchor, initLine + '\n' + initAnchor);
        initWired = true;
    }

    // 3. .cpp Process(): insert before "chN_smp.track_length = chN.track_length;"
    //    (Process() puts the rompler last; new voices go right before it.)
    //    For tracks with no rompler in Process() (none today; ch16 is special), warn.
    const processAnchor = `        ch${chN}_smp.track_length = ch${chN}.track_length;`;
    if (rackCpp.includes(processAnchor)) {
        rackCpp = rackCpp.replace(processAnchor, processBlock + processAnchor);
        processWired = true;
    } else if (desc.track !== 15) {
        // track 15 (ch16) has no rompler — fall back to inserting before the closing brace
        // of the ch16 block.  Out of scope for v1; warn so the user adds it manually.
        console.warn(`! Process() anchor "${processAnchor.trim()}" not found — paste manually (see below)`);
    }

    // 4. buildVoiceRegistry(): paired-marker insertion at "rackgen:registry-track-N"
    const regMarker = `    // rackgen:registry-track-${desc.track} — auto-inserted voices for track ${desc.track} go above this line`;
    if (rackCpp.includes(regMarker)) {
        rackCpp = rackCpp.replace(regMarker, registryBlock + regMarker);
        registryWired = true;
    } else {
        console.warn(`! buildVoiceRegistry() marker for track ${desc.track} not found — paste manually (see below)`);
    }

    fs.writeFileSync(rackHppPath, rackHpp);
    fs.writeFileSync(rackCppPath, rackCpp);
}

// ------ report ---------------------------------------------------------------------------
console.log(`generated ${desc.className}.hpp + .cpp ${inPlace ? `in ${rackDir}` : `in ${process.cwd()}`}`);
if (inPlace) {
    const tick = (b) => (b ? '✓' : '✗');
    console.log(`patched: ${tick(synthPatched)} synthdefinitions.json   ${tick(muiPatched)} mui-GrooveBoxRack.json   ${tick(mpPatched)} mp-GrooveBoxRack.json`);
    console.log(`wired:   ${tick(hppWired)} GrooveBoxRack.hpp member  ${tick(initWired)} Init()  ${tick(processWired)} Process()  ${tick(registryWired)} buildVoiceRegistry()`);
    console.log(`(.bak files kept for every file we touched — diff if anything looks off.)`);
} else {
    console.log('\n--- patches to apply (dry run; pass -i to apply them automatically) ---');
    console.log(`\n# 1. sdcard_image/factory/synthdefinitions.json — append "${desc.id}" to tracks[${desc.track}].machines (before "${insertBefore}"), then append:`);
    console.log(JSON.stringify(synthdefMachineEntry, null, 2));
    console.log(`\n# 2. sdcard_image/factory/plugins/mui-GrooveBoxRack.json — push into params[${desc.track}].params:`);
    console.log(JSON.stringify(muiGroup, null, 2));
    console.log(`\n# 3. sdcard_image/factory/plugins/mp-GrooveBoxRack.json — extend patches[0].params with:`);
    console.log(JSON.stringify(mpDefaults, null, 2));
    console.log(`\n--- ctagSoundProcessorGrooveBoxRack wiring (4 insertions; -i applies them automatically) ---`);
    console.log(`\n# 4. ctagSoundProcessorGrooveBoxRack.hpp — add the member just before "uint32_t ch${chN}_render_time;":`);
    console.log(hppMemberLine);
    console.log(`\n# 5. ctagSoundProcessorGrooveBoxRack.cpp Init() — add just before "ch${chN}_render_time = 0;":`);
    console.log(initLine);
    console.log(`\n# 6. ctagSoundProcessorGrooveBoxRack.cpp Process() — add just before "ch${chN}_smp.track_length = ch${chN}.track_length;":`);
    process.stdout.write(processBlock);
    console.log(`\n# 7. ctagSoundProcessorGrooveBoxRack.cpp buildVoiceRegistry() — add just before "// rackgen:registry-track-${desc.track} ...":`);
    process.stdout.write(registryBlock);
}

console.log(`\n(track ${desc.track} = WebUI CH${String(chN).padStart(2,'0')} "${track.name}", MIDI ch ${midi}` +
            (desc.type === 'drum' ? ` note ${track.drumnote}` : ' pitched') + `)`);
if (inPlace) {
    console.log(`\nNext steps:`);
    console.log(`  1. cd simulator/build && cmake . && make            # the cmake re-config is needed`);
    console.log(`     so the new rack/${desc.className}.cpp is picked up by the GLOB`);
    console.log(`  2. Open ${desc.className}.cpp and fill in the DSP body inside Process().`);
    console.log(`  3. ./tbd-sim -o, browse http://localhost:8080/, load GrooveBoxRack,`);
    console.log(`     pick "${desc.name}" from the CH${String(chN).padStart(2,'0')} machine tab.`);
} else {
    console.log(`\nRe-run with -i to apply all 7 patches automatically.`);
}
console.log('done.');

// ------ helpers --------------------------------------------------------------------------
function die(msg) { console.error('error: ' + msg); process.exit(1); }
function backup(p) { try { fs.copyFileSync(p, p + '.bak'); } catch (e) { /* ok */ } }
function replaceSection(src, marker, body) {
    const m = '// ' + marker;
    const parts = src.split(m);
    if (parts.length !== 3) die(`template is missing the paired "${m}" markers`);
    return parts[0] + m + body + m + parts[2];
}
