**************************
Plugin Development Setup
**************************

This guide walks you through setting up your development environment for DSP
plugin development on the ESP32-P4 --- the TBD-16's audio engine.


Before You Begin
================

DSP development means writing audio processing code --- synthesizers, effects,
and drum machines that run on the ESP32-P4. This is more advanced than
:doc:`App development </apps/getting-started>`, which uses Arduino
and doesn't require audio programming knowledge.

**If you're new to the TBD platform**, consider starting with App
development first. You can build custom MIDI controllers, sequencers, and
control surfaces for existing DSP plugins without touching audio code.

**If you're ready for DSP**, this guide will get you set up.


1. Install the Toolchain
=========================

The DSP firmware is built with `ESP-IDF <https://docs.espressif.com/projects/esp-idf/>`_,
Espressif's official development framework for ESP32 chips.

1a. Install ESP-IDF
--------------------

The project builds with **ESP-IDF v5.5.3** (the version the repository's CI uses).

**macOS / Linux** — clone the ESP-IDF, check out the right tag, fetch
submodules, then run the toolchain installer:

.. code-block:: bash

    mkdir -p ~/esp
    cd ~/esp
    git clone --recursive https://github.com/espressif/esp-idf.git
    cd esp-idf
    git checkout v5.5.3
    git submodule update --init --recursive

.. code-block:: bash

    ./install.sh

**Windows:**

Download and run the
`ESP-IDF Tools Installer <https://docs.espressif.com/projects/esp-idf/en/latest/esp32/get-started/windows-setup.html>`_.
Select ESP-IDF v5.5.3 during installation.


1b. Install System Dependencies
--------------------------------

**macOS:**

.. code-block:: bash

    brew install xxhash

The build system uses ``xxh128sum`` for firmware integrity checks.


1c. Install VS Code Extension (Optional)
------------------------------------------

Espressif provides a VS Code extension for ESP-IDF development:

1. Open VS Code.
2. Go to **Extensions** (``Cmd+Shift+X``).
3. Search for **ESP-IDF** and install the Espressif extension.
4. Run the setup wizard (``Cmd+Shift+P`` > "ESP-IDF: Configure ESP-IDF Extension").

This gives you integrated build and monitor commands. Flash with
``bin/flash.sh`` (step 5), not with the extension's flash command: it works like
``idf.py flash``. You can also work entirely from the terminal if you prefer.


2. Get the Source
==================

Clone this repository with submodules:

.. code-block:: bash

    git clone --recursive https://github.com/dadamachines/ctag-tbd.git
    cd ctag-tbd

.. important::
   The ``--recursive`` flag is required. The project depends on submodules
   including Ableton Link, esp-dsp, and Mutable Instruments code.

If you already cloned without ``--recursive``:

.. code-block:: bash

    git submodule update --init --recursive


3. Configure Your Shell
========================

Before building, export the ESP-IDF environment in your terminal:

.. code-block:: bash

    . ~/esp/esp-idf/export.sh

Add this line to your shell profile (``~/.zshrc`` or ``~/.bashrc``) so it runs
automatically in every terminal session.


4. Build the Firmware
======================

.. code-block:: bash

    idf.py build

This compiles the entire DSP engine, all plugins, the web server, and WiFi
stack. The first build takes several minutes. Subsequent builds are incremental
and much faster.

The firmware image is ``build/dada-tbd.bin``.


5. Flash to Your TBD-16
=========================

Connect the TBD-16's **front JTAG port** (USB-C #3) to your computer, keep
**back port #1** connected for power, and run from the repository root:

.. code-block:: bash

    ./bin/flash.sh                    # finds /dev/cu.usbmodem* on macOS
    ./bin/flash.sh /dev/ttyACM0       # or name the port (Linux)

``bin/flash.sh`` writes the bootloader, the partition table, the OTA data and
``build/dada-tbd.bin`` with esptool. Do **not** use ``idf.py flash``: it writes
OTA data that can make the unit restart in a loop.

To watch the serial output:

.. code-block:: bash

    idf.py -p <PORT> monitor

Press ``Ctrl+]`` to exit the monitor. :doc:`Flash your build </get_started/flash>`
has the SD card and the way back to the released firmware.


6. Alternative --- Use the Simulator
=====================================

You can develop and test DSP plugins **without any hardware** using the TBD
Simulator. It runs the full DSP engine on your computer with a local web
interface.

See the :doc:`Simulator Guide </get_started/simulator>` for setup instructions.

This is ideal for:

-  Developing plugins without a TBD-16 on hand
-  Rapid iteration (no flash/reboot cycle)
-  Automated testing of audio algorithms


7. Troubleshooting
====================

**"Missing xxh128sum"**
    Install xxhash: ``brew install xxhash`` (macOS) or
    ``apt install xxhash`` (Linux).

**Submodule errors**
    Run ``git submodule update --init --recursive`` to fetch all dependencies.

**Build fails on first try**
    Make sure you ran ``. ~/esp/esp-idf/export.sh`` in the current terminal
    session. ESP-IDF tools are not in your PATH by default.

**New plugin doesn't appear in the web UI**
    The system caches the list of available processors in ``spm-config.json``.
    Delete the ``"availableProcessors": [ ... ],`` block from that file and
    restart the device or simulator.


Next Steps
==========

-  :doc:`Plugin Architecture <architecture>` --- How the DSP plugin
   system works.
-  :doc:`Step-by-Step Plugin Guide <step-by-step>` --- Create your first
   audio plugin from scratch.
-  :doc:`Simulator </get_started/simulator>` --- Develop plugins on your computer without
   hardware.
-  :doc:`Web API Reference <web-api>` --- Control plugins remotely over WiFi.
