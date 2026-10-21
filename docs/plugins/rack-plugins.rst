*******************
Writing a Machine
*******************

.. note::

   This is the **reference doc** for writing a **Machine** — a voice that lives *inside*
   the TBD-16's ``GrooveBoxRack`` instrument. In the codebase Machines are also called
   *rack plugins* (the directory is ``components/ctagSoundProcessor/rack/``, the
   scaffolder is ``generators/rackgen.js``, the class prefix is ``RackXxx``); user-facing
   docs and the rest of this page call them **Machines** to match the public catalogue at
   `docs.dadamachines.com/tbd-16/machines/ <https://docs.dadamachines.com/tbd-16/machines/>`_.

   If you want a guided end-to-end walk-through instead of this reference, start at the
   :doc:`Hello, Machines tutorial <rack-tutorial>`. For the catalogue of Machines that
   ship today, see the :doc:`Machines page <machines>`. If you actually want a *legacy
   standalone Plugin* (Eurorack-style, CV / Trigger / Pot), see
   :doc:`Creating a Plugin <step-by-step>` — the two are different things, and the
   :doc:`Quickstart <quickstart>` has a one-page side-by-side comparison.

   The macro/preset/rack layer is © Per-Olov Jernberg (possan) & Johannes Elias Lohbihler,
   building on the CTAG TBD ``DrumRack`` / engine by Robert Manzke (CTAG Kiel). It is
   GPL-3.0; a commercial licence is available — see ``LICENSE`` and ``CONTRIBUTING.md`` in
   the repo root.


What a Machine is
=================

The **TBD-16** is a MIDI-driven groovebox (not a Eurorack module). Its ``GrooveBoxRack``
sound processor hosts up to **16 tracks**; each track can run one **machine** at a time —
a small DSP voice (a drum, a synth, a sampler, …). A machine:

- renders **one block** (``BUF_SZ`` = 32 samples) of **mono** audio per ``Process()`` call
  into its own public output buffer;
- is **triggered by MIDI** — drum machines by a fixed note on a fixed channel, synth
  machines by pitched notes on a per-track channel;
- exposes parameters that the rack registers as both **preset/WebUI parameters** and
  **MIDI CCs**;
- has its level / pan / FX-sends handled for it by the track's ``RackChannelMixer`` — you
  just produce a clean mono signal.

GrooveBoxRack mixes all the active tracks' outputs, runs the bus FX (delay, reverb, master
compressor) and writes the stereo result. The hardware's RP2350 step-sequencer (and/or USB
MIDI) feeds it MIDI; in the :doc:`desktop simulator <simulator>` you play it from the
``/ctrl`` page's *GrooveBoxRack (MIDI)* tab.


The track / machine map: ``synthdefinitions.json``
==================================================

``sdcard_image/factory/synthdefinitions.json`` is the canonical description of the rack's
tracks. For each track it gives the ``index``, ``type`` (``drum`` / ``synth`` / ``fx``),
display ``name``, ``midichannel`` (**0-based**), ``drumnote`` (drum tracks only), ``basecc``
(the CC offset for that track's params), and the ordered ``machines`` list. There is also a
``machines`` array describing each machine's CC ``parameters`` (``id``, ``ctrl``, ``def``).

The track ↔ MIDI mapping is **not** a General-MIDI drum layout — it's:

.. list-table::
   :header-rows: 1
   :widths: 14 30 18 38

   * - WebUI strip
     - track (synthdefinitions)
     - MIDI ch · note
     - machines with a param panel
   * - CH01 / CH02 / CH03
     - 0 Kick / 1 Kick2 / 2 Snare
     - **ch 10** · note 36 / 37 / 38
     - ``db,ab,ro`` / ``fmb,ro`` / ``ds,as,ro``
   * - CH04 / CH05 / CH06
     - 3 Hat / 4 Rimshot / 5 Clap
     - **ch 11** · note 36 / 37 / 38
     - ``hh1,hh2,ro`` / ``rs,ro`` / ``cl,ro``
   * - CH07 / CH08
     - 6 Rompler / 7 Rompler
     - **ch 12** · note 36 / 37
     - ``ro``
   * - CH09…CH15
     - 8…14 Bass / Bass2 / Lead / Lead2 / Rompler / Rompler / Chordo
     - **ch 1…7** · pitched notes
     - ``td3`` / ``td3`` / ``mo`` / ``wtosc,mo,ro`` / ``ro`` / ``ro`` / ``pp,ro``
   * - CH16
     - 15 Input
     - **ch 8** · no notes
     - ``inp`` (audio passthrough)
   * - bus FX
     - 16/17/18 FX1 / FX2 / Master
     - **ch 12** · basecc 0 / 20 / 40
     - ``fxdelay`` / ``fxreverb`` / ``fxmaster``

So: drum tracks share MIDI channels 10/11/12 and the **note** picks which of the (up to 3)
tracks on that channel fires; synth tracks get one MIDI channel each (1–7). ``nodrum`` /
``nosynth`` / ``extdrum`` / ``extsynth`` are entries with no DSP/param panel (empty slot,
or "forward to an external MIDI device"). ``ro`` is the sampler (the *Rompler* voice — it
reads from the sample-rom, so it needs ``--srom`` in the simulator).


Anatomy of a Machine class
==========================

Each machine is a plain C++ class in ``components/ctagSoundProcessor/rack/RackXxx.{hpp,cpp}``.
The shared structs live in ``rack/RackSynth.hpp``; FM drum building blocks (operators,
envelopes) in ``rack/FmDrumPrimitives.hpp``.

.. code-block:: cpp

   // rack/RackMyVoice.hpp
   #pragma once
   #include "RackSynth.hpp"
   using namespace CTAG::SP;

   class RackMyVoice {
   public:
       void Init(const GrooveBoxRackInitData *initdata);     // register params, init DSP
       void Process(const GrooveBoxRackProcessData &data); // render BUF_SZ mono samples
       void noteOn(uint8_t note, uint8_t velocity);        // synth: a note arrived  (drums: use trigger())
       void noteOff(uint8_t note, uint8_t velocity);
       bool  enabled;                                      // set by GrooveBoxRack::setTrackMachine()
       float out[BUF_SZ];                                  // your output buffer (name it `out`)
   private:
       atomic<int16_t> p_cutoff, p_decay /* , … one per registered param */;
       // … your DSP state …
   };

``Init(const GrooveBoxRackInitData *initdata)`` — register your parameters and initialise DSP:

.. code-block:: cpp

   void RackMyVoice::Init(const GrooveBoxRackInitData *initdata) {
       // CC numbers come from this machine's `parameters[].ctrl` in synthdefinitions.json
       // (drum/synth machine params conventionally start at cc 8; the mixer strip uses 1–7).
       initdata->rack->registerParamAndCC(initdata, "cutoff", 8, [&](const int v){ p_cutoff = v; });
       initdata->rack->registerParamAndCC(initdata, "decay",  9, [&](const int v){ p_decay  = v; });
       // … one registerParamAndCC() per parameter …
       this->enabled = false;
       // … init your DSP (clear buffers, set up filters, etc.) …
   }

``registerParamAndCC(initdata, "<suffix>", <cc>, <setter>)`` registers the parameter under
the id ``"<prefix><suffix>"`` (the prefix is set by GrooveBoxRack per track/machine, e.g.
``ch11_mo_``) in **both** maps:

- ``pMapPar`` — so ``LoadPreset()`` and the WebUI's "set parameter" path reach the setter;
- ``pMapParCC`` at ``cc_base + <cc>`` on the track's MIDI channel — so a MIDI CC reaches it.

``Process(const GrooveBoxRackProcessData &data)`` — render one block:

.. code-block:: cpp

   void RackMyVoice::Process(const GrooveBoxRackProcessData &data) {
       bool _trig = false;
       if (midi_trig) { _trig = true; midi_trig = false; }   // drum-style trigger (set by trigger())
       if (!this->enabled) return;                            // not the active machine — do nothing

       std::fill_n(out, BUF_SZ, 0.f);
       // scale raw param values (0..4096, or -4095..4095 for bipolar) to useful ranges:
       MK_FLT_PAR_ABS_NOCV(fCutoff, p_cutoff, 4095.f, 1.f)    // → 0..1
       MK_FLT_PAR_ABS_MIN_MAX_NOCV(fDecay, p_decay, 4095.f, 5.f, 2000.f)  // → 5..2000 ms
       // … render BUF_SZ samples into out[] …
       for (int i = 0; i < BUF_SZ; i++) out[i] = /* your DSP */;
   }

``data`` (a ``GrooveBoxRackProcessData``) gives you ``tempo`` (BPM × 100), ``quantum``,
``msPerBeat``, ``sampleRom`` (a ``ctagSampleRom*`` — for sampler voices), ``firstNonWtSlice``
and ``inputbuffer`` (the stereo audio input, used by the input track / FX). The host audio
buffer / CV / triggers (``ProcessData.buf/cv/trig``) are **not** exposed to machines — that's
intentional, GrooveBoxRack is MIDI-driven.

Triggering:

- **Drum machines** implement ``void trigger()`` — it just sets a ``midi_trig`` flag that the
  next ``Process()`` consumes (see ``RackDBD``). GrooveBoxRack's ``handleMidiNoteOn()`` calls
  ``trigger()`` when the track's drum note arrives.
- **Synth machines** implement ``void noteOn(uint8_t note, uint8_t velocity)`` /
  ``void noteOff(uint8_t note, uint8_t velocity)`` — ``handleMidiNoteOn()`` / ``handleMidiNoteOff()``
  call these for the track's MIDI channel; ``note`` is the pitch (semitones).

The track's ``RackChannelMixer`` applies level/pan/FX-sends and a ``volumeMultiplier`` trim
on top of your ``out[]`` — so produce a clean, roughly unity-level mono signal and don't
worry about panning or mixing.


Scaffold with ``rackgen.js`` (recommended — one command)
========================================================

The fast path is ``generators/rackgen.js`` — analog of ``generator.js`` for legacy plugins.
It takes a small descriptor JSON and, in ``-i`` mode, **does every edit automatically**:
the new ``RackXxx.{hpp,cpp}``, the three GrooveBoxRack data files (``synthdefinitions.json``,
``mui-GrooveBoxRack.json``, ``mp-GrooveBoxRack.json``), and the five wiring insertions into
``ctagSoundProcessorGrooveBoxRack.{hpp,cpp}`` (the new ``#include``, the member field, the
``Init()`` call, the ``Process()`` block, and the ``buildVoiceRegistry()`` registration).
After ``-i`` succeeds the only thing left to write is the DSP body inside ``Process()``.

1. Copy ``generators/rack-template.json`` (e.g. to ``generators/rack-mybd.json``) and edit the
   fields — ``id`` / ``className`` / ``name`` / ``type`` (``drum`` or ``synth``) / ``track``
   (0-based: 0..7 = drum tracks CH01..CH08; 8..14 = synth tracks CH09..CH15) and the ``params``
   list (each with a MIDI ``ctrl`` number and a 0..127 ``def``).

2. **Dry-run** to preview every patch and snippet — nothing is written to the source tree;
   the new ``<className>.{hpp,cpp}`` are dropped in ``cwd`` so you can eyeball them:

   .. code-block:: bash

      cd generators
      node rackgen.js rack-mybd.json

3. When the preview looks right, run **``-i``**. The tool writes everything into the source
   tree (leaving ``.bak`` files next to each file it touched) and prints a per-file status
   report (``patched: ✓ … wired: ✓ … ✓ … ✓ … ✓ …``):

   .. code-block:: bash

      node rackgen.js rack-mybd.json -i

4. Re-configure CMake (the new ``rack/RackMyBd.cpp`` is picked up by a ``file(GLOB ...)``
   that doesn't auto-refresh), then build:

   .. code-block:: bash

      cd ../simulator/build && cmake . && make

5. Fill in the DSP in your new ``RackMyBd::Process()`` (the template leaves a TODO + a few
   ``MK_FLT_PAR_*`` scaling examples). Reload the simulator, open
   ``http://localhost:8080/`` (load ``GrooveBoxRack``) and ``http://localhost:8080/ctrl``
   (the *GrooveBoxRack (MIDI)* tab). Switch to your machine via the channel's machine tab in
   the WebUI.

The descriptor is cross-checked against ``synthdefinitions.json``: id collisions, type/track
mismatches (drum on a synth track), duplicate CC numbers and reserved member names are caught
up front. The class templates live at ``generators/RackTemplateDrum.{hpp,cpp}`` /
``generators/RackTemplateSynth.{hpp,cpp}`` and use the same ``// rackgen:…`` marker scheme
``generator.js`` uses for legacy plugins, so you can re-run the generator later when you add /
remove parameters.

.. note::

   The ``-i`` mode's GrooveBoxRack wiring uses **paired anchors** in the source: the per-track
   ``// rackgen:registry-track-N`` markers at the end of each block in
   ``buildVoiceRegistry()``, plus stable text anchors (``uint32_t chN_render_time;``,
   ``chN_render_time = 0;``, ``chN_smp.track_length = chN.track_length;``,
   ``#include "rack/RackChannelMixer.hpp"``). If you've heavily edited those lines, the
   matching insertion may be skipped — the report prints ``✗`` for any unwired step and the
   raw snippet you can paste manually.


Wiring a new machine into GrooveBoxRack — by hand
=================================================

If you'd rather not use ``rackgen``, the manual recipe is below. (``rackgen`` does steps 1–3
automatically and prints the snippets for step 4.)

1. **Write the class** — ``rack/RackMyVoice.{hpp,cpp}``. Start from the closest existing voice:

   - drums: ``RackDBD`` (Plaits analog bass drum), ``RackABD`` (synthetic bass drum),
     ``RackFMB`` (FM bass drum, uses ``FmDrumPrimitives.hpp``), ``RackDSD``/``RackASD``
     (snares), ``RackHH1``/``RackHH2`` (hihats), ``RackRimshot``, ``RackClap``;
   - synths: ``RackTBD03`` (a 303), ``RackMO`` (Braids macro-oscillator), ``RackWTOsc``
     (wavetable), ``RackPolyPad`` (polyphonic pad), ``RackTBDaits`` (Plaits macro voice
     with 24 engines + wrapper AHR envelope, on CH12), ``RackTBDings`` (Modal + Plucked
     resonator with PolyPad-style poly + Air noise blend, on CH12 + CH15);
   - sampler: ``RackRompler`` (reads ``data.sampleRom``); audio in: ``RackInput``;
   - bus FX: ``RackFxDelay`` / ``RackFxReverb`` / ``RackFxMaster``; the per-track strip is
     ``RackChannelMixer``.

   ``rack/*.cpp`` are picked up automatically by the build (they're globbed when
   ``CONFIG_TBD_USE_SD_CARD`` is set — which it is on the TBD-16 and in the simulator).

2. **Describe it in** ``sdcard_image/factory/synthdefinitions.json`` — add the machine's id
   (e.g. ``"myv"``) to the relevant track's ``machines`` list, and add a ``machines`` entry
   with its CC ``parameters`` (each ``{ "id": "...", "name": "...", "type": "cc", "ctrl": N,
   "def": D }``).

3. **Add the WebUI knobs** — add a parameter group for the new machine to
   ``sdcard_image/factory/plugins/mui-GrooveBoxRack.json`` (so the WebUI's GrooveBoxRack view shows
   a tab + sliders for it), and the default values to ``sdcard_image/factory/plugins/mp-GrooveBoxRack.json``.

4. **Hook it into the rack** — in ``components/ctagSoundProcessor/ctagSoundProcessorGrooveBoxRack.{hpp,cpp}``,
   five small insertions (every one of these is what ``rackgen.js -i`` does for you):

   - in the .hpp, near the top, alongside the other ``#include "rack/RackXxx.hpp"`` lines:
     ``#include "rack/RackMyVoice.hpp"``;
   - in the .hpp class body, before the matching ``uint32_t chN_render_time;``:
     ``RackMyVoice chN_myv;``;
   - in ``Init()``, inside the track-N block (right before ``chN_render_time = 0;``):
     ``dri.prefix = "chN_myv_"; chN_myv.Init(&dri);``;
   - in ``Process()``, inside the track's ``if (chN.enabled) { … }`` block, right before the
     ``chN_smp.track_length = chN.track_length;`` line (so new voices land between the existing
     drum/synth voices and the rompler):
     ``chN_myv.Process(idata); if (chN_myv.enabled) mixRenderOutputMono(chN_myv.out, chN.level, chN.pan, chN.send1, chN.send2);``;
   - in ``buildVoiceRegistry()``, inside the track-N block (right before the
     ``// rackgen:registry-track-N`` marker), one of:

     - drum:  ``addDrumTrig(N, "myv", &chN_myv.enabled, <channel>, <note>, [this](){ chN_myv.trigger(); });``
     - synth: ``addSynth   (N, "myv", &chN_myv.enabled, <channel>, [this](uint8_t n, uint8_t v){ /*noteOn-or-Off*/ }, [this](uint8_t n, uint8_t){ chN_myv.noteOff(n, 0); });``

   That's it. ``setTrackMachine``, ``setTrackMachineByDeviceValue``, ``handleMidiNoteOn`` and
   ``handleMidiNoteOff`` are all driven by the voice registry now — they don't need a per-voice
   edit. The registry is the single source of truth for "which (track × machineId) pairs exist
   and how each MIDI input routes to a voice"; see section [4b] in
   ``ctagSoundProcessorGrooveBoxRack.cpp`` for the full layout and the ``addDrumTrig`` /
   ``addDrumRom`` / ``addSynth`` / ``addNoMidi`` helpers.

5. **Build & test** — rebuild the simulator (``cd simulator/build && cmake . && make``;
   the ``cmake .`` re-config is required because ``rack/*.cpp`` is GLOB-ed) and, when stable,
   the firmware (``idf.py build``). In the simulator: load ``GrooveBoxRack``, open
   ``http://localhost:8080/ctrl`` → *GrooveBoxRack (MIDI)*, and play the track from the drum
   pads / step sequencer (drum tracks) or the keyboard set to that track's MIDI channel (synth
   tracks). Switch to your machine via its tab in the main WebUI's GrooveBoxRack view.

   Three headless safety nets run in seconds:

   - ``simulator/build/load-test GrooveBoxRack`` — constructs the rack, injects a kick / snare /
     sampler hit, checks the output isn't silent and the FX bus actually produces a reverb tail.
   - ``simulator/build/routing-test`` — diffs the entire ``(track × machineId)`` and
     ``(channel × note × velocity)`` matrix against a checked-in golden file; catches any
     accidental reroute (e.g. "my voice fires on the wrong channel"). Re-bless the golden with
     ``./routing-test --regen`` after intentional contract changes.
   - ``simulator/build/load-test --machine <id>`` — same as load-test but isolates the named
     voice and reports its dry peak plus FX bus peak. Fast iteration loop when you're tuning
     a single voice's DSP.

   Even tighter: ``tools/dev-watch.sh --machine <id>`` watches the rack source files and
   re-runs the isolated test on every save (~2 s round-trip). Requires ``fswatch`` (macOS:
   ``brew install fswatch``) or ``inotifywait`` (Linux: ``apt install inotify-tools``).

   Pre-commit check: ``simulator/build/rack-lint`` cross-checks ``synthdefinitions.json``
   against the rack's runtime voice registry. Catches "machine X listed in JSON but no
   voice flips on for it" (silent in the WebUI) and "duplicate ``ctrl`` numbers on the
   same machine" (CC collision). Exits 0 on clean.

.. note::

   When a refactor touches anything that *might* affect the PICO ↔ P4 contract, read
   ``docs/CONTRACT-PICO.md`` in the repository root and re-run ``routing-test``. The five
   public methods of GrooveBoxRack (``setTrackMachine``, ``setTrackBank``,
   ``handleMidiNoteOn`` / ``Off``, ``handleMidiControlChange``) plus their observable
   state are what the PICO firmware (``tbd-pico-seq3`` on branch ``dada-tbd-master``)
   depends on. ``routing-test`` against the golden file is the proof.


See also
========

- :doc:`Desktop Simulator <simulator>` — how to run, the ``/ctrl`` page, ``--srom`` for samplers.
- :doc:`Plugin Architecture <architecture>` — the ``ctagSoundProcessor`` factory, the SP memory
  allocator, the parameter system that GrooveBoxRack and its Machines build on.
- :doc:`Creating a Plugin <step-by-step>` — for standalone (non-rack) ctag-tbd plugins.
