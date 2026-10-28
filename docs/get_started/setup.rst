*****************
Development setup
*****************

Two toolchains, and you need the second only for hardware:

1. **The simulator:** CMake and a C++17 compiler. Enough for writing and
   testing machines and plugins.
2. **ESP-IDF for the ESP32-P4:** to build the firmware and flash it over USB.

No debug probe is needed. RP2350 apps use PlatformIO instead: see
:doc:`App Development Setup </apps/getting-started>`.


Get the source
==============

.. code-block:: bash

   git clone --recursive https://github.com/dadamachines/ctag-tbd.git
   cd ctag-tbd

The ``--recursive`` flag fetches the submodules (Ableton Link, esp-dsp, the
simulator's audio and web libraries). If you cloned without it:

.. code-block:: bash

   git submodule update --init --recursive


The simulator
=============

You need CMake 3.13 or newer, a C++17 compiler and Boost (thread, filesystem,
program_options).

**macOS** (Homebrew):

.. code-block:: bash

   brew install cmake boost

**Linux** (Debian/Ubuntu):

.. code-block:: bash

   sudo apt install build-essential cmake libboost-filesystem-dev \
     libboost-thread-dev libboost-program-options-dev libasound2-dev

Windows (MSYS2) is described in ``simulator/readme.md``.

Build and run:

.. code-block:: bash

   cd simulator && mkdir -p build && cd build
   cmake .. && make tbd-sim
   ./tbd-sim --list              # the sound cards and their numbers
   ./tbd-sim --device <N>        # <N> from the list

Start ``tbd-sim`` from ``simulator/build``: it finds the WebUI and the virtual SD
card (``sdcard_image/``) through relative paths. The simulator needs a sound card
at 44.1 kHz; ``--output`` uses an output-only device.

.. list-table::
   :header-rows: 1
   :widths: 40 60

   * - Page
     - What it is
   * - ``http://localhost:8080/``
     - The WebUI: the plugins and the rack's machines with their parameters.
   * - ``http://localhost:8080/ctrl``
     - MIDI for the ``GrooveBoxRack``; CV, triggers and pots for CTAG plugins.

``make`` without a target also builds the DSP unit tests (``run_tests``) and the
headless tools (``load-test``, ``routing-test``, ``rack-lint``). The
:doc:`Desktop simulator <simulator>` page has the details.


ESP-IDF for the ESP32-P4
========================

The firmware builds with **ESP-IDF v5.5.3** (the repository's CI builds in the
``espressif/idf:v5.5.3`` image) and needs ``xxhash`` for its SD card checksums.

.. code-block:: bash

   mkdir -p ~/esp && cd ~/esp
   git clone -b v5.5.3 --recursive https://github.com/espressif/esp-idf.git
   cd esp-idf
   ./install.sh esp32p4

   brew install xxhash          # macOS; on Linux: sudo apt install xxhash

On Windows use Espressif's
`ESP-IDF Tools Installer <https://docs.espressif.com/projects/esp-idf/en/v5.5.3/esp32p4/get-started/windows-setup.html>`_.

Build the firmware
==================

In every new terminal, load ESP-IDF first:

.. code-block:: bash

   . ~/esp/esp-idf/export.sh

Then, from the repository root:

.. code-block:: bash

   idf.py build

This builds the TBD-16 configuration (SD card and RP2350). The build writes
``build/dada-tbd.bin`` (the app), the bootloader, the partition table, the OTA
data and ``build/dada-tbd-sd.zip`` (the SD card archive). The first build takes
several minutes; later builds are incremental. Other hardware configurations
are built with an overlay, for example
``idf.py -DSDKCONFIG_DEFAULTS="sdkconfig.defaults;sdkconfig.defaults.tbd-sd-only" build``;
``HARDWARE_CONFIGURATIONS.md`` in the repository lists them. When you switch
configurations, run ``idf.py fullclean`` first.

Next: :doc:`Flash your build <flash>`.


Troubleshooting
===============

**"Missing xxh128sum"**
   Install xxhash (see above).

**Errors about missing files in a submodule**
   Run ``git submodule update --init --recursive``.

**You cloned before October 2026 and ran** ``git pull``
   The ``dada-tbd-master`` history was rewritten on 2026-10-21, so ``git pull`` on an
   older clone fails or merges two histories, and the old build files stay. Reset to
   the published branch (this discards local changes; back them up first) and build
   from a clean folder:

   .. code-block:: bash

      git fetch origin
      git reset --hard origin/dada-tbd-master
      git submodule sync --recursive
      git submodule update --init --recursive
      rm -rf simulator/build

   Or simply clone again.

**CMake asks for** ``../managed_components/espressif__esp-dsp`` **or** ``dspm_mult_f32_ansi.c``
   That tree is the CTAG upstream (``ctag-fh-kiel/ctag-tbd``) or a clone from before the
   history rewrite (see above), not the current repository.
   Clone ``dadamachines/ctag-tbd`` as above; its simulator takes esp-dsp from the
   ``simulator/esp-dsp`` submodule and needs neither ESP-IDF nor ``managed_components/``.
   Check with ``git remote -v`` from the repository root.

**The WebUI opens but shows no plugins** ("No plugin loaded", empty PLUGINS list)
   Start ``tbd-sim`` from ``simulator/build``: it reads the plugin definitions (the
   "virtual SD card", ``sdcard_image/``) through the relative path ``../../sdcard_image``.
   ``curl "http://localhost:8080/api/v2/plugins?action=list"`` must return a JSON list
   of plugins; an empty answer or a 404 means a simulator built from another tree.

``idf.py`` **not found, or the wrong ESP-IDF version**
   Run ``. ~/esp/esp-idf/export.sh`` in this terminal; ``idf.py --version``
   should say ``v5.5.3``.

**A new machine or plugin does not appear in the simulator**
   Re-run ``cmake ..`` once so that the new source file is found, and see
   *Registering a New Plugin* on the :doc:`Desktop simulator <simulator>` page.
