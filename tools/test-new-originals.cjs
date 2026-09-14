const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const dir = path.join(__dirname, "..", "games", "originals");
const targets = ["flood-it", "reversi", "tower-stack", "rhythm-tap", "golf-solitaire"];

function run(name) {
  const html = fs.readFileSync(path.join(dir, name + ".html"), "utf8");
  const errors = [];
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: "https://arcadecampushub.online/",
    beforeParse(win) {
      win.requestAnimationFrame = () => 0;   // stop game loops after 1 frame
      win.cancelAnimationFrame = () => {};
      win.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => ({}) });
      win.onerror = (msg) => errors.push(String(msg));
    },
  });
  const win = dom.window, doc = win.document;

  function fire(el, type) {
    if (!el) return;
    const evt = new win.Event(type, { bubbles: true, cancelable: true });
    try { el.dispatchEvent(evt); } catch (e) { errors.push(type + ": " + e.message); }
  }

  const checks = {};
  try {
    if (name === "flood-it") {
      checks.cells = doc.querySelectorAll("#board .cell").length; // 14*14
      checks.pickers = doc.querySelectorAll(".pick").length;
      doc.querySelectorAll(".pick").forEach((p, i) => { if (i < 3) fire(p, "click"); });
      fire(doc.getElementById("new"), "click");
      fire(doc.getElementById("size"), "click");
    } else if (name === "reversi") {
      checks.cells = doc.querySelectorAll("#board .cell").length; // 64
      checks.discs = doc.querySelectorAll(".disc").length;        // 4 start
      doc.querySelectorAll(".cell.legal").forEach((c, i) => { if (i === 0) fire(c, "click"); });
      fire(doc.getElementById("new"), "click");
      fire(doc.getElementById("diff"), "click");
    } else if (name === "tower-stack") {
      checks.canvas = !!doc.getElementById("c");
      fire(doc.getElementById("c"), "pointerdown");
      const kd = new win.KeyboardEvent("keydown", { code: "Space", bubbles: true });
      win.dispatchEvent(kd);
    } else if (name === "rhythm-tap") {
      checks.canvas = !!doc.getElementById("c");
      fire(doc.getElementById("start"), "click");
      const kd = new win.KeyboardEvent("keydown", { code: "KeyD", bubbles: true });
      win.dispatchEvent(kd);
    } else if (name === "golf-solitaire") {
      checks.cards = doc.querySelectorAll("#tableau .card").length; // 35
      checks.found = doc.getElementById("found").textContent;
      fire(doc.getElementById("stock"), "click");
      const top = doc.querySelector("#tableau .card.play");
      if (top) fire(top, "click");
      fire(doc.getElementById("new"), "click");
    }
  } catch (e) {
    errors.push("exec: " + e.message);
  }
  return { name, errors, checks };
}

let ok = true;
for (const t of targets) {
  const r = run(t);
  const status = r.errors.length ? "FAIL" : "PASS";
  if (r.errors.length) ok = false;
  console.log(`[${status}] ${r.name}  ${JSON.stringify(r.checks)}` + (r.errors.length ? "  ERR=" + JSON.stringify(r.errors) : ""));
}
console.log(ok ? "\nALL GAMES PASSED" : "\nSOME GAMES FAILED");
process.exit(ok ? 0 : 1);
