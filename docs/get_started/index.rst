Get Started
===========

This repository is the firmware source of the **dadamachines TBD-16**: the CTAG
audio engine with its 57 plugins and the 16-track ``GrooveBoxRack`` with its
machines on the ESP32-P4, the WebUI, and a desktop simulator that runs the same
plugin code on your computer. On the :doc:`TBD-16 </hardware/10_tbd16>` the
RP2350 runs the panel, the sequencer and MIDI. The firmware is GPL 3.0 (see
:doc:`Licenses </about/10_credits>`).

.. note::

   **Playing a TBD-16?** The user manual for the instrument is at
   `docs.dadamachines.com/tbd-16 <https://docs.dadamachines.com/tbd-16/>`_.
   These pages are for building firmware.


Start in the simulator
----------------------

The simulator runs the same audio engine and plugins on your computer, with
the WebUI in the browser. You need no hardware to write a machine or a plugin.

.. code-block:: bash

   git clone --recursive https://github.com/dadamachines/ctag-tbd.git
   cd ctag-tbd/simulator && mkdir -p build && cd build
   cmake .. && make tbd-sim
   ./tbd-sim --list           # pick your sound card's number
   ./tbd-sim --device <N>

Then open ``http://localhost:8080/`` (the WebUI) and
``http://localhost:8080/ctrl`` (MIDI for the rack, CV, triggers and pots for
the plugins). :doc:`Development setup <setup>` lists what to install first.


Three paths
-----------

.. list-table::
   :header-rows: 1
   :widths: 22 44 34

   * - You write
     - What it is
     - Guide
   * - **A machine**
     - A voice of the ``GrooveBoxRack``: a drum or a synth on one of its
       tracks. ``generators/rackgen.js`` scaffolds it from a small JSON
       descriptor.
     - :doc:`Hello, Machines </plugins/rack-tutorial>`, then
       :doc:`Writing a Machine </plugins/rack-plugins>`
   * - **A CTAG plugin**
     - A standalone sound processor in the CTAG style (CV, triggers, pots), like
       the 57 plugins in the tree. ``generators/generator.js`` scaffolds it.
     - :doc:`Creating a Plugin </plugins/step-by-step>`
   * - **An RP2350 app**
     - A controller, sequencer or screen on the TBD-16's RP2350, built with
       PlatformIO from the app template; it drives the audio engine over SPI.
     - :doc:`App Development Setup </apps/getting-started>`

Not sure? Start with a machine: follow *Hello, Machines*, build the simulator,
play it.


On the hardware
---------------

When it sounds right in the simulator, build the firmware with ESP-IDF and flash
it to the ESP32-P4 over USB:

- :doc:`Development setup <setup>`: the simulator, and ESP-IDF for the P4.
- :doc:`Flash your build <flash>`: write your build to a TBD-16, and go back
  to the released firmware.

You need no debug probe for any of this. The RP2350 keeps its firmware when
you flash the P4; changing it is described in
:doc:`App Development Setup </apps/getting-started>`.

.. include:: /_includes/footer-links.rst

.. toctree::
   :hidden:

   Development setup <setup>
   Desktop simulator <simulator>
   Flash your build <flash>
