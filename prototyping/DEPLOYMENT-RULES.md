# TBD-16 Deployment Rules — AI Agent Instructions

> Source of truth: §17 of `WEBUI-STATUS-AND-ROADMAP.md` and `sd-card-update-guide.md`.
> This file is a compact reference derived from those proven procedures.

## Full Deployment (Firmware + WebUI)

```bash
# 1. Build firmware
cd /Users/jlo/Documents/GitHub/ctag-tbd_hacking
. ~/esp/esp-idf/export.sh
idf.py build

# 2. Build WebUI
cd sdcard_image/www && bash build-webui.sh && cd ../..

# 3. Flash firmware (ALL 4 images — NEVER use idf.py flash)
cd build
esptool.py --chip esp32p4 -p /dev/cu.usbmodem11301 -b 460800 \
  --before=default_reset --after=hard_reset \
  write_flash --flash_mode dio --flash_freq 80m --flash_size 16MB \
  0x2000 bootloader/bootloader.bin \
  0x10000 ctag-tbd.bin \
  0x8000 partition_table/partition-table.bin \
  0xd000 ota_data_initial.bin
cd ..

# 4. Wait for boot (~10s), then switch to MSC mode
sleep 10
otatool.py --port /dev/cu.usbmodem11301 switch_ota_partition --name ota_1
# Wait ~10s for /Volumes/NO NAME

# 5. Copy WebUI files to SD card
cp sdcard_image/www/index.html.gz "/Volumes/NO NAME/www/index.html.gz"
cp sdcard_image/www/js/app-bundle.js.gz "/Volumes/NO NAME/www/js/app-bundle.js.gz"
cp sdcard_image/www/js/shoelace-bundle.js.gz "/Volumes/NO NAME/www/js/shoelace-bundle.js.gz"
cp sdcard_image/www/shoelace/themes/dark.css.gz "/Volumes/NO NAME/www/shoelace/themes/dark.css.gz"

# 6. Update hash files (BOTH must match)
cp build/tbd-sd-card-hash.txt "/Volumes/NO NAME/tbd-sd-card-hash.txt"
cp build/tbd-sd-card-hash.txt "/Volumes/NO NAME/.version"

# 7. Eject and switch back to main firmware
diskutil eject "/Volumes/NO NAME"
sleep 3
otatool.py --port /dev/cu.usbmodem11301 switch_ota_partition --name ota_0

# 8. Verify (~10s after switch)
# ifconfig | grep "inet 192.168.4"  → 192.168.4.2
# curl http://192.168.4.1/          → 200
```

## WebUI-Only Update (no firmware change)

```bash
cd sdcard_image/www && bash build-webui.sh && cd ../..
otatool.py --port /dev/cu.usbmodem11301 switch_ota_partition --name ota_1
# wait for /Volumes/NO NAME
cp sdcard_image/www/js/app-bundle.js.gz "/Volumes/NO NAME/www/js/app-bundle.js.gz"
cp sdcard_image/www/index.html.gz "/Volumes/NO NAME/www/index.html.gz"
# DON'T touch .version or tbd-sd-card-hash.txt
sync && diskutil eject "/Volumes/NO NAME"
sleep 3
otatool.py --port /dev/cu.usbmodem11301 switch_ota_partition --name ota_0
```

## Fresh SD Card Deploy (Complete Erase + Reimage)

Use this workflow when the SD card content is corrupted, you want a guaranteed
clean slate, or you are setting up a brand-new SD card.

> **CRITICAL:** This uses `create_sd_archive.sh` to build the ZIP + hash from
> the *latest* source files. Never manually copy random files — always let the
> script generate the archive so the hash is consistent.

```bash
# 1. Build WebUI first (the archive script reads www/ output)
cd /Users/jlo/Documents/GitHub/ctag-tbd_hacking
cd sdcard_image/www && bash build-webui.sh && cd ../..

# 2. Find xxh128sum (required by create_sd_archive.sh)
#    brew install xxhash   ← if not already installed
XXH128=$(which xxh128sum)

# 3. Run create_sd_archive.sh to generate ZIP + hash
bash create_sd_archive.sh \
  /Users/jlo/Documents/GitHub/ctag-tbd_hacking \
  /Users/jlo/Documents/GitHub/ctag-tbd_hacking/build \
  "$XXH128"
# Outputs:  build/tbd-sd-card.zip  and  build/tbd-sd-card-hash.txt

# 4. Switch device to MSC mode (SD card access)
otatool.py --port /dev/cu.usbmodem11301 switch_ota_partition --name ota_1
# Wait ~10s for /Volumes/NO NAME to mount

# 5. ERASE all content on the SD card
rm -rf "/Volumes/NO NAME/"*
rm -rf "/Volumes/NO NAME/".* 2>/dev/null || true
sync

# 6. Extract the fresh archive onto the SD card
cd /Users/jlo/Documents/GitHub/ctag-tbd_hacking/build
unzip -o tbd-sd-card.zip -d "/Volumes/NO NAME/"

# 7. Set hash files (BOTH must match)
cp tbd-sd-card-hash.txt "/Volumes/NO NAME/tbd-sd-card-hash.txt"
cp tbd-sd-card-hash.txt "/Volumes/NO NAME/.version"

# 8. SAFETY CHECK — ensure PicoSeqRack is NOT the active plugin
#    PicoSeqRack causes Guru Meditation on boot → always set safe default
python3 -c "
import json, sys
cfg = json.load(open('/Volumes/NO NAME/data/spm-config.jsn'))
changed = False
for i, p in enumerate(cfg['activeProcessors']):
    if p == 'PicoSeqRack':
        cfg['activeProcessors'][i] = 'TBD03'
        changed = True
if changed:
    json.dump(cfg, open('/Volumes/NO NAME/data/spm-config.jsn','w'))
    print('WARNING: PicoSeqRack was active — replaced with TBD03')
else:
    print('OK: PicoSeqRack is not active')
"

# 9. Eject and switch back to main firmware
cd /Users/jlo/Documents/GitHub/ctag-tbd_hacking
sync && diskutil eject "/Volumes/NO NAME"
sleep 3
otatool.py --port /dev/cu.usbmodem11301 switch_ota_partition --name ota_0

# 10. Verify (~10-15s after switch)
sleep 15
ifconfig | grep "inet 192.168.4"    # → 192.168.4.2
curl -s http://192.168.4.1/          # → 200
```

### Post-Deploy Validation

After a fresh SD card deploy, run the automated API test suite to verify
device stability:

```bash
cd tests/apitest
bash test-device-api.sh 192.168.4.1
# Report is saved to tests/apitest/reports/
```

## NEVER Do These

- **NEVER** use `idf.py flash` — causes OTA reboot loops
- **NEVER** flash `tusb_msc.bin` with esptool to `0x10000` — overwrites main firmware
- **NEVER** leave device in ota_1 (MSC mode) — it won't run main firmware
- **NEVER** make `.version` and `tbd-sd-card-hash.txt` different — triggers destructive re-extraction
- **NEVER** forget to eject before switching partitions
- **NEVER** skip the switch back to ota_0 after copying files

## Key Facts

- Serial port: `/dev/cu.usbmodem11301`
- Device IP: `192.168.4.1`, Host IP: `192.168.4.2`  
- SD card mount: `/Volumes/NO NAME`
- ESP-IDF: `~/esp/esp-idf/export.sh`
- tusb_msc.bin: `bin/tusb_msc.bin` (already on ota_1)
- Server only serves `.gz` files — always copy gzipped assets
