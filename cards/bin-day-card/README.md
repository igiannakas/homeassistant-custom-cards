# Bin day card

`custom:bin-day-card` – which bins go out, at the top of the home view: **Take the bins out
tonight** the evening before a collection, **Bins collected today** on the day, each bin with its
glyph in the bin's own colour, and a **Done** button on each alert.

- **Only there while it matters.** The card shows from the evening before a collection (18:00 by
  default, read from a time helper) until the end of collection day. The rest of the week it hides
  itself the way Home Assistant's conditional cards do, so the section closes up around it. In the
  dashboard editor it stays visible with the next collection ("Next Wed 21 Oct · Food · Refuse").
- **Two alerts, one row each**, like the appliance alert card: the glyph, the title, the bins under
  it, then Done.
  - *Take the bins out tonight*: red glyph, something to do now.
  - *Bins collected today*: amber glyph, a heads-up for the day.
- **The bins** come from a calendar, one all-day event per bin. Each one shows its glyph in the
  bin's real colour (brown refuse, black recycling, green caddy and garden bin), then its name. Black
  follows the theme's text colour, so a black bin still shows on a dark theme. A collection the
  config doesn't list still shows, under its calendar name, with a glyph guessed from the name.
- **Done is shared, and each alert has its own.** Done stores the collection's date in that
  alert's date helper. The alert then stays away on every phone until the next collection. The two
  alerts use different helpers, so Done on the evening alert doesn't hide the collection-day alert.
  If the call fails, Home Assistant's message shows (or "Couldn't mark … as done.") and Done works
  again.
- Nothing is cut off: the title wraps, the bins wrap between bins, and when the text and Done don't
  fit on one line, Done moves to a full-width row of its own (measured, not a breakpoint).

## Configuration

```yaml
type: custom:bin-day-card
calendar: calendar.bin_collections
tonight_from: input_datetime.bins_tonight_alert_from
tonight_done: input_datetime.bins_tonight_alert_done_for
today_done: input_datetime.bins_today_alert_done_for
bins:
  - match: Food
    icon: mdi:food-apple
    color: green
  - match: Recycling
    icon: mdi:recycle
    color: black
  - match: Refuse
    icon: mdi:trash-can
    color: brown
  - match: Garden
    icon: mdi:leaf
    color: green
```

| Option | What it is |
|---|---|
| `calendar` | The collections calendar: one all-day event per bin. Required. |
| `tonight_from` | When the evening alert starts: a time helper (`input_datetime` with a time, or a `time` entity), or a time such as `"18:00"`. Default 18:00, which is also used while the helper is unavailable. |
| `tonight_done` | A date helper (`input_datetime` with a date) for the evening alert's Done. Without it, the alert has no Done. |
| `today_done` | A date helper of its own for the collection-day alert's Done. It must be a different helper from `tonight_done`. |
| `today_only` | `true` for no evening alert, only the collection-day one. |
| `bins` | How each collection shows, in this order. `match`: text the calendar event contains (any case; the first bin that matches wins). `name`: what to call it (default: the event's name). `icon`. `color`: a Home Assistant colour name (`brown`, `green`, `black`…) or a hex colour. |
| `tonight_title` | Default "Take the bins out tonight". |
| `today_title` | Default "Bins collected today". |
| `icon` | The alert glyph. Default `mdi:trash-can`. |

Without `bins`, names come straight from the calendar, and the glyphs and colours are guessed from
the words: food, garden, glass, recycling, paper and card, refuse or general waste.

Place it first on the home view, beside other alert cards. It takes no room while nothing is due.

## The data behind it

The card reads a calendar. It doesn't contain a schedule of its own, so a bank-holiday change
reaches it as soon as the calendar has it.

- **From the council:** the [Waste Collection Schedule](https://github.com/mampfes/hacs_waste_collection_schedule)
  integration (HACS) supports most UK councils and many others. Add it in **Settings → Devices &
  services**, choose the council, enter its arguments (e.g. the property's UPRN) and set
  **Calendar title**. Optionally give the collection types short aliases under **Configure →
  customize** ("Domestic Food" → "Food"). Its calendar has one all-day event per collection type.
  It doesn't need any of its sensors.
- **By hand:** a **Local Calendar** with one repeating all-day event per bin (e.g. "Refuse", every
  2 weeks on Wednesday). Move a holiday collection by editing that one occurrence.

The three helpers (**Settings → Devices & services → Helpers → Date and/or time**):

- `input_datetime.bins_tonight_alert_from`: time only, set to when the evening alert should start.
- `input_datetime.bins_tonight_alert_done_for`: date only, written by Done on the evening alert.
- `input_datetime.bins_today_alert_done_for`: date only, written by Done on the collection-day alert.

The card reads the calendar through Home Assistant's calendar API: when it loads, when the
calendar's state changes, at midnight and every half hour. Every user who can open the dashboard can
read it, admin or not.
