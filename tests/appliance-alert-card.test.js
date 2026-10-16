// Behaviour test for appliance-alert-card (runs the real card in jsdom). Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const src = fs.readFileSync(path.join(__dirname, "..", "cards", "appliance-alert-card", "appliance-alert-card.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true, url: "https://ha.local/lovelace/clothes-dryer" });
const { window } = dom;
window.eval(src);
assert(!window.customElements.get("appliance-alert-card"), "waits for the app");
window.customElements.define("home-assistant", class extends window.HTMLElement {});
const { document } = window;
const eq = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); // cross-realm safe
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const T = (iso) => Date.parse(iso);
const st = (state, attributes = {}) => ({ state: String(state), attributes });

const calls = [];
let failNext = null;

// Live values as read on 16 Oct 2026 (the dryer's tank filled at 20:34:47 BST on the 15th).
function states(over = {}) {
  return {
    "input_boolean.clothes_dryer_tank_alert": st("on", { friendly_name: "Clothes dryer tank alert", icon: "mdi:water-alert" }),
    "input_datetime.clothes_dryer_tank_full_since": st("2026-10-15 20:34:47", {
      has_date: true, has_time: true, editable: true, year: 2026, month: 10, day: 15, hour: 20, minute: 34, second: 47,
      timestamp: 1792092887.09, friendly_name: "Clothes dryer tank full since",
    }),
    "input_boolean.dehumidifier_tank_alert": st("off", { friendly_name: "Dehumidifier tank alert" }),
    "switch.study_lamp": st("on", { friendly_name: "Study lamp" }),
    "sensor.dryer_stopped": st("2026-10-15T19:34:47+00:00", { device_class: "timestamp" }),
    ...over,
  };
}
function hass(over = {}) {
  return {
    config: { time_zone: "Europe/London" },
    locale: { language: "en-GB", time_zone: "server" },
    states: states(over),
    callService: async (d, s, data) => {
      calls.push([d, s, data]);
      if (failNext) {
        const e = failNext;
        failNext = null;
        throw e;
      }
    },
  };
}
const DRYER = { entity: "input_boolean.clothes_dryer_tank_alert", since: "input_datetime.clothes_dryer_tank_full_since" };

function mount(cfg, h, now) {
  const card = document.createElement("appliance-alert-card");
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
const view = (card) => {
  const r = card.shadowRoot;
  return {
    hidden: card.hidden,
    nm: r.querySelector(".nm").textContent,
    sc: r.querySelector(".sc").textContent,
    one: r.querySelector(".txt").classList.contains("one"),
    icon: r.querySelector(".slot ha-icon").getAttribute("icon"),
    pill: r.querySelector(".pill").textContent.trim(),
    disabled: r.querySelector(".pill").getAttribute("aria-disabled"),
  };
};

(async () => {
  await tick();
  const Card = window.customElements.get("appliance-alert-card");
  assert(Card, "defined after home-assistant");
  assert.throws(() => new Card().setConfig({}), /entity/);
  const form = JSON.stringify(Card.getConfigForm().schema);
  for (const k of ["entity", "since", "message", "icon", "clear_label"]) assert(form.includes(`"name":"${k}"`), `editor field ${k}`);
  assert.strictEqual(
    Card.getStubConfig({ states: { "input_boolean.home_master": {}, "input_boolean.dehumidifier_tank_alert": {} } }).entity,
    "input_boolean.dehumidifier_tank_alert",
  );
  assert(window.customCards.some((c) => c.type === "appliance-alert-card"), "listed in the card picker");

  // 1. The dryer's tank filled at 20:34; six minutes later the card is up, with the stop time.
  const evening = T("2026-10-15T20:40:00+01:00");
  const card = mount(DRYER, hass(), evening);
  await tick(10);
  eq(view(card), {
    hidden: false, nm: "Water tank full, please empty", sc: "Stopped at 20:34", one: false,
    icon: "mdi:water-alert", pill: "Cleared", disabled: "false",
  }, "alert on: message, stop time, Cleared");
  eq(card.ev, [], "visible from the start: no visibility event needed");
  assert(card.shadowRoot.querySelector(".wrap").getAttribute("role") === "alert", "announced as an alert");

  // 2. Next morning it says the day; after a week, the date.
  card._now = () => T("2026-10-16T07:40:00+01:00");
  card.hass = hass();
  assert.strictEqual(view(card).sc, "Stopped at Thu 20:34");
  card._now = () => T("2026-10-24T07:40:00+01:00");
  card.hass = hass();
  assert.strictEqual(view(card).sc, "Stopped on 15 Oct");
  card._now = () => evening;
  card.hass = hass();

  // 3. Stability: a hass update with nothing new keeps the same nodes (taps are never lost).
  const pill = card.shadowRoot.querySelector(".pill");
  const nm = card.shadowRoot.querySelector(".nm").firstChild;
  card.hass = hass();
  assert.strictEqual(card.shadowRoot.querySelector(".pill"), pill, "same pill node");
  assert.strictEqual(card.shadowRoot.querySelector(".nm").firstChild, nm, "message text not rewritten");

  // 4. Cleared turns the alert off at once (no dialog); a second tap while it settles does nothing.
  pill.click();
  await tick();
  eq(calls, [["input_boolean", "turn_off", { entity_id: "input_boolean.clothes_dryer_tank_alert" }]], "one turn_off");
  assert.strictEqual(document.querySelector("aac-confirm-dialog"), null, "no dialog");
  assert.strictEqual(view(card).disabled, "true", "the pill rests until the state changes");
  pill.click();
  await tick();
  assert.strictEqual(calls.length, 1, "no second call");

  // 5. The alert goes off: the card hides itself and tells Home Assistant's card wrapper.
  card.hass = hass({ "input_boolean.clothes_dryer_tank_alert": st("off", { friendly_name: "Clothes dryer tank alert" }) });
  assert.strictEqual(card.hidden, true, "hidden while off");
  eq(card.ev, [["visible", false]], "visibility event");
  card.hass = hass({ "input_boolean.clothes_dryer_tank_alert": st("off", { friendly_name: "Clothes dryer tank alert" }) });
  eq(card.ev, [["visible", false]], "no repeat while still off");

  // 6. Back on (the next full tank): shown again, pill live again.
  card.hass = hass();
  eq([card.hidden, view(card).disabled], [false, "false"], "shown again");
  eq(card.ev, [["visible", false], ["visible", true]]);

  // 7. A failed call says so (Home Assistant's message, else ours) and the pill works again.
  calls.length = 0;
  failNext = {};
  card.shadowRoot.querySelector(".pill").click();
  await tick();
  eq(card.ev.slice(-1), [["notification", "Couldn't clear Clothes dryer tank alert."]], "our message, with the friendly name");
  assert.strictEqual(view(card).disabled, "false", "pill usable again");
  failNext = { message: "Unauthorized" };
  card.shadowRoot.querySelector(".pill").click();
  await tick();
  eq(card.ev.slice(-1), [["notification", "Unauthorized"]], "Home Assistant's own message");

  // 8. Unavailable alert: hidden. Unknown stop time: no second line, the message nudged to centre.
  card.hass = hass({ "input_boolean.clothes_dryer_tank_alert": st("unavailable") });
  assert.strictEqual(card.hidden, true, "hidden while unavailable");
  card.hass = hass({ "input_datetime.clothes_dryer_tank_full_since": st("unknown") });
  eq([card.hidden, view(card).sc, view(card).one], [false, "", true], "no stop time");

  // 9. In the dashboard editor (preview) the card shows while off and says when it appears; Cleared is inert.
  calls.length = 0;
  const pre = mount({ entity: "input_boolean.dehumidifier_tank_alert" }, hass(), evening);
  assert.strictEqual(pre.hidden, true, "off: hidden on the dashboard");
  pre.preview = true;
  eq([pre.hidden, view(pre).sc, view(pre).disabled], [false, "Shows while Dehumidifier tank alert is on", "true"], "editor preview");
  pre.shadowRoot.querySelector(".pill").click();
  await tick();
  eq(calls, [], "no call from the preview");
  pre.preview = false;
  assert.strictEqual(pre.hidden, true, "hidden again after editing");

  // 10. Options: message, icon, button label; a switch is turned off through its own domain; a
  //     timestamp sensor works as the stop time.
  const sw = mount(
    { entity: "switch.study_lamp", since: "sensor.dryer_stopped", message: "Filter needs cleaning", icon: "mdi:air-filter", clear_label: "Done" },
    hass(),
    evening,
  );
  eq([view(sw).nm, view(sw).icon, view(sw).pill, view(sw).sc], ["Filter needs cleaning", "mdi:air-filter", "Done", "Stopped at 20:34"]);
  sw.shadowRoot.querySelector(".pill").click();
  await tick();
  eq(calls.slice(-1), [["switch", "turn_off", { entity_id: "switch.study_lamp" }]], "switch.turn_off");

  // 11. Side padding: a plain 10px, and the row moves out by the border width with a negative
  //     margin. Never calc(10px - var(--ha-card-border-width)) on the padding: a theme's bare 0
  //     makes that invalid and the padding 0 (the home view's "Mushroom Shadow" theme did).
  const css = card.shadowRoot.querySelector("style").textContent;
  assert(/ha-card \{ padding: 12px 10px;/.test(css), "plain padding");
  assert(css.includes(".wrap { display: flex; align-items: center; gap: 10px; margin: 0 calc(-1 * var(--ha-card-border-width, 1px)); }"), "border offset as a margin");
  assert(!/padding:[^;]*var\(--ha-card-border-width/.test(css), "no border variable inside a padding");

  // 12. Text is escaped.
  const x = mount({ entity: "input_boolean.clothes_dryer_tank_alert", message: "<b>Tank</b> & co" }, hass(), evening);
  assert.strictEqual(view(x).nm, "<b>Tank</b> & co");
  assert.strictEqual(x.shadowRoot.querySelector(".nm b"), null, "no markup injected");

  console.log("ALL APPLIANCE-ALERT-CARD TESTS PASSED");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
