# v1.19 candidate — IFC-EXPORT track (inv4 / BIM lane)

Turns FINDINGS-inv4-bim.md B2 ("emit IfcDistributionPort so downstream BIM knows elements are CONNECTED,
not just visually touching") from a staged idea into a runnable prototype. Mines investigacion4 (§ IFC
mapping: IfcPipeSegment/IfcPipeFitting/IfcDuctSegment/IfcDistributionPort, buildingSMART) + investigacion.md
(IFC element mapping, Section 9).

## Why pure-Node, no web-ifc WASM
IFC is ISO-10303-21 STEP **text**. WRITING a valid IFC file needs no WASM — only correct entity syntax +
references. (web-ifc's WASM is for READING/parsing at scale; we only READ our own certified scene_graph.)
So this stays offline-clean, zero new binary dep — fits the kit's fail-loud-on-remote contract.

## Input: the DESIGNSPEC scene_graph (already in v1.18)
```
{ objects:[{ id, type, size:[x,y,z], center:[x,y,z], rotationQuat?, 
             ports:{ NAME:{ position|offset:[lx,ly,lz], direction:[dx,dy,dz], DN? } } }],
  connections:[[ "OBJ.PORT", "OBJ.PORT" ]] }
```

## Output: minimal valid IFC4, connectivity-first
Spatial: IfcProject → IfcSite → IfcBuilding → IfcBuildingStorey (IfcRelAggregates), SI metre units,
one IfcGeometricRepresentationContext.
Per object: an IfcDistributionElement subtype by `type` (pump→IfcPump/IfcFlowMovingDevice,
chiller→IfcChiller/IfcEnergyConversionDevice, pipe→IfcFlowSegment, header→IfcFlowSegment, generic→
IfcDistributionElement) with an IfcLocalPlacement at `center` (IfcAxis2Placement3D + IfcCartesianPoint),
contained in the storey via IfcRelContainedInSpatialStructure.
Per port: IfcDistributionPort (FlowDirection = SOURCE/SINK inferred from name or direction), placed at the
port's world position, tied to its element by IfcRelConnectsPortToElement.
Per connection: IfcRelConnectsPorts(port1, port2, $) — the payload that tells downstream BIM the two
elements are CONNECTED. (This is exactly what a rendered mesh scene cannot convey.)

## GUIDs
IFC GlobalId = 22-char compressed base64 of a 128-bit id. Prototype: deterministic ids from a counter +
the IFC base64 alphabet (syntactically valid; deterministic so exports are reproducible/diff-able). A real
production emitter would compress actual UUIDs; noted as a follow-up, not a blocker for the connectivity proof.

## Validation (the proof)
1. STEP well-formedness: every `#N=` line closes with `;`, every referenced `#M` is defined, header + DATA
   sections present. A pure-Node structural checker (no external validator) confirms this.
2. Connectivity round-trip: parse the emitted IfcRelConnectsPorts back and assert the connection set equals
   the input scene_graph's `connections` — proving no connectivity is lost in translation.
3. (Optional, later) feed the file to web-ifc's reader to confirm a real IFC engine accepts it.

## Kit integration target (for i1's v1.19 write, if adopted)
- `library/harness/ifc-export.mjs` (Node tool, never bundled into the offline browser dist) +
  `references/PIPELINE.md §Delivery` optional IFC-emit step, gated behind a real "hand off to BIM/Revit" need
  (mirrors the intake gate). NEVER a [CERT] subject — it's a faithful translation of the certified scene_graph.

## Plan (looped, autonomous)
1. Build `ifc-export.mjs` (emitter). 2. Build the structural + round-trip checker + tests. 3. Prove on the
F2 scene_graph (7 objects, directional ports, 7 connections). 4. If green, PR it as a v1.19 candidate.
