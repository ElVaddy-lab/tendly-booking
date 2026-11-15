---
name: Tendly
description: Online booking for barbershops and salons; warm paper panels resting on daylit pale oak.
colors:
  ink: "#1c1813"
  ink-hover: "#352e27"
  ink-soft: "#4f4c46"
  ink-on-wood: "#4a3f35"
  paper: "#f7f0e9"
  card: "#f7eee8"
  slot-fill: "#fbf6f1"
  rule: "#e2d8cd"
  rule-control: "#ddd2c6"
  rule-hover: "#c9b9a6"
  tan: "#e3c9a9"
  tag: "#ebe5da"
  tag-text: "#5f574f"
  wood: "#e4d0b8"
  night: "#2c2421"
  night-text: "#f1e7dc"
  night-muted: "#cbbcae"
  pending: "#ece3d9"
  refused-bg: "#ead9d3"
  refused-text: "#7a2f22"
  scrollbar-thumb: "#c8aa90"
typography:
  display:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "calc(112 * 100vw / 2752)"
    fontWeight: 400
    lineHeight: 1.205
    letterSpacing: "0em"
  display-narrow:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.3rem, 10vw, 3.4rem)"
    fontWeight: 400
    lineHeight: 1.18
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 1.2rem + 3.2vw, 4.25rem)"
    fontWeight: 300
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  figure:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 2rem + 2.5vw, 4rem)"
    fontWeight: 300
    lineHeight: 1
    fontFeature: "tnum"
  row-name:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.3rem + 1.5vw, 2.5rem)"
    fontWeight: 300
  title:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.35rem, 1.1rem + 0.8vw, 1.85rem)"
    fontWeight: 400
    lineHeight: 1.2
  body-lead:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.05rem, 0.95rem + 0.4vw, 1.3rem)"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9rem"
    fontWeight: 400
  caption:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
  wordmark:
    fontFamily: "Krub, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.35rem"
    fontWeight: 600
    letterSpacing: "-0.01em"
rounded:
  pill: "999px"
  control: "0.75rem"
  row: "1rem"
  card: "1.25rem"
  panel: "1.75rem"
  circle: "50%"
spacing:
  gutter: "1.25rem"
  row-y: "0.75rem"
  row-x: "1.1rem"
  stack-sm: "0.6rem"
  stack-md: "1.25rem"
  block: "clamp(2rem, 4vw, 3rem)"
  section: "clamp(4.5rem, 9vw, 8rem)"
  container: "72rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "0 1.5rem"
    height: "3rem"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "0 1.5rem"
    height: "3rem"
  nav-pill:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "3.5rem"
  booking-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  slot-chip:
    backgroundColor: "{colors.slot-fill}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "2.75rem"
  slot-chip-selected:
    backgroundColor: "{colors.tan}"
    textColor: "{colors.ink}"
  day-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    width: "3.4rem"
    height: "3.6rem"
  demo-tag:
    backgroundColor: "{colors.tag}"
    textColor: "{colors.tag-text}"
    rounded: "{rounded.pill}"
    padding: "0.2rem 0.6rem"
  night-band:
    backgroundColor: "{colors.night}"
    textColor: "{colors.night-text}"
    rounded: "{rounded.card}"
  paper-row:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.row}"
    padding: "0.75rem 1.1rem"
  price-list:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
---

# Design System: Tendly

## Overview

**Creative North Star: "A Calm Morning at the Shop"**

Tendly is a full day that still feels unhurried. The page ground is a photograph of pale oak in soft window light; everything you touch is a warm off-white panel resting on that wood, lit from the upper right so its shadow falls long toward the lower left. Text is near-black, never pure black. The only strong accent is a near-black pill: the action. Colour comes from the material (oak, paper, a tan selection wash), not from a brand hue.

The system is light and roomy in persuasion surfaces, with one dark interlude: a deep brown band that reads like the shaded half of the room, onto whose top edge the window light still spills. Type is a single humanist sans (Krub) used light at large sizes and regular at reading sizes, with tabular figures wherever time or money is shown. Real interface is the illustration: a working booking card, slot rows, a price list on paper. There is no decorative chrome.

Status: built on one surface so far, the landing page `/` (Persuade). The public booking page `/b/[slug]` and the dashboard (Operate) are not yet built; guidance for them below is derived from the shipped tokens and is marked **(not yet built)**.

**Key Characteristics:**
- Daylit pale-oak ground; warm paper panels resting on it.
- Directional lower-left daylight shadows on panels that rest on wood.
- One strong accent: the near-black pill. Tan is a selection wash, never a call to action.
- Krub only: light (300) for large display, regular (400) for reading and controls, medium/semibold only for the primary nav action and wordmark.
- Real interface as imagery; photographs only inside pills and circles.
- Honest demo labelling is part of the visual system, not an afterthought.

## Colors

A warm, low-chroma material palette: oak, paper and near-black ink, with tan as the single selection colour and a deep brown for the one dark band.

### Primary
- **Workshop Ink** (`ink`): All text on paper and wood, the primary pill, the selected-day border, focus outlines (`:focus-visible` is a 2px ink outline), `accent-color` and `::selection` text. 15.4:1 on card.
- **Warm Ink Hover** (`ink-hover`): Hover state of every ink pill (nav CTA, Book, plan button). Nothing else.

### Secondary
- **Morning Tan** (`tan`): Selection only. Selected time slot fill, the selected row wash (at 45% alpha; 25% on hover), `::selection` background, the "Booked" status chip, the highlighted shop row in the time-zone list. Ink on tan is 11.1:1.

### Neutral
- **Pale Oak** (`wood`): The flat colour under the wood photograph and the repeating oak tile; also the fallback while the image loads.
- **Warm Paper** (`paper`): Nav pill, inline clock pill, text on ink pills, scrollbar track.
- **Card Paper** (`card`): Every panel that rests on wood or night: booking card, price list, proof rows on the dark band.
- **Slot Paper** (`slot-fill`): Unselected time-slot chips, a touch lighter than the card.
- **Soft Ink** (`ink-soft`): Column labels, service meta (minutes and price), day names, plan names, status line, secondary text inside paper rows. 7.5:1 on card.
- **Ink on Wood** (`ink-on-wood`): Secondary text that sits directly on the oak (price notes, role descriptions, footer). 6.8:1 on the flat oak.
- **Paper Rule** (`rule`): Dividers inside paper panels (card head, between columns, between plans, plan items).
- **Control Rule** (`rule-control`) and **Hover Rule** (`rule-hover`): Resting and hover borders of slot and day chips.
- Rules directly on wood are ink at 18% alpha (`rgb(28 24 19 / 0.18)`): role list, footer.
- **Demo Tag** (`tag`, `tag-text`): The "Demo business, fictional" label. 5.7:1.
- **Shaded Room** (`night`, `night-text`, `night-muted`): The dark proof band; muted text 8.2:1, body text 12.5:1. Dividers on night are night-text at 14% alpha.
- **State chips** (`pending`; `refused-bg` with `refused-text`): "Booking…" and "Slot just taken". Refused text is 6.8:1; this deep rust is the only error colour the build has.
- **Scrollbar** (`scrollbar-thumb`): Thumb colour on the paper track.

### Named Rules
**The One Pill Rule.** The near-black pill is the only strong accent. A screen has one filled ink pill per decision point; secondary actions are the outlined quiet pill or an underlined link.

**The Tan Is a Wash Rule.** Tan marks what is chosen, never what to do. It never fills a button and never carries text smaller than the slot label.

**The No Pure Black Rule.** Ink is `#1c1813`; shadows are warm brown (`rgb(74 50 28)`, `rgb(92 64 38)`). Neutral grey and `#000` text do not appear on wood or paper.

## Typography

**Display Font:** Krub (with ui-sans-serif, system-ui, sans-serif)
**Body Font:** Krub (same stack)

**Character:** One soft humanist sans across the whole system, loaded at 300/400/500/600 through `next/font` as `--font-krub` and wired into Tailwind as both `--font-sans` and `--font-heading`. Large type goes light; everything you read or press stays regular.

### Hierarchy
- **Display** (400, 112 comp-px scaled to the viewport, line-height 135/112): The landing headline only, centred, `text-wrap: balance`, with inline objects living inside the sentence. Below 1100px it becomes **display-narrow** (400, `clamp(2.3rem, 10vw, 3.4rem)`, 1.18).
- **Headline** (300, `clamp(2.25rem, 1.2rem + 3.2vw, 4.25rem)`, 1.08, -0.015em): Section titles, max 18–22ch, balanced.
- **Figure** (300, `clamp(2.75rem, 2rem + 2.5vw, 4rem)`, 1, tabular): Prices. The unit ("per month") drops to 1rem regular in soft ink.
- **Row name** (300, `clamp(1.75rem, 1.3rem + 1.5vw, 2.5rem)`): Large clickable list rows (roles).
- **Title** (400, `clamp(1.35rem, 1.1rem + 0.8vw, 1.85rem)`, 1.2): Proof titles; card title is the same role at 1.2rem on phones.
- **Body lead** (400, `clamp(1.05rem, 0.95rem + 0.4vw, 1.3rem)`, 1.55, max 52ch): Section leads.
- **Body** (400, 1.05rem, 1.6, max 50ch): Paragraphs, plan items, buttons.
- **Label** (400, 0.85–0.95rem): Column labels, day names, chip text, footer, notes' sender line. Sentence case; no uppercase, no tracking.
- **Wordmark** (600, -0.01em): "Tendly" in the nav (1.35rem on phones); 500 at 1.25rem in the footer.

### Named Rules
**The Light Large Rule.** Weight goes down as size goes up: 300 for headline, figure and row names; 400 for everything at reading size. 500 is reserved for the nav "Start free" pill and the footer mark; 600 for the wordmark.

**The Tabular Time Rule.** Every time, date number, duration, price and zone offset uses `font-variant-numeric: tabular-nums`.

## Layout

Two layout grammars coexist and must not be confused:

1. **The comp-locked hero** (landing only). Above 1100px the first viewport is authored in comp pixels and scaled by `--u = 100vw / 2752`, so the approved composition holds at any desktop width: nav pill 2069u wide, headline 150u below the nav, booking card 1380u wide, four columns of 349u / 295u / 455u / 1fr. Hero UI text has a floor (`max(0.8125rem, Nu)`, 0.875rem for the subline and card title) so nothing drops below 13px between 1100px and the comp width. This is a landing-hero technique, not a system rule; no other surface uses `--u`.
2. **The fluid system** (everything below the hero, and every future surface). Content width `min(100% - 2.5rem, 72rem)` (a 1.25rem gutter), section padding `clamp(4.5rem, 9vw, 8rem)`, blocks separated by `clamp(2rem, 4vw, 3rem)`, proof rows `clamp(2.25rem, 4vw, 3.5rem)` tall with a `clamp(1.5rem, 5vw, 6rem)` column gap. Lists of paper rows stack at a 0.6rem gap.

**Breakpoint:** one, at 1100px. Below it the hero restacks in rem: nav pill full width at 3.5rem with links hidden (wordmark, Sign in, Start free remain), headline lines run inline, the hero photograph is dropped and the oak tile carries the page, the booking card goes single-column (capped at 40rem and centred) with columns divided by horizontal rules, barbers become a 2-up grid, slots a 3-up grid, Book goes full width. Proof rows, plans and role rows collapse to one column.

**Rhythm:** paper rows `0.75rem 1.1rem`; card columns `1rem 1.1rem` on phones; touch targets on phones are at least 2.75rem (slots, service rows), 2.9rem (barber rows), 3rem (plan buttons).

## Elevation & Depth

Depth is physical: objects rest on a lit wooden surface, and their shadows say where the window is. Panels on wood cast a **directional daylight shadow** offset down and to the left with a short blur, layered over a faint contact shadow. Floating objects that are not resting on the table (the nav pill, inline headline pills) take a soft, centred ambient shadow instead. The dark band is lit from inside: a radial glow and a thin inset highlight on its top edge, as if the window light reaches it.

### Shadow Vocabulary
- **Daylight, panel** (`box-shadow: -40px 38px 14px rgb(74 50 28 / 0.24), 0 3px 10px rgb(74 50 28 / 0.1)`): Large paper on wood (price list). The booking card uses the same language at hero scale (`-56u 54u 10u / 0.36`, `-24u 22u 6u / 0.14`, `0 4u 14u / 0.1`) and `-22px 22px 10px / 0.22, 0 2px 8px / 0.1` on phones.
- **Daylight, on night** (`box-shadow: -10px 14px 28px rgb(0 0 0 / 0.28)`): Paper rows on the dark band; same direction, softer and darker because the band is in shade.
- **Ambient float** (`box-shadow: 0 10u 40u rgb(92 64 38 / 0.16)`): The nav pill.
- **Inline object** (`box-shadow: 0 8u 24u rgb(74 50 28 / 0.22)`; 0.16 for the paper clock pill): Objects set into the headline.
- **Window edge** (`box-shadow: inset 0 3u 0 rgb(226 204 182 / 0.35)` with `radial-gradient(60% 160u at 45% 0, rgb(120 96 86 / 0.45), transparent)` over night): The top edge of the dark band.

### Named Rules
**The One Window Rule.** Every resting shadow falls to the lower left (negative x, positive y). Never mix directions on one screen; never use a hard zero-blur offset shadow.

**The Rest or Float Rule.** Panels lying on the surface get the directional daylight shadow; chrome that floats above it (nav, inline pills) gets the centred ambient shadow. Controls inside a panel (chips, rows, buttons) are flat.

## Shapes

Soft and friendly, with two families. **Pills** (`999px`) for everything you press or that names a thing: nav, CTAs, plan buttons, the Book button, barber rows, demo tag, status chips, inline headline objects. **Rounded rectangles** for containers and grid controls: slot and day chips at 0.75rem (12u in the hero), paper rows at 1rem, the booking card at 1.25rem (30u in the hero), the price list at 1.75rem, the dark band at `max(1.25rem, 60u)`. Faces are always circles (avatars, clock face), portraits cropped from the top (`object-position: 50% 20%`). Borders are thin hairlines in rule colours (1px; 2u in the hero card); the only heavy borders are the ink selection cues: the selected day (3u / 2px), the selected slot border and the 2px inset ring on selected rows and the 1.5px outline of the quiet pill.

## Components

### Buttons
Tactile, dark and quiet: a single near-black pill does the asking.
- **Shape:** full pill (999px).
- **Primary:** ink fill, paper text, 3rem tall with 1.5rem side padding at body size (1.05rem); in the nav, 500 weight. The Book button carries the chosen time in its label ("Book 10:30").
- **Hover:** fill shifts to ink-hover over 200ms `cubic-bezier(0.16, 1, 0.3, 1)`. No lift, no scale.
- **Quiet:** transparent with a 1.5px ink outline and ink text; hover adds a 6% ink wash. Used for the lower-commitment choice beside a primary ("Start free" next to "Start with Pro").
- **Focus:** global 2px ink outline, 3px offset.

### Navigation (nav pill)
A floating paper pill centred at the top of the page: wordmark left, three text links centred, Sign in as a text link and Start free as the primary pill at the right end. Links are ink, underlined on hover (0.25em offset). Ambient float shadow. Below 1100px it spans the width at 3.5rem and the centre links are hidden.

### Booking card (signature)
The product itself, used as the hero. A card-paper panel with the daylight shadow.
- **Head:** business name (title role) left, demo tag right, separated from the body by a paper rule.
- **Body:** four radio-group columns (Services, Barber, Date, Time) divided by vertical paper rules; each column has a soft-ink label (`role="radiogroup"` with `aria-labelledby`), options are native radio inputs visually hidden over a styled label.
- **Service row:** name over soft-ink meta ("30 min • $35", tabular); tan wash plus a 2px inset ink ring when selected (the ring carries the state: tan alone is about 1.4:1 against the card), lighter wash on hover (25%), 180ms ease-out.
- **Barber row:** circular portrait + name in a pill-shaped row; same wash and ink-ring states.
- **Day chip:** weekday label over a large tabular date, transparent border at rest, rule-hover on hover, ink border when selected.
- **Slot chip:** slot-paper fill, control-rule border; rule-hover border on hover; tan fill with an ink border when selected.
- **Footer of the Time column:** the primary pill and a polite `role="status"` line in soft ink.
- On phones: single column, columns separated by horizontal rules, service rows become name-left / meta-right lines.

### Chips
- **Demo tag:** tag fill, tag-text, pill, label size. Always present where fictional data appears.
- **Status chips** (on paper rows): Booked = tan; pending = `pending` with soft ink; refused = `refused-bg` with `refused-text`. Colour crossfade 450ms on the expo-out curve.

### Inline headline objects
Small real things set into the display sentence, sitting on the baseline: a photograph cropped into a pill (251×104u) and a paper pill holding a clock face and a tabular time ("10:30"). Each carries the inline-object shadow. On phones they shrink to em units (photo 2.3em × 0.95em, clock 0.95em tall) so they ride the text size. Use at most two per headline, and only objects that are literally the subject of the words next to them.

### Dark proof band
A deep-brown rounded band that overlaps the end of the hero by 49u, with the window-edge glow at its top. Holds a light headline in night-text, a muted lead, and proof rows: text left, a small piece of real interface right, rows divided by 14% night-text hairlines. The interface pieces are paper rows (`paper-row`): card paper, 1rem radius, the on-night daylight shadow, label in soft ink and value in ink.

### Paper price list
One card-paper panel resting on the wood with the panel daylight shadow and 1.75rem corners; plans side by side divided by a vertical paper rule (stacked on phones). Each plan: soft-ink name, light tabular figure with a small unit, a list of items separated by paper rules, then a pill button pinned to the bottom (quiet for Free, primary for Pro). An honest note in ink-on-wood follows the panel.

### Role rows
Wide link rows directly on the wood, separated by 18% ink hairlines: light row-name, a one-line description in ink-on-wood, and a 1.5px-stroke arrow icon that slides 0.25rem right on hover (300ms expo-out). On phones the description wraps under the name and the arrow centres on the right.

### Inputs / Fields
No text fields are built yet. **(not yet built)** Derive from the slot chip: slot-paper fill, control-rule border, control radius, rule-hover on hover, ink 2px focus outline; error text in refused-text.

### Motion grammar
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` (expo-out) for anything that answers a click or hover on an action (200ms buttons, 300ms arrow, 450ms status crossfade); plain `ease-out` 180ms for selection washes and chip borders.
- Animate colour, border and `translate` only; no layout properties, no scale, no bounce.
- Narrative motion plays once, on entering view, and its final state is the default render (the race demo renders "Booked / Slot just taken" without JS).
- `prefers-reduced-motion: reduce` removes every transition on the page and skips the replay.

### Imagery and materials
- **Wood ground:** a window-lit oak photograph behind the first viewport only, masked to dissolve (`linear-gradient(to bottom, #000 82%, transparent)`) into an evenly lit, mirrored oak tile that repeats down the page over the flat oak colour. Below the hero the wood is shadowless and even: no light streaks, knots or vignette, so text on it stays legible.
- **Plates:** every raster is authored for this project and carries its provenance in embedded metadata. People shown are fictional and appear only as small circular portraits or inside a pill crop, never as full-bleed hero photography.
- Photographs never sit behind text other than the oak.

### Business branding on the public booking page **(not yet built)**
`/b/[slug]` reuses the booking-card anatomy on phones (the single-column layout above is its starting point). What a business may replace:
- **Its logo and name** in the card head (where "Northside Barbers" sits now).
- **Tan** (selection wash, selected slot, Booked chip) with its accent, only if ink text on the accent stays at or above 4.5:1; otherwise keep tan.
- **The primary pill fill** with its accent, only if paper text on it stays at or above 4.5:1; otherwise keep ink.

What stays Tendly's: Krub, ink text, paper surfaces, rule colours, radii, the daylight shadow, the focus outline, refused/pending state colours, and the demo tag on fictional businesses. Whether the oak ground appears behind a business's page, or only on Tendly's own surfaces, is undecided.

### Dashboard and shadcn/ui mapping **(not yet built)**
`globals.css` still carries shadcn's neutral grayscale defaults (radix-nova), which the landing does not use. When the dashboard is built, point the shadcn variables at existing Tendly values rather than new ones:

| shadcn variable | Tendly token |
|---|---|
| `--background` | `paper` |
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--primary`, `--ring` | `ink` |
| `--card`, `--popover` | `card` |
| `--primary-foreground` | `paper` |
| `--secondary`, `--muted` | `tag` |
| `--muted-foreground`, `--secondary-foreground` | `ink-soft` |
| `--accent` | `tan` |
| `--accent-foreground` | `ink` |
| `--border` | `rule` |
| `--input` | `rule-control` |
| `--destructive` | `refused-text` |
| `--sidebar` | `card` (rail on the paper background) |
| `--radius` | `0.75rem` (the control radius) |

Operate screens are dense and flat: paper background, hairline rules, controls flat inside panels; the daylight shadow is kept for the few panels that rest on a surface (dialogs, popovers), and the wood ground is not used behind working data. The `.dark` block and `--chart-*` scale have no Tendly equivalent yet; do not ship a dark theme or charts until they are designed.

## Do's and Don'ts

### Do:
- **Do** rest paper panels on the oak with the lower-left daylight shadow (`-40px 38px 14px rgb(74 50 28 / 0.24)` plus a faint contact shadow).
- **Do** keep one filled ink pill per decision; pair it with the quiet outlined pill or a text link.
- **Do** use tan only for what is selected, and pair a tan fill with a second cue (an ink border or ring, as selected days, slots and rows do, and the chosen value echoed in the action label, as "Book 10:30" does).
- **Do** set times, dates, durations and prices in tabular figures.
- **Do** label every fictional business, person and booking ("Demo business, fictional") and state test mode where payments appear ("Stripe in test mode").
- **Do** build radio choices as native radios inside a `role="radiogroup"` with a visible label, ink focus outline and an `aria-live="polite"` status line.
- **Do** keep touch targets at 2.75rem or more on phones.
- **Do** make the final state of any narrative animation the default render, and honour `prefers-reduced-motion`.

### Don't:
- **Don't** use pure black, neutral grey or cool shadows; ink and shadows are warm brown.
- **Don't** fill a button with tan or use tan as a call to action.
- **Don't** cast shadows in more than one direction, or use hard zero-blur offset shadows.
- **Don't** add uppercase tracked labels or small "kicker" lines above headings; headings start directly.
- **Don't** put product screenshots in place of working interface; show the real component.
- **Don't** invent customers, testimonials, logos, usage numbers or ratings; figures shown must be real plan limits or measured.
- **Don't** reuse the `--u` comp scaling outside the landing hero; new surfaces use rem and clamp.
- **Don't** put text over photographs other than the even oak, or place the window-lit hero photograph behind working data.
