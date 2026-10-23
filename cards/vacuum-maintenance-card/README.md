# Vacuum maintenance card

`custom:vacuum-maintenance-card` – a robot vacuum's dock water tanks, then its consumables.

```
┌──────────────────────────────────────────────────────┐
│ (wrench) Dock & maintenance                            │
│          Next: dock brush in 13 h                      │
│ ┌────────────────────────┐ ┌────────────────────────┐ │
│ │ (tank) Clean water     │ │ (tank) Dirty water     │ │
│ │        OK              │ │        OK              │ │
│ └────────────────────────┘ └────────────────────────┘ │
│ ┌──────────────────────────────────────────────────┐ │
│ │ (bin)  Auto-empty                                │ │
│ │        Max                                       │ │
│ └──────────────────────────────────────────────────┘ │
│     97%     │     96%      │     94%                   │
│  Main brush │  Side brush  │   Filter                  │
│     71%     │     13 h     │     27 h                  │
│   Sensors   │  Dock brush  │ Dock strainer             │
└──────────────────────────────────────────────────────┘
```

- **Water tanks** come first: Clean water and Dirty water as tiles with a tank glyph in a
  circle – a drop for clean water (blue), a speckled drop for dirty water (brown). A tank that
  needs you glows red and says what to do: "Empty – refill it", "Full – empty it". The glyph
  never shows a level: the dock only reports OK / empty / full. Tap a tank for its more-info.
  A tank also reads empty / full when the dock's error says so (`water_empty`,
  `waste_water_tank_full`): Roborock reports the tank flag and the dock error separately, and
  the robot can raise the error while the flag stays clear. The tile then opens the dock error.
- **Numbers**: main brush, side brush, filter and sensors as the share of life left (from
  the hours left and each part's life); the dock's brush and strainer in hours, as their life
  isn't known (set `lives` to see them as %). Amber under `due_soon` hours, **Now** in red at
  zero.
- **Next** (under the title, on the title's line and wrapping there): the part with the fewest
  hours left, or "Sensors: due now". Tap it for that part.
- **Tap a number** for a sheet: hours left, the %, about how many cleans that is at your
  average clean (total cleaning time ÷ cleans), and the part's life. **Reset after replacing**
  asks first ("Reset main brush? Only after fitting a new one…") and then presses the
  integration's reset button. The sensors, the dock brush and the dock strainer are cleaned,
  not replaced, so theirs reads **Reset after cleaning** ("Only after cleaning them…").
  **History** opens the sensor's more-info.
- **Auto-empty**: the dock's auto-empty mode as a full-width tile under the tanks, its icon and
  text on the same lines as theirs. Tap it for its more-info.
- Text is never cut off: a label too long for its place wraps.

The dock's own jobs (Empty, Wash mop, Dry mop) are on the [Robot vacuum](../robot-vacuum-card/README.md)
card, shown while the robot is docked.

Roborock ships its consumable reset buttons disabled: enable them (Settings → Entities, or
the device page) for Reset to appear.

## Configuration

```yaml
type: custom:vacuum-maintenance-card
entity: vacuum.vacuum_cleaner
```

| Option | Default | |
|---|---|---|
| `entity` | – | The vacuum. Sensors and reset buttons are found from its device and its dock device. |
| `title` | Dock & maintenance | "Maintenance" with `hide_dock`. |
| `due_soon` | 10 | Hours left below which a part shows in amber. |
| `lives` | main_brush 300, side_brush 200, filter 150, sensor 30 | Hours of cleaning per part. Add `dock_brush` / `strainer` to show them as %. |
| `hide` | – | Parts to leave out: `main_brush`, `side_brush`, `filter`, `sensor`, `dock_brush`, `strainer`. |
| `hide_dock` | false | Leave the water tanks and the Auto-empty tile out. |
| `entities` | found | Override a part's sensor (`main_brush`, …) or its reset button (`reset_main_brush`, …), or `total_time`, `total_count`, `clean_box`, `dirty_box`, `dock_error`, `empty_mode`. |
