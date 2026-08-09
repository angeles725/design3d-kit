# recipe: normal-matrix-guidance

The NORMAL MATRIX is `transpose(inverse(upper-left 3×3 of the model matrix))`. three gives it to you:
`new THREE.Matrix3().getNormalMatrix(object.matrixWorld)`.

**Why it matters**: a surface normal is a direction, not a point — transforming it by the model matrix
directly SHEARS it under NON-UNIFORM scale. Scale a box 3× on x only and its slanted normals stop being
perpendicular to their faces, so lighting goes wrong (facets read too bright/too dark, edges shimmer).
The inverse-transpose cancels exactly that shear and keeps normals perpendicular.

**Where three already handles it**: the built-in `MeshStandardMaterial`/`MeshPhysicalMaterial` path
computes and applies the normal matrix per-object for you. If you only ever build meshes and set
`mesh.scale`, you are safe.

**The trap** is ANY of:

1. A CUSTOM shader (`ShaderMaterial`/`onBeforeCompile`) that transforms `normal` by the model matrix by
   hand instead of by the normal matrix.
2. A MANUAL normal transform in JS (e.g. rotating/transforming `geometry.attributes.normal` yourself).
3. Geometry BAKED with a non-uniform scale then flattened — `mesh.updateMatrix()` +
   `geometry.applyMatrix4(mesh.matrix)` pushes a non-uniform scale straight into the vertex normals and
   shears them permanently.

**Rule**: never non-uniformly scale a mesh and then bake it into geometry. If you must transform normals
by hand, transform them with `getNormalMatrix(matrixWorld)` (then renormalize), never with the model
matrix. Prefer non-uniform proportions baked into the SOURCE geometry (a stretched BoxGeometry) over a
scaled-then-flattened mesh.

**Evidence**: three r160 `Mesh`/`WebGLProgram` normal-matrix path; classic non-uniform-scale lighting bug.
