****************
Flash your build
****************

This page writes a firmware you built from this repository (see
:doc:`Development setup <setup>`) to the ESP32-P4 of a TBD-16 over USB. No
debug probe is needed. The RP2350 keeps its firmware.

.. warning::

   This replaces the firmware on the ESP32-P4. Save the SD card first (copy
   it to your computer). The way back to the released firmware is in
   :ref:`back-to-release` below.


1. Connect
==========

Connect the TBD-16's **front JTAG port** (USB-C #3) to your computer, and keep
**back port #1** connected for power. The port shows up as
``/dev/cu.usbmodem…`` on macOS or ``/dev/ttyACM…`` on Linux.


2. Flash
========

From the repository root, with ESP-IDF loaded:

.. code-block:: bash

   . ~/esp/esp-idf/export.sh
   ./bin/flash.sh                    # finds /dev/cu.usbmodem* on macOS
   ./bin/flash.sh /dev/ttyACM0       # or name the port (Linux)

``bin/flash.sh`` writes the bootloader, the partition table, the OTA data and
``build/dada-tbd.bin`` with esptool, and then resets the chip. It keeps the
rest of the flash.

.. important::

   Do **not** use ``idf.py flash``: it writes OTA data that can make the unit
   restart in a loop. Use ``bin/flash.sh``, or esptool with the addresses in
   that script (they are listed in ``bin/readme.md``).

``bin/flash-aem.sh`` erases the whole flash first; use it only when a unit no
longer starts. After it, write ``tusb_msc.bin`` to the second app slot with
``bin/flash_ota_1.sh`` (the script prints the step) and put a fresh SD card
image on the card.


3. The SD card
==============

The firmware reads its plugin descriptions, presets, kits and the WebUI from
the SD card, which mirrors ``sdcard_image/``. If you changed files there, copy
them to the same paths on the card. ``build/dada-tbd-sd.zip`` shows the exact
layout the build expects (the WebUI files on the card are gzipped). Keep the
card's ``user/`` folder: it holds your settings and presets.


4. Check
========

- Watch the log: ``idf.py -p <PORT> monitor`` (leave it with ``Ctrl+]``).
- The WebUI is reached over the USB cable on back port #1 at
  ``http://192.168.4.1`` (USB networking is the default mode).
- The panel, the sequencer and the MIDI jacks work as before: the RP2350 still
  runs its firmware.


.. _back-to-release:

Back to the released firmware
=============================

Open the :doc:`Stable Channel </flash/10_stable_channel>` page and follow its
steps. Path A writes the released firmware to the ESP32-P4 (and the RP2350);
Path B also rewrites the SD card.
