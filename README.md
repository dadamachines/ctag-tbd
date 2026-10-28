# dadamachines TBD-16

The first standalone desktop audio DSP platform based on [CTAG TBD](https://github.com/ctag-fh-kiel/ctag-tbd), with standard MIDI connectivity — designed to bring open-source audio processing beyond Eurorack.

**TBD-16** combines 50+ high-quality generators and effects in a modular, extensible architecture. It is built for musicians, educators, and audio researchers who want hands-on DSP without proprietary lock-in.

## Documentation

**[dadamachines.github.io/ctag-tbd](https://dadamachines.github.io/ctag-tbd/)** — setup guides, plugin reference, flashing.

## Build your own plugin or machine

TBD-16 is open to community contributions. Every sound on the device — synths, drum voices, effects, the 16-track **GrooveBoxRack** and its machine voices — is a C++ plugin against a small DSP API. There are two flavours:

- **Legacy `ctagSoundProcessor` plugin** — a standalone, Eurorack-style sound processor (one synth or effect per slot).
- **GrooveBoxRack machine** — a drum or synth voice that lives inside the 16-track rack, with macros, presets, and the integrated sequencer.

You can iterate without flashing the device — a **desktop simulator** runs the same plugin code on your laptop with a web UI in the browser.

### Try the simulator (macOS / Linux, no hardware, no ESP-IDF)

```sh
# Debian/Ubuntu: sudo apt install build-essential cmake git libboost-filesystem-dev libboost-thread-dev libboost-program-options-dev libasound2-dev
# macOS:         brew install cmake boost
git clone --recursive https://github.com/dadamachines/ctag-tbd.git
cd ctag-tbd/simulator && mkdir -p build && cd build
cmake .. && make tbd-sim
./tbd-sim --list          # pick your sound card
./tbd-sim --device <N>    # run from simulator/build, then open http://localhost:8080/
```

**Cloned before 2026-10-21?** The history was rewritten, so `git pull` does not update you: run `git fetch origin && git reset --hard origin/dada-tbd-master && git submodule sync --recursive && git submodule update --init --recursive`, delete `simulator/build`, or clone again.

Clone this repository, not the CTAG upstream (`ctag-fh-kiel/ctag-tbd`): the upstream simulator expects esp-dsp in `managed_components/` and has no TBD-16 WebUI API. Details and troubleshooting: [Desktop simulator](https://dadamachines.github.io/ctag-tbd/get_started/simulator.html).

### Get started in 4 links

- **[Plugin documentation](https://dadamachines.github.io/ctag-tbd/plugins/)** — API reference, parameter / macro / preset model, GrooveBoxRack machine guide, examples
- **[`generators/`](generators/readme.md)** — Node.js scaffolding for new plugins (`generator.js`) and new rack machines (`rackgen.js`); one command to drop a working stub in place
- **[`simulator/`](simulator/readme.md)** — host-side build of the firmware + a browser WebUI; develop and audition plugins without the device
- **[`CONTRIBUTING.md`](CONTRIBUTING.md)** — building the firmware, PR workflow, CLA

External contributors open pull requests against the [`staging`](https://github.com/dadamachines/ctag-tbd/tree/staging) branch; `dada-tbd-master` is the release snapshot. CI compile-checks every PR, maintainers review, and the CLA-bot prompts for a signature on your first PR. If your PR adds something generally useful for the upstream CTAG TBD engine, we'll happily help open a parallel PR there.

## What this fork does

This repository is a fork of [ctag-fh-kiel/ctag-tbd](https://github.com/ctag-fh-kiel/ctag-tbd) (branch `p4_main`), adapted for the **dadamachines TBD-16** hardware. Our focus:

- **UI/UX** — Redesigned web interface with musician-friendly interaction patterns
- **Documentation** — Clear guides, example workflows, and UX guidelines for plugin developers
- **Desktop hardware** — Standalone form factor with standard MIDI, no Eurorack required
- **Macro / preset / rack layer** — The 16-track GrooveBoxRack on top of the CTAG plugin model

The DSP engine and plugin system come from upstream, originally created by [Robert Manzke](https://github.com/ctag-fh-kiel/ctag-tbd); dadamachines and Per-Olov Jernberg add the macro / preset / rack layer, the WebUI, the docs site, hardware-specific drivers, and the GrooveBoxRack machine framework.

## Project structure

```
components/         DSP plugins and sound processors
generators/         Plugin scaffolding templates
main/               Firmware entry point and system management
sdcard_image/       SD card image (samples, kits, presets, web UI)
simulator/          Desktop simulator for plugin development
docs/               Sphinx documentation source
tools/              Build scripts, sample / preset / macro utilities
```

### Building the documentation locally

```bash
pip install -r docs/requirements.txt
sphinx-build -b html -c docs/config docs build/docs
# open build/docs/index.html
```

## Community & support

- [dadamachines Forum](https://forum.dadamachines.com) — Ask questions, share patches, connect with other TBD users and developers.
- [GitHub Issues](https://github.com/dadamachines/ctag-tbd/issues) — Bug reports and feature requests.

## Hardware

TBD-16 ships with the full hardware platform (ESP32-P4 + RP2350 coprocessor for sequencer / OLED / MIDI + SD card). The firmware also supports three lighter board variants. See [HARDWARE_CONFIGURATIONS.md](HARDWARE_CONFIGURATIONS.md) for the feature matrix and the Kconfig flags that select between them.

## Credits

The **dadamachines CTAG TBD adaptation** is led by Johannes Elias Lohbihler. **CTAG TBD** was originally created by Robert Manzke.

### The team behind TBD-16

- **[Johannes Elias Lohbihler](https://dadamachines.com)** — Hardware, product & UX; founder of dadamachines
- **[Robert Manzke](https://github.com/ctag-fh-kiel)** — DSP engine & plugins; created CTAG TBD
- **[Per-Olov Jernberg](https://possan.codes)** — Firmware & Groovebox app
- **[Servando Barreiro](https://servando.teks.no)** — UX & sound design, QC and testing
- **[Benjamin Weiss](https://instrument-design.com/work/)** — UX design; previously at Native Instruments and Ableton

## Funding

This project is partially funded through the [NGI0 Commons Fund](https://nlnet.nl/commonsfund), established by [NLnet](https://nlnet.nl/) with financial support from the European Commission's [Next Generation Internet](https://ngi.eu/) programme, under grant agreement No [101135429](https://cordis.europa.eu/project/id/101135429).

Not all work on TBD / TBD-16 is covered by NLnet funding.

[<img src="https://nlnet.nl/logo/banner-320x120.png" alt="NLnet" width="160">](https://nlnet.nl/project/TBD-DSP-Toolkit/)

## License

**Firmware & tooling** — [GNU General Public License v3.0 (GPL-3.0-only)](https://www.gnu.org/licenses/gpl-3.0.txt). This covers the upstream CTAG DSP engine / sound processors / platform core **and** the dadamachines / Per-Olov Jernberg additions (REST API, macro/preset system, rack layer, drivers, build tools, simulator, tests). Modifications distributed must be released under GPL-3.0.

**WebUI** (`sdcard_image/www/` — dadamachines-authored HTML/JS/CSS) — **proprietary: © 2014-2026 dadamachines / Johannes Elias Lohbihler. All rights reserved.** *Not* under the GPL. It's a separate program talking to the firmware over its REST API, not a derivative work of the firmware. Reuse requires written permission. (Vendored web components — Shoelace, webaudio-controls, Sortable — keep their own licences; per-file headers are authoritative.)

**Commercial license** — Building a commercial product on TBD without GPL-3.0's source-disclosure obligations (closed-source firmware, ship without attribution, custom OEM terms, or use of the WebUI) — a commercial licence is available. Contact dadamachines: https://dadamachines.com/contact/

**TBD-Core & TBD-16 Hardware** — The dadamachines TBD-16 (desktop instrument) and TBD-Core (core DSP board for custom products) hardware designs are proprietary.

**Planned Open-Hardware Core Design** — An open-hardware core design based on the same ESP32-P4 + RP2350 platform is planned for future publication in KiCad as an open-source reference.

**Original CTAG Hardware** (V1/V2) — [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](https://creativecommons.org/licenses/by-nc-sa/4.0/).

**Third-party components** — vendored libraries under `components/` and `sdcard_image/www/` retain their own per-file licence headers / `LICENSE` / `readme` files (Mutable Instruments-derived MIT DSP, Airwindows MIT, RapidJSON MIT, Ableton Link GPL-2.0+, Shoelace MIT, etc.).

Copyright © 2020-2026 Robert Manzke (CTAG TBD core/engine, original hardware research).

Copyright © 2024-2026 Per-Olov Jernberg ([possan.codes](https://possan.codes)) (macro/preset/rack layer).

Copyright © 2024-2026 Johannes Elias Lohbihler for dadamachines (TBD-16 adaptation, REST API, WebUI, documentation, contributions to macro/preset/rack/simulator).

See [LICENSE](LICENSE) for full details including trademark, commercial-use and contribution (CLA) terms. Contributions to the firmware are welcome under GPL-3.0 — see [CONTRIBUTING.md](CONTRIBUTING.md).
