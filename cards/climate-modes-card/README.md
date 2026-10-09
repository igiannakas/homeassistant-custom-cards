# Climate modes card

`custom:climate-modes-card` – whole-house mode shortcuts in one card.

```
┌──────────────────────────────────────────────────────┐
│ (radiator) Heating                    All rooms · Off │
│ [ Off ]  [ Away ]  [ Night ]  [ Day ]  [ Boost ]       │
└──────────────────────────────────────────────────────┘
```

- A label row (icon, title) with what the rooms are on – "All rooms · Night",
  or "Mixed" when they differ – and optionally a switch next to it (e.g.
  summer mode, or an automatic aircon automation). The switch toggles, or runs
  `switch_tap_action` instead – e.g. a confirmation pop-up.
- A tile per mode. The active one glows in its own colour.
- A mode is active when **all** `thermostats` share its `preset`, or when its
  own `active.entity` is in `active.state` (handy for an aircon speed helper).
- Tapping a tile runs its `tap_action`: `perform-action` (scripts, services),
  `navigate` (e.g. `#away-all` to open a confirmation pop-up), `more-info`,
  `toggle`. Errors (e.g. heating locked in summer mode) show as a toast.

## Configuration

```yaml
type: custom:climate-modes-card
title: Heating
icon: mdi:radiator
icon_color: orange
thermostats:
  - climate.living_room_thermostat
  - climate.master_bedroom_thermostat
  - climate.second_bedroom_thermostat
  - climate.study_thermostat
modes:
  - name: "Off"
    icon: mdi:radiator-off
    color: cyan
    preset: frost_protection
    tap_action: { action: perform-action, perform_action: script.heating_mode_frost_protection }
  - name: Away
    icon: mdi:home-export-outline
    color: blue
    preset: away
    tap_action: { action: navigate, navigation_path: "#away-all" }
switch: input_boolean.heating_summer_mode
switch_name: Summer
switch_color: amber
switch_tap_action: { action: navigate, navigation_path: "#summer-mode" }
```

Cooling example (entity + state modes and a switch in the label row):

```yaml
type: custom:climate-modes-card
title: Cooling
icon: mdi:snowflake
icon_color: blue
switch: automation.85_turn_on_aircon_when_hot
modes:
  - name: "Off"
    icon: mdi:snowflake-off
    active: { entity: input_number.aircon_state, state: ["0", "0.0"] }
    tap_action: { action: perform-action, perform_action: script.aircon_off }
```

| Option | What it is |
|---|---|
| `title`, `icon`, `icon_color` | Label row. Colours are Home Assistant colour names (`orange`, `cyan`, …) or any CSS colour. |
| `thermostats` | Climate entities whose shared preset picks the active mode. |
| `switch`, `switch_name`, `switch_color` | Optional switch in the label row, after the status. |
| `switch_tap_action` | What tapping the switch does instead of toggling, e.g. `{ action: navigate, navigation_path: "#summer-mode" }`. |
| `modes[].name`, `icon`, `color` | The tile. |
| `modes[].preset` | Active when every thermostat has this preset. |
| `modes[].active` | `{ entity, state }` – active when the entity is in that state (one value or a list). |
| `modes[].tap_action` | What a tap does (see above). |

In the visual editor the modes are edited as YAML.
