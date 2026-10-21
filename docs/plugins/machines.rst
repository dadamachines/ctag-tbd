Machines
========

The TBD-16's **GrooveBoxRack** instrument hosts **17 Machines** — small DSP voices
that run on its 16 tracks. Each track has its own selection of Machines, hard-wired
in the DSP for low-latency switching. A Machine is the *engine* that makes the sound;
a *preset* (loaded from the device's macro/preset system) stores parameter values for it.

.. tip::

   **Just want to play the TBD-16?** The user-facing catalogue with sonic descriptions,
   tips and parameter details lives at
   `docs.dadamachines.com/tbd-16/machines/ <https://docs.dadamachines.com/tbd-16/machines/>`_.
   This page is the *developer* view — same Machines, but with the rack-internal id,
   the track it lives on, the source code, and a link to the per-Machine deep dive.

   **Building a new Machine?** Start with the :doc:`Hello, Machines tutorial <rack-tutorial>`
   (~15 minutes) and the :doc:`Writing a Machine reference <rack-plugins>`.

   **First time here?** The :doc:`Plugins </plugins/index>` section has the shared
   developer workflow (Quickstart, Simulator, Architecture, Build & Flash, Web API).
   Machines build on top of that knowledge.

Use the search box below to filter by name, type, or origin. Click any Machine name to
read the user-facing documentation.

.. raw:: html

   <div class="plugin-toolbar">
     <input type="text" id="machineSearch" placeholder="Search machines…" />
     <div class="plugin-filters">
       <button class="filter-btn active" data-filter="all">All</button>
       <button class="filter-btn" data-filter="Drum">Drum</button>
       <button class="filter-btn" data-filter="Synth">Synth</button>
       <button class="filter-btn" data-filter="Sampler">Sampler</button>
       <button class="filter-btn" data-filter="Input">Input</button>
     </div>
   </div>

   <table class="plugin-table" id="machineTable">
     <thead>
       <tr>
         <th class="sortable" data-sort="name">Machine ↕</th>
         <th class="sortable" data-sort="id">Id ↕</th>
         <th class="sortable" data-sort="type">Type ↕</th>
         <th>Tracks</th>
         <th>Origin</th>
       </tr>
     </thead>
     <tbody>
       <tr data-type="Drum">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/synth-kick" target="_blank" rel="noopener">Synth Kick</a></td>
         <td><code>db</code></td>
         <td><span class="type-badge type-drums">Drum</span></td>
         <td>CH01 Kick</td>
         <td>Mutable Instruments Plaits <code>synthetic_bass_drum</code></td>
       </tr>
       <tr data-type="Drum">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/analog-bass-drum" target="_blank" rel="noopener">Analog Bass Drum</a></td>
         <td><code>ab</code></td>
         <td><span class="type-badge type-drums">Drum</span></td>
         <td>CH01 Kick</td>
         <td>Mutable Instruments Plaits <code>analog_bass_drum</code></td>
       </tr>
       <tr data-type="Drum">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/fm-kick" target="_blank" rel="noopener">FM Kick / Bass</a></td>
         <td><code>fmb</code></td>
         <td><span class="type-badge type-drums">Drum</span></td>
         <td>CH02 Kick2</td>
         <td>CTAG <code>FmKick</code> (custom FM drum voice)</td>
       </tr>
       <tr data-type="Drum">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/digital-snare" target="_blank" rel="noopener">Digital Snare</a></td>
         <td><code>ds</code></td>
         <td><span class="type-badge type-drums">Drum</span></td>
         <td>CH03 Snare</td>
         <td>Mutable Instruments Plaits <code>synthetic_snare_drum</code></td>
       </tr>
       <tr data-type="Drum">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/analog-snare" target="_blank" rel="noopener">Analog Snare</a></td>
         <td><code>as</code></td>
         <td><span class="type-badge type-drums">Drum</span></td>
         <td>CH03 Snare</td>
         <td>Mutable Instruments Plaits <code>analog_snare_drum</code></td>
       </tr>
       <tr data-type="Drum">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/hi-hat-1" target="_blank" rel="noopener">Hi-Hat 1</a></td>
         <td><code>hh1</code></td>
         <td><span class="type-badge type-drums">Drum</span></td>
         <td>CH04 Hat</td>
         <td>Mutable Instruments Plaits <code>hi_hat</code></td>
       </tr>
       <tr data-type="Drum">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/hi-hat-2" target="_blank" rel="noopener">Hi-Hat 2</a></td>
         <td><code>hh2</code></td>
         <td><span class="type-badge type-drums">Drum</span></td>
         <td>CH04 Hat</td>
         <td>Mutable Instruments Plaits <code>hi_hat</code> (alt preset)</td>
       </tr>
       <tr data-type="Drum">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/rimshot" target="_blank" rel="noopener">Rimshot</a></td>
         <td><code>rs</code></td>
         <td><span class="type-badge type-drums">Drum</span></td>
         <td>CH05 Rimshot</td>
         <td>CTAG <code>Rimshot</code></td>
       </tr>
       <tr data-type="Drum">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/clap" target="_blank" rel="noopener">Clap</a></td>
         <td><code>cl</code></td>
         <td><span class="type-badge type-drums">Drum</span></td>
         <td>CH06 Clap</td>
         <td>CTAG <code>Clap</code></td>
       </tr>
       <tr data-type="Synth">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/tbd03" target="_blank" rel="noopener">TBD03</a></td>
         <td><code>td3</code></td>
         <td><span class="type-badge type-synth">Synth</span></td>
         <td>CH09 Bass, CH10 Bass2</td>
         <td>Mutable Instruments Braids oscillator + diode-ladder filter</td>
       </tr>
       <tr data-type="Synth">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/mono-synth" target="_blank" rel="noopener">Mono Synth</a></td>
         <td><code>mo</code></td>
         <td><span class="type-badge type-synth">Synth</span></td>
         <td>CH11 Lead, CH12 Lead2</td>
         <td>Mutable Instruments Braids macro oscillator</td>
       </tr>
       <tr data-type="Synth">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/wavetable-osc" target="_blank" rel="noopener">Wavetable Osc</a></td>
         <td><code>wtosc</code></td>
         <td><span class="type-badge type-synth">Synth</span></td>
         <td>CH12 Lead2</td>
         <td>Mutable Instruments Plaits wavetable oscillator</td>
       </tr>
       <tr data-type="Synth">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/tbdaits" target="_blank" rel="noopener">TBDaits</a></td>
         <td><code>tbdait</code></td>
         <td><span class="type-badge type-synth">Synth</span></td>
         <td>CH12 Lead2</td>
         <td>Mutable Instruments Plaits macro voice (24 engines) + CTAG AHR envelope</td>
       </tr>
       <tr data-type="Synth">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/tbdings" target="_blank" rel="noopener">TBDings</a></td>
         <td><code>tbd</code></td>
         <td><span class="type-badge type-synth">Synth</span></td>
         <td>CH12 Lead2, CH15 Chordo</td>
         <td>Mutable Instruments Rings (Modal + Plucked resonator)</td>
       </tr>
       <tr data-type="Synth">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/polypad" target="_blank" rel="noopener">PolyPad</a></td>
         <td><code>pp</code></td>
         <td><span class="type-badge type-synth">Synth</span></td>
         <td>CH15 Chordo</td>
         <td>CTAG <code>ChordSynth</code> / PolyPad</td>
       </tr>
       <tr data-type="Sampler">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/rompler" target="_blank" rel="noopener">Rompler</a></td>
         <td><code>ro</code></td>
         <td><span class="type-badge type-sampler">Sampler</span></td>
         <td>CH01…CH15 (every voice track)</td>
         <td>CTAG <code>RomplerVoiceMinimal</code> (reads the sample-rom)</td>
       </tr>
       <tr data-type="Input">
         <td><a href="https://docs.dadamachines.com/tbd-16/machines/input" target="_blank" rel="noopener">Input</a></td>
         <td><code>in</code></td>
         <td><span class="type-badge type-utility">Input</span></td>
         <td>CH16 only</td>
         <td>External audio passthrough (line-in → mixer → FX)</td>
       </tr>
     </tbody>
   </table>

   <p class="plugin-count"><span id="machineVisibleCount">17</span> of 17 machines shown</p>

   <script>
   document.addEventListener('DOMContentLoaded', function() {
     const search = document.getElementById('machineSearch');
     const table = document.getElementById('machineTable');
     if (!search || !table) return;
     const rows = table.querySelectorAll('tbody tr');
     // Scope the filter-btn selector to THIS table's toolbar so we don't
     // collide with the plugin table's buttons if both pages load in the same SPA.
     const toolbar = search.closest('.plugin-toolbar');
     const filterBtns = toolbar ? toolbar.querySelectorAll('.filter-btn') : [];
     const countEl = document.getElementById('machineVisibleCount');
     let activeFilter = 'all';

     function filterRows() {
       const q = (search.value || '').toLowerCase();
       let visible = 0;
       rows.forEach(function(row) {
         const text = row.textContent.toLowerCase();
         const type = row.getAttribute('data-type');
         const matchSearch = !q || text.indexOf(q) !== -1;
         const matchFilter = activeFilter === 'all' || type === activeFilter;
         if (matchSearch && matchFilter) {
           row.style.display = '';
           visible++;
         } else {
           row.style.display = 'none';
         }
       });
       if (countEl) countEl.textContent = visible;
     }

     search.addEventListener('input', filterRows);
     filterBtns.forEach(function(btn) {
       btn.addEventListener('click', function() {
         filterBtns.forEach(function(b) { b.classList.remove('active'); });
         btn.classList.add('active');
         activeFilter = btn.getAttribute('data-filter');
         filterRows();
       });
     });
   });
   </script>


Building a new Machine
----------------------

A Machine is a small mono DSP voice that lives *inside* the TBD-16's GrooveBoxRack.
The rack handles level / pan / FX-sends / mixing and dispatches MIDI notes — your
code just renders one block (32 samples) of mono audio per ``Process()`` call.

Reading order:

#. :doc:`Hello, Machines — Tutorial <rack-tutorial>` — ~15 minutes, end-to-end:
   write a 12-line descriptor, run ``rackgen.js -i``, fill in ~15 lines of DSP,
   hear it in the simulator. Self-contained.
#. :doc:`Writing a Machine <rack-plugins>` — the reference: every parameter macro,
   the voice registry helpers, the channel-mixer surface, the trigger / noteOn /
   noteOff contract.

.. note::

   **Machines build on top of the** :doc:`Plugins </plugins/index>` **section's
   knowledge.** If you haven't yet, read at least :doc:`Quickstart <quickstart>`,
   :doc:`Desktop Simulator </get_started/simulator>` and :doc:`Plugin Architecture <architecture>`
   first — the simulator, the parameter system, the build workflow are all the same
   between Plugins and Machines. The two Machine pages above stay readable solo,
   but they assume you can run the simulator and know what a ``ctagSoundProcessor`` is.

.. toctree::
   :hidden:

   Hello, Machines — Tutorial <rack-tutorial>
   Writing a Machine <rack-plugins>


.. include:: /_includes/footer-links.rst
