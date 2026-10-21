# Contributing to dadamachines TBD

Thank you for helping improve the TBD platform! This guide covers how to
set up your fork, build the firmware, and submit pull requests.

---

## Repository Layout

| Directory | What's there |
|-----------|-------------|
| `main/` | ESP32-P4 firmware entry point and system management |
| `components/` | DSP plugins, drivers, audio engine |
| `sdcard_image/` | SD card image: samples, kits, presets, web UI — mirrors device layout |
| `simulator/` | Desktop simulator for plugin development |
| `generators/` | Scaffolding templates for new plugins and rack machines |
| `docs/` | Sphinx documentation (RST) + flash pages |
| `tools/` | Build scripts, sample utilities, kit restructure tools |
| `.github/workflows/` | CI workflows |

---

## Branches

| Branch | What it is |
|--------|------------|
| `staging` | **The pull request target.** Branch off `staging` and open your PR against it. CI compile-checks every PR. |
| `dada-tbd-master` | The release snapshot and the default branch. It is updated by the maintainers at each release; do not open PRs against it. |
| `p4_main` | The upstream [ctag-fh-kiel/ctag-tbd](https://github.com/ctag-fh-kiel/ctag-tbd) lineage this fork is based on. |

At each release, `staging` is reset to match `dada-tbd-master`.

---

## Getting Started — Fork Setup

### Fresh clone (read-only — for users / playing along)

```bash
git clone --recursive https://github.com/dadamachines/ctag-tbd.git
cd ctag-tbd
```

### For PR contributors

Fork the repo on GitHub first, then:

```bash
git clone --recursive https://github.com/YOUR_USERNAME/ctag-tbd.git
cd ctag-tbd
git remote add upstream https://github.com/dadamachines/ctag-tbd.git

# Track the staging branch (your PR target — NOT dada-tbd-master)
git fetch upstream
git checkout -b staging upstream/staging
```

### If you already have an older fork (e.g. `possan/ctag-tbd`)

```bash
cd ctag-tbd
git remote add upstream https://github.com/dadamachines/ctag-tbd.git
# (skip if you already have an 'upstream' remote)
git fetch upstream

# Reset to the current staging tip
git checkout -b staging upstream/staging
# or if you already have the branch:
git checkout staging
git reset --hard upstream/staging
```

---

## Building Firmware

### Prerequisites

- **ESP-IDF v5.5.3** — [install guide](https://docs.espressif.com/projects/esp-idf/en/v5.5.3/esp32p4/get-started/)
- **xxhash** — `brew install xxhash` (macOS) or `apt install xxhash` (Linux)
- ESP32-P4 target (not ESP32)

### Build

```bash
. ~/esp/esp-idf/export.sh   # or wherever your ESP-IDF is
idf.py build
```

The build produces:

| Artifact | Path | Description |
|----------|------|-------------|
| `dada-tbd.bin` | `build/dada-tbd.bin` | Main firmware (app partition) |
| `bootloader.bin` | `build/bootloader/bootloader.bin` | ESP32-P4 bootloader |
| `partition-table.bin` | `build/partition_table/partition-table.bin` | Partition layout |
| `ota_data_initial.bin` | `build/ota_data_initial.bin` | OTA boot selector |
| `dada-tbd-sd.zip` | `build/dada-tbd-sd.zip` | SD card archive (WebUI + samples + data) |
| `dada-tbd-sd-hash.txt` | `build/dada-tbd-sd-hash.txt` | SD archive integrity hash |
| `dada-tbd-unified.bin` | `docs/_static/firmware/p4/dada-tbd-unified.bin` | Merged binary for address 0x0 flash; written by `./create_unified_p4_firmware.sh` after the build, not by `idf.py build` |
| `webui-update-v*.zip` | `build/webui-update-v*.zip` | WebUI update package; made only by CI (`.github/workflows/build-firmware.yml`) |

### Flash to Device

> **Never use `idf.py flash`** — it writes OTA data that causes reboot loops.

Use the provided script:

```bash
bin/flash.sh
```

Or flash manually with esptool:

```bash
PORT=$(ls /dev/cu.usbmodem* 2>/dev/null | head -1)
esptool.py --chip esp32p4 -p "$PORT" -b 460800 \
  --before=default_reset --after=hard_reset \
  write_flash --flash_mode dio --flash_freq 80m --flash_size 16MB \
  0x2000  build/bootloader/bootloader.bin \
  0x10000 build/dada-tbd.bin \
  0x8000  build/partition_table/partition-table.bin \
  0xd000  build/ota_data_initial.bin
```

### Build WebUI

```bash
cd sdcard_image/www && bash build-webui.sh && cd ../..
```

---

## Submitting Changes (Pull Request Workflow)

For external contributors:

```
1. Fork dadamachines/ctag-tbd on GitHub (if not already done)
2. Create a feature branch from `staging` (NOT dada-tbd-master)
3. Make changes, commit, push to your fork
4. Open a PR against dadamachines/ctag-tbd → `staging`
5. CI compile-check runs automatically — fix any failures
6. CLA-bot prompts you to sign on your first PR
7. Maintainer reviews and merges to `staging`
```

Accepted changes reach `dada-tbd-master` with the next release.

### Step by step

```bash
# Sync your fork with upstream's staging
git fetch upstream
git checkout staging
git reset --hard upstream/staging

# Create your feature branch
git checkout -b feature/my-improvement

# ... make changes ...
git add -A && git commit -m "feat: describe what you changed"

# Push to YOUR fork (not upstream)
git push origin feature/my-improvement
```

Then open a PR on GitHub: `your-fork:feature/my-improvement` → `dadamachines/ctag-tbd:staging`.

CI compile-check runs automatically — you'll see the result on the PR page.

---

## CI on This Repository

| Event | Workflow | What happens |
|-------|----------|-------------|
| PR or push to `dada-tbd-master` / `staging` that changes firmware files | `ci.yml` | Builds the firmware in Docker (`espressif/idf:v5.5.3`) and checks that it links, plus compile checks of the alternate hardware configurations. No release. |
| PR or push to `dada-tbd-master` / `staging` that changes `simulator/`, `components/` or the rack data (`sdcard_image/factory/synthdefinitions.json`, `sdcard_image/factory/plugins/`) | `build-simulator.yml` | Builds the desktop simulator on Ubuntu (`tbd-sim`, `load-test`, `routing-test`, `rack-lint`) and runs `rack-lint` and a `tbd-sim --help` smoke check. |
| Push to `dada-tbd-master` | `deploy-docs.yml` | Builds this documentation and deploys it to GitHub Pages. |

Docs-only commits do **not** trigger a firmware build.

`routing-test` is built but not run in CI: its audio fingerprint comparison is
byte-equality on formatted floats and drifts between Linux GCC and Apple clang,
so it stays a local (macOS) tool. The simulator job is Linux-only and will not
catch macOS-specific build issues.

---

## For Plugin Developers

See the [plugin documentation](https://dadamachines.github.io/ctag-tbd/plugins/)
and the generator templates in `generators/`.

## Code Style

- C++20
- Follow existing patterns in the file you're editing
- No `idf.py flash` in any script or documentation

---

## Repository History Reset (2026-05)

On **2026-05-13**, `dada-tbd-master` was reset to a single squashed commit
on top of the upstream `ctag-fh-kiel/ctag-tbd` `p4_main` lineage. This was
a one-time licence + structure cleanup at the public release of the
TBD-16 platform — no source code is lost, but old commit SHAs on
`dada-tbd-master` no longer resolve. The `p4_main` branch and all `v*`
release tags are unchanged.

If your clone was made before that date, update it:

```bash
# Fresh re-clone (simplest):
git clone --recursive https://github.com/dadamachines/ctag-tbd.git
cd ctag-tbd
```

Or, if you want to keep your existing clone (e.g. you have local feature
branches to preserve):

```bash
git remote add upstream https://github.com/dadamachines/ctag-tbd.git  # skip if already set
git fetch upstream
git checkout dada-tbd-master
git reset --hard upstream/dada-tbd-master
# If you had pushed dada-tbd-master to your own fork on GitHub:
git push origin dada-tbd-master --force
```

Your local feature branches can be cherry-picked onto the new history.

---

## Building RP2350 Apps (Pico Side)

The TBD-16 has a second processor — an RP2350 — that runs the user
interface, MIDI I/O, and display. You can build custom apps for it.

### Quick Start

1. **Fork** [`dadamachines/dada-tbd-app-template`](https://github.com/dadamachines/dada-tbd-app-template)
2. Clone your fork and install [PlatformIO](https://platformio.org/)
3. Build: `pio run -e pi2350`
4. Flash: enter BOOTSEL mode (hold right front button on USB-C #2), drag `firmware.uf2` onto the USB drive

The template is the recommended starting point, but you can use **any
RP2350 toolchain** — Pico SDK, Arduino IDE, Rust, etc. Any toolchain that
produces a valid `.uf2` binary works.

### Publishing Your App to the App Catalog

To share your app in the App Catalog:

1. **Build** your app and **create a GitHub Release** with the `.uf2` attached
2. **Note the SHA-256**: `sha256sum my-app.uf2`
3. **Open a PR** to [`dadamachines/dada-tbd-firmware`](https://github.com/dadamachines/dada-tbd-firmware)
   adding `apps/your-app/manifest.json`:

```json
{
  "id": "your-app",
  "name": "Your App Name",
  "description": "What it does",
  "author": { "name": "Your Name", "github": "your-username" },
  "repo": "https://github.com/your-username/your-app-repo",
  "license": "MIT",
  "tier": "community",
  "category": "instrument",
  "sdFilename": "your-app.uf2",
  "releases": [{
    "version": "1.0.0",
    "firmwareCompat": "0.4",
    "date": "2026-03-22",
    "sourceUrl": "https://github.com/your-username/your-repo/releases/download/v1.0.0/your-app.uf2",
    "sha256": "abc123...",
    "size": 524288,
    "changelog": "Initial release"
  }]
}
```

4. **CI validates** your PR automatically (schema check, downloads binary, verifies SHA-256)
5. **dadamachines reviews and merges** — the binary is committed to the CDN
   repo and served from GitHub Pages (same origin as the App Manager, no
   CORS issues)

> **Why does the binary need to be in the CDN repo?**
> GitHub Release download URLs don't set `Access-Control-Allow-Origin`
> headers. The browser-based App Manager on `dadamachines.github.io` can
> only fetch files from the same origin. CI downloads the binary server-side
> (no CORS) and commits it to the CDN repo so it's served from Pages.

### Sideloading (no catalog needed)

You don't need the catalog to run your app. Just build and flash:

```bash
# Build
pio run -e pi2350

# Flash (standalone mode — replaces current app)
# Enter BOOTSEL mode → drag firmware.uf2 onto USB drive

# Or with PlatformIO upload:
pio run -t upload
```

Sideloaded apps have the same SPI API access as catalog apps — no
capability difference. The catalog is for sharing, not for running.

---

## License & Contributor License Agreement (CLA)

This project is licensed under the terms in [LICENSE](LICENSE):

- **Firmware & tooling** — **GPL-3.0-only** (the upstream CTAG engine and the
  dadamachines / Per-Olov Jernberg additions alike). Contributions to the
  firmware are accepted under GPL-3.0.
- **WebUI** (`sdcard_image/www/`) — proprietary, © dadamachines / Johannes Elias
  Lohbihler; not under the GPL and not currently open to outside contributions.
- **Third-party components** — vendored libraries under `components/` and
  `sdcard_image/www/` retain their own per-file licence headers / `LICENSE` /
  `readme` files. Use those as the authoritative reference for re-distribution.

**CLA:** because the TBD platform is offered under a dual licence (GPL-3.0 *or*
a commercial licence for closed-source products — see [LICENSE](LICENSE)), every
contributor must sign the project's **Contributor License Agreement** before a
pull request can be merged. You keep the copyright in your contribution; the CLA
grants dadamachines the right to distribute it under GPL-3.0 *and* to include it
in the commercially-licensed version. A bot will prompt you to sign on your first PR. The CLA text is in `CLA.md` (currently a draft pending legal review). (This is the same model used by JUCE, Qt, etc.; it's what keeps the
commercial-licence offer — and therefore the funding behind the project —
possible.)

**Maintainers:** dadamachines (Johannes Elias Lohbihler), Per-Olov Jernberg
(possan), Robert Manzke (CTAG). External contributors PR against `staging`.
Generally-useful engine improvements may also be offered upstream to
[ctag-fh-kiel/ctag-tbd](https://github.com/ctag-fh-kiel/ctag-tbd).

The [RP2350 App Template](https://github.com/dadamachines/dada-tbd-app-template)
is separate — your sideloaded-app code is yours under your own licence.
