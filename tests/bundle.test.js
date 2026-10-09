// The HACS bundle: up to date with cards/, and every card registers from it. Run: npm test
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
execFileSync(process.execPath, [path.join(root, "scripts", "build.js"), "--check"], { stdio: "inherit" });

const src = fs.readFileSync(path.join(root, "dist", "homeassistant-custom-cards.js"), "utf8");
const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;
window.eval(src);
window.customElements.define("home-assistant", class extends window.HTMLElement {});
const tags = fs.readdirSync(path.join(root, "cards")).filter((d) => fs.existsSync(path.join(root, "cards", d, `${d}.js`)));

(async () => {
  await new Promise((r) => setTimeout(r, 0));
  for (const t of tags) assert(window.customElements.get(t), `${t} registered from the bundle`);
  // Loading the bundle twice (e.g. old /local copy still listed) must not throw.
  window.eval(src);
  await new Promise((r) => setTimeout(r, 0));
  assert.strictEqual(new Set((window.customCards || []).map((c) => c.type)).size, tags.length);
  console.log(`ALL BUNDLE TESTS PASSED (${tags.length} cards)`);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
