/**
 * Analyze variance across T=0 strict baseline captures.
 */
const fs = require('fs');
const path = require('path');

const dir = path.resolve('tests/fixtures/baseline/T0_strict');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

function findDiffs(obj1, obj2, pathPrefix, results) {
  const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
  for (const k of keys) {
    const fullPath = pathPrefix ? `${pathPrefix}.${k}` : k;
    const v1 = obj1?.[k];
    const v2 = obj2?.[k];
    if (JSON.stringify(v1) !== JSON.stringify(v2)) {
      if (typeof v1 === 'object' && typeof v2 === 'object' && v1 !== null && v2 !== null && !Array.isArray(v1)) {
        findDiffs(v1, v2, fullPath, results);
      } else {
        results.push(fullPath);
      }
    }
  }
}

function resolveField(obj, dotPath) {
  const parts = dotPath.split('.');
  let current = obj;
  for (const p of parts) {
    current = current?.[p];
  }
  return current;
}

function normalize(d) {
  const clone = JSON.parse(JSON.stringify(d));
  const metaKeys = ['usage','cost','requestId','elapsedMs','phaseTiming','model','provider','route',
    'fallback','fallbackReason','fallbackChain','serverPhaseTiming','serverElapsedMs',
    'completionMs','totalTokens','inputTokens','outputTokens','cachedTokens',
    'generationModel','promptTokens','responseTokens'];
  for (const key of metaKeys) {
    delete clone[key];
  }
  return JSON.stringify(clone.data ?? clone, null, 0);
}

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const runs = data.runs.filter(r => !r.error);
  console.log(`\n=== ${data.fixture} ===`);
  console.log(`  Successful runs: ${runs.length} / ${data.runs.length}`);

  if (runs.length < 2) {
    console.log('  INSUFFICIENT RUNS for comparison');
    continue;
  }

  const normalized = runs.map(normalize);
  const allIdentical = normalized.every(n => n === normalized[0]);

  if (allIdentical) {
    console.log(`  ✅ IDENTICAL across ${runs.length} runs`);
  } else {
    for (let i = 1; i < normalized.length; i++) {
      if (normalized[i] === normalized[0]) {
        console.log(`  ✅ run0 vs run${i}: IDENTICAL`);
        continue;
      }
      const a = JSON.parse(normalized[0]);
      const b = JSON.parse(normalized[i]);
      const diffs = [];
      findDiffs(a, b, '', diffs);
      console.log(`  ❌ run0 vs run${i}: ${diffs.length} field diffs`);
      for (const d of diffs.slice(0, 15)) {
        const v1 = JSON.stringify(resolveField(a, d))?.slice(0, 100);
        const v2 = JSON.stringify(resolveField(b, d))?.slice(0, 100);
        console.log(`    ${d}:`);
        console.log(`      run0: ${v1}`);
        console.log(`      run${i}: ${v2}`);
      }
      if (diffs.length > 15) {
        console.log(`    ... and ${diffs.length - 15} more`);
      }
    }
  }
}
