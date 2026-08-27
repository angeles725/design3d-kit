// P1 CAD-ENTRY e2e (offline, no three): a sheet dimensioned ONLY by sized MTEXT with 0 DIMENSION entities is
// DIMENSIONED (via MTEXT), not "sin cotas" — the exact COB-IM2 L4 case (Revisor). Drives the real raw-DXF
// path: readDxf (inv4) → provenance.cotas fail-loud signal → bindCotasToRuns (inv4) measured provenance +
// unbound surfaced. inv2 owns this spine/e2e assertion (the failing case as a regression).
import assert from 'node:assert/strict';
import { readDxf } from './dxf-intake.mjs';
import { bindCotasToRuns } from './cota-binding.mjs';
let pass = 0; const t = (n, f) => { f(); pass++; console.log('  ok -', n); };

// minimal DXF: 2 duct centerlines (LWPOLYLINE) + 4 sized MTEXT cotas, ZERO DIMENSION entities.
// cotas near a run bind (< 0.02 m widthGate); the far one must surface as unbound (fail-loud).
const dxf = [
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','8','HVAC_DUCT','90','2','70','0','10','0','20','0','10','5','20','0',   // run @ y=0
  '0','LWPOLYLINE','8','HVAC_DUCT','90','2','70','0','10','0','20','3','10','5','20','3',   // run @ y=3
  '0','MTEXT','8','PDF_Text','10','2.5','20','0.01','30','0','40','0.1','1','300x200',       // WxH → run@y=0
  '0','MTEXT','8','PDF_Text','10','3.0','20','0.005','30','0','40','0.1','1','BOD +3.20',    // BOD → run@y=0
  '0','MTEXT','8','PDF_Text','10','2.5','20','3.01','30','0','40','0.1','1','400x300',       // WxH → run@y=3
  '0','MTEXT','8','PDF_Text','10','50','20','50','30','0','40','0.1','1','250x150',          // far → UNBOUND
  '0','ENDSEC','0','EOF',
].join('\n');

t('readDxf flags the sheet as MTEXT-dimensioned (0 DIMENSION but N sized MTEXT) — never "sin cotas"', () => {
  const sg = readDxf(dxf);
  assert.equal(sg.dimensions.length, 0);                        // literally 0 DIMENSION entities
  assert.equal(sg.provenance.cotas.dimensionEntities, 0);
  assert.equal(sg.provenance.cotas.sizedText, 4);               // dimensioned via MTEXT — the fail-loud signal
  assert.equal(sg.annotations.filter(a => a.sizedCota).length, 4);
  assert.equal(sg.geometry.length, 2);                          // two centerlines survived intake
});

t('bindCotasToRuns binds MTEXT cotas to runs (measured provenance) and SURFACES the unbound one (fail-loud)', () => {
  const sg = readDxf(dxf);
  const { runs, unbound, stats } = bindCotasToRuns(sg); // default widthGate 0.02 m = the 20mm WIDTH_GATE
  assert.equal(stats.runs, 2);
  assert.equal(stats.sizedCotas, 4);
  assert.equal(stats.bound, 3); assert.equal(stats.unbound, 1);
  // run @ y=0: width+height (300x200) and BOD (+3.20) both bind -> all measured
  const run1 = runs.find(r => r.geometryIndex === 0);
  assert.equal(run1.fieldProvenance.labelWidth.prov, 'measured'); assert.equal(run1.fieldProvenance.labelWidth.v, 300);
  assert.equal(run1.fieldProvenance.height.prov, 'measured');     assert.equal(run1.fieldProvenance.height.v, 200);
  assert.equal(run1.fieldProvenance.bod.prov, 'measured');        assert.equal(run1.fieldProvenance.bod.v, 3.2);
  // run @ y=3: WxH binds, no BOD -> bod ABSENT (a fact, not fabricated)
  const run2 = runs.find(r => r.geometryIndex === 1);
  assert.equal(run2.fieldProvenance.labelWidth.v, 400);
  assert.equal(run2.fieldProvenance.height.v, 300);
  assert.equal(run2.fieldProvenance.bod.prov, 'absent-in-source');
  // the far cota is REPORTED as unbound, never silently dropped
  assert.equal(unbound.length, 1); assert.equal(unbound[0].text, '250x150');
});

console.log(`\n${pass}/${pass} dxf-mtext-cota e2e tests green`);
