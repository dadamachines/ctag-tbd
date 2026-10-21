*******************
Building & Setup
*******************

This guide outlines the steps required to build the CTAG TBD firmware from source and set up the development environment.

Prerequisites
=============

1. ESP-IDF Framework
--------------------

The project builds with **ESP-IDF v5.5.3** (the version the repository's CI uses).

**Installation** — clone the ESP-IDF, check out the right tag, fetch submodules,
then run the toolchain installer:

.. code-block:: bash

    mkdir -p ~/esp
    cd ~/esp
    git clone --recursive https://github.com/espressif/esp-idf.git
    cd esp-idf
    git checkout v5.5.3
    git submodule update --init --recursive

.. code-block:: bash

    ./install.sh

2. System Dependencies (macOS)
------------------------------

The build system requires ``xxhash`` for checksum calculations.

.. code-block:: bash

    brew install xxhash

Project Setup
=============

1. Clone Repository (Recursive)
-------------------------------

This project uses submodules (e.g., ``ableton_link``, ``esp-dsp``). Ensure you clone recursively or update submodules after cloning.

.. code-block:: bash

    git clone --recursive https://github.com/dadamachines/ctag-tbd.git

If you've already cloned without ``--recursive``, fetch submodules instead:

.. code-block:: bash

    git submodule update --init --recursive

2. Configure Environment
------------------------

Before building, export the ESP-IDF environment variables in your terminal session:

.. code-block:: bash

    . ~/esp/esp-idf/export.sh

Building
========

To build the firmware:

.. code-block:: bash

    idf.py build

The firmware image is ``build/dada-tbd.bin``; the build also writes the
bootloader, the partition table, the OTA data and ``build/dada-tbd-sd.zip`` (the
SD card archive).

Flashing
========

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

See :doc:`Flash your build </get_started/flash>` for the SD card and the way back
to the released firmware.

Troubleshooting
===============

- **Missing xxh128sum**: If you see an error related to ``XXH128SUM``, install ``xxhash`` (``brew install xxhash`` on macOS).
- **Submodule Errors**: If you encounter errors about missing files in ``components/ableton_link`` or others, run ``git submodule update --init --recursive``.
- **Partition Size Warning**: You may see a warning: "app partitions are too small for binary". The ``ota_0`` partition (5MB) is sufficient for the initial flash, but the ``ota_1`` partition (1MB) is too small for OTA updates.

Simulator
=========

The TBD Simulator runs the full DSP engine on your host machine --- no hardware required.
See the dedicated :doc:`Simulator Guide </get_started/simulator>` for build instructions, usage, and
multi-platform setup.


Performance Resources
=====================

The ESP32-P4 features a RISC-V core with vector (SIMD) extensions. If you need
high-throughput memory operations in your plugin, the
`esp32p4_memcpy_pie_benchmark <https://github.com/ctag-fh-kiel/-esp32p4_memcpy_pie_benchmark>`_
repository benchmarks optimized ``memcpy`` implementations on the P4 (silicon
rev 1.3), achieving up to **2x** the throughput of the standard ``memcpy`` for
SRAM-to-SRAM transfers.
