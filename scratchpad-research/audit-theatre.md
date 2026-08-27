# Theatre.js — Strict Code-Level Audit (for design3d-kit fit)

**Audited clone:** `scratchpad/repos/theatre` · frozen public snapshot, **version `0.7.0`**
**Last commit:** `6ea82b9` "Add the 1.0 notice", **2024-04-11** (repo is a shallow clone; single commit visible, but the notice + version string are authoritative).
**Upstream state:** README carries an explicit banner — *"Theatre.js 1.0 is around the corner. We have temporarily moved development to a private repo… We'll push our work back to this public repo soon."* So the public code evaluated here is a **pre-1.0 (0.7.0) snapshot, development off this repo since ~April 2024.**

---

## 1. What it actually is (from code)

Theatre.js is a **motion-design / animation library + visual editor for the web**, not a 3D-scene or geometry framework. It animates properties of objects you already built (three.js, DOM, or any JS variable). Yarn monorepo (`package.json` `workspaces: packages/*`), packages of interest:

### `@theatre/core` (Apache-2.0) — the runtime, headless-capable
Public API in `packages/core/src/coreExports.ts`. The state model is a small, deliberate hierarchy:

- **Project** — `getProject(id, config)`. `config.state` accepts a **serializable JSON save file** (`import state from './saved-state.json'; getProject(id, {state})`). Validated by `shallowValidateOnDiskState` / `deepValidateOnDiskState` (`core/src/projects/Project.ts`).
- **Sheet** — `project.sheet(name)`. A namespace of animatable objects (an instance of a "scene"/timeline).
- **Object** — `sheet.object(key, propsConfig)`. You declare props (via `types.*` prop configs). API in `sheetObjects/TheatreSheetObject.ts`: `obj.value` (current computed values), `obj.props` (a dataverse Pointer), **`obj.onValuesChange(cb)`** (subscribe → you push values onto your own three.js objects each frame), `obj.initialValue` setter.
- **Sequence** — `sheet.sequence`. API in `sequences/TheatreSequence.ts`: **`get/set position` (scrub to an exact time), `play({range, rate, iterationCount, direction})`, `pause()`, `attachAudio()`, `pointer`.** This is the deterministic timeline.

**The state JSON is an animation/property state, NOT a scene definition.** `core/src/projects/initialiseProjectState.ts` shows the on-disk shape is `{ sheetsById: {}, definitionVersion, revisionHistory }` — i.e. per-sheet/object/prop **keyframes and static overrides only**. It stores *what values a declared prop takes over time*. It stores **no geometry, materials, hierarchy, or camera intrinsics** — those live in your code; Theatre only drives declared numeric/enum/color props on objects you registered.

### `@theatre/studio` (AGPL-3.0-only) — the editor, browser-only
- **Strictly a browser devtool.** `studio/src/index.ts` **early-returns registration when `typeof window == 'undefined'`** (unless the internal `__THEATREJS__FORCE_CONNECT_CORE_AND_STUDIO` escape hatch is set). It mounts a React DOM UI (styled-components, portals, panels, `react-dom` — `studio/src/UI/…`, `panels/…`). Public API (`TheatreStudio.ts`): `studio.initialize()`, `studio.ui.hide()/restore()/isHidden`, `studio.transaction(...)`, `studio.extend(...)`.
- **State export is here, not in core:** `studio.createContentOfSaveFile(projectId)` / `__experimental_createContentOfSaveFileTyped` produce the JSON you then feed back into `getProject(id, {state})`. i.e. **authoring the state requires studio (AGPL, browser).**
- Intended to be present only in design/development and stripped from the production bundle.

### `@theatre/r3f` (Apache-2.0) — React-Three-Fiber binding, pre-release
- `packages/r3f/src/index.ts`: `editable` HOC, `SheetProvider`, `RafDriverProvider`, and drei-style **`PerspectiveCamera` / `OrthographicCamera` wrappers that are Theatre-editable** (`r3f/src/drei/PerspectiveCamera.tsx` wraps `editable(…, 'perspectiveCamera')` with `makeDefault`/`lookAt`). So Theatre **can drive an R3F camera** as a keyframed object.
- `r3f/src/extension/…` (EditableProxy, TransformControls, SnapshotEditor, OrbitControls, ReferenceWindow) is the **studio-side visual editor overlay** — the gizmos/scene-editing UI, browser-only.
- README is explicit: *"Here be dragons! `@theatre/r3f` is pre-release software, the API… can and will drastically change at any time, without warning."*

Other workspace packages are internal/product plumbing (`dataverse` = reactive core, `saaz`, `app`, `sync-server`, `theatric`, `benchmarks`, `playground`) — not consumer surface.

---

## 2. License (exact) and maintenance signals

**The license split is real and per-package** (verified against each package's own `LICENSE` + `package.json`):

| Package | `package.json` license | LICENSE file |
|---|---|---|
| `@theatre/core` | **Apache-2.0** | `core/LICENSE` = Apache 2.0 |
| `@theatre/r3f` | **Apache-2.0** | `r3f/LICENSE` = Apache 2.0 |
| `@theatre/studio` | **AGPL-3.0-only** | `studio/LICENSE` = GNU Affero GPL v3 |

Root `LICENSE` (45 KB) **concatenates both** — Apache 2.0 (lines 1–205) then AGPL-3.0 (from line 206). Root `package.json` declares `Apache-2.0`. `studio/README.md` states the intent verbatim: *"Theatre's core (`@theatre/core`) is released under the Apache License. The studio (`@theatre/studio`) is released under the AGPL 3.0 License… You only use the studio during design/development. Your project's final bundle only includes `@theatre/core`, so only the Apache License applies."*

**Practical reading:** shipping/runtime code (core + r3f) is permissive Apache-2.0. The **authoring tool (studio) is AGPL-3.0** — copyleft with the network clause. Using studio to *author* is fine; **forking/modifying/embedding studio and exposing it over a network triggers AGPL source-disclosure obligations.** For our kit this matters only if we ever tried to bake studio into a distributed/hosted tool — the runtime state JSON + core do not carry AGPL.

**Maintenance signals:** version `0.7.0`; last public commit **2024-04-11**; README says active development was **moved to a private repo** pre-1.0. Owner `AriaMinaei` / "TheaterJS Oy". **The public repo is effectively frozen** — adopting from it means pinning a ~2024 pre-1.0 snapshot with no public commit stream. (Live GitHub star count is not derivable from a clone — see §4.)

---

## 3. Adoption fit for our kit

Our contract (SKILL.md **Hard Rule 9**): every three.js scene exposes `window.__cam` and honors `--cam x,y,z,tx,ty,tz` so headless QA captures come from an **identical scripted viewpoint**; pixel-diffs are valid only over identical viewpoints. Plus TRACK-THREEJS gate captures run headless over a local http server under SwiftShader (Hard Rule 5).

**Q: Could Theatre's serializable state + sequence drive deterministic scripted camera captures?**
Technically yes, and cleanly: Theatre core is deterministic — `sequence.position = t` yields an exact, reproducible set of prop values at time `t` (interpolated from the keyframed JSON), and you read `cameraObj.value` (position/lookAt) via `onValuesChange` and apply it. So **a Theatre sequence IS a serializable, deterministic camera timeline** and could in principle *produce* the 6 numbers our `--cam` flag consumes. **But it is heavy overkill for a static viewpoint:** our contract is a 6-float flag; Theatre brings an entire keyframe-interpolation runtime + a state-JSON file whose only sanctioned authoring path is the **AGPL browser studio**. The clear win zone is different: if we wanted **deterministic keyframed camera *animations*** (choreographed fly-throughs, reveal sequences) as serializable JSON, Theatre's model fits that well — a static QA viewpoint does not need it.

**Q: Could its state model back a spec-first scene definition?**
**No, not as our DESIGNSPEC.** The state JSON is a **property-animation layer over objects you already built** — `sheetsById → objects → prop keyframes/static overrides`. It has no geometry, materials, hierarchy, or scale semantics (`1u=1m`, named pivots, critical-feature list — all of what DESIGNSPEC.yaml carries). At most it could serve as a **declarative, versionable *animation* spec** sitting *beside* our geometry spec, never replacing it.

**Q: What it does NOT give us**
- No geometry/scene/material authoring (it animates existing props only).
- **No headless authoring** — studio is browser-DOM-only and AGPL; there is no ergonomic code-first keyframe API (you can set static `initialValue`/`studio.transaction` values, but real keyframe authoring is the visual editor's job).
- No capture harness, no pixel-diff, no gates, no `--cam` equivalent — none of our QA machinery.
- Adds a runtime dependency + a state-JSON coupling for something our contract already solves in ~10 lines.

**Q: Is `@theatre/studio` usable headless, or strictly a browser devtool?**
**Strictly a browser devtool.** It self-disables when `window` is undefined and renders a React DOM editor. It is not runnable in a headless/CI capture step — which is exactly where our gate evidence is produced (SwiftShader over http server, Rule 5).

---

## 4. Verify / refute the investigacion.md characterization

Claim: *"Theatre.js ~12.5k stars, editor visual + animaciones, ⭐⭐⭐⭐"*

- **"editor visual + animaciones" — ACCURATE.** That is precisely the code: `@theatre/studio` is a visual editor and `@theatre/core` is an animation/motion-design library. Correct on substance.
- **"~12.5k stars" — NOT VERIFIABLE FROM CODE.** A git clone carries no star metadata; no network was used. The number is plausible for this project but should be treated as unconfirmed, and confirmed against GitHub live if it's load-bearing.
- **"⭐⭐⭐⭐" (subjective fit) — QUALIFY IT.** The rating omits two facts the code makes plain: (a) the **studio editor is AGPL-3.0 and browser-only**, and (b) the **public repo is frozen at pre-1.0 `0.7.0`, last commit 2024-04-11, dev moved private.** Both materially lower its fit as an *adoptable dependency* for a headless, gated pipeline, even if the technique is strong. The characterization is directionally right about *what it is*, but understates the maintenance/licensing caveats.

---

## 5. Verdict — **SKIP as a dependency; BORROW-PATTERN (narrow)**

**SKIP adoption** of `@theatre/core`, `@theatre/studio`, and `@theatre/r3f` as dependencies in the design3d-kit pipeline. Reasons tied to our gated, deterministic, headless contract:

1. **Authoring path is browser-only + AGPL.** The only sanctioned way to produce Theatre's state JSON is the studio editor, which self-disables headless and is AGPL-3.0. Our gate evidence is produced headless under SwiftShader (Rule 5). Fundamental mismatch.
2. **It solves a problem we don't have.** Rule 9's `--cam x,y,z,tx,ty,tz` already gives deterministic scripted viewpoints in a few lines. Theatre would add a keyframe runtime + JSON coupling to reproduce those 6 numbers — negative trade.
3. **Not a scene/spec format.** It animates declared props; it cannot back DESIGNSPEC (geometry, materials, `1u=1m`, named pivots, critical features).
4. **Frozen public snapshot.** Pinning 0.7.0 (2024-04) with dev moved private is a stale-dependency risk for a maintained kit; r3f is self-described pre-release ("here be dragons").

**BORROW-PATTERN (validation only, no dependency):** two ideas are worth noting as design confirmation, not code to import —
- **Serializable, deterministic timeline keyed by object/prop** with a **`sequence.position = t` scrub** as the single source of truth for a viewpoint/animation. This is the same principle behind our `--cam`/`window.__cam` determinism, and it validates that if we ever add **scripted camera *animations*** (not just static captures) to gate evidence, the right shape is *"a serializable keyframe doc + a pure `position → values` evaluator, applied outside React state"* — which also matches our existing R3F rule (per-frame values via `useFrame`/`userData`, never React state; TRACK-THREEJS §Generic defaults).
- **Studio/core license-and-runtime split** (dev-only editor stripped from the shipped bundle) mirrors our own two-phase Phase-1-reconstruction / Phase-2-product decoupling — reassurance, not a change.

**Net:** Theatre.js is a well-built visual motion-design tool, but its adoptable runtime (core/r3f) targets *keyframed animation* we don't currently need, its *authoring* tool is AGPL browser-only and antithetical to our headless gates, and the public code is frozen pre-1.0. **Do not adopt; keep our `--cam` contract as-is.** Revisit only if the kit's scope grows to author **deterministic camera/animation sequences** as a deliverable — and even then, evaluate the then-current (private→public 1.0) release, not this 0.7.0 snapshot.
