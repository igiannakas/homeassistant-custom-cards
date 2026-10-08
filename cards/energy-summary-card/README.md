# Energy summary card

`custom:energy-summary-card` – electricity use and cost in one compact row.

```
┌────────────────────────────────────────────────────────────┐
│ (⚡)  Now      │ Today     │ Yesterday │ October            │
│       616 W    │ 7.99 kWh  │ 9.07 kWh  │ 86.6 kWh           │
│       15p/h    │ £1.89     │ £2.15     │ £20.54             │
└────────────────────────────────────────────────────────────┘
```

- **Now** is the live power and what it costs per hour at that rate.
- **Today, Yesterday and the month so far** come from Home Assistant's
  long-term statistics for the energy sensor (the same numbers as the Energy
  dashboard), refreshed every two minutes.
- Costs use the grid price from **Settings → Energy** unless you set `price`.
  With no price anywhere, the card shows the numbers without costs.
- Tap the card to open the Energy dashboard (or wherever `navigation_path` points).
- On a phone the icon is dropped so the four numbers have room.

## Configuration

Everything can be set in the visual editor.

```yaml
type: custom:energy-summary-card
power: sensor.home_assistant_glow_power_consumption
energy: sensor.home_assistant_glow_daily_energy
navigation_path: /lovelace/energy
```

| Option | What it is |
|---|---|
| `power` | Power sensor (W) for "Now". |
| `energy` | Energy sensor (kWh) with statistics – usually the one in your Energy settings. A daily-resetting meter is fine. |
| `price` | Optional. A number (price per kWh) or a sensor holding the current price. |
| `navigation_path` | Where a tap goes. Without it, a tap opens the power sensor. |
| `icon` | Optional; replaces the lightning icon. |

The currency is your Home Assistant currency (Settings → System → General).
