#!/usr/bin/env node
/**
 * extract-coverage-labels-from-baselines.cjs
 *
 * PR 2 — Recon 1: Scans all baseline JSON captures (T0/* and T0_strict/*)
 * and produces a deduplicated coverage-label inventory.
 *
 * Output: tests/fixtures/baseline/COVERAGE_LABELS_INVENTORY.md
 *
 * This is the source of truth for the matcher corpus.
 * Diff future inventories against it to detect new paraphrases.
 */
const fs = require('fs');
const path = require('path');

const BASELINE_DIR = path.resolve('tests/fixtures/baseline');
const T0_DIR = path.join(BASELINE_DIR, 'T0');
const T0_STRICT_DIR = path.join(BASELINE_DIR, 'T0_strict');
const OUTPUT_PATH = path.join(BASELINE_DIR, 'COVERAGE_LABELS_INVENTORY.md');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(label) {
  // Case-fold, collapse whitespace, trim
  return label.toLowerCase().replace(/\s+/g, ' ').trim();
}

function fixtureShortName(filename) {
  return filename
    .replace('.pdf.json', '')
    .replace('anadolu-', '')
    .replace('allianz-', 'allianz-');
}

// ─── Data loading ────────────────────────────────────────────────────────────

function loadBaselines(dir, sourceTag) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const fixture = fixtureShortName(file);
    const runs = (data.runs || []).filter(r => r.data && !r.error);

    for (let runIdx = 0; runIdx < runs.length; runIdx++) {
      const coverages = runs[runIdx].data?.coverages || [];
      for (const cov of coverages) {
        // Collect both name (English) and nameTr (Turkish) as separate labels
        if (cov.name && typeof cov.name === 'string' && cov.name.trim()) {
          results.push({
            label: cov.name.trim(),
            nameTr: cov.nameTr?.trim() || null,
            category: cov.category || null,
            fixture,
            runIdx,
            source: sourceTag,
            field: 'name',
          });
        }
        if (cov.nameTr && typeof cov.nameTr === 'string' && cov.nameTr.trim()) {
          results.push({
            label: cov.nameTr.trim(),
            nameEn: cov.name?.trim() || null,
            category: cov.category || null,
            fixture,
            runIdx,
            source: sourceTag,
            field: 'nameTr',
          });
        }
      }
    }
  }
  return results;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const t0Labels = loadBaselines(T0_DIR, 'T0 (T=0.1)');
const t0StrictLabels = loadBaselines(T0_STRICT_DIR, 'T0_strict (T=0)');
const allLabels = [...t0Labels, ...t0StrictLabels];

console.log(`Loaded ${allLabels.length} label occurrences from ${t0Labels.length} T0 + ${t0StrictLabels.length} T0_strict`);

// ─── Deduplicate ─────────────────────────────────────────────────────────────

// Group by exact label string
const byExact = new Map();
for (const entry of allLabels) {
  const key = entry.label;
  if (!byExact.has(key)) {
    byExact.set(key, {
      label: key,
      field: entry.field,
      count: 0,
      fixtures: new Set(),
      sources: new Set(),
      pairedLabels: new Set(), // The matching EN/TR label
      categories: new Set(),
    });
  }
  const rec = byExact.get(key);
  rec.count++;
  rec.fixtures.add(entry.fixture);
  rec.sources.add(entry.source);
  if (entry.field === 'name' && entry.nameTr) rec.pairedLabels.add(entry.nameTr);
  if (entry.field === 'nameTr' && entry.nameEn) rec.pairedLabels.add(entry.nameEn);
  if (entry.category) rec.categories.add(entry.category);
}

// Group by normalized label
const byNormalized = new Map();
for (const [exact, rec] of byExact) {
  const norm = normalize(exact);
  if (!byNormalized.has(norm)) {
    byNormalized.set(norm, {
      normalized: norm,
      variants: [],
      totalCount: 0,
      fixtures: new Set(),
    });
  }
  const nRec = byNormalized.get(norm);
  nRec.variants.push(exact);
  nRec.totalCount += rec.count;
  for (const f of rec.fixtures) nRec.fixtures.add(f);
}

// ─── Sort ────────────────────────────────────────────────────────────────────

const sortedExact = [...byExact.entries()]
  .map(([label, rec]) => ({
    label,
    count: rec.count,
    field: rec.field,
    fixtures: [...rec.fixtures].sort(),
    sources: [...rec.sources],
    pairedLabels: [...rec.pairedLabels],
    categories: [...rec.categories],
  }))
  .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

// Separate EN and TR labels
const enLabels = sortedExact.filter(l => l.field === 'name');
const trLabels = sortedExact.filter(l => l.field === 'nameTr');

// ─── Generate markdown ──────────────────────────────────────────────────────

const totalOccurrences = allLabels.length;
const uniqueExact = byExact.size;
const uniqueNormalized = byNormalized.size;
const enUnique = new Set(enLabels.map(l => l.label)).size;
const trUnique = new Set(trLabels.map(l => l.label)).size;

// Source counts
const t0RunCount = new Set(t0Labels.map(e => `${e.fixture}-${e.runIdx}`)).size;
const t0StrictRunCount = new Set(t0StrictLabels.map(e => `${e.fixture}-${e.runIdx}`)).size;

let md = `# Coverage Labels Inventory

Generated from baseline data on ${new Date().toISOString().split('T')[0]}
- **T0/**: 5 fixtures × 3 runs at T=0.1 (${t0RunCount} successful fixture-runs)
- **T0_strict/**: ${t0StrictRunCount} successful fixture-runs at T=0

## Summary

| Metric | Count |
|---|---|
| Total label occurrences (EN + TR) | ${totalOccurrences} |
| Unique exact label strings | ${uniqueExact} |
| Unique after case/whitespace normalization | ${uniqueNormalized} |
| Unique English (name) labels | ${enUnique} |
| Unique Turkish (nameTr) labels | ${trUnique} |

## English Labels — Distribution (top 30 by frequency)

| Count | Label | Category | Fixtures observed | Paired TR |
|---|---|---|---|---|
`;

for (const l of enLabels.slice(0, 30)) {
  const pairedTr = l.pairedLabels.length > 0 ? l.pairedLabels.slice(0,2).join('; ') : '—';
  const cats = l.categories.length > 0 ? l.categories.join(', ') : '—';
  md += `| ${l.count} | ${l.label} | ${cats} | ${l.fixtures.join(', ')} | ${pairedTr} |\n`;
}

md += `\n## English Labels — Long tail (count ≤ 2)\n\n`;

const enLongTail = enLabels.filter(l => l.count <= 2);
for (const l of enLongTail) {
  const pairedTr = l.pairedLabels.length > 0 ? ` → TR: ${l.pairedLabels[0]}` : '';
  md += `- **${l.label}** (${l.count}× in ${l.fixtures.join(', ')}${pairedTr})\n`;
}

md += `\n## Turkish Labels — Distribution (top 30 by frequency)\n\n`;
md += `| Count | Label | Category | Fixtures observed | Paired EN |\n|---|---|---|---|---|\n`;

for (const l of trLabels.slice(0, 30)) {
  const pairedEn = l.pairedLabels.length > 0 ? l.pairedLabels.slice(0,2).join('; ') : '—';
  const cats = l.categories.length > 0 ? l.categories.join(', ') : '—';
  md += `| ${l.count} | ${l.label} | ${cats} | ${l.fixtures.join(', ')} | ${pairedEn} |\n`;
}

md += `\n## Turkish Labels — Long tail (count ≤ 2)\n\n`;

const trLongTail = trLabels.filter(l => l.count <= 2);
for (const l of trLongTail) {
  const pairedEn = l.pairedLabels.length > 0 ? ` → EN: ${l.pairedLabels[0]}` : '';
  md += `- **${l.label}** (${l.count}× in ${l.fixtures.join(', ')}${pairedEn})\n`;
}

// ─── Normalization collisions (labels that collapse to same normalized form) ──

const collisions = [...byNormalized.entries()]
  .filter(([, rec]) => rec.variants.length > 1)
  .sort((a, b) => b[1].totalCount - a[1].totalCount);

md += `\n## Normalization Collisions\n\n`;
md += `Labels that collapse to the same form after case/whitespace normalization.\n`;
md += `These are candidates for the first round of matchers.\n\n`;

if (collisions.length === 0) {
  md += `_No collisions found._\n`;
} else {
  md += `| Normalized | Variants | Total Count |\n|---|---|---|\n`;
  for (const [norm, rec] of collisions) {
    md += `| ${norm} | ${rec.variants.map(v => `"${v}"`).join(', ')} | ${rec.totalCount} |\n`;
  }
}

// ─── Category distribution ───────────────────────────────────────────────────

const categoryMap = new Map();
for (const entry of allLabels) {
  const cat = entry.category || 'uncategorized';
  if (!categoryMap.has(cat)) categoryMap.set(cat, 0);
  categoryMap.set(cat, categoryMap.get(cat) + 1);
}
const catSorted = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

md += `\n## Category Distribution\n\n`;
md += `| Category | Occurrences |\n|---|---|\n`;
for (const [cat, count] of catSorted) {
  md += `| ${cat} | ${count} |\n`;
}

// ─── Write output ────────────────────────────────────────────────────────────

fs.writeFileSync(OUTPUT_PATH, md);
console.log(`\n✅ Written to ${OUTPUT_PATH}`);
console.log(`   ${uniqueExact} unique exact labels (${enUnique} EN + ${trUnique} TR)`);
console.log(`   ${uniqueNormalized} unique after normalization`);
console.log(`   ${collisions.length} normalization collisions`);
console.log(`   ${enLongTail.length} EN long-tail labels (count ≤ 2)`);
console.log(`   ${trLongTail.length} TR long-tail labels (count ≤ 2)`);
