# TBD Patcher — Visual Patching Sound Engine (v2)

> A Pure Data / Axoloti-style visual patching environment for CTAG TBD,
> enabling real-time graph-based sound design without compilation — spanning
> both the ESP32-P4 DSP engine **and** an RP2350 App for hardware-native
> patch navigation, macro control, and sequencing.

**Status:** Concept / Feasibility Study — v2
**Date:** 2026-02-21
**Supersedes:** [concept-patcher-plugin-v1.md](concept-patcher-plugin-v1.md)
**Related docs:**
[WEBUI-SYNTHESIS.md](../sample_rom/sample_manager/WEBUI-SYNTHESIS.md),
[WEBUI-HARDWARE-UI-SYNTHESIS.md](../sample_rom/sample_manager/WEBUI-HARDWARE-UI-SYNTHESIS.md),
[WEBUI-UNIFIED-FORMAT-AND-TYPES.md](../sample_rom/sample_manager/WEBUI-UNIFIED-FORMAT-AND-TYPES.md)

---

## Table of Contents

1.  [What Changed in v2](#1-what-changed-in-v2)
2.  [Motivation & Vision](#2-motivation--vision)
3.  [Prior Art Comparison](#3-prior-art-comparison)
4.  [System Architecture — Two Processors, One Instrument](#4-system-architecture--two-processors-one-instrument)
5.  [Layer 1 — Graph Runtime Engine (ESP32-P4, C++)](#5-layer-1--graph-runtime-engine-esp32-p4-c)
6.  [Layer 2 — RP2350 Patcher App](#6-layer-2--rp2350-patcher-app)
7.  [Layer 3 — REST API Extensions](#7-layer-3--rest-api-extensions)
8.  [Layer 4 — WebUI Patcher (Browser)](#8-layer-4--webui-patcher-browser)
9.  [Node Library — DSP Building Blocks](#9-node-library--dsp-building-blocks)
10. [Control Surface Integration](#10-control-surface-integration)
11. [Memory Architecture](#11-memory-architecture)
12. [ESP32-P4 Resource Budget](#12-esp32-p4-resource-budget)
13. [Patch Format Specification](#13-patch-format-specification)
14. [Simulator Support](#14-simulator-support)
15. [Integration with Existing TBD Architecture](#15-integration-with-existing-tbd-architecture)
16. [Development Roadmap](#16-development-roadmap)
17. [Open Questions & Decisions](#17-open-questions--decisions)
18. [Appendix A — Full DSP Building Block Inventory](#appendix-a--full-dsp-building-block-inventory)
19. [Appendix B — RP2350 App vs. Groovebox Comparison](#appendix-b--rp2350-app-vs-groovebox-comparison)

---

## 1. What Changed in v2

v1 focused exclusively on the ESP32-P4 DSP plugin and a browser-only WebUI. v2 incorporates
everything we now know about the TBD-16's dual-processor architecture, the App system, the
Control Surface concept, and the hardware UI.

| Topic | v1 | v2 |
|-------|----|----|
| **RP2350 involvement** | None — patcher was browser-only | Dedicated RP2350 Patcher App for hardware-native control |
| **Hardware UI** | Not considered | 4 knobs + OLED + buttons for patch navigation, node param editing, macro pages |
| **MIDI integration** | Vague ("Phase 3") | Concrete: MIDI learn on macro controls, CC-to-node-param mapping, clock sync |
| **Control Surface layer** | Not aware of it | Patches generate Control Surface definitions for the hardware UI |
| **App system** | Not aware of it | Patcher is a full App (RP2350 .uf2 + ESP32-P4 Patcher plugin) in the boot menu |
| **Sequencer possibility** | Not discussed | Explored: step sequencer nodes for triggering, pattern-based patching |
| **Macro / preset system** | Not discussed | Patches expose macro pages (4 knobs per page) for hardware control |
| **Kit format** | Not discussed | Patcher patches integrate with the Kit save/load system |
| **WebUI library** | LiteGraph.js recommended | LiteGraph.js confirmed — now also designs the companion hardware view |

### Why the RP2350 Matters for the Patcher

v1 assumed the patcher would be used exclusively through the browser. This is wrong for two reasons:

1. **Performance context.** The TBD-16 is a performance instrument. Opening a laptop to adjust
   patch parameters breaks the flow. The 4 knobs, 30 buttons, and OLED must provide meaningful
   control over a running patch.

2. **The App system exists.** Every TBD-16 App is an RP2350 firmware that controls the ESP32-P4
   via SPI. The Groovebox App drives PicoSeqRack; the Multi Effect App drives individual plugins.
   The Patcher needs its own App to drive the Patcher plugin — otherwise it's the only plugin
   that requires a laptop to use.

---

## 2. Motivation & Vision

### The Problem

CTAG TBD currently offers 56+ monolithic sound processor plugins. Each is a self-contained C++
class that must be compiled into the firmware. Users select pre-built plugins and tweak their
exposed parameters — they cannot create new signal flow topologies without writing C++ code
and recompiling.

### The Vision

Build a **visual patching plugin** that lets users:

- **Drag & drop** DSP nodes (oscillators, filters, envelopes, effects) onto a canvas
- **Connect** nodes with virtual cables (audio, control, trigger signals)
- **Tweak** parameters in real-time via knobs on each node
- **Save/load** patches as JSON presets
- **Hear changes instantly** — no compilation, no firmware upload, no restart
- **Control patches from hardware** — navigate nodes, tweak parameters, and trigger
  events using the TBD-16's physical controls, even without a browser open
- **Define macros** — expose a curated set of high-level controls (4 per page) for
  live performance, exactly like the Groovebox's parameter pages

This brings the creative freedom of Pure Data, Max/MSP, and Axoloti/Ksoloti directly
into TBD's browser-based interface and hardware UI simultaneously.

### Key Differentiator from Axoloti/Ksoloti

| Feature | Axoloti / Ksoloti | TBD Patcher (Proposed) |
|---|---|---|
| Editing | Java desktop app | Browser-based WebUI |
| Patching | Offline → compile → upload | **Real-time, no compilation** |
| Runtime | Generated C code on STM32 | Interpreted graph engine on ESP32-P4 |
| Object system | XML objects with inline C/C++ | Pre-compiled node library (like Pd) |
| User-written DSP code | Yes (inline C) | No (fixed node set, extensible in firmware) |
| Hardware access | USB only | WiFi WebUI **+ dedicated hardware UI** |
| Live performance | Limited | **4-knob macro pages, step buttons, MIDI** |
| Hardware control | None (desktop-only) | **OLED + knobs + buttons via RP2350 App** |

The trade-off: we sacrifice the ability to write arbitrary inline C code (Axoloti's strength)
in exchange for **instant patching without compilation** (Pure Data's strength) and
**hardware-native performance control** (neither Pd nor Axoloti offers this).

---

## 3. Prior Art Comparison

### Pure Data (Pd)

- **Runtime model:** Interpreter with a fixed set of "tilde objects" (~osc, ~dac, etc.)
- **Signal flow:** Audio computed block-wise (default 64 samples), control messages asynchronous
- **Patch format:** Text-based `.pd` files
- **Key insight:** The object library is pre-compiled; patches wire them together at runtime
- **Relevance:** Our architecture directly mirrors this: pre-compiled C++ nodes, runtime graph wiring

### Axoloti / Ksoloti

- **Runtime model:** XML object definitions containing inline C code → cross-compiled → binary uploaded
- **Object format:** `.axo` XML with `<inlets>`, `<outlets>`, `<params>`, `<code.krate>`, `<code.srate>`
- **Two processing rates:** `k-rate` (once per block) and `s-rate` (per sample)
- **Object categories:** `audio`, `const`, `conv`, `ctrl`, `delay`, `demux`, `disp`, `dist`, `dyn`, `edrum`, `env`, `filter`, `fx`, `gain`, `gpio`, `harmony`, `kfilter`, `lfo`, `logic`, `math`, `midi`, `mix`, `mux`, `noise`, `osc`, `patch`, `pulse`, `rand`, `reverb`, `script`, `sel`, `seq`, `spat`, `spectral`, `stomps`, `string`, `table`, `timer`, `usb`, `wave`
- **Key insight:** The category structure and I/O typing system are excellent UI/UX references
- **Relevance:** We adopt the category structure and typed-port concept but skip compilation

### Elektron Machines (Hardware UI Reference)

- **Relevant to v2:** The Elektron paradigm (4 knobs → one page of params, pages navigated with arrows) is exactly the TBD-16's hardware model
- **Parameter locks:** Elektron's "p-locks" per step = our potential step-sequencer node with per-step overrides
- **Kits:** Complete machine state saved as one file — maps directly to our Kit format
- **Key insight:** The hardware UI constraint (4 knobs) is a *design feature*, not a limitation

### Max/MSP

- **Commercial, closed-source, desktop-only**
- **Key insight:** The "hot/cold inlet" concept and right-to-left evaluation order
- **Relevance:** Inspiration for UX patterns; our graph uses topological sort instead

---

## 4. System Architecture — Two Processors, One Instrument

This is the critical addition in v2. The patcher is not just a plugin — it's a
**full TBD-16 App** spanning both processors:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  Browser (WebUI) — DESIGN TIME                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  LiteGraph.js Patcher Canvas                                        │ │
│  │                                                                      │ │
│  │  ┌──────┐   ┌──────┐   ┌───────┐   ┌──────┐                        │ │
│  │  │OscSaw├──►│ SVF  ├──►│  VCA  ├──►│Output│                        │ │
│  │  └──────┘   └──▲───┘   └──▲────┘   └──────┘                        │ │
│  │                │          │                                          │ │
│  │  ┌──────┐   ┌──┴───┐   ┌─┴────┐                                    │ │
│  │  │ LFO  ├──►│Scale │   │ ADSR │                                    │ │
│  │  └──────┘   └──────┘   └──────┘                                    │ │
│  │                                                                      │ │
│  │  ┌─ Macro Page Editor ──────────────────────────────────────┐       │ │
│  │  │  Page "FILTER":  Cutoff  Reso   FType   EGAmt           │       │ │
│  │  │  Page "OSC":     Pitch   Shape  Detune  PW              │       │ │
│  │  └──────────────────────────────────────────────────────────┘       │ │
│  └──────────┬────────────────────────┬──────────────────────────────────┘ │
│             │ REST API               │                                    │
│             ▼                        ▼                                    │
│    POST /patcher/patch         POST /patcher/param                       │
└─────────────┬────────────────────────┬────────────────────────────────────┘
              │ WiFi / HTTP            │
┌─────────────▼────────────────────────▼────────────────────────────────────┐
│  ESP32-P4 — DSP ENGINE                                                    │
│                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  ctagSoundProcessorPatcher  (runs on Core 1, audio ISR)            │  │
│  │                                                                     │  │
│  │  PatchGraph (double-buffered, atomic swap)                          │  │
│  │  Sorted Node List → process(32 samples) each                       │  │
│  └──────────────────────────────┬──────────────────────────────────────┘  │
│                                 │ SPI slave                               │
├─────────────────────────────────┼─────────────────────────────────────────┤
│  RP2350 — PATCHER APP           │ SPI master                              │
│                                 ▼                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │  Patcher App firmware (.uf2)                                        │  │
│  │                                                                     │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │  │
│  │  │ Macro Page   │  │ Node Browser │  │ Step Sequencer           │  │  │
│  │  │ Navigation   │  │ & Selector   │  │ (optional, see §6.4)    │  │  │
│  │  │              │  │              │  │                          │  │  │
│  │  │ 4 knobs →    │  │ Scroll/      │  │ 16 step buttons →       │  │  │
│  │  │ macro params │  │ select nodes │  │ trigger patterns        │  │  │
│  │  │ OLED shows:  │  │ from OLED    │  │                          │  │  │
│  │  │ page + vals  │  │ list         │  │                          │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────────┘  │  │
│  │                                                                     │  │
│  │  MIDI In/Out ←→ Node params / triggers / clock                     │  │
│  │  Ableton Link ←→ Clock nodes                                       │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                                                           │
│  30 buttons · 4 encoders · OLED 128×64 · 19 RGB LEDs · 4× MIDI          │
└───────────────────────────────────────────────────────────────────────────┘
```

### Information Flow

| Direction | What | How |
|-----------|------|-----|
| **Browser → P4** | New patch graph, node param changes | REST API over WiFi |
| **P4 → Browser** | Current patch state, CPU usage | REST API response |
| **RP2350 → P4** | Macro param changes, node triggers, MIDI data | SPI bus (existing protocol) |
| **P4 → RP2350** | Patch metadata (node list, macro pages), status | SPI bus (extended) |
| **Browser → RP2350** | (indirect, via P4) | No direct link needed |
| **MIDI → RP2350** | Note on/off, CC, clock | USB/TRS MIDI hardware |
| **RP2350 → MIDI** | Clock out, CC feedback | USB/TRS MIDI hardware |

### What the RP2350 Does NOT Do

The RP2350 does **not** run the patch graph, process audio, or parse the full LiteGraph JSON.
It receives a **compact summary** of the patch from the P4:

- Macro page definitions (name + 4 param names/values per page)
- Flat list of exposed node names (for browsing)
- Current values for the selected node's params (for direct editing)

This keeps the RP2350 firmware simple and ensures the P4 remains the single source of truth
for the patch.

---

## 5. Layer 1 — Graph Runtime Engine (ESP32-P4, C++)

### 5.1 Core Classes

#### `PatchNode` — Base class for all patchable DSP objects

```cpp
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
    float* getInputBuffer(int port);
    float  getControlValue(int port);
    bool   getTriggerValue(int port);
    float* getOutputBuffer(int port);
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

    // Macro metadata — which macro page/slot this param is exposed on
    struct MacroBinding {
        int pageIndex;         // -1 = not exposed
        int slotIndex;         // 0..3 (which of the 4 knobs)
        std::string displayName; // short name for OLED (max 10 chars)
        std::string unit;      // "Hz", "ms", "%", etc.
    };
    std::vector<MacroBinding> macroBindings; // parallel to params

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

    // Macro page system — generated from node MacroBindings
    struct MacroPage {
        std::string name;                    // "FILTER", "OSC", etc.
        struct Slot {
            int nodeId;
            int paramIdx;
            std::string displayName;
            std::string unit;
            float minVal, maxVal, currentVal;
        };
        Slot slots[4];
    };
    std::vector<MacroPage> macroPages;

    // Serialize current state to JSON
    std::string toJSON() const;

    // Generate compact summary for RP2350
    std::string toMacroSummaryJSON() const;

private:
    bool topologicalSort();
    void allocateBuffers();
    void buildMacroPages();  // extract macro page info from node bindings

    std::vector<PatchNode*> nodes_;
    std::vector<int>        execOrder_;
    float*                  bufferPool_;
    float                   sampleRate_;
    int                     blockSize_;
    void* memBase_;
    size_t memSize_, memUsed_;
};
```

#### `ctagSoundProcessorPatcher` — The plugin wrapper

```cpp
class ctagSoundProcessorPatcher : public ctagSoundProcessor {
public:
    void Init(std::size_t blockSize, void* blockPtr) override;
    void Process(const ProcessData& data) override;

    // Called by REST API (Core 0) or SPI API
    void setPatch(const char* json, size_t len);
    std::string getPatch() const;
    void setNodeParam(int nodeId, int paramIdx, float value);

    // Macro page access (for RP2350 hardware UI)
    int getMacroPageCount() const;
    const PatchGraph::MacroPage& getMacroPage(int index) const;
    void setMacroParam(int pageIndex, int slotIndex, float value);

private:
    void knowYourself() override;

    PatchGraph* activeGraph_;
    PatchGraph* pendingGraph_;
    std::atomic<bool> swapPending_;
    float* psramBuffer_;
    size_t psramSize_;
};
```

### 5.2 Signal Types

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

### 5.3 Graph Execution

```
On each audio ISR call (every 32 samples, ~0.73 ms):

1. Check swapPending_ flag
   → If true: swap activeGraph_ ↔ pendingGraph_, clear flag

2. Copy ProcessData.cv[] and ProcessData.trig[] into I/O nodes

3. Read SPI control data (RP2350 macro knob changes, MIDI triggers)
   → Apply to mapped node params

4. For each node in topological order:
   a. Resolve input connections
   b. Apply CV/trig overrides if mapped
   c. Call node->process(32)

5. Copy final output node buffers to ProcessData.buf[]
```

### 5.4 Graph Hot-Swap (Zero-Glitch)

```
Core 0 (HTTP/SPI thread):               Core 1 (Audio ISR):

1. Receive new patch JSON                ┃  processing activeGraph_
2. Allocate new PatchGraph from          ┃
   secondary memory pool                 ┃
3. Build & validate graph                ┃
4. Topological sort                      ┃
5. Allocate buffers                      ┃
6. Extract macro pages                   ┃
7. Store as pendingGraph_                ┃
8. Set swapPending_ = true               ┃
9. ─────────────────────────────────────►┃  sees swapPending_
                                         ┃  swaps pointers
                                         ┃  continues with new graph
10. Send updated macro summary           ┃
    to RP2350 via SPI                    ┃
```

---

## 6. Layer 2 — RP2350 Patcher App

### 6.1 Why a Dedicated App?

Every meaningful TBD-16 use case has its own RP2350 App:

| App | RP2350 firmware | ESP32-P4 plugin | What the RP2350 does |
|-----|-----------------|-----------------|----------------------|
| **Groovebox** | `tbd-pico-seq3` | PicoSeqRack | 16-track step sequencer, pattern management, per-track sound editing |
| **Multi Effect** | plugin browser fw | Any plugin | Plugin browsing, param editing via 4 knobs, preset recall |
| **MCL** | MCL firmware | Link provider | MIDI sequencing for external gear |
| **Patcher** ← NEW | `patcher.uf2` | ctagSoundProcessorPatcher | Macro page navigation, node browsing, step sequencer, MIDI routing |

Without a Patcher App, the user would have to:
1. Boot into Multi Effect App
2. Select the "Patcher" plugin
3. Open a laptop browser
4. Use only the browser for all interaction

With a Patcher App, they get dedicated hardware screens for the most common operations.

### 6.2 Hardware UI Screens

The Patcher App organizes the OLED into screens, navigable via the 5 MCL buttons:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  MACRO PAGE SCREEN (default)                                        │
│  ──────────────────────────────                                     │
│  Shows the current macro page: name + 4 parameter slots             │
│  K1–K4 control the 4 macro parameters                              │
│  Up/Down arrows navigate between macro pages                        │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  PATCHER · "My Synth"          FILTER           ▲  2/5  ▼ │     │
│  ├────────────┬────────────┬────────────┬────────────┤       │     │
│  │  CUTOF     │  RESO      │  FTYPE     │  EGAMT     │       │     │
│  │  ◎ 880 Hz  │  ◎ 24%    │  LP        │  ◎ +32     │       │     │
│  └────────────┴────────────┴────────────┴────────────┘       │     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  NODE BROWSER SCREEN (hold button to enter)                         │
│  ──────────────────────────────                                     │
│  Lists all nodes in the current patch by name                       │
│  Scroll with K1 encoder, press K1 to select a node                 │
│  Selecting a node enters NODE EDIT SCREEN                           │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  NODES (12)                                         ▲▼    │     │
│  │  ► OscSaw [osc]                                           │     │
│  │    SVF Filter [filter]                                    │     │
│  │    ADSR [env]                                             │     │
│  │    VCA [math]                                             │     │
│  │    LFO [lfo]                                              │     │
│  └────────────────────────────────────────────────────────────┘     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  NODE EDIT SCREEN (entered from Node Browser)                       │
│  ──────────────────────────────                                     │
│  Shows one node's parameters, 4 at a time                          │
│  K1–K4 adjust params, Up/Down paginate                             │
│  Same layout as Groovebox's sound parameter screen                 │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐     │
│  │  SVF Filter                                  ▲  1/1  ▼   │     │
│  ├────────────┬────────────┬────────────┬────────────┤       │     │
│  │  FREQ      │  RESO      │  (empty)   │  (empty)   │       │     │
│  │  ◎ 2000    │  ◎ 0.50   │            │            │       │     │
│  └────────────┴────────────┴────────────┴────────────┘       │     │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PATCH BROWSER SCREEN (hold another button)                         │
│  ──────────────────────────────                                     │
│  Lists saved patches by name                                       │
│  Load/save patches from SD card                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 Macro Pages — The Bridge Between Browser and Hardware

Macro pages are the key concept that connects the browser patcher canvas to the
hardware's 4-knob paradigm. They solve the fundamental problem:

> A patch with 30 nodes might have 80+ parameters. The hardware has 4 knobs.
> How do you make a patch playable?

**The answer: the patch author defines macro pages in the browser.**

In the WebUI, the patch author creates macro pages by assigning node parameters to
macro slots:

```
┌─ Macro Page Editor (in LiteGraph.js panel) ─────────────────┐
│                                                               │
│  Page 1: "FILTER"                                            │
│    K1: SVF.frequency  → display "CUTOF"  unit "Hz"          │
│    K2: SVF.resonance  → display "RESO"   unit "%"           │
│    K3: (empty)                                               │
│    K4: ADSR.decay     → display "EGDCY"  unit "ms"          │
│                                                               │
│  Page 2: "OSC"                                               │
│    K1: OscSaw.frequency → display "PITCH" unit "Hz"         │
│    K2: OscSaw.pw        → display "PW"    unit "%"          │
│    K3: LFO.frequency    → display "LRATE" unit "Hz"         │
│    K4: LFO.depth        → display "LDPTH" unit "%"          │
│                                                               │
│  [+ Add Page]                                                │
└───────────────────────────────────────────────────────────────┘
```

These macro bindings are stored in the patch JSON. When the patch is loaded on the P4:
1. The `PatchGraph` extracts `macroPages` from the node bindings
2. The macro page summary is sent to the RP2350 via SPI
3. The RP2350 renders the macro page screen
4. When the user turns K2, the RP2350 sends `setMacroParam(page=0, slot=1, value=...)` via SPI
5. The P4 maps this to `SVF.resonance` and updates the node param

**If a patch has no macro pages defined**, the RP2350 Patcher App falls back to a
flat list of all nodes — the user can browse nodes and edit params directly (Node
Browser + Node Edit screens). This is fine for exploration; macro pages are for
performance-ready patches.

### 6.4 Step Sequencer — Can It Work?

This is the question v2 must address: **can the Patcher App include a step sequencer?**

#### What We Have

- 16 step buttons on the TBD-16
- Transport buttons (play, stop, record)
- The Groovebox already uses the step buttons for pattern sequencing
- The RP2350 has plenty of CPU for a simple step sequencer (150 MHz Cortex-M33)

#### Option A: Dedicated `seq/StepSeq` Node in the Graph

A step sequencer node in the patch graph:

```
┌───────────────────────────────┐
│  StepSeq                      │
│                               │
│  Inputs:                      │
│    clock (T)  — external tick │
│    reset (T)  — return to 1   │
│                               │
│  Outputs:                     │
│    gate (T)   — step active   │
│    accent (C) — accent level  │
│    pitch (C)  — step pitch    │
│                               │
│  Properties:                  │
│    steps: 16                  │
│    pattern: [1,0,0,1,...]     │
│                               │
│  Hardware mapping:            │
│    16 step buttons → pattern  │
│    LEDs show pattern state    │
└───────────────────────────────┘
```

The RP2350 drives the step buttons and LEDs; the actual sequencer logic runs on the P4
as a node in the graph. The RP2350 sends step state toggles via SPI.

**Pros:**
- Sequencer is part of the patch — saved/loaded with the patch JSON
- Multiple sequencer nodes possible (polyrhythm, poly-meter)
- WebUI can show step pattern visually
- Consistent with the "everything is a node" philosophy

**Cons:**
- Step state changes go RP2350 → SPI → P4 → node, which adds latency (~1 SPI cycle ≈ 0.7ms)
- For tight timing, the clock should run on the P4, not the RP2350

#### Option B: RP2350-Side Sequencer (Like Groovebox)

The sequencer runs entirely on the RP2350, as it does in the Groovebox App. It sends
trigger/note messages to the P4 via SPI, which the Patcher plugin receives as control data.

**Pros:**
- Zero-latency button response (RP2350 handles buttons directly)
- Proven architecture (Groovebox does exactly this)
- RP2350 can do tight MIDI clock sync

**Cons:**
- Sequencer is not part of the patch JSON — it's a separate RP2350 state
- Multiple independent sequencers harder to manage
- Sequencer patterns stored on RP2350 SD card, not in the patch

#### Recommendation: Node-Based (Option A) with RP2350 Transport

Use a **hybrid approach**:

1. **Clock and trigger generation** happen on the P4 as graph nodes (`logic/Clock`, `seq/StepSeq`)
2. **Step button input** is forwarded by the RP2350 to the P4 via SPI as step toggle commands
3. **LED feedback** is sent from the P4 to the RP2350 (current step position, active steps)
4. **Transport** (play/stop) is handled by the RP2350, forwarded as triggers to Clock nodes
5. **MIDI clock** drives Clock nodes directly (RP2350 forwards clock ticks via SPI)
6. **Ableton Link** provides tempo via the ESP32-P4 (existing infrastructure)

This keeps the sequencer *in the patch* while leveraging the RP2350 for low-latency button
input and visual feedback. The SPI latency (~0.7ms) is acceptable because the step buttons
toggle step *patterns*, not real-time triggers — the actual trigger timing comes from the
Clock node on the P4.

### 6.5 MIDI Integration

The Patcher App handles MIDI the same way as the Multi Effect App:

| MIDI Message | RP2350 Action | P4 Action |
|--------------|---------------|-----------|
| **Note On/Off** | Forward raw to P4 | Route to `midi/NoteIn` node if present |
| **CC** | Map to macro param if MIDI learn active, else forward raw | Route to `midi/CCIn` node or mapped node param |
| **Clock** | Forward ticks | Drive `logic/Clock` node sync input |
| **Start/Stop** | Forward | Drive `logic/Clock` start/stop |
| **Program Change** | Load patch preset N | — |
| **Pitch Bend** | Forward raw | Route to `midi/PitchBend` node |

**MIDI Learn on Macros:**

The RP2350 Patcher App supports MIDI Learn on macro parameters:
1. User holds MIDI Learn button + turns K2 (selecting macro slot)
2. User sends a CC from their MIDI controller
3. RP2350 stores the mapping: `CC 74 → Macro Page 0, Slot 1`
4. From now on, CC 74 directly controls the macro param (RP2350 → SPI → P4)

This mapping is stored per-patch or globally, user's choice.

### 6.6 SPI Protocol Extensions for Patcher

The existing SPI API (see `main/SpiAPI.hpp`) already supports all the primitives we need:

| Existing SPI Command | Patcher Use |
|---|---|
| `SetPluginParam` (0x05) | Set a node parameter (encode as `param_id = "n{nodeId}_p{paramIdx}"`) |
| `SetActivePlugin` (0x04) | Load the Patcher plugin |
| `SetPluginParamsJSON` (0x14) | Bulk update of node params or full patch upload |
| `LoadPreset` (0x0B) | Load a patcher preset |
| `SavePreset` (0x0C) | Save the current patch as a preset |

**New SPI commands needed** (extending the `RequestType` enum):

| Command | ID | Args | Response | Purpose |
|---|---|---|---|---|
| `GetMacroPages` | 0x30 | — | JSON: `[{name, slots: [{name, val, min, max, unit}]}]` | RP2350 fetches macro page layout |
| `SetMacroParam` | 0x31 | `{page, slot, value}` | `{ok}` | RP2350 sends knob change for a macro |
| `GetNodeList` | 0x32 | — | JSON: `[{id, type, name}]` | RP2350 fetches flat node list for browsing |
| `GetNodeParams` | 0x33 | `{nodeId}` | JSON: `[{name, val, min, max}]` | RP2350 fetches params for one node |
| `SetStepPattern` | 0x34 | `{nodeId, steps: [bool×16]}` | `{ok}` | RP2350 sends step button pattern |
| `GetStepState` | 0x35 | `{nodeId}` | `{currentStep, pattern, playing}` | P4 returns current sequencer state |
| `SetLEDFeedback` | 0x36 | — | `{leds: [color×19]}` | P4 tells RP2350 how to light LEDs |

The SPI protocol is already JSON-based (cstring serialization), so these extensions fit
naturally into the existing architecture.

---

## 7. Layer 3 — REST API Extensions

### New Endpoints

All under `/api/v1/patcher/` — operating on whichever channel has the Patcher plugin active.

| Endpoint | Method | Body | Response | Purpose |
|---|---|---|---|---|
| `nodeTypes` | GET | — | `[{id, name, category, inputs, outputs, params}]` | List all available node types |
| `patch` | GET | — | `{nodes, connections, macroPages}` | Get current patch graph as JSON |
| `patch` | POST | Patch JSON | `{ok: true}` or `{error: "..."}` | Replace entire patch (triggers hot-swap) |
| `param` | POST | `{nodeId, paramIdx, value}` | `{ok: true}` | Update single node param |
| `macro` | POST | `{page, slot, value}` | `{ok: true}` | Update via macro binding |
| `macroPages` | GET | — | `[{name, slots}]` | Get macro page definitions |
| `macroPages` | POST | `[{name, slots}]` | `{ok: true}` | Update macro page definitions |
| `presets` | GET | — | `[{name, number}]` | List saved patches |
| `presets/save` | POST | `{name, number}` | `{ok: true}` | Save current patch |
| `presets/load` | POST | `{number}` | Patch JSON | Load patch preset |
| `cpu` | GET | — | `{used, budget, perNode: [{id, cycles}]}` | CPU usage per node |

### Compatibility

These new endpoints coexist with all existing `/api/v1/` endpoints. The patcher is
activated via `setActivePlugin?id=Patcher`, and the main WebUI continues to work.

---

## 8. Layer 4 — WebUI Patcher (Browser)

### 8.1 Library Choice: LiteGraph.js

**Confirmed:** [LiteGraph.js](https://github.com/jagenjo/litegraph.js) by Javi Agenjo

| Criterion | LiteGraph.js | Drawflow | Rete.js |
|---|---|---|---|
| **Dependencies** | **None (vanilla JS)** | **None (vanilla JS)** | React/Vue/Angular **required** |
| **Bundle size** | ~200 KB (single file) | ~12 KB min+gz | ~50 KB core + renderer |
| **Rendering** | **Canvas2D** | DOM/SVG | DOM (framework) |
| **Typed ports** | **Yes (color-coded)** | No | Yes |
| **Built-in audio nodes** | **Yes** (WebAudio) | No | No |
| **Graph engine** | **Yes** | No | Yes |
| **Subgraphs** | **Yes** | No (modules) | Yes |
| **Search box** | **Yes** | No | Plugin |
| **ComfyUI proven** | **Yes** | No | No |
| **License** | MIT | MIT | MIT |

#### Why LiteGraph.js wins:

1. **Single vanilla JS file, zero dependencies** — matches TBD's no-framework approach
2. **Canvas2D rendering** — lighter than DOM-based node rendering
3. **Already has audio node types** — proving the architecture works for audio
4. **Typed, color-coded ports** — Audio (yellow) vs Control (blue) vs Trigger (green)
5. **Node widgets** — inline sliders, combo boxes, toggles
6. **Subgraphs** — encapsulate sub-patches (like Pd abstractions)
7. **ComfyUI validation** — battle-tested with hundreds of custom nodes

### 8.2 Macro Page Editor

v2 adds a **Macro Page Editor panel** to the browser UI. This is a side panel or bottom
panel alongside the LiteGraph canvas:

```
┌────────────────────────────────────────────┬─────────────────────────┐
│                                            │  MACRO PAGES            │
│  LiteGraph.js Canvas                       │                         │
│                                            │  Page 1: FILTER         │
│  ┌──────┐   ┌──────┐   ┌───────┐          │  K1: SVF.freq  "CUTOF"  │
│  │OscSaw├──►│ SVF  ├──►│  VCA  │          │  K2: SVF.reso  "RESO"   │
│  └──────┘   └──▲───┘   └──▲────┘          │  K3: [drag here]        │
│               │          │                 │  K4: ADSR.decay "EGDCY" │
│  ┌──────┐   ┌──┴───┐   ┌─┴────┐          │                         │
│  │ LFO  ├──►│Scale │   │ ADSR │          │  Page 2: OSC            │
│  └──────┘   └──────┘   └──────┘          │  K1: Saw.freq  "PITCH"  │
│                                            │  K2: Saw.pw    "PW"    │
│              ┌──────────┐                  │  K3: LFO.rate  "LRATE" │
│              │  AudioOut│                  │  K4: [drag here]        │
│              └──────────┘                  │                         │
│                                            │  [+ Add Page]           │
│                                            │                         │
│  ┌─ Hardware Preview ────────────────────┐ │  ┌─ MIDI Learn ──────┐ │
│  │  PATCHER · FILTER        ▲ 1/2 ▼     │ │  │  K1: CC --         │ │
│  │  CUTOF   RESO   ---    EGDCY         │ │  │  K2: CC --         │ │
│  │  880Hz   24%          120ms          │ │  │  K3: CC --         │ │
│  └───────────────────────────────────────┘ │  │  K4: CC 74         │ │
│                                            │  └────────────────────┘ │
└────────────────────────────────────────────┴─────────────────────────┘
```

The **Hardware Preview** shows a miniature representation of what the OLED will display
for the current macro page — giving the patch author direct feedback on the hardware
experience.

**Drag-and-drop binding:** The user drags a node's parameter widget from the canvas into
a macro slot. The macro slot records the `{nodeId, paramIdx, displayName, unit}` binding.

### 8.3 Communication Flow

```
User drags cable / changes param / edits macro page
        │
        ▼
LiteGraph event handler
        │
        ├─── connectionCreated/connectionRemoved ──►  Debounce 200ms
        │                                              then POST full patch JSON
        │                                              to /api/v1/patcher/patch
        │
        ├─── widget value changed ──────────────────►  Immediate POST single param
        │                                              to /api/v1/patcher/param
        │
        └─── macro page edited ──────────────────────► POST to /api/v1/patcher/macroPages
                                                       (P4 updates RP2350 via SPI)
```

### 8.4 File Structure

```
sdcard_image/www/
├── index.html          (existing — add link to patcher)
├── main.html           (existing)
├── edit.html           (existing)
├── patcher.html        ← NEW: Patcher canvas + macro editor
├── js/
│   ├── litegraph.min.js    ← LiteGraph library (~200KB → ~55KB gzipped)
│   └── tbd-patcher.js      ← TBD custom node types + macro editor + REST comm
├── css/
│   └── litegraph.css       ← LiteGraph styles (~15KB)
└── ... (existing files)
```

---

## 9. Node Library — DSP Building Blocks

### 9.1 Category Structure

#### `io/` — Audio & CV I/O

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **AudioIn** | — | `left` (A), `right` (A) | — | `ProcessData.buf` input |
| **AudioOut** | `left` (A), `right` (A) | — | `gain` | `ProcessData.buf` output |
| **CVIn** | — | `cv0-3` (C), `trig0-1` (T) | — | `ProcessData.cv[]` |
| **Knob** | — | `out` (C) | `value`, `min`, `max` | Constant value source |

#### `osc/` — Oscillators

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **Sine** | `freq` (C), `fm` (A) | `out` (A) | `frequency` | `ctagSineSource` |
| **Saw** | `freq` (C) | `out` (A) | `frequency`, `pw` | PolyBLEP |
| **Square** | `freq` (C) | `out` (A) | `frequency`, `pw` | PolyBLEP |
| **Triangle** | `freq` (C) | `out` (A) | `frequency` | Custom |
| **MacroOsc** | `freq` (C), `timbre` (C), `color` (C), `morph` (C) | `out` (A), `aux` (A) | `shape`, `frequency` | MI Plaits |
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
| **SVF** | `in` (A), `freq` (C), `reso` (C) | `lp` (A), `bp` (A), `hp` (A) | `frequency`, `resonance` | `stmlib::Svf` |
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
| **FreeVerb** | `in` (A) | `left` (A), `right` (A) | `size`, `damp`, `wet` | `revmodel` |
| **PlateReverb** | `in` (A) | `left` (A), `right` (A) | `time`, `diffusion`, `lp`, `amount` | MI `Reverb` |
| **Diffuser** | `in` (A) | `out` (A) | `amount`, `time` | MI `Diffuser` |

#### `fx/` — Effects

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **Chorus** | `left` (A), `right` (A) | `left` (A), `right` (A) | `amount`, `depth` | MI `Chorus` |
| **Ensemble** | `left` (A), `right` (A) | `left` (A), `right` (A) | `amount`, `depth` | MI `Ensemble` |
| **PitchShift** | `in` (A) | `out` (A) | `ratio`, `size` | `PitchShifterMono` |
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
| **Multiply** | `a` (A/C), `b` (A/C) | `out` (A/C) | — | VCA / ring mod |
| **Scale** | `in` (C) | `out` (C) | `min`, `max`, `curve` | `CVtranscoder` |
| **Invert** | `in` (A/C) | `out` (A/C) | — | `out = -in` |
| **Abs** | `in` (A/C) | `out` (A/C) | — | `out = |in|` |
| **Clamp** | `in` (A/C) | `out` (A/C) | `min`, `max` | Clipping |
| **SampleHold** | `in` (C), `trig` (T) | `out` (C) | — | Sample & Hold |
| **Slew** | `in` (C) | `out` (C) | `rise`, `fall` | Portamento |
| **Mix2** | `a` (A), `b` (A) | `out` (A) | `gainA`, `gainB` | 2-ch mixer |
| **Mix4** | `a-d` (A) | `out` (A) | `gainA-D` | 4-ch mixer |
| **Crossfade** | `a` (A), `b` (A), `mix` (C) | `out` (A) | `mix` | Equal-power |

#### `lfo/` — Low Frequency Oscillators

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **LFO** | `rate` (C), `reset` (T) | `sin` (C), `tri` (C), `saw` (C), `sqr` (C) | `frequency`, `shape`, `phase` | Custom |
| **RandomLFO** | `rate` (C) | `out` (C) | `slope` | MI `RandomOscillator` |

#### `logic/` — Logic & Control

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **Clock** | `bpm` (C), `sync` (T) | `beat` (T), `bar` (T) | `bpm`, `division` | Internal + Link sync |
| **Counter** | `trig` (T), `reset` (T) | `count` (C) | `max`, `direction` | Custom |
| **Toggle** | `trig` (T) | `out` (T) | — | Flip-flop |
| **Compare** | `a` (C), `b` (C) | `gt` (T), `eq` (T), `lt` (T) | `threshold` | Comparator |

#### `seq/` — Sequencer Nodes (NEW in v2)

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **StepSeq** | `clock` (T), `reset` (T) | `gate` (T), `accent` (C) | `steps`, `pattern[16]` | Step sequencer — **hardware step buttons drive pattern** |
| **StepPitch** | `clock` (T), `reset` (T) | `pitch` (C), `gate` (T) | `steps`, `notes[16]` | Melodic step sequencer |
| **Euclidean** | `clock` (T), `reset` (T) | `gate` (T) | `steps`, `hits`, `shift` | Euclidean rhythm generator |
| **Turing** | `clock` (T) | `gate` (T), `cv` (C) | `length`, `probability` | Turing machine |

These sequencer nodes are controllable from the RP2350's step buttons and LEDs, providing
a native hardware sequencer experience within the patcher.

#### `midi/` — MIDI I/O Nodes (NEW in v2)

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **NoteIn** | — | `pitch` (C), `gate` (T), `velocity` (C) | `channel` | MIDI note input from RP2350 |
| **CCIn** | — | `value` (C) | `channel`, `cc` | MIDI CC input |
| **ClockIn** | — | `tick` (T), `beat` (T), `bar` (T) | — | MIDI clock input |
| **NoteOut** | `pitch` (C), `gate` (T), `velocity` (C) | — | `channel` | MIDI note output via RP2350 |
| **CCOut** | `value` (C) | — | `channel`, `cc` | MIDI CC output |

#### `synth/` — Complete Synthesis Modules

| Node | Inputs | Outputs | Params | Wraps |
|---|---|---|---|---|
| **FMKick** | `trig` (T) | `out` (A) | `freq`, `fmAmt`, `decay`, `drive` | `FmKick` |
| **Clap** | `trig` (T) | `out` (A) | `freq`, `decay`, `tone` | `Clap` |
| **Rimshot** | `trig` (T) | `out` (A) | `freq`, `decay`, `snap` | `Rimshot` |
| **Rompler** | `gate` (T), `pitch` (C) | `out` (A) | `slice`, `start`, `length`, `loop` | `RomplerVoiceMinimal` |

**Total: ~65+ node types** — v2 adds `seq/`, `midi/`, and new `logic/` nodes.

### 9.2 Node Memory Costs

| Category | Typical Object Size | Buffer per Instance | Notes |
|---|---|---|---|
| Math/Logic | 16-64 bytes | 0 | Stateless or trivial state |
| Oscillators | 32-128 bytes | 0 | Phase accumulator + coefficients |
| Envelopes | 64-128 bytes | 0 | State machine + coefficients |
| Filters | 64-256 bytes | 0 | Filter state |
| Sequencer | 128-256 bytes | 0 | Pattern array + position |
| MIDI | 32-64 bytes | 0 | Channel/CC state |
| Chorus/Ensemble | 64 bytes + buffer | **2-16 KB** | Modulated delay lines |
| Delay | 32 bytes + buffer | **8-350 KB** | Configurable max delay |
| Reverb | 128-256 bytes + buffer | **32-84 KB** | Multiple delay + allpass |
| Rompler | 128 bytes + buffer | **8-16 KB** | Read + pitch shift buffer |

---

## 10. Control Surface Integration

### How the Patcher Connects to the Control Surface System

The Control Surface architecture (described in WEBUI-UNIFIED-FORMAT-AND-TYPES.md) defines
a three-layer system: DSP Parameters → Control Surface → User State. The Patcher plugin
creates an interesting intersection:

**The patch graph _is_ the DSP layer.** Each node's parameters are the raw DSP params.

**The macro pages _are_ the control surface.** They define what the user sees on the hardware
UI and map to node params — exactly like a Control Surface maps to raw DSP params.

**A saved patch _is_ the user state.** The patch JSON contains both the graph topology (the
"instrument definition") and the current parameter values (the "preset").

### Automatic Control Surface Generation

When a patch is loaded, the Patcher plugin can generate a Control Surface definition
from its macro pages:

```json
{
  "version": 1,
  "name": "Patcher: My Synth → FILTER",
  "machine": "patcher",
  "pages": [
    {
      "name": "FILTER",
      "controls": [
        { "id": "m0s0", "name": "CUTOF", "display": "freq_hz", "min": 20, "max": 20000 },
        { "id": "m0s1", "name": "RESO",  "display": "percent", "min": 0, "max": 100 },
        { "id": "m0s2", "name": "---" },
        { "id": "m0s3", "name": "EGDCY", "display": "time_ms", "min": 1, "max": 2000 }
      ]
    },
    {
      "name": "OSC",
      "controls": [
        { "id": "m1s0", "name": "PITCH", "display": "freq_hz", "min": 20, "max": 20000 },
        { "id": "m1s1", "name": "PW",    "display": "percent", "min": 0, "max": 100 },
        { "id": "m1s2", "name": "LRATE", "display": "freq_hz", "min": 0.01, "max": 20 },
        { "id": "m1s3", "name": "LDPTH", "display": "percent", "min": 0, "max": 100 }
      ]
    }
  ],
  "mapping": [
    { "control": "m0s0", "target": "n2_frequency", "expr": "x" },
    { "control": "m0s1", "target": "n2_resonance", "expr": "x / 100" },
    { "control": "m0s3", "target": "n3_D",         "expr": "x / 1000" }
  ]
}
```

This means:
- The RP2350 Patcher App can render macro pages using the same `commonRenderParameter()`
  function the Groovebox uses
- The hardware knobs show values in real units (Hz, ms, %) instead of raw floats
- The WebUI can use `webaudio-controls` with proper `conv` attributes
- MIDI controllers get proper range mapping

### What About Patches WITHOUT Macros?

If a patch has no macro pages defined (the user just connected nodes without setting up
macros), the Patcher App:

1. Falls back to the **Node Browser** screen (§6.2)
2. Each node's params display as raw values with node-provided min/max
3. The user can still edit everything — just less optimized for performance

This is the "programmer mode" vs. "performer mode" distinction.

---

## 11. Memory Architecture

### 11.1 Patcher Memory Model

The Patcher plugin runs in **STEREO mode** to get the full 300 KB arena:

```
┌─────────────────────────────────────────────────────────────────┐
│  Arena (300 KB = 307,200 bytes)                                 │
│                                                                 │
│  ┌─────────────────────────────────┐                            │
│  │ ctagSoundProcessorPatcher obj   │  ~1 KB (includes macro    │
│  │ (factory-allocated)             │  page structures)          │
│  └─────────────────────────────────┘                            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ Remaining blockMem (~305 KB)                            │    │
│  │                                                         │    │
│  │  ┌──────────────┐  ┌──────────────┐                     │    │
│  │  │ Graph A      │  │ Graph B      │  (double-buffer)    │    │
│  │  │ ~150 KB      │  │ ~150 KB      │                     │    │
│  │  │              │  │              │                     │    │
│  │  │ Node objects │  │ Node objects │                     │    │
│  │  │ Wire buffers │  │ Wire buffers │                     │    │
│  │  │ Param arrays │  │ Param arrays │                     │    │
│  │  │ Macro meta   │  │ Macro meta   │                     │    │
│  │  └──────────────┘  └──────────────┘                     │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  PSRAM (for large delay/reverb buffers)                         │
│  Delay/Chorus/Reverb/PitchShift: up to ~1 MB total             │
└─────────────────────────────────────────────────────────────────┘
```

### 11.2 Memory Budget Example (30-node patch)

| Component | Count | Size Each | Total |
|---|---|---|---|
| PatchGraph overhead | 1 | 256 B | 256 B |
| Node objects (average) | 30 | 128 B | 3.8 KB |
| Node param arrays | 30 | 64 B | 1.9 KB |
| Wire buffers (audio) | 40 | 128 B | 5.0 KB |
| Execution order array | 30 | 4 B | 120 B |
| Connection metadata | 40 | 16 B | 640 B |
| Macro page metadata | 5 | 128 B | 640 B |
| Sequencer pattern data | 2 | 64 B | 128 B |
| **Subtotal (arena)** | | | **~12.5 KB** |
| Reverb buffer (PSRAM) | 1 | 84 KB | 84 KB |
| Delay buffer (PSRAM) | 2 | 44 KB | 88 KB |
| Chorus buffer (PSRAM) | 1 | 8 KB | 8 KB |
| **Subtotal (PSRAM)** | | | **~180 KB** |

**Conclusion:** 150 KB per graph half is more than sufficient. 100+ simple nodes
or 30-50 nodes with moderate effects.

### 11.3 ESP32-P4 Advantage

| Resource | ESP32 (original) | ESP32-P4 |
|---|---|---|
| Internal SRAM | 520 KB | 768 KB |
| PSRAM | 8 MB | Up to 32 MB |
| Arena budget | 300 KB | Could increase to 512+ KB |

---

## 12. ESP32-P4 Resource Budget

### 12.1 CPU

| Parameter | Value |
|---|---|
| Clock speed | 400 MHz (dual RISC-V) |
| Audio block | 32 samples @ 44.1 kHz = 0.726 ms |
| Cycles per block | ~290,000 cycles |
| Audio core | Core 1 (dedicated, priority 23) |
| HTTP/SPI core | Core 0 |

### 12.2 Graph Overhead

| Operation | Cost per Node | 50-Node Patch |
|---|---|---|
| Graph traversal | ~10 cycles | 500 cycles |
| Input buffer resolution | ~30 cycles | 1,500 cycles |
| Virtual `process()` call | ~20 cycles | 1,000 cycles |
| CV/Trig override check | ~15 cycles | 750 cycles |
| **Total overhead** | ~75 cycles/node | **~3,750 cycles (~1.3%)** |

### 12.3 Example Budget

```
1× AudioIn         =     100 cycles
2× PolyBLEP Osc    =   4,000 cycles
1× MI MacroOsc     =  15,000 cycles
1× ADSR + 1× AD   =     800 cycles
1× LFO             =     500 cycles
2× SVF Filter      =   4,000 cycles
1× VCA             =     200 cycles
1× StepSeq         =     200 cycles
1× Delay           =     500 cycles
1× Freeverb        =  20,000 cycles
1× AudioOut        =     100 cycles
Graph overhead     =   1,000 cycles
─────────────────────────────────────
Total              =  46,400 cycles
Budget             = 290,000 cycles
Headroom           = 243,600 cycles (84% free)
```

---

## 13. Patch Format Specification

### 13.1 Patch JSON Schema (v2 — with Macro Pages)

```json
{
  "version": 2,
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
        "A": { "value": 0.01 },
        "D": { "value": 0.2 },
        "S": { "value": 0.5 },
        "R": { "value": 0.3 }
      },
      "pos": [100, 400]
    },
    "4": { "type": "math/multiply", "pos": [550, 200] },
    "5": {
      "type": "io/audioOut",
      "params": { "gain": { "value": 0.8 } },
      "pos": [750, 200]
    },
    "6": {
      "type": "seq/stepSeq",
      "params": {
        "steps": { "value": 16 }
      },
      "pattern": [1,0,0,0, 1,0,0,0, 1,0,1,0, 1,0,0,1],
      "pos": [100, 600]
    }
  },

  "connections": [
    { "src": "1", "srcPort": "out",  "dst": "2", "dstPort": "in" },
    { "src": "2", "srcPort": "lp",   "dst": "4", "dstPort": "a" },
    { "src": "3", "srcPort": "out",  "dst": "4", "dstPort": "b" },
    { "src": "4", "srcPort": "out",  "dst": "5", "dstPort": "left" },
    { "src": "4", "srcPort": "out",  "dst": "5", "dstPort": "right" },
    { "src": "6", "srcPort": "gate", "dst": "3", "dstPort": "gate" }
  ],

  "macroPages": [
    {
      "name": "FILTER",
      "slots": [
        { "nodeId": "2", "param": "frequency", "display": "CUTOF", "unit": "Hz" },
        { "nodeId": "2", "param": "resonance", "display": "RESO",  "unit": "%" },
        null,
        { "nodeId": "3", "param": "D",         "display": "EGDCY", "unit": "ms" }
      ]
    },
    {
      "name": "OSC",
      "slots": [
        { "nodeId": "1", "param": "frequency", "display": "PITCH", "unit": "Hz" },
        null,
        null,
        null
      ]
    }
  ],

  "midiLearn": {
    "macros": {
      "0.0": { "channel": 0, "cc": 74 },
      "0.1": { "channel": 0, "cc": 71 }
    }
  }
}
```

### 13.2 Node Type Descriptor

Served by `/api/v1/patcher/nodeTypes`:

```json
{
  "id": "filter/svf",
  "name": "SVF Filter",
  "category": "filter",
  "description": "State Variable Filter with LP/BP/HP outputs",
  "inputs": [
    { "name": "in", "type": "audio" },
    { "name": "freq", "type": "control", "default": 1000 },
    { "name": "reso", "type": "control", "default": 0.5 }
  ],
  "outputs": [
    { "name": "lp", "type": "audio" },
    { "name": "bp", "type": "audio" },
    { "name": "hp", "type": "audio" }
  ],
  "params": [
    { "name": "frequency", "type": "float", "min": 20, "max": 20000, "default": 1000, "unit": "Hz" },
    { "name": "resonance", "type": "float", "min": 0, "max": 1, "default": 0.5 }
  ],
  "color": "#4488AA",
  "memCost": 64
}
```

### 13.3 Preset Storage

```
/sdcard/data/patcher/presets/
├── 0.json    (preset slot 0)
├── 1.json    (preset slot 1)
├── ...
└── 15.json   (preset slot 15)
```

### 13.4 Integration with Kit Format

When the Patcher plugin is active and the user saves a Kit (see WEBUI-UNIFIED-FORMAT-AND-TYPES.md),
the Kit stores the entire patch JSON as a blob within the Kit's `params` section:

```json
{
  "format": "tbd16-kit",
  "name": "Stimming's Patcher Kit",
  "channels": [
    { "channel": 0, "plugin": "Patcher", "patchPreset": 3 }
  ],
  "patcherState": { /* full patch JSON embedded here */ }
}
```

This ensures the Kit format remains the universal save/share unit.

---

## 14. Simulator Support

### 14.1 Zero Simulator-Specific Code

The patcher plugin requires **no simulator-specific code**:

1. `ctagSoundProcessorPatcher` is a regular plugin → automatically compiled via CMake
2. All DSP helpers used by nodes are already compiled for the simulator
3. The WebUI (LiteGraph.js + `tbd-patcher.js`) is served from `sdcard_image/www/`
4. New REST endpoints are added to `WebServer.cpp`
5. PSRAM allocations fall back to `malloc()` via fake-idf stubs

### 14.2 Desktop Development Workflow

```
1. Edit node C++ code in components/ctagSoundProcessor/patcher/
2. cmake --build simulator/build
3. ./tbd-sim
4. Open http://localhost:8080/patcher.html
5. Create/edit patches visually with LiteGraph.js
6. Define macro pages in the side panel
7. Audio plays through sound card in real-time
8. When satisfied, flash to ESP32-P4 hardware
```

### 14.3 RP2350 App Simulation

The RP2350 Patcher App itself is developed in the `rp2350-arduino-tbd-fw` repository.
For testing without hardware:

- The macro page structures are JSON — can be unit-tested independently
- The SPI commands are testable via the simulator's REST API (same data, different transport)
- The OLED rendering can be previewed in the WebUI's "Hardware Preview" panel (§8.2)

---

## 15. Integration with Existing TBD Architecture

### 15.1 Plugin Registration

Standard CMake auto-registration:
- `components/ctagSoundProcessor/ctagSoundProcessorPatcher.cpp`
- Factory entry auto-generated
- Activated via `setActivePlugin?id=Patcher`

### 15.2 App Registration

The RP2350 Patcher App is distributed as a `.uf2` file on the SD card:
```
/tbd-apps/patcher.uf2
```
It appears in the bootloader's App menu alongside Groovebox, Multi Effect, and MCL.

### 15.3 Stereo Mode

The patcher always runs in stereo mode (full 300 KB arena, both audio channels).

### 15.4 WebUI Navigation

```
index.html (existing)
  └── main.html (existing — plugin selector)
        ├── edit.html (existing — param editor for regular plugins)
        └── patcher.html (NEW — LiteGraph canvas + macro editor)
              │
              └── Opened when Patcher plugin is active
                  OR via dedicated button / URL
```

### 15.5 Favorites / Quick Recall

The existing Favorites system stores `{plugin: "Patcher", preset: N}` — recalling
a favorite loads the corresponding patch graph.

---

## 16. Development Roadmap

### Phase 1 — Minimal Viable Patcher (~3-4 weeks)

**Goal:** End-to-end working prototype with basic nodes and browser-only interaction.

| Task | Effort | Deliverable |
|---|---|---|
| `PatchNode` base class + `PatchGraph` | 5 days | Graph engine with topological sort |
| Node JSON serializer/deserializer | 2 days | Patch save/load |
| `ctagSoundProcessorPatcher` wrapper | 2 days | Plugin integration |
| Basic nodes: AudioIn/Out, Knob, Add, Multiply, Sine, SVF, ADSR, Noise | 3 days | First sounds |
| REST API endpoints | 2 days | Browser ↔ P4 communication |
| LiteGraph.js integration + custom TBD node types | 3 days | Visual patching |
| Simulator testing | 3 days | Desktop development flow |

**Milestone:** Build osc → filter → VCA → output in browser, hear it on simulator/hardware.

### Phase 2 — Macro Pages + RP2350 App Foundation (~3-4 weeks)

| Task | Effort | Deliverable |
|---|---|---|
| Macro page data model + JSON serialization | 2 days | Macro pages in patch format |
| Macro Page Editor in WebUI | 3 days | Browser-side macro editing |
| SPI protocol extensions (GetMacroPages, SetMacroParam) | 2 days | P4 ↔ RP2350 macro communication |
| RP2350 Patcher App skeleton (macro page screen) | 5 days | Hardware UI for macros |
| RP2350 Node Browser + Node Edit screens | 3 days | Hardware node browsing |
| MIDI CC → macro mapping on RP2350 | 2 days | MIDI learn |
| Hardware Preview in WebUI | 2 days | OLED preview in browser |

**Milestone:** Full hardware + browser experience for a simple patch with macro pages.

### Phase 3 — Core Node Library + Sequencer (~3-4 weeks)

| Task | Effort | Deliverable |
|---|---|---|
| All oscillator variants (Saw, Square, Triangle, MacroOsc, SuperSaw) | 3 days | Full osc palette |
| All filter variants | 2 days | Full filter palette |
| Delay/Reverb/Chorus/Ensemble nodes | 3 days | Effects |
| LFO, AD, Decay, Follow nodes | 2 days | Modulation |
| StepSeq + Euclidean nodes | 3 days | In-graph sequencing |
| RP2350 step button → StepSeq node integration | 3 days | Hardware step control |
| LED feedback protocol | 2 days | Step position on LEDs |
| MIDI I/O nodes | 2 days | MIDI integration |

**Milestone:** Complex patches with sequencing, effects, and full MIDI support.

### Phase 4 — Polish & Advanced (~3-4 weeks)

| Task | Effort | Deliverable |
|---|---|---|
| Drum synth + Rompler nodes | 3 days | Complete drum module |
| Dynamics nodes | 1 day | Compressor, gate, limiter |
| Subgraph support | 3 days | Reusable sub-patches |
| Undo/redo in WebUI | 2 days | Editing safety |
| CPU usage monitoring | 1 day | Performance visibility |
| Factory patches (15-20 demo patches) | 3 days | Out-of-box content |
| Mobile touch optimization | 2 days | Tablet patching |
| Performance profiling on ESP32-P4 | 2 days | Optimization |
| Documentation | 2 days | User guide |

**Total estimated effort: ~14-16 weeks** for a full-featured patcher with hardware UI.
Phase 1 alone (3-4 weeks) delivers a usable browser-only prototype.
Phases 1+2 (~7 weeks) deliver the full dual-processor experience.

---

## 17. Open Questions & Decisions

### Architecture

| Question | Options | Recommendation |
|---|---|---|
| **Block size** | Same 32 as plugins? | **Yes** — consistency + low latency |
| **Control rate** | Every block (1.38 kHz)? | **Yes** — standard for modular |
| **Max nodes** | Hard limit or dynamic? | **Soft limit ~100** based on memory |
| **Audio wires** | Stereo or mono? | **Mono by default**, explicit stereo nodes |
| **Hot-swap** | Atomic swap or mute? | **Atomic swap** — zero glitch |
| **RP2350 receives full graph?** | Yes or summary only? | **Summary only** — macro pages + node list |

### Hardware UI

| Question | Options | Recommendation |
|---|---|---|
| **Which buttons enter Node Browser?** | Dedicated or combo? | **Hold "pattern" button** — repurpose from Groovebox |
| **Step buttons for non-seq patches?** | Unused? Trigger nodes? | **Map to trigger inputs** — any step button → trigger node |
| **LED mode for patcher?** | Step position? Node activity? | **Step position** when seq active, **dim idle** otherwise |
| **Macro page naming** | User-defined or auto? | **User-defined** in macro editor, auto-generated fallback |

### WebUI

| Question | Options | Recommendation |
|---|---|---|
| **LiteGraph.js version** | Original or fork? | **Original** — stable, lighter |
| **Macro editor** | Side panel or modal? | **Side panel** — visible alongside canvas |
| **Hardware Preview** | Always visible? Toggle? | **Toggle** — show when editing macros |
| **Patch sharing** | Export JSON? Upload? | **Both** — download as .json, upload via file manager |

### Sequencer

| Question | Options | Recommendation |
|---|---|---|
| **Clock source** | P4 internal, RP2350 tick, MIDI, Link? | **All** — Clock node accepts multiple sync sources |
| **Swing** | In StepSeq node? | **Yes** — shuffle/swing param on StepSeq |
| **Pattern length** | Fixed 16? Variable? | **Variable 1-64**, default 16 |
| **Step parameter locks?** | Per-step CC overrides? | **Phase 4** — p-locks are complex but powerful |

### Is This Just a DSP Plugin or Also an App Layer?

**Both.** This is the key insight of v2:

- The **DSP plugin** (`ctagSoundProcessorPatcher`) runs on the ESP32-P4 and is the graph engine. It works with any RP2350 App firmware (Multi Effect, Groovebox, or the dedicated Patcher App).

- The **Patcher App** (`patcher.uf2`) runs on the RP2350 and provides the optimized hardware UI experience — macro pages, node browsing, step sequencer control, MIDI learn.

- You can use the Patcher plugin **without** the Patcher App (boot into Multi Effect, select Patcher, use browser). But the experience is better with the dedicated App.

- The Patcher App is **not useful without** the Patcher plugin on the P4 (it has nothing to control otherwise).

This mirrors the existing pattern: the Groovebox App is tightly coupled to PicoSeqRack, but PicoSeqRack can also be loaded from Multi Effect mode with reduced hardware UI.

---

## Appendix A — Full DSP Building Block Inventory

### Existing Code Available for Wrapping

#### Helpers (`components/ctagSoundProcessor/helpers/`)

| Class | Type | Key Methods |
|---|---|---|
| `ctagADEnv` | AD envelope | `Process()`, `Trigger()`, `SetAttack/Decay()` |
| `ctagADSREnv` | ADSR envelope | `Process()`, `Gate()`, `SetA/D/S/R()` |
| `ctagDecay` | Exponential decay | `Process(in)`, `SetDecay60dB()` |
| `ctagEnvFollow` | Envelope follower | `Process(in)`, `SetAttack/Decay()` |
| `ctagBiQuad` | Biquad LP/BP/HP | `Process(buf, sz)`, `SetCutoffHz()`, `SetQ()` |
| `ctagDelay` | Simple delay line | `Process(in)`, `SetBuffer()`, `SetFeedback()` |
| `ctagFBDelayLine` | Feedback delay | `Process(buf, off, inc, sz)`, `SetFeedback/Length/DryWet()` |
| `ctagSineSource` | Sine oscillator | `Process()`, `SetFrequency()` |
| `ctagWNoiseGen` | White noise | `Process()` |
| `ctagPNoiseGen` | Pink noise | `Process()` |
| `ctagGNoiseGen` | Gaussian noise | `Process()`, `SetPrecision()` |
| `ctagDustGen` | Dust/impulse | `Process()`, `SetRate/Width()` |
| `CVtranscoder` | Curve mapping | `Process(in, curve, start, end, min, max)` |
| `ctagFastMath` | Fast math | ~40 functions |
| `ctagTimer` | Timer | `SetTimeout()`, `Tick()`, `SetRepeat()` |
| `ctagSampleRom` | Sample ROM access | `ReadSliceAsFloat()`, `GetSliceSize()` |

#### Filters (`components/ctagSoundProcessor/filters/`)

| Class | Type |
|---|---|
| `ctagDiodeLadderFilter` (×5 variants) | ZDF Diode Ladder 4-pole LP |
| `ctagWPkorg35` | Korg MS-35 |

#### Synthesis (`components/ctagSoundProcessor/synthesis/`)

| Class | Type |
|---|---|
| `FmKick` | FM kick drum |
| `Clap` | Synth clap |
| `Rimshot` | Synth rimshot |
| `RomplerVoice` | Full sample player |
| `RomplerVoiceMinimal` | Lightweight sampler |
| `MiSuperSawOsc` | 6-voice supersaw |
| `ChordSynth` | Polyphonic chord |

#### Effects (`components/ctagSoundProcessor/fx/`)

| Class | Type |
|---|---|
| `ctagDecimator` | Bitcrusher |
| `ctagMDAtalkbox` | Vocoder |
| `ctagPebble` | Phaser (Small Stone) |
| `ctagSPphaser` | Phaser (Guitarix) |

#### Mutable Instruments FX (`components/ctagSoundProcessor/mifx/`)

| Class | Buffer |
|---|---|
| `Chorus` | 8 KB |
| `Ensemble` | 16 KB |
| `Diffuser` | 32 KB |
| `Reverb` | 84 KB |
| `Oliverb` | 84 KB |
| `PitchShifter` | 16 KB |
| `PitchShifterMono` | 8 KB |
| `RandomOscillator` | 0 |

#### Reverbs (`freeverb/`, `freeverb3/`, `gverb/`)

| Class | Type |
|---|---|
| `revmodel` (freeverb) | Schroeder reverb |
| `progenitor_f` (freeverb3) | Griesinger Progenitor |
| `strev_f` (freeverb3) | Simple Tank Reverb |
| `ty_gverb` | FDN reverb |

#### Dynamics (`SimpleComp/`)

| Class | Type |
|---|---|
| `SimpleComp` | Compressor |
| `SimpleGate` | Noise gate |
| `SimpleLimit` | Brickwall limiter |

#### Airwindows

| Class | Type |
|---|---|
| `CStrip` / `CStripM` | Channel strip |
| `EChorus` | Ensemble chorus |
| `EveryTrim` | Stereo gain/balance |
| `TDelay` | Mono delay |

#### External Libraries

| Library | Content |
|---|---|
| **Mutable Instruments** | `MacroOscillator2` (Plaits), `Svf`, Rings, full MI DSP |
| **Moog Ladders** | Multiple ladder filter implementations |
| **ESP-DSP** | FIR, IIR biquad, FFT, dot products |

**Total available: ~60+ classes** ready to be wrapped as patcher nodes.

---

## Appendix B — RP2350 App vs. Groovebox Comparison

Understanding where the Patcher App sits relative to existing Apps clarifies
what we're building:

| Aspect | Groovebox App | Multi Effect App | Patcher App (proposed) |
|--------|--------------|------------------|----------------------|
| **ESP32-P4 plugin** | PicoSeqRack (fixed) | Any plugin (user-selected) | ctagSoundProcessorPatcher |
| **RP2350 firmware** | tbd-pico-seq3 | Plugin browser fw | patcher.uf2 |
| **Sound architecture** | Fixed 16 channels, fixed machine types | 2 plugin slots | User-defined signal graph |
| **Sequencer** | Full 16-track step sequencer | None | Optional in-graph `StepSeq` nodes |
| **Pattern management** | Yes (64 patterns) | No | Patch presets (up to 16 slots) |
| **Parameter pages** | Fixed per machine type | Auto from MUI schema | User-defined macro pages |
| **Step buttons** | Pattern steps | Unused | Drive `StepSeq` nodes |
| **4 knobs control** | Current page params | Active plugin params | Macro page params |
| **Browser UI** | Future WebUI (in development) | edit.html (existing) | patcher.html (LiteGraph canvas) |
| **MIDI** | Full drum machine MIDI | CC → plugin params | CC → macros, notes → NoteIn nodes |
| **Target user** | Groove/beat makers | Sound designers, guitarists | Sound designers, experimentalists |
| **Complexity to user** | Medium (learn the sequencer) | Low (select plugin, tweak) | High (build your own instrument) |
| **Complexity to develop** | Very high (seq3 is complex) | Low (simple browser fw) | Medium-high (graph engine + app) |

### Can the Patcher App Replace the Multi Effect App?

Partially. A user who just wants to run a single plugin (say, Freeverb) through the
Patcher would create a trivial patch: `AudioIn → Freeverb → AudioOut`. The macro pages
would expose Freeverb's params (size, damp, wet). The hardware experience would be
equivalent to Multi Effect mode.

But this is overkill for that use case. The Multi Effect App is simpler and loads any
plugin without creating a patch. The Patcher App is for when you need custom signal
routing — splitting, parallel processing, modulation, sequencing, or combining multiple
DSP modules that don't exist as a single monolithic plugin.

### Can the Patcher Plugin Run Under the Groovebox App?

Not meaningfully. The Groovebox App expects PicoSeqRack's 16-channel structure with
specific MIDI mappings and parameter IDs. The Patcher plugin has a fundamentally different
parameter model (graph-based instead of flat). You could load Patcher in one of
PicoSeqRack's channels, but it wouldn't receive the Groovebox's sequencer data
in a useful way.

The right answer is: the Patcher is its own App, designed from the ground up for
graph-based sound design with its own hardware UI optimized for that workflow.

---

## Summary

The TBD Patcher v2 is a **full-stack instrument** spanning both processors:

- **ESP32-P4:** Interpreted graph engine with 65+ node types, zero-glitch hot-swap,
  macro page metadata, ~84% CPU headroom on typical patches
- **RP2350:** Dedicated Patcher App with macro page navigation (4 knobs × N pages),
  node browser, step sequencer integration, MIDI learn, LED feedback
- **Browser:** LiteGraph.js visual patching canvas with macro page editor,
  hardware preview panel, and REST API communication
- **60+ existing DSP building blocks** — no new DSP algorithms needed for v1
- **Control Surface compatible** — macro pages generate Control Surface definitions
  for consistent hardware/WebUI/MIDI experience
- **App system native** — `patcher.uf2` sits alongside Groovebox and Multi Effect
  in the boot menu

**Effort: ~14-16 weeks total.** Phase 1 (browser-only prototype): 3-4 weeks.
Phases 1+2 (full hardware + browser): ~7 weeks.
