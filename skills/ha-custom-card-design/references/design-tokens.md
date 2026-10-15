# Design tokens

These are the exact values used across the cards so they sit next to Mushroom, tile
and Bubble Card without looking foreign. Copy them; don't eyeball them.

## Colours

**The convention: a colour is a meaning, and each meaning has one colour** – the same on every
card, built on Home Assistant's own colours. Colour a control by what it *means*, never to
decorate it (decided 14 Oct 2026):

| Colour | Means | Examples |
|---|---|---|
| Teal | **You can tap or pick this** – the accent for anything interactive that has no state colour of its own | The energy card's circle, a link pill's icon, the Cleaning mode tile, rooms picked for the next clean, current values in a sheet, a toggle that's on, Auto clean when away |
| Blue | **Something running**, and the button that starts it | Cleaning / Returning, printing, Clean + Resume (filled), a dock job while it runs, the room the robot is cleaning; cooling (literally cold) |
| Green | **Good, and someone home** (Home Assistant colours a person at home green) | Battery above 30%, VOC under 150, dry filament, a room or the house occupied, the Home pill |
| Amber | **Early warning** – needs attention soon | Paused, a part due soon, battery ≤ 30%, VOC 150+, mop not attached |
| Orange | **Lights, heat and power – and the step before red on a scale** | A lit room, heating, a plug / watts, the printer's power, an appliance that is on; Poor air, VOC 250+, wet filament, presence lost within the hour |
| Red | **A call for attention** | An error, a tank to empty, a part due now, battery ≤ 15%, door open, alarm armed, house empty for over an hour, heating on while away |
| Grey | **Off, idle or neutral** – and every purely decorative icon | Docked, Idle, a part that's fine, a header icon that isn't tappable and shows no state |

- **Confirmations** take the colour of the control that opened it – its "on" colour, both ways
  (teal Auto clean pill → teal dialog to turn it on or off; orange power pill → orange dialog).
  Red only when the action would throw away something running (cutting a printer's power
  mid-print). Otherwise a warning goes in the words ("This ends the current clean").
- **Literal colours** are the exception: clean water blue, dirty water brown, weather icons.
- Tinted circle = tap target: `tint(colour, 20)` behind a full-colour icon. **A tap target is
  never grey**: a circle whose state colour would be grey (cloudy weather, heating idle or
  locked) is teal. A device that is off (a room with its lights off, a docked robot, an appliance
  switched off) keeps its grey – that grey is its state. An appliance that is on (dehumidifier,
  purifier, dryer) is orange – power – like a lit room. A plain (untinted) icon is decoration and stays grey unless it
  shows a state.
- Room tiles keep the compact presence time beside the name ("12m", "3h", "2d"); everywhere
  else durations use the spaced form.

Use HA's theme variables with fallbacks, so dark mode and custom themes just work:

```js
const C = {
  grey:   "var(--grey-color, #9e9e9e)",   // off, idle, decorative
  teal:   "var(--teal-color, #009688)",   // you can tap / pick this
  blue:   "var(--blue-color, #2196f3)",   // running, and the button that starts it
  green:  "var(--green-color, #4caf50)",  // good, someone home
  amber:  "var(--amber-color, #ffc107)",  // early warning
  orange: "var(--orange-color, #ff9800)", // lights, heat, power; the step before red
  red:    "var(--red-color, #f44336)",    // a call for attention
};
const tint = (c, p) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
// Readable coloured text – mix toward the text colour, never the raw colour on white.
const text = (c, p = 75) => `color-mix(in srgb, ${c} ${p}%, var(--primary-text-color))`;
```

| Use | Value |
|---|---|
| Icon shape background | `tint(colour, 20)`, grey when inactive |
| Active tile glow (lit, heating, alarm) | `tint(colour, 10)` |
| Neutral tile background | `rgba(var(--rgb-primary-text-color, 33,33,33), .04)` |
| Neutral pill / segment track | `rgba(var(--rgb-primary-text-color, 33,33,33), .05)` |
| Pill that is "on" | `tint(colour, 18)` background, `text(colour, 70)` label – on every card |
| Press feedback | `:active { filter: brightness(.92); }` – on every card |
| Small reading icons | `color-mix(in srgb, var(--secondary-text-color) 55%, transparent)` |
| Coloured status text | amber 70%, green 75%, orange 80%, red 85% toward text colour |

Tiers used for readings, so the same number gets the same colour everywhere:

- **VOC index (Sensirion):** under 150 is green, 150 or more amber, 250 or more orange,
  400 or more red.
- **Filament humidity:** under 20% is dry (green), 20–40% medium (amber), over 40% wet
  (orange).
- **CO₂:** 800 ppm is elevated, 1000 ppm means ventilate (red glow).

## Type

| Element | Size / weight / tracking | Colour |
|---|---|---|
| Item name (room, lane, heater) | 14px / 500 / .1px, line 20px | primary text |
| Reading, status, secondary line | 12px / 400 / .4px, line 16px | secondary text |
| Bold value inside a reading line | 14px / 500 | primary text |
| Label-row title (every card header) | 14px / 500 / .1px | primary text |
| Label-row summary (under the title) | 12px / 400 / .4px, line 16px | secondary text |
| Mode tile / segment label | 12px / 500 | primary or secondary |
| Pill text | 13px / 600 / .2px | state colour or secondary |
| Big number (progress %) | 20px / 600 | primary text |
| Dialog title / row text | 20px / 600 and 16px / 600 | primary text |

Everything inherits `var(--ha-font-family-body, Roboto, sans-serif)`.

## Shapes and spacing

- **Content edge = 10px, like Mushroom** (measured: Mushroom and Tado shapes sit 10px inside the
  card). Card padding 10px (single-block cards 12px 10px); everything inside – header icons,
  tile edges, pills, switches – starts and ends on that edge. Gap between tiles 8px; tile
  padding 11px 10px (8px horizontal when narrow).
- **Label row:** `min-height: 40px; padding: 0 0 8px; gap: 10px` inside the 10px card padding.
  The icon is Mushroom-sized: a 36px slot on the content edge (`flex: 0 0 36px`, centred) holding
  a 24px glyph – plain in the card's colour, or a filled circle only when tappable (All lights).
  Every glyph on the page then sits at the same x as Mushroom's (content edge + 6px) and every
  title starts at content edge + 46px (36px shape + 10px gap – measured on Mushroom entity and
  template cards; an 8px gap left titles 2px short of the Mushroom card above). (Tried an 18px icon flush left and an 18px icon centred:
  both read as misaligned next to Mushroom icons.) Verify by measuring the svg rects, not the
  host elements. Title 14px / 500
  with `position: relative; top: 1px` (a 20px line box reads ~1px high next to an icon) when it
  is alone; with a summary the two lines sit under each other (`.lt` = title + `.s`), the summary
  ink-aligned and free to wrap. A header switch (All lights, Summer) is 40×24 with a 20px
  knob and lives in the label row, so every card's header looks the same.
- **Icon shape:** 36×36 circle, 24px icon (`--mdc-icon-size: 24px`). **Anything tappable gets it**,
  header icons included (e.g. an `icon_tap_action` that opens a view): background
  `color-mix(in srgb, currentColor 20%, transparent)` so the circle follows the icon's live colour,
  `border-radius: 50%`, `cursor: pointer`, `role="button"`, `tabindex="0"`, Enter/Space to activate.
  Decorative icons stay bare – the circle is the tap signal.
- **Tile:** radius 10, padding 11px 10px, a 36px shape and text block with a 10px gap.
  `grid-auto-rows: 1fr` keeps rows level.
- **Pills:** see *Size tiers* below – primary 36 (the icon circle), secondary 30.
- **Segmented selector:** a track with 3px padding, radius 12. Segments are 32px high
  with radius 9, and the selected one has the card background plus
  `box-shadow: 0 1px 3px rgba(0,0,0,.15)`.
- **Action buttons** (card-bottom actions) are primary pills: 36, radius 18, 13px / 600, 18px
  icon, or call-to-action pills (44) when they are the card's main job. Their icons take the
  colour of what they control (orange for power, blue for start); see *Colours* for dialogs.
- **Progress / power bar:** 4px (8px for a job progress bar), radius half the height,
  track `rgba(primary-text-rgb, .08)`.
- **Switch (in sheets):** 44×26 track, 20px knob, coloured when on.
- **Two-line label row** (title + a status line under it): a grid `36px | 1fr | auto` with areas
  `"icon title sw" "icon status sw"`, `row-gap: 0`; icon and switch are centred on both lines.

## Size tiers: icons, pills and tap targets

Every control on a card is one of these sizes. Nothing in between, and no phone-only
enlargements: on a phone a tap gets easier through width (stacked pills become full-width grid
cells) and 8px gaps, never through extra height.

| Tier | Height | Radius | Icon | Text | Use for |
|---|---|---|---|---|---|
| **Icon circle** (shape) | 36 | 50% | 24px glyph | – | A row's anchor: room, weather, presence, a tappable header icon. |
| **Call to action** | 44 | 22 | 20px | 14px / 600 / .2px | The card's main job, when the card exists to start it (the robot vacuum's Clean / Auto clean / Pause / Dock). One row per card, at the bottom, equal widths. Padding `0 10px`, gap 8. The one that starts the job (Clean, Resume) is filled with its colour, text and icon `var(--text-primary-color, #fff)` – a fill means "do this", a tint means "on". |
| **Primary pill** | 36 – the icon circle's height | 18 | 18px | 13px / 600 / .2px | A row's main action, link or state: presence, links to other dashboards, power / plug, watts, card-bottom actions (Power on, Light). Padding `0 14px 0 10px`. |
| **Secondary pill / chip** | 30 | 15 | 16px | 12px / 500–600 | State chips (Armed), quick toggles in a grid (Door, TV, A/C), message rows (`min-height: 30px`). |
| Switch | 40×24 in a label row, 44×26 in sheets | 12 / 13 | – | – | On/off of a whole card or group. |
| Segment | 32 in a 38px track (3px padding) | 9 / 12 | – | 12px | Segmented selectors. |
| Dialog / sheet row | 56 | 28 | 36px circle | 16px / 600 | Bubble-style pop-up rows. |
| **Footer action** | 36 (row: 1px rule + 4px padding) | 8 | 16px | 12px / 500, secondary colour, no fill | Secondary actions under the card's main ones (the dock's Empty / Wash mop / Dry mop): full-bleed rule above (`margin: 0 -10px -10px`), equal cells split by short 1px dividers (10px inset top and bottom). |

- A primary pill equals the icon circle, so in a row its top and bottom edges line up with the
  circle exactly. One row uses one pill tier.
- A **split pill** puts two buttons in one rounded box with a 1px divider in
  `color-mix(currentColor 25%, transparent)`; it keeps its tier's height.
- Pills stay beside the row's content whenever they fit (secondary text may wrap first) and
  move to a row of full-width cells below only when they don't – decided by measuring natural
  widths (ResizeObserver), not by counting pills or by a breakpoint.

## Alignment (measured on every change)

- **One centre line per row:** the icon circle, the text block (title + its secondary lines,
  wrapped in one element) and the trailing controls (pills, chips, switches) share one centre.
  Lay a row out as `[circle] [text block] [controls]` with `align-items: center`. Never pin the
  icon to the top, and never put a control on only one line of a multi-line text block.
- **Icons are centred by flex, never by a text line.** Every card's CSS starts with
  `ha-icon { display: inline-flex; align-items: center; justify-content: center; }` (plus
  `ha-icon[hidden] { display: none; }`). As a plain block, ha-icon lays its glyph out on a
  line of the parent's line-height and the glyph sits 0.4–3px low – it was 2px under the
  weather card's readings and 3px on its pill chevron.
- Small reading icons (14px) sit centred on their own line of text.
- **Subtext starts on the title's vertical line, measured on ink.** Every line of a text block –
  readings, status, values – starts where the title's first letter starts, judged by what is drawn,
  not by boxes. A reading icon's glyph has its own side bearing inside its 14px box (thermometer
  4px, water drop 3.5px) and so does a leading "1"; aligned boxes left the thermometer 3px right of
  the title. Every card with text blocks includes the shared `inkAlign` helper: it gives each
  `.v > ha-icon` the margin `title bearing − glyph bearing` (glyph bearing from the SVG bbox, title
  bearing from canvas text metrics) and each text-led line the same for its first character. It is
  position-independent, so wrapping can't break it, and runs once per frame after a render
  (`inkSchedule(this, ".txt")` at the top of `_render`), retrying while icons load.
- **Check:** the icon audit (every ha-icon's svg centre against its own box, all cards, must be
  under 0.3px), the row check (circle, text-block and control centres equal), the ink check
  (each subtext line's first ink against the title's first letter, under 0.3px – glyph bboxes for
  icons, Range rect + canvas `actualBoundingBoxLeft` for letters), and a pixel check of a
  phone-width screenshot (count faint anti-aliased pixels; ink edges in the same pixel column).
  Report the numbers.

## Text and formats

- **Text is never cut off.** No `text-overflow: ellipsis`, no `overflow: hidden` on a label, no
  fixed height on anything with text. A short label (a name) never wraps inside a pill either.
- **Grids of names are fitted to the names:** measure each name's natural width and set the
  columns – even columns as wide as the longest while two fit; else two columns each as wide as
  its own longest; else one (`_fitRooms` on the robot vacuum card). Re-fit on resize and font load.
- **Rows of buttons:** `display: flex; flex-wrap: wrap; gap: 8px` with each button
  `flex: 1 1 0; min-width: max-content` – equal while they fit, a longer label takes what it
  needs, wrap as a last resort.
- **Status lines** wrap only between their parts: each part a `white-space: nowrap` span,
  joined with `&nbsp;· ` so the dot stays with the part before it.
- **A card's summary goes under its title** (two-line label row, ink-aligned, free to wrap),
  never squeezed onto the right of the title row.
- **Taps:** when a card or tile links to a dedicated dashboard that has every detail (a room's
  air quality, Energy), the whole card or tile is one tap target that goes there – no per-value
  dialogs. Otherwise every value is its own tap target (more-info of its own sensor).
- **Formats:** durations `45 min`, `3 h`, `1 h 23 min`, `2 d` (a space, short units); readings
  `21.4°` (no C), `48%`, `612 ppm`, PM values bare (always µg/m³, the PM label says so), `1,204 kWh` (`toLocaleString`), times `14:05`
  (en-GB); unknown or unavailable `–`; every reading keeps its unit.
- **Money:** under a pound in pence – `7p`, `0p`, under a penny one decimal `0.5p` – and from a pound
  up as money, `£1.23` (from 99.5p it is `£1.00`, never `100p`). Running costs the same with `/h`
  (`15p/h`, `0.2p/h`, `£1.20/h`). Euros and dollars use cents the same way; other currencies are
  always money. Every card and every dashboard chart label follows it.
- **Errors:** HA's own message when there is one, else "Couldn't <what you tried>." with the
  friendly name – never an entity id. An integration's generic failure that names an internal
  command (Roborock's `command_failed`, "Error while calling load_multi_map") reads
  "Couldn't <what you tried>: the robot didn't accept it." One message per failure: call with
  `notifyOnError` off (`callService(domain, service, data, undefined, false)`) so Home Assistant's
  own toast doesn't show first.
- Text sizes: 20 / 16 / 15 (dialog title / rows / body text), 14 (names, titles, values), 13 (pill
  text), 12 (readings, status, chips), 11 (captions under numbers, legends). Nothing in between.

## Dialogs and sheets (Bubble Card look)

```css
:host { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; }
.backdrop { position: absolute; inset: 0; background: rgba(0,0,0,.32); backdrop-filter: blur(6px); }
.dialog { width: min(400px, calc(100vw - 32px)); padding: 25px 18px 18px; border-radius: 32px;
  background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent);
  backdrop-filter: blur(20px); box-shadow: 0 12px 40px rgba(0,0,0,.25); }
/* title row: 42px glyph circle + 20px/600 title; rows: 56px, radius 28, 36px glyph, 16px/600 */
/* actions sit below a divider: margin-top 20px; padding-top 20px; border-top 1px divider */
/* call to action: filled with the card's colour, white text, glyph rgba(255,255,255,.2) */
```

## States that read well

- Lights: lit room = orange glow. A motion icon (`mdi:motion-sensor`) appears when the
  room is occupied, and "12 min" since the last presence is aligned with the room name.
  "Lights on, no presence" gets flagged after a short delay (2 min).
- Heating mode tiles: the active mode glows in its own colour.
- Air quality: Excellent (leaf, green) → Elevated (info, amber) → Poor (alert, orange)
  → Ventilate (open window, red glow). The words differ by level, not just by colour.
- Presence: someone here (green) → left within the hour (orange) → empty for longer (red on
  a house; grey "12 min ago" on a room).
- Printer: off grey, ready grey, printing blue, paused amber, complete green, error red.
