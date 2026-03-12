# TBD Patcher — Visual Patching Plugin Concept

> A Pure Data / Axoloti-style visual patching environment for CTAG TBD,  
> enabling real-time graph-based sound design without compilation.

**Status:** Concept / Feasibility Study  
**Date:** 2026-02-21

---

## Table of Contents

1. [Motivation & Vision](#1-motivation--vision)
2. [Prior Art Comparison](#2-prior-art-comparison)
3. [Architecture Overview](#3-architecture-overview)
4. [Layer 1 — Graph Runtime Engine (C++)](#4-layer-1--graph-runtime-engine-c)
5. [Layer 2 — REST API Extensions](#5-layer-2--rest-api-extensions)
6. [Layer 3 — WebUI Patcher (JavaScript)](#6-layer-3--webui-patcher-javascript)
7. [Node Library — DSP Building Blocks](#7-node-library--dsp-building-blocks)
8. [Memory Architecture](#8-memory-architecture)
9. [ESP32-P4 Resource Budget](#9-esp32-p4-resource-budget)
10. [WebUI Library Evaluation](#10-webui-library-evaluation)
11. [Patch Format Specification](#11-patch-format-specification)
12. [Simulator Support](#12-simulator-support)
13. [Integration with Existing TBD Architecture](#13-integration-with-existing-tbd-architecture)
14. [Development Roadmap](#14-development-roadmap)
15. [Open Questions & Decisions](#15-open-questions--decisions)
16. [Appendix — Full DSP Inventory](#appendix-a--full-dsp-building-block-inventory)

---

## 1. Motivation & Vision

### The Problem

CTAG TBD currently offers 56+ monolithic sound processor plugins. Each is a self-contained C++ class
that must be compiled into the firmware. Users select pre-built plugins and tweak their exposed
parameters — they cannot create new signal flow topologies without writing C++ code and recompiling.

### The Vision

Build a **visual patching plugin** that lets users:

- **Drag & drop** DSP nodes (oscillators, filters, envelopes, effects) onto a canvas
- **Connect** nodes with virtual cables (audio, control, trigger signals)
- **Tweak** parameters in real-time via knobs on each node
- **Save/load** patches as JSON presets
- **Hear changes instantly** — no compilation, no firmware upload, no restart

This brings the creative freedom of Pure Data, Max/MSP, and Axoloti/Ksoloti directly into TBD's
browser-based interface. The patcher runs as a regular `ctagSoundProcessor` plugin — it coexists
with all existing plugins and uses the same infrastructure.

### Key Differentiator from Axoloti/Ksoloti

| Feature | Axoloti / Ksoloti | TBD Patcher (Proposed) |
|---|---|---|
| Editing | Java desktop app | Browser-based WebUI |
| Patching | Offline → compile → upload | **Real-time, no compilation** |
| Runtime | Generated C code on STM32 | Interpreted graph engine on ESP32-P4 |
| Object system | XML objects with inline C/C++ | Pre-compiled node library (like Pd) |
| User-written DSP code | Yes (inline C) | No (fixed node set, extensible in firmware) |
| Hardware access | USB only | WiFi WebUI |

The trade-off: we sacrifice the ability to write arbitrary inline C code (Axoloti's strength) in
exchange for **instant patching without compilation** (Pure Data's strength). Given the ESP32-P4's
performance, this is the right trade-off — the interpreted graph overhead is negligible.

---

## 2. Prior Art Comparison

### Pure Data (Pd)

- **Runtime model:** Interpreter with a fixed set of "tilde objects" (~osc, ~dac, etc.)
- **Signal flow:** Audio computed block-wise (default 64 samples), control messages asynchronous
- **Patch format:** Text-based `.pd` files
- **Key insight:** The object library is pre-compiled; patches wire them together at runtime
- **Relevance:** Our architecture directly mirrors this: pre-compiled C++ nodes, runtime graph wiring

### Axoloti / Ksoloti

- **Runtime model:** XML object definitions containing inline C code → cross-compiled on host PC → binary uploaded via USB
- **Object format:** `.axo` XML with `<inlets>`, `<outlets>`, `<params>`, `<code.krate>`, `<code.srate>`
- **Two processing rates:** `k-rate` (once per block) and `s-rate` (per sample)
- **Object categories:** `audio`, `const`, `conv`, `ctrl`, `delay`, `demux`, `disp`, `dist`, `dyn`, `edrum`, `env`, `filter`, `fx`, `gain`, `gpio`, `harmony`, `kfilter`, `lfo`, `logic`, `math`, `midi`, `mix`, `mux`, `noise`, `osc`, `patch`, `pulse`, `rand`, `reverb`, `script`, `sel`, `seq`, `spat`, `spectral`, `stomps`, `string`, `table`, `timer`, `usb`, `wave`
- **Key insight:** The category structure and I/O typing system are excellent UI/UX references
- **Relevance:** We adopt the category structure and typed-port concept but skip compilation

### Max/MSP

- **Commercial, closed-source, desktop-only**
- **Key insight:** The "hot/cold inlet" concept and right-to-left evaluation order
- **Relevance:** Inspiration for UX patterns; our graph uses topological sort instead

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (WebUI)                                                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  LiteGraph.js Patcher Canvas                             │  │
│  │                                                           │  │
│  │  ┌──────┐   ┌──────┐   ┌───────┐   ┌──────┐             │  │
│  │  │OscSaw├──►│ SVF  ├──►│  VCA  ├──►│Output│             │  │
│  │  └──────┘   └──▲───┘   └──▲────┘   └──────┘             │  │
│  │                │          │                               │  │
│  │  ┌──────┐   ┌──┴───┐   ┌─┴────┐                         │  │
│  │  │ LFO  ├──►│Scale │   │ ADSR │                         │  │
│  │  └──────┘   └──────┘   └──────┘                         │  │
│  └───────────┬──────────────────────────┬────────────────────┘  │
│              │ REST API                 │                        │
│              ▼                          ▼                        │
│     POST /patcher/patch          POST /patcher/param            │
└──────────────┬──────────────────────────┬───────────────────────┘
               │ WiFi / HTTP              │
┌──────────────▼──────────────────────────▼───────────────────────┐
│  ESP32-P4 Firmware                                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  RestServer.cpp — new /patcher/* endpoints                │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │                                      │
│  ┌────────────────────────▼───────────────────────────────────┐  │
│  │  ctagSoundProcessorPatcher  (runs on Core 1, audio ISR)   │  │
│  │                                                            │  │
│  │  ┌──────────────────────────────────────────────────┐     │  │
│  │  │  PatchGraph (double-buffered, atomic swap)       │     │  │
│  │  │                                                  │     │  │
│  │  │  Sorted Node List:                               │     │  │
│  │  │  [OscSaw] → [LFO] → [Scale] → [ADSR]           │     │  │
│  │  │  → [SVF] → [VCA] → [Output]                     │     │  │
│  │  │                                                  │     │  │
│  │  │  Each node.process(32 samples)                   │     │  │
│  │  │  Intermediate buffers on arena + PSRAM           │     │  │
│  │  └──────────────────────────────────────────────────┘     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ ctagSPAllocator  │  │ PSRAM (buffers)  │                     │
│  │ Arena: ~150 KB   │  │ Delay/Rev: ~1 MB │                     │
│  └──────────────────┘  └──────────────────┘                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 4. Layer 1 — Graph Runtime Engine (C++)

### 4.1 Core Classes

#### `PatchNode` — Base class for all patchable DSP objects

```cpp
// Simplified concept
class PatchNode {
public:
    struct Port {
        enum Type { AUDIO, CONTROL, TRIGGER };
        std::string name;
        Type type;
        float defaultValue;
        float* buffer;          // for AUDIO: points to 32-sample buffer
        float  value;           // for CONTROL: single float value
        bool   trigValue;       // for TRIGGER: bool gate/trig
        int    connectedFrom;   // source node index (-1 = none)
        int    connectedPort;   // source port index
    };

    virtual ~PatchNode() = default;
    virtual void init(float sampleRate, int blockSize) = 0;
    virtual void process(int nframes) = 0;
    virtual const char* typeName() const = 0;

    // Port management
    void addInput(const char* name, Port::Type type, float defaultVal = 0.f);
    void addOutput(const char* name, Port::Type type);

    // Data access for process()
    float* getInputBuffer(int port);      // AUDIO: returns 32-sample buffer
    float  getControlValue(int port);     // CONTROL: returns single float
    bool   getTriggerValue(int port);     // TRIGGER: returns gate state
    float* getOutputBuffer(int port);     // AUDIO: returns 32-sample buffer
    void   setControlOutput(int port, float v);
    void   setTriggerOutput(int port, bool v);

    // Parameter system (user-adjustable knobs on the node)
    struct Param {
        std::string name;
        float value, minVal, maxVal, defaultVal;
        int   cvMapping;       // -1 = none, 0..3 = CV input
        int   trigMapping;     // -1 = none, 0..1 = trig input
    };
    std::vector<Param> params;

    // Position (for serialization back to WebUI)
    float posX, posY;

    // Unique instance ID within the patch
    int nodeId;

protected:
    std::vector<Port> inputs_;
    std::vector<Port> outputs_;
    float sampleRate_;
    int blockSize_;
};
```

#### `PatchGraph` — The signal processing graph

```cpp
class PatchGraph {
public:
    PatchGraph(float sampleRate, int blockSize, void* memPool, size_t memSize);
    ~PatchGraph();

    // Build graph from JSON
    bool buildFromJSON(const char* json, size_t len);

    // Process one audio block (called from audio ISR)
    void process(const ProcessData& data);

    // Real-time parameter update (thread-safe via atomic)
    void setNodeParam(int nodeId, int paramIdx, float value);

    // Serialize current state to JSON
    std::string toJSON() const;

private:
    // Topological sort the nodes (done once on buildFromJSON)
    bool topologicalSort();

    // Allocate intermediate audio buffers from pool
    void allocateBuffers();

    std::vector<PatchNode*> nodes_;         // all nodes
    std::vector<int>        execOrder_;     // topological order
    float*                  bufferPool_;    // intermediate buffer memory
    int                     bufferCount_;
    float                   sampleRate_;
    int                     blockSize_;

    // Sub-allocator for node objects and buffers
    void* memBase_;
    size_t memSize_;
    size_t memUsed_;
};
```

#### `ctagSoundProcessorPatcher` — The plugin wrapper

```cpp
class ctagSoundProcessorPatcher : public ctagSoundProcessor {
public:
    void Init(std::size_t blockSize, void* blockPtr) override;
    void Process(const ProcessData& data) override;

    // Called by REST API on Core 0
    void setPatch(const char* json, size_t len);
    std::string getPatch() const;
    void setNodeParam(int nodeId, int paramIdx, float value);

private:
    void knowYourself() override;

    PatchGraph* activeGraph_;       // currently processing (read by Core 1)
    PatchGraph* pendingGraph_;      // being built (written by Core 0)
    std::atomic<bool> swapPending_; // signal to swap on next process()

    // PSRAM buffer for delay/reverb nodes
    float* psramBuffer_;
    size_t psramSize_;
};
```

### 4.2 Signal Types

Following Axoloti's proven model with simplification:

| Signal Type | Buffer | Rate | Range | Color (WebUI) |
|---|---|---|---|---|
| **Audio** | `float[32]` per block | Sample rate (44.1 kHz) | -1.0 … +1.0 | **Yellow** |
| **Control** | Single `float` | Block rate (~1.38 kHz) | 0.0 … 1.0 (unipolar) or -1.0 … +1.0 (bipolar) | **Blue** |
| **Trigger** | Single `bool` | Block rate | true / false | **Green** |

**Connection rules:**
- Audio → Audio: direct buffer pointer pass
- Control → Control: direct value pass
- Control → Audio: expand single value to constant 32-sample buffer
- Audio → Control: take mean/RMS/last sample of buffer → single value
- Trigger → Trigger: direct
- Any other combinations: implicit conversion with clear visual feedback

### 4.3 Graph Execution

```
On each audio ISR call (every 32 samples, ~0.73 ms):

1. Check swapPending_ flag
   → If true: swap activeGraph_ ↔ pendingGraph_, clear flag

2. Copy ProcessData.cv[] and ProcessData.trig[] into I/O nodes

3. For each node in topological order:
   a. Resolve input connections:
      - For each connected input port, copy pointer/value from source output
      - For unconnected inputs, use default value
   b. Apply CV/trig overrides if mapped
   c. Call node->process(32)

4. Copy final output node buffers to ProcessData.buf[]
```

### 4.4 Graph Hot-Swap (Zero-Glitch)

```
Core 0 (HTTP thread):                    Core 1 (Audio ISR):

1. Receive new patch JSON
2. Allocate new PatchGraph from          ┃  processing activeGraph_
   secondary memory pool                 ┃
3. Build & validate graph                ┃
4. Topological sort                      ┃
5. Allocate buffers                      ┃
6. Store as pendingGraph_                ┃
7. Set swapPending_ = true               ┃
8. ─────────────────────────────────────►┃  sees swapPending_
                                         ┃  swaps activeGraph_ ↔ pendingGraph_
                                         ┃  clears swapPending_
                                         ┃  continues with new graph
9. On next REST call, old graph          ┃
   can be freed (or reused as            ┃
   next pendingGraph_ pool)              ┃
```

This is the same double-buffering pattern used by professional audio engines. Latency of
graph changes: at most 1 block (0.73 ms).

---

## 5. Layer 2 — REST API Extensions

### New Endpoints

All under `/api/v1/patcher/` — operating on whichever channel has the Patcher plugin active.

| Endpoint | Method | Body | Response | Purpose |
|---|---|---|---|---|
| `nodeTypes` | GET | — | `[{id, name, category, inputs, outputs, params}]` | List all available node types with port/param specs |
| `patch` | GET | — | `{nodes: {...}, connections: [...]}` | Get current patch graph as JSON |
| `patch` | POST | Patch JSON | `{ok: true}` or `{error: "..."}` | Replace entire patch graph (triggers hot-swap) |
| `param` | POST | `{nodeId, paramIdx, value}` | `{ok: true}` | Update single node param in real-time |
| `paramCV` | POST | `{nodeId, paramIdx, cv}` | `{ok: true}` | Map CV input to node param |
| `paramTrig` | POST | `{nodeId, paramIdx, trig}` | `{ok: true}` | Map trigger input to node param |
| `presets` | GET | — | `[{name, number}]` | List saved patch presets |
| `presets/save` | POST | `{name, number}` | `{ok: true}` | Save current patch as preset |
| `presets/load` | POST | `{number}` | Patch JSON | Load patch preset |
| `cpu` | GET | — | `{used, budget, perNode: [{id, cycles}]}` | CPU usage per node (debug) |

### Compatibility

These new endpoints coexist with all existing `/api/v1/` endpoints. The patcher is just another
plugin — `setActivePlugin?id=Patcher` activates it, and the main WebUI continues to work.
The patcher WebUI would be a separate page (`patcher.html`) linked from the main UI.

---

## 6. Layer 3 — WebUI Patcher (JavaScript)

### 6.1 Library Choice: LiteGraph.js

**Recommended:** [LiteGraph.js](https://github.com/jagenjo/litegraph.js) by Javi Agenjo

| Criterion | LiteGraph.js | Drawflow | Rete.js |
|---|---|---|---|
| **Dependencies** | **None (vanilla JS)** | **None (vanilla JS)** | React/Vue/Angular **required** |
| **Bundle size** | ~200 KB (single file) | ~12 KB min+gz | ~50 KB core + renderer plugins |
| **Rendering** | **Canvas2D** | DOM/SVG | DOM (framework-dependent) |
| **Typed ports** | **Yes (color-coded)** | No | Yes |
| **Built-in audio nodes** | **Yes** (WebAudio) | No | No |
| **Graph engine** | **Yes** (built-in execution) | No | Yes (dataflow engine) |
| **Subgraphs** | **Yes** | No (modules only) | Yes |
| **Custom widgets** | **Yes** (sliders, combos, buttons) | Limited | Yes |
| **Context menu / search** | **Yes** (built-in) | No | Plugin required |
| **Mobile/touch** | Partial | Yes | Yes |
| **Stars** | 7.9k | 6k | 11.9k |
| **Used by** | **ComfyUI** (proven at scale) | Workflow tools | Commercial apps |
| **License** | MIT | MIT | MIT |

#### Why LiteGraph.js wins for TBD:

1. **Single vanilla JS file, zero dependencies** — matches TBD's existing no-framework approach (jQuery + Onsen UI)
2. **Canvas2D rendering** — dramatically lighter than DOM-based node rendering; no DOM bloat from 50+ nodes
3. **Already has audio node types** — `audio/oscillator`, `audio/gain`, `audio/biquadfilter`, `audio/adsr`, `audio/mixer`, `audio/delay`, `audio/destination` — proving the architecture works for audio
4. **Typed, color-coded ports** — essential for distinguishing Audio (yellow) vs Control (blue) vs Trigger (green)
5. **Node widgets** — Each node can have inline sliders, combo boxes, toggle buttons for parameters — like Axoloti's object displays
6. **Subgraphs** — Users can encapsulate a group of nodes into a reusable sub-patch (like Pd abstractions)
7. **Search box** — Press space/tab to search for nodes by name, just like Pd and Max
8. **ComfyUI validation** — Powers the most popular AI image generation UI; battle-tested with hundreds of custom nodes

#### Why Drawflow is inadequate:
- No typed ports (users could connect audio to triggers with no validation)
- No context menu or search box
- DOM-based rendering (sluggish with 50+ nodes)
- Too simple for signal-flow patching (designed for business workflow automation)

#### Why Rete.js is overkill:
- **Requires React, Vue, or Angular** — violates the vanilla JS requirement
- Framework + renderer plugins add significant weight
- Over-engineered for this use case

### 6.2 Custom TBD Node Types (JavaScript Side)

Each firmware-side `PatchNode` type needs a matching LiteGraph node type in the browser.
These are purely visual — they don't process audio. They define the UI and serialize to JSON
that the firmware interprets.

```javascript
// Example: TBD SVF Filter node for LiteGraph
function TBDNodeSVF() {
    this.addInput("in", "audio");
    this.addInput("freq", "control");
    this.addInput("reso", "control");
    this.addOutput("lp", "audio");
    this.addOutput("bp", "audio");
    this.addOutput("hp", "audio");

    // Inline parameter widgets
    this.addWidget("slider", "Frequency", 1000, function(v) {}, {min: 20, max: 20000});
    this.addWidget("slider", "Resonance", 0.5, function(v) {}, {min: 0, max: 1});

    this.properties = { freq: 1000, reso: 0.5 };
    this.size = [200, 120];
}
TBDNodeSVF.title = "SVF Filter";
TBDNodeSVF.desc = "State Variable Filter (LP/BP/HP)";
LiteGraph.registerNodeType("filter/svf", TBDNodeSVF);
```

### 6.3 Communication Flow (WebUI ↔ Firmware)

```
User drags cable / changes param
        │
        ▼
LiteGraph event handler
        │
        ├─── connectionCreated/connectionRemoved ──►  Debounce 100ms
        │                                              then POST full patch JSON
        │                                              to /api/v1/patcher/patch
        │
        └─── widget value changed ──────────────────►  Immediate POST single param
                                                       to /api/v1/patcher/param
                                                       (queued via ajaxq like existing UI)
```

**Request queuing:** Reuse the existing `ajaxq.js` (jQuery AJAX queue) to serialize
requests to the ESP32's single-threaded HTTP server. This prevents request flooding
when rapidly connecting/disconnecting nodes.

### 6.4 File Structure

```
sdcard_image/www/
├── index.html          (existing — add link to patcher)
├── main.html           (existing)
├── edit.html            (existing)
├── patcher.html        ← NEW: Patcher entry page
├── js/
│   ├── litegraph.min.js    ← LiteGraph library (~200KB gzipped)
│   └── tbd-patcher.js      ← TBD custom node types + REST communication
├── css/
│   └── litegraph.css       ← LiteGraph styles (~15KB)
└── ... (existing files)
```

---

## 7. Node Library — DSP Building Blocks

### 7.1 Category Structure (Inspired by Axoloti)

Organized to match the Axoloti/Pd mental model that users are familiar with:

#### `io/` — Audio & CV I/O

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **AudioIn** | — | `left` (A), `right` (A) | — | `ProcessData.buf` input channels |
| **AudioOut** | `left` (A), `right` (A) | — | `gain` | `ProcessData.buf` output channels |
| **CVIn** | — | `cv0-3` (C), `trig0-1` (T) | — | `ProcessData.cv[]`, `ProcessData.trig[]` |
| **Knob** | — | `out` (C) | `value`, `min`, `max` | Constant value source |

#### `osc/` — Oscillators

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **Sine** | `freq` (C), `fm` (A) | `out` (A) | `frequency` | `ctagSineSource` |
| **Saw** | `freq` (C) | `out` (A) | `frequency`, `pw` | Custom (PolyBLEP or MI macro oscillator) |
| **Square** | `freq` (C) | `out` (A) | `frequency`, `pw` | Custom (PolyBLEP) |
| **Triangle** | `freq` (C) | `out` (A) | `frequency` | Custom |
| **MacroOsc** | `freq` (C), `timbre` (C), `color` (C), `morph` (C) | `out` (A), `aux` (A) | `shape`, `frequency` | MI `MacroOscillator2` (Plaits) |
| **SuperSaw** | `freq` (C), `detune` (C) | `out` (A) | `frequency`, `detune`, `damp` | `MiSuperSawOsc` |
| **WaveTable** | `freq` (C), `pos` (C) | `out` (A) | `frequency`, `table` | Sample ROM wavetable |

#### `noise/` — Noise Generators

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **White** | — | `out` (A) | — | `ctagWNoiseGen` |
| **Pink** | — | `out` (A) | — | `ctagPNoiseGen` |
| **Dust** | `rate` (C) | `out` (A) | `rate`, `width` | `ctagDustGen` |
| **Gaussian** | — | `out` (A) | `precision` | `ctagGNoiseGen` |

#### `env/` — Envelopes

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **ADSR** | `gate` (T) | `out` (C), `eoc` (T) | `A`, `D`, `S`, `R` | `ctagADSREnv` |
| **AD** | `trig` (T) | `out` (C), `eoc` (T) | `A`, `D`, `mode`, `loop` | `ctagADEnv` |
| **Decay** | `trig` (T) | `out` (C) | `time` | `ctagDecay` |
| **Follow** | `in` (A) | `out` (C) | `attack`, `release` | `ctagEnvFollow` |

#### `filter/` — Filters

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **SVF** | `in` (A), `freq` (C), `reso` (C) | `lp` (A), `bp` (A), `hp` (A) | `frequency`, `resonance` | `stmlib::Svf` (MI) |
| **Biquad** | `in` (A), `freq` (C), `q` (C) | `out` (A) | `frequency`, `Q`, `type` | `ctagBiQuad` |
| **DiodeLadder** | `in` (A), `freq` (C), `reso` (C) | `out` (A) | `frequency`, `resonance` | `ctagDiodeLadderFilter` |
| **Korg35** | `in` (A), `freq` (C), `reso` (C) | `out` (A) | `frequency`, `resonance`, `saturation` | `ctagWPkorg35` |

#### `delay/` — Delay Lines

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **Delay** | `in` (A), `time` (C), `fb` (C) | `out` (A) | `time`, `feedback`, `mix` | `ctagFBDelayLine` |
| **SimpleDelay** | `in` (A) | `out` (A) | `time`, `feedback` | `ctagDelay` |

#### `reverb/` — Reverbs

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **FreeVerb** | `in` (A) | `left` (A), `right` (A) | `size`, `damp`, `wet` | `revmodel` (freeverb) |
| **PlateReverb** | `in` (A) | `left` (A), `right` (A) | `time`, `diffusion`, `lp`, `amount` | `Reverb` (mifx) |
| **Diffuser** | `in` (A) | `out` (A) | `amount`, `time` | `Diffuser` (mifx) |

#### `fx/` — Effects

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **Chorus** | `left` (A), `right` (A) | `left` (A), `right` (A) | `amount`, `depth` | `Chorus` (mifx) |
| **Ensemble** | `left` (A), `right` (A) | `left` (A), `right` (A) | `amount`, `depth` | `Ensemble` (mifx) |
| **PitchShift** | `in` (A) | `out` (A) | `ratio`, `size` | `PitchShifterMono` (mifx) |
| **Decimator** | `in` (A) | `out` (A) | `bits`, `downsample` | `ctagDecimator` |
| **Phaser** | `in` (A) | `out` (A) | `rate`, `depth`, `fb` | `ctagPebble` |

#### `dyn/` — Dynamics

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **Compressor** | `in` (A), `sidechain` (A) | `out` (A) | `thresh`, `ratio`, `attack`, `release` | `SimpleComp` |
| **Gate** | `in` (A) | `out` (A) | `thresh` | `SimpleGate` |
| **Limiter** | `in` (A) | `out` (A) | `thresh`, `attack`, `release` | `SimpleLimit` |

#### `math/` — Math & Utility

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **Add** | `a` (A/C), `b` (A/C) | `out` (A/C) | — | Addition |
| **Multiply** | `a` (A/C), `b` (A/C) | `out` (A/C) | — | Multiplication (VCA/ring mod) |
| **Scale** | `in` (C) | `out` (C) | `min`, `max`, `curve` | `CVtranscoder::Process` |
| **Invert** | `in` (A/C) | `out` (A/C) | — | `out = -in` |
| **Abs** | `in` (A/C) | `out` (A/C) | — | `out = |in|` |
| **Clamp** | `in` (A/C) | `out` (A/C) | `min`, `max` | Clipping |
| **SampleHold** | `in` (C), `trig` (T) | `out` (C) | — | Sample & Hold |
| **Slew** | `in` (C) | `out` (C) | `rise`, `fall` | Slew limiter / portamento |
| **Mix2** | `a` (A), `b` (A) | `out` (A) | `gainA`, `gainB` | 2-channel mixer |
| **Mix4** | `a-d` (A) | `out` (A) | `gainA-D` | 4-channel mixer |
| **Crossfade** | `a` (A), `b` (A), `mix` (C) | `out` (A) | `mix` | Equal-power crossfade |

#### `lfo/` — Low Frequency Oscillators

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **LFO** | `rate` (C), `reset` (T) | `sin` (C), `tri` (C), `saw` (C), `sqr` (C) | `frequency`, `shape`, `phase` | Custom (dedicated LFO, sub-audio) |
| **RandomLFO** | `rate` (C) | `out` (C) | `slope` | `RandomOscillator` (mifx) |

#### `logic/` — Logic & Control

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **Clock** | `bpm` (C) | `beat` (T), `bar` (T) | `bpm`, `division` | `ctagTimer` |
| **Counter** | `trig` (T), `reset` (T) | `count` (C) | `max`, `direction` | Custom |
| **Toggle** | `trig` (T) | `out` (T) | — | Flip-flop |
| **Compare** | `a` (C), `b` (C) | `gt` (T), `eq` (T), `lt` (T) | `threshold` | Comparator |

#### `synth/` — Complete Synthesis Modules

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **FMKick** | `trig` (T) | `out` (A) | `freq`, `fmAmt`, `decay`, `drive` | `FmKick` |
| **Clap** | `trig` (T) | `out` (A) | `freq`, `decay`, `tone` | `Clap` |
| **Rimshot** | `trig` (T) | `out` (A) | `freq`, `decay`, `snap` | `Rimshot` |
| **Rompler** | `gate` (T), `pitch` (C) | `out` (A) | `slice`, `start`, `length`, `loop` | `RomplerVoiceMinimal` |

**Total: ~55 node types** wrapping existing TBD DSP code.

### 7.2 Node Memory Costs

| Category | Typical Object Size | Buffer per Instance | Notes |
|---|---|---|---|
| Math/Logic | 16-64 bytes | 0 | Stateless or trivial state |
| Oscillators | 32-128 bytes | 0 | Phase accumulator + a few coefficients |
| Envelopes | 64-128 bytes | 0 | State machine + coefficients |
| Filters | 64-256 bytes | 0 | Filter state (biquad: 5 coeffs + 2 delays) |
| LFO | 32-64 bytes | 0 | Phase + waveform state |
| Noise | 16-128 bytes | 0 | RNG state |
| Chorus/Ensemble | 64 bytes + buffer | **2-16 KB** | Modulated delay lines |
| Delay | 32 bytes + buffer | **8-350 KB** | Configurable max delay time |
| Reverb | 128-256 bytes + buffer | **32-84 KB** | Multiple delay lines + allpass chains |
| Pitch Shifter | 64 bytes + buffer | **8-16 KB** | Grain buffers |
| Dynamics | 32-64 bytes | 0 | Envelope state |
| Rompler | 128 bytes + buffer | **8-16 KB** | Read buffers + pitch shift buffer |

**Intermediate (wire) buffers:** Each unique audio connection needs a `float[32]` = 128 bytes.
A 50-node patch with ~60 connections needs ~7.5 KB of wire buffers.

---

## 8. Memory Architecture

### 8.1 Current TBD Memory Model

```
┌─────────────────────────────────────────────────┐
│  ctagSPAllocator Arena (300 KB)                 │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ CH0 (150 KB) │  │ CH1 (150 KB) │             │
│  │              │  │              │             │
│  │ Plugin obj   │  │ Plugin obj   │             │
│  │ + blockMem   │  │ + blockMem   │             │
│  └──────────────┘  └──────────────┘             │
│                                                 │
│  STEREO mode: one plugin gets full 300 KB       │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  PSRAM (~29 MB)                                 │
│                                                 │
│  Sample ROM data: ~28 MB                        │
│  Plugin PSRAM allocs: ~1 MB                     │
└─────────────────────────────────────────────────┘
```

### 8.2 Patcher Memory Model

The Patcher plugin runs in **STEREO mode** to get the full 300 KB arena:

```
┌─────────────────────────────────────────────────────────────────┐
│  Arena (300 KB = 307,200 bytes)                                 │
│                                                                 │
│  ┌─────────────────────────────────┐                            │
│  │ ctagSoundProcessorPatcher obj   │  ~512 bytes                │
│  │ (factory-allocated)             │                            │
│  └─────────────────────────────────┘                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Remaining blockMem (~306 KB)                            │    │
│  │                                                         │    │
│  │  ┌──────────────┐  ┌──────────────┐                     │    │
│  │  │ Graph A      │  │ Graph B      │  (double-buffer)    │    │
│  │  │ ~150 KB      │  │ ~150 KB      │                     │    │
│  │  │              │  │              │                     │    │
│  │  │ Node objects │  │ Node objects │                     │    │
│  │  │ Wire buffers │  │ Wire buffers │                     │    │
│  │  │ Param arrays │  │ Param arrays │                     │    │
│  │  └──────────────┘  └──────────────┘                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PSRAM (for large delay/reverb buffers)                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────┐       │
│  │ DelayNode buffers (up to ~1 MB total)                │       │
│  │ ReverbNode buffers (84 KB per reverb instance)       │       │
│  │ PitchShifter buffers (16 KB per instance)            │       │
│  │ Chorus/Ensemble buffers (2-16 KB each)               │       │
│  └──────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 Memory Budget Example

**A moderately complex patch (30 nodes):**

| Component | Count | Size Each | Total |
|---|---|---|---|
| PatchGraph overhead | 1 | 256 B | 256 B |
| Node objects (average) | 30 | 128 B | 3.8 KB |
| Node param arrays | 30 | 64 B | 1.9 KB |
| Wire buffers (audio) | 40 | 128 B | 5.0 KB |
| Execution order array | 30 | 4 B | 120 B |
| Connection metadata | 40 | 16 B | 640 B |
| **Subtotal (arena)** | | | **~12 KB** |
| Reverb buffer (PSRAM) | 1 | 84 KB | 84 KB |
| Delay buffer (PSRAM) | 2 | 44 KB | 88 KB |
| Chorus buffer (PSRAM) | 1 | 8 KB | 8 KB |
| **Subtotal (PSRAM)** | | | **~180 KB** |

**Conclusion:** 150 KB per graph half-buffer is more than sufficient for most patches.
Each graph half can hold 100+ simple nodes or 30-50 nodes with moderate effects.

### 8.4 Sub-Allocator Strategy

Within each graph buffer, use `tinyalloc` (already in the project at
`components/ctagSoundProcessor/memory/tinyalloc.c`) for dynamic allocation of node objects
and wire buffers. This provides `ta_alloc`/`ta_free` within the fixed arena region.

Large effect buffers (>1 KB) are allocated from PSRAM and tracked separately, freed on
graph destruction.

### 8.5 ESP32-P4 Memory Upgrade

The ESP32-P4 significantly improves the memory situation:

| Resource | ESP32 (current) | ESP32-P4 |
|---|---|---|
| Internal SRAM | 520 KB | 768 KB |
| PSRAM | 8 MB (SPIRAM) | Up to 32 MB (PSRAM) |
| Arena budget | 300 KB | Could increase to 512+ KB |

With 32 MB PSRAM, even the most reverb/delay-heavy patches have plenty of room.

---

## 9. ESP32-P4 Resource Budget

### 9.1 CPU

| Parameter | Value |
|---|---|
| Clock speed | 400 MHz (dual RISC-V cores) |
| Audio block | 32 samples @ 44.1 kHz = 0.726 ms |
| Cycles per block | ~290,000 cycles |
| Audio core | Core 1 (dedicated, priority 23) |
| HTTP/WebUI core | Core 0 |

### 9.2 Graph Overhead

| Operation | Cost per Node | Cost for 50-Node Patch |
|---|---|---|
| Graph traversal (loop iteration) | ~10 cycles | 500 cycles |
| Input buffer pointer resolution | ~30 cycles | 1,500 cycles |
| Virtual `process()` call | ~20 cycles | 1,000 cycles |
| CV/Trig override check | ~15 cycles | 750 cycles |
| **Total overhead** | ~75 cycles/node | **~3,750 cycles** |
| **% of budget** | | **~1.3%** |

The graph execution overhead is **negligible**. The actual DSP in each node dominates,
which is identical cost to monolithic plugins since it runs the same code.

### 9.3 DSP Cost Reference

| Node Type | Cycles (approx, per 32 samples) | Notes |
|---|---|---|
| Knob/Add/Multiply | ~100 | Near-zero |
| Sine oscillator | ~500 | 32 sin lookups |
| PolyBLEP saw/square | ~2,000 | Anti-aliased |
| MI MacroOscillator | ~15,000 | Full algorithm |
| SVF filter | ~2,000 | 32 samples × few mults |
| Diode ladder | ~4,000 | 4-pole, oversampled |
| ADSR envelope | ~500 | State machine |
| Biquad EQ | ~1,500 | ESP-DSP optimized |
| Freeverb | ~20,000 | 8 comb + 4 AP |
| MI Reverb | ~30,000 | Dattorro plate |
| Delay (simple) | ~500 | Read + write |
| Compressor | ~1,000 | Envelope + gain |

**Example patch budget:**

```
1× AudioIn         =     100 cycles
2× PolyBLEP Osc    =   4,000 cycles
1× MI MacroOsc     =  15,000 cycles
1× ADSR            =     500 cycles
1× AD              =     300 cycles
1× LFO             =     500 cycles
2× SVF Filter      =   4,000 cycles
1× VCA (Multiply)  =     200 cycles
1× Mix2            =     200 cycles
1× Delay           =     500 cycles
1× Freeverb        =  20,000 cycles
1× AudioOut        =     100 cycles
Graph overhead     =   1,000 cycles
─────────────────────────────────────
Total              =  46,400 cycles
Budget             = 290,000 cycles
Headroom           = 243,600 cycles (84% free)
```

**Conclusion:** Even a fairly complex patch uses only ~16% of the CPU budget on ESP32-P4.

---

## 10. WebUI Library Evaluation

### 10.1 LiteGraph.js Detailed Assessment

**Repository:** https://github.com/jagenjo/litegraph.js  
**License:** MIT  
**Size:** ~200 KB single JS file + ~15 KB CSS  
**Dependencies:** None  
**Rendering:** Canvas2D (HTML5 `<canvas>`)

#### Built-in Features Relevant to TBD Patcher:

| Feature | Details |
|---|---|
| **Node types** | Fully customizable: title, color, shape, inputs/outputs with types |
| **Port types** | String-based with color mapping; prevents invalid connections |
| **Widgets** | Inline sliders, combo boxes, toggles, number inputs, text, buttons |
| **Search** | Press space to search/add nodes by name |
| **Context menu** | Right-click for add/delete/clone/properties |
| **Selection** | Multi-select, copy/paste, group operations |
| **Subgraphs** | Nodes containing entire sub-graphs (like Pd abstractions) |
| **Serialization** | `graph.serialize()` → JSON, `graph.configure(json)` ← JSON |
| **Zoom/Pan** | Ctrl+scroll zoom, drag pan |
| **Mini-map** | Optional overview panel |
| **Execution** | Optional client-side graph execution (not used in our case) |
| **Custom rendering** | `onDrawForeground(ctx)` for oscilloscope/meter overlays |
| **Events** | `onNodeCreated`, `onNodeRemoved`, `onConnectionChange`, etc. |

#### Audio Node Examples Already in LiteGraph:

LiteGraph ships with `audio/source`, `audio/media_source`, `audio/oscillator`, `audio/gain`,
`audio/biquadfilter`, `audio/delay`, `audio/mixer`, `audio/adsr`, `audio/convolver`,
`audio/dynamicsCompressor`, `audio/destination`, `audio/analyser`, `audio/visualization`,
`audio/script` — these wrap WebAudio API nodes. We would replace these with TBD-specific
nodes that send REST calls to the ESP32 instead of processing audio in the browser.

#### Customization for TBD:

1. **Custom port colors:** `audio` → yellow, `control` → blue, `trigger` → green
2. **Custom node shapes:** Round for oscillators, rectangular for effects, hexagonal for I/O
3. **Theme:** Dark theme matching TBD's existing Onsen UI dark mode
4. **Node categories:** Populate the search/add menu from `/api/v1/patcher/nodeTypes`
5. **Auto-save:** Debounce changes and POST to `/api/v1/patcher/patch` after 500ms of inactivity
6. **CPU meter:** Custom widget showing per-node CPU usage from `/api/v1/patcher/cpu`

### 10.2 Gzip Serving

LiteGraph.js (~200 KB) gzips to ~55 KB. Combined with the `tbd-patcher.js` custom code
(~20 KB estimated → ~5 KB gzipped), the total patcher WebUI adds **~60-70 KB** to the SD card
— well within the ESP32's SD card and serving capacity.

Reference: the current WebUI (`jquery.min.js` + `onsenui.min.js` + CSS) is already ~400 KB gzipped.

---

## 11. Patch Format Specification

### 11.1 Patch JSON Schema

```json
{
  "version": 1,
  "name": "My Synth Patch",
  "author": "user",
  "nodes": {
    "1": {
      "type": "osc/saw",
      "params": {
        "frequency": { "value": 440.0, "cv": -1, "trig": -1 }
      },
      "pos": [100, 200]
    },
    "2": {
      "type": "filter/svf",
      "params": {
        "frequency": { "value": 2000.0, "cv": 0, "trig": -1 },
        "resonance": { "value": 0.7, "cv": -1, "trig": -1 }
      },
      "pos": [350, 200]
    },
    "3": {
      "type": "env/adsr",
      "params": {
        "A": { "value": 0.01, "cv": -1, "trig": -1 },
        "D": { "value": 0.2, "cv": -1, "trig": -1 },
        "S": { "value": 0.5, "cv": -1, "trig": -1 },
        "R": { "value": 0.3, "cv": -1, "trig": -1 }
      },
      "pos": [100, 400]
    },
    "4": {
      "type": "math/multiply",
      "params": {},
      "pos": [550, 200]
    },
    "5": {
      "type": "io/audioOut",
      "params": { "gain": { "value": 0.8, "cv": -1, "trig": -1 } },
      "pos": [750, 200]
    },
    "6": {
      "type": "io/cvIn",
      "params": {},
      "pos": [50, 400]
    }
  },
  "connections": [
    { "src": "1", "srcPort": "out",  "dst": "2", "dstPort": "in" },
    { "src": "2", "srcPort": "lp",   "dst": "4", "dstPort": "a" },
    { "src": "3", "srcPort": "out",  "dst": "4", "dstPort": "b" },
    { "src": "4", "srcPort": "out",  "dst": "5", "dstPort": "left" },
    { "src": "4", "srcPort": "out",  "dst": "5", "dstPort": "right" },
    { "src": "6", "srcPort": "trig0","dst": "3", "dstPort": "gate" }
  ]
}
```

### 11.2 Node Type Descriptor (served by `/api/v1/patcher/nodeTypes`)

```json
{
  "id": "filter/svf",
  "name": "SVF Filter",
  "category": "filter",
  "description": "State Variable Filter with LP/BP/HP outputs",
  "inputs": [
    { "name": "in", "type": "audio", "description": "Audio input" },
    { "name": "freq", "type": "control", "description": "Cutoff frequency", "default": 1000 },
    { "name": "reso", "type": "control", "description": "Resonance", "default": 0.5 }
  ],
  "outputs": [
    { "name": "lp", "type": "audio", "description": "Low-pass output" },
    { "name": "bp", "type": "audio", "description": "Band-pass output" },
    { "name": "hp", "type": "audio", "description": "High-pass output" }
  ],
  "params": [
    { "name": "frequency", "type": "float", "min": 20, "max": 20000, "default": 1000, "unit": "Hz" },
    { "name": "resonance", "type": "float", "min": 0, "max": 1, "default": 0.5 }
  ],
  "color": "#4488AA",
  "memCost": 64
}
```

### 11.3 Preset Storage

Patches are stored as JSON files on the SD card under:
```
/sdcard/data/patcher/presets/
├── 0.json    (preset slot 0)
├── 1.json    (preset slot 1)
├── ...
└── 15.json   (preset slot 15)
```

The preset system reuses the existing `ctagSPDataModel` infrastructure where possible,
but since the patcher's "parameters" are the entire graph rather than a flat param list,
the full JSON is stored as the preset data.

---

## 12. Simulator Support

### 12.1 Current Simulator Architecture

The TBD simulator (`simulator/`) mirrors hardware faithfully:

- **RtAudio** for real-time audio I/O at 44.1 kHz / 32 frames
- **Same** `ctagSoundProcessorFactory`, `ctagSPAllocator`, `ProcessData`, plugin lifecycle
- **Same** REST API on port 8080 via Boost Simple-Web-Server
- **Same** WebUI served from `sdcard_image/www/`
- **SimStimulus** for simulating CV/trig inputs

### 12.2 Patcher in Simulator

The patcher plugin requires **zero simulator-specific code**:

1. `ctagSoundProcessorPatcher` is a regular `ctagSoundProcessor` subclass → automatically compiled into the simulator via the existing CMake glob
2. All DSP helper classes used by nodes are already compiled for the simulator
3. The WebUI (LiteGraph.js + `tbd-patcher.js`) is served from the same `sdcard_image/www/` directory
4. New REST endpoints are added to `WebServer.cpp` alongside existing ones
5. PSRAM allocations fall back to regular `malloc()` through the simulator's fake-idf stubs

**The simulator becomes the primary development environment for the patcher.**

### 12.3 Desktop Development Workflow

```
1. Edit node C++ code in components/ctagSoundProcessor/patcher/
2. cmake --build simulator/build
3. ./tbd-sim
4. Open http://localhost:8080/patcher.html
5. Create/edit patches visually
6. Audio plays through sound card in real-time
7. SimStimulus at http://localhost:8080/ctrl for CV/trig testing
8. When satisfied, flash to ESP32-P4 hardware
```

---

## 13. Integration with Existing TBD Architecture

### 13.1 Plugin Registration

The patcher is registered as a normal plugin via the existing CMake code generation:

- File: `components/ctagSoundProcessor/ctagSoundProcessorPatcher.cpp`
- CMake auto-generates factory entry: `if(type.compare("Patcher") == 0) processor = new ctagSoundProcessorPatcher();`
- Users activate it: `GET /api/v1/setActivePlugin/0?id=Patcher`

### 13.2 Stereo Mode

The patcher should run in **stereo mode** to get the full 300 KB arena and process both
channels. This is set via the existing configuration API:
`POST /api/v1/setConfiguration` with `{...,"processingMode":"stereo",...}`

When the patcher is active, it owns both audio channels — the `AudioIn` and `AudioOut`
nodes handle the stereo buffer internally.

### 13.3 WebUI Navigation

```
index.html (existing)
  └── main.html (existing — plugin selector)
        ├── edit.html (existing — param editor for regular plugins)
        └── patcher.html (NEW — LiteGraph canvas for Patcher plugin)
              │
              └── Opened when user selects "Patcher" plugin
                  OR via a dedicated button on main.html
```

The `main.html` page can detect when the Patcher plugin is active and show a
"Open Patcher" button instead of the regular "Edit" button. Alternatively,
`patcher.html` can be accessed directly via URL.

### 13.4 CV/Trig Integration

The hardware's CV and trigger inputs are exposed through the `io/cvIn` node,
which reads from `ProcessData.cv[]` and `ProcessData.trig[]`. Individual node
parameters can also be CV/trig-mapped through the same mechanism used by
existing plugins (`pMapCv`, `pMapTrig`), exposed in the WebUI as right-click
options on each node's parameter widgets.

### 13.5 Favorites / Quick Recall

The existing Favorites system can store patcher presets — a favorite simply
remembers `{plugin: "Patcher", preset: 3}` and recalls the corresponding
patch graph.

---

## 14. Development Roadmap

### Phase 1 — Minimal Viable Patcher (~3-4 weeks)

**Goal:** A working end-to-end prototype with basic nodes.

| Task | Effort | Files |
|---|---|---|
| `PatchNode` base class | 2 days | `patcher/PatchNode.hpp` |
| `PatchGraph` with topological sort | 3 days | `patcher/PatchGraph.hpp/.cpp` |
| Graph JSON serializer/deserializer | 2 days | `patcher/PatchGraph.cpp` |
| `ctagSoundProcessorPatcher` wrapper | 2 days | `ctagSoundProcessorPatcher.hpp/.cpp` |
| Basic nodes: AudioIn/Out, Knob, Add, Multiply, Sine, SVF, ADSR, Noise | 3 days | `patcher/nodes/*.hpp` |
| REST API endpoints (patch, param, nodeTypes) | 2 days | `RestServer.cpp` + `WebServer.cpp` |
| LiteGraph.js integration + custom TBD nodes | 3 days | `www/patcher.html`, `www/js/tbd-patcher.js` |
| Simulator testing & debugging | 3 days | — |

**Deliverable:** Users can build a simple synth patch (osc → filter → VCA → output)
in the browser and hear it play on the simulator or hardware.

### Phase 2 — Core Node Library (~2-3 weeks)

| Task | Effort |
|---|---|
| Saw/Square/Triangle oscillators (PolyBLEP) | 2 days |
| MI MacroOscillator wrapper | 2 days |
| All filter variants (DiodeLadder, Korg35, Biquad) | 2 days |
| AD envelope, Decay, Envelope Follower | 1 day |
| LFO node (multi-waveform) | 1 day |
| Delay node (simple + feedback) | 2 days |
| Reverb nodes (Freeverb, MI Reverb) | 2 days |
| Math/utility nodes (Scale, Clamp, Crossfade, etc.) | 1 day |
| Noise nodes (White, Pink, Dust, Gaussian) | 1 day |
| Logic nodes (Clock, Counter, Toggle, Compare) | 1 day |
| Dynamics nodes (Compressor, Gate, Limiter) | 1 day |

### Phase 3 — Advanced Features (~2-3 weeks)

| Task | Effort |
|---|---|
| Preset save/load system | 2 days |
| Subgraph (sub-patch) support | 3 days |
| More FX nodes (Chorus, Ensemble, PitchShift, Phaser, Decimator) | 3 days |
| Drum synth nodes (FMKick, Clap, Rimshot) | 2 days |
| Rompler/sample player node | 2 days |
| CPU usage monitoring (per-node) | 1 day |
| Mobile touch optimization | 2 days |

### Phase 4 — Polish & Optimization (~2 weeks)

| Task | Effort |
|---|---|
| Undo/redo in WebUI | 2 days |
| Copy/paste nodes | 1 day |
| Node grouping / coloring | 1 day |
| Default factory patches (10-20 demo patches) | 3 days |
| Performance profiling on ESP32-P4 | 2 days |
| Documentation & user guide | 2 days |
| Bug fixes & edge cases | 3 days |

**Total estimated effort: ~10-12 weeks** for a full-featured patcher.
Phase 1 alone (3-4 weeks) delivers a usable prototype.

---

## 15. Open Questions & Decisions

### Architecture

| Question | Options | Recommendation |
|---|---|---|
| **Block size for patcher** | Same 32 samples as existing plugins? | **Yes** — keep 32 for consistency and low latency |
| **Control rate** | Every block (1.38 kHz) or subdivided? | **Every block** — standard for modular synths, 0.73 ms is fast enough |
| **Max nodes per patch** | Hard limit or dynamic? | **Soft limit ~100** based on memory; warn user if approaching |
| **Stereo vs mono audio wires** | All stereo? All mono? Mixed? | **Mono wires by default**, with explicit stereo nodes (like StereoOut, StereoReverb) |
| **Double-buffer graphs?** | Hot-swap or mute-and-swap? | **Hot-swap (atomic pointer swap)** — glitch-free |
| **Node parameters stored where?** | In graph JSON only? Or shadowed in existing param system? | **In graph JSON** — the existing flat param system doesn't fit graph topology |

### WebUI

| Question | Options | Recommendation |
|---|---|---|
| **LiteGraph.js version** | Original (jagenjo) or community fork? | **Original** — proven, stable, ComfyUI uses a fork but original is lighter |
| **Debounce interval for patch POST** | Immediate? 100ms? 500ms? | **200ms debounce** for connection changes, **immediate** for param tweaks |
| **Separate page or embedded?** | `patcher.html` as new page, or embedded in `edit.html`? | **Separate page** — the patcher canvas needs full screen; link from main.html |
| **Node palette** | Sidebar list? Search only? Both? | **Search box (space key)** + **right-click context menu organized by category** |

### Node Library

| Question | Options | Recommendation |
|---|---|---|
| **MIDI nodes?** | MIDI in/out for note, CC, clock? | **Phase 3** — useful but not core; needs MIDI subsystem integration |
| **Polyphony?** | Single-voice? Multi-voice sub-patches? | **Phase 3** — poly as sub-patch voices (like Pd's `clone`); start mono |
| **User-definable sub-patches?** | Save/load sub-patches as reusable objects? | **Phase 3** — LiteGraph has subgraph support; expose as saveable objects |
| **Spectral / FFT nodes?** | FFT forward/inverse + spectral processing? | **Phase 4 or later** — memory and CPU intensive; niche use case |

---

## Appendix A — Full DSP Building Block Inventory

### Existing Code Available for Wrapping

#### Helpers (`components/ctagSoundProcessor/helpers/`)

| Class | Type | Processing | Key Methods |
|---|---|---|---|
| `ctagADEnv` | AD envelope | Sample | `Process()`, `Trigger()`, `SetAttack/Decay()`, `SetLoop()` |
| `ctagADSREnv` | ADSR envelope | Sample | `Process()`, `Gate()`, `SetAttack/Decay/Sustain/Release()` |
| `ctagDecay` | Exponential decay | Sample | `Process(in)`, `SetDecay60dB()` |
| `ctagEnvFollow` | Envelope follower | Sample | `Process(in)`, `SetAttack/Decay()` |
| `ctagBiQuad` | Biquad LP/BP/HP | Block | `Process(buf, sz)`, `SetCutoffHz()`, `SetQ()`, `SetType()` |
| `ctagDelay` | Simple delay line | Sample | `Process(in)`, `SetBuffer()`, `SetFeedback()`, `GetZ()` |
| `ctagFBDelayLine` | Feedback delay | Block | `Process(buf, off, inc, sz)`, `SetFeedback/Length/DryWet()` |
| `ctagSineSource` | Sine oscillator | Sample | `Process()`, `SetFrequency()`, `GetSin/Cos()` |
| `ctagWNoiseGen` | White noise | Sample | `Process()`, `SetBipolar()` |
| `ctagPNoiseGen` | Pink noise | Sample | `Process()` |
| `ctagGNoiseGen` | Gaussian noise | Sample | `Process()`, `SetPrecision()` |
| `ctagDustGen` | Dust/impulse | Sample | `Process()`, `SetRate/Smooth/Width/Bipolar()` |
| `CVtranscoder` | Curve mapping | Static | `Process(in, curve, start, end, min, max)` |
| `ctagFastMath` | Fast math | Static | ~40 functions: `fastsin`, `fasttanh`, `fastexp`, etc. |
| `ctagRollingAverage` | Dejitter | Sample | `push()`, `mean()`, `dejitter()` |
| `ctagTimer` | Timer | Sample | `SetTimeout()`, `Tick()`, `SetRepeat()` |
| `ctagSampleRom` | Sample ROM access | Block | `ReadSliceAsFloat()`, `GetSliceSize()` |

#### Filters (`components/ctagSoundProcessor/filters/`)

| Class | Type | Key Methods |
|---|---|---|
| `ctagDiodeLadderFilter` (×5 variants) | ZDF Diode Ladder 4-pole LP | `Process(in)`, `SetCutoff()`, `SetResonance()` |
| `ctagWPkorg35` | Korg MS-35 | `Process(in)`, `SetCutoff()`, `SetResonance()`, `SetSaturation()` |

#### Synthesis (`components/ctagSoundProcessor/synthesis/`)

| Class | Type | Key Methods |
|---|---|---|
| `FmKick` | FM kick drum | `Trigger()`, `Process(buf, n)` |
| `Clap` | Synth clap | `Trigger()`, `Process(buf, n)` |
| `Rimshot` | Synth rimshot | `Trigger()`, `Process(buf, n)` |
| `RomplerVoice` | Full sample player | `Process(buf, n)`, ADSR+LFO+SVF+SampleROM |
| `RomplerVoiceMinimal` | Lightweight sampler | `Process(buf, n)`, AD+pitch shift |
| `MiSuperSawOsc` | 6-voice supersaw | `Render(buf, n)`, `SetDetune/Pitch/Damp()` |
| `ChordSynth` | Polyphonic chord | `Process(buf, n)`, 4 voices+ADSR+SVF |

#### Effects (`components/ctagSoundProcessor/fx/`)

| Class | Type | Key Methods |
|---|---|---|
| `ctagDecimator` | Bitcrusher | `Process(in)`, `SetBitsToCrush()`, `SetDownsampleFactor()` |
| `ctagMDAtalkbox` | Vocoder | `Process(mod, car)` |
| `ctagPebble` | Phaser (Small Stone) | `Process(in)`, `SetDryWet/Color/Feedback/LFOfreq()` |
| `ctagSPphaser` | Phaser (Guitarix) | `Process(in)`, mono + stereo modes |

#### Mutable Instruments FX (`components/ctagSoundProcessor/mifx/`)

| Class | Buffer Size | Key Methods |
|---|---|---|
| `Chorus` | 8 KB | `Process(buf, n)`, `set_amount/depth()` |
| `Ensemble` | 16 KB | `Process(L, R, n)`, `set_amount/depth()` |
| `Diffuser` | 32 KB | `Process(amount, rt, buf, n)` |
| `Reverb` | 84 KB | `Process(L, R, n)`, `set_amount/diffusion/lp/time()` |
| `Oliverb` | 84 KB | `Process(frame, n)`, `set_*()` including pitch ratio |
| `PitchShifter` | 16 KB | `Process(frame)`, `set_ratio/size()` |
| `PitchShifterMono` | 8 KB | `Process(buf, n)`, `set_ratio/size()` |
| `RandomOscillator` | 0 | `Next()`, `set_slope()` |

#### Reverbs (`components/ctagSoundProcessor/freeverb/`, `freeverb3/`, `gverb/`)

| Class | Type | Buffer Size |
|---|---|---|
| `revmodel` (freeverb) | Schroeder reverb | 8 comb + 4 AP per channel |
| `progenitor_f` (freeverb3) | Griesinger Progenitor | Large (quality reverb) |
| `strev_f` (freeverb3) | Simple Tank Reverb | Medium |
| `ty_gverb` | FDN reverb (C API) | 4th-order FDN |

#### Dynamics (`components/ctagSoundProcessor/SimpleComp/`)

| Class | Type |
|---|---|
| `SimpleComp` | Compressor (peak/RMS) |
| `SimpleGate` | Noise gate |
| `SimpleLimit` | Brickwall limiter |

#### Airwindows (`components/ctagSoundProcessor/airwindows/`)

| Class | Type |
|---|---|
| `CStrip` / `CStripM` | Channel strip (3-band EQ + gate + comp) |
| `EChorus` | Ensemble chorus (1-4 stages) |
| `EveryTrim` | Stereo gain/balance utility |
| `TDelay` | Mono delay |

#### External Libraries (via submodules)

| Library | Content |
|---|---|
| **Mutable Instruments** (`components/mutable/`) | `MacroOscillator2` (Plaits), `Svf`, Rings resonator, plus full MI eurorack DSP |
| **Moog Ladders** (`components/moog/`) | Multiple Moog ladder filter implementations |
| **ESP-DSP** (`simulator/esp-dsp/`) | FIR, IIR biquad, FFT, dot products, windowing |

**Total available building blocks: ~60+ classes** ready to be wrapped as patcher nodes.

---

## Summary

The TBD Patcher is a **feasible and well-scoped** project that leverages:

- **60+ existing DSP building blocks** — no new DSP algorithms needed for the core library
- **Proven architecture pattern** — Pure Data's interpreted graph model, not Axoloti's compile-and-upload
- **LiteGraph.js** — zero-dependency, Canvas2D-rendered, audio-aware, ComfyUI-proven node editor
- **Existing infrastructure** — plugin system, REST API, WebUI serving, simulator, memory allocator
- **ESP32-P4 headroom** — ~1.3% CPU overhead for graph execution; 84%+ headroom for typical patches

**Minimum viable prototype: ~3-4 weeks. Full-featured patcher: ~10-12 weeks.**
