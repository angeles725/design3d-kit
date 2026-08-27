// library: element-model  (harness/element-model.mjs) — Revit-like semantic ELEMENT model (investigador4).
// Canonical typed element for the semantic scene_graph (investigacion4 §Revit families/parameters/connectors;
// spatial-world-model.md). Gives every object a TYPE + CATEGORY + SYSTEM + LEVEL + PARAMETERS + typed
// CONNECTORS (ports), so downstream reasoning (BIM export, MEP validation, the spatial engine) shares one
// vocabulary. Pure, zero-import-of-three, deterministic, REPORTS/normalizes only.
//
// FIELD-COMPATIBLE with spatial-harness.placeEquipment({id,type,size,center,clearance,ports}) — the BIM
// fields (category/system/level/parameters) are ADDITIVE, so a normalized element loads via fromScene
// without a schema mismatch (coordinated with inv2).
import { flowRole, systemOf } from './mep-connectors.mjs';

// Revit-like categories, inferred from type keywords
const CATEGORY_RULES = [
  [/chiller|pump|ahu|air.?hand|boiler|tank|cooling.?tower|\bfan\b|compressor|\bunit\b|handler/i, 'equipment'],
  [/vfd|panel|board|\bmcc\b|switchgear|transformer|\bvsd\b/i, 'electrical'],
  [/pipe|duct|header|conduit|riser|\bmain\b|segment/i, 'segment'],
  [/elbow|\btee\b|reducer|\bwye\b|transition|\bcap\b|coupling|fitting/i, 'fitting'],
  [/diffuser|grille|register|\bvav\b|terminal/i, 'terminal'],
  [/valve|damper|sensor|actuator|\bmeter\b|control/i, 'control'],
];
export function categoryOf(type = '') {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(String(type))) return cat;
  return 'generic';
}

// canonical field list (documentation + validation)
export const ELEMENT_FIELDS = Object.freeze(['id', 'type', 'category', 'system', 'level', 'size', 'center', 'clearance', 'ports', 'parameters']);

function normalizePort(name, p) {
  const pos = Array.isArray(p) ? p : (p.position || p.offset);
  const out = { position: pos ? [...pos] : null };
  const dir = Array.isArray(p) ? null : p.direction;
  if (dir) out.direction = [...dir];
  out.flow = (!Array.isArray(p) && (p.flow === 'source' || p.flow === 'sink')) ? p.flow : flowRole(name, Array.isArray(p) ? {} : p);
  const sys = !Array.isArray(p) ? systemOf(name, p) : systemOf(name);
  if (sys) out.system = sys;
  const dn = !Array.isArray(p) ? p.dn : undefined;
  if (dn != null) out.dn = dn;
  return out;
}

// normalize any object into a canonical typed element (fills category, typed connectors, parameters)
export function normalizeElement(obj) {
  const el = {
    id: obj.id,
    type: obj.type || 'generic',
    category: obj.category || categoryOf(obj.type),
    size: obj.size ? [...obj.size] : undefined,
    parameters: obj.parameters ? { ...obj.parameters } : {},
  };
  if (obj.system) el.system = String(obj.system).toUpperCase();
  if (obj.level != null) el.level = obj.level;
  if (obj.center) el.center = [...obj.center];
  if (obj.clearance) el.clearance = { ...obj.clearance };
  if (obj.ports) {
    el.ports = {};
    for (const [n, p] of Object.entries(obj.ports)) el.ports[n] = normalizePort(n, p);
    // element system: if unset, adopt the single system its ports agree on
    if (!el.system) {
      const sysSet = new Set(Object.values(el.ports).map(p => p.system).filter(Boolean));
      if (sysSet.size === 1) el.system = [...sysSet][0];
    }
  }
  return el;
}

// validate an element (REPORTS): required fields + well-formed ports
export function validateElement(obj) {
  const errors = [], warnings = [];
  if (!obj.id) errors.push({ reason: 'missing-id' });
  if (!obj.type) warnings.push({ reason: 'missing-type', detail: 'defaults to generic' });
  if (!Array.isArray(obj.size) || obj.size.length !== 3) errors.push({ reason: 'bad-size' });
  for (const [n, p] of Object.entries(obj.ports || {})) {
    const pos = Array.isArray(p) ? p : (p.position || p.offset);
    if (!Array.isArray(pos) || pos.length !== 3) errors.push({ reason: 'bad-port-position', port: n });
  }
  if (!obj.level && !(obj.parameters && obj.parameters.level)) warnings.push({ reason: 'no-level' });
  return { ok: errors.length === 0, errors, warnings };
}

// the fields spatial-harness.placeEquipment consumes — normalized elements are a superset (alignment guard)
export const PLACE_EQUIPMENT_FIELDS = Object.freeze(['id', 'type', 'size', 'center', 'clearance', 'ports']);
