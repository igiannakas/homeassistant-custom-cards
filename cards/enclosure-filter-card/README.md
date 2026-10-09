# Enclosure filter card

`custom:enclosure-filter-card` – a printer enclosure's filter and vent (e.g. a
StealthMax).

```
┌──────────────────────────────────────────────────────┐
│ (filter) StealthMax                       VOC 312 → 96 │
│ Vent [ Closed | 25 | 50 | 75 | Open ]                    │
│ ┌──────────────────────┐   ┌──────────────────────┐      │
│ │ Intake               │ → │ Exhaust              │      │
│ │ 31.2° 29% VOC 312    │   │ 30.1° 30% VOC 96     │      │
│ └──────────────────────┘   └──────────────────────┘      │
│ VOC delta 216                                            │
└──────────────────────────────────────────────────────┘
```

- **Vent**: the numeric options of the select as segments (`0` reads Closed,
  `100` Open). Tap one to move the vent. A non-numeric state (e.g. Manual) lights
  no segment and shows in the label row.
- **Intake → exhaust**: temperature, humidity and VOC index, VOC coloured by the
  same tiers as the air quality card (150 / 250 / 400).
- **Extra line**: any other readings, e.g. the VOC delta or calibration values.
- Tap a side for its VOC sensor (or temperature).

## Configuration

```yaml
type: custom:enclosure-filter-card
title: StealthMax
vent: select.stealthmax_vent_position_0_closed_100_open
intake:
  temperature: sensor.stealthmax_intake_temperature
  humidity: sensor.stealthmax_intake_humidity
  voc: sensor.stealthmax_intake_voc
exhaust:
  temperature: sensor.stealthmax_exhaust_temperature
  humidity: sensor.stealthmax_exhaust_humidity
  voc: sensor.stealthmax_exhaust_voc
details:
  - entity: sensor.stealthmax_voc_delta
    name: VOC delta
```

| Option | What it is |
|---|---|
| `title` | Label row title. Default `Filter`. |
| `vent` | A `select` / `input_select` whose options are positions. |
| `intake`, `exhaust` | `temperature`, `humidity`, `voc` sensors; any can be left out. |
| `intake_name`, `exhaust_name` | Side titles. Default Intake / Exhaust. |
| `details` | List of `{entity, name}` (or entity ids), shown as one small line. |
