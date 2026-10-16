// Behaviour test for bin-day-card (runs the real card in jsdom). Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "cards", "bin-day-card", "bin-day-card.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/0" });
const { window } = dom;
window.eval(src);
assert(!window.customElements.get("bin-day-card"), "waits for the app");
window.customElements.define("home-assistant", class extends window.HTMLElement {});
const { document } = window;
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); // cross-realm safe
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const T = (iso) => Date.parse(iso);
const st = (state, attributes = {}) => ({ state: String(state), attributes });

// The St Albans calendar as Waste Collection Schedule serves it (read live on 16 Oct 2026, with the
// aliases Food / Recycling / Refuse / Garden): one all-day event per bin.
const allDay = (date, summary) => ({ start: { date }, end: { date }, summary, description: null, location: null, uid: `${date}-${summary}` });
let EVENTS = [
  allDay("2026-10-21", "Food"),
  allDay("2026-10-21", "Refuse"),
  allDay("2026-10-28", "Recycling"),
  allDay("2026-10-28", "Garden"),
];

const calls = [];
const reads = [];
let failNext = null;
let failRead = null;

function states(over = {}) {
  return {
    "calendar.bin_collections": st("off", { message: "Food", all_day: true, start_time: "2026-10-21 00:00:00", friendly_name: "Bin collections" }),
    "input_datetime.bins_tonight_alert_from": st("18:00:00", { has_date: false, has_time: true, hour: 18, minute: 0, second: 0, timestamp: 64800, friendly_name: "Bins tonight alert from" }),
    "input_datetime.bins_tonight_alert_done_for": st("2026-10-16", { has_date: true, has_time: false, year: 2026, month: 10, day: 16, friendly_name: "Bins tonight alert done for" }),
    "input_datetime.bins_today_alert_done_for": st("2026-10-16", { has_date: true, has_time: false, year: 2026, month: 10, day: 16, friendly_name: "Bins today alert done for" }),
    "time.dehumidifier_off": st("17:30:00", { friendly_name: "Off at" }),
    "calendar.workday_sensor_calendar": st("off", { friendly_name: "Workday Sensor Calendar" }),
    ...over,
  };
}
function hass(over = {}) {
  return {
    config: { time_zone: "Europe/London" },
    locale: { language: "en-GB", time_zone: "server" },
    states: states(over),
    callApi: async (method, p) => {
      reads.push([method, p]);
      if (failRead) {
        const e = failRead;
        failRead = null;
        throw e;
      }
      return JSON.parse(JSON.stringify(EVENTS));
    },
    callService: async (d, s, data, target, notify) => {
      calls.push([d, s, data, notify]);
      if (failNext) {
        const e = failNext;
        failNext = null;
        throw e;
      }
    },
  };
}
// The live config on the home view.
const LIVE_CFG = {
  calendar: "calendar.bin_collections",
  tonight_from: "input_datetime.bins_tonight_alert_from",
  tonight_done: "input_datetime.bins_tonight_alert_done_for",
  today_done: "input_datetime.bins_today_alert_done_for",
  bins: [
    { match: "Food", icon: "mdi:food-apple", color: "green" },
    { match: "Recycling", icon: "mdi:recycle", color: "black" },
    { match: "Refuse", icon: "mdi:trash-can", color: "brown" },
    { match: "Garden", icon: "mdi:leaf", color: "green" },
  ],
};

function mount(cfg, h, now) {
  const card = document.createElement("bin-day-card");
  card._now = () => now;
  const ev = [];
  card.addEventListener("hass-notification", (e) => ev.push(["notification", e.detail.message]));
  card.addEventListener("card-visibility-changed", (e) => ev.push(["visible", e.detail.value]));
  document.body.appendChild(card);
  card.setConfig(cfg);
  card.hass = h;
  card.ev = ev;
  return card;
}
const at = (card, iso, h = hass()) => {
  card._now = () => T(iso);
  card.hass = h;
};
const rowView = (el) => ({
  title: el.querySelector(".nm").textContent,
  bins: [...el.querySelectorAll(".sc .v")].map((v) => v.textContent),
  icons: [...el.querySelectorAll(".sc .v ha-icon")].map((i) => i.getAttribute("icon")),
  colors: [...el.querySelectorAll(".sc .v ha-icon")].map((i) => i.getAttribute("style")),
  sc: el.querySelector(".sc").textContent.replace(/\u00a0/g, " "),
  pill: el.querySelector(".pill").hidden ? null : el.querySelector(".pill").textContent.trim(),
  disabled: el.querySelector(".pill").getAttribute("aria-disabled"),
});
const shown = (card) => [...card.shadowRoot.querySelectorAll(".wrap")].filter((w) => !w.hidden).map((w) => w.dataset.k);
const row = (card, k) => rowView(card.shadowRoot.querySelector(`.wrap.${k}`));

(async () => {
  await tick();
  const Card = window.customElements.get("bin-day-card");
  assert(Card, "defined after home-assistant");
  assert(window.customCards.some((c) => c.type === "bin-day-card"), "listed in the card picker");

  // 0. Config: a calendar is required; Done helpers are date helpers, and two different ones (the
  //    alerts are independent); bins need the text to match.
  assert.throws(() => new Card().setConfig({}), /calendar/);
  assert.throws(() => new Card().setConfig({ calendar: "sensor.bins" }), /calendar/);
  assert.throws(() => new Card().setConfig({ calendar: "calendar.x", tonight_done: "input_boolean.x" }), /input_datetime/);
  assert.throws(
    () => new Card().setConfig({ calendar: "calendar.x", tonight_done: "input_datetime.d", today_done: "input_datetime.d" }),
    /two different helpers/,
  );
  assert.throws(() => new Card().setConfig({ calendar: "calendar.x", bins: [{ icon: "mdi:leaf" }] }), /match/);
  assert.throws(() => new Card().setConfig({ calendar: "calendar.x", bins: "Food" }), /match/);
  const form = JSON.stringify(Card.getConfigForm().schema);
  for (const k of ["calendar", "tonight_from", "tonight_done", "today_done", "today_only", "bins", "tonight_title", "today_title", "icon"])
    assert(form.includes(`"name":"${k}"`), `editor field ${k}`);
  assert.strictEqual(Card.getStubConfig({ states: states() }).calendar, "calendar.bin_collections", "stub picks the bins calendar");

  // 1. Friday 16 Oct: the next collection is Wednesday – nothing due, the card takes no room. It
  //    read the calendar once, for a window around now.
  const card = mount(LIVE_CFG, hass(), T("2026-10-16T10:00:00+01:00"));
  await tick(5);
  assert.strictEqual(card.hidden, true, "nothing due: hidden");
  eq(card.ev, [["visible", false]], "told the card wrapper");
  assert.strictEqual(reads.length, 1, "one read");
  const q = new URL(`https://x/${reads[0][1]}`);
  eq([reads[0][0], q.pathname, q.searchParams.get("start"), q.searchParams.get("end")],
    ["GET", "/calendars/calendar.bin_collections", "2026-10-15T09:00:00.000Z", "2026-11-01T09:00:00.000Z"], "calendar window");

  // 2. Tuesday 20 Oct: at 17:59 still nothing; at 18:00 (the helper's time) the evening alert –
  //    the bins in the config's order, each glyph in its bin's colour, and Done.
  at(card, "2026-10-20T17:59:00+01:00");
  await tick(5);
  assert.strictEqual(card.hidden, true, "17:59: not yet");
  const h1 = hass();
  at(card, "2026-10-20T18:00:00+01:00", h1);
  eq(shown(card), ["tonight"], "18:00: the evening alert");
  eq(row(card, "tonight"), {
    title: "Take the bins out tonight", bins: ["Food", "Refuse"], icons: ["mdi:food-apple", "mdi:trash-can"],
    colors: ["color:var(--green-color, #4caf50)", "color:var(--brown-color, #795548)"],
    sc: "Food · Refuse", pill: "Done", disabled: "false",
  }, "tonight: Food and Refuse, Done");
  assert.strictEqual(card.hidden, false);
  eq(card.ev.slice(-1), [["visible", true]]);
  assert.strictEqual(card.shadowRoot.querySelector(".wrap.tonight").getAttribute("role"), "alert", "announced as an alert");
  assert.strictEqual(card.shadowRoot.querySelector(".wrap.tonight .slot ha-icon").getAttribute("icon"), "mdi:trash-can");
  const css = card.shadowRoot.querySelector("style").textContent;
  assert(css.includes(".wrap.tonight .slot ha-icon { color: var(--red-color, #f44336); }"), "tonight's glyph is red");
  assert(css.includes(".wrap.today .slot ha-icon { color: var(--amber-color, #ffc107); }"), "today's glyph is amber");

  // 3. Stability: a hass update with nothing new keeps the same nodes (taps are never lost).
  const pill = card.shadowRoot.querySelector(".wrap.tonight .pill");
  const firstBin = card.shadowRoot.querySelector(".wrap.tonight .sc .v");
  const nReads = reads.length;
  card.hass = { ...h1, states: { ...h1.states, "time.dehumidifier_off": st("17:45:00") } };
  await tick(5);
  assert.strictEqual(card.shadowRoot.querySelector(".wrap.tonight .pill"), pill, "same pill node");
  assert.strictEqual(card.shadowRoot.querySelector(".wrap.tonight .sc .v"), firstBin, "bins not rewritten");
  assert.strictEqual(reads.length, nReads, "no re-read for an unrelated update");

  // 4. Done stores Wednesday's date in the evening helper (no dialog, no Home Assistant toast);
  //    a second tap while it settles does nothing; the new state hides the alert.
  pill.click();
  await tick();
  eq(calls, [["input_datetime", "set_datetime", { entity_id: "input_datetime.bins_tonight_alert_done_for", date: "2026-10-21" }, false]], "one set_datetime");
  assert.strictEqual(row(card, "tonight").disabled, "true", "the pill rests until the state changes");
  pill.click();
  await tick();
  assert.strictEqual(calls.length, 1, "no second call");
  const doneTonight = { "input_datetime.bins_tonight_alert_done_for": st("2026-10-21", { has_date: true, has_time: false }) };
  at(card, "2026-10-20T18:01:00+01:00", hass(doneTonight));
  eq([card.hidden, shown(card)], [true, []], "done for tonight: hidden");

  // 5. Independent: Wednesday is collection day – its own alert shows although tonight's was done.
  at(card, "2026-10-21T00:00:00+01:00", hass(doneTonight));
  await tick(5);
  eq(shown(card), ["today"], "collection day after midnight");
  eq(row(card, "today"), {
    title: "Bins collected today", bins: ["Food", "Refuse"], icons: ["mdi:food-apple", "mdi:trash-can"],
    colors: ["color:var(--green-color, #4caf50)", "color:var(--brown-color, #795548)"],
    sc: "Food · Refuse", pill: "Done", disabled: "false",
  }, "today: Food and Refuse, Done");
  at(card, "2026-10-21T23:59:00+01:00", hass(doneTonight));
  eq(shown(card), ["today"], "all day");

  // 6. Done on today writes only the day helper.
  calls.length = 0;
  card.shadowRoot.querySelector(".wrap.today .pill").click();
  await tick();
  eq(calls, [["input_datetime", "set_datetime", { entity_id: "input_datetime.bins_today_alert_done_for", date: "2026-10-21" }, false]], "the day helper");
  const doneBoth = { ...doneTonight, "input_datetime.bins_today_alert_done_for": st("2026-10-21", { has_date: true, has_time: false }) };
  at(card, "2026-10-21T12:00:00+01:00", hass(doneBoth));
  assert.strictEqual(card.hidden, true, "both done");
  //    …and Done on today alone leaves tonight's alert alone (seen from the evening before).
  at(card, "2026-10-20T19:00:00+01:00", hass({ "input_datetime.bins_today_alert_done_for": st("2026-10-21") }));
  await tick(5);
  eq(shown(card), ["tonight"], "today's Done doesn't hide tonight");

  // 7. A Done for last week doesn't hide this week: Tuesday 27th, recycling week – Food, Recycling
  //    and Garden in the config's order; black recycling follows the text colour (dark themes).
  //    (After the 21st the council's next food collection is the 28th, listed after the others.)
  EVENTS = [...EVENTS, allDay("2026-10-28", "Food")];
  at(card, "2026-10-27T18:30:00+00:00", hass(doneBoth));
  await tick(5);
  eq(shown(card), ["tonight"], "next week's evening alert");
  eq([row(card, "tonight").bins, row(card, "tonight").colors], [
    ["Food", "Recycling", "Garden"],
    ["color:var(--green-color, #4caf50)", "color:var(--primary-text-color)", "color:var(--green-color, #4caf50)"],
  ], "recycling week");

  // 8. The evening time comes from the helper: 19:30 means not at 19:00; a literal time works; an
  //    unreadable helper falls back to 18:00 rather than losing the reminder; a time entity works.
  const late = { "input_datetime.bins_tonight_alert_from": st("19:30:00", { has_date: false, has_time: true, hour: 19, minute: 30 }) };
  at(card, "2026-10-20T19:00:00+01:00", hass(late));
  assert.strictEqual(card.hidden, true, "19:00 < 19:30");
  at(card, "2026-10-20T19:30:00+01:00", hass(late));
  eq(shown(card), ["tonight"], "19:30");
  at(card, "2026-10-20T18:00:00+01:00", hass({ "input_datetime.bins_tonight_alert_from": st("unavailable") }));
  eq(shown(card), ["tonight"], "unavailable helper: 18:00");
  card.setConfig({ ...LIVE_CFG, tonight_from: "17:00" });
  at(card, "2026-10-20T17:00:00+01:00");
  eq(shown(card), ["tonight"], "literal 17:00");
  card.setConfig({ ...LIVE_CFG, tonight_from: "time.dehumidifier_off" });
  at(card, "2026-10-20T17:29:00+01:00");
  assert.strictEqual(card.hidden, true, "time entity: 17:30 not yet");
  at(card, "2026-10-20T17:30:00+01:00");
  eq(shown(card), ["tonight"], "time entity: 17:30");
  //    Only on collection day: no evening alert at all.
  card.setConfig({ ...LIVE_CFG, today_only: true });
  at(card, "2026-10-20T21:00:00+01:00");
  assert.strictEqual(card.hidden, true, "today_only: no evening alert");
  at(card, "2026-10-21T07:00:00+01:00");
  eq(shown(card), ["today"], "today_only: collection day");
  card.setConfig(LIVE_CFG);

  // 9. A failed Done says so (Home Assistant's message, else ours) and the pill works again.
  calls.length = 0;
  at(card, "2026-10-20T20:00:00+01:00");
  failNext = {};
  card.shadowRoot.querySelector(".wrap.tonight .pill").click();
  await tick();
  eq(card.ev.slice(-1), [["notification", 'Couldn\'t mark "Take the bins out tonight" as done.']], "our message");
  assert.strictEqual(row(card, "tonight").disabled, "false", "pill usable again");
  failNext = { message: "Unauthorized" };
  card.shadowRoot.querySelector(".wrap.tonight .pill").click();
  await tick();
  eq(card.ev.slice(-1), [["notification", "Unauthorized"]], "Home Assistant's own message");

  // 10. Collections on two days in a row: on the first evening both alerts – tonight's first.
  EVENTS = [allDay("2026-11-03", "Food"), allDay("2026-11-04", "Refuse")];
  at(card, "2026-11-03T18:00:00+00:00", hass({ "calendar.bin_collections": st("on", { message: "Food" }) }));
  await tick(5);
  eq(shown(card), ["tonight", "today"], "both, the one to do first on top");
  eq([row(card, "tonight").bins, row(card, "today").bins], [["Refuse"], ["Food"]]);

  // 11. Re-reading: a change of the calendar entity (the integration fetched, a collection day
  //     began), a new day, and every half hour; a failed read keeps what it had and retries
  //     after five minutes.
  EVENTS = [allDay("2026-11-04", "Refuse"), allDay("2026-11-04", "Garden")];
  const fixed = hass({ "calendar.bin_collections": st("on", { message: "Food" }) });
  at(card, "2026-11-03T18:11:00+00:00", fixed); // a new calendar state: read
  await tick(5);
  eq(row(card, "tonight").bins, ["Refuse", "Garden"], "new dates show");
  const n2 = reads.length;
  at(card, "2026-11-03T18:20:00+00:00", fixed);
  card.hass = { ...fixed, states: { ...fixed.states, "time.dehumidifier_off": st("17:50:00") } };
  assert.strictEqual(reads.length, n2, "same calendar state, 9 min later, other entities changing: no read");
  at(card, "2026-11-03T18:41:00+00:00", fixed);
  await tick(5);
  assert.strictEqual(reads.length, n2 + 1, "half an hour: read again");
  failRead = { message: "Timeout" };
  at(card, "2026-11-03T19:12:00+00:00", fixed);
  await tick(5);
  assert.strictEqual(reads.length, n2 + 2, "half an hour again: read (fails)");
  eq(row(card, "tonight").bins, ["Refuse", "Garden"], "a failed read keeps the last good dates");
  at(card, "2026-11-03T19:15:00+00:00", fixed);
  assert.strictEqual(reads.length, n2 + 2, "3 min after a failure: wait");
  at(card, "2026-11-03T19:17:00+00:00", fixed);
  await tick(5);
  assert.strictEqual(reads.length, n2 + 3, "5 min after a failure: retry");
  at(card, "2026-11-04T00:01:00+00:00", fixed);
  await tick(5);
  assert.strictEqual(reads.length, n2 + 4, "a new day: read");
  eq(shown(card), ["today"], "collection day");
  //    The minute timer re-renders on its own (the evening time passes with no hass update).
  assert(card._timer != null, "a timer runs while connected");
  card.remove();
  assert.strictEqual(card._timer, null, "and stops when removed");
  document.body.appendChild(card);

  // 12. Without a bins list: names straight from the calendar, glyphs and colours guessed from the
  //     words; anything unexpected still shows. Names are escaped. Without Done helpers: no pill.
  EVENTS = [
    allDay("2026-11-11", "Food waste"), allDay("2026-11-11", "Glass recycling"), allDay("2026-11-11", "Garden waste"),
    allDay("2026-11-11", "Bulky <b>items</b>"), allDay("2026-11-11", "Paper & card"), allDay("2026-11-11", "General waste"),
  ];
  const plain = mount({ calendar: "calendar.bin_collections" }, hass(), T("2026-11-11T08:00:00+00:00"));
  await tick(5);
  eq(shown(plain), ["today"]);
  eq(row(plain, "today"), {
    title: "Bins collected today",
    bins: ["Food waste", "Glass recycling", "Garden waste", "Bulky <b>items</b>", "Paper & card", "General waste"],
    icons: ["mdi:food-apple", "mdi:bottle-wine", "mdi:leaf", "mdi:trash-can-outline", "mdi:newspaper-variant-outline", "mdi:trash-can"],
    colors: ["color:var(--green-color, #4caf50)", "color:var(--cyan-color, #00bcd4)", "color:var(--green-color, #4caf50)",
      "color:var(--grey-color, #9e9e9e)", "color:var(--blue-color, #2196f3)", "color:var(--grey-color, #9e9e9e)"],
    sc: "Food waste · Glass recycling · Garden waste · Bulky <b>items</b> · Paper & card · General waste",
    pill: null, disabled: "false",
  }, "defaults by name; no Done without a helper");
  assert(!plain.shadowRoot.querySelector(".sc b"), "escaped");
  //    Own names, icon, titles and colours; an unsafe colour is ignored; a bin matched twice shows once.
  plain.setConfig({
    calendar: "calendar.bin_collections", icon: "mdi:delete-empty", today_title: "Bin day",
    bins: [{ match: "waste", name: "Bins", color: "red;background:url(x)" }, { match: "glass", name: "Glass", color: "#123abc" }],
  });
  eq([row(plain, "today").title, row(plain, "today").bins, row(plain, "today").colors.slice(0, 2)],
    ["Bin day", ["Bins", "Glass", "Bulky <b>items</b>", "Paper & card"], ["color:var(--green-color, #4caf50)", "color:#123abc"]],
    "own names; first match wins; one Bins; unsafe colour falls back to the guessed one");
  assert.strictEqual(plain.shadowRoot.querySelector(".wrap.today .slot ha-icon").getAttribute("icon"), "mdi:delete-empty");

  // 13. Time zone: Home Assistant's (server) zone decides the day – 23:30 UTC on the 20th is
  //     00:30 on the 21st in London. Timed events count on their local day.
  EVENTS = [{ start: { dateTime: "2026-10-21T06:00:00+01:00" }, end: { dateTime: "2026-10-21T07:00:00+01:00" }, summary: "Food" }];
  const tzc = mount(LIVE_CFG, hass(), T("2026-10-20T23:30:00Z"));
  await tick(5);
  eq(shown(tzc), ["today"], "London day, timed event");

  // 14. In the dashboard editor (preview): with nothing due it shows when it appears and the next
  //     collection; a missing calendar says so; Done is not offered.
  EVENTS = [allDay("2026-10-21", "Food"), allDay("2026-10-21", "Refuse"), allDay("2026-10-28", "Recycling")];
  const pre = mount(LIVE_CFG, hass(), T("2026-10-16T10:00:00+01:00"));
  await tick(5);
  assert.strictEqual(pre.hidden, true);
  pre.preview = true;
  eq([pre.hidden, shown(pre), row(pre, "info").title, row(pre, "info").sc, row(pre, "info").pill],
    [false, ["info"], "Shows the evening before and on bin day", "Next Wed 21 Oct · Food · Refuse", null], "editor preview");
  pre.setConfig({ ...LIVE_CFG, calendar: "calendar.nope" });
  eq(row(pre, "info").sc, "calendar.nope not found", "missing calendar");
  pre.setConfig(LIVE_CFG);
  await tick(5);
  at(pre, "2026-10-20T18:00:00+01:00");
  eq(shown(pre), ["tonight"], "the real alert in the preview when one is due");
  pre.preview = false;

  // 15. Side padding: a plain 10px, and each row moves out by the border width with a negative
  //     margin – never calc(10px - var(--ha-card-border-width)) on the padding (a theme's bare 0
  //     makes it invalid). No coloured card background.
  assert(/ha-card \{ padding: 12px 10px;/.test(css), "plain padding");
  assert(css.includes("margin: 0 calc(-1 * var(--ha-card-border-width, 1px));"), "border offset as a margin");
  assert(!/padding:[^;]*var\(--ha-card-border-width/.test(css), "no border variable inside a padding");
  assert(!/ha-card \{[^}]*background/.test(css), "theme background");
  assert(css.includes("ha-icon { display: inline-flex; align-items: center; justify-content: center; }"), "icons centred by flex");

  // 16. Layout rule: the pill stacks only when the natural widths don't fit.
  assert.strictEqual(Card.stacks(339, 46 + 180, 10, 80), false);
  assert.strictEqual(Card.stacks(339, 46 + 210, 10, 90), true);
  //     Sub-pixel exact: 0.1px too wide stacks (the browser would wrap the bins); an exact fit doesn't.
  assert.strictEqual(Card.stacks(324.09, 46 + 189.19, 10, 78.91), true, "189.19px of bins in 189.09px");
  assert.strictEqual(Card.stacks(324.09, 46 + 189.18, 10, 78.91), false, "exact fit");

  for (const c of document.querySelectorAll("bin-day-card")) c.remove(); // stop the minute timers
  console.log("ALL BIN-DAY-CARD TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
