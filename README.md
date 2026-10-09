# Home Assistant custom cards

Small, self-contained Lovelace cards. Each card is a single JavaScript file with
no build step and no dependencies: the logic and styling live in the card, so
your dashboard config is just a list of entities.

They follow the look of Mushroom and the built-in tile cards (same greys,
colours and icon shapes), and anything that changes something important asks
first in a confirmation dialog.

| Card | What it does |
|---|---|
| [Home status](cards/home-status-card/README.md) | Presence, alarm switch, door, TV, climate and an ePaper message for a home, in one compact card. |
| [Room lights](cards/room-lights-card/README.md) | An "All lights" switch and a tile per room with temperature, humidity and light level; long-press a room for its lamps. |
| [Energy summary](cards/energy-summary-card/README.md) | Power now, today, yesterday and this month, each with its cost, in one compact row. |
| [Weather & presence](cards/weather-presence-card/README.md) | Weather with your own outdoor temperature, a presence pill and a link pill – the top of a climate section. |
| [Climate modes](cards/climate-modes-card/README.md) | Whole-house mode tiles (heating presets, aircon speeds…) with the active one highlighted. |
| [Air quality](cards/air-quality-card/README.md) | Every room's air in one card: status, CO₂ / PM2.5 / VOC, and a red glow when a room needs ventilating. |
| [Printer status](cards/printer-status-card/README.md) | A Klipper / Moonraker printer: state, power plug and watts, current job with thumbnail and time left (or totals), camera, and the buttons for the state. |
| [Printer temperatures](cards/printer-temps-card/README.md) | Heaters with target and power (glowing while heating), other temperatures and fans. |
| [MMU lanes](cards/mmu-lanes-card/README.md) | Happy Hare MMU lanes: loaded or empty, humidity and temperature per lane, drying fans, buffer state. |
| [Enclosure filter](cards/enclosure-filter-card/README.md) | Enclosure filter / vent: vent position selector, intake vs exhaust temperature, humidity and VOC. |

Related: the Tado X room card (`custom:tadox-room-card`) ships with the
[Tado X Proxy integration](https://github.com/igiannakas/ha-tadox-proxy), because it reads
that integration's thermostat attributes.

## Screenshots

Taken from a live dashboard at phone width, light theme. A few show example values (e.g. a print in progress).

<table>
  <tr>
    <td valign="top" width="50%"><a href="cards/home-status-card/README.md"><b>Home status</b></a><br><img src="docs/screenshots/home-status-card.png" alt="Home status" width="384"></td>
    <td valign="top" width="50%"><a href="cards/energy-summary-card/README.md"><b>Energy summary</b></a><br><img src="docs/screenshots/energy-summary-card.png" alt="Energy summary" width="384"></td>
  </tr>
  <tr>
    <td valign="top" width="50%"><a href="cards/room-lights-card/README.md"><b>Room lights</b></a><br><img src="docs/screenshots/room-lights-card.png" alt="Room lights" width="384"></td>
    <td valign="top" width="50%"><a href="cards/weather-presence-card/README.md"><b>Weather & presence</b></a><br><img src="docs/screenshots/weather-presence-card.png" alt="Weather & presence" width="384"></td>
  </tr>
  <tr>
    <td valign="top" width="50%"><a href="cards/climate-modes-card/README.md"><b>Climate modes</b></a><br><img src="docs/screenshots/climate-modes-card.png" alt="Climate modes" width="384"></td>
    <td valign="top" width="50%"><a href="cards/air-quality-card/README.md"><b>Air quality</b></a><br><img src="docs/screenshots/air-quality-card.png" alt="Air quality" width="384"></td>
  </tr>
  <tr>
    <td valign="top" width="50%"><a href="cards/printer-status-card/README.md"><b>Printer status</b></a><br><img src="docs/screenshots/printer-status-card.png" alt="Printer status" width="384"></td>
    <td valign="top" width="50%"><a href="cards/printer-temps-card/README.md"><b>Printer temperatures</b></a><br><img src="docs/screenshots/printer-temps-card.png" alt="Printer temperatures" width="384"></td>
  </tr>
  <tr>
    <td valign="top" width="50%"><a href="cards/mmu-lanes-card/README.md"><b>MMU lanes</b></a><br><img src="docs/screenshots/mmu-lanes-card.png" alt="MMU lanes" width="384"></td>
    <td valign="top" width="50%"><a href="cards/enclosure-filter-card/README.md"><b>Enclosure filter</b></a><br><img src="docs/screenshots/enclosure-filter-card.png" alt="Enclosure filter" width="384"></td>
  </tr>
</table>

## Installing (HACS)

All cards come as one file, `dist/homeassistant-custom-cards.js`.

1. **HACS → ⋮ → Custom repositories**: add
   `https://github.com/igiannakas/homeassistant-custom-cards`, type **Dashboard**.
2. Open **Home Assistant custom cards** in HACS and **Download**. HACS adds the
   dashboard resource (`/hacsfiles/homeassistant-custom-cards/homeassistant-custom-cards.js`)
   for you.
3. Reload the browser tab (or pull down to refresh in the app).

Updates show up in HACS like any other card once new commits are pushed.

Without HACS: copy `dist/homeassistant-custom-cards.js` to `config/www/` and add
it as a **JavaScript module** resource (`/local/homeassistant-custom-cards.js?v=1`,
changing `?v=` on every update).

## Repository layout

```
cards/<card-name>/<card-name>.js   the card's source
cards/<card-name>/README.md        options and behaviour
tests/<card-name>.test.js          behaviour tests (real card code in jsdom)
dist/homeassistant-custom-cards.js all cards in one file, for HACS (npm run build)
hacs.json                          tells HACS which file to install
```

## Development

```bash
npm install     # jsdom, for the tests
npm run build   # rebuild dist/ after changing a card (commit it too)
npm test        # syntax check, every card's tests, and a check that dist/ is up to date
```

Conventions for new cards:

- One file, plain `HTMLElement` + shadow DOM, no external imports.
- Register only after Home Assistant's own `home-assistant` element is defined
  (`customElements.whenDefined("home-assistant")`), then define through
  `window.customElements` – Home Assistant swaps in a scoped registry while it
  starts, and a card defined earlier is reported as "custom element doesn't exist".
- Use theme variables (`--grey-color`, `--red-color`, …) rather than fixed colours,
  so light and dark themes both work.
- Confirm anything with consequences (alarms, boosts, locks) in a dialog.

## License

GPL-3.0 – see [LICENSE](LICENSE).
