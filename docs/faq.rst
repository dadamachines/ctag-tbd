***
FAQ
***

General
=======

.. dropdown:: What is TBD-16?

   TBD-16 is a standalone desktop audio DSP instrument by
   `dadamachines <https://dadamachines.com>`_.
   It runs the open-source `CTAG TBD <https://github.com/ctag-fh-kiel/ctag-tbd>`_
   audio engine and includes 50+ synthesizers and effects. Just plug in USB-C
   power and start making music using the built-in hardware interface (buttons,
   encoders, OLED display, RGB LEDs), no computer required.

.. dropdown:: What does TBD stand for?

   **To Be Determined**, reflecting the platform's open, extensible nature.
   The sound engine is not fixed; you choose and combine processors from a
   growing library, or create your own.

.. dropdown:: What is the relationship between CTAG TBD and dadamachines?

   `CTAG TBD <https://github.com/ctag-fh-kiel/ctag-tbd>`_ is the open-source
   audio engine developed at the Creative Technologies AG (CTAG) at Kiel
   University of Applied Sciences.
   `dadamachines <https://dadamachines.com>`_ builds the TBD-16 hardware product
   around that engine and maintains this documentation.

.. dropdown:: Do I need a Eurorack system?

   No. The TBD-16 is a fully standalone desktop device with TRS MIDI
   (3.5 mm Type-A), USB MIDI, audio I/O, and a full hardware interface.
   No Eurorack case, no computer, no power supply needed, just USB-C
   power. It even works with a USB power bank for portable use.

.. dropdown:: What processors / chips are inside?

   - **ESP32-P4** -- Main DSP engine and WiFi web server
   - **RP2350** -- User interface and MIDI
   - **ESP32-C6** -- WiFi co-processor

   See :doc:`TBD-16 Hardware <hardware/10_tbd16>` and the
   `product page <https://dadamachines.com/products/tbd-16-groovebox/>`_ for more.

.. dropdown:: Can I use TBD-16 in a commercial product?

   Yes. If you want to build a product around the TBD platform, two options
   are designed for you:

   - The :doc:`TBD Open Board </hardware/20_tbd_open_board>` -- an ESP32-P4
     audio baseboard for the TBD firmware, in design. Connect your own UI through
     its GPIO expansion header and design your own enclosure.
   - Your own board: see :doc:`Your own hardware </hardware/index>`; to build
     a product with us, `get in touch <https://dadamachines.com/contact/>`_.

   We also work with companies on licensed special editions of the TBD-16.

   The firmware — the upstream CTAG DSP engine **and** the dadamachines /
   Per-Olov Jernberg additions (REST API, macro/preset system, rack layer,
   tools, simulator) — is licensed under **GPL 3.0**. The WebUI is proprietary
   (© dadamachines / Johannes Elias Lohbihler) — it talks to the firmware over
   the REST API and is a separate program. The TBD-16 hardware design is
   proprietary.

   If you want to build a commercial product on TBD without GPL 3.0's
   source-disclosure obligations (closed-source firmware, ship without
   attribution, or use of the WebUI), dadamachines offers a commercial licence —
   https://dadamachines.com/contact/.

   See :doc:`Licenses <about/10_credits>` for full details.


Audio & Sound
=============

.. dropdown:: What sample rate and bit depth does TBD-16 use?

   The firmware ships at **44.1 kHz** sample rate with **32-bit float**
   internal processing. See the
   `TBD-16 product page <https://dadamachines.com/products/tbd-16-groovebox/>`_
   for the current specifications.

.. dropdown:: How many plugins can run simultaneously?

   In the **Groovebox**, each of the 16 tracks runs its own sound machine, and
   the FX tracks run effects. The number of plugins that can run at once is
   limited by the DSP load.

.. dropdown:: Can I process external audio?

   Yes. The audio inputs accept line-level signals. Any effect plugin can
   process incoming audio in real time.

.. dropdown:: What is Ableton Link?

   Ableton Link is a technology for synchronizing tempo across devices on the
   same WiFi network. TBD-16 has built-in Link support, allowing it to sync
   with Ableton Live, iOS apps, and other Link-enabled tools.


Connectivity
============

.. dropdown:: How do I connect to the web interface?

   Connect the TBD-16 to your computer with a USB-C data cable and open
   ``http://192.168.4.1``. Wi-Fi is set up in the settings; the
   `user manual <https://docs.dadamachines.com/tbd-16/>`_ explains it.

.. dropdown:: What MIDI connections are supported?

   - 2x TRS 3.5 mm MIDI In Type-A (2nd input doubles as Clock/Reset)
   - 2x TRS 3.5 mm MIDI Out Type-A
   - USB MIDI (via USB-C)

   All connections follow the `TRS Type-A standard <https://minimidi.world/>`_.
   The RP2350 processor handles MIDI and makes it available to the DSP engine.
   See the `MIDI section <hardware/10_tbd16.html#connections>`_ of the TBD-16 page for details.

.. dropdown:: Can the TBD-16 run other firmware?

   Yes. A firmware you build from this repository can be flashed to the
   ESP32-P4, see :doc:`Flash your build </get_started/flash>`; the
   :doc:`Stable Channel </flash/10_stable_channel>` page puts the released
   firmware back. Custom RP2350 apps are described in
   :doc:`App Development Setup </apps/getting-started>`.


Troubleshooting
===============

.. dropdown:: I can't connect to the web interface
   :open:

   1. Ensure the TBD-16 is powered on and connected to your computer with a
      USB-C data cable, then open ``http://192.168.4.1``.
   2. If you use WiFi, check that your computer is on the **same network**.
   3. If the device isn't connecting to WiFi, see the
      `user manual <https://docs.dadamachines.com/tbd-16/>`_.

.. dropdown:: Firmware flash failed

   - Make sure the USB cable supports data (not charge-only).
   - Try a different USB port.
   - Use the browser-based flasher, see :doc:`Flash & Updates </flash/index>`.
   - For full device recovery, see
     :doc:`Stable channel </flash/10_stable_channel>`.

.. dropdown:: No sound after changing plugins

   - Check that the plugin is loaded on the correct channel.
   - Some plugins require an external audio input or a MIDI trigger to produce
     sound.
   - In Groovebox mode, make sure the track is unmuted and the sequencer is
     running.
   - Verify that your audio cable is connected to the correct output jack.


Development Questions
=====================

If you're developing custom firmware or plugins, the relevant troubleshooting
is in each development section:

- **Building and flashing** -- :doc:`Development setup </get_started/setup>`
  (Troubleshooting section) and :doc:`Flash your build </get_started/flash>`
- **The RP2350 side** -- :doc:`App Architecture </apps/rp2350>`
  and :doc:`Debugging with SWD </apps/debugging>` (Troubleshooting section)


Still Stuck?
============

- `dadamachines Forum <https://forum.dadamachines.com>`_ -- Ask the community
- `GitHub Issues <https://github.com/dadamachines/ctag-tbd/issues>`_ -- Report
  bugs or request features

.. include:: /_includes/footer-links.rst
