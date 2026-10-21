****************************************
Hello, Machines — your first rack voice
****************************************

.. note::

   This is the **end-to-end walk-through** for adding a new **Machine** (a voice that
   lives inside the TBD-16's ``GrooveBoxRack`` — sometimes called a *rack plugin* in
   the codebase). In ~15 minutes you'll add a new drum Machine called ``my2``, hear it
   from the desktop simulator (no hardware needed), and have it routed through the
   WebUI's machine tabs.

   **New to the project?** Read :doc:`Quickstart <quickstart>` first — it covers the
   one-time setup (clone, OS-specific dependency install, building the simulator)
   and the legacy-plugin vs Machine distinction. Then come back here. **Already
   built the simulator?** Skip to *Step 1* below.

   Other references: :doc:`Writing a Machine <rack-plugins>` for the API
   reference (every macro, every helper), :doc:`Machines page <machines>` for the
   catalogue of every Machine that ships today, :doc:`Desktop Simulator <simulator>`
   for the simulator's flags and ``/ctrl`` page details.


What we're building
===================

A drop-in replacement for the *Analog Bass Drum* voice on **Kick 2** (track 1, the
second drum strip). It will:

- Live on **MIDI channel 10 (= channel index 9), note 37** — same as the existing
  ``fmb`` voice on that track.
- Have **two parameters** — ``freq`` (pitch) and ``decay`` (envelope length) — exposed
  as MIDI CCs and as WebUI sliders.
- Render a simple sine-burst envelope (we're not chasing audio quality here — we're
  proving the toolchain).

By the end you'll have written about **15 lines of DSP**. The wiring is one command.


Prerequisites
=============

You need:

- A C++17 compiler (Apple ``clang`` / GCC / MSYS2 ``mingw-w64-x86_64-gcc``)
- **CMake 3.16 or newer**
- **Boost** — ``filesystem``, ``thread``, ``program_options``

  - **macOS:** ``brew install cmake boost``
  - **Debian / Ubuntu:** ``sudo apt install build-essential cmake libboost-all-dev libasound2-dev``
  - **Arch:** ``sudo pacman -S cmake boost``
  - **Windows:** see :doc:`Quickstart <quickstart>` for the MSYS2 setup.

You **don't** need ESP-IDF, a TBD-16 board, or an audio interface. Everything
in this walk-through runs on your laptop's default sound device.

Now clone the repo and build the simulator:

.. code-block:: bash

   git clone --recurse-submodules https://github.com/dadamachines/ctag-tbd
   cd ctag-tbd
   cd simulator && mkdir -p build && cd build && cmake .. && make tbd-sim load-test routing-test
   ./tbd-sim -o

(Already cloned without ``--recurse-submodules``? Run
``git submodule update --init --recursive`` from the repo root, then redo the
``cmake .. && make`` step.)

Confirm the baseline works: open ``http://localhost:8080/``, load *GrooveBoxRack*,
then open ``http://localhost:8080/ctrl`` → *GrooveBoxRack (MIDI)* and play the
drum pads. You should hear the default kit. Now Ctrl-C the simulator and proceed.

If the build fails or the simulator crashes on launch, see the :doc:`Desktop
Simulator <simulator>` page — it has per-OS dependency notes, audio-device
gotchas, and the most common fixes.


Step 1 — Write a 12-line descriptor
====================================

The descriptor is the single source of truth — ``rackgen.js`` consumes it and edits
everything else. Create ``generators/rack-my2.json``:

.. code-block:: json

   {
     "id": "my2",
     "className": "RackMy2",
     "name": "My BD 2",
     "type": "drum",
     "track": 1,
     "params": [
       { "id": "freq",  "name": "Freq",  "ctrl": 8, "def": 32 },
       { "id": "decay", "name": "Decay", "ctrl": 9, "def": 24 }
     ]
   }

The cross-references this enforces:

- ``track: 1`` is the *Kick 2* track — its MIDI channel and note number come from
  ``sdcard_image/factory/synthdefinitions.json``. (Drum track 1 is channel-index 9,
  note 37 — but you don't need to write that anywhere; the registry registration
  will read it from the descriptor automatically.)
- ``type: "drum"`` means you implement ``trigger()`` (not ``noteOn``/``noteOff``);
  the descriptor must match the target track's type or ``rackgen.js`` refuses.
- ``ctrl: 8, 9`` are the per-machine MIDI CC numbers. Convention: machine params
  start at 8 (the channel mixer occupies 1..7). Each ``ctrl`` must be unique
  *within this machine*.


Step 2 — Dry-run rackgen.js (sanity check)
===========================================

Before changing anything in your tree, preview every patch:

.. code-block:: bash

   cd generators
   node rackgen.js rack-my2.json

You'll see:

- ``generated RackMy2.hpp + .cpp in .../generators`` — the class skeleton, written
  to ``cwd`` so you can eyeball it. (In dry-run mode nothing else is touched.)
- Three JSON patch previews for ``synthdefinitions.json``, ``mui-GrooveBoxRack.json``,
  ``mp-GrooveBoxRack.json``.
- Four ``ctagSoundProcessorGrooveBoxRack.{hpp,cpp}`` wiring snippets — the
  ``#include``, the member, the ``Init()`` line, the ``Process()`` block, and the
  ``buildVoiceRegistry()`` line.
- A footer: ``(track 1 = WebUI CH02 "Kick2", MIDI ch 10 note 37)``.

Confirm the values look sane, then delete the temporary files in ``generators/``:

.. code-block:: bash

   rm RackMy2.hpp RackMy2.cpp


Step 3 — Apply with -i (the one command)
=========================================

.. code-block:: bash

   node rackgen.js rack-my2.json -i

Output ends with:

.. code-block:: text

   patched: ✓ synthdefinitions.json   ✓ mui-GrooveBoxRack.json   ✓ mp-GrooveBoxRack.json
   wired:   ✓ GrooveBoxRack.hpp member  ✓ Init()  ✓ Process()  ✓ buildVoiceRegistry()
   (.bak files kept for every file we touched — diff if anything looks off.)

   Next steps:
     1. cd simulator/build && cmake . && make
     2. Open RackMy2.cpp and fill in the DSP body inside Process().

Every ``✓`` means an automatic insertion succeeded. If any line is ``✗``, the report
also prints the raw snippet you can paste manually (almost never needed).

The new files live at:

- ``components/ctagSoundProcessor/rack/RackMy2.{hpp,cpp}`` — your class.
- Five edits in ``components/ctagSoundProcessor/ctagSoundProcessorGrooveBoxRack.{hpp,cpp}``
  — wiring.
- Updated ``sdcard_image/factory/synthdefinitions.json`` and ``mui-/mp-GrooveBoxRack.json``.


Step 4 — Build the simulator (CMake re-config required)
=======================================================

The new ``rack/RackMy2.cpp`` is picked up by a ``file(GLOB ...)`` in CMake that does
not auto-refresh. You must re-run ``cmake .`` once after adding a file:

.. code-block:: bash

   cd ../simulator/build
   cmake . && make

If you skip ``cmake .`` you'll get a linker error about ``RackMy2::trigger()`` not
being found — the .cpp wasn't added to the build. That's the symptom; re-run cmake.


Step 5 — Verify the baseline still works
=========================================

Before touching the DSP, make sure the wiring is healthy. Run the two headless
harnesses:

.. code-block:: bash

   ./load-test GrooveBoxRack

.. code-block:: bash

   ./routing-test

Both should report ``PASS``. ``load-test`` confirms the rack constructs, fires
notes and isn't silent; ``routing-test`` confirms the new voice didn't break
any existing routing
(it shouldn't — the new entry is added to the registry but only fires when
``ch2_my2.enabled = true``, which only happens when *you* select ``"my2"`` from the
machine dropdown).


Step 6 — Write the DSP (the only manual part)
==============================================

Open ``components/ctagSoundProcessor/rack/RackMy2.cpp``. The template gave you:

- An ``Init()`` that registers both parameters with ``registerParamAndCC``.
- A ``trigger()`` stub that sets ``midi_trig = true``.
- A ``Process()`` skeleton that reads the params via ``MK_FLT_PAR_*`` macros and
  fills ``out[BUF_SZ]`` with zeros.

Replace the body of ``Process()`` with a sine-burst:

.. code-block:: cpp

   void RackMy2::Process(const GrooveBoxRackProcessData &data) {
       bool _trig = false;
       if (midi_trig) { _trig = true; midi_trig = false; }
       if (!this->enabled) return;

       MK_FLT_PAR_ABS_NOCV(fFreq,  freq,  4095.f, 1.f)   // 0..1
       MK_FLT_PAR_ABS_NOCV(fDecay, decay, 4095.f, 1.f)   // 0..1

       // Map fFreq 0..1 to 50..200 Hz; fDecay 0..1 to 50..1000 ms (samples at 44.1 kHz).
       const float freqHz   = 50.f  + fFreq  * 150.f;
       const int   decaySps = static_cast<int>((50.f + fDecay * 950.f) * 44.1f);

       if (_trig) { phase_ = 0.f; envSamples_ = decaySps; }

       const float dPhase = freqHz / 44100.f;
       for (int i = 0; i < BUF_SZ; i++) {
           float env = envSamples_ > 0 ? (envSamples_ / static_cast<float>(decaySps)) : 0.f;
           out[i] = std::sin(2.0f * 3.14159265f * phase_) * env * 0.8f;
           phase_ += dPhase;
           if (phase_ > 1.f) phase_ -= 1.f;
           if (envSamples_ > 0) envSamples_--;
       }
   }

You also need two private members in ``RackMy2.hpp`` (alongside the ``atomic<int16_t>``
parameter members the template generated):

.. code-block:: cpp

   private:
       float phase_   { 0.f };
       int   envSamples_ { 0 };

Add ``#include <cmath>`` at the top of ``RackMy2.cpp`` for ``std::sin``.


Step 7 — Build and hear it
==========================

Rebuild — no ``cmake .`` re-run needed this time (we only edited existing files,
no new file was added to the GLOB):

.. code-block:: bash

   make

.. code-block:: bash

   ./tbd-sim -o

Open ``http://localhost:8080/``, load *GrooveBoxRack*, then in the **CH02 (Kick2)**
machine tabs, pick **My BD 2**. Open ``http://localhost:8080/ctrl`` → *GrooveBoxRack (MIDI)*
and hit the **Kick 2** pad. You'll hear a short sine-burst kick. Move the *Freq* /
*Decay* sliders in the WebUI — the sound changes in real time.

If the sliders aren't there, force-refresh the WebUI (Cmd-Shift-R / Ctrl-F5) — Shoelace
caches param specs aggressively. If you hear nothing, check:

- ``./load-test --machine my2`` — does the isolated-voice test produce a non-zero peak?
- The machine dropdown in CH02 — is *My BD 2* actually selected?
- The mute switch on the CH02 strip in the WebUI.


Step 8 — Iterate fast
=====================

The single-voice harness is the tightest loop while you're tuning DSP — it
constructs the rack, picks ``my2``, fires a kick, and reports the peak:

.. code-block:: bash

   ./load-test --machine my2

Re-run after every edit. When the peak / shape looks right, jump to the
simulator for the actual audible test.

When you're satisfied, build the firmware too:

.. code-block:: bash

   cd ../..
   . ~/esp/esp-idf/export.sh
   idf.py build

If the firmware build is OK, your voice is real — flashing the TBD-16 will give
you the same sound from the device.


Step 9 — Commit (or roll back)
==============================

What changed (after Step 3 + the DSP edits):

.. code-block:: text

   components/ctagSoundProcessor/rack/RackMy2.hpp        (new)
   components/ctagSoundProcessor/rack/RackMy2.cpp        (new)
   components/ctagSoundProcessor/ctagSoundProcessorGrooveBoxRack.hpp   (+2 lines)
   components/ctagSoundProcessor/ctagSoundProcessorGrooveBoxRack.cpp   (+5 lines)
   sdcard_image/factory/synthdefinitions.json               (+1 machine entry, +id in track 1's machines list)
   sdcard_image/factory/plugins/mui-GrooveBoxRack.json           (+1 param group)
   sdcard_image/factory/plugins/mp-GrooveBoxRack.json            (+2 preset defaults)
   generators/rack-my2.json                              (new — keep this for re-running rackgen)

If you want to roll back, every file ``rackgen.js -i`` touched has a ``.bak``
next to it. Restore them and drop the new files:

.. code-block:: bash

   for f in $(git status --porcelain | awk '/^\s*M / {print $2}'); do
     [ -f "$f.bak" ] && mv "$f.bak" "$f"
   done
   rm components/ctagSoundProcessor/rack/RackMy2.{hpp,cpp}

Then ``git status -s`` should print nothing.


Step 10 — Share your Machine
============================

If your Machine is something other people would want, we'd love a pull request.
Two things to know before you open one:

- **PR target branch is** ``staging`` **on** ``dadamachines/ctag-tbd`` (not
  ``dada-tbd-master``). The ``staging`` branch is the external-contributor
  intake queue; ``dada-tbd-master`` is a read-only release snapshot that
  maintainers update from a private working repo. The PR template will
  remind you to change the base branch if GitHub auto-selected master.
- **First-time contributors** sign a short CLA via the CLA-assistant bot —
  it comments on your PR with a one-click sign link.

The full workflow (fork → branch off ``staging`` → push → PR) plus the
firmware-CI / CDN flow lives in `CONTRIBUTING.md
<https://github.com/dadamachines/ctag-tbd/blob/dada-tbd-master/CONTRIBUTING.md>`_.

Need help or want to share before opening a PR? The community lives here:

- `dadamachines Forum <https://forum.dadamachines.com>`_ — ask questions, share
  patches, get feedback on a Machine you're working on.
- `GitHub Issues <https://github.com/dadamachines/ctag-tbd/issues>`_ — bug
  reports, build failures, feature requests.


See also
========

- :doc:`Writing a Machine <rack-plugins>` — the reference: every parameter macro,
  the voice-registry helpers, the channel-mixer surface, every trigger / noteOn /
  noteOff contract detail.
- :doc:`Desktop Simulator <simulator>` — ``-o`` / ``--srom`` flags, the ``/ctrl``
  page, per-OS dependency installs, troubleshooting common issues.
- :doc:`Machines catalogue <machines>` — the 17 Machines that ship today, with
  their internal id, the track they live on, and a link to the user-facing page.
- :doc:`Quickstart <quickstart>` — the one-page intro to the whole TBD project,
  including the legacy-plugin vs Machine distinction and the firmware build path.
