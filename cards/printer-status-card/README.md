# Printer status card

`custom:printer-status-card` – a Klipper / Moonraker printer at a glance.

```
┌──────────────────────────────────────────────────────┐
│ (nozzle) Voron · Printing               (plug) On | 142 W │
│          bracket_v3.gcode                                   │
│ ┌──────┐ 62%  1h 23m left · done 15:42                      │
│ │ img  │ ███████████████░░░░░░░░░                           │
│ └──────┘ Layer 141 / 230 · 12.3 m filament                  │
│          250 mm/s                                           │
│ ┌──────────────────── camera card ─────────────────────┐   │
│ └───────────────────────────────────────────────────────┘   │
│ (  Pause  )                      (  Cancel  )               │
└──────────────────────────────────────────────────────┘
```

- **Header**: state in its colour (Off, Ready, Printing, Paused, Complete,
  Cancelled, Error) and the printer's message – or the file name during a job.
- **Power pill**: shown only while the plug is on, with its live watts. Tap On to cut
  the plug: it asks first, and warns in red while a print is running. Tap the watts for
  the power sensor. When the plug is off the pill goes away and the Power on button
  below takes its place.
- **Job**: thumbnail, progress, time left and finish time, layer, filament used and
  speed. Stays up after the print as "Done" / "Cancelled".
- **Idle**: energy used today, prints, hours printed and kilometres of filament.
- **Camera**: any card you like (e.g. Frigate card), shown inside this one – only while there is
  a picture: the printer must be reachable (plug on and Moonraker's printer state not
  unavailable) and the camera must actually serve an image. The card asks Home Assistant for a
  small still of the camera (`/api/camera_proxy/…`) every 15 s while hidden and every 60 s while
  shown; an error hides the camera card, so it never sits there trying to connect.
- **Buttons** follow the state: Pause + Cancel while printing, Resume + Cancel when
  paused, Home + Power off when idle, Power on when the plug is off. Home, Cancel, Power off and Power on ask first. There
  is no emergency stop on purpose.
- **Chamber light** (optional, `light`): an extra button that glows while the light is
  on and shows its level when dimmed ("Light 25%"). A tap toggles it at once. For a
  Klipper output pin (a 0–100 `number`), on returns to the last level it had, or to
  `light_on` (default full). Hold the button for the light's more-info.
- **Tap any value** (progress, time left, finish time, layer, filament, speed,
  today's energy, totals, the state) for its own more-info.

## Configuration

```yaml
type: custom:printer-status-card
name: Voron
prefix: voron
power_switch: switch.voron
power_sensor: sensor.tasmota_energy_power_2
energy_today: sensor.tasmota_energy_today_2
power_off_script: script.power_off_3d_printer
light: number.voron_output_pin_chamber_leds
camera_card:
  type: custom:frigate-card
  cameras:
    - camera_entity: camera.voron_camera
```

| Option | What it is |
|---|---|
| `prefix` | **Required.** The Moonraker integration prefix. The card reads `sensor.<prefix>_current_print_state`, `_printer_state`, `_printer_message`, `_current_display_message`, `_filename`, `_progress`, `_print_time_left`, `_print_eta`, `_current_layer`, `_total_layer`, `_filament_used`, `_print_speed`, `_totals_jobs`, `_totals_print_time`, `_totals_filament_used`, and presses `button.<prefix>_pause_print`, `_resume_print`, `_cancel_print`, `_home_all_axes`. |
| `name` | Shown in the header. Default `Printer`. |
| `power_switch` | The printer's smart plug (`switch` or `input_boolean`). Without it there is no pill and the printer counts as powered. |
| `power_sensor` | Live watts for the pill. |
| `energy_today` | kWh today, shown when idle. |
| `power_off_script` | A `script` or `button` that shuts the printer down safely and then cuts the plug. Without it there is no Power off button. |
| `light` | Chamber light: a `light`, `switch`, `input_boolean`, or a 0–100 `number` / `input_number` (e.g. Moonraker's `number.<prefix>_output_pin_chamber_leds`). Hidden while unavailable. |
| `light_name` | Button label. Default `Light`. |
| `light_on` | For a number: the level "on" sets when the card hasn't seen an earlier level. Default the maximum (100). |
| `camera_card` | Any card config, rendered inside the card. |
| `camera_entity` | Camera to test for a picture. Default: taken from `camera_card` (`cameras[0].camera_entity`, `camera_entity` or `entity`). |
| `thumbnail` | Camera entity with the job thumbnail. Default `camera.<prefix>_thumbnail`. |
