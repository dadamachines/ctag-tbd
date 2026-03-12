# API v1 → v2 Migration Guide

> **Status:** Complete — firmware and WebUI fully migrated.  
> **Date:** June 2025

This document describes all changes made during the migration from `api/v1` to `api/v2`
for the CTAG TBD HTTP REST API (ESP32-P4 firmware) and the accompanying WebUI JavaScript
code.

---

## Table of Contents

1. [Why v2?](#1-why-v2)
2. [Architecture Overview](#2-architecture-overview)
3. [Endpoint Mapping (v1 → v2)](#3-endpoint-mapping-v1--v2)
4. [Semantic Changes](#4-semantic-changes)
5. [New Endpoints in v2](#5-new-endpoints-in-v2)
6. [Files Created or Modified](#6-files-created-or-modified)
7. [WebUI JavaScript Changes](#7-webui-javascript-changes)
8. [Dev Server Changes](#8-dev-server-changes)
9. [Bug Fixes During Migration](#9-bug-fixes-during-migration)
10. [Quick Reference](#10-quick-reference)

---

## 1. Why v2?

The v1 API suffered from several architectural problems:

| Problem | Detail |
|---------|--------|
| **Handler exhaustion** | 17 handlers registered out of the 20-slot ESP-IDF limit. Adding macro or sample actions required new endpoints, risking the cap. |
| **Method misuse** | All mutations (set plugin, save preset, reboot, etc.) used `GET` with side effects. Only `setConfiguration`, `setPresetData`, and `favorite` used `POST`. |
| **Channel encoding** | The active channel was embedded in the URI path via a trailing character (e.g., `/api/v1/getActivePlugin0`), parsed with `req->uri[urilen - 1]`. Fragile and non-standard. |
| **Monolithic code** | All handlers lived inside `RestServer.cpp` — a single 500+ line file mixing static serving, plugin logic, and device control. |
| **Param mutations** | `setPluginParam` had three implicit modes encoded in the URL pattern: `current`, `CV`, and `TRIG`, dispatched by checking `strstr(req->uri, "TRIG")` / `strstr(req->uri, "CV")`. |

The v2 API solves all of these:

- **9 handlers** (of 20) — 4 domains × GET/POST + 1 static catch-all
- **Correct HTTP methods** — reads are GET, mutations are POST
- **Query-string dispatch** — `?action=setParam&ch=0&key=current&val=42`
- **Dedicated source files** — `PluginAPI.cpp`, `DeviceAPI.cpp`, `SampleAPI.cpp`, `MacroAPI.cpp`
- **Unified parameter setting** — one `setParam` action with `key` and `val` parameters

---

## 2. Architecture Overview

### v1 Architecture (17 handlers)

```
/api/v1/getPlugins          GET   → plugin list
/api/v1/getActivePlugin*    GET   → active plugin (channel from URI tail)
/api/v1/getPluginParams*    GET   → plugin parameters
/api/v1/setActivePlugin*    GET   → set active plugin (mutation via GET!)
/api/v1/setPluginParam*     GET   → set parameter (current/CV/TRIG from URL)
/api/v1/getPresets*         GET   → preset names
/api/v1/getPresetData*      GET   → preset JSON blob
/api/v1/savePreset*         GET   → save preset (mutation via GET!)
/api/v1/loadPreset*         GET   → load preset (mutation via GET!)
/api/v1/getConfiguration    GET   → device config
/api/v1/reboot              GET   → reboot device (mutation via GET!)
/api/v1/getIOCaps           GET   → IO capabilities
/api/v1/setConfiguration    POST  → update config
/api/v1/setPresetData*      POST  → write preset JSON
/api/v1/favorite*           POST  → store/recall favorites
/api/v1/samples*            GET   → sample file listing
/api/v1/samples*            POST  → sample upload/manage
/*                          GET   → static files
```

### v2 Architecture (9 handlers)

```
/api/v2/plugins    GET   → PluginAPI::plugins_get_handler   (6 actions)
/api/v2/plugins    POST  → PluginAPI::plugins_post_handler  (5 actions)
/api/v2/device     GET   → DeviceAPI::device_get_handler    (4 actions)
/api/v2/device     POST  → DeviceAPI::device_post_handler   (4 actions)
/api/v2/samples*   GET   → SampleAPI::samples_get_handler   (file listing + queries)
/api/v2/samples*   POST  → SampleAPI::samples_post_handler  (4 actions)
/api/v2/macros     GET   → MacroAPI::macroapi_get_handler   (2 actions)
/api/v2/macros     POST  → MacroAPI::macroapi_post_handler  (3 actions)
/*                 GET   → rest_common_get_handler           (static files)
```

---

## 3. Endpoint Mapping (v1 → v2)

### Plugin endpoints

| v1 Endpoint | Method | v2 Equivalent | Method | Notes |
|-------------|--------|---------------|--------|-------|
| `GET /api/v1/getPlugins` | GET | `GET /api/v2/plugins?action=list` | GET | — |
| `GET /api/v1/getActivePlugin0` | GET | `GET /api/v2/plugins?action=getActive&ch=0` | GET | Channel moved to `?ch=` |
| `GET /api/v1/getActivePlugin1` | GET | `GET /api/v2/plugins?action=getActive&ch=1` | GET | Channel moved to `?ch=` |
| `GET /api/v1/getPluginParams0` | GET | `GET /api/v2/plugins?action=getParams&ch=0` | GET | Channel moved to `?ch=` |
| `GET /api/v1/getPluginParams1` | GET | `GET /api/v2/plugins?action=getParams&ch=1` | GET | Channel moved to `?ch=` |
| `GET /api/v1/setActivePlugin0?id=X` | GET | `POST /api/v2/plugins?action=setActive&ch=0&id=X` | **POST** | Mutation → POST |
| `GET /api/v1/setActivePlugin1?id=X` | GET | `POST /api/v2/plugins?action=setActive&ch=1&id=X` | **POST** | Mutation → POST |
| `GET /api/v1/setPluginParam0?id=X&current=V` | GET | `POST /api/v2/plugins?action=setParam&ch=0&id=X&key=current&val=V` | **POST** | Unified; see §4 |
| `GET /api/v1/setPluginParamCV0?id=X&cv=V` | GET | `POST /api/v2/plugins?action=setParam&ch=0&id=X&key=cv&val=V` | **POST** | Unified; see §4 |
| `GET /api/v1/setPluginParamTRIG0?id=X&trig=V` | GET | `POST /api/v2/plugins?action=setParam&ch=0&id=X&key=trig&val=V` | **POST** | Unified; see §4 |
| `GET /api/v1/getPresets0` | GET | `GET /api/v2/plugins?action=getPresets&ch=0` | GET | Channel moved to `?ch=` |
| `GET /api/v1/getPresets1` | GET | `GET /api/v2/plugins?action=getPresets&ch=1` | GET | Channel moved to `?ch=` |
| `GET /api/v1/getPresetData?id=X` | GET | `GET /api/v2/plugins?action=getPresetData&id=X` | GET | — |
| `GET /api/v1/savePreset0?name=X&number=Y` | GET | `POST /api/v2/plugins?action=savePreset&ch=0&name=X&number=Y` | **POST** | Mutation → POST |
| `GET /api/v1/loadPreset0?number=Y` | GET | `POST /api/v2/plugins?action=loadPreset&ch=0&number=Y` | **POST** | Mutation → POST |
| `POST /api/v1/setPresetData?id=X` | POST | `POST /api/v2/plugins?action=setPresetData&id=X` | POST | Body = JSON blob |

### Device endpoints

| v1 Endpoint | Method | v2 Equivalent | Method | Notes |
|-------------|--------|---------------|--------|-------|
| `GET /api/v1/getConfiguration` | GET | `GET /api/v2/device?action=getConfig` | GET | — |
| `GET /api/v1/getIOCaps` | GET | `GET /api/v2/device?action=getIOCaps` | GET | — |
| `POST /api/v1/setConfiguration` | POST | `POST /api/v2/device?action=setConfig` | POST | Body = JSON config |
| `GET /api/v1/reboot` | GET | `POST /api/v2/device?action=reboot` | **POST** | Mutation → POST |
| `POST /api/v1/favorite?action=store&id=N` | POST | `POST /api/v2/device?action=storeFavorite&id=N` | POST | Split into two actions |
| `POST /api/v1/favorite?action=recall&id=N` | POST | `POST /api/v2/device?action=recallFavorite&id=N` | POST | Split into two actions |
| `POST /api/v1/favorite?action=getAll` | POST | `GET /api/v2/device?action=getFavorites` | **GET** | Read → GET (was POST!) |

### Sample endpoints

| v1 Endpoint | Method | v2 Equivalent | Method | Notes |
|-------------|--------|---------------|--------|-------|
| `GET /api/v1/samples*` | GET | `GET /api/v2/samples*` | GET | Same: file list, `?getconfig=`, `?preview=`, `?kit=N` |
| `POST /api/v1/samples*` | POST | `POST /api/v2/samples*` | POST | Same: `?action=upload\|uploadconfig\|manage\|reload` |

### Macro endpoints (NEW in v2)

| v2 Endpoint | Method | Description |
|-------------|--------|-------------|
| `GET /api/v2/macros` | GET | Track status (default), or `?action=getall` for bulk data |
| `POST /api/v2/macros?action=update_track` | POST | Update a track's macro assignment |
| `POST /api/v2/macros?action=reload` | POST | Reload macro definitions/presets from disk |
| `POST /api/v2/macros?action=set_track_parameters` | POST | Set track parameter values |

---

## 4. Semantic Changes

### 4.1 GET mutations → POST

In v1, **all plugin mutations** used GET:

```
GET /api/v1/setActivePlugin0?id=ctagSoundProcessorGDVerb
GET /api/v1/setPluginParam0?id=decay&current=42
GET /api/v1/savePreset0?name=MyPreset&number=2
GET /api/v1/loadPreset0?number=2
GET /api/v1/reboot
```

In v2, these all use POST (proper HTTP semantics):

```
POST /api/v2/plugins?action=setActive&ch=0&id=ctagSoundProcessorGDVerb
POST /api/v2/plugins?action=setParam&ch=0&id=decay&key=current&val=42
POST /api/v2/plugins?action=savePreset&ch=0&name=MyPreset&number=2
POST /api/v2/plugins?action=loadPreset&ch=0&number=2
POST /api/v2/device?action=reboot
```

### 4.2 Favorites: POST → GET for reads

In v1, reading all favorites was a POST mutation:

```
POST /api/v1/favorite  (body: { "action": "getAll" })
```

In v2, it's a proper GET:

```
GET /api/v2/device?action=getFavorites
```

### 4.3 Unified setParam

In v1, setting parameter values required three different URL patterns — the parameter type
(current value, CV mapping, trigger mapping) was embedded in the URL path:

```
GET /api/v1/setPluginParam0?id=decay&current=42       ← current value
GET /api/v1/setPluginParamCV0?id=decay&cv=1           ← CV mapping
GET /api/v1/setPluginParamTRIG0?id=decay&trig=0       ← trigger mapping
```

The firmware dispatched these by checking `strstr(req->uri, "TRIG")` and `strstr(req->uri, "CV")`.

In v2, there is **one unified endpoint** with `key` and `val` parameters:

```
POST /api/v2/plugins?action=setParam&ch=0&id=decay&key=current&val=42
POST /api/v2/plugins?action=setParam&ch=0&id=decay&key=cv&val=1
POST /api/v2/plugins?action=setParam&ch=0&id=decay&key=trig&val=0
```

### 4.4 Channel encoding

**v1:** Channel number embedded as trailing character in URL path: `/api/v1/getActivePlugin0`  
Parsed via: `char ch = req->uri[urilen - qlen - 1]`

**v2:** Channel passed as query parameter: `?ch=0` or `?ch=1`  
Parsed via: `httpd_query_key_value(query, "ch", ch, sizeof(ch))`

---

## 5. New Endpoints in v2

### 5.1 Bulk fetch endpoints (`getAll`)

Two new bulk endpoints eliminate the "waterfall" of sequential API calls during page load:

**Plugin getAll** — `GET /api/v2/plugins?action=getAll`

Returns everything the plugin UI needs in a single chunked HTTP response:

```json
{
  "plugins": ["ctagSoundProcessorGDVerb", ...],
  "active":  { "0": "ctagSoundProcessorGDVerb", "1": "ctagSoundProcessorVoid" },
  "params":  { "0": { ... }, "1": { ... } },
  "presets": { "0": [...], "1": [...] }
}
```

Replaces 5+ sequential calls: `getPlugins` + `getActivePlugin0` + `getActivePlugin1` + `getPluginParams0` + `getPluginParams1` + `getPresets0` + `getPresets1`.

**Device getAll** — `GET /api/v2/device?action=getAll`

```json
{
  "config":    { ... },
  "ioCaps":    { ... },
  "favorites": [...]
}
```

Replaces: `getConfiguration` + `getIOCaps` + `favorite?action=getAll`.

### 5.2 Macro API (entirely new domain)

The macro system is new in v2 — it manages macro definitions, sound presets, and track
assignments for the Performer/Designer workflow:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/v2/macros` | GET | Returns current track data |
| `GET /api/v2/macros?action=getall` | GET | Bulk: `{ macroDefs, soundPresets, tracks }` |
| `POST /api/v2/macros?action=update_track` | POST | Update track macro assignment (JSON body) |
| `POST /api/v2/macros?action=reload` | POST | Reload macro defs/presets from SD card |
| `POST /api/v2/macros?action=set_track_parameters` | POST | Set track parameter values |

---

## 6. Files Created or Modified

### Firmware (C++ — `main/`)

| File | Status | Purpose |
|------|--------|---------|
| `RestServer.cpp` | **Rewritten** | Now contains only server config + static file serving + 9 URI handler registrations. All domain logic removed. |
| `RestServer.hpp` | **Simplified** | Only `StartRestServer()` — all individual handler declarations removed. |
| `PluginAPI.cpp` | **Created** | 343 lines — 2 handlers dispatching 11 actions (6 GET + 5 POST). |
| `PluginAPI.hpp` | **Created** | `plugins_get_handler` + `plugins_post_handler` static methods. |
| `DeviceAPI.cpp` | **Created** | 221 lines — 2 handlers dispatching 7 actions (4 GET + 3 POST + reboot). |
| `DeviceAPI.hpp` | **Created** | `device_get_handler` + `device_post_handler` static methods. |
| `SampleAPI.cpp` | Unchanged | Already used action-based dispatch. URL prefix updated `v1` → `v2`. |
| `SampleAPI.hpp` | Unchanged | — |
| `MacroAPI.cpp` | **Created** | 213 lines — macro definition/preset/track management. |
| `MacroAPI.hpp` | **Created** | `macroapi_get_handler` + `macroapi_post_handler` static methods. |
| `CMakeLists.txt` | Unchanged | Uses `file(GLOB)` — new `.cpp` files auto-discovered. |

### WebUI JavaScript (`sdcard_image/www/js/`)

| File | Status | Key Changes |
|------|--------|-------------|
| `shared.js` | **Modified** | `API_V1` → `API_V2 = '/api/v2'`; `apiFetch()`/`apiPostJSON()` prepend `API_V2`; health check → `getIOCaps`; `loadSharedData()` and `reloadMacroData()` updated. |
| `plugin-manager.js` | **Modified** | 22 call sites updated; mutations changed from `queuedFetch` (GET) to `queuedPost` (POST); channel from URL suffix to `?ch=N`; `setParam` uses `key`/`val`. |
| `app.js` | **Modified** | Config/backup/restore/reboot/favorites calls updated to v2 endpoints. Debug wrapper fixed to strip `/api/v2`. |
| `performer.js` | **Modified** | Track/parameter updates use `apiPostJSON()` with relative paths (no prefix). Raw `fetch()` calls use full `/api/v2/...` URLs. |
| `designer.js` | **Modified** | Local `apiPost()`/`apiGet()` wrappers use raw `fetch()` with full `/api/v2/samples` URLs. |
| `sample-manager.js` | **Modified** | `API_BASE` changed from `/api/v1/samples` to `/api/v2/samples`. |
| `preset-macro-app.js` | Unchanged | Shell/navigation only — no API calls. |

### WebUI Build

| File | Status | Purpose |
|------|--------|---------|
| `build-webui.sh` | Unchanged | Concatenates JS source → bundles + gzip. |
| `app-bundle.js` | **Rebuilt** | Includes updated shared.js, plugin-manager.js, sample-manager.js, app.js. |
| `macro-bundle.js` | **Rebuilt** | Includes updated shared.js, performer.js, designer.js. |

### Dev Server (`sdcard_image/www/tools/`)

| File | Status | Key Changes |
|------|--------|-------------|
| `dev-server.js` | **Rewritten** | v2 `?action=` dispatch; separate `handleFavoriteGet()`/`handleFavoritePost()`; `handleSetPluginParam()` uses `key`/`val`; macro API mock handlers. |

---

## 7. WebUI JavaScript Changes

### 7.1 API base constant

```javascript
// Before (shared.js)
const API_V1 = '/api/v1';
export { API_V1 };

// After (shared.js)
const API_V2 = '/api/v2';
export { API_V2 };
```

### 7.2 Shared helper functions

`apiFetch(path)` and `apiPostJSON(path, body)` prepend `API_V2` automatically:

```javascript
// shared.js — callers pass relative paths
async function apiFetch(path) {
    const url = API_V2 + path;
    // ...
}

async function apiPostJSON(path, body, timeoutMs, skipCircuitBreaker) {
    const url = API_V2 + path;
    // body === null → POST with no body (for mutations like reboot)
    // ...
}
```

**Important:** When using `apiFetch()` or `apiPostJSON()`, pass paths **without** the
`/api/v2` prefix. E.g., `apiFetch('/plugins?action=list')`, not
`apiFetch('/api/v2/plugins?action=list')`.

When using raw `fetch()` (e.g., in designer.js local wrappers or raw upload calls in
performer.js), use the full URL including `/api/v2/...`.

### 7.3 Plugin parameter setting

```javascript
// Before (plugin-manager.js)
queuedFetch(`/setPluginParam${ch}?id=${id}&current=${val}`)
queuedFetch(`/setPluginParamCV${ch}?id=${id}&cv=${val}`)
queuedFetch(`/setPluginParamTRIG${ch}?id=${id}&trig=${val}`)

// After (plugin-manager.js)
queuedPost(`/plugins?action=setParam&ch=${ch}&id=${id}&key=current&val=${val}`, null)
queuedPost(`/plugins?action=setParam&ch=${ch}&id=${id}&key=cv&val=${val}`, null)
queuedPost(`/plugins?action=setParam&ch=${ch}&id=${id}&key=trig&val=${val}`, null)
```

### 7.4 Favorites migration

```javascript
// Before — getAll was a POST (wrong!)
queuedFetch('/favorite', { method: 'POST', body: JSON.stringify({ action: 'getAll' }) })

// After — proper GET
queuedFetch('/device?action=getFavorites')

// Before — store was combined
queuedPost('/favorite', { action: 'store', id: N, ... })

// After — dedicated action
queuedPost('/device?action=storeFavorite&id=' + N, body)
```

### 7.5 Queue function naming

```javascript
// Before
queuedFetch(path)  // Used for both GET and POST-like mutations

// After
queuedFetch(path)  // GET only (reads)
queuedPost(path, body, timeoutMs, skipCircuitBreaker)  // POST (mutations)
```

`queuedPost` signature: `(path, body, timeoutMs, skipCircuitBreaker)`
- `body = null` → sends POST with empty body (e.g., reboot, loadPreset)
- `skipCircuitBreaker = true` → bypass the offline circuit breaker (used for heavy plugin switches)

---

## 8. Dev Server Changes

The mock development server (`sdcard_image/www/tools/dev-server.js`) was rewritten to
match the v2 action-based dispatch pattern:

- **Router:** Now parses `?action=` from query strings instead of matching path segments
- **Favorites:** Split `handleFavorite()` into `handleFavoriteGet()` and `handleFavoritePost()` 
- **setParam:** Uses `key` and `val` query params (was separate `current`/`cv`/`trig` fields)
- **Macro API:** Added mock `handleMacroApiGet()` supporting `getall` action
- **Channel parsing:** Uses `?ch=N` query parameter (removed `extractChannel()` from URL path)

---

## 9. Bug Fixes During Migration

### 9.1 Double URL prefix in performer.js (Critical)

**Problem:** Three call sites in `performer.js` passed full `/api/v2/...` URLs to
`S.apiPostJSON()`, which already prepends `API_V2`. This produced broken double-prefix
URLs: `/api/v2/api/v2/macros?action=update_track`.

**Affected locations:**  
- `sendTrackUpdate()` (line ~407)
- `sendParameterUpdate()` (line ~422)
- Delete preset handler (line ~812)

**Fix:** Changed to relative paths:
```javascript
// Before (broken)
S.apiPostJSON('/api/v2/macros?action=update_track', body)
S.apiPostJSON('/api/v2/samples?action=manage', ...)

// After (correct)
S.apiPostJSON('/macros?action=update_track', body)
S.apiPostJSON('/samples?action=manage', ...)
```

### 9.2 Debug wrapper stripping wrong prefix (app.js)

**Problem:** The debug API wrapper in `app.js` (line ~620) stripped `/api/v1` for display
logging, but the code had been migrated to v2 URLs.

**Fix:** Updated regex from `/api\/v1/` to `/api\/v2/`.

---

## 10. Quick Reference

### Complete v2 Action Inventory

#### GET /api/v2/plugins
| Action | Parameters | Returns |
|--------|------------|---------|
| `list` | — | `["id1", "id2", ...]` |
| `getActive` | `ch=0\|1` | `{"id": "..."}` |
| `getParams` | `ch=0\|1` | `{...params...}` |
| `getPresets` | `ch=0\|1` | `[...preset names...]` |
| `getPresetData` | `id=processorName` | `{...all presets...}` |
| `getAll` | — | `{plugins, active, params, presets}` (chunked) |

#### POST /api/v2/plugins
| Action | Parameters | Body | Returns |
|--------|------------|------|---------|
| `setActive` | `ch`, `id` | — | `{"ok":true}` |
| `setParam` | `ch`, `id`, `key`, `val` | — | empty 200 |
| `savePreset` | `ch`, `name`, `number` | — | `{"ok":true}` |
| `loadPreset` | `ch`, `number` | — | `{"ok":true}` |
| `setPresetData` | `id` | JSON preset blob | `{"id":"..."}` |

#### GET /api/v2/device
| Action | Parameters | Returns |
|--------|------------|---------|
| `getConfig` | — | `{...config...}` |
| `getIOCaps` | — | `{...capabilities...}` |
| `getFavorites` | — | `[...favorites...]` |
| `getAll` | — | `{config, ioCaps, favorites}` (chunked) |

#### POST /api/v2/device
| Action | Parameters | Body | Returns |
|--------|------------|------|---------|
| `setConfig` | — | JSON config | `{"ok":true}` |
| `reboot` | — | — | `{"ok":true}` then restarts |
| `storeFavorite` | `id` | JSON favorite data | `{"ok":true}` |
| `recallFavorite` | `id` | — | `{"ok":true}` |

#### GET /api/v2/samples*
| Query | Returns |
|-------|---------|
| (none) | Directory listing JSON |
| `?getconfig=path` | Sample configuration JSON |
| `?preview=path` | Audio preview data |
| `?kit=N` | Kit data |

#### POST /api/v2/samples*
| Action (query) | Body | Returns |
|----------------|------|---------|
| `upload` | multipart file | `{"ok":true}` |
| `uploadconfig` (`&path=...`) | JSON config | `{"ok":true}` |
| `manage` | JSON `{action, ...}` | `{"ok":true}` |
| `reload` | — | `{"ok":true}` |

#### GET /api/v2/macros
| Action | Returns |
|--------|---------|
| (none) | Track status |
| `getall` | `{macroDefs, soundPresets, tracks}` |

#### POST /api/v2/macros
| Action | Body | Returns |
|--------|------|---------|
| `update_track` | JSON track data | `{"ok":true}` |
| `reload` | — | `{"ok":true}` |
| `set_track_parameters` | JSON parameters | `{"ok":true}` |

### Handler count comparison

| | v1 | v2 |
|---|---|---|
| Plugin handlers | 11 (GET only) | 2 (GET + POST) |
| Device handlers | 4 (3 GET + 1 POST) | 2 (GET + POST) |
| Favorites handlers | 1 (POST) | (merged into device) |
| Sample handlers | 2 (GET + POST) | 2 (GET + POST) |
| Macro handlers | 0 (didn't exist) | 2 (GET + POST) |
| Static handler | 1 (GET) | 1 (GET) |
| **Total** | **19** | **9** |

Free handler slots: v1 = 1, **v2 = 11**

---

*End of migration guide.*
