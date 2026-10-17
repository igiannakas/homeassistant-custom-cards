// Heating schedule card: rendering from Scheduler's schedules, taps, the editor and the save plan.
// Run: node tests/heating-schedule-card.test.js
const assert = require("assert");
const load = require("./_harness");

const NAME = "heating-schedule-card";
const NOW = Date.parse("2026-10-17T19:22:00Z"); // Saturday 20:22 in London (BST)

const ROOMS = [
  { climate: "climate.living_room_thermostat", schedule: "input_select.living_room_heating_schedule", name: "Living Room", icon: "mdi:sofa" },
  { climate: "climate.master_bedroom_thermostat", schedule: "input_select.master_bedroom_heating_schedule", name: "Master Bedroom", icon: "mdi:bed-king" },
  { climate: "climate.second_bedroom_thermostat", schedule: "input_select.second_bedroom_heating_schedule", name: "Second Bedroom", icon: "mdi:baby-carriage" },
  { climate: "climate.study_thermostat", schedule: "input_select.study_heating_schedule", name: "Study", icon: "mdi:monitor-dashboard" },
];
const LR = ROOMS[0].schedule;
const MB = ROOMS[1].schedule;
const SB = ROOMS[2].schedule;
const ST = ROOMS[3].schedule;

const act = (ent, option) => ({ service: "input_select.select_option", entity_id: ent, service_data: { option } });
const slot = (start, stop, ents, option) => ({ start, stop, conditions: [], condition_type: null, track_conditions: false, actions: ents.map((e) => act(e, option)) });
// The two live schedules, as Scheduler's websocket list returns them.
const liveSchedules = () => [
  {
    schedule_id: "31efb0", entity_id: "switch.schedule_31efb0", name: "Living, Study, Second Bedroom", weekdays: ["daily"], start_date: null, end_date: null,
    repeat_type: "repeat", enabled: true, tags: [], next_entries: [2], timestamps: [],
    timeslots: [slot("00:00:00", "06:00:00", [ST, LR, SB], "night"), slot("06:00:00", "21:30:00", [ST, LR, SB], "comfort"), slot("21:30:00", "00:00:00", [ST, LR, SB], "night")],
  },
  {
    schedule_id: "956b57", entity_id: "switch.schedule_master_bedroom", name: "Master Bedroom", weekdays: ["daily"], start_date: null, end_date: null,
    repeat_type: "repeat", enabled: true, tags: [], next_entries: [2], timestamps: [],
    timeslots: [slot("00:00:00", "09:30:00", [MB], "night"), slot("09:30:00", "21:30:00", [MB], "comfort"), slot("21:30:00", "00:00:00", [MB], "night")],
  },
];

const st = (state, attributes = {}) => ({ state: String(state), attributes });
const climate = (name, cur, target, preset, extra = {}) =>
  st("heat", {
    friendly_name: name, current_temperature: cur, temperature: target, preset_mode: preset, hvac_action: "idle",
    preset_modes: ["comfort", "eco", "boost", "away", "frost_protection", "schedule"], schedule_preset: "comfort", schedule_override_active: false,
    schedule_override_until: null, summer_mode_active: false, presence_away_active: false, window_open_active: false, ...extra,
  });
function states() {
  const s = {
    "climate.living_room_thermostat": climate("Living Room Thermostat", 19.8, 5, "frost_protection", { schedule_override_active: true }),
    "climate.master_bedroom_thermostat": climate("Master Bedroom Thermostat", 20, 20, "comfort"),
    "climate.second_bedroom_thermostat": climate("Second Bedroom Thermostat", 20, 20, "comfort", { hvac_action: "heating" }),
    "climate.study_thermostat": climate("Study Thermostat", 20.3, 20, "comfort"),
    "sun.sun": st("below_horizon", { next_rising: "2026-10-18T06:30:57+00:00", next_setting: "2026-10-18T17:01:03+00:00" }),
    "switch.schedule_31efb0": st("on"),
    "switch.schedule_master_bedroom": st("on"),
  };
  for (const r of ROOMS) {
    s[r.schedule] = st("comfort", { options: ["comfort", "night", "away", "frost_protection"] });
    const obj = r.climate.split(".")[1];
    s[`number.${obj}_comfort_temperature`] = st("20.0");
    s[`number.${obj}_night_temperature`] = st("18.0");
    s[`number.${obj}_away_temperature`] = st("16.0");
    s[`number.${obj}_frost_protection_temperature`] = st("5.0");
  }
  return s;
}

/* A fake Scheduler: the websocket list, and add / edit / remove applied the way the component does
   (edit merges the given keys; a new name means a new entity id). Rejects what Scheduler's schema
   rejects that the card could plausibly send. */
function fakeScheduler(list) {
  const slug = (n) => n.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  let n = 0;
  const checkSlots = (slots) => {
    assert(Array.isArray(slots) && slots.length >= 1, "timeslots: at least one");
    for (const t of slots) {
      assert(/^\d{2}:\d{2}:\d{2}$/.test(t.start), `start ${t.start}`);
      if ("stop" in t) assert(/^\d{2}:\d{2}:\d{2}$/.test(t.stop), `stop ${t.stop}`);
      if ("conditions" in t) assert(t.conditions.length >= 1, "conditions: Scheduler refuses an empty list");
      assert(t.condition_type !== null, "condition_type: null is refused");
      assert(Array.isArray(t.actions) && t.actions.length >= 1, "actions: at least one");
      for (const a of t.actions) assert(typeof a.service === "string" && /^\w+\.\w+$/.test(a.service), "action service");
      const extra = Object.keys(t).filter((k) => !["start", "stop", "conditions", "condition_type", "track_conditions", "actions"].includes(k));
      assert(!extra.length, `unknown timeslot keys ${extra}`);
    }
  };
  const apply = (domain, service, data) => {
    if (domain === "switch") {
      const s = list.find((x) => x.entity_id === data.entity_id);
      assert(s, `switch ${data.entity_id}`);
      s.enabled = service === "turn_on";
      return;
    }
    assert.strictEqual(domain, "scheduler");
    if (service === "add") {
      checkSlots(data.timeslots);
      assert.strictEqual(data.repeat_type, "repeat");
      const id = `new${++n}`;
      list.push({ schedule_id: id, entity_id: `switch.schedule_${slug(data.name) || id}`, name: data.name, weekdays: data.weekdays, timeslots: data.timeslots,
        repeat_type: "repeat", enabled: true, start_date: null, end_date: null });
    } else if (service === "edit") {
      const s = list.find((x) => x.entity_id === data.entity_id);
      assert(s, `edit ${data.entity_id}`);
      assert("start_date" in data && "end_date" in data, "edit passes the date range through (the schema would clear it)");
      if (data.timeslots) checkSlots(data.timeslots);
      for (const [k, v] of Object.entries(data)) if (k !== "entity_id") s[k] = v;
      if (data.name) s.entity_id = `switch.schedule_${slug(data.name)}`;
    } else if (service === "remove") {
      const i = list.findIndex((x) => x.entity_id === data.entity_id);
      assert(i >= 0, `remove ${data.entity_id}`);
      list.splice(i, 1);
    } else throw new Error(`unexpected scheduler.${service}`);
  };
  return { list, apply };
}

function makeHass(S, sched, calls, opts = {}) {
  const subs = [];
  return {
    hass: {
      states: S,
      config: { time_zone: "Europe/London" },
      entities: {},
      areas: {},
      devices: {},
      callWS: async (msg) => {
        if (opts.wsError) throw opts.wsError;
        assert.strictEqual(msg.type, "scheduler");
        return JSON.parse(JSON.stringify(sched.list));
      },
      callService: async (d, s, data, target, notify) => {
        calls.push([d, s, JSON.parse(JSON.stringify(data)), notify]);
        if (opts.fail && opts.fail(d, s, data)) throw new Error("Entity not found: switch.schedule_x");
        if (d === "climate") return;
        sched.apply(d, s, data);
      },
      connection: {
        subscribeMessage: async (cb, msg) => {
          assert.strictEqual(msg.type, "scheduler_updated");
          subs.push(cb);
          return () => {};
        },
        addEventListener() {},
        removeEventListener() {},
      },
    },
    subs,
  };
}

(async () => {
  const t = await load(NAME);
  const { window, document, Card, eq, tick } = t;
  window.requestAnimationFrame = (f) => setTimeout(f, 0);

  // ---- Config ----
  const make = () => document.createElement(NAME);
  assert.throws(() => make().setConfig({}), /Set rooms/);
  assert.throws(() => make().setConfig({ rooms: [{ climate: "sensor.x", schedule: LR }] }), /needs climate/);
  assert.throws(() => make().setConfig({ rooms: [{ climate: "climate.x" }] }), /set schedule/);
  assert.throws(() => make().setConfig({ rooms: [{ climate: "climate.x", schedule: LR }, { climate: "climate.y", schedule: LR }] }), /two rooms/);
  const form = Card.getConfigForm();
  eq(form.schema.map((s) => s.name), ["title", "rooms"]);
  eq(Object.keys(form.schema[1].selector.object.fields), ["climate", "schedule", "name", "icon"]);
  const stub = Card.getStubConfig({ states: states() });
  eq(stub.rooms.map((r) => r.schedule), [LR, MB, SB, ST], "stub finds each thermostat's heating schedule helper");

  // ---- Days and labels ----
  eq([127, 31, 96, 32, 7, 23, 65].map(Card.daysLabel), ["Every day", "Weekdays", "Weekend", "Saturday", "Mon–Wed", "Mon–Wed, Fri", "Mon, Sun"]);

  // ---- Mount with the live data ----
  const mount = (opts = {}) => {
    const sched = fakeScheduler(liveSchedules());
    const calls = [];
    const S = states();
    const { hass, subs } = makeHass(S, sched, calls, opts);
    const card = make();
    card._now = () => NOW;
    document.body.appendChild(card);
    const events = [];
    card.addEventListener("hass-more-info", (e) => events.push(["more-info", e.detail.entityId]));
    card.addEventListener("hass-notification", (e) => events.push(["notification", e.detail.message]));
    card.setConfig({ rooms: ROOMS });
    card.hass = hass;
    return { card, sched, calls, S, hass, subs, events, root: () => card.shadowRoot, push: () => (card.hass = { ...hass, states: { ...S } }) };
  };

  let m = mount();
  let root = m.root();
  assert.strictEqual(root.querySelector(".status").textContent, "Loading schedules…");
  await tick(5);
  assert.strictEqual(m.subs.length, 1, "subscribed to scheduler_updated");
  const rows = [...root.querySelectorAll(".room")];
  assert.strictEqual(rows.length, 4);
  eq(rows.map((r) => r.querySelector(".n").textContent), ["Living Room", "Master Bedroom", "Second Bedroom", "Study"]);
  assert.strictEqual(root.querySelector(".status").textContent, "Every room to Night at 21:30");
  assert(root.querySelector(".days").hidden, "every room is the same every day: no day strip");

  const sc = (i) => rows[i].querySelector(".sc").textContent.replace(/ /g, " ");
  assert.strictEqual(sc(0), "19.8° → 5° · Off by hand", "a sticky manual Off has no end time");
  assert.strictEqual(sc(1), "20° → 20° · Night at 21:30");
  assert.strictEqual(sc(3), "20.3° → 20° · Night at 21:30");
  assert(!rows[0].querySelector(".pill").hidden, "Resume shows while overridden");
  assert.strictEqual(rows[0].querySelector(".pill span").textContent, "Resume");
  assert(rows[1].querySelector(".pill").hidden);
  assert(rows[2].classList.contains("heat"), "a heating room glows");
  assert(!rows[1].classList.contains("heat"));
  eq(rows.map((r) => !r.querySelector(".link").hidden), [true, false, true, true], "rooms sharing a schedule show the link");
  assert.strictEqual(rows[0].querySelector(".link").getAttribute("title"), "Shares a schedule with Second Bedroom and Study");
  // Icon circle in the colour of the preset the room is in now.
  assert(rows[0].querySelector(".shape").getAttribute("style").includes("--grey-color"), "Off = grey");
  assert(rows[1].querySelector(".shape").getAttribute("style").includes("--amber-color"), "Day = amber");

  // Bars: blocks at the right places; labels follow the width (none until measured).
  const blocks = (i) => [...rows[i].querySelectorAll(".b")].map((b) => b.getAttribute("style").match(/left:([\d.]+)%;width:([\d.]+)%/).slice(1).map(Number));
  eq(blocks(0), [[0, 25], [25, 64.583], [89.583, 10.417]]);
  eq(blocks(1), [[0, 39.583], [39.583, 50], [89.583, 10.417]]);
  const now = rows[0].querySelector(".now");
  assert(!now.hidden);
  assert.strictEqual(now.getAttribute("style"), "left:84.861%");
  m.card._barW = 320;
  m.card._render();
  const labels = [...rows[0].querySelectorAll(".b")].map((b) => b.textContent);
  eq(labels, ["18°", "Day 20°", "18°"], "320px: icon + temperature, name + temperature, temperature");
  assert(rows[0].querySelector(".b").innerHTML.includes("mdi:weather-night"));
  assert(rows[0].querySelectorAll(".b")[1].getAttribute("style").includes("--amber-color"));

  // Stability: the same nodes after the same state again (taps are never lost).
  const pillNode = rows[0].querySelector(".pill");
  const scNode = rows[0].querySelector(".sc .v");
  m.push();
  assert.strictEqual(rows[0].querySelector(".pill"), pillNode);
  assert.strictEqual(rows[0].querySelector(".sc .v"), scNode);

  // ---- Taps ----
  rows[1].querySelector(".sc .v").click();
  rows[1].querySelector(".shape").click();
  eq(m.events, [["more-info", "climate.master_bedroom_thermostat"], ["more-info", "climate.master_bedroom_thermostat"]]);
  assert(!document.querySelector("hsc-edit-sheet"), "value and circle taps don't open the editor");
  rows[0].querySelector(".pill").click();
  await tick();
  eq(m.calls[0], ["climate", "set_preset_mode", { entity_id: "climate.living_room_thermostat", preset_mode: "schedule" }, false], "Resume");

  // ---- Status variants ----
  const S = m.S;
  S["climate.master_bedroom_thermostat"] = climate("Master", 20, 22, "boost", { schedule_override_active: true, schedule_override_until: "2026-10-17T19:52:00+00:00" });
  S["climate.study_thermostat"] = climate("Study", 20.3, 20, "comfort", { window_open_active: true });
  S["climate.second_bedroom_thermostat"] = climate("Second", 20, 5, "frost_protection", { summer_mode_active: true });
  m.push();
  assert.strictEqual(sc(1), "20° → 22° · Boost by hand until 20:52");
  assert.strictEqual(sc(3), "20.3° → 20° · Window open");
  assert.strictEqual(sc(2), "20° → 5° · Summer · heating locked");
  assert(rows[2].querySelector(".pill").hidden, "no Resume under summer lock");
  S["climate.master_bedroom_thermostat"] = climate("Master", 20, 21, "comfort", { schedule_override_active: true });
  S["climate.study_thermostat"] = st("unavailable", {});
  m.push();
  assert.strictEqual(sc(1), "20° → 21° · Day by hand until 21:30", "a timed-less override ends at the next change");
  assert.strictEqual(sc(3), "Unavailable", "an unavailable thermostat shows no temperature");

  // Temperatures from the thermostat's own preset numbers (same device, translation key <preset>_target).
  m.hass.entities = {
    "climate.study_thermostat": { entity_id: "climate.study_thermostat", device_id: "dev_study", area_id: "study" },
    "number.study_eco": { entity_id: "number.study_eco", device_id: "dev_study", translation_key: "eco_target" },
  };
  m.hass.areas = { study: { area_id: "study", name: "Study area", icon: "mdi:chair-rolling" } };
  S["number.study_eco"] = st("17.5");
  S["climate.study_thermostat"] = climate("Study", 20.3, 20, "comfort");
  m.push();
  m.card._barW = 320;
  m.card._render();
  eq([...rows[3].querySelectorAll(".b")].map((b) => b.textContent), ["17.5°", "Day 20°", "17.5°"], "Night temperature from the eco_target number");

  // ---- Editor ----
  rows[0].click();
  let sheet = document.querySelector("hsc-edit-sheet");
  assert(sheet, "tapping a room opens its editor");
  let sr = sheet.shadowRoot;
  assert.strictEqual(sr.querySelector(".title").textContent, "Living Room");
  assert.strictEqual(sr.querySelector(".sub").textContent, "Every day");
  const times = () => [...sr.querySelectorAll(".blk")].map((b) => `${b.querySelector(".t").textContent}${b.querySelector(".to").textContent}=${b.querySelector('[aria-pressed="true"]').textContent}`);
  eq(times(), ["00:00– 06:00=Night", "06:00– 21:30=Day", "21:30– 00:00=Night"]);
  const chips = () => [...sr.querySelectorAll(".chip")].map((c) => `${c.textContent}${c.getAttribute("aria-pressed") === "true" ? "*" : ""}`);
  eq(chips(), ["Living Room*", "Master Bedroom", "Second Bedroom*", "Study*"], "rooms sharing the schedule are picked");
  const dms = () => [...sr.querySelectorAll(".dm button")].map((b) => `${b.textContent}${b.getAttribute("aria-pressed") === "true" ? "*" : ""}`);
  eq(dms(), ["Every day*", "Weekend", "Saturday only"], "Saturday: every day, the weekend, or just today");
  assert.strictEqual(sr.querySelector(".rooms-hint").textContent, "These rooms share a schedule. Leave one out to give it its own times.");

  // Steppers, mode, add, remove.
  sr.querySelectorAll(".blk")[1].querySelector('[data-step="15"]').click();
  eq(times()[1], "06:15– 21:30=Day");
  sr.querySelectorAll(".blk")[1].querySelector('[data-step="-15"]').click();
  sr.querySelectorAll(".blk")[1].querySelector('[data-step="-15"]').click();
  eq(times().slice(0, 2), ["00:00– 05:45=Night", "05:45– 21:30=Day"]);
  // Steps stop a quarter hour short of the neighbour.
  for (let k = 0; k < 80; k++) sr.querySelectorAll(".blk")[2].querySelector('[data-step="-15"]').click();
  eq(times()[2], "06:00– 00:00=Night");
  for (let k = 0; k < 80; k++) sr.querySelectorAll(".blk")[2].querySelector('[data-step="15"]').click();
  eq(times()[2], "23:45– 00:00=Night");
  sr.querySelector('.blk:nth-child(3) [data-mode="away"]').click();
  eq(times()[2], "23:45– 00:00=Away");
  sr.querySelector(".add").click();
  eq(times(), ["00:00– 05:45=Night", "05:45– 14:45=Day", "14:45– 23:45=Night", "23:45– 00:00=Away"], "Add a change splits the longest block");
  sr.querySelectorAll(".blk")[3].querySelector("[data-del]").click();
  sr.querySelectorAll(".blk")[2].querySelector("[data-del]").click();
  eq(times(), ["00:00– 05:45=Night", "05:45– 00:00=Day"]);
  sr.querySelectorAll(".blk")[0].querySelector("[data-del]").click();
  eq(times(), ["00:00– 00:00=Day"], "removing the first block lets the next start the day");
  assert(!sr.querySelector("[data-del]"), "the last block can't be removed");

  // Backdrop doesn't close a changed sheet; Cancel does, with no calls.
  const before = m.calls.length;
  sr.querySelector(".backdrop").click();
  assert(document.querySelector("hsc-edit-sheet"), "edits aren't lost to a stray tap");
  sr.querySelector(".cancel").click();
  assert(!document.querySelector("hsc-edit-sheet"));
  assert.strictEqual(m.calls.length, before);
  rows[1].click();
  sr = document.querySelector("hsc-edit-sheet").shadowRoot;
  sr.querySelector(".backdrop").click();
  assert(!document.querySelector("hsc-edit-sheet"), "an unchanged sheet closes on the backdrop");
  rows[1].click();
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  assert(!document.querySelector("hsc-edit-sheet"), "Escape closes");

  // Dragging a divider (jsdom has no layout: give the bar a width).
  rows[1].click();
  sheet = document.querySelector("hsc-edit-sheet");
  sr = sheet.shadowRoot;
  sr.querySelector(".ebar .bar").getBoundingClientRect = () => ({ left: 100, width: 960, top: 0, height: 44, right: 1060, bottom: 44 });
  const ev = (type, x) => new window.MouseEvent(type, { bubbles: true, composed: true, button: 0, clientX: x });
  sr.querySelector('.h[data-h="1"]').dispatchEvent(ev("pointerdown", 0));
  sr.querySelector(".ebar").dispatchEvent(ev("pointermove", 100 + 480)); // 12:00
  eq(times()[0], "00:00– 12:00=Night");
  sr.querySelector(".ebar").dispatchEvent(ev("pointermove", 100 + 2000)); // past the next divider
  eq(times()[1], "21:15– 21:30=Day", "a divider stops a quarter hour before the next");
  sr.querySelector(".ebar").dispatchEvent(ev("pointermove", 100 + 287)); // 07:10 → 07:15
  sr.querySelector(".ebar").dispatchEvent(ev("pointerup", 0));
  sr.querySelector(".ebar").dispatchEvent(ev("pointermove", 100 + 600));
  eq(times()[0], "00:00– 07:15=Night", "snaps to quarter hours; moves stop at pointerup");
  // Keyboard: a divider is a slider.
  const h1 = sr.querySelector('.h[data-h="1"]');
  h1.focus();
  h1.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, composed: true }));
  eq(times()[0], "00:00– 07:30=Night");
  assert.strictEqual(sr.activeElement?.dataset.h, "1", "focus stays on the divider");

  // Save: Master Bedroom, weekend only, 07:30 → split its daily schedule.
  sr.querySelector('[data-mask="96"]').click();
  assert.strictEqual(sr.querySelector(".days-hint").textContent, "Weekdays keep the current times.");
  assert.strictEqual(sr.querySelector(".sub").textContent, "Weekend");
  sr.querySelector(".save").click();
  await tick(5);
  assert(!document.querySelector("hsc-edit-sheet"), "closes after saving");
  const saved = m.calls.slice(-2);
  eq(saved.map((c) => `${c[0]}.${c[1]}`), ["scheduler.edit", "scheduler.add"]);
  eq(saved[0][2], { entity_id: "switch.schedule_master_bedroom", weekdays: ["mon", "tue", "wed", "thu", "fri"], name: "Master Bedroom heating (Weekdays)",
    start_date: null, end_date: null }, "the daily schedule keeps the weekdays");
  eq(saved[1][2].weekdays, ["sat", "sun"]);
  eq(saved[1][2].name, "Master Bedroom heating (Weekend)");
  eq(saved[1][2].timeslots.map((s) => `${s.start}-${s.stop}:${s.actions[0].service_data.option}`),
    ["00:00:00-07:30:00:night", "07:30:00-21:30:00:comfort", "21:30:00-00:00:00:night"]);
  assert(saved.every((c) => c[3] === false), "calls without Home Assistant's own error toast");
  // After the update event the card re-reads: the day strip appears.
  m.subs[0]({ event: "scheduler_item_updated" });
  await tick(300);
  assert(!root.querySelector(".days").hidden, "days differ now: the day strip shows");
  eq([...root.querySelectorAll(".days button")].map((b) => b.getAttribute("aria-pressed")), ["false", "false", "false", "false", "false", "true", "false"]);
  assert.strictEqual(root.querySelector('.days button[data-day="5"]').getAttribute("aria-current"), "date");
  eq(blocks(1)[0], [0, 31.25], "Saturday: 07:30");
  root.querySelector('.days button[data-day="0"]').click();
  eq(blocks(1)[0], [0, 39.583], "Monday: 09:30");
  assert(rows[1].querySelector(".now").hidden, "no now line on another day");

  // Undo the split from Monday: Every day → the two schedules merge back into one.
  rows[1].click();
  sr = document.querySelector("hsc-edit-sheet").shadowRoot;
  eq(dms(), ["Every day", "Weekdays*", "Monday only"]);
  sr.querySelector('[data-mask="127"]').click();
  assert.strictEqual(sr.querySelector(".days-hint").textContent, "Replaces the current times at the weekend.");
  sr.querySelector(".save").click();
  await tick(5);
  eq(m.sched.list.filter((s) => s.timeslots.some((x) => x.actions.some((a) => a.entity_id === MB))).map((s) => [s.weekdays, s.name]),
    [[["daily"], "Master Bedroom heating"]], "one daily schedule again");
  m.subs[0]({});
  await tick(300);
  assert(root.querySelector(".days").hidden, "same every day again: no day strip");
  m.card.remove();

  // ---- Give one shared room its own times (rooms) ----
  m = mount();
  await tick(5);
  root = m.root();
  root.querySelectorAll(".room")[0].click();
  sr = document.querySelector("hsc-edit-sheet").shadowRoot;
  sr.querySelector('[data-room="2"]').click(); // Second Bedroom out
  sr.querySelector('[data-room="3"]').click(); // Study out
  assert.strictEqual(sr.querySelector(".rooms-hint").textContent, "Second Bedroom and Study keep their current times.");
  sr.querySelectorAll(".blk")[1].querySelector('[data-step="15"]').click(); // Day from 06:15
  sr.querySelector(".save").click();
  await tick(5);
  let out = m.calls.slice(-2);
  eq(out.map((c) => `${c[0]}.${c[1]}`), ["scheduler.edit", "scheduler.add"]);
  eq(out[0][2].name, "Second Bedroom and Study heating", "the shared schedule is renamed for the rooms left");
  assert(out[0][2].timeslots.every((s) => s.actions.every((a) => a.entity_id !== LR)), "Living Room leaves it");
  assert(out[0][2].timeslots.every((s) => !("conditions" in s) && !("condition_type" in s)), "empty conditions aren't sent");
  eq(out[0][2].timeslots.map((s) => s.start), ["00:00:00", "06:00:00", "21:30:00"], "their times are untouched");
  eq(out[1][2].name, "Living Room heating");
  eq(out[1][2].weekdays, ["daily"]);
  eq(out[1][2].timeslots[1].start, "06:15:00");
  m.card.remove();

  // ---- Copy to another room; and errors ----
  m = mount({ fail: (d, s) => d === "scheduler" && s === "edit" });
  await tick(5);
  root = m.root();
  root.querySelectorAll(".room")[3].click(); // Study
  sr = document.querySelector("hsc-edit-sheet").shadowRoot;
  sr.querySelector('[data-room="1"]').click(); // + Master Bedroom
  assert.strictEqual(sr.querySelector(".rooms-hint").textContent, "Master Bedroom gets these times too.");
  sr.querySelectorAll(".blk")[0].querySelector('[data-mode="away"]').click();
  sr.querySelector(".save").click();
  await tick(5);
  assert(document.querySelector("hsc-edit-sheet"), "a failed save keeps the sheet open");
  assert.strictEqual(sr.querySelector(".err").textContent, "Couldn't save: Entity not found: switch.schedule_x");
  assert.strictEqual(sr.querySelector(".save").textContent.trim(), "Save");
  sr.querySelector(".cancel").click();
  m.card.remove();

  // A helper without the mode can't take the times.
  m = mount();
  await tick(5);
  m.S[MB] = st("comfort", { options: ["comfort", "night"] });
  m.push();
  root = m.root();
  root.querySelectorAll(".room")[3].click();
  sr = document.querySelector("hsc-edit-sheet").shadowRoot;
  sr.querySelector('[data-room="1"]').click();
  sr.querySelectorAll(".blk")[0].querySelector('[data-mode="away"]').click();
  const n0 = m.calls.length;
  sr.querySelector(".save").click();
  await tick(5);
  assert.strictEqual(m.calls.length, n0);
  assert.strictEqual(sr.querySelector(".err").textContent, `Master Bedroom's schedule helper has no "away" option, so it can't take these times.`);
  sr.querySelector(".cancel").click();
  // Saving with nothing changed closes without a call.
  root.querySelectorAll(".room")[3].click();
  document.querySelector("hsc-edit-sheet").shadowRoot.querySelector(".save").click();
  await tick(5);
  assert(!document.querySelector("hsc-edit-sheet"));
  assert.strictEqual(m.calls.length, n0);
  m.card.remove();

  // ---- Scheduler missing ----
  const e = new Error("Unknown command.");
  e.code = "unknown_command";
  m = mount({ wsError: e });
  await tick(5);
  assert.strictEqual(m.root().querySelector(".status").textContent, "The Scheduler integration isn't installed (HACS: Scheduler component).");
  m.root().querySelectorAll(".room")[0].click();
  assert(!document.querySelector("hsc-edit-sheet"), "no editor without schedules");
  m.card.remove();

  // ---- Planner, directly ----
  const rooms = ROOMS.map((r, i) => ({ ...r, i, options: { comfort: "comfort", night: "night", away: "away", frost_protection: "frost_protection" } }));
  const byEnt = new Map(rooms.map((r) => [r.schedule, r]));
  const parse = (list) => list.map((raw) => Card.parse(raw, byEnt, null));
  const P = [{ s: 0, m: "night" }, { s: 420, m: "comfort" }, { s: 1320, m: "night" }];
  const ops = (list, targets, days, prog = P) => Card.plan(parse(list), rooms, new Set(targets), days, prog);
  const brief = (o) => o.map((x) => `${x.service}:${x.data.entity_id || x.data.name}${x.data.weekdays ? `[${x.data.weekdays}]` : ""}${x.data.timeslots ? "+t" : ""}${x.data.name && x.data.entity_id ? `>${x.data.name}` : ""}`);

  eq(brief(ops(liveSchedules(), [LR, SB, ST], 127)), ["edit:switch.schedule_31efb0+t"], "all its rooms, all days: rewrite the times");
  eq(brief(ops(liveSchedules(), [LR, SB, ST], 96)),
    ["edit:switch.schedule_31efb0[mon,tue,wed,thu,fri]>Living Room, Second Bedroom and Study heating (Weekdays)", "add:Living Room, Second Bedroom and Study heating (Weekend)[sat,sun]+t"]);
  eq(brief(ops(liveSchedules(), [LR], 32)),
    ["edit:switch.schedule_31efb0+t>Second Bedroom and Study heating", "add:Living Room heating (Sun–Fri)[mon,tue,wed,thu,fri,sun]+t".replace("Sun–Fri", "Mon–Fri, Sun"), "add:Living Room heating (Saturday)[sat]+t"],
    "some rooms, some days: the room leaves, keeping its old times on the other days");
  eq(brief(ops(liveSchedules(), [ST, MB], 127)), ["edit:switch.schedule_31efb0+t>Living Room and Second Bedroom heating", "edit:switch.schedule_master_bedroom+t", "add:Study heating[daily]+t"]);
  // Nothing changes when the times are the same.
  eq(ops(liveSchedules(), [LR, SB, ST], 127, [{ s: 0, m: "night" }, { s: 360, m: "comfort" }, { s: 1290, m: "night" }]), []);
  // A room with no schedule at all gets one.
  const onlyMaster = liveSchedules().slice(1);
  eq(brief(ops(onlyMaster, [LR], 127)), ["add:Living Room heating[daily]+t"]);
  // Two rooms copied together share one new schedule.
  eq(brief(ops(onlyMaster, [LR, ST], 127)), ["add:Living Room and Study heating[daily]+t"]);
  // Other actions in a schedule (a lamp) stay; the room's actions leave.
  const withLamp = liveSchedules();
  withLamp[1].timeslots.forEach((s) => s.actions.push({ service: "light.turn_on", entity_id: "light.lamp", service_data: {} }));
  let o = ops(withLamp, [MB], 127);
  eq(brief(o), ["edit:switch.schedule_master_bedroom+t", "add:Master Bedroom heating[daily]+t"]);
  assert(!o[0].data.name, "a schedule with other actions keeps its name");
  eq(o[0].data.timeslots.map((s) => s.actions.map((a) => a.entity_id)), [["light.lamp"], ["light.lamp"], ["light.lamp"]]);
  // Conditions and dates are kept when only rooms leave; a disabled schedule is switched on first.
  const cond = liveSchedules();
  cond[0].timeslots.forEach((s) => (s.conditions = [{ entity_id: "binary_sensor.x", value: "on", match_type: "is" }]) && (s.condition_type = "and"));
  cond[0].start_date = "2026-10-01";
  cond[0].enabled = false;
  o = ops(cond, [LR], 127);
  eq(o.map((x) => `${x.domain}.${x.service}`), ["switch.turn_on", "scheduler.edit", "scheduler.add"]);
  eq(o[1].data.timeslots[0].conditions, [{ entity_id: "binary_sensor.x", value: "on", match_type: "is" }]);
  eq(o[1].data.timeslots[0].condition_type, "and");
  eq(o[1].data.start_date, "2026-10-01", "the date range goes back unchanged");
  // A non-plain schedule whose every room changes is replaced, not rewritten in place.
  o = ops(cond, [LR, SB, ST], 127);
  eq(brief(o), ["add:Living Room, Second Bedroom and Study heating[daily]+t", "remove:switch.schedule_31efb0"], "replaced (and the new one runs), not switched on first");
  // Merge: weekday + weekend schedules with the same times become one.
  const split = liveSchedules();
  split[1].weekdays = ["mon", "tue", "wed", "thu", "fri"];
  split.push({ ...JSON.parse(JSON.stringify(split[1])), schedule_id: "w", entity_id: "switch.schedule_w", name: "MB weekend", weekdays: ["sat", "sun"],
    timeslots: [slot("00:00:00", "08:00:00", [MB], "night"), slot("08:00:00", "21:30:00", [MB], "comfort"), slot("21:30:00", "00:00:00", [MB], "night")] });
  const weekdayTimes = [{ s: 0, m: "night" }, { s: 570, m: "comfort" }, { s: 1290, m: "night" }];
  eq(brief(ops(split, [MB], 96, weekdayTimes)), ["edit:switch.schedule_master_bedroom[daily]>Master Bedroom heating", "remove:switch.schedule_w"],
    "the weekend given the weekday times: one schedule again");
  // Programme parsing: triggers without a stop hold until the next one, wrapping midnight.
  const trig = Card.parse({ schedule_id: "t", entity_id: "switch.t", weekdays: ["daily"], timeslots: [
    { start: "06:30:00", actions: [act(LR, "comfort")] }, { start: "22:00:00", actions: [act(LR, "night")] }] }, byEnt, null);
  eq(trig.rooms.get(LR), [{ s: 0, m: "night" }, { s: 390, m: "comfort" }, { s: 1320, m: "night" }]);
  assert(!trig.plain, "triggers aren't plain");
  const sun = Card.parse({ schedule_id: "u", entity_id: "switch.u", weekdays: ["daily"], timeslots: [
    { start: "sunrise+00:30", stop: "22:00:00", actions: [act(LR, "comfort")] }] }, byEnt, { sunrise: 450, sunset: 1080 });
  eq(sun.rooms.get(LR), [{ s: 0, m: null }, { s: 480, m: "comfort" }, { s: 1320, m: null }], "sunrise+00:30 placed with today's sunrise; gaps are null");

  console.log("ALL HEATING SCHEDULE CARD TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
