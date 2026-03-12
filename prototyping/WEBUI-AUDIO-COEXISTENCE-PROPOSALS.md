# WebUI & Audio Coexistence — Three Proposals

**Date:** March 5, 2026  
**Context:** PicoSeqRack audio lock errors during WebUI use  
**Audience:** Product decision-makers, firmware developers

---

## The Problem

When the WebUI serves API responses, the HTTP handler (core 0) must hold `processMutex` to safely serialize plugin parameter JSON. During this time, the audio task (core 1) cannot acquire the mutex and **mutes audio output** instead.

**Measured impact for PicoSeqRack** (the worst case):
- One `getParams` request → **668 muted buffer cycles → ~485ms of silence**
- A full plugin manager page load fires 6-8 sequential API calls → **~2-3 seconds of intermittent dropouts**
- A full page refresh (`getAll`) → single ~600ms dropout

**For context — PicoSeqRack is an extreme outlier:**

| Plugin | JSON param size | Estimated hold time |
|--------|----------------|---------------------|
| **PicoSeqRack** | **93 KB** | **~485ms** |
| DrumRack | 32 KB | ~170ms |
| VctrSnt | 15 KB | ~80ms |
| TBD03 | 3.4 KB | ~18ms |
| GDVerb | 1.6 KB | ~8ms |
| Void | 0.2 KB | <1ms |

For 50 of the 57 plugins, the dropout would be **under 50ms — inaudible** as a single click. The problem is essentially a PicoSeqRack-specific issue caused by 16 tracks × many parameters = 93KB of JSON.

**Audio task timing:**
- Buffer size: 32 samples at 44.1kHz = **0.73ms per cycle** (1,378 cycles/sec)
- 668 lost cycles = 485ms — this is **audible silence**, not a subtle glitch

---

## Customer Journey Analysis

The TBD-16 has two primary usage modes:

### Performance Mode (the RP2350 OLED UI)
The musician plays live — tweaking knobs, triggering patterns via the hardware interface. The RP2350 drives the OLED display with waveform data from the ESP32's `output_waveform[64]` / `input_waveform[64]` arrays sent at 1,378 Hz over the real-time SPI bus. The browser is **closed** or the device is **not connected to a computer**. Audio quality must be perfect.

### Configuration Mode (the WebUI)
The musician configures sounds — browsing presets, uploading samples, editing macro definitions, switching plugins. This happens between performances or during sound design sessions. Brief audio artifacts are **tolerable** because the user is actively making changes and expects the system to respond.

**Key insight:** These modes naturally alternate. A musician doesn't browse the sample manager mid-performance. But forcing an explicit mode switch adds friction and complexity.

---

## What the RP2350 Already Knows

The real-time SPI response from ESP32 → RP2350 includes:

| Field | Size | Purpose |
|-------|------|---------|
| `led_color` (uint32) | 4B | RGB LED state — already encodes activity blinks |
| `input_waveform[64]` | 64B | Audio level for OLED display |
| `output_waveform[64]` | 64B | Audio level for OLED display |

When audio is muted by a mutex hold, the `output_waveform` goes to all-128 (silence). The RP2350 OLED would already show a flat line during dropouts. The `led_color` field carries `ledStatus` which encodes input/output peak levels + blue activity flashes.

---

## Proposal A: "Smart Awareness" — Transparent Coexistence with Visual Feedback

**Philosophy:** Don't change the architecture. The WebUI and audio always coexist. Give the user subtle awareness of what's happening through indicators they already see.

### What changes

1. **Add a `webui_active` flag to the SPI response** — repurpose 1 byte of the existing `link_data[64]` or `led_color` packing to carry a "WebUI session active" bit. The RP2350 firmware can show a small icon on the OLED (e.g., a Wi-Fi symbol) when an HTTP client is connected.

2. **Brief OLED notification on API activity** — When `GetSafeJSON*()` is called, set a flag that the RP2350 reads and displays as a brief "SYNC" or "↻" indicator on the OLED. This tells the musician "the WebUI just did something, that's why audio hiccupped for a moment."

3. **Optimize PicoSeqRack serialization** — The real fix for the 485ms hold time. Instead of serializing 93KB under mutex, pre-cache the JSON when parameters change (params only change on user action — CC, preset load, knob turn). The `GetSafeJSON*()` method would then just copy the pre-built cache under mutex (~1ms instead of ~485ms).

4. **No `getAll` on page load for PicoSeqRack** — The WebUI can check the active plugin first (small, fast response), and if it's PicoSeqRack, use a lighter endpoint that returns parameter *values only* (not the full 93KB MUI spec which rarely changes).

### Customer journey impact
- **Zero learning curve** — user opens browser, uses WebUI, plays music. Same as today.
- **Visual feedback** — OLED shows a brief indicator when WebUI causes a hiccup. User understands causality.
- **Optimization path** — pre-caching can reduce PicoSeqRack dropout from ~485ms to <5ms, making the problem disappear entirely.

### Implementation effort
- SPI flag: Small (1 byte in existing response struct)
- OLED icon: Medium (RP2350 firmware change)
- JSON pre-caching: Medium-High (refactor `ctagDataModelBase` serialization)
- Lighter params endpoint: Medium (new API action, WebUI JS changes)

### Risk
- Pre-caching adds complexity to the data model layer
- Without pre-caching, PicoSeqRack still has ~485ms dropout per page load (tolerable but noticeable)

### Recommendation: **Start here.** Ship the SPI flag + OLED indicator now (small effort), then pursue pre-caching as a follow-up.

---

## Proposal B: "Explicit Mode" — WebUI Requires User Activation

**Philosophy:** Audio is sacred. The REST server is off by default when PicoSeqRack is the active plugin, and must be explicitly enabled from the RP2350 hardware UI.

### What changes

1. **Conditional server start** — `RestServer::StartRestServer()` is only called when a "WebUI Mode" is activated from the RP2350 UI (button combo, menu option, or dedicated mode).

2. **When WebUI Mode activates:**
   - The OLED shows "WebUI Mode — Audio may be interrupted"
   - The REST server starts
   - The LED turns a specific color (e.g., steady blue) to indicate WebUI is active
   - Audio continues running but user accepts potential dropouts

3. **When WebUI Mode deactivates:**
   - Server stops (`httpd_stop()`)
   - OLED returns to normal performance display
   - All HTTP sockets are freed
   - Audio runs with zero risk of mutex contention from HTTP

4. **Auto-timeout** — If no HTTP request is received for 5 minutes, automatically disable WebUI Mode and stop the server.

5. **Plugin-specific behavior** — Only enforce this for PicoSeqRack (or any plugin whose JSON exceeds a threshold like 30KB). For smaller plugins like TBD03 (3.4KB, ~18ms dropout), the server stays always-on since the impact is inaudible.

### Customer journey impact
- **Added complexity** — User must learn a new concept ("WebUI Mode") and perform an explicit action before using the browser interface
- **Friction during sound design** — Every session requires: plug in USB → activate WebUI mode → open browser → make changes → deactivate mode → play
- **Clear separation** — User always knows whether audio is "safe" or not
- **Risk of confusion** — "Why can't I connect to the WebUI?" becomes a support question

### Implementation effort
- Server start/stop: Medium (need to handle httpd lifecycle, socket cleanup)
- RP2350 UI menu: Medium (depends on RP2350 firmware architecture)
- Plugin-size threshold: Low (check JSON size, auto-decide)
- SPI command for mode switch: Low (new command type in existing protocol)

### Risk
- Bad UX for the 90% case — most plugins have negligible dropout
- The TBD platform's identity is "WebUI is central to the experience." Adding a gate contradicts this
- Could frustrate users who just want to upload a sample quickly
- The auto-timeout might deactivate mid-session if the user takes a break

---

## Proposal C: "Deferred Sync" — WebUI Reads Cached Data, Writes Queue for Next Idle Window

**Philosophy:** The WebUI always works, but API reads never hold the mutex. Instead, parameter data is double-buffered: the audio task publishes snapshots, and the HTTP handler reads the snapshot without any locking.

### What changes

1. **Double-buffered parameter snapshots** — The audio task (or a low-priority helper task) periodically serializes plugin params into a SPIRAM shadow buffer. The HTTP handler reads the shadow copy — zero mutex contention.

   ```
   Audio task (core 1, 1378 Hz):
     └── Every N cycles: if (dirty_flag) serialize params → shadow_buffer
   
   HTTP handler (core 0):
     └── Read shadow_buffer directly (no mutex needed)
   ```

2. **Dirty-flag mechanism** — Params are only re-serialized when they actually change (CC received, preset loaded, knob turned). PicoSeqRack's 93KB is serialized once after the change, not on every HTTP request.

3. **Write queue for mutations** — POST operations (set param, load preset, switch plugin) go into a lock-free queue. The audio task drains the queue between buffer cycles, applying changes at a safe point.

4. **Freshness indicator in API response** — JSON responses include an `"age_ms"` field showing how old the snapshot is. The WebUI can display a subtle "syncing..." indicator if data is stale.

5. **Fallback to mutex for critical ops** — Plugin switching and preset save/load still use the mutex (as they do today), since these are inherently disruptive and the user expects a brief pause.

### Customer journey impact
- **Best-in-class UX** — WebUI is always responsive, always available, never causes audio dropouts during reads
- **No learning curve** — identical to today's flow, just works better
- **Slight complexity** — users might see stale data for up to ~100ms after a parameter change (typically unnoticeable)

### Implementation effort
- Double-buffer system: **High** (need shadow buffers per plugin, dirty flags, serialization scheduling)
- Lock-free queue: **High** (careful concurrency design, needs thorough testing)
- WebUI staleness indicator: Low (add field to JSON, small JS change)
- Fallback mutex for writes: Already implemented

### Risk
- **Highest engineering effort** — fundamentally changes the data flow architecture
- Memory pressure — PicoSeqRack's 93KB shadow buffer consumes SPIRAM permanently
- Edge cases — what if params change faster than the serializer runs? Queue overflow?
- Testing complexity — lock-free code is notoriously hard to verify
- Staleness bugs — UI shows old values, user is confused why their knob turn isn't reflected

---

## Comparison Matrix

| Dimension | A: Smart Awareness | B: Explicit Mode | C: Deferred Sync |
|---|---|---|---|
| **Audio impact** | ~485ms dropout per page load (improvable to <5ms with caching) | Zero when mode is off; same as A when on | Zero for reads; brief for writes |
| **User complexity** | None — works as today | Must learn "WebUI Mode" concept | None — works as today |
| **WebUI always available** | Yes | No — requires mode activation | Yes |
| **Engineering effort** | Low → Medium | Medium | High |
| **Risk** | Low | Medium (UX friction) | High (concurrency bugs) |
| **PicoSeqRack-specific** | Pre-caching solves it | Mode gate is PicoSeqRack-specific | Solves all plugins equally |
| **Platform philosophy** | WebUI is always there | WebUI is gated | WebUI is always there, better |
| **Ship timeline** | Phase 1: days. Phase 2: weeks | Weeks | Months |
| **Supports other plugins** | Naturally (most are <50ms) | Unnecessary for most | Over-engineered for most |

---

## Recommendation

**Proposal A ("Smart Awareness") is the right path**, implemented in two phases:

### Phase 1 — Ship now (days of work)
- Add `webui_active` byte to SPI response → RP2350 shows icon on OLED
- Brief "SYNC" indicator on OLED during JSON serialization
- This gives users immediate visual feedback about the ~485ms dropout
- **Existing behavior is already acceptable:** silence during page load is a rare event that only happens when the user explicitly opens the browser

### Phase 2 — Follow-up (weeks of work)
- Pre-cache PicoSeqRack JSON after parameter changes
- New `getParamValues` lightweight endpoint (values only, not full MUI spec)
- This reduces PicoSeqRack's hold time from ~485ms to <5ms
- After this, the problem functionally disappears for all plugins

### Why not B (Explicit Mode)?
The TBD-16's identity is that the **WebUI is central to the ecosystem** — for sample management, preset browsing, macro editing. Adding a gate contradicts the product vision and creates support burden. The 485ms dropout only happens during page loads, not during live performance playback. If the user has a browser open, they're in configuration mode and expect brief interruptions.

### Why not C (Deferred Sync)?
It's the theoretically cleanest solution but the engineering cost is disproportionate to the problem. Pre-caching (Phase 2 of Proposal A) achieves 95% of the benefit at 20% of the effort. If the platform scales to plugins even larger than PicoSeqRack in the future, this could be revisited.

---

*The data in this document is based on live device measurements against PicoSeqRack on ESP32-P4 with 32-sample buffers at 44.1kHz, USB-NCM networking, and the thread-safe JSON serialization implemented in commit 882db9a1.*
