# Vacuum maintenance card

`custom:vacuum-maintenance-card` – a robot vacuum's consumables in one row of numbers, and its dock.

```
┌──────────────────────────────────────────────────────┐
│ (wrench) Maintenance         Next: dock brush in 13 h  │
│     97%     │     96%      │     94%                   │
│  Main brush │  Side brush  │   Filter                  │
│     71%     │     13 h     │     27 h                  │
│   Sensors   │  Dock brush  │ Dock strainer             │
│ Dock · Clean water OK · Dirty water OK · Auto-empty Max │
│ (  Empty  )   ( Wash mop )   (   Dry   )               │
└──────────────────────────────────────────────────────┘
```

- **Numbers**: main brush, side brush, filter and sensors as the share of life left (from
  the hours left and each part's life); the dock's brush and strainer in hours, as their life
  isn't known (set `lives` to see them as %). Amber under `due_soon` hours, **Now** in red at
  zero.
- **Next** (top right): the part with the fewest hours left, or "Sensors: due now". Tap it for
  that part.
- **Tap a number** for a sheet: hours left, the %, about how many cleans that is at your
  average clean (total cleaning time ÷ cleans), and the part's life. **Reset after replacing**
  asks first ("Reset main brush? Only after fitting a new one…") and then presses the
  integration's reset button. **History** opens the sensor's more-info.
- **Dock line**: clean water and dirty water tanks (in red when a tank needs you) and the
  auto-empty mode, in one quiet line. Tap a part for its more-info.
- **Dock jobs** (while the robot is on the dock): **Empty**, **Wash mop** and **Dry**, for
  the dock's own switches – handy after stopping a clean early with Dock. Each glows blue
  while it runs ("Drying"); each asks before it starts, and before it stops.

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
| `title` | Maintenance | |
| `due_soon` | 10 | Hours left below which a part shows in amber. |
| `lives` | main_brush 300, side_brush 200, filter 150, sensor 30 | Hours of cleaning per part. Add `dock_brush` / `strainer` to show them as %. |
| `hide` | – | Parts to leave out: `main_brush`, `side_brush`, `filter`, `sensor`, `dock_brush`, `strainer`. |
| `hide_dock` | false | Leave the dock line and jobs out. |
| `hide_dock_actions` | false | Leave Empty / Wash mop / Dry out. |
| `entities` | found | Override a part's sensor (`main_brush`, …) or its reset button (`reset_main_brush`, …), or `total_time`, `total_count`, `clean_box`, `dirty_box`, `empty_mode`, `empty_sw`, `wash_sw`, `dry_sw`. |
