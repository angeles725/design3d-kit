# SELF-IMPROVEMENT — retro protocol and LEARNINGS lifecycle

## Hard boundary — PROPOSE, NEVER APPLY (binding)

**A run NEVER integrates its own lessons.** Both channels are proposal-only; a human decides.

- **Kit structural deltas** (SKILL.md, `references/`) — proposed in the retro. A human applies them
  (optionally with `skill-improver`). Never edit the kit from inside a run.
- **LEARNINGS entries** — **STAGED, not appended.** P8 writes them to `LEARNINGS.md` §Staged with
  status `staged`. Staged rows are NOT loaded at P0 and are NEVER binding. Only the user promotes a
  row into §Active ledger.

The operator — not an autonomous agent — owns the method. A loop that rewrites its own rules while
running is not learning, it is drift. (Adapted from research-sdd METHODOLOGY §18.)

## Load rule (what makes this live)

P0 reads `LEARNINGS.md` **§Active ledger only**. Active entries at `confirmed×N`/`PROMOTE` are BINDING
for the run. §Staged is invisible to a run — it exists solely as a review queue for the user.

Lifecycle: `staged` → *(user promotes)* → `new` → `confirmed×1` → `confirmed×2` → `PROMOTE` →
`promoted` (folded into a `references/` file; prune the row) · `rejected` (tombstone, do not apply).

## Retro triggers — open the retro EARLY, not only at P8

The retro file is opened at the FIRST surprise, not at run end (adapted from research-sdd §18:
focus completion + mid-run cadence). Triggers, any one of them:
- a pass hits the stop rule (`failed(3)`) or a lineage reset is authorized;
- a defect class the kit did not anticipate (instrument lied, spec contradiction, judge misdiagnosis);
- a retry burned on a misdiagnosed correction.

Open `<design-dir>/runs/<YYYY-MM-DD>-retro.md` marked `IN PROGRESS`, append lessons AS THEY SURFACE
(cinemex's three deepest lessons were born mid-run and would not have survived to P8 from a dead
session). This is propose-only writing to a file no gate reads — it cannot corrupt the run. P8 then
finalizes the same file instead of reconstructing the run from memory.

## Run-end protocol (P8)

0. **DELEGATE the retro to a fresh-context agent** (mode ≥ standard; inline only in quick mode).
   The orchestrator judging its own run rationalizes; fresh context is the point (research-sdd:
   "independent judgment, not the driver's own rationalizations"). The agent reads kit + run
   artifacts, dedupes, proposes; the orchestrator only transports the result.
1. Fill `assets/retro.template.md` → `<design-dir>/runs/<YYYY-MM-DD>-retro.md`, seeded with
   `<!-- review-status: pending -->`. When the repo has a `research/retros/` convention, add a
   one-line cross-link entry there.
2. **DEDUPE FIRST**: read the current kit (`references/*` + `LEARNINGS.md` §Active) BEFORE proposing.
   A lesson the kit already encodes goes under "Already covered", not into a new row. Listing them
   is the proof the dedupe ran.
3. **Stage LEARNINGS entries**: one row per non-obvious lesson (gate failures and their fixes are
   prime candidates) into §Staged, status `staged`. Rule-shaped, evidence-pointed, with full
   provenance (see the row schema in LEARNINGS.md).
4. **PROPOSE confirmations — never perform them.** If this run re-observed an existing §Active entry,
   write a STAGED row citing that entry (`re-confirms: <active row>`) with your evidence. **A run
   NEVER edits an §Active row**, not even to bump its status: `confirmed×N` is BINDING, so a bump is
   a run writing law. The user performs every bump. (A run may not launder a rule the user
   deliberately parked as advisory into a house rule by asserting it re-saw it.)
5. **Emit proposed kit deltas** in the retro (table: change · target file/§ · evidence · type ·
   priority). Candidates: recurring gate failures a TRACK/GATES rule would prevent, missing decision
   gates, wrong defaults, PROMOTE-flagged learnings to fold into their reference file.
6. **Honesty clause**: if the run surfaced nothing new, SAY SO — "no new deltas; the kit already
   covers this run" is a valid and respectable retro outcome. **A retro that always finds something
   is noise, not signal.**
7. Mirror to engram: `mem_save` with topic keys `design3d/{design}/review` (run outcome) and
   `design3d/learnings` (staged entries) for cross-project recall.

   **Engram is NEVER authority for learnings — files win, always.** A staged entry mirrored to
   memory MUST open with `STAGED PROPOSAL — NOT a house rule; not binding until the user promotes
   it into LEARNINGS.md §Active.` Without that marker the mirror is a back door: the always-on
   memory protocol recalls it next session as a remembered "convention" and a future run applies it,
   routing around §Staged's invisibility. If a recalled memory and `LEARNINGS.md` §Active disagree,
   the file wins and the memory is stale.

P8-lite (quick mode): steps 2–3 and the engram mirror only.

## Review lifecycle — nothing sits unreviewed

Every retro carries a top marker `<!-- review-status: pending -->` (the template seeds it). When the
user has applied or dismissed its deltas, they flip it to
`<!-- review-status: applied <YYYY-MM-DD> · kit v<version> -->` or
`<!-- review-status: dismissed <YYYY-MM-DD> -->` (exact format — tooling parses only the first
HTML-comment block). Same marker convention for staged kit deltas written as standalone files.
A retro older than ~7 days still `pending` is ESCALATED: surface it to the user at the next P0
instead of letting it rot (research-sdd's aging rule, sans sweeper).

**Traceability, both directions.** A kit edit that applies a delta records which retro it came from;
the retro records what it became. "Why does this rule exist?" must be answerable from either end.

**The applier does not self-approve.** For any non-trivial kit delta, an INDEPENDENT fresh-context
reviewer scores each applied change as FAITHFUL / DRIFT / HALLUCINATION / MISSING / DUPLICATE against
the proposal table. Fix drift before the change is considered landed.

## Delta discipline

- A delta needs EVIDENCE from the run (a failed gate, a wasted loop, a wrong default) — no
  speculative redesigns.
- Deltas are minimal diffs against one file/section, not rewrites.
- Track applied deltas by bumping `metadata.version` in SKILL.md frontmatter.
