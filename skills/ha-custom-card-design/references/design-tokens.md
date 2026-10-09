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

- Card padding: 6–8px. Gap between tiles: 6px.
- **Label row:** `min-height: 28px; padding: 2px 6px 6px`, 18px icon in the card's
  colour, title, `margin-left: auto` summary. A header switch (All lights, Summer) is 40×24
  with a 20px knob and lives in the label row, so every card's header looks the same.
- **Icon shape:** 36×36 circle, 24px icon (`--mdc-icon-size: 24px`).
- **Tile:** radius 10, padding 8–10, a 36px shape and text block with a 10px gap.
  `grid-auto-rows: 1fr` keeps rows level.
- **Pill:** height 36, radius 18, padding `0 14px 0 10px`, 18px icon. On phones (container
  ≤ 440px) use 44px high and full-width grid cells. A **split pill** puts two buttons in
  one rounded box with a 1px divider in `color-mix(currentColor 25%, transparent)`.
- **Segmented selector:** a track with 3px padding, radius 12. Segments are 32px high
  with radius 9, and the selected one has the card background plus
  `box-shadow: 0 1px 3px rgba(0,0,0,.15)`.
- **Action buttons:** height 44, radius 22, 13px / 600, 18px icon. Use orange icons for
  destructive actions.
- **Progress / power bar:** 4px (8px for a job progress bar), radius half the height,
  track `rgba(primary-text-rgb, .08)`.
- **Switch (in sheets):** 44×26 track, 20px knob, coloured when on.

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
