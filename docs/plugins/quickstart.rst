**********
Quickstart
**********

In ~10 minutes you'll be running the **same audio engine the TBD-16 ships with**
on your laptop, playing it from your browser, and ready to either write a new
plugin or add a new GrooveBoxRack voice.

No hardware required.


1. Clone with submodules
========================

.. code-block:: bash

   git clone --recurse-submodules https://github.com/dadamachines/ctag-tbd
   cd ctag-tbd

(If you already cloned without ``--recurse-submodules``:
``git submodule update --init --recursive``.)


2. Build the simulator
======================

The simulator runs the full audio engine + Web UI on macOS / Linux / Windows.
You need **CMake**, a **C++17 compiler**, and a few dev libs.

**macOS** (Homebrew):

.. code-block:: bash

   brew install cmake boost
   cd simulator && mkdir -p build && cd build
   cmake .. && make

List the available audio devices, then start the simulator on one of them
(replace ``<N>`` with the number from the list):

.. code-block:: bash

   ./tbd-sim --list

.. code-block:: bash

   ./tbd-sim --device <N>

**Linux** (Debian/Ubuntu):

.. code-block:: bash

   sudo apt install build-essential cmake libboost-all-dev libasound2-dev
   cd simulator && mkdir -p build && cd build
   cmake .. && make
   ./tbd-sim --list && ./tbd-sim --device <N>

Once you see ``Server listening on port 8080``, open **two browser tabs**:

- ``http://localhost:8080/`` — the **Web UI** (pick plugins, edit parameters).
- ``http://localhost:8080/ctrl`` — the **control surface** (CV / triggers / pots
  for legacy plugins, drum pads / step sequencer / MIDI keyboard for the TBD-16's
  GrooveBoxRack).

You should hear sound the moment a plugin is loaded and you trigger it from
``/ctrl``. Default boot loads the ``GrooveBoxRack`` on channel A: hit the
**4/4 demo → Play** in the step sequencer and you have a beat. The drum samples
on tracks CH07/CH08 (Rompler) play from the **sample-rom bundled in the repo**
(``sample_rom/sample-rom.tbd``, 4.7 MB; the simulator's ``--srom`` defaults to
it). See :doc:`/get_started/simulator` for audio-device gotchas, ``--wav`` for effect plugins,
and ``--srom`` for a different sample-rom.

**Headless smoke test** — handy in CI and during fast voice-iteration:
``simulator/build/load-test GrooveBoxRack`` constructs the rack, fires a few
notes (incl. a sampler hit), exercises the FX bus and prints a pass/fail line.
``./load-test --all`` runs the smoke test over a representative set of plugins.


3. Pick your path
=================

The TBD ecosystem has **two kinds of plugin**, and they're built differently.

.. list-table::
   :header-rows: 1
   :widths: 22 39 39

   * -
     - Legacy plugin (Eurorack-style)
     - GrooveBoxRack machine (TBD-16)
   * - **What it is**
     - A standalone ``ctagSoundProcessor`` — synth, effect, filter, oscillator…
       Driven by 2 trigger inputs + 4 CV inputs + 2 pots.
       (~50 ship today; **MIDI API is planned**, not yet implemented.)
     - A voice ("machine") that lives inside the TBD-16's ``GrooveBoxRack`` — drum,
       synth, sampler, FX. Driven by MIDI notes via the rack's 16-track macro
       layer.  Files live in ``components/ctagSoundProcessor/rack/``.
   * - **Files to write**
     - One ``ctagSoundProcessorXxx.{cpp,hpp}`` in ``components/ctagSoundProcessor/``
       + one ``mui-Xxx.json`` (UI spec) + one ``mp-Xxx.json`` (preset). The MUI
       is what you write by hand; the rest is generated.
     - One ``RackXxx.{cpp,hpp}`` in ``components/ctagSoundProcessor/rack/`` +
       small patches to ``synthdefinitions.json`` / ``mui-GrooveBoxRack.json`` /
       ``mp-GrooveBoxRack.json`` + one ``addDrumTrig``/``addSynth`` line in
       ``buildVoiceRegistry()`` (plus a member, an ``Init()`` line and a
       ``Process()`` block — all five auto-applied by ``rackgen.js -i``).
   * - **Scaffolder**
     - ``generators/generator.js`` — reads your MUI, generates the .hpp/.cpp +
       default preset.
     - ``generators/rackgen.js`` — reads a small descriptor JSON, generates the
       class, patches the JSON data files **and** auto-wires the new voice into
       ``ctagSoundProcessorGrooveBoxRack`` (``-i`` does it all; dry-run prints
       every patch first).
   * - **Run it in the simulator**
     - Build, load it from the Web UI, send it CV/triggers from ``/ctrl``.
     - Build, load ``GrooveBoxRack``, pick your machine from the channel's
       Machine dropdown, play it from the ``/ctrl`` page's drum pads /
       sequencer (drums) or MIDI keyboard (synths). The headless smoke
       test ``./load-test GrooveBoxRack`` exercises the whole chain.
   * - **Deep dive**
     - :doc:`Creating a Plugin <step-by-step>`
     - :doc:`Hello, Machines tutorial <rack-tutorial>` ·
       :doc:`Writing a Machine <rack-plugins>` ·
       :doc:`Machines catalogue <machines>`


4. Build & flash for hardware (later)
=====================================

When the simulator version sounds right, build the ESP-IDF firmware and flash
it to a TBD board. See :doc:`Building & Flashing <building>` for the full
setup (ESP-IDF v5.5 + ``esp32p4`` target, OTA + USB-MSC channels).

The same C++ source compiles to both targets; the simulator is roughly 99 %
the device's audio code with the I/O peripherals stubbed.


Next steps
==========

- :doc:`Plugin Architecture <architecture>` — how plugins discover the runtime,
  the ``ctagSPAllocator`` static pool, parameter ↔ CV/trig mapping.
- :doc:`Web API <web-api>` — the REST surface the Web UI talks to (the
  simulator exposes the same one).
- The :doc:`Desktop Simulator </get_started/simulator>` page — `--device` / `--wav` / `--srom`,
  the ``/ctrl`` control surface, troubleshooting (crackle, blank keyboard, …).
- For ``GrooveBoxRack`` voices specifically: the headless ``load-test``
  (``simulator/build/load-test GrooveBoxRack``) constructs the rack, fires
  notes, exercises the FX bus and asserts the output isn't silent — useful
  in CI and during fast iteration.
