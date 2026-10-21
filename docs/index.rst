######################
dada tbd/docs
######################

.. raw:: html

   <style>
     /* Hide the RST page title — the hero replaces it */
     article section h1,
     article > h1 { display: none !important; }
   </style>

   <!-- ========== HERO ========== -->
   <div class="dada-hero">
     <img src="_static/assets/dadamachines-tbd-16_tilt.jpg"
          alt="The dadamachines TBD-16 seen from the front: four encoders under the OLED display, 32 buttons with LEDs, and SD card, headphone, USB-C and USB host ports on the front edge." />

     <p class="dada-hero-headline">
       The open audio platform<br>for musicians and developers.
     </p>
     <p class="dada-hero-sub">
       The <strong>dadamachines TBD-16</strong> is a standalone desktop
       instrument built on
       <a href="https://github.com/ctag-fh-kiel/ctag-tbd">CTAG&nbsp;TBD</a>,
       an open-source audio DSP engine: a 16-track rack of machines, 50+
       synthesizers and effects, standard MIDI, a browser-based UI and
       Ableton Link, with a desktop simulator for developers.
     </p>
   </div>


   <!-- ========== WHY ========== -->
   <div class="dada-section">
     <div class="dada-section-label">Why</div>
     <h2 class="dada-section-title">
       An instrument you can truly make your own.
     </h2>
     <p class="dada-section-body">
       Most electronic instruments are closed boxes — you get the sounds
       the manufacturer chose, and that's it. <strong>TBD is
       different.</strong> The DSP engine, firmware, and plugin system
       are fully open source (GPL&nbsp;3.0). You can play it out of the box,
       or dive into the code and shape it into exactly the instrument
       you need.
     </p>

     <div class="dada-features">
       <div class="dada-feature">
         <div class="dada-feature-icon">
           <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
         </div>
         <h4>Try It Without Hardware</h4>
         <p>The desktop simulator serves the same WebUI, so you can build and
         play machines and plugins before you flash anything.</p>
       </div>
       <div class="dada-feature">
         <div class="dada-feature-icon">
           <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
         </div>
         <h4>Open-Source Software</h4>
         <p>The DSP engine, sound processors, rack layer,
         tools and simulator are
         <a href="https://www.gnu.org/licenses/gpl-3.0.txt">GPL&nbsp;3.0</a> —
         full source access; study, modify, contribute. (The WebUI is a
         dadamachines proprietary app talking to the firmware over its REST API.)</p>
       </div>
       <div class="dada-feature">
         <div class="dada-feature-icon">
           <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg>
         </div>
         <h4>No Lock-In</h4>
         <p>Standard MIDI, standard audio jacks, SD card storage.
         Your instruments and sounds belong to you.</p>
       </div>
       <div class="dada-feature">
         <div class="dada-feature-icon">
           <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 01-9 9"/></svg>
         </div>
         <h4>Built on CTAG TBD</h4>
         <p>The audio engine and the CTAG plugins come from the
         <a href="https://github.com/ctag-fh-kiel/ctag-tbd">CTAG&nbsp;TBD</a>
         project by Robert Manzke.</p>
       </div>
     </div>
   </div>


   <!-- ========== HOW ========== -->
   <div class="dada-section">
     <div class="dada-section-label">How</div>
     <h2 class="dada-section-title">
       Multicore architecture. Three processors, one open platform.
     </h2>
     <p class="dada-section-body">
       The TBD-16 runs three processors in parallel: the
       <strong>ESP32-P4</strong> (dual-core RISC-V) runs the audio engine,
       the rack and the plugins, the <strong>RP2350</strong> drives the
       panel, MIDI and sequencing, and the <strong>ESP32-C6</strong> manages
       WiFi &amp; Ableton Link. The same plugin code also builds for a
       desktop simulator.
     </p>

     <div class="dada-steps">
       <div class="dada-step">
         <h4>Machines</h4>
         <p>Drums and synth voices for the 16-track rack, scaffolded from a
         small JSON descriptor.</p>
       </div>
       <div class="dada-step">
         <h4>CTAG Plugins</h4>
         <p>Standalone sound processors in C++, tested in the desktop
         simulator before flashing.</p>
       </div>
       <div class="dada-step">
         <h4>Controller Apps</h4>
         <p>MIDI controllers, sequencers or control surfaces on the RP2350,
         with Arduino &amp; PlatformIO.</p>
       </div>
       <div class="dada-step">
         <h4>Ableton Link</h4>
         <p>Tempo sync with Ableton Live, iOS apps, and any Link-enabled
         device on the same network.</p>
       </div>
     </div>
   </div>

   <!-- ========== WHAT ========== -->
   <div class="dada-section">
     <div class="dada-section-label">What you can do</div>
     <h2 class="dada-section-title">
       Jump in wherever you are.
     </h2>
     <p class="dada-section-body">
       Whether you're a musician, a developer, or both — there's a path
       for you.
     </p>

     <div class="dada-cards">

       <div class="dada-card">
         <div class="dada-card-icon">
           <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
         </div>
         <h3>Play a TBD-16</h3>
         <p>The user manual for the instrument lives on
         docs.dadamachines.com.</p>
         <ul>
           <li><a href="https://docs.dadamachines.com/tbd-16/">TBD-16 user manual</a></li>
           <li><a href="hardware/10_tbd16.html">TBD-16 at a glance</a></li>
         </ul>
       </div>

       <div class="dada-card">
         <div class="dada-card-icon">
           <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
         </div>
         <h3>Get Started</h3>
         <p>What is in this repository, the three paths, and the simulator
         first: no hardware needed.</p>
         <ul>
           <li><a href="get_started/index.html">Get Started</a></li>
           <li><a href="get_started/setup.html">Development setup</a></li>
           <li><a href="get_started/simulator.html">Desktop simulator</a></li>
           <li><a href="get_started/flash.html">Flash your build</a></li>
         </ul>
       </div>

       <div class="dada-card">
         <div class="dada-card-icon">
           <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
         </div>
         <h3>Write Sound and Apps</h3>
         <p>Write a machine for the rack, a CTAG plugin, or an app on the
         RP2350. The sound guides start in the simulator.</p>
         <ul>
           <li><a href="plugins/rack-tutorial.html">Write a machine</a></li>
           <li><a href="plugins/step-by-step.html">Write a CTAG plugin</a></li>
           <li><a href="apps/getting-started.html">Write an RP2350 app</a></li>
         </ul>
       </div>

       <div class="dada-card">
         <div class="dada-card-icon">
           <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>
         </div>
         <h3>Hardware</h3>
         <p>The TBD-16, the TBD Open Board, and your own board.</p>
         <ul>
           <li><a href="hardware/10_tbd16.html">TBD-16</a></li>
           <li><a href="hardware/20_tbd_open_board.html">TBD Open Board</a></li>
           <li><a href="hardware/index.html#your-own-hardware">Your own hardware</a></li>
           <li><a href="flash/index.html">Flash &amp; Updates</a></li>
         </ul>
       </div>

     </div>
   </div>


.. include:: _includes/newsletter.rst


.. raw:: html

   <p class="dada-section-body" style="text-align:center;">
     Supported by <a href="https://nlnet.nl/project/TBD-DSP-Toolkit/">NLnet</a>
     through the NGI0 Commons Fund.
   </p>

   <!-- ========== GET INVOLVED ========== -->
   <div class="dada-section">
     <div class="dada-section-label">Get Involved</div>
     <h2 class="dada-section-title">
       Shape the platform.
     </h2>
     <p class="dada-section-body">
       TBD is built by a growing community of developers, musicians,
       and manufacturers. Here's how you can contribute.
     </p>

     <div class="dada-ctas">
       <div class="dada-cta">
         <h3>Contribute a Plugin</h3>
         <p>Write a synthesizer, effect, or drum machine in C++. Test it
         in the desktop simulator, then submit a pull request.</p>
         <a href="plugins/step-by-step.html" class="dada-cta-link">Create a Plugin &rarr;</a>
       </div>
       <div class="dada-cta">
         <h3>Build an App</h3>
         <p>Write a MIDI controller, sequencer or control surface for the
         RP2350, starting from the app template.</p>
         <a href="apps/getting-started.html" class="dada-cta-link">App Development Setup &rarr;</a>
       </div>
     </div>

     <div class="dada-cta-wide">
       <h3>Build Your Own Hardware Product</h3>
       <p>Already shipping VST, AU, or LV2 plugins? Your C++ DSP code
       can run on TBD hardware. Build on the
       <a href="hardware/20_tbd_open_board.html">TBD Open Board</a> or
       <a href="hardware/index.html#your-own-hardware">your own board</a>
       with dadamachines. Your product can focus on a single signature
       sound, offer a curated collection, or ship the full multi-plugin
       TBD experience &mdash; same open engine, your hardware, your
       brand.</p>
       <a href="https://dadamachines.com/contact/" class="dada-cta-link">Talk to dadamachines &rarr;</a>
     </div>
   </div>


.. include:: _includes/footer-links.rst


.. toctree::
    :hidden:
    :caption: Develop

    Get Started <get_started/index>
    Build your own <plugins/build-your-own>
    Plugins <plugins/index>
    Machines <plugins/machines>
    Apps <apps/index>
    Flash & Updates <flash/index>

.. toctree::
    :hidden:
    :caption: Hardware and UX

    Hardware <hardware/index>
    UX Guidelines <uxguidelines>
    Hardware UX patterns <ux-hardware-patterns>

.. toctree::
    :hidden:
    :caption: About

    Blog <blog/index>
    Artist Interviews <interviews/index>
    About <about/index>
    FAQ <faq>
