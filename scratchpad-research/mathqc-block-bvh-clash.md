# MATH/QC — three-mesh-bvh as a CLASH / INTERFERENCE-DETECTION QC gate

**Tag:** MATH/QC
**Subject:** `three-mesh-bvh` v0.9.14 (MIT, Garrett Johnson) used NOT for perf and NOT for CSG, but for
**part-vs-part interpenetration / clash detection as a headless design-QC check** — "does an HVAC duct
run intersect a beam, a pipe, another duct, a wall void?".
**Source read:** clone at `…/scratchpad/repos/three-mesh-bvh` (git tag/pkg v0.9.14). All citations are
`src/**` file:line from that clone.

**New-angle guard (corpus de-dup):** `research/threejs-block17.md` already covers BVH as a
raycast/culling PERFORMANCE accelerator; `research/threejs-block46.md` already covers `three-bvh-csg`
CSG. This block deliberately covers NEITHER. It covers only the boolean/near-miss **interference test**
and its home in our headless geometry harness — the natural sibling of the existing occlusion/junction
work (COB-IM2 "occlusion test + collinear merge", and `geom-verify.mjs`'s `gap3D`/`checkJunction`).

---

## 1. The real clash-detection API (verified from src/)

All query methods live on `MeshBVH` (in `src/core/MeshBVH.js`), which extends `GeometryBVH` →
`BVH` (`src/core/BVH.js`). Exact signatures and returns as read from source:

### Mesh-vs-mesh boolean interference — THE clash answer

```js
// src/core/MeshBVH.js:591
intersectsGeometry( otherGeometry, geomToMesh ) → boolean
```
Docblock (MeshBVH.js:580-590): *"Returns whether or not the mesh intersects the given geometry.
`geometryToBvh` is the transform of the geometry in the BVH's local frame. Performance improves
considerably if the provided geometry also has a `boundsTree`."*

This is the method that answers **"do these two meshes interpenetrate?"** It returns a plain `boolean`
and short-circuits on the first intersecting triangle pair (MeshBVH.js:596-604 breaks on first `true`).

The actual triangle-level test is exact, not AABB-approximate. In
`src/core/cast/intersectsGeometry.template.js`:
- If `otherGeometry.boundsTree` exists → BVH-vs-BVH descent via `shapecast`, and each candidate pair is
  confirmed with `tri.intersectsTriangle( triangle2 )` (intersectsGeometry.template.js:73-106).
- If it does not → a brute O(n·m) triangle loop still confirmed by `triangle.intersectsTriangle(
  triangle2 )` (intersectsGeometry.template.js:151-156).
- `tri.intersectsTriangle` is Möller's triangle-triangle algorithm
  (`src/math/ExtendedTriangle.js:216`, :572; algorithm cited in-source at ExtendedTriangle.js:567-569).

**So `intersectsGeometry` = a true triangle-triangle interpenetration test, not a bounding-box
heuristic.** This is the correct primitive for clash-QC and is strictly stronger than the AABB-only
`gap3D`/`checkGeometry` we already ship.

### Two-BVH traversal (enumerate ALL clashing triangle pairs)

```js
// src/core/MeshBVH.js:661
bvhcast( otherBvh, matrixToLocal, callbacks ) → boolean
//   callbacks.intersectsTriangles(tri1, tri2, i1, i2, depth1, nodeIndex1, depth2, nodeIndex2) → bool
//   callbacks.intersectsRanges(...) → bool
```
Docblock (MeshBVH.js:645-660): traverses two BVHs simultaneously; returns `true` as soon as a triangle
pair is reported intersected. `matrixToLocal` transforms `otherBvh` into this BVH's local space
(MeshBVH.js:716-718 applies it to the other triangle's a/b/c). `intersectsGeometry` is implemented on
top of this. **Use `bvhcast` when you need the LIST of offending triangle indices (i1,i2), not just a
yes/no** — the callback receives both triangle indices, so you can collect every clashing pair.
Note: `intersectsTriangles` requires the other side to be a `MeshBVH` or it throws (MeshBVH.js:704-707).

### Generalized descent (used by the box/sphere helpers)

```js
// src/core/MeshBVH.js:625  (and base src/core/BVH.js:342)
shapecast( { intersectsBounds, intersectsTriangle, intersectsRange, boundsTraverseOrder } ) → boolean
```
Returns `true` as soon as any triangle is reported intersected (MeshBVH.js:612-616). This is the
building block for custom clash shapes.

### Convex-primitive clash helpers

```js
// src/core/MeshBVH.js:780
intersectsBox( box, boxToMesh ) → boolean       // box = THREE.Box3; boxToMesh = Matrix4 (OBB support)
// src/core/MeshBVH.js:800
intersectsSphere( sphere ) → boolean            // sphere = THREE.Sphere
```
`intersectsBox` builds an `OrientedBox` and shapecasts (MeshBVH.js:782-790) — so it is a true
**oriented-box-vs-mesh** test, ideal for a cheap "does this duct cross this beam's clearance box?"
first pass. `intersectsSphere` (MeshBVH.js:800-808) is mesh-vs-sphere.

### Penetration depth / closest-distance (the "how bad / near-miss" answer)

```js
// src/core/MeshBVH.js:840
closestPointToGeometry( otherGeometry, geometryToBvh, target1={}, target2={},
                        minThreshold=0, maxThreshold=Infinity ) → HitPointInfo | null
// src/core/MeshBVH.js:874
closestPointToPoint( point, target={}, minThreshold=0, maxThreshold=Infinity ) → HitPointInfo | null
```
`HitPointInfo = { point: Vector3, distance: number, faceIndex: number }` (MeshBVH.js:70-75).
`closestPointToGeometry` fills `target1` (closest point on THIS mesh) and `target2` (closest point on
the other geometry), returns `null` if nothing is inside `[minThreshold,maxThreshold]`
(MeshBVH.js:811-838). **This is the clearance / near-miss metric** — e.g. "duct must stay ≥ 25 mm from
the beam": run `closestPointToGeometry` and pass/fail on `distance`.

**Important caveat on penetration DEPTH:** three-mesh-bvh does **not** expose a signed penetration depth
directly. `intersectsGeometry`/`bvhcast` give a boolean and the offending triangle indices;
`closestPointToGeometry` gives the *unsigned* surface-to-surface distance. When the meshes overlap the
closest surface distance goes to 0 — it does not report "how deep". For a magnitude-of-overlap number
you must derive it yourself:
- collect the intersection SEGMENT per clashing pair — `ExtendedTriangle.intersectsTriangle(other,
  target)` writes the intersection line into `target` (ExtendedTriangle.js:572, :556
  `intersectTriangleSegment`), so `bvhcast` + that segment gives you the intersection curve, and
- combine with our existing `gap3D` AABB overlap and/or a `signedVolume`-style pass for magnitude.

**Summary of "which method answers what":**
| Question | Method | Returns |
|---|---|---|
| Do mesh A and mesh B interpenetrate? (yes/no) | `intersectsGeometry` (MeshBVH.js:591) | `boolean` |
| Which triangle pairs clash? (the list) | `bvhcast` + `intersectsTriangles` (MeshBVH.js:661) | `boolean` + per-pair callback |
| Clearance / near-miss distance between two parts | `closestPointToGeometry` (MeshBVH.js:840) | `{point,distance,faceIndex}` \| `null` |
| Does a part cross this clearance box / sphere? | `intersectsBox`/`intersectsSphere` (MeshBVH.js:780/800) | `boolean` |
| Penetration DEPTH (signed magnitude) | *not built-in* — derive from segment (ExtendedTriangle.js:572) + `gap3D` | — |

---

## 2. Headless feasibility — YES, pure Node, no browser/WebGL

Verified: the entire clash path is geometry math over `BufferGeometry` typed arrays with **no DOM and no
GL dependency**.

- `grep -rE "document|window\.|WebGL|canvas|createElement|navigator"` over `src/core`, `src/math`,
  `src/utils/ExtensionUtilities.js`, `src/utils/TriangleUtilities.js` → **zero hits**. (The only
  WebGL/DOM code in the package is under `src/webgl/**` and `src/webgpu/**`, which the clash path never
  imports.)
- `MeshBVH.js` imports only `three` core math (`BufferAttribute, FrontSide, Ray, Vector3, Matrix4` —
  MeshBVH.js:4) plus internal pure modules. `three` core math classes (Matrix4/Box3/Sphere/Vector3)
  are pure JS and load in bare Node — the same assumption `geom-verify.mjs`'s existing three-facing
  wrappers already rely on (they `await import('three')`, geom-verify.mjs:360, :436, :494).
- Building the BVH: `new MeshBVH(geometry)` needs only `geometry.attributes.position` +
  `geometry.index` — raw typed arrays. No renderer, no canvas.

**Consequence for the kit:** a clash check can run at gate time in the SAME plain-Node context as
`geom-verify.test.mjs` — construct BufferGeometry from the design's part arrays, build a `MeshBVH` per
part group, call `intersectsGeometry`/`closestPointToGeometry`. No SwiftShader, no `capture.mjs`, no
page load. This is a TEST-jurisdiction check (GATES.md §Test-vs-render), not a render one.

---

## 3. Determinism — deterministic for fixed geometry; float caveats bounded

**Build order is deterministic.** `grep -rE "Math\.random|Date\.now|performance\.now|new Date"` over
`src/core` → **zero hits**. The default split strategy is `CENTER` (`GeometryBVH` option default
`strategy: CENTER`, GeometryBVH.js:75; constants `src/core/Constants.js:9` CENTER=0). CENTER/AVERAGE/SAH
are all pure functions of the geometry — same input arrays → same tree → same traversal order → same
result. `intersectsGeometry` short-circuits on first hit, but the boolean verdict is order-independent
(any hit ⇒ true). For a pass/fail QC gate this is exactly what we want: **same design in ⇒ same clash
verdict out**, run to run and machine to machine.

**Float caveats (for choosing a threshold):**
- Triangle-triangle exactness uses `ZERO_EPSILON = 1e-15` (ExtendedTriangle.js:7-11) for degeneracy;
  boundary/coplanar contacts are handled specially and a coplanar overlap logs a warning and yields a
  zero-length/`(0,0,0)` edge (ExtendedTriangle.js:284, :564-566). So **exactly face-touching parts
  (sep = 0) sit on the knife-edge** and can read either way under FP noise.
- Mitigation for a QC threshold: do NOT gate on the raw boolean at zero tolerance. Gate with an
  **allowed-touch tolerance**: treat `intersectsGeometry === true` as a clash ONLY when
  `closestPointToGeometry` confirms overlap beyond a tolerance, OR (cheaper) shrink each part by a small
  inset / require the intersection segment length to exceed `touchEps` (mirrors `gap3D`'s
  `touching` vs `overlapping` distinction already in `geom-verify.mjs:148-158`, where face contact is
  a good weld and interpenetration is the fault). This makes the pass/fail robust to FP at the seam.

---

## 4. License + peer dep (exact)

- **License: MIT.** `LICENSE`: *"MIT License / Copyright (c) 2018 Garrett Johnson"* — permissive,
  BORROW-and-vendor friendly, same posture as the rest of the kit. `package.json` `"license": "MIT"`.
- **Peer dependency: `"three": ">= 0.159.0"`** (`package.json` peerDependencies). The kit's harness is
  "r160-vetted" (geom-verify.mjs:2), i.e. three r160 ≥ 0.159.0 — **compatible**. (Dev/test three in the
  repo is `^0.185.0`, but the peer floor is 0.159.0.)
- Version audited: **0.9.14** (`package.json` `"version": "0.9.14"`), `"type": "module"`,
  `"sideEffects": false`, ESM entry `src/index.js`.

---

## 5. CONCRETE KIT DELTA

### 5a. New file — `library/harness/clash-detect.mjs` (sibling of `geom-verify.mjs`)

Follows `geom-verify.mjs`'s established **pure-core / dynamic-import split** (geom-verify.mjs:9-16,
:339-341): a pure math core imports nothing; the three-facing + three-mesh-bvh-facing wrapper does
`await import('three')` and `await import('three-mesh-bvh')` at call time, so the module still loads in
bare Node and its pure core stays unit-testable exactly like `geom-verify.test.mjs`.

**Contract:**

```
checkClashes(groups, opts) → Promise<{ ok, pairs, worst }>

INPUTS
  groups : Array<{ name:string, object:Object3D | Mesh | InstancedMesh }>
           Named part groups to test pairwise (e.g. "ducts", "beams", "pipes", "wall-voids").
           InstancedMesh handled by expanding instanceMatrix (each instance = one collider).
  opts.touchEps      (m, default 0.0015 = 1.5 mm)  allowed-touch tolerance; a contact whose
                     overlap/penetration is below this is NOT a clash (mirrors gap3D touchEps and
                     the coplanar 1.5 mm rule already in geom-verify.mjs:286).
  opts.pairs         optional allow/deny list of which named groups may legitimately touch
                     (a duct SHOULD touch its own flange; a duct must NOT touch a beam).
  opts.clearance     optional per-pair min clearance (m); when set, uses closestPointToGeometry
                     so a NEAR-MISS under clearance also fails (not just interpenetration).
  opts.emit          (default true) console.error on failure — NEVER console.assert (same rule as
                     geom-verify.mjs:501, so the gate can see it).

METHOD (headless, per §2/§3)
  - build MeshBVH per collider (indirect:true to avoid mutating shared index);
  - for each admitted pair: intersectsGeometry(a, b, bToA) for the boolean, and when
    opts.clearance set, closestPointToGeometry for the distance;
  - transform matrices via object.matrixWorld (BVHs are local-space — MeshBVH.js:86-88);
  - collect clashing pairs; for magnitude, use the ExtendedTriangle intersection segment
    (ExtendedTriangle.js:572) and/or gap3D overlap from geom-verify.mjs.

OUTPUT
  pairs : [{ a, b, kind:'interpenetration'|'clearance', distance?, tris?:[i1,i2][], maxPenetration? }]
  worst : { a, b, maxPenetration }   // the single deepest/closest offender, for the run note
  ok    : pairs.length === 0

PASS RULE
  ok === true  ⇔  no admitted group pair interpenetrates beyond touchEps
                  AND (if clearance set) no admitted pair is closer than its clearance.

DISCIPLINE (same as geom-verify.mjs:5-7)
  REPORTS ONLY — never mutates, moves, deletes, or reposition scene content.
```

This composes with, rather than replaces, the existing AABB checks: `checkGeometry`/`coplanarPairs`
(AABB) stay as the cheap advisory first pass; `clash-detect` is the exact triangle-level confirmation —
the same "confirm a high-IoU/coplanar CANDIDATE against actual geometry before calling it a defect"
step the current code explicitly defers to a human (geom-verify.mjs:262-266, :424-433). `clash-detect`
automates that confirmation.

### 5b. New `references/GATES.md` §Mechanical-check row

Under §1 *Mechanical checks (threejs framing & geometry)*, add a hard mechanical check:

> **threejs clash / interference** (`library/harness/clash-detect.mjs`, headless pure-Node, no GL):
> **no unintended interpenetration between named part groups.** For each declared part-group pair not
> on the allow-touch list, `intersectsGeometry` must be false beyond `touchEps` (and, where a spec
> declares a clearance, `closestPointToGeometry.distance ≥ clearance`). Record as
> `mechanical.clash: {pairs, worst, note}`; **`pairs.length > 0` FAILS the gate** regardless of global
> score (same weight as `mechanical.tests.fail > 0`, GATES.md §Verdict). A design that declares no
> part groups is a SKIP (`mechanical.clash: null` + `mechanical.note`), never a fabricated pass —
> mirroring the `__qaFraming` no-hook SKIP rule.

### 5c. Jurisdiction (GATES.md §Test-vs-render, binding)

This is a **TEST, not a RENDER judgment.** Per the rule *"If a human cannot count it at a glance, TEST
it"* — a duct clipping 8 mm through a beam three layers deep is invisible in a downscaled blind-review
capture (occlusion, angle, scale), and "count the clashing pairs / measure the deepest penetration" is
a deterministic invariant, not a perceptual gestalt. It belongs in the same test column as *placement
validation (size, parent, containment)* and *absence of shortcut edges* (GATES.md line ~124). It
therefore records under `mechanical.clash` and gates hard, exactly like `mechanical.tests`. It does
**not** consume a blind-review attempt.

---

## 6. Verify / refute investigacion.md claim

Claim under audit: *"three-mesh-bvh ~3.4k stars, colisiones/selección/rendimiento, ⭐⭐⭐⭐⭐"*.

- **"colisiones" (collision) — VERIFIED as real and correctly the right tool.** The library ships
  first-class mesh-vs-mesh, mesh-vs-box, mesh-vs-sphere, and closest-distance queries
  (`intersectsGeometry`, `bvhcast`, `intersectsBox`, `intersectsSphere`, `closestPointToGeometry` —
  all cited in §1), plus a shipped **"Sphere physics collision"** example (`README.md:53`,
  `example/physics.html`). Collision is not a marketing embellishment; it is a core, documented API.
  For **clash-QC specifically it is the right tool**: exact triangle-triangle interference (Möller),
  headless, deterministic, MIT.
- **"selección/rendimiento" — VERIFIED** but that is the block17 angle (raycast selection + culling
  performance), out of scope here.
- **"~3.4k stars" — UNVERIFIED from source.** Star count is a GitHub-repo metric and is not present in
  the clone; I did not fetch GitHub, so I neither confirm nor deny the number. Treat the star figure as
  unverified metadata, not a load-bearing fact. (The technical claims above stand on src/ regardless.)
- **One correction to how the claim reads:** three-mesh-bvh gives collision **detection** (boolean +
  offending triangles + closest distance). It does **not** give **penetration-depth resolution or
  collision RESPONSE** out of the box (§1 caveat). For our QC purposes detection is exactly what we
  need; anyone reading "colisiones ⭐⭐⭐⭐⭐" as "full physics solver" would be overstating it.

---

## 7. Verdict — **BORROW** (vendor the query API into a headless clash check; do not adopt as a runtime dep of the app)

- **Why not SKIP:** it uniquely closes a real gap. Our current geometry QC is AABB-only
  (`checkGeometry`, `coplanarPairs`, `gap3D` in `geom-verify.mjs`) and explicitly punts triangle-level
  confirmation to a human (geom-verify.mjs:262-266, :424-433). `intersectsGeometry` /
  `closestPointToGeometry` are the exact triangle-level confirmation those functions ask for — the
  natural completion of the COB-IM2 occlusion/junction line of work.
- **Why BORROW, not full ADOPT:** it earns a place in the **gate harness** (`library/harness/`), a
  Node-only build/QC context, exactly like `geom-verify.mjs` already carries a `three` dynamic import.
  MIT + `three >= 0.159.0` peer + zero-DOM/GL core (§2, §4) make vendoring/importing at gate time clean.
  It does **not** need to become a dependency of the shipped viewer/app — the clash check is a
  build-time QC step, not a per-frame runtime feature (that would be the block17 perf story, separate).
- **Conditions on the borrow:**
  1. Gate on an **allowed-touch tolerance**, never the raw zero-tolerance boolean (§3 float caveat) —
     face-flush welds must not read as clashes.
  2. Penetration **depth** must be derived (segment length / `gap3D` overlap), not expected from the
     library (§1 caveat) — do not claim a "penetration depth" the API doesn't return.
  3. Ship it as a **TEST-jurisdiction** mechanical check with a hard fail and a no-groups SKIP, never a
     blind-review item (§5c).
  4. Keep the pure-core/dynamic-import split so `clash-detect.mjs` stays bare-Node-loadable and its core
     stays unit-testable like `geom-verify.test.mjs`.

---

### Citations index (all from the v0.9.14 clone `src/**`)
- `src/core/MeshBVH.js` — :70-75 HitPointInfo, :86-88 local-space note, :580-610 `intersectsGeometry`,
  :612-643 `shapecast`, :645-766 `bvhcast`, :771-792 `intersectsBox`, :794-809 `intersectsSphere`,
  :811-853 `closestPointToGeometry`, :855-884 `closestPointToPoint`, :4 imports (three core only).
- `src/core/BVH.js` — :342 base `shapecast`, :426 base `bvhcast`.
- `src/core/GeometryBVH.js` — :75 default `strategy: CENTER`.
- `src/core/Constants.js` — :9/:18/:29 CENTER/AVERAGE/SAH.
- `src/core/cast/intersectsGeometry.template.js` — :65-106 BVH-vs-BVH + `intersectsTriangle`,
  :151-156 brute-force + `intersectsTriangle`.
- `src/math/ExtendedTriangle.js` — :7-11 ZERO_EPSILON, :216/:572 `intersectsTriangle`,
  :556 `intersectTriangleSegment`, :774-789 `distanceToTriangle`, :567-569 Möller reference,
  :284/:564-566 coplanar caveat.
- `src/utils/ExtensionUtilities.js` — :37 `acceleratedRaycast`, :176 `computeBoundsTree`.
- `LICENSE` — MIT, Copyright (c) 2018 Garrett Johnson.
- `package.json` — version 0.9.14, peer `three >= 0.159.0`, MIT, ESM/sideEffects:false.
- `README.md` — :53 "Sphere physics collision" example, :210 `intersectsSphere` usage.
- No-DOM/GL proof: `grep -rE "document|window\.|WebGL|canvas|createElement|navigator" src/core src/math
  src/utils/{ExtensionUtilities,TriangleUtilities}.js` → 0 hits. Determinism proof:
  `grep -rE "Math\.random|Date\.now|performance\.now|new Date" src/core` → 0 hits.
- Kit anchors: `library/harness/geom-verify.mjs` (:5-16 discipline+split, :148-158 gap3D,
  :262-266/:424-433 "confirm candidate against geometry", :360/:436/:494 dynamic three import,
  :501 console.error-not-assert), `library/harness/geom-verify.test.mjs` (pure-core self-test),
  `references/GATES.md` (§1 Mechanical checks, §Test-vs-render jurisdiction, §Verdict).
