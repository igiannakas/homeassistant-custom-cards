# Design tokens

These are the exact values used across the cards so they sit next to Mushroom, tile
and Bubble Card without looking foreign. Copy them; don't eyeball them.

## Colours

Use HA's theme variables with fallbacks, so dark mode and custom themes just work:

```js
const C = {
  grey:   "var(--grey-color, #9e9e9e)",
  teal:   "var(--teal-color, #009688)",   // presence, home, MMU, filters
  orange: "var(--orange-color, #ff9800)", // lights, heat, power
  amber:  "var(--amber-color, #ffc107)",  // warnings, summer mode
  green:  "var(--green-color, #4caf50)",  // good / dry / excellent
  red:    "var(--red-color, #f44336)",    // alarm, ventilate, error
  blue:   "var(--blue-color, #2196f3)",   // printing / in progress
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
| Pill that is "on" | `tint(colour, 18)` background, `text(colour, 70)` label |
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
| Label-row summary (right) | 12px / 500 / .4px | secondary text |
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
  with `position: relative; top: 1px` (a 20px line box reads ~1px high next to an icon),
  `margin-left: auto` summary. A header switch (All lights, Summer) is 40×24 with a 20px
  knob and lives in the label row, so every card's header looks the same.
- **Icon shape:** 36×36 circle, 24px icon (`--mdc-icon-size: 24px`). **Anything tappable gets it**,
  header icons included (e.g. an `icon_tap_action` that opens a view): background
  `color-mix(in srgb, currentColor 20%, transparent)` so the circle follows the icon's live colour,
  `border-radius: 50%`, `cursor: pointer`, `role="button"`, `tabindex="0"`, Enter/Space to activate.
  Decorative icons stay bare – the circle is the tap signal.
- **Tile:** radius 10, padding 8–10, a 36px shape and text block with a 10px gap.
  `grid-auto-rows: 1fr` keeps rows level.
- **Pills:** see *Size tiers* below – primary 36 (the icon circle), secondary 30.
- **Segmented selector:** a track with 3px padding, radius 12. Segments are 32px high
  with radius 9, and the selected one has the card background plus
  `box-shadow: 0 1px 3px rgba(0,0,0,.15)`.
- **Action buttons** (card-bottom actions) are primary pills: 36, radius 18, 13px / 600, 18px
  icon. Use orange icons for destructive actions.
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
  room is occupied, and "Xm" since the last presence is aligned with the room name.
  "Lights on, no presence" gets flagged after a short delay (2 min).
- Heating mode tiles: the active mode glows in its own colour.
- Air quality: Excellent (leaf, green) → Elevated (info, amber) → Poor (alert, orange)
  → Ventilate (open window, red glow).
- Printer: off grey, ready grey, printing blue, paused amber, complete green, error red.
