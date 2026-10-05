# Chopper — Google Stitch design prompt

Paste the main prompt into Stitch after the functional release is verified. Attach a screenshot of the current app as a workflow reference. Ask for one direction at a time, then use the follow-up prompts to compare alternatives.

## Main prompt

Design a distinctive, polished web music instrument called **Chopper**. It is a one-page browser sampler for curious music makers and producers: discover a sound, mark passages, capture or import audio, trim it into slices, assign slices to keyboard pads, record a loop, overdub drums, and export the finished WAV. The design should feel like an instrument people want to touch and play, with enough precision for studio work. This is the actual working application screen.

Explore a fresh aesthetic inspired by compact Japanese music hardware, record-store listening stations, and editorial music magazines. Use a warm ivory canvas, deep ink-blue instrument surfaces, muted pink/coral as the main action accent, and sea-glass cyan for waveforms and playback. Pair a characterful, readable display typeface with clean control labels and monospaced timestamps. Use careful spacing, fine dividers, subtle material depth, crisp icons, and tactile pads. Give the wordmark personality. The name is a playful nod to Chopper, but the interface should have an original identity rather than requiring anime character artwork.

Make the workflow immediately understandable through a clear hierarchy:

1. Compact header: Chopper wordmark, editable project name, unsaved-state indicator, Open project, Save project, and Help. Users work locally without an app account.
2. Source workspace: tabs for YouTube and Sounds. YouTube includes a search bar, thumbnail results with titles and channels, a visible embedded player, Mark start / Mark end controls, and a list of named passages with editable start and end times. Sounds includes file import, drag-and-drop, and a scrollable sample/slice tray. Make recorded audio visibly distinct from timestamp bookmarks.
3. Performance workspace: a large 4-by-4 grid of playable pads with readable sample names, persistent keyboard labels, pad numbers, and different accents for drums and melodic chops. Preserve this keyboard layout exactly: Q W E R / A S D F / Z X C V / T Y U I. Show selected and actively playing pads clearly. Selected-pad controls include volume, pitch, melody choke, and Clear pad.
4. Slice editor: a detailed stereo-aware waveform, adjustable in/out boundaries, readable start/end/duration values, editable sample name, Preview, Make slice, Assign to selected pad, and Delete unused sound. Capture tab audio has a clear recording state and Stop capture action; sharing itself uses the browser's native picker.
5. Loop transport: Play, Stop, Record loop / Overdub, Undo take, Clear loop, BPM, 1/2/4/8-bar length, one-bar count-in, optional 1/16 quantization, metronome, bar grid with recorded hits and playhead, take count, and a prominent Export WAV action. The metronome is excluded from exports. Keep transport easy to reach while playing.

Use realistic example content: Dust kick, Soft snare, Closed hat, Warm chord, Blue chord, and named slices such as First phrase. A populated session should show 90 BPM, a four-bar loop, two takes, and a trimmed melody slice. Export is stereo 24-bit WAV at 44.1 kHz; saving downloads a .chopper project.

Provide desktop and compact/mobile layouts. On desktop, keep source discovery, pads, editor, and transport comfortably visible with restrained scrolling. On smaller screens, prioritize playable pads and transport while placing source browsing and detailed editing in easy-to-open sections. Support large touch targets, readable labels, strong contrast, keyboard focus, and reduced-motion states.

Include designs for: ready-to-play demo, YouTube browsing with saved regions, selected waveform slice, count-in and recording, stopped loop with overdubbing available, active tab capture, source-loading failure, search unavailable with URL fallback, and a helpful empty sample library. Make disabled controls legible when pad bindings or tempo are locked by existing takes. Keep status messages close to the affected task.

The functional boundary is important: a video bookmark is not yet playable sample audio. Captured or imported audio becomes a playable slice only after recording and decoding. Automatic capture of marked YouTube regions is an experimental local workflow; design its progress/cancel state as an optional variant rather than a required public feature. Do not invent cloud saving, login, AI music generation, a step sequencer, subscriptions, or full multitrack DAW tools.

Deliver a coherent high-fidelity interface, a reusable visual system for colors/type/spacing/buttons/pads, and interaction state examples. Prioritize clarity, personality, and the joy of playing. The instrument should remain the visual centerpiece.

## Alternative direction prompts

### Night studio

Keep the exact Chopper workflow and controls. Reinterpret the design as a late-night listening room: graphite and ink-navy surfaces, muted rose action buttons, amber recording details, icy cyan waveforms, and softly illuminated tactile pads. Explore a compact industrial silhouette and more confident typography. Preserve readability and functional hierarchy.

### Portable sampler

Keep the exact Chopper workflow and controls. Reinterpret it as a portable instrument: warm gray and cream casing, playful muted pink and blue pads, crisp engraved labels, precise waveform displays, and a restrained retro feel. Use small hardware-inspired details without making text or controls harder to use.

### Editorial record shop

Keep the exact Chopper workflow and controls. Reinterpret it through contemporary record-store culture: warm off-white, black ink, faded cobalt, coral highlights, bold typographic rhythm, and clear modular sections. Bring personality through type and composition while keeping the pad grid and waveform precise and playable.

## Refinement prompt

Refine the chosen direction while preserving all controls and the existing workflow. Reduce decoration around the source list; give the pads and waveform more space. Make selected, playing, recording, loading, and disabled states distinct. Keep the transport reachable, improve typography at small sizes, and show how the desktop layout adapts to a narrow screen. Preserve the exact keyboard mappings and distinguish marked video regions from captured audio slices.
