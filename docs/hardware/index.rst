Hardware
========

.. raw:: html

   <img src="../_static/assets/dadamachines-tbd-16_tilt.jpg" alt="The dadamachines TBD-16 seen from the front: four encoders under the OLED display, 32 buttons with LEDs, and SD card, headphone, USB-C and USB host ports on the front edge." style="max-width: 100%; width: 100%; border-radius: 6px;">

The **TBD-16** is a compact 16-track groovebox from dadamachines, built on the
open TBD audio platform. Plug in power and start making music --- no computer
or Eurorack case required.

:doc:`TBD-16 overview → <10_tbd16>`

.. raw:: html

   <div style="display:flex; gap:0.75em; flex-wrap:wrap; margin:1em 0 2.5em;">
     <a href="https://dadamachines.com/shop/" class="hw-btn-primary">Buy TBD-16</a>
     <a href="https://dadamachines.com" class="hw-btn-secondary">dadamachines.com</a>
   </div>

----

The TBD Platform
----------------

The TBD audio engine runs on an ESP32-P4. The TBD-16 is the ready-made
instrument; the TBD Open Board is an open baseboard for your own project.

.. list-table::
   :header-rows: 1
   :widths: 25 40 35

   * - Product
     - What It Is
     - For Whom
   * - :doc:`TBD-16 <10_tbd16>`
     - Complete desktop instrument, ready to play
     - Musicians, developers, anyone who wants to start immediately
   * - :doc:`TBD Open Board <20_tbd_open_board>`
     - ESP32-P4 audio baseboard for the TBD firmware, with a GPIO expansion header for your own UI (in design)
     - Makers, instrument designers, firmware developers


Proven Lineage
--------------

The TBD audio engine has been shipping in hardware for years across multiple form factors:

- **TBD-16** --- Current-generation desktop instrument by dadamachines
- **CTAG TBD Eurorack** --- The original open-source module
  (`upstream repo <https://github.com/ctag-fh-kiel/ctag-tbd>`_),
  commercially sold by
  `Instruments of Things <https://instrumentsofthings.com/products/tbd>`_
- **AE Modular TBD** --- Compact adaptation by
  `tangible waves <https://www.tangiblewaves.com/store/p149/TBD.html>`_
  (`wiki <https://wiki.aemodular.com/#/modules/tbd>`_)
- **Open-source core** --- Upstream repository:
  `ctag-fh-kiel/ctag-tbd <https://github.com/ctag-fh-kiel/ctag-tbd>`_

Your own hardware
-----------------

The firmware builds for boards with or without an SD card and an RP2350: two
Kconfig options, ``TBD_USE_SD_CARD`` and ``TBD_USE_RP2350``, under
*CTAG TBD Configuration → TBD Hardware Configuration*.
``HARDWARE_CONFIGURATIONS.md`` in the repository describes the four
configurations and how to build each. Start from the
:doc:`TBD Open Board <20_tbd_open_board>`. To build a product with
dadamachines, `get in touch <https://dadamachines.com/contact/>`_.

.. include:: /_includes/newsletter.rst

.. include:: /_includes/footer-links.rst

.. toctree::
   :hidden:
   :glob:

   [0-9]*
