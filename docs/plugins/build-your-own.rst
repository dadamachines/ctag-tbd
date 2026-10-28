Build your own
==============

The TBD platform is **deeply hackable** — you can build new audio code, new
device-level apps, or whole new sound libraries on it, and develop / debug
everything on your laptop with the desktop simulator before flashing real
hardware.

The platform is open source (GPL 3.0). The audio engine compiles to both the
ESP32-P4 firmware *and* the desktop simulator (~99 % shared code), so writing
DSP doesn't need a board on your desk.

Pick a path
-----------

There are **three kinds of code** you can write for the TBD-16. Each has its
own complete section in the sidebar with its own catalogue, workflow docs, and
tutorial.

.. list-table::
   :header-rows: 1
   :widths: 14 32 54

   * - Section
     - What you build
     - When to pick this
   * - :doc:`Apps </apps/index>`
     - A device-level app on the RP2350 (bootloader, sequencer, UI, …)
     - You want to change *how* the TBD-16 itself behaves — boot flow, sequencer
       behaviour, the front-panel UI. Lives in C / C++ on the RP2350 side.
   * - :doc:`Plugins </plugins/index>` *(legacy / standalone)*
     - A Eurorack-style ``ctagSoundProcessor`` (CV / Trigger / Pot)
     - You want to write a single self-contained audio block: a synth voice, an
       effect, an oscillator. **The 50+ existing plugins are all of this kind.**
       Driven by CV / Trigger / Pot inputs from the WebUI's ``/ctrl`` page; no
       MIDI. Most general-purpose audio work belongs here.
   * - :doc:`Machines </plugins/machines>` *(GrooveBoxRack voices)*
     - A small mono DSP voice that lives *inside* the TBD-16's MIDI-driven
       GrooveBoxRack instrument
     - You want to add a new drum, synth voice or sampler to the **GrooveBoxRack**
       — the rack engine handles level / pan / FX-sends / mixing and dispatches
       MIDI notes; you just write the DSP. **15 Machines ship today**; this is the
       path most rack-style work takes.

Not sure yet? Read the :doc:`Plugins </plugins/index>` section first — it has
the developer workflow (Quickstart, Simulator, Architecture, Build & Flash, Web
API), and the :doc:`Quickstart <quickstart>` in particular has a side-by-side
comparison that helps you decide between a Plugin and a Machine.

**Machines build on top of the Plugins knowledge**, so the natural reading order
is: Plugins → Machines.

.. tip::

   **Just hear the device, not write code?** Start at :doc:`Get Started
   </get_started/index>` — that's the play-the-instrument path, no laptop needed.


How to contribute back
----------------------

Found a bug, want to upstream a plugin, want a Machine added to the official
catalogue? Open an issue or PR on the
`ctag-tbd GitHub repo <https://github.com/dadamachines/ctag-tbd>`_, or talk to us
on the community channels listed under :doc:`About / Community
</about/20_community>`. The macro/preset/rack layer is GPL-3.0; a commercial
licence is available — see ``LICENSE`` and ``CONTRIBUTING.md`` in the repo root.


.. include:: /_includes/footer-links.rst
