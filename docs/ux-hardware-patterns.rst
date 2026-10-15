Evaluating Hardware UX Patterns
===============================

To give you some inspiration on how to shape the UX of your instrument
or effect, we have taken some well-known electronic instruments and
analyzed them based on different UX tools. As **TBD-16** comes in a
groovebox format (at least from the UI elements), we have chosen a bunch
of well-known grooveboxes and drum machines for this analysis:
**Roland TR-808, Akai MPC 3000, Elektron Octatrack, Erica Synths Pērkons
HD-01, Ableton Push 3** and **Elektron Digitakt II**. We have looked at
all of these through the lenses of different UX analysis systems. For a
more condensed and instantly applicable set of rules, check out our
:doc:`UX Guidelines <uxguidelines>`.

Subjective Mental Workload: The NASA-TLX Comparison
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The `NASA-TLX <https://www.nasa.gov/human-systems-integration-division/nasa-task-load-index-tlx/>`__,
originally intended for measuring the workload of operating machinery in
space, divides the “cost” of operation into six different
characteristics: Mental, Physical, Temporal, Performance, Effort, and
Frustration. This is a subjective evaluation, so your results might be
slightly different, but here are the results that we came up with
looking at our six candidates:

+-----------------+--------+----------+-----------+---------+--------+-------------+
|                 | TR-808 | MPC 3000 | Octatrack | Pērkons | Push 3 | Digitakt II |
+=================+========+==========+===========+=========+========+=============+
| Mental Demand   | 20     | 70       | 90        | 25      | 80     | 75          |
+-----------------+--------+----------+-----------+---------+--------+-------------+
| Physical Demand | 45     | 55       | 60        | 70      | 65     | 45          |
+-----------------+--------+----------+-----------+---------+--------+-------------+
| Performance     | 95     | 90       | 95        | 95      | 95     | 90          |
+-----------------+--------+----------+-----------+---------+--------+-------------+
| Effort          | 20     | 40       | 50        | 20      | 35     | 35          |
+-----------------+--------+----------+-----------+---------+--------+-------------+
| Frustration     | 15     | 60       | 75        | 25      | 45     | 35          |
+-----------------+--------+----------+-----------+---------+--------+-------------+

It’s interesting to see how the more modern devices like the Push 3 or
the Digitakt II try to reduce frustration by implementing safety nets
like Undo/Redo, and, in the case of Push, by giving quite a bit of
visual feedback. The Pērkons on the other side stands out as a near-zero
mental tax due to its “one knob — not more than two functions” approach
in most cases and is comparable to the classic TR-808 in that way;
however, there are many more features laid out on the surface in
comparison to the TR-808.

Nielsen’s Heuristics
~~~~~~~~~~~~~~~~~~~~

Another subjective measurement system that has seen a lot of use comes
from UX guru **Jakob Nielsen**. He has established the
`Nielsen Heuristics <https://www.nngroup.com/articles/ten-usability-heuristics/>`__,
a set of ten rules. We will quickly go through them and give some
examples of how the six devices follow or ignore those rules — just so
you get an idea.

**1. Visibility of System Status**

The TR-808 and the Pērkons achieve near-perfection through near 100%
"What You See Is What You Get" (WYSIWYG) physical states. The
Digitakt II provides some limited overview of the system status, while
Octatrack and MPC 3000 are pretty opaque in that regard. The Push 3 is
an interesting mixed bag: while it utilizes a large OLED screen to
provide color-coded feedback for many features and pages, it doesn’t
really provide a system overview.

**2. Match Between the System and the Real World**

This is a bit of a fuzzy one since it very much depends on the “real
world” of the users: when it comes to building instruments and effects,
it boils down to “don’t re-invent the wheel” by giving familiar concepts
new names instead of established ones or using new icons instead of the
ones everybody knows already. Both the TR-808 and the MPC 3000 have an
unfair advantage here since they established some of these conventions.
Elektron established the term Retrig amongst their machines, which is
essentially very close to what is called Note Repeat on the MPC 3000.

**3. User Control and Freedom**

The Push 3 includes a physical Undo/Redo button and the user control
that comes with it, which is also a nice tool together with its Capture
function in a live context. The Digitakt II, like other Elektron
machines, features a "Reload Pattern" command, allowing for immediate
recovery from destructive mistakes within a Pattern, which is also nice
in a live situation, but can destroy edits when accidentally used. The
Octatrack does not have a comparable functionality. The MPC 3000 has no
real undo functionality for all features, but you can discard changes
and recordings done in Edit Loop and restore Sequences to their former
state. The TR-808 has no safety net, but since it’s very hands-on,
everything can be recreated quickly. The Pērkons at first glance seems
to share that with the 808; however, Patterns and Kits need to be saved
pro-actively, otherwise they are gone for good.

**4. Consistency & Standards**

As mentioned above, the TR-808 is unique here in that it defined
standards that are still the reference for most step sequencers and
drum machines; Pērkons largely follows those standards and only adds a
few of its own. The MPC 3000 is also more of a reference than following
other standards: quite a few of its paradigms such as the 4x4 pad
matrix, Note Repeat, or swing are widely used today in other
grooveboxes. The Elektron machines Digitakt II and Octatrack share quite
a few standards; however, some of the concepts are very close to being
consistent, but end up being slightly different between them. When it
comes to consistency, Digitakt II is a lot more straightforward than the
older Octatrack. Push 3 adheres to the standards of Live since it is the
physical representation of it.

**5. Error Prevention**

Akai MPC 3000 and Push 3 use confirmation prompts for destructive
actions (like deleting a sample or clearing a sequence) and rely on
non-destructive data handling. Elektron Octatrack & Digitakt II allow
"dangerous" commands (like clearing patterns or wiping RAM pools), but
their deep menu hierarchies often require specific multi-key
choreography, which can prevent accidental triggers. The Pērkons, while
in general very much a WYSIWYG device, has several pitfalls that can
easily destroy more complex edits if the user forgets to save Patterns
or Kits. The TR-808, however, remains the "safest" in regards to Error
Prevention.

**6. Recognition Rather Than Recall**

The Roland TR-808 is probably the poster child here for directly
readable information on the surface without the need to memorize a lot,
directly followed by the Pērkons. Push 3, MPC 3000 and Digitakt II use
screens and dynamic labelling to show which parameters are currently
controlled. While this is “readable,” memory load is higher since the
user needs to know the menu structure. On the other end of the spectrum,
the Octatrack is notorious for high recall demand and requires the use
of the manual or cheat sheets in order to make it work for beginners.

**7. Flexibility and Efficiency of Use**

Elektron Octatrack, Digitakt II and Push 3 have steep learning curves
for beginners, but efficiency ceilings are virtually limitless for power
users due to deep macro routing, custom shortcuts, and generative
sequencing as well as the sheer amount of features provided. Roland
TR-808 and Pērkons are incredibly fast and efficient for basic tasks
like building a quick beat, but their flexibility is limited that way
compared to full production workstations. The MPC 3000 is another
example of a highly optimized layout for speed, allowing power users to
chop, assign, and sequence loops entirely without looking at a manual,
which is definitely not true for beginners.

**8. Aesthetic and Minimalist Design**

In this aspect, TR-808 and Pērkons lead the way with an easy-to-use and
minimalist industrial design that is not only sturdy but inviting to
interact with: all the buttons and knobs are easily usable without
requiring special moves in order to reach a certain feature. While this
is also largely true for the Digitakt II and Octatrack, their menu
structure requires holding and pressing certain combinations that are
not always ergonomically welcoming. The Push 3 offers a lot of
expression with MPE-enabled pads; however, the placement of the encoders
above the display is something not all users like (turning them might
obscure your view of the display).

**9. Help Users Recognize, Diagnose, and Recover from Errors**

While the TR-808 doesn’t have the means to signal what went wrong to the
user, it’s usually directly audible. The same is true for the Pērkons;
however, some failures (such as forgetting to save something) can’t be
recovered from. The Elektrons and the MPC 3000 usually have an
explanatory error message, but it’s not always helpful for recovering
from the error itself.

**10. Documentation**

The best documentation is short, in context, and concise. The Elektron
machines, Push 3 and Pērkons have searchable documentation, which is
also true for the digitized versions of the manuals of the MPC 3000 and
the TR-808. Unfortunately, all of these machines lack proper in-context
help or a way to get onboarded by using the device in a moderated way.

Subjective Metrics: UMUX
~~~~~~~~~~~~~~~~~~~~~~~~

The `UMUX <https://www.researchgate.net/publication/220054775_The_Usability_Metric_for_User_Experience>`__
evaluates how a system balances capabilities against user frustration.
The evaluation shows a jump in Capability (Utility) without a
proportional jump in Frustration in modern machines.

+-----------------------------------------+--------+----------+-----------+---------+--------+-------------+
| UMUX Statement                          | TR-808 | MPC 3000 | Octatrack | Pērkons | Push 3 | Digitakt II |
+=========================================+========+==========+===========+=========+========+=============+
| Capabilities meet requirements          | 5      | 7        | 7         | 6       | 7      | 7           |
+-----------------------------------------+--------+----------+-----------+---------+--------+-------------+
| Frustrating experience (Lower=Better)   | 1      | 4        | 6         | 1       | 3      | 3           |
+-----------------------------------------+--------+----------+-----------+---------+--------+-------------+
| Easy to use                             | 7      | 4        | 2         | 7       | 4      | 4           |
+-----------------------------------------+--------+----------+-----------+---------+--------+-------------+
| Too much time correcting (Lower=Better) | 1      | 4        | 6         | 1       | 3      | 2           |
+-----------------------------------------+--------+----------+-----------+---------+--------+-------------+
| Frustration                             | 15     | 60       | 75        | 25      | 45     | 35          |
+-----------------------------------------+--------+----------+-----------+---------+--------+-------------+

The Octatrack scores poorly on standard usability but remains a
professional favorite because its vast utility justifies the struggle.
On the other side, the TR-808 and Pērkons prioritize "Process
Gratification" through frictionless, immediate interaction.

Hedonic Qualities and the AttrakDiff Profile
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

`AttrakDiff <https://www.uxtesttools.com/tools/attrakdiff>`__ measures
the emotional and psychological connection to a product, focusing on
Identity and Stimulation.

**Pragmatic Quality (PQ)**

The TR-808 and (with some small exceptions) also the Pērkons win on
pragmatics by being the most direct machines — they do pretty much
exactly what they look like.

**Hedonic Stimulation (HQ-S)**

The Digitakt II and Octatrack dominate this dimension. Their generative
features and sonic mangling capabilities provide perpetual discovery.

**Hedonic Identity (HQ-I)**

The MPC 3000 and TR-808 carry massive cultural references, connecting
users to the legacy of electronic music pioneers. The Push 3 defines a
Professional/Standard identity for the modern portable studio.

Playful Experiences (PLEX) and Player Archetypes
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

The `PLEX framework <https://www.researchgate.net/publication/287164845_Understanding_playfulness_An_overview_of_the_revised_playful_experience_PLEX_framework>`__
identifies 22 playful states, allowing us to categorize these
instruments into Player Archetypes.

+---------------+---------------------------+----------------------------------------------------------------------------+
| Archetype     | Associated Instruments    | Primary PLEX Experiences                                                   |
+===============+===========================+============================================================================+
| The Jammer    | TR-808 / Pērkons HD-01    | Sensation & Relaxation: Meditative loops and visceral physical feedback.   |
+---------------+---------------------------+----------------------------------------------------------------------------+
| The Performer | MPC 3000 / Ableton Push 3 | Expression & Fellowship: Rhythmic self-expression and cultural connection. |
+---------------+---------------------------+----------------------------------------------------------------------------+
| The Hacker    | Octatrack / Digitakt II   | Challenge & Discovery: Complex puzzles and happy accidents.                |
+---------------+---------------------------+----------------------------------------------------------------------------+

Sensory Dominance and the Colavita Effect
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

An important finding in this evaluation is the danger of Visual
Dominance. The `Colavita Effect <https://www.ncbi.nlm.nih.gov/books/NBK92851/>`__
dictates that humans prioritize visual stimuli over auditory input. High
visual load (screens/waveforms) shifts the user from an expressive state
(listening) to an analytical state (operating). Some hardware —
exemplified by the screenless philosophy of the Pērkons and the
non-visual kinesthetic feedback of MPE pads on the Push 3 — promotes a
tactile-auditory loop that mitigates this effect.


Haptic Reciprocity and Sensory Feedback
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

Digital interfaces are often one-way streets in terms of feedback Acoustic
instruments pass vibrations back to the performer. Reciprocal Tactility
— the use of vibrotactile micro-interactions — is essential for
restoring this bio-feedback loop. Research indicates that while haptics
may not improve pitch accuracy, they significantly enhance user
satisfaction and the feel of the instrument.

Conclusion
~~~~~~~~~~

We hope you now have more anchor points to determine how to build the
UX for your TBD-16 device — as you can see, there are different schools
of thought when it comes to instrument UX as well as different
preferences of different user groups. In our experience, it helps to
think about where you position yourself and what kind of instrument or
effect you want to build.
