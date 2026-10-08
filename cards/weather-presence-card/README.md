# Weather & presence card

`custom:weather-presence-card` – a slim block for the top of a climate section.

```
┌──────────────────────────────────────────────────────────────┐
│ (cloud) Cloudy                          [ Home ]  [ Climate › ] │
│         T Real 14.2°C   F Met Office 14.6°C                    │
└──────────────────────────────────────────────────────────────┘
```

- **Weather**: condition with a matching icon and colour (sunny amber, rain
  blue…), your own outdoor sensor's temperature and the weather service's.
  Tap for the forecast; long-press for your own sensor.
- **Presence pill**: teal "Home" while someone is home; grey "Away · 3h" when
  not, with how long the house has been empty. That time comes from the
  history, so a Home Assistant restart does not reset it. Tap goes to
  `presence.navigation_path` (or opens the entity).
- **Link pill**: a plain "go there" pill, e.g. to your climate dashboard.
- On narrow cards (phones) the two pills stack on the right.

## Configuration

Everything can be set in the visual editor.

```yaml
type: custom:weather-presence-card
weather: weather.met_office_earls_court
temperature: sensor.outdoors_temperature_and_humidity_sensor_temperature
temperature_name: Real
weather_name: Met Office
presence:
  entity: input_boolean.home_master
  navigation_path: /lovelace/security
link:
  name: Climate
  icon: mdi:home-thermometer
  navigation_path: /lovelace/climate
```

| Option | What it is |
|---|---|
| `weather` | Weather entity (condition and its temperature). |
| `temperature`, `temperature_name` | Your outdoor sensor and its label (default `Real`). |
| `weather_name` | Label for the weather service's temperature (default `Forecast`). |
| `presence.entity` | Someone home: `input_boolean` / `binary_sensor` on, `person` home, or `zone` count above 0. |
| `presence.navigation_path` | Where tapping the presence pill goes. |
| `link.name`, `link.icon`, `link.navigation_path` | The link pill. Leave `link` out to hide it. |
