import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFile, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The C4 model (architecture/<name>/workspace.dsl, D-036), rendered with drawing-office
// (github.com/devpath56/drawing-office, cloned into tools/, which is git-ignored) and structurizr-cli
// in Docker. Needs Docker running.
//   npm run c4          stamp the palette, export workspace.json and the site, write the index and the trace frames
//   npm run c4:check    drawing-office's checks, on this repo's model
//   npm run c4:serve    the viewer on http://127.0.0.1:8015/architecture/viewer.html
//   npm run c4:page     one self-contained page per model, for sharing: architecture/<name>/page.html
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const OFFICE = path.join(ROOT, "tools", "drawing-office");
const ARCH = path.join(ROOT, "architecture");
// The last image that ships the CLI and Graphviz; "latest" is now only a notice that it moved.
const IMAGE = "structurizr/cli:2025.11.09";

// The checks that take --root. The rest of drawing-office's suite tests drawing-office itself.
const CHECKS = [
  "diagram-contrast", "palette-claim", "legibility", "projects", "derived", "delivery", "stage", "element-state",
  "pubsub", "perspectives", "hop-examples", "decisions", "diagram-key", "site-fresh", "named-controls",
];
// A check that finds nothing of its kind in the model passes without judging anything.
const NOTHING_TO_CHECK = /ABSENT|declares no message channel/;

function run(cmd: string, args: string[], quiet = false) {
  const r = spawnSync(cmd, args, { stdio: quiet ? "pipe" : "inherit", encoding: "utf8" });
  if (r.error) throw new Error(`couldn't run ${cmd}: ${r.error.message}`);
  return { ok: r.status === 0, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

function must(cmd: string, args: string[], quiet = false) {
  const r = run(cmd, args, quiet);
  if (r.ok) return;
  if (quiet) console.error(r.out);
  process.exit(1);
}

// Only architecture/ goes into the container: the DSL, its decision records and the exports all live there.
function docker(args: string[], opts: { entrypoint?: string; workdir?: string } = {}) {
  const flags = ["run", "--rm", "-v", `${ARCH}:${ARCH}`, "-w", opts.workdir ?? ARCH];
  if (opts.entrypoint) flags.push("--entrypoint", opts.entrypoint);
  must("docker", [...flags, IMAGE, ...args], true);
}

function models(): string[] {
  return readdirSync(ARCH, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(path.join(ARCH, e.name, "workspace.dsl")))
    .map((e) => path.join(ARCH, e.name, "workspace.dsl"));
}

// drawing-office's own build (tools/build.mjs) stamps its package palette rather than this repo's
// theme.json, since it doesn't pass --root on to the palette writer. So its steps run here.
function build() {
  for (const dsl of models()) {
    must("node", [path.join(OFFICE, "checks/diagram-contrast.mjs"), "--write", dsl, "--root", ROOT]);
    docker(["export", "-w", dsl, "-f", "json", "-o", path.dirname(dsl)]);
    docker(["export", "-w", dsl, "-f", "static", "-o", path.join(path.dirname(dsl), "site")]);
  }
  must("node", [path.join(OFFICE, "checks/diagram-contrast.mjs"), "--index", "--root", ROOT]);
  // The frames the viewer's step-by-step walk reveals; structurizr-cli doesn't write them.
  must("node", [path.join(OFFICE, "tools/trace-animate.mjs"), "--root", ROOT]);
  console.log(`built ${models().length} model(s)`);
}

type CheckRow = { name: string; state: "pass" | "n/a" | "fail"; out: string };

function runChecks(): CheckRow[] {
  return CHECKS.map((name) => {
    const r = run("node", [path.join(OFFICE, "checks", `${name}.mjs`), "--root", ROOT], true);
    return { name, state: !r.ok ? "fail" : NOTHING_TO_CHECK.test(r.out) ? "n/a" : "pass", out: r.out };
  });
}

function tally(rows: CheckRow[]) {
  const n = (state: CheckRow["state"]) => rows.filter((r) => r.state === state).length;
  return { pass: n("pass"), na: n("n/a"), fail: n("fail") };
}

function check() {
  const rows = runChecks();
  for (const r of rows) {
    console.log(`${r.state === "pass" ? "ok  " : r.state === "n/a" ? "n/a " : "FAIL"} ${r.name}`);
    if (r.state === "fail") console.log(r.out.trimEnd().replace(/^/gm, "     "));
  }
  const t = tally(rows);
  console.log(`\n${t.pass} pass · ${t.na} with nothing to check in this model · ${t.fail} fail`);
  process.exit(t.fail ? 1 : 0);
}

// ── the shareable page ──────────────────────────────────────────────────────────────────────────
// The exported site bundles Structurizr's viewer and its libraries. This page is the same model and
// the same Graphviz layout in one self-contained file, with the traces walkable step by step.

// The Structurizr workspace export, read as plain JSON.
type Json = Record<string, any>;
interface PageElement {
  name: string;
  kind: string;
  tech: string;
  desc: string;
  ours: boolean;
  state: string | null;
  decisions: { id: string; title: string; status: string }[];
  parent: string | null;
  holds?: string[];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const STATES = ["Modified", "Proposal"];
const LABEL_SUFFIX = /\s*(modified|proposed) — hover for details\s*$/;

// An ADR's sections (Status, Context, Decision, Consequences) as one line each.
function sections(md: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of md.matchAll(/^## (\w+)\n\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)) out[m[1].toLowerCase()] = m[2].split(/\s+/).join(" ").trim();
  return out;
}

function readModel(ws: Json) {
  const elements: Record<string, PageElement> = {};
  const rels: Record<string, { from: string; to: string; tech: string; async: boolean }> = {};
  const decisions: Json[] = [];
  const record = (scope: string | null, d: Json) =>
    decisions.push({ scope, id: d.id, title: d.title, status: d.status, date: String(d.date).slice(0, 10), ...sections(d.content) });

  const take = (e: Json, kind: string, parent: string | null) => {
    const tags = String(e.tags ?? "").split(",").map((t) => t.trim());
    const own = (e.documentation?.decisions ?? []) as Json[];
    elements[e.id] = {
      name: e.name,
      kind,
      tech: e.technology ?? "",
      desc: String(e.description ?? "").replace(LABEL_SUFFIX, ""),
      ours: !tags.includes("Existing System") && kind !== "Person",
      state: STATES.find((s) => tags.includes(s)) ?? null,
      decisions: own.map((d) => ({ id: d.id, title: d.title, status: d.status })),
      parent,
    };
    for (const d of own) record(e.name, d);
    for (const r of e.relationships ?? []) rels[r.id] = { from: r.sourceId, to: r.destinationId, tech: r.technology ?? "", async: String(r.tags ?? "").includes("Asynchronous") };
    for (const c of e.containers ?? []) take(c, "Container", e.id);
    for (const c of e.components ?? []) take(c, "Component", e.id);
  };
  for (const d of ws.documentation?.decisions ?? []) record(null, d);
  for (const p of ws.model.people ?? []) take(p, "Person", null);
  for (const s of ws.model.softwareSystems ?? []) take(s, "Software system", null);

  // A box marked because a box inside it is (drawing-office's roll-up rule) says which ones.
  const inside = (id: string): string[] =>
    Object.entries(elements)
      .filter(([, c]) => c.parent === id)
      .flatMap(([k, c]) => [...(c.state ? [c.name] : []), ...inside(k)]);
  for (const [id, e] of Object.entries(elements)) if (e.state && e.decisions.length === 0) e.holds = inside(id);

  const levels: [string, string][] = [["systemContextViews", "C4 level 1"], ["containerViews", "C4 level 2"], ["componentViews", "C4 level 3"], ["dynamicViews", "Trace"]];
  const views = levels.flatMap(([kind, level]) =>
    ((ws.views[kind] ?? []) as Json[]).map((v) => ({
      key: String(v.key),
      level,
      title: String(v.title ?? v.key),
      desc: String(v.description ?? ""),
      elements: (v.elements as Json[]).map((e) => String(e.id)),
      steps:
        kind === "dynamicViews"
          ? ((v.relationships ?? []) as Json[])
              .sort((a, b) => Number(a.order) - Number(b.order))
              .map((r) => ({ n: Number(r.order), ...rels[r.id], desc: String(r.description ?? "") }))
          : [],
    })),
  );
  return { elements, views, decisions };
}

function cleanSvg(svg: string, key: string, elements: Record<string, PageElement>, stateStrokes: string[]): string {
  let s = svg.replace(/<\?xml[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!--[\s\S]*?-->/g, "");
  const box = /viewBox="([\d. ]+)"/.exec(s);
  if (!box) throw new Error(`${key}: Graphviz wrote no viewBox`);
  const [, , w, h] = box[1].trim().split(/\s+/).map(Number);
  s = s.replace(/<svg width="[^"]+" height="[^"]+"/, `<svg class="drawing" data-w="${w.toFixed(1)}" data-h="${h.toFixed(1)}" role="img" aria-label="${esc(key)} diagram" preserveAspectRatio="xMinYMin meet"`);
  s = s.replace(/<g id="[^"]*" class="edge">([\s\S]*?)<\/g>/g, (_m, body: string) => {
    const pair = /<title>(\d+)&#45;&gt;(\d+)<\/title>/.exec(body);
    const step = /<text[^>]*>(\d+)\. /.exec(body);
    return `<g class="edge"${pair ? ` data-from="${pair[1]}" data-to="${pair[2]}"` : ""}${step ? ` data-step="${step[1]}"` : ""}>${body}</g>`;
  });
  s = s.replace(/<g id="([^"]*)" class="node">/g, (_m, id: string) => {
    const e = elements[id];
    return `<g class="node" data-el="${id}" tabindex="0" role="button" aria-label="${esc(e ? `${e.name}, ${e.kind}` : id)}">`;
  });
  s = s.replace(/<g id="[^"]*" class="(graph|cluster)"/g, '<g class="$1"').replace(/<title>[\s\S]*?<\/title>/g, "");
  // Structurizr draws the system boundary in #444444, which a dark plate swallows.
  s = s.replaceAll('stroke="#444444"', 'stroke="#7d8694" stroke-width="2"').replaceAll('fill="#444444"', 'fill="#aab2bf"');
  // Delivery state is the stroke (drawing-office): thick enough to read at a glance.
  for (const c of stateStrokes) s = s.replaceAll(`stroke="${c}"`, `stroke="${c}" stroke-width="6"`);
  return s.replace(/\n\s*\n/g, "\n").trim();
}

async function page() {
  const { POLICY_VERSION } = await import("../server/policy");
  const theme = JSON.parse(readFileSync(path.join(ARCH, "theme.json"), "utf8")) as Json;
  const stateStrokes = (theme.elements as Json[]).filter((r) => STATES.includes(r.tag) && r.stroke).map((r) => String(r.stroke).toLowerCase());
  const checks = tally(runChecks());
  const template = readFileSync(path.join(ROOT, "scripts", "c4-page.html"), "utf8");
  const drawn = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  for (const dsl of models()) {
    const dir = path.dirname(dsl);
    const exported = path.join(dir, "workspace.json");
    if (!existsSync(exported)) {
      console.error(`${path.relative(ROOT, dir)}: no workspace.json yet. Run npm run c4 first.`);
      process.exit(1);
    }
    const ws = JSON.parse(readFileSync(exported, "utf8")) as Json;
    const model = readModel(ws);

    // Graphviz from the same image: one SVG per view, without Structurizr's caption (the page has its own).
    const work = path.join(dir, "page");
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    docker(["export", "-w", dsl, "-f", "dot", "-o", work]);
    for (const f of readdirSync(work).filter((name) => name.endsWith(".dot"))) {
      const file = path.join(work, f);
      const dot = readFileSync(file, "utf8")
        .replace(/\n {2}label=<<br \/>[\s\S]*?>>\n/, "\n")
        .replace('graph [fontname="Arial", ', 'graph [fontname="Arial", bgcolor="transparent", pad="0.4", ');
      writeFileSync(file, dot);
    }
    docker(["-c", 'for f in *.dot; do dot -Tsvg "$f" -o "${f%.dot}.svg"; done'], { entrypoint: "sh", workdir: work });

    const drawings = model.views.map((v) => {
      const svg = readFileSync(path.join(work, `structurizr-${v.key}.svg`), "utf8");
      return `<template id="drawing-${v.key}">${cleanSvg(svg, v.key, model.elements, stateStrokes)}</template>`;
    });
    const data = { meta: { name: ws.name, policy: POLICY_VERSION, checks, drawn }, ...model };
    const thesis = String(ws.description ?? "").split(": ").pop() ?? "";
    const html = template
      .replace("%%TITLE%%", esc(`${ws.name} C4`))
      .replace("%%NAME%%", esc(ws.name))
      .replace("%%THESIS%%", esc(thesis))
      .replace("%%SOURCE%%", esc(path.relative(ROOT, dsl)))
      .replace("%%CLI%%", esc(IMAGE.split(":")[1]))
      .replace("<!--%%DRAWINGS%%-->", () => drawings.join("\n"))
      .replace("/*%%DATA%%*/", () => JSON.stringify(data).replace(/<\//g, "<\\/"));
    const out = path.join(dir, "page.html");
    writeFileSync(out, html);
    console.log(`${path.relative(ROOT, out)}: ${model.views.length} views, ${model.decisions.length} decisions, ${Math.round(html.length / 1024)} KB`);
  }
}

// Not drawing-office's tools/serve.mjs: given this repo as its root, that serves every file in the
// repo, .env included, on every network interface. This serves architecture/ only, to this machine.
function serve(port = 8015) {
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2",
  };
  http
    .createServer((req, res) => {
      let file: string | null = null;
      try {
        const url = decodeURIComponent((req.url ?? "/").split(/[?#]/)[0]);
        const resolved = url.startsWith("/architecture/") && !url.includes("\0") ? path.resolve(ARCH, `.${url.slice("/architecture".length)}`) : null;
        if (resolved?.startsWith(ARCH + path.sep)) file = resolved;
      } catch {
        // a malformed URL is a 404, never a crash
      }
      if (!file) return void res.writeHead(404).end("not found");
      const found = file;
      readFile(found, (err, body) => {
        if (err) return void res.writeHead(404).end("not found");
        res.writeHead(200, { "Content-Type": types[path.extname(found)] ?? "application/octet-stream", "Cache-Control": "no-store" }).end(body);
      });
    })
    .listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}/architecture/viewer.html`));
}

// drawing-office has no license, so its viewer and palette aren't redistributed in this repo: each
// run copies them in from the clone (both git-ignored), with this model's two changes to the
// palette: no deployment view, so no Deployment Node row, and solid relationship lines.
function officeFiles() {
  const from = path.join(OFFICE, "architecture");
  copyFileSync(path.join(from, "viewer.html"), path.join(ARCH, "viewer.html"));
  const theme = JSON.parse(readFileSync(path.join(from, "theme.json"), "utf8")) as {
    elements: { tag: string }[];
    relationships: { tag: string; dashed?: boolean }[];
    noClaim: string[];
  };
  theme.elements = theme.elements.filter((e) => e.tag !== "Deployment Node");
  theme.noClaim = theme.noClaim.filter((tag) => tag !== "Deployment Node");
  for (const r of theme.relationships) if (r.tag === "Relationship") r.dashed = false;
  writeFileSync(path.join(ARCH, "theme.json"), `${JSON.stringify(theme, null, 2)}\n`);
}

if (!existsSync(OFFICE)) {
  console.error("drawing-office isn't in tools/. Clone it: git clone --depth 1 https://github.com/devpath56/drawing-office tools/drawing-office");
  process.exit(3);
}
officeFiles();
const verb = process.argv[2] ?? "build";
if (verb === "build") build();
else if (verb === "check") check();
else if (verb === "serve") serve();
else if (verb === "page") await page();
else {
  console.error("usage: tsx scripts/c4.ts [build|check|serve|page]");
  process.exit(2);
}
