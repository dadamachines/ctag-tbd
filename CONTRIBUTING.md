# Contributing to dadamachines TBD

Thank you for helping improve the TBD platform! This guide covers how to
set up your fork, build firmware, test your changes with CI, and submit
pull requests.

---

## Repository Layout

| Directory | What's there |
|-----------|-------------|
| `main/` | ESP32-P4 firmware entry point and system management |
| `components/` | DSP plugins, drivers, audio engine |
| `sdcard_image/` | SD card image: samples, kits, presets, web UI — mirrors device layout |
| `docs/` | Sphinx documentation (RST) + flash pages |
| `tools/` | Build scripts, sample utilities, kit restructure tools |
| `.github/workflows/` | CI / release pipelines |

---

## Branch Model

TBD-16 uses a **two-repo, two-tier** model:

```
dadamachines/ctag-tbd  (PUBLIC — this repo)
│
├── dada-tbd-master    ← READ-ONLY release snapshot
│                         Updated only by maintainers (Phase-5-style squash from dev).
│                         Branch protection blocks direct pushes + PR merges
│                         from anyone but admins.
│                         Docs deploy on every (maintainer) push.
│
└── staging            ← EXTERNAL CONTRIBUTOR PR TARGET
                          External PRs target this branch.
                          CI compile-check runs on every PR + push.
                          Maintainers review, request CLA signature, merge.
                          Maintainers periodically drain commits to the
                          private dev repo (see below).

dadamachines/ctag-tbd-dev  (PRIVATE — maintainer working repo)
│
├── dada-tbd-master    ← internal trunk; full unsquashed history
├── staging            ← pre-release; firmware auto-deploys to CDN staging channel
└── feature-test/*     ← per-feature CDN builds (CDN-token-scoped, maintainer-only)
```

**External contributors** never touch `ctag-tbd-dev` directly and never PR against
`dada-tbd-master` on the public repo. Workflow:

1. Fork `dadamachines/ctag-tbd` on GitHub.
2. Branch off **`staging`** (NOT `dada-tbd-master`).
3. Make changes, push to your fork.
4. Open PR `your-fork:feature/x` → `dadamachines/ctag-tbd:staging`.
5. CI compile-check runs on the PR. Fix any failures.
6. Maintainer reviews; CLA-bot requests signature on first PR.
7. Maintainer merges to `public/staging`.

**Maintainers** continue working in `ctag-tbd-dev` for day-to-day development.
Periodically (typically weekly), a maintainer drains accepted external commits
from `public/staging` into `ctag-tbd-dev/dada-tbd-master` via cherry-pick, where
they go through full firmware CI and the CDN staging channel for hardware
testing. At each public release, a fresh squashed snapshot is pushed to
`public/dada-tbd-master` and `public/staging` is reset to match it.

### What triggers what

| Event | Workflow | What happens |
|-------|----------|-------------|
| PR against `dada-tbd-master` or `staging` (firmware files changed) | `ci.yml` (public repo) | Build check — validates firmware compiles. No release. |
| PR against `dada-tbd-master` or `staging` (simulator / components / rack-data files changed) | `build-simulator.yml` (public repo) | Build the desktop simulator on Ubuntu + run `routing-test` and `rack-lint` headless smoke tests. |
| Push to `dada-tbd-master` | `deploy-docs.yml` (public repo) | Docs rebuild + deploy to GitHub Pages |
| Push to `staging` (firmware files changed) | `ci.yml` (public repo) | Build check |
| Push to `staging` (simulator / components / rack-data files changed) | `build-simulator.yml` (public repo) | Same as the PR check above |
| Push to `ctag-tbd-dev` `staging` | `staging-release.yml` (dev repo) | Full build → GitHub pre-release → CDN staging channel |
| Push to `ctag-tbd-dev` `feature-test/*` | `feature-test-release.yml` (dev repo) | Full build → GitHub pre-release → CDN per-feature channel |
| Push `v*` tag on `ctag-tbd-dev` `dada-tbd-master` | `create-release.yml` (dev repo) | Full build → GitHub Release → CDN stable channel |

**Key distinctions:**

- The public repo does **only compile-check CI** — no firmware-binary CDN dispatch from public CI. (The CDN token lives on the private repo.) External PR authors validate that the code compiles; maintainers test on hardware after draining to the dev repo.
- Firmware releases happen from the **dev repo**, never from the public repo.
- Public `dada-tbd-master` is a snapshot, not a working trunk. Direct PR merges to it are blocked.

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
| `dada-tbd-unified.bin` | `build/dada-tbd-unified.bin` | Merged binary for address 0x0 flash |
| `webui-update-v*.zip` | `build/webui-update-v*.zip` | WebUI update package (built by CI) |

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

> Maintainers periodically drain merged `staging` commits into the private
> dev repo for full firmware-CI + hardware testing. From there your change
> rides the next release snapshot back onto the public `dada-tbd-master`.

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

## Testing Firmware on Real Hardware (Maintainers Only)

The full firmware-build + CDN-dispatch pipeline lives in the **private**
`dadamachines/ctag-tbd-dev` repo, behind the `FIRMWARE_CDN_TOKEN` secret.
External PRs only get compile-check on the public CI; once a maintainer
has drained your PR into the dev repo, the dev `staging` branch (or a
`feature-test/*` branch) produces a CDN-hosted build flashable from the
[Beta Channel page](https://dadamachines.github.io/ctag-tbd/flash/20_staging_channel.html).

If you want a CDN-flashable build of your PR before merge, ask a
maintainer to create a `feature-test/<your-pr>` channel for you on the
dev repo.

The two dev-repo channels:

### Staging channel — pre-release testing

```bash
# Maintainer (with dev-repo push access):
cd ctag-tbd-dev
git checkout staging
git merge dada-tbd-master
git push origin staging
```

Triggers `staging-release.yml` on the dev repo: full firmware build → GitHub pre-release → CDN staging channel.

### Feature-Test channel — per-PR builds

```bash
# Maintainer creates a feature-test branch on the dev repo and cherry-picks the PR onto it:
cd ctag-tbd-dev
git checkout -b feature-test/external-pr-123 dada-tbd-master
git cherry-pick <commits-from-public-staging>
git push origin feature-test/external-pr-123
```

Triggers `feature-test-release.yml` on the dev repo: per-PR CDN channel
(`feature-test-external-pr-123`), flashable from the Beta Channel page's
dropdown.

---

## Typical Contributor Workflows

### External: "I want to fix a bug and submit a PR"

```bash
git fetch upstream && git checkout -b fix/my-bugfix upstream/staging
# fix the bug...
git push origin fix/my-bugfix
# open PR → upstream/staging  (NOT dada-tbd-master)
```

CI compile-check runs. Maintainer reviews + merges. Maintainer drains to the dev repo for hardware test. Done.

### Maintainer: "I want to test my changes on real hardware via browser flash"

```bash
# In the private dev repo:
cd ctag-tbd-dev
git fetch origin
git checkout staging
git merge origin/dada-tbd-master
git push origin staging
# → staging-release.yml builds → flash from Beta Channel page → test on device
```

Or, for pre-merge testing of an in-progress feature (still in `ctag-tbd-dev`):

```bash
git checkout -b feature-test/my-feature origin/dada-tbd-master
git cherry-pick <commits>
git push origin feature-test/my-feature
# → feature-test-release.yml builds → flash from Beta Channel page (feature dropdown)
```

### Maintainer: "I want to trigger a stable release"

Stable releases are tagged on the **private** `ctag-tbd-dev` repo (`create-release.yml` lives there with the `FIRMWARE_CDN_TOKEN`):

```bash
# In the private dev repo:
cd ctag-tbd-dev
git checkout dada-tbd-master
git tag vX.Y.Z          # X.Y.Z = next release number
git push origin vX.Y.Z
# → create-release.yml builds → GitHub Release on the dev repo → CDN stable channel → Stable Channel flash page
```

---

## CI Pipelines — Detail

### Public-repo CI (`ci.yml` in `dadamachines/ctag-tbd`)

Runs on every push to `dada-tbd-master` or `staging`, and on pull requests
against either — but **only when firmware-relevant files change** (source
code, CMake, sdkconfig, patches, sdcard_image, workflows). Docs-only
commits do **not** trigger a firmware build.

Compile-check only. Builds the full firmware in Docker
(`espressif/idf:v5.5.3`) and validates that it links. **Does not create
a release** and **does not push to the CDN** — the public repo doesn't
hold the CDN token. Hardware testing happens after maintainers drain to
the dev repo.

### Public-repo simulator build (`build-simulator.yml` in `dadamachines/ctag-tbd`)

Runs on PRs / pushes that touch `simulator/`, `components/`, or the rack
data (`sdcard_image/factory/synthdefinitions.json`,
`sdcard_image/factory/plugins/`). Builds the desktop simulator on Ubuntu
(`tbd-sim` + `load-test` + `routing-test` + `rack-lint`) and runs the
portable smoke test:

- **`rack-lint`** — cross-checks the runtime voice registry against
  `synthdefinitions.json` (catches "JSON lists machine X but no voice
  flips on for it").

`routing-test` is built but not run in CI — its phase-3 audio fingerprint
comparison is byte-equality on formatted floats and drifts between Linux
GCC and Apple clang. Until that gets a tolerance-aware comparator, it
stays a local (macOS) tool; CI just verifies it links cleanly.

Linux-only — won't catch macOS-specific build issues (those need a
maintainer or a contributor with that platform to verify locally). Useful
guard against the most common simulator-breaking changes nevertheless.

### Docs Deploy (`deploy-docs.yml` in `dadamachines/ctag-tbd`)

Runs on **every push** to `dada-tbd-master`. Builds and deploys
documentation to GitHub Pages. Docs updates are immediately visible
without a firmware release.

### Dev-repo workflows (`dadamachines/ctag-tbd-dev`) — maintainer-only

These workflows live on the private dev repo and aren't visible to
external contributors. They're what produces CDN-hosted firmware builds.

- **`staging-release.yml`** — triggered on every push to the dev repo's
  `staging` branch. Full firmware build + WebUI bundle → GitHub
  pre-release on the dev repo → push to CDN `staging/` channel.

- **`feature-test-release.yml`** — triggered on every push to a
  `feature-test/*` branch on the dev repo. Same pipeline, per-feature CDN
  channel.

- **`create-release.yml`** — triggered by pushing a `v*` tag to the dev
  repo's `dada-tbd-master`. Full build → GitHub Release on the dev repo
  → push to CDN `stable/` channel.

External PRs against `public/staging` ride through `staging-release.yml`
after a maintainer drains them into the dev repo.

---

## Firmware CDN (`dada-tbd-firmware`)

All release and pre-release firmware is served from
[`dadamachines.github.io/dada-tbd-firmware/`](https://dadamachines.github.io/dada-tbd-firmware/).

### Channel Structure

```
apps/                                ← RP2350 app registry (catalog-driven)
  ├── bootloader/                    ← BOOT2350 bootloader
  │   └── manifest.json
  ├── groovebox/                     ← Groovebox app (from possan/tbd-pico-seq3)
  │   └── manifest.json
  ├── tusb-msc-pico/                 ← USB MSC helper for Pico (UF2)
  │   └── manifest.json
  ├── debug-probe/                   ← Debug probe app
  │   └── manifest.json
  ├── flash-nuke/                    ← Flash nuke utility
  │   └── manifest.json
  └── game/                          ← Example game app
      └── manifest.json
utilities/
  └── dada-tbd-16-tusb_msc-p4/      ← P4 USB MSC helper (bin, not in catalog)
      └── dada-tbd-16-tusb-msc.bin
stable/
  ├── p4/               ← P4 firmware (versioned, flat)
  ├── pico/             ← RP2350 Groovebox UF2
  └── releases.json     ← channel manifest with version history
staging/
  ├── p4/
  ├── pico/
  └── releases.json
feature-test-<name>/
  ├── p4/
  ├── pico/
  └── releases.json
webui-updates/
  ├── latest.json       ← latest WebUI version metadata
  └── webui-update-v*.zip  ← WebUI update packages (deduplicated)
app-catalog.json         ← auto-generated merged catalog of all apps
bundles/                 ← pre-assembled SD card bundles
```

The CDN repo has 6 GitHub Actions workflows:

| Workflow | Purpose |
|----------|---------|
| `build-catalog.yml` | Merges all `apps/*/manifest.json` into `app-catalog.json` |
| `deploy-pages.yml` | Deploys the CDN to GitHub Pages |
| `receive-firmware.yml` | Receives P4 firmware dispatch from this repo |
| `receive-pico-app.yml` | Receives Pico app dispatch from app repos |
| `validate-pr.yml` | Validates app manifest PRs (schema + SHA-256 check) |
| `build-picosd-bundle.yml` | Manual dispatch — assembles Pico SD bundle |

Each workflow uses its own concurrency group to prevent cross-cancellation.

### Manifest Format (`releases.json`)

```json
{
  "channel": "stable",
  "latest": "v0.5.0",
  "versions": [
    {
      "tag": "v0.5.0",
      "timestamp": "2026-03-22T10:00:00Z",
      "files": {
        "unified": "stable/p4/dada-tbd-16-v0.5.0-unified.bin",
        "sdcard": "stable/p4/dada-tbd-16-v0.5.0-sd.zip",
        "hash": "stable/p4/dada-tbd-16-v0.5.0-sd-hash.txt",
        "pico": "stable/pico/dada-tbd-16-v0.5.0-pico.uf2"
      },
      "webuiVersion": "0.5.0",
      "webuiUpdate": "webui-updates/webui-update-v0.5.0.zip"
    }
  ]
}
```

---

## Artifact Naming Convention

All public-facing artifacts use the **dadamachines** product name with a
device prefix (`dada-tbd-16-`) on the CDN. Build outputs keep their
original names; the CDN receive workflow renames them.

### Tag format per channel

| Channel | Tag format | Example tag | Example CDN filename |
|---------|-----------|-------------|---------------------|
| **Stable** | `v{semver}` | `v0.5.0` | `dada-tbd-16-v0.5.0-unified.bin` |
| **Staging** | `staging-v{base}-{N}` | `staging-v0.4.2-3` | `dada-tbd-16-staging-v0.4.2-3-unified.bin` |
| **Feature** | `feature-test-{name}` | `feature-test-cool-thing` | `dada-tbd-16-feature-test-cool-thing-unified.bin` |

- Staging tags are derived from `git describe`: base = nearest `v*` tag, N = commit distance
- Feature tags equal the channel name (branch `feature-test/cool-thing` → tag `feature-test-cool-thing`)
- The tag prefix (`staging-`, `feature-test-`) ensures binaries are self-identifying even outside their CDN directory

### CDN artifact table

| Artifact | Build Output | CDN Name | Notes |
|----------|-------------|----------|-------|
| Unified image | — | `dada-tbd-16-{tag}-unified.bin` | All partitions merged, flash at `0x0` |
| SD archive | `dada-tbd-sd.zip` | `dada-tbd-16-{tag}-sd.zip` | Versioned in `{channel}/p4/` |
| SD hash | `dada-tbd-sd-hash.txt` | `dada-tbd-16-{tag}-sd-hash.txt` | Versioned in `{channel}/p4/` |
| P4 USB MSC | `tusb_msc.bin` | `dada-tbd-16-tusb-msc.bin` | Fixed at `utilities/dada-tbd-16-tusb_msc-p4/` |
| Pico USB MSC | — | `tusb-msc-pico-{ver}.uf2` | In `apps/tusb-msc-pico/` (catalog-driven) |
| Pico firmware | — | `dada-tbd-16-{tag}-pico.uf2` | RP2350 Groovebox |
| App catalog | — | `app-catalog.json` | Auto-generated from `apps/*/manifest.json` |

### Why `dada-tbd` and not `ctag-tbd`?

This repository is a fork of `ctag-fh-kiel/ctag-tbd` (upstream). The
upstream project targets different hardware. Our artifacts represent
dadamachines hardware products (TBD-16, TBD-Core) and should be clearly
identifiable as dadamachines firmware — not generic `ctag-tbd` builds for
unknown hardware.

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

There are two paths depending on your relationship with dadamachines:

#### Path A — Trusted collaborator (direct push)

For internal contributors with `PICO_CDN_TOKEN` access (e.g. possan).
Your CI runs a `publish-cdn` job that clones the CDN repo, commits the
`.uf2`, and pushes directly — on tagged releases:

```bash
# In your app repo, tag a release:
git tag v1.0.0
git push origin v1.0.0
# → CI builds .uf2 → pushes to CDN repo → binary lands on Pages
```

The template repo includes the `publish-cdn` job in its CI workflow.
You need a `PICO_CDN_TOKEN` secret — ask dadamachines for one.

> **Why direct push instead of `repository_dispatch`?** GitHub Actions
> `GITHUB_TOKEN` can't download artifacts across repos from private
> repositories. Direct push with a fine-grained PAT (`PICO_CDN_TOKEN`)
> works for both public and private source repos.

#### Path B — External contributor (manifest PR)

For anyone building RP2350 apps:

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
(possan), Robert Manzke (CTAG). External contributors PR against `staging` on
the public repo; maintainers work on the private `ctag-tbd-dev` repo.
Generally-useful engine improvements may also be offered upstream to
[ctag-fh-kiel/ctag-tbd](https://github.com/ctag-fh-kiel/ctag-tbd).

The [RP2350 App Template](https://github.com/dadamachines/dada-tbd-app-template)
is separate — your sideloaded-app code is yours under your own licence.
