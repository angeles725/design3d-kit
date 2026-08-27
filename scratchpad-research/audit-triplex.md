# Triplex — strict source-level audit

**Audited clone:** `scratchpad/repos/triplex` (shallow, depth‑1)
**Date:** 2026-08-26
**Auditor scope:** read actual files, not marketing. Every claim below cites a path.

---

## 0. Ownership & maintenance (confirmed from code)

- **Repo MOVED — confirmed.** `git remote -v` → `https://github.com/try-triplex/triplex.git`.
  The VS Code manifest (`apps/vscode/package.json`) hardcodes the new home: `"publisher": "trytriplex"`,
  bug/repo URLs `https://github.com/trytriplex/triplex`, sponsor `https://github.com/sponsors/itsdouges`.
  The old `pmndrs/triplex` path survives only as **stale image URLs** in `README.md` (the logo/gif `<img src>`
  still point at `github.com/pmndrs/triplex/blob/main/...`) — cosmetic lag, not current ownership.
- **Current owner:** Michael Dougall (GitHub `itsdouges`). Every source header (`scripts/header.js`) reads
  `Copyright (c) 2022—present Michael Dougall. All rights reserved.` Still Poimandres‑community‑adjacent
  (Discord link, `@pmndrs` Twitter, Vercel OSS Program badge in README) but the canonical repo is the
  `try-triplex` org, published under the `trytriplex` marketplace publisher.
- **Maintenance status:** actively developed **product**, not a dormant lib. `packages/@triplex/server/CHANGELOG.md`
  shows fine‑grained patch releases through **0.72.5**; the checked‑out release commit `3201263 "Release packages (#402)"`
  is dated **2026‑01‑26**. (Shallow clone → I cannot see history beyond that one commit, so I do not assert the
  release cadence past Jan 2026 from git alone; the CHANGELOG evidences sustained, granular activity up to that point.)
  It ships as a **VS Code Marketplace extension** (`trytriplex.triplex-vsce`) and an **Electron desktop app**, plus a
  **cloud app with AI** (`apps/cloud` depends on `ai` + `@ai-sdk/google`; `@triplex/server/src/services/ai.ts` drives
  code edits via an LLM). So it has crossed into commercial/product territory while keeping an open‑source core.

---

## 1. What it actually is (from code)

A **pnpm monorepo** (`pnpm-workspace.yaml`, root `package.json` name `triplex_monorepo`) — a **visual workspace for
React / React‑Three‑Fiber components** that round‑trips edits back into the developer's *own* JSX/TSX source.

### Package structure (`packages/`, `apps/`)
| Package | Role | License |
|---|---|---|
| `@triplex/server` | **The engine.** Oak HTTP + WebSocket daemon holding a **ts-morph** TypeScript project; owns the AST read/write, undo/redo, prettier persist. | AGPL‑3.0 |
| `@triplex/renderer` | The live **R3F scene runtime** (browser/iframe): scene‑loader, transform handles/gizmos, WebXR, selection, grid. Real React+R3F app. | AGPL‑3.0 |
| `@triplex/bridge` | `host.ts`/`client.ts` postMessage bridge between the editor UI and the renderer iframe. | AGPL‑3.0 |
| `@triplex/websocks-server` / `-client` | WebSocket transport between server daemon and editor. | **MIT** |
| `@triplex/editor` / `editor-next` / `client` / `lib` / `ux` | Editor UI, shared libs, design system. | AGPL‑3.0 |
| `@triplex/api` | Public in‑component API. **Contents are just `koota` ECS helpers + `capitalize()`** — *not* a source mapper. | **MIT** |
| `create-triplex-project` | Project scaffolder (the **only** `bin`/CLI in the repo). | MIT |
| `apps/vscode` | VS Code extension (`customEditors` contribution) — the **primary delivery**. | AGPL‑3.0 |
| `apps/electron` | Standalone Electron desktop editor. | AGPL‑3.0 |
| `apps/cloud` | Next.js cloud app + AI (Google) backend. | AGPL‑3.0 |
| `apps/docs` / `examples` | Docs site / example scenes. | MIT |

### Editor architecture
**Not** a scene‑graph database and **not** a `.blend`/glTF editor. It is a **three‑process live‑editing rig**:

1. **Server daemon** (`@triplex/server/src/index.ts`): an Oak `Application`/`Router` + `createWSServer()` that
   exposes routes like `/scene/:path/:exportName/open` and `/thumbnail/...`, watches files with `chokidar`, and
   mutates source through `sourceFile.edit(...)`. It is a **long‑running editor backend**, not a batch transformer.
2. **Renderer** (`@triplex/renderer`, a Vite/browser React‑R3F app) renders the *actual* component and overlays
   transform gizmos; runs inside VS Code's webview or Electron.
3. **Bridge/websocks** carry selection + transient prop updates between UI and renderer.

Hosted by either the **VS Code extension** (`contributes.customEditors`, `main: hook-extension.js` → `dist/extension.js`)
or the **Electron** app.

### How visual edits map back to source — **a true AST round-trip on real files** (the core finding)
`packages/@triplex/server/src/ast/jsx.ts` + `services/component.ts` + `ast/project.ts`:

- **Addressing:** every JSX element is located either by **line/column** (`getJsxElementAt`, using
  `sourceFile.getLineAndColumnAtPos(node.getStart())`) or by a computed **`astPath`** string like
  `ExportName/group/mesh.1` — a stable, sibling‑indexed path built in `getJsxElementsPositions` /
  `calculatePaths` and resolved back by `getJsxElementFromAstPath`. Host (`^[a-z]`) vs custom components are
  distinguished; custom ones are followed to their source file via `getElementFilePath`.
- **Prop types** come from the TypeScript type checker (`ast/type-infer.ts`, `getJsxElementPropTypes`) — the
  properties panel is generated from real prop types, filtered by `prop-exclusions.ts` (three.js/global excludes).
- **Write‑back** (`services/component.ts`) mutates the in‑memory ts-morph tree directly:
  `upsertProp` → `existingProp.setInitializer("{...}")` or `addAttribute`; plus `insertText`, `replaceWithText`,
  `setBodyText`, `deleteElement`, `duplicate/move/group`. So a gizmo drag becomes `position={[x,y,z]}` written
  into the JSX.
- **Persist** (`ast/project.ts` `persistSourceFile`): on save it **formats with the project's Prettier config**
  (`prettier.format(...)`), falling back to ts-morph `formatText()` when no Prettier config exists, then `saveSync()`
  to disk. Only dirty files are rewritten.
- **Undo/redo**: `ast/project.ts` keeps a per‑SourceFile history stack (`sourceFileHistory` +
  `sourceFileHistoryPointer`) with full‑text snapshots; `undo()`/`redo()` restore text.
- **AI path**: `services/ai.ts` builds a prompt containing the component's source and applies
  `code_add`/`code_replace` blocks — an LLM‑driven variant of the same source‑mutation mechanism.

**Bottom line:** Triplex edits **hand‑authored JSX/TSX component files in place** via a ts-morph AST round‑trip.
The source code *is* the model; there is no intermediate spec, scene file, or database.

---

## 2. License (exact)

**Multi-license, per-directory.** Root `package.json` has no `license` field and there is **no root `LICENSE` file**;
each publishable package declares `"license": "SEE LICENSE IN LICENSE"` and ships its own `LICENSE`.

- **AGPL‑3.0** (GNU Affero GPL v3 — strong network‑copyleft): `@triplex/server`, `@triplex/editor`,
  `@triplex/editor-next`, `@triplex/client`, `renderer`, `bridge`, `lib`, `ux`, `apps/vscode`, `apps/electron`, `apps/cloud`.
  → **The entire editor/renderer/AST engine — everything architecturally interesting — is AGPL‑3.0.**
- **MIT**: `@triplex/api`, `@triplex/websocks-server`, `@triplex/websocks-client`, `apps/docs`, `examples`,
  `create-triplex-project`.

Headers everywhere: `Copyright (c) 2022—present Michael Dougall. All rights reserved.` (`scripts/header.js`,
enforced by `eslint-plugin-header`).

**Status:** genuinely open‑source (AGPL core) **but a maintained commercial product** — VS Code Marketplace
distribution, Electron build, a cloud/AI backend, and GitHub Sponsors funding. "Open source" in the README is true
of the code; it is not a permissive‑licensed library you can freely vendor.

---

## 3. Adoption fit for OUR kit

Our kit (`SKILL.md`, `references/TRACK-THREEJS.md`): **DesignSpec YAML is the source of truth**; code is a *gated
build product*; passes advance only on deterministic, headless captures over a local http server; R3F is only the
**Phase‑2 product** shell fed by a **certified, decoupled JSON data layer via `<primitive>`**; the whole thing is
Apache‑2.0.

Triplex is **architecturally inverted** from this, on every axis that matters:

| Axis | Our kit | Triplex |
|---|---|---|
| Source of truth | DesignSpec YAML → gated build | The JSX/TSX **source code itself** |
| Authoring | spec‑first, procedural/parametric geometry | hand‑drag a gizmo, write props to source |
| Verification | headless gates (probe/capture, ΔE00, blind judges) | none — interactive visual eyeballing |
| Runtime | batch/CI over `python3 -m http.server` | long‑running Oak+WS **daemon** in VS Code/Electron |
| Determinism | `window.__cam` + `--cam` scripted captures | live human interaction |
| License | Apache‑2.0 | **AGPL‑3.0 core** |

- **Does "visual edit → write back to JSX" fit a spec‑first pipeline?** **No.** In our pipeline the DesignSpec is
  authoritative and code is regenerated/gated; Triplex makes the *code* authoritative and has **no spec layer, no
  gate, no deterministic capture**. Wiring it in would create a second, un‑gated source of truth — exactly the
  "second source of truth" the kit's P7/dist rules forbid.
- **Headless / CI / gated?** **No.** There is **no headless or batch CLI** — the only `bin` in the whole repo is
  `create-triplex-project` (a scaffolder). The server is an editor daemon driven by a GUI (VS Code webview / Electron)
  over WebSockets; the renderer is an interactive R3F canvas with gizmos. It cannot participate in our headless gate
  loop.
- **Reusable libraries?** The one genuinely valuable asset is the **ts-morph JSX round‑trip mapper**
  (`ast/jsx.ts` `astPath` addressing + `services/component.ts` `upsertProp`/prettier persist + type‑driven prop panel).
  **But it is AGPL‑3.0**, so copying that code into our Apache‑2.0 kit is legally incompatible. The **MIT** `@triplex/api`
  is *not* a scene‑graph↔source mapper — it is only `koota` ECS helpers and a `capitalize()` util; nothing reusable
  for us. `create-triplex-project` (MIT) is just a template scaffolder.
- **Could we borrow the source‑round‑trip approach?** Only as a **clean‑room pattern**, never as code. The pattern
  worth remembering *if* we ever need spec→TSX generation or TSX→spec sync in Phase 2: address elements by a stable
  sibling‑indexed `astPath`, drive the props panel from the TS type checker, mutate a ts-morph tree, and persist
  through the project's own Prettier config. We would re‑implement it independently, not lift it.

---

## 4. Verify / refute the `investigacion.md` characterization

Claim: *"Triplex ~1.3k stars, editor visual de escenas R3F, ⭐⭐⭐⭐⭐"*.

- **"editor visual de escenas R3F" — CONFIRMED.** That is exactly what it is (React‑Three‑Fiber visual workspace).
- **"~1.3k stars" — UNVERIFIABLE from this offline clone** (no network in this audit). Directionally plausible for a
  pmndrs‑adjacent tool, but treat the number as unconfirmed. Note the star count reflects the *old* `pmndrs/triplex`
  page; the project has since moved to `try-triplex/triplex`, so any cached figure may be split/stale.
- **"⭐⭐⭐⭐⭐" — REFUTE for OUR use case.** As a *standalone R3F GUI* it is high quality and legitimately 5‑star.
  Judged against **our** spec‑first, gated, headless, Apache‑2.0 pipeline it is a **poor fit and legally encumbered**
  (AGPL core, no headless mode, inverted source‑of‑truth). For our kit the honest rating is **⭐ / ⭐⭐**. The blanket
  5‑star in `investigacion.md` conflates "great tool in general" with "fits our pipeline" — those are different
  questions and the row should be qualified.

---

## 5. Concrete verdict

**SKIP as an adoption/dependency; BORROW‑PATTERN only (clean‑room, conceptual).**

- **SKIP** integrating or depending on Triplex: it is an interactive GUI editor daemon with no headless/CI surface,
  its source‑of‑truth model is inverted from our DesignSpec‑first contract, and its core is **AGPL‑3.0** — incompatible
  with vendoring into our Apache‑2.0 kit.
- **BORROW‑PATTERN** (memory only, no code copied): the **ts-morph `astPath` round‑trip** — stable sibling‑indexed
  element addressing, type‑checker‑driven prop introspection, in‑memory AST mutation, Prettier‑config persist, full‑text
  undo/redo stack. Reach for this pattern *only if* Phase‑2 ever needs programmatic DesignSpec→TSX emission or a
  TSX→DesignSpec reconciliation step, and re‑implement it independently.
- **Do not** treat Triplex as a component of the gated deterministic pipeline. It authors and verifies nothing the way
  our gates require; it belongs (if anywhere) to a human, interactive Phase‑2 tweaking session outside the gate loop —
  and even there, the AGPL licence makes it a tool a developer runs, never code we ship.

### Key file citations
- Ownership: `apps/vscode/package.json` (publisher `trytriplex`, repo `trytriplex/triplex`); `README.md` (stale
  `pmndrs` image URLs); `scripts/header.js` (Michael Dougall copyright).
- Licenses: `packages/@triplex/server/LICENSE` (AGPL), `packages/api/LICENSE` (MIT); each `package.json`
  `"license": "SEE LICENSE IN LICENSE"`; no root `LICENSE`.
- AST round‑trip: `packages/@triplex/server/src/ast/jsx.ts`, `services/component.ts`, `ast/project.ts`,
  `ast/type-infer.ts`.
- Runtime shape: `packages/@triplex/server/src/index.ts` (Oak + WebSocket daemon), `packages/renderer/src/**`
  (R3F runtime), `packages/bridge/src/host.ts`/`client.ts`.
- AI edits: `packages/@triplex/server/src/services/ai.ts`; cloud: `apps/cloud/package.json`.
- No headless CLI: only `bin` is `packages/create-triplex-project/package.json`.
