**************************
Licenses
**************************

The TBD firmware is open source under the GNU GPL 3.0 — you can study how it
works, learn from it, build on it, and contribute back. The licence is chosen
so that no one can simply repackage our work into a *closed* competing product:
to ship a closed-source product on TBD you need a commercial licence from
dadamachines (a dual-licence model, like `JUCE <https://juce.com>`_ or
`Bela <https://bela.io>`_). The WebUI is dadamachines' own proprietary
application (see below). The TBD-16 hardware is proprietary.

dadamachines is a small, independent team. We don't run on venture capital.
Selling TBD-16 hardware — and commercial licences to other manufacturers — is
how we fund continued development of the platform, the documentation, the WebUI,
and the tools that make TBD useful for musicians and developers. The licences
below protect that work while keeping firmware development fully open for
individuals and contributors.


How It Works at a Glance
========================

.. list-table::
   :header-rows: 1
   :widths: 35 20 45

   * - Component
     - License
     - What It Means
   * - Firmware: core DSP engine (upstream CTAG TBD) + dadamachines / Per-Olov Jernberg additions (REST API, macro/preset/rack layer, plugins, drivers, tools, simulator, docs)
     - `GPL 3.0 <https://www.gnu.org/licenses/gpl-3.0.txt>`_
     - Open source; modifications you distribute must be GPL 3.0. A commercial licence is available for closed-source products.
   * - WebUI (``sdcard_image/www/``)
     - Proprietary -- © dadamachines / Johannes Elias Lohbihler
     - A separate browser app talking to the firmware over the REST API; not under the GPL; reuse needs written permission
   * - Original CTAG hardware (V1/V2, Eurorack)
     - `CC BY-NC-SA 4.0 <https://creativecommons.org/licenses/by-nc-sa/4.0/>`_
     - Non-commercial use, share-alike, attribution required
   * - TBD-Core & TBD-16 hardware
     - Proprietary
     - Commercial products (not open source)
   * - Planned open-hardware core design
     - Open source (TBD)
     - KiCad reference design for education, prototyping, instrument building


Software Licenses in Detail
===========================


Core DSP Engine (GPL 3.0)
-------------------------

The audio engine, sound processors, and platform core were originally developed
at `CTAG Kiel <https://www.creative-technologies.de>`_ by Robert Manzke.
The upstream repository is
`ctag-fh-kiel/ctag-tbd <https://github.com/ctag-fh-kiel/ctag-tbd>`_.

This code is licensed under the
`GNU General Public License (GPL 3.0) <https://www.gnu.org/licenses/gpl-3.0.txt>`_.
If you modify this code and distribute it, your modifications must also be
released under GPL 3.0.


dadamachines & Per-Olov Jernberg Additions (GPL 3.0)
----------------------------------------------------

Everything **added to the firmware** in this repository — by dadamachines
(Johannes Elias Lohbihler) and by `Per-Olov Jernberg (Possan)
<https://possan.codes/>`_ (`GitHub <https://github.com/possan>`_), who authored
the macro/preset system and the rack layer — is licensed under the
`GNU General Public License (GPL 3.0) <https://www.gnu.org/licenses/gpl-3.0.txt>`_,
the same as the upstream engine. This includes:

- The **REST API** and the **browser-based flasher** logic
- The **macro/preset system** and the **rack layer** / rack plugins
- **Plugins** developed by dadamachines and friends (see below)
- The **drivers**, **build tools**, the **desktop simulator** and **tests**
- The **documentation source** you are reading right now

We use GPL 3.0 for the firmware and **also offer a commercial licence** (a
dual-licence model, like `JUCE <https://juce.com>`_ or `Bela <https://bela.io>`_):

- **For individual developers and contributors:** you can freely use, study,
  modify and contribute to the firmware under GPL 3.0. (Contributions are
  accepted under a Contributor Licence Agreement so the dual-licence is
  possible — see :doc:`Get Started </get_started/index>` / ``CONTRIBUTING.md``.)
- **For the community:** modifications you distribute stay GPL 3.0, so the
  ecosystem keeps growing.
- **For commercial protection:** a manufacturer cannot ship a *closed-source*
  product built on TBD without a commercial licence from dadamachines — and the
  WebUI (below) is dadamachines' alone.

If you want to build a commercial product on TBD without GPL 3.0's
source-disclosure obligations, `contact dadamachines
<https://dadamachines.com/contact/>`_.


The WebUI (proprietary)
-----------------------

The dadamachines TBD-16 **WebUI** under ``sdcard_image/www/`` (the
dadamachines-authored HTML, JavaScript and CSS) is **not** open source:

  © 2014--2026 dadamachines / Johannes Elias Lohbihler. All rights reserved.

It is a separate program that talks to the firmware over the firmware's REST API
— it is not a derivative work of the firmware — and it is not licensed under the
GPL. You may not copy, modify, redistribute or reuse it without dadamachines'
written permission; for that, `contact us <https://dadamachines.com/contact/>`_.
Vendored web components it bundles (Shoelace, webaudio-controls, Sortable, …)
keep their own licences — see the per-file headers / ``LICENSE`` / ``readme``
inside each vendored directory under ``sdcard_image/www/``.


Plugins (GPL 3.0)
-----------------

Plugins developed specifically for the TBD-16 by dadamachines and friends are
licensed under GPL 3.0. This currently includes:

- **GrooveBoxRack** (formerly *PicoSeqRack*) -- a MIDI-driven sequencer/rack
  plugin developed by `Per-Olov Jernberg (Possan) <https://possan.codes/>`_
  (`GitHub <https://github.com/possan>`_), custom-built for the TBD-16, and the
  default app/firmware shipping on the TBD-16.

Future plugins developed for dadamachines follow the same GPL 3.0 licence.

The existing 50+ plugins in the core library are part of the upstream CTAG TBD
project and remain under GPL 3.0.

Third-party libraries vendored under ``components/`` and ``simulator/`` keep
their own licences — per-file headers and the component's own ``LICENSE`` /
``readme`` file are authoritative.


Hardware Licenses
=================


Original CTAG TBD Eurorack Designs
----------------------------------

The original CTAG TBD hardware designs (V1/V2) by Robert Manzke are released
under
`Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
(CC BY-NC-SA 4.0) <https://creativecommons.org/licenses/by-nc-sa/4.0/>`_.


dadamachines TBD-Core & TBD-16
------------------------------

The **TBD-16** (complete desktop instrument) and **TBD-Core** (core DSP board
with FFC connector for custom UIs) are commercial products. Their hardware
designs, including industrial design, PCB layout, and custom electronics, are
proprietary.


Planned Open-Hardware Core Design
---------------------------------

An **open-hardware core design** based on the same ESP32-P4 + RP2350 platform
is planned for future publication in KiCad as an open-source reference. This
will give educators, researchers, and instrument builders a starting point to
learn from and build on, similar in spirit to how the original CTAG TBD
Eurorack designs were published.

There is currently no Eurorack module based on the new ESP32-P4 + RP2350
platform planned by dadamachines, but we would love to partner with anyone
interested in building one:
`contact us <https://dadamachines.com/contact/>`_.


Using TBD in Your Own Products
==============================

**As a musician or maker:** Use TBD however you like. Build instruments, perform
live, teach with it, hack on it. That is what it is made for.

**As an individual developer:** Contribute plugins, fix bugs, improve the docs.
Your own projects do not need to be open source unless they include modified
TBD code that you distribute.

**As a company:** If you want to build a product around the TBD platform, two
options are designed for you:

- The :doc:`TBD Open Board </hardware/20_tbd_open_board>` -- an ESP32-P4 audio
  baseboard for the TBD firmware, with a GPIO expansion header for your own UI
  (in design).
- Your own board around the TBD firmware: see
  :doc:`Your own hardware </hardware/index>`; to build it with us,
  `get in touch <https://dadamachines.com/contact/>`_.

We also work with companies on licensed special editions of the TBD-16.
`Contact dadamachines <https://dadamachines.com/contact/>`_ to discuss.

If you **modify and distribute** the firmware (the upstream engine, the
dadamachines / Per-Olov Jernberg additions, the rack layer, plugins, tools,
docs), those changes must be released under GPL 3.0.

Want to ship a **closed-source** product on TBD — keep firmware modifications
proprietary, ship without attribution, use the WebUI, negotiate custom OEM
terms? dadamachines provides a commercial licence tailored to your project.
`Contact dadamachines <https://dadamachines.com/contact/>`_ to discuss.


The dadamachines Name and Brand
===============================

The dadamachines name, logo, and TBD-16 product name are trademarks reserved
for products made by or licensed by dadamachines.

If you build something with the TBD platform, you may reference it as:

- **[YourProduct] for TBD**
- **[YourProduct] (TBD-compatible)**

Please do not use "dadamachines [YourProduct]" or "TBD-16 [YourProduct]"
without prior agreement.
`Contact us <https://dadamachines.com/contact/>`_ if you are unsure.


Copyright
=========

| Copyright (c) 2020--2026 Robert Manzke. All rights reserved. (core platform / engine, original hardware research)
| Copyright (c) 2014--2026 Johannes Elias Lohbihler for dadamachines. (TBD-16 adaptation, REST API, WebUI, documentation)
| Copyright (c) 2025--2026 Per-Olov Jernberg (possan), https://possan.codes (macro/preset system, rack layer)

TBD is provided "as is" without any express or implied warranties.

License and copyright details for specific submodules are included in their
respective component folders / files if different from this license.
