*****************
Storage & Samples
*****************

The TBD-16 uses two SD cards for storing system data and audio samples.
It ships with pre-loaded factory content --- drums, wavetables, and loops
--- so you can start making music right away.


SD Cards
========

The TBD-16 has two micro-SD card slots, one for each processor:

.. list-table::
   :header-rows: 1
   :widths: 20 30 50

   * - Slot
     - Processor
     - Contents
   * - Middle slot
     - ESP32-P4
     - Factory + user overlay (``/factory/``, ``/user/``), audio samples
       (``/samples/``), runtime caches (``/system/``), web interface
       (``/www/``)
   * - Edge slot
     - RP2350
     - Frontend firmware (``.uf2`` apps), RP2350 config


Factory Samples
===============

The P4 SD card ships with a ``/samples/factory/`` folder organized by category:

- **drums/** --- Kicks, snares, hi-hats, claps, percussion
- **wavetables/** --- Wavetable banks for the wavetable oscillator plugins
- **loops/** --- Long sample loops and beat material
- **other/** --- Miscellaneous samples and textures

Samples are stored as **44.1 kHz, 16-bit mono WAV** files. At boot, the
system loads the active sample bank and wavetable bank into PSRAM for
real-time playback by DSP plugins.


Sample Banks
============

Samples are organized into **banks** --- named collections of WAV files.
The TBD-16 ships with a default sample bank (factory drums) and a default
wavetable bank.

Banks are defined by JSON files inside ``/samples/`` (factory and user
overlays):

- ``sample_rom.json`` --- Master index listing all available banks and the
  currently active bank
- ``def_smp.json`` --- Default sample bank (drums, percussion)
- ``def_wt.json`` --- Default wavetable bank
- Additional ``.json`` files for extra banks (e.g. ``a4_dub.json``)

You can switch the active bank through the web interface or the hardware UI.


Adding Your Own Samples
=======================

Here's how to get your own samples onto the TBD-16:

1. **Prepare your WAV files** --- Convert them to **44.1 kHz, mono, 16-bit PCM**.
   You can use any audio editor (Audacity, Ableton, etc.) or the Python converter
   script included in the repository (``sample_rom/wav_info_parser.py``).

2. **Access the SD card** --- Either remove the P4 SD card and insert it in your
   computer, or boot into USB-MSC mode to access it over USB.

3. **Copy files** --- Place your ``.wav`` files into a subfolder of
   ``/samples/user/`` (e.g. ``/samples/user/my_samples/``). User-side
   files override the factory defaults of the same name; factory files
   stay read-only.

4. **Create a bank file** --- Create a ``.json`` file in ``/samples/user/``
   listing your samples (see the existing ``def_smp.json`` in
   ``/samples/factory/`` as a template). Each entry needs:

   - ``filename`` --- Stem name without extension (max 32 chars)
   - ``path`` --- Subfolder path relative to ``/samples/``
   - ``nsamples`` --- Number of sample frames in the file

5. **Register the bank** --- Add your bank file to the ``smp_banks`` array in
   ``sample_rom.json`` (the user copy under ``/samples/user/sample_rom.json``
   if you want it overlayed on top of the factory list).

6. **Reboot** --- The TBD-16 will load the new bank data on the next start.

Keep file names short (32 characters max) and avoid special characters. Sample
data is loaded into PSRAM at boot, so total bank size is limited by available
memory.


System Configuration & Overlay
==============================

The P4 SD card uses an **overlay model** that separates immutable factory
defaults from user-side overrides:

- ``/factory/`` --- read-only factory defaults written from the SD card
  image: ``synthdefinitions.json``, ``plugins/`` (the ``mui-*.json`` /
  ``mp-*.json`` parameter and preset files for every sound processor),
  ``presets/``, ``macros/``, ``kits/``, ``trackdefaults/``, ``config/``.
- ``/user/`` --- user-side overrides created at runtime. Same subdirectory
  layout as ``/factory/``; the firmware reads ``/user/<path>`` first and
  falls back to ``/factory/<path>``. Writes always go to ``/user/``, so the
  factory tree stays clean and is the recovery baseline.
- ``/system/`` --- runtime caches (firmware version, WebUI version, cached
  state). Rebuilt at boot when missing.

Editing configuration files manually is not recommended unless you know
what you're doing --- for normal use the WebUI and the hardware UI manage
these automatically. If you do hand-edit, prefer the ``/user/`` overlay so
that wiping ``/user/`` always restores you to a known-good factory state.


Recovery
========

If your SD card data becomes corrupted, see
:doc:`Device Recovery <50_device_recovery>` for a complete guide to
re-initializing your TBD-16 from scratch, including fresh SD card images.
