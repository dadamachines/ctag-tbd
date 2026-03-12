# WebUI ↔ Firmware API Audit Report

> Date: 2025-03-01 | Branch: `feature/webui-general-ui-rework`

## 1. Executive Summary

A comprehensive audit compared every API call in the **new WebUI** against the
**old Onsen UI** and the **firmware RestServer** (`main/RestServer.cpp`). Several
critical bugs were found and fixed — all in the same class: the new UI sent
JSON keys the firmware ignores, while the firmware's `SetConfigurationFromJSON()`
does a **full replace** of the configuration object (no merge).

### Bugs Found & Fixed

| # | Bug | Severity | Impact | Fix |
|---|-----|----------|--------|-----|
| 1 | `saveConfiguration()` sent `currentConfig \|\| {}` when config was null | **Critical** | Wiped all firmware keys → `rapidjson` assert → crash loop | Null guard on all 3 save handlers |
| 2 | WiFi tab read/wrote flat keys (`wifiSsid`, `wifiMode`, `wifiPassword`) | **Critical** | WiFi settings never actually changed on firmware | Read/write firmware's nested `config.wifi.{ssid,pwd,mode,mdns_name}` |
| 3 | Audio tab used non-existent keys (`inputGain`, `outputGain`, `softClip`) | **High** | Audio level/soft-clip changes had zero effect | Use firmware keys `ch0_codecLvlOut` (string, 0-63), `ch0_outputSoftClip` ("on"/"off") |
| 4 | `saveConfiguration()` wrote stale flat WiFi keys back to firmware | **Medium** | Wasted config space, could confuse future reads | Removed flat WiFi writes from main save handler |
| 5 | Dev-server mock returned wrong config shape | **Medium** | Dev testing didn't catch any of bugs 2-4 | Mock now returns firmware-matching shape with nested `wifi`, firmware keys |
| 6 | `dark.css` + `dark.css.gz` git-ignored → collaborators can't deploy | **Medium** | Build script skips gzip, SD card missing theme | `.gitignore` negation pattern tracks only those 2 files |

### Feature Gaps (Not Bugs — Documented for Future Work)

| Feature | Old UI | New UI | Notes |
|---------|--------|--------|-------|
| CV/TRIG routing | `setPluginParamCV` / `setPluginParamTRIG` with dropdown selects | Missing | Data in API response (`cv`, `trig` fields) but UI ignores them |
| Backup/Restore | Full ZIP download/upload of all presets, config, favorites | Stub buttons only | Complex feature — needs file packaging |
| Favorite import/export | `.jsn` file download/upload | Missing | Moderate effort |
| `getPresetData`/`setPresetData` | Used for preset naming | Not called | New UI uses `getPluginParams` which includes presets |

## 2. Firmware Configuration Architecture

### The Cardinal Rule

```
SetConfigurationFromJSON() does a FULL REPLACE.
Whatever JSON you POST becomes the ENTIRE configuration.
There is NO merge. Missing keys → firmware crash on next access.
```

### Firmware Config Shape (actual response from device)

```json
{
  "wifi": {
    "ssid": "ctag-tbd",
    "pwd": "",
    "mode": "usbncm",
    "mdns_name": "ctag-tbd",
    "ip": "192.168.4.1"
  },
  "ch01_daisy": "off",
  "ch0_toStereo": "off",
  "ch1_toStereo": "off",
  "ch0_outputSoftClip": "on",
  "ch1_outputSoftClip": "on",
  "ch0_codecLvlOut": "58",
  "ch1_codecLvlOut": "58",
  "apiEndpoint": "",
  "midiEnabled": false,
  "midiChannel": 1,
  "compactLayout": false,
  "wifiSsid": "",
  "wifiMdns": "",
  "wifiMode": "ap"
}
```

**Key facts:**
- `wifi` is a nested object — firmware reads `m["configuration"]["wifi"]["ssid"]`
- `ch0_codecLvlOut` is a **string** ("0" to "63"), not a number
- `ch0_outputSoftClip` is a **string** ("on" / "off"), not a boolean
- `wifiSsid`, `wifiMdns`, `wifiMode` are flat WebUI-only keys — firmware ignores them
- The old Onsen UI stashed the entire config, mutated single keys, and sent everything back

### Critical Firmware Code Paths

- `SPManagerDataModel::SetConfigurationFromJSON()` (line 204): `m["configuration"] = obj.Move()`
- `SPManagerDataModel::GetConfigurationData()` (line 218): `m["configuration"][id]` — **asserts if key missing**
- `SPManagerDataModel::GetNetworkConfigurationData()` (line 224): `m["configuration"]["wifi"][which]`

## 3. RestServer Endpoints (Complete Catalog)

| Endpoint | Method | Handler | Used by New UI | Notes |
|----------|--------|---------|---------------|-------|
| `/` | GET | Static file serving | ✅ | Serves `.gz` files |
| `/api/v1/getPlugins` | GET | Returns plugin list | ✅ | |
| `/api/v1/getActivePlugin/{ch}` | GET | Active plugin + params | ✅ | |
| `/api/v1/setActivePlugin/{ch}` | GET | Switch plugin | ✅ | `?id=...` |
| `/api/v1/getPluginParams/{ch}` | GET | All params for plugin | ✅ | Includes `cv`/`trig` fields |
| `/api/v1/setPluginParam/{ch}` | GET | Set param value | ✅ | Only `current` — not `cv`/`trig` |
| `/api/v1/setPluginParamCV/{ch}` | GET | Set CV routing | ❌ | Data in response but UI skips |
| `/api/v1/setPluginParamTRIG/{ch}` | GET | Set trigger routing | ❌ | Data in response but UI skips |
| `/api/v1/getPresets/{ch}` | GET | Preset list | ✅ | |
| `/api/v1/setActivePreset/{ch}` | GET | Load preset | ✅ | |
| `/api/v1/savePreset/{ch}` | GET | Save current to preset | ✅ | |
| `/api/v1/getConfiguration` | GET | Full config JSON | ✅ | |
| `/api/v1/setConfiguration` | POST | Full replace config | ✅ | **FULL REPLACE** |
| `/api/v1/getIOCaps` | GET | CV/Trig input names | ✅ | Used for debug panel |
| `/api/v1/favorites/*` | GET/POST | CRUD favorites | ✅ | |
| `/api/v1/sample/*` | GET/POST | Sample management | ✅ | |
| `/api/v1/reboot` | GET | Restart device | ✅ | |
| `/api/v1/getPresetData/{ch}` | GET | Raw preset JSON | ❌ | Old UI used for naming |
| `/api/v1/setPresetData/{ch}` | POST | Write raw preset | ❌ | Old UI used for naming |

## 4. Files Modified

### `sdcard_image/www/js/app.js`
- `populateConfigDialog()`: WiFi tab reads from `config.wifi.ssid` (nested), Audio tab reads `config.ch0_codecLvlOut`
- WiFi save handler: writes to `config.wifi.{mode,ssid,pwd,mdns_name}`, password validation (≥8 or empty)
- Audio save handler: writes `ch0_codecLvlOut`/`ch1_codecLvlOut` as strings, `ch0_outputSoftClip`/`ch1_outputSoftClip` as "on"/"off"
- `saveConfiguration()`: removed stale flat WiFi key writes
- Gain slider handlers: renamed `inputGain`→`ch0Level`, `outputGain`→`ch1Level`, display `X / 63`

### `tools/dev-server.js`
- `handleGetConfiguration()`: returns firmware-matching shape with nested `wifi`, all firmware keys
- `handleSetConfiguration()`: does full replace (mirrors firmware behavior)
- Added `storedConfiguration` state variable

### `.gitignore`
- Changed from `sdcard_image/www/shoelace/` (blanket ignore) to selective pattern that tracks only `dark.css` + `dark.css.gz`

### `sdcard_image/www/.version` + `build/tbd-sd-card-hash.txt`
- Updated to `7e22b6589508c4be32741bd9e968943d` (new bundle hash)

## 5. Testing Checklist

### Verified on Hardware
- [x] Device boots without crash (no `rapidjson` assert)
- [x] Root endpoint returns HTTP 200
- [x] `/api/v1/getPlugins` returns HTTP 200
- [x] `/api/v1/getConfiguration` returns all firmware keys intact
- [x] SD card config has correct `activeProcessors` (not PicoSeqRack)
- [x] SD card `.version` matches `tbd-sd-card-hash.txt`

### Should Test Manually (Next Session)
- [ ] Open WebUI in browser → config dialog → WiFi tab shows correct values
- [ ] Change WiFi SSID in config → save → verify `getConfiguration` returns new value under `wifi.ssid`
- [ ] Change audio level slider → save → verify `ch0_codecLvlOut` changes
- [ ] Toggle soft clip → save → verify `ch0_outputSoftClip` toggles "on"/"off"
- [ ] Switch plugins on both channels
- [ ] Load/save presets
- [ ] Use favorites
- [ ] Upload samples

## 6. Recommendations

1. **Add integration tests**: A script that POSTs config via the API and reads it back to verify key preservation. This is the highest-value test given the full-replace semantics.
2. **CV/TRIG routing UI**: This is the biggest functional gap. The firmware fully supports it. The API data is already in the response. Needs dropdown selects in the param rows.
3. **Config merge in firmware**: Consider changing `SetConfigurationFromJSON()` to merge instead of replace. This would eliminate an entire class of bugs. However, this is a firmware change and needs careful testing.
4. **Backup/Restore**: Port from old config.html — it's a valuable feature for users.
