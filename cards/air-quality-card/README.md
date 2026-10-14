# Air quality card

`custom:air-quality-card` – every room's air in one card.

<table>
  <tr>
    <td valign="top"><img src="../../docs/screenshots/air-quality-card.png" alt="air-quality-card" width="384"></td>
    <td valign="top"><img src="../../docs/screenshots/air-quality-card-alert.png" alt="When a room needs air (example values)" width="384"><br><sub>When a room needs air (example values)</sub></td>
  </tr>
</table>

- **Label row**: the title, with the house in a few words under it – "All
  excellent", "2 rooms elevated", "Poor in Second Bedroom" or "Ventilate Living
  Room, Study". The summary wraps between room names, never inside one. The icon
  shows the house's level in its colour.
- **Room tile**: status in its colour (Excellent / Elevated / Poor / Ventilate),
  CO₂ (ppm) and VOC, and below them every particle size – PM1, PM2.5, PM4 and
  PM10, each labelled (always µg/m³, so the values go without the unit), four
  across, 2×2 or one per line – whichever fits the tile. NOx
  appears only while it is the cause. Out-of-range readings take their level's
  colour.
- The words differ by level, not just the colour: leaf green "Excellent", info
  amber "Elevated", alert orange "Poor", and at the top level an open window in
  red, "Ventilate", whatever the cause.
- A room at the top level **glows red**.
- **Tap a room** (anywhere on its tile) for its own air quality dashboard
  (`navigation_path`), which has every detail; without one, its CO₂ sensor.
- Two columns (`columns`), on a phone too. Nothing is cut off: a long room name
  wraps, readings wrap between each other, never inside one. Tiles all have the
  same height.
- The status shares a line with CO₂ and VOC only when all of them fit; otherwise
  it has its own line and CO₂ and VOC stay together on the next. When a room's
  name or its CO₂ and VOC would need a second line, every tile takes the tight
  phone spacing (6px sides, 6px icon gap) instead, if that keeps them whole ("CO₂
  526 ppm  VOC 119" on a 430–440px phone), so one room never makes every tile
  taller. The card checks where the text actually lands. Text sizes never change.

## Configuration

Everything can be set in the visual editor (`thresholds` as YAML).

```yaml
type: custom:air-quality-card
title: Air quality
columns: 2
rooms:
  - name: Living Room
    prefix: sensor.living_room_air_quality_
    navigation_path: /lovelace/living-room-air-quality
  - name: Study
    co2: sensor.study_co2
    pm2_5: sensor.study_pm25
    voc: sensor.study_voc_index
```

| Option | What it is |
|---|---|
| `title` | Label row title. Default `Air quality`. |
| `columns` | Tiles per row, default 2 (up to 4). |
| `rooms[].name` | Shown on the tile. |
| `rooms[].prefix` | The card finds `<prefix>co2`, `pm1`, `pm2_5`, `pm4`, `pm10`, `voc_index`, `nox_index` (e.g. Sensirion SEN6x sensors in ESPHome). |
| `rooms[].co2`, `pm2_5`, `voc`, `pm1`, `pm4`, `pm10`, `nox` | Individual sensors; they win over the prefix. |
| `rooms[].navigation_path` | Where a tap on the tile goes. |
| `thresholds` | Override any pollutant's `[elevated, poor, ventilate]` limits; `null` skips a level, e.g. `co2: [1000, null, 1500]`. |

Default thresholds:

| Pollutant | Elevated (amber) | Poor (orange) | Ventilate (red) |
|---|---|---|---|
| CO₂ (ppm) | 800 | – | 1000 |
| PM1, PM2.5 (µg/m³) | 12 | – | 36 |
| PM4, PM10 (µg/m³) | 17 | – | 51 |
| VOC index | 150 | 250 | 400 |
| NOx index | 20 | 150 | 300 |
