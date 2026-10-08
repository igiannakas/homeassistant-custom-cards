# Air quality card

`custom:air-quality-card` – every room's air in one card.

```
┌──────────────────────────────────────────────────────────┐
│ (leaf) Air quality                     Ventilate Living Room │
│ ┌──────────────────────────┐ ┌──────────────────────────┐ │
│ │ (window) Living Room     │ │ (leaf) Study             │ │
│ │ Ventilate CO2 1240 ppm   │ │ Excellent CO2 612 ppm    │ │
│ │ PM 5.0  VOC 166          │ │ PM 1.1  VOC 96           │ │
│ └──────────────────────────┘ └──────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- **Label row**: the house in a few words – "All excellent", "2 rooms elevated",
  "Poor in Second Bedroom" or "Ventilate Living Room".
- **Room tile**: status in its colour (Excellent / Elevated / Poor / Ventilate),
  then CO₂, PM2.5 and VOC – always shown. PM1, PM4, PM10 and NOx appear only
  while they are the cause. Out-of-range readings take their level's colour.
- Icons and colours: leaf green, info amber, alert orange; at the top level an
  open window in red when CO₂, VOC or NOx are the cause ("Ventilate"), or an
  alert in red for particles ("Poor air").
- A room at the top level **glows red**.
- Tap a room for its own dashboard (`navigation_path`), otherwise its CO₂ sensor.
- Tiles all have the same height; on a phone the readings wrap to a second line.

## Configuration

```yaml
type: custom:air-quality-card
title: Air quality
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
| `columns` | Tiles per row, default 2. |
| `rooms[].name` | Shown on the tile. |
| `rooms[].prefix` | The card finds `<prefix>co2`, `pm1`, `pm2_5`, `pm4`, `pm10`, `voc_index`, `nox_index` (e.g. Sensirion SEN6x sensors in ESPHome). |
| `rooms[].co2`, `pm2_5`, `voc`, `pm1`, `pm4`, `pm10`, `nox` | Individual sensors; they win over the prefix. |
| `rooms[].navigation_path` | Where a tap goes. |
| `thresholds` | Override any pollutant's `[elevated, poor, ventilate]` limits; `null` skips a level. |

Default thresholds:

| Pollutant | Elevated | Poor | Top level |
|---|---|---|---|
| CO₂ (ppm) | 800 | – | 1000 |
| PM1, PM2.5 (µg/m³) | 12 | – | 36 |
| PM4, PM10 (µg/m³) | 17 | – | 51 |
| VOC index | 150 | 250 | 400 |
| NOx index | 20 | 150 | 300 |
