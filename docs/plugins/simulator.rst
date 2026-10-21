*********
Simulator
*********

The TBD Simulator runs the full DSP engine on your computer --- no hardware required.
It uses ~99% the same code as the device firmware, so you can develop, test and debug
plugins on your laptop before flashing them to real hardware.

The simulator opens a local web server that serves the same WebUI as the hardware module;
you drive it from your browser, just like a connected TBD-16. It makes the TBD platform
accessible to **everyone**, even without owning the hardware --- great for exploring the
plugin library, developing your own plugins, or teaching DSP.

.. important::

   The simulator exposes **two pages**, and for most plugins you need **both**:

   - ``http://localhost:8080/`` --- the main WebUI: pick a plugin per channel, edit its
     parameters, manage presets/samples.
   - ``http://localhost:8080/ctrl`` --- the **control** page, where you "play" the loaded plugin.
     It has two tabs:

     - **CV / Triggers / Pots** --- the TBD's hardware modulation inputs (4 CV in,
       2 trigger/gate in, 2 front-panel pots). **The original ctag-tbd plugins are all
       Eurorack-style and respond only to these** --- they have no MIDI input (a MIDI API for
       them is :doc:`planned <index>`, not yet implemented). You map *which* control drives
       *which* parameter from the main WebUI, exactly like on the hardware module, then drive it
       from here.
     - **GrooveBoxRack (MIDI)** *(default tab)* --- the TBD-16's macro/rack instrument is the
       **one MIDI-driven plugin** (the TBD-16 is a MIDI device, not Eurorack). Drum pads, a
       step sequencer and a piano keyboard, all wired to GrooveBoxRack's tracks. (See
       :doc:`Writing a Machine <rack-plugins>` if you're building rack voices.)

   Plugins are *silent until you send them a note / trigger* from ``/ctrl`` --- just like the
   hardware makes no sound until a CV/gate (or, for the TBD-16, a MIDI note) arrives. If you
   load a plugin and hear nothing, open ``/ctrl`` and play it.


What the Simulator Does
=======================

- Runs the CTAG TBD audio engine natively on your host
- Serves the WebUI at ``http://localhost:8080/`` and the control page at ``http://localhost:8080/ctrl``
- Plays real-time audio out of your computer's sound card (44100 Hz / 32-bit float)
- Optionally takes a ``.wav`` file as audio *input* (for testing effect plugins)
- Optionally uses an exported sample-rom (``--srom``) for rompler / wavetable plugins


Prerequisites
=============

macOS
-----

.. code-block:: bash

   brew install cmake boost

Debian / Ubuntu
---------------

.. code-block:: bash

   sudo apt-get install libboost-filesystem-dev libboost-thread-dev libboost-program-options-dev libasound2-dev

Arch Linux
----------

.. code-block:: bash

   sudo pacman -S boost

Windows (MSYS2, 64-bit)
------------------------

Install `MSYS2 <https://www.msys2.org>`_ and launch the **MinGW 64-bit** shell
(not the default MSYS shell). Update the package database:

.. code-block:: bash

   pacman -Syu

Restart the shell, then install the toolchain:

.. code-block:: bash

   pacman -Su git mingw-w64-x86_64-make mingw-w64-x86_64-gcc mingw-w64-x86_64-cmake mingw-w64-x86_64-libtool mingw-w64-x86_64-jq mingw-w64-x86_64-boost


Building
========

1. Make sure the git submodules are present (the simulator pulls in RtAudio,
   Simple-Web-Server, esp-dsp, and the Mutable ``eurorack`` sources as submodules):

   .. code-block:: bash

      git submodule update --init --recursive

2. Navigate to the simulator directory and create a build folder:

   .. code-block:: bash

      cd simulator
      mkdir -p build && cd build

3. Run CMake and compile:

   .. code-block:: bash

      cmake .. && make

   On Windows (MSYS2), use:

   .. code-block:: bash

      cmake -G "MinGW Makefiles" ..
      mingw32-make


Running
=======

From the build directory (it expects to be run from ``simulator/build/`` --- the default
``--srom`` path is relative to it):

.. code-block:: bash

   cd simulator/build
   ./tbd-sim

Then open **both** ``http://localhost:8080/`` and ``http://localhost:8080/ctrl`` in Chrome /
Edge / Opera. The simulator runs until you press **Enter** in the terminal.

.. tip::

   Paste **one command per line** into the terminal --- don't paste lines with ``#`` comments;
   in interactive ``zsh`` the ``#`` isn't stripped and a word like *"if"* in the comment text
   can leave the shell stuck at an ``if>`` prompt (press **Ctrl-C** to recover). If you see
   ``zsh: no such file or directory: ./tbd-sim`` you're not in ``simulator/build/``.


Choosing the Audio Device
=========================

The simulator wants a sound card that supports **44100 Hz, 32-bit float**. By default it uses
device ``0``; if that device is full-duplex it runs input+output, otherwise it falls back to
output-only.

- **List the available devices and their IDs / capabilities:**

  .. code-block:: bash

     ./tbd-sim --list

- **Use a specific device** (e.g. device 3 --- a USB audio interface):

  .. code-block:: bash

     ./tbd-sim --device 3

- **Force output-only** (no audio input --- fine for synth plugins):

  .. code-block:: bash

     ./tbd-sim --output

If the simulator exits right after ``Trying to open device id: N`` it couldn't open that
device --- run ``--list`` and try another ``--device``. On a Mac, a dedicated USB audio
interface (e.g. a Focusrite Scarlett) generally gives the cleanest result; the built-in
output works too but is more prone to occasional crackle (see *Troubleshooting* below).

Step by step --- start the simulator on a chosen interface
----------------------------------------------------------

1. Go to the build directory and list the audio devices:

   .. code-block:: bash

      cd ~/Documents/GitHub/dadamachines-ctag-tbd-dev/simulator/build
      ./tbd-sim --list

   You'll get lines like::

      device = 0 PHL: PHL 272P7V: maximum duplex channels = 0
      device = 1 PHL: 27E1N1800A: maximum duplex channels = 0
      device = 3 Focusrite: Scarlett 18i8 USB: maximum duplex channels = 8
      device = 5 Apple Inc.: MacBook Air Microphone: maximum duplex channels = 0

   Note the ``device = N`` number of the interface you want to use. A ``maximum duplex
   channels`` of ``2`` or more means it can do input+output (good for effect plugins);
   ``0`` means output-only.

2. Start the simulator on that device --- e.g. the Focusrite at id 3:

   .. code-block:: bash

      ./tbd-sim --device 3

   ...or the built-in output (typically id 0), output-only:

   .. code-block:: bash

      ./tbd-sim --device 0 --output

   ...or with a WAV file as input (so effect plugins have something to process):

   .. code-block:: bash

      ./tbd-sim --device 3 --wav ~/path/to/loop.wav

3. Wait for ``Server listening on port 8080``, then open **both**
   ``http://localhost:8080/`` and ``http://localhost:8080/ctrl`` in Chrome.

One-liner (clone path + chosen device):

.. code-block:: bash

   cd ~/Documents/GitHub/dadamachines-ctag-tbd-dev/simulator/build && ./tbd-sim --device 3

(Copy each command on its own line --- don't paste the ``#``-commented examples; see the
*Running* tip above.)


Command-Line Options
--------------------

.. code-block:: text

   -h [ --help ]      Show help message
   -s [ --srom ]      Sample-ROM file (default: ../../sample_rom/sample-rom.tbd — see note below)
   -l [ --list ]      List sound cards
   -d [ --device ]    Sound card device ID (default: 0)
   -o [ --output ]    Output only (no audio input)
   -w [ --wav ]       Read audio in from a WAV file (stereo float32, loops indefinitely)


Using WAV Input (for effect plugins)
====================================

Effect plugins (reverbs, delays, chorus, filters, …) process an *incoming* audio signal ---
in output-only mode there's no input, so they produce silence. Feed them a stereo, 32-bit
float WAV file instead:

.. code-block:: bash

   ./tbd-sim --wav path/to/input.wav

The file loops indefinitely. (Or use a full-duplex audio device so live input goes through.)


Plugins to Try
==============

Most plugins fall into three groups; here's what works well in the simulator and what needs
extra setup:

**Synth plugins --- work out of the box** (load one on channel A, then open ``/ctrl`` and
hit a trigger / send a note):

- ``TBD03`` --- TB-303 emulation
- ``MacOsc`` / ``MacOscDuo`` --- Mutable Braids oscillator
- ``TBDaits`` --- Mutable Plaits port
- ``Subbotnik`` --- West-coast style voice
- ``SubSynth`` --- band-pass-cascade sub synth
- ``Karpuskl`` --- Karplus–Strong string
- ``Talkbox`` --- oscillator + talkbox effect
- ``Bjorklund`` --- Euclidean-rhythm pattern voice
- ``Antique``, ``PolyPad``, ``APCpp``, ``SineSrc``, ``Hihat1``, ``RecNPlay``

**Effect plugins --- need an audio input.** Reverbs (``MIVerb``, ``GDVerb``, ``GVerb``,
``FVerb``, …), delays (``MonoDelay``, ``CDelay``, ``TDelay``, ``StrampDly``, ``FBDlyLine``),
chorus/ensemble (``EChorus``, ``MIChorus``, ``MIEnsemble``), filters (``MoogFilt``, ``MISVF``),
``CStrip``/``CStripM``, ``BCSR``, ``SpaceFX``, ``Claude`` (Clouds), ``TBDings`` (Rings) — run
the simulator with ``--wav some.wav`` (or a full-duplex device) or you'll just hear silence.

**Sample / wavetable plugins.** ``Rompler``, ``WTOsc``, ``WTOscDuo``, ``Freakwaves``,
``VctrSnt`` (and ``GrooveBoxRack``'s Rompler tracks CH07/CH08) read from a sample-rom.
**A sample-rom is bundled in the repo** at ``sample_rom/sample-rom.tbd`` (~4.7 MB — drums,
a4_dub kit, wavetables, etc.) and the simulator's ``--srom`` flag defaults to it, so these
plugins play out of the box. Pass ``--srom path/to/other.tbd`` to use a different one (e.g.
one you exported from your TBD-16's WebUI).

**Racks --- ``GrooveBoxRack`` and ``DrumRack``** are stereo multi-voice racks (the TBD-16
groovebox engine). They work in the simulator, but ``GrooveBoxRack`` is **MIDI-driven**, not
trigger-driven: on the hardware it's played by the RP2350 step sequencer (or external MIDI),
and the simulator has neither --- so it's silent until you send it MIDI from the ``/ctrl``
page's **GrooveBoxRack (MIDI)** tab. Load ``GrooveBoxRack`` on channel A, open ``/ctrl`` →
*GrooveBoxRack (MIDI)*, and in the **Step sequencer** section hit **4/4 demo → Play**.
Or play it manually:

- the **8 drum tracks** are addressed by *fixed* MIDI ch + note (the rack's own mapping ---
  it isn't a GM drum range): tracks 1–3 = MIDI **ch 10** notes 36/37/38, tracks 4–6 = MIDI
  **ch 11** notes 36/37/38, tracks 7–8 = MIDI **ch 12** notes 36/37. The ``/ctrl`` page's
  **D1…D8 drum pads** (and the step sequencer rows) send exactly those. In the simulator the
  drum tracks default to: digital BD, FM BD, digital snare, hi-hat, rimshot, clap, then 2 samplers;
- the **melodic tracks** take pitched notes on **MIDI channels 1–7** (one per track) --- in the
  simulator tracks ch9/ch10 are TBD-303s (MIDI ch 1 & 2) and ch11 a Braids macro-osc (MIDI ch 3)
  by default; play those with the ``/ctrl`` keyboard set to the matching Channel.

(On the hardware the RP2350 / macro layer assigns the machines; the simulator has no macro
layer, so it uses that fixed default layout. The sampler tracks play from the bundled
sample-rom out of the box. You *can* edit the rack's parameters from the WebUI's
GrooveBoxRack view and they take effect; the simulator applies clean master + FX-bus
defaults at boot — turn up a track's *FX Send 1 / 2* in the WebUI to hear the delay /
reverb on that track. The "kits" you'd load on the hardware via the *Macros* page aren't
wired in the simulator yet — that needs the macro/preset layer ported over, see backlog.)

``DrumRack`` is the simpler, trigger-driven rack --- map its ``*_trigger`` parameters to a
``/ctrl`` trigger in the WebUI and use the **CV / Triggers / Pots** tab. (The committed
``spm-config.json`` boots ``GrooveBoxRack`` on channel A by default.)


The Control page (the ``/ctrl`` page)
=====================================

``http://localhost:8080/ctrl`` has two tabs.

**GrooveBoxRack (MIDI)** *(the default tab — the TBD-16's one MIDI-driven plugin)* --- the rack's
macro/rack instrument. ``GrooveBoxRack`` is currently the only TBD plugin with a MIDI API; on the
hardware the RP2350 step-sequencer / USB-MIDI feeds it, in the simulator MIDI is injected here.
Three collapsible sections:

- **Drum pads** --- ``01 Kick`` … ``08 Smp``, one button per GrooveBoxRack drum track (each on
  its fixed MIDI ch + note --- see the racks note above). Press to trigger.
- **Step sequencer** --- an 8-track × 16-step grid wired to those 8 drum pads. Click a cell to
  cycle off → on → accent → off; **drag** across cells to paint a run on/off; **shift+click**
  toggles a cell's accent. The little **M** button next to each row label mutes that row's
  firing without erasing the pattern. **Play** runs it at the **Tempo** you set; **4/4 demo**
  drops in a basic kick/snare/hat pattern; **Clear** empties it.
- **Keyboard & Hardware Input** --- this section combines the on-screen piano (``webaudio-keyboard``)
  with a **WebMIDI** bridge so you can drive the rack from a real USB-MIDI controller (Launchkey
  Mini MK4, Push, etc.). Click **Enable WebMIDI** once to grant the browser permission, pick
  your controller from the **Input** dropdown, and the controller's notes / CC / velocity stream
  straight through to ``/ctrl-midi``. The on-screen-keyboard's **Channel** dropdown is
  authoritative for *every* input source (on-screen keys, computer keyboard, hardware MIDI):
  pick ``MIDI 4 → CH12 Lead 2`` and the Launchkey plays whatever machine is loaded on CH12 —
  change the WebUI's machine and the hardware follows with no controller reconfig. Click the
  small **ⓘ** next to the status pill for the full routing rules; click-drag the piano for a
  glissando; click the keyboard once, then play it from your computer keyboard (``z s x d c …``
  / ``q 2 w 3 e …``). Chrome / Edge / Opera on localhost support WebMIDI without HTTPS; Safari
  needs an experimental flag.

The big intro paragraph at the top of the tab is collapsible (`<details>`) — open it for the
MIDI-channel ↔ track map, fold it away once you've read it.

If you're building GrooveBoxRack voices ("rack plugins"), see
:doc:`Writing a Machine <rack-plugins>`.

**CV / Triggers / Pots** *(legacy plugins — the original ctag-tbd Eurorack-style plugins)* --- the
TBD's hardware modulation inputs: **2 trigger/gate inputs** (manual gate button or pulse-train),
**4 CV inputs** and the **2 front-panel pots** (manual slider or an LFO / step generator). Almost
every ctag-tbd plugin is Eurorack-style and is driven *only* through these. You don't address a
parameter directly here --- instead, in the **main WebUI** you set the small dropdown next to a
parameter to ``CV0`` / ``TRIG0`` / ``POT0`` …, and this tab drives that input. (Example:
``DrumRack`` --- map each drum's ``*_trigger`` parameter to a trigger input, then hit the gate
buttons.)

Developing Plugins with the Simulator
=====================================

The simulator uses the same plugin code and directory structure as the firmware:

1. Create your plugin in ``components/ctagSoundProcessor/`` as in the
   :doc:`Plugin Tutorial </plugins/step-by-step>`.
2. ``cd simulator/build && cmake .. && make && ./tbd-sim`` --- test immediately, no flashing.
3. Once stable, build the ESP-IDF firmware (``idf.py build``) and flash to hardware.

If you're building a **GrooveBoxRack machine** (a voice for the TBD-16's rack instrument
rather than a standalone Eurorack-style plugin), the workflow is more streamlined --- one
scaffolder command + a few headless harnesses. Start with the
:doc:`Hello, Machines tutorial <rack-tutorial>` for a 15-minute walk-through; the full
reference is in :doc:`Writing a Machine <rack-plugins>`.

Headless harnesses (alongside the WebUI)
----------------------------------------

Three command-line tools live in ``simulator/build/`` for fast iteration without opening
a browser:

- ``./load-test [PluginId]`` --- construct + Init + LoadPreset + Process for one (or
  ``--all``) sound processors. Catches "loading plugin X crashes". For ``GrooveBoxRack``
  it also exercises the FX bus and the sampler path.
- ``./load-test --machine <id>`` --- isolate one rack voice (drum or synth), fire its
  note, report dry + FX-bus peak. The fast inner loop while tuning a voice's DSP.
  The voice list is auto-derived from ``synthdefinitions.json`` --- no manual table.
- ``./routing-test`` --- regression test that diffs every ``(track × machineId)`` and
  every ``(channel × note × velocity)`` against a checked-in golden file. Run it after
  any change to the GrooveBoxRack dispatch path; ``PASS`` means byte-identical
  externally-observable behaviour to the reference.
- ``./rack-lint`` --- cross-checks ``synthdefinitions.json`` against the runtime
  voice registry. Catches "machine X is listed but no voice flips on for it" (silent
  in the WebUI) and "duplicate ``ctrl`` numbers on a machine" (CC collision).

For hands-free dev: ``tools/dev-watch.sh [--machine <id>]`` watches the rack sources
and re-runs the headless tests on every save. Needs ``fswatch`` (macOS:
``brew install fswatch``) or ``inotifywait`` (Linux: ``apt install inotify-tools``).

Registering a New Plugin
------------------------

The simulator **re-scans** ``sdcard_image/factory/plugins/mui-*.json`` for the plugin list on every
startup, so a new (or renamed) plugin appears as soon as you restart ``tbd-sim`` --- no
manual step needed. (On the *device* the list is cached in ``spm-config.json``'s
``availableProcessors`` to keep boot fast; the simulator ignores that cache.)

If something still looks stale --- e.g. after pulling changes --- a ``git checkout
sdcard_image/factory/spm-config.json`` resets that file (the simulator writes runtime state into
it, so it tends to get dirty), then restart.


Troubleshooting / Known Issues
==============================

**Occasional crackle / glitches in the audio.** The simulator runs the DSP in 32-sample
blocks --- the same as the device --- which is a very tight ~0.7 ms latency for a
non-realtime desktop OS, so a brief scheduling hiccup can cause an underrun (crackle). It
asks for a realtime-priority audio thread, but to minimise it: use a **dedicated USB audio
interface** rather than built-in/HDMI audio, pick that device with ``--device N``, plug your
laptop into power (not battery), and close CPU-heavy apps. (This is a desktop-only artifact;
the device itself runs the same DSP on a realtime scheduler.)

**The simulator exits right after ``Trying to open device id: N``.** It couldn't open that
audio device at 44100 Hz / 32-bit float. Run ``./tbd-sim --list`` and try another
``--device``; ``--output`` forces output-only.

**``Trying to open sample rom file ... sample-rom.tbd``** — the sample-rom is bundled at
``sample_rom/sample-rom.tbd`` and the simulator's ``--srom`` defaults to it, so this is
just the load message (you should see ``Done loading samples, total size … bytes`` right
after). If it WARNs that the file is missing, you're probably running the binary from
somewhere other than ``simulator/build`` — pass ``--srom /full/path/sample-rom.tbd`` to fix.

**The shell gets stuck at an ``if>`` prompt** when you paste commands --- you pasted a line
containing a ``#`` comment (interactive ``zsh`` doesn't treat ``#`` as a comment, and a word
like *"if"* in the comment text starts an ``if`` statement). Press **Ctrl-C**; paste only the
bare command. (Or ``setopt interactivecomments``.)


Cloud Builds
============

GitHub Actions can build simulator binaries for Windows and macOS automatically. Enable
Actions for your fork, then customize the workflows in ``.github/workflows/`` to suit.
