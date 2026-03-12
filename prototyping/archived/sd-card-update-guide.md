# SD Card Update Guide — USB Mass Storage (MSC) Firmware

This guide explains how to update individual files on the TBD-16's SD card
using the USB Mass Storage (MSC) firmware, without triggering a full
destructive re-extraction.

## Background

The TBD-16 uses a dual OTA partition scheme:

| Partition | Contents                         |
|-----------|----------------------------------|
| `ota_0`   | Main ctag-tbd firmware           |
| `ota_1`   | USB MSC firmware (`tusb_msc.bin`)|

When `tusb_msc.bin` runs, the ESP32 exposes the SD card as a standard USB
mass-storage device, letting you mount it on your computer and copy files
directly.

### Important: SD Card Auto-Update Mechanism

On every boot, the main firmware compares two files on the SD card:

- `/sdcard/.version` — hash written after last successful extraction
- `/sdcard/tbd-sd-card-hash.txt` — hash of the current `tbd-sd-card.zip`

If these differ, the firmware **deletes** `/sdcard/www/`, `/sdcard/data/`,
and `/sdcard/tbdsamples/`, then re-extracts everything from
`tbd-sd-card.zip`.

> **Never modify `.version` or `tbd-sd-card-hash.txt`** when doing manual
> file updates. As long as both files contain the same hash string, the
> auto-update is skipped and your manual changes are preserved.

---

## Prerequisites

| Item | Details |
|------|---------|
| **ESP-IDF** | v5.5+ with `otatool.py` available on PATH |
| **USB connection** | USB-C cable to the TBD-16 JTAG/serial port |
| **MSC firmware** | `tusb_msc.bin` — already written to `ota_1` (one-time setup) |
| **Serial port** | Typically `/dev/cu.usbmodem1101` on macOS |

If `tusb_msc.bin` has not been flashed to `ota_1` yet, see
[One-Time Setup](#one-time-setup-flash-tusb_mscbin-to-ota_1) below.

---

## Step-by-Step: Update Files on SD Card

### 1. Switch to USB MSC firmware

```bash
otatool.py --port /dev/cu.usbmodem1101 switch_ota_partition --name ota_1
```

The device reboots into USB mass-storage mode. Wait ~10 seconds for the
SD card volume to appear.

### 2. Verify the SD card mounted

On macOS the volume typically mounts as `/Volumes/NO NAME`:

```bash
ls "/Volumes/NO NAME/www/"
```

You should see the web UI files (`index.html.gz`, `samples.html.gz`, `js/`,
`css/`, etc.).

### 3. Copy your updated files

All web assets served by the ESP32 HTTP server are stored as **gzipped**
files (`.gz` extension). The server transparently decompresses them via the
`Content-Encoding: gzip` header.

To update a file, gzip it first, then copy:

```bash
# Example: update samples.html
gzip -c sdcard_image/www/samples.html > /tmp/samples.html.gz
cp /tmp/samples.html.gz "/Volumes/NO NAME/www/samples.html.gz"

# Example: add a new JS file
gzip -c sdcard_image/www/js/shoelace-bundle.js > /tmp/shoelace-bundle.js.gz
cp /tmp/shoelace-bundle.js.gz "/Volumes/NO NAME/www/js/shoelace-bundle.js.gz"
```

> **Tip:** You can also add new directories or delete obsolete files while
> the SD card is mounted. Just don't touch `.version` or
> `tbd-sd-card-hash.txt` in the root.

### 4. Safely eject the SD card

```bash
sync
diskutil unmount "/Volumes/NO NAME"
```

If `diskutil unmount` reports the volume is already unmounted, verify with:

```bash
diskutil list | grep "NO NAME"
```

### 5. Switch back to the main firmware

```bash
otatool.py --port /dev/cu.usbmodem1101 switch_ota_partition --name ota_0
```

The device reboots into the main ctag-tbd firmware. Wait ~10 seconds for
the WiFi AP to come up.

### 6. Verify your changes

1. Connect to the `ctag-tbd` WiFi network
2. Open `http://192.168.4.1/` (or the specific page you updated)
3. Hard-refresh (`Cmd+Shift+R`) to bypass browser cache

---

## One-Time Setup: Flash `tusb_msc.bin` to ota_1

This only needs to be done once. After this, `ota_1` permanently contains
the MSC firmware.

```bash
otatool.py --port /dev/cu.usbmodem1101 \
    write_ota_partition --name ota_1 \
    --input /path/to/tusb_msc.bin
```

Replace `/path/to/tusb_msc.bin` with the actual path to the MSC firmware
binary for your board revision (e.g., `dada-tbd-fw/p4-fw/rev_c/tusb_msc.bin`).

---

## Quick Reference

```text
# Mount SD card
otatool.py --port /dev/cu.usbmodem1101 switch_ota_partition --name ota_1
sleep 10

# Copy files (always gzip first!)
gzip -c <source_file> > /tmp/<file>.gz
cp /tmp/<file>.gz "/Volumes/NO NAME/www/<path>/<file>.gz"

# Eject + switch back
sync && diskutil unmount "/Volumes/NO NAME"
otatool.py --port /dev/cu.usbmodem1101 switch_ota_partition --name ota_0
```

---

## Troubleshooting

### Volume doesn't mount after switching to ota_1

- Wait at least 15 seconds — USB enumeration can be slow
- Check `diskutil list` for a FAT32 partition
- Try a different USB cable or port
- Verify `tusb_msc.bin` was actually written to ota_1

### Changes disappear after reboot

The auto-update mechanism kicked in and re-extracted from
`tbd-sd-card.zip`. This means `.version` and `tbd-sd-card-hash.txt`
had different contents. Ensure they match:

```bash
# Check on mounted SD card
cat "/Volumes/NO NAME/.version"
cat "/Volumes/NO NAME/tbd-sd-card-hash.txt"
```

Both should show the same hash string. If they differ, copy one over the
other (prefer keeping `tbd-sd-card-hash.txt` unchanged and updating
`.version` to match).

### `otatool.py` can't find the port

- List available ports: `ls /dev/cu.usb*`
- The port name may change between MSC mode and normal mode
- On Linux, the port is typically `/dev/ttyACM0` or `/dev/ttyUSB0`

### File served with wrong content type

The ESP32 HTTP server determines content type from the file extension
*before* the `.gz` suffix. Make sure gzipped files keep the original
extension: `samples.html` → `samples.html.gz` (not `samples.gz`).
