/**
 * Extraction Accuracy Check — run occasionally (not in CI, needs AI calls).
 *
 * Usage:
 *   node scripts/extraction-accuracy-check.cjs              # run all 67 PDFs
 *   node scripts/extraction-accuracy-check.cjs 3            # run first 3 only
 *   node scripts/extraction-accuracy-check.cjs --continue   # resume from last run
 *
 * Exit codes:
 *   0 = accuracy ≥ 80% (pass)
 *   1 = accuracy < 80% (fail)
 *
 * Requirements:
 * - Backend running on localhost:4001 (or BACKEND_URL env)
 * - Must run from project root
 * - Results cached in /tmp/extraction-accuracy-cache/ for resume support
 */

const fs = require('fs');
const path = require('path');
const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');

const BACKEND = process.env.BACKEND_URL || 'http://localhost:4001';
const POLICIES_DIR = path.resolve(__dirname, '..', 'policies');
const CACHE_DIR = '/tmp/extraction-accuracy-cache';
const MIN_ACCURACY = parseFloat(process.env.MIN_ACCURACY || '0.8');

// =============================================================================
// Expected values for known policies (extend as you verify more)
// These are YOUR manually verified ground truths
// =============================================================================
const EXPECTED = {
  // Anadolu Sigorta — Güneş UZ — VW Golf 2001
  'ANADOLU.PDF': {
    provider: 'ANADOLU',
    insuredName: 'GÜNEŞ UZ',
    plate: '35 PR 962',
    vin: 'WVZZZ1JZ1W484917',
    vehicleMake: 'VOLKSWAGEN',
    vehicleModel: 'GOLF',
    vehicleYear: 2001,
    premium: 1150,
    policyNumber: 'T155336589',
    hasVkn: false,     // individual policy, no VKN
    hasTcKimlik: true, // should have TCKN
  },
  // Anadolu Sigorta — USLU ÇSM — Renault Clio 2018
  'KASKO POLİÇESİ.pdf': {
    provider: 'ANADOLU',
    insuredName: 'USLU',
    plate: '35 G 0001',
    vin: 'VF15R436D62350356',
    vehicleMake: 'RENAULT',
    vehicleModel: 'CLIO',
    vehicleYear: 2018,
    premium: 2599,
    policyNumber: '101450719',
    startDate: '2019-01-04',
    endDate: '2020-01-04',
    hasVkn: true,
    hasTcKimlik: false,
  },
  // Erdemir — Mercedes Actros 2012 — 67TY932
  'KASKO_ERDEMIR_Eregli_462660767_67TY932_2024.12-2025.12.pdf': {
    provider: 'AXA',
    insuredName: 'EREĞLİ DEMİR',
    plate: '67TY932',
    vin: 'WDB9341611L632460',
    vehicleMake: 'MERCEDES',
    vehicleModel: 'ACTROS',
    vehicleYear: 2012,
    premium: 32226.47,
    policyNumber: '462660767',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    hasVkn: true,
    hasTcKimlik: false,
  },
  // Erdemir — Renault Talisman 2016 — 06ADF115
  'KASKO_ERDEMIR_Eregli_462660818_06ADF115_2024.12-2025.12.pdf': {
    provider: 'AXA',
    insuredName: 'EREĞLİ DEMİR',
    plate: '06ADF115',
    vin: 'VF1RFD00456618678',
    vehicleMake: 'RENAULT',
    vehicleModel: 'TALISMAN',
    vehicleYear: 2016,
    premium: 11240.40,
    policyNumber: '462660818',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    hasVkn: true,
    hasTcKimlik: false,
  },
  // Honda Motorcycle 2016 — 31KLC75
  '201605061110254355_112575736_0_1 kasko (1).pdf': {
    provider: 'AXA',
    insuredName: 'İSKENDERUN DEMİR',
    plate: '31KLC75',
    vin: 'LALKC11B2E3300301',
    vehicleMake: 'HONDA',
    vehicleModel: 'CBF',
    vehicleYear: 2014,
    premium: 78.20,
    policyNumber: '112575736',
    startDate: '2016-01-01',
    endDate: '2017-01-01',
    hasVkn: true,
    hasTcKimlik: false,
  },
};

// =============================================================================
// Helpers
// =============================================================================

function slugify(name) {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 100);
}

function extractText(pdfPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const buf = fs.readFileSync(pdfPath);
      const doc = await getDocument({ data: buf.buffer }).promise;
      let text = '';
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n';
      }
      resolve({ text, pages: doc.numPages });
    } catch (e) {
      reject(e);
    }
  });
}

function fetchWithTimeout(url, options, timeoutMs = 120000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

function compareField(actual, expected, fieldName) {
  if (expected === undefined || expected === null) return { score: 1, detail: `Skipped` };
  
  const a = String(actual || '').toLowerCase().trim();
  const e = String(expected).toLowerCase().trim();
  
  if (a === e) return { score: 1, detail: `✅ ${actual}` };
  if (a.includes(e) || e.includes(a)) return { score: 0.8, detail: `🟡 got "${actual}", expected "${expected}"` };
  if (typeof actual === 'number' && typeof expected === 'number') {
    const ratio = Math.abs(actual - expected) / Math.max(actual, expected);
    if (ratio < 0.1) return { score: 0.9, detail: `🟡 ${actual} vs ${expected} (${(ratio*100).toFixed(0)}% off)` };
  }
  return { score: 0, detail: `❌ got "${actual}", expected "${expected}"` };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const limit = process.argv[2] ? parseInt(process.argv[2]) : Infinity;
  const resume = process.argv.includes('--continue');
  
  if (resume) console.log('🔄 Resume mode — skipping cached results');
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  
  // Get all policy files
  const allFiles = fs.readdirSync(POLICIES_DIR).filter(f => f.endsWith('.pdf') || f.endsWith('.PDF'));
  console.log(`\n📊 Extraction Accuracy Check — ${allFiles.length} policy files found`);
  console.log(`   Backend: ${BACKEND}`);
  console.log(`   Threshold: ${(MIN_ACCURACY * 100).toFixed(0)}%\n`);
  
  const filesToRun = allFiles.slice(0, limit);
  const knownKeys = Object.keys(EXPECTED);
  const filesWithExpected = filesToRun.filter(f => EXPECTED[f]);
  const filesUnknown = filesToRun.filter(f => !EXPECTED[f]);
  
  console.log(`   ${filesWithExpected.length} with ground truth, ${filesUnknown.length} unknown\n`);
  
  const results = [];
  
  // Process files with known ground truth first
  for (const file of filesWithExpected) {
    const cacheFile = path.join(CACHE_DIR, slugify(file) + '.json');
    if (resume && fs.existsSync(cacheFile)) {
      console.log(`📦 ${file} (cached)`);
      results.push(JSON.parse(fs.readFileSync(cacheFile, 'utf-8')));
      continue;
    }
    
    process.stdout.write(`🔍 ${file}... `);
    try {
      const { text } = await extractText(path.join(POLICIES_DIR, file));
      
      const res = await fetchWithTimeout(`${BACKEND}/api/ai/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentText: text.substring(0, 50000),
          systemPrompt: 'You are an expert Turkish kasko insurance policy parser. Extract all policy details into structured JSON, including: policy number, provider, insured name (full), vehicle plate, VIN (Şasi No), make and model (split), year, premium (total), coverage start and end dates, TC Kimlik No (11-digit individual ID), and Vergi No VKN (10-digit tax ID for companies). Scan ALL lines for ID numbers near labels like Vergi No or TC Kimlik. Return null for any missing field. Do NOT guess.'
        }),
      }, 180000);
      
      const result = await res.json();
      
      if (!result.success) {
        console.log(`❌ API error: ${result.error}`);
        results.push({ file, error: result.error, score: 0 });
        continue;
      }
      
      const d = result.data || {};
      const exp = EXPECTED[file];
      
      // Score each field
      let totalScore = 0, fieldCount = 0;
      const fields = {};
      
      const checks = [
        ['provider', d.provider, exp.provider],
        ['insuredName', d.insuredName, exp.insuredName],
        ['plate', d.vehiclePlate, exp.plate],
        ['vin', d.vin, exp.vin],
        ['vehicleMake', d.vehicleMake, exp.vehicleMake],
        ['vehicleModel', d.vehicleModel, exp.vehicleModel],
        ['vehicleYear', d.vehicleYear, exp.vehicleYear],
        ['premium', d.premium, exp.premium],
        ['policyNumber', d.policyNumber, exp.policyNumber],
      ];
      
      if (exp.startDate) checks.push(['startDate', d.startDate, exp.startDate]);
      if (exp.endDate) checks.push(['endDate', d.endDate, exp.endDate]);
      
      // ID field checks
      if (exp.hasVkn) {
        const vknScore = d.vkn && d.vkn.length > 5 ? 1 : 0;
        totalScore += vknScore;
        fieldCount++;
        fields['vkn'] = { score: vknScore, detail: d.vkn ? `✅ ${d.vkn}` : '❌ missing VKN' };
      }
      if (exp.hasTcKimlik) {
        const tcknScore = d.tcKimlik && d.tcKimlik.length > 5 ? 1 : 0;
        totalScore += tcknScore;
        fieldCount++;
        fields['tcKimlik'] = { score: tcknScore, detail: d.tcKimlik ? `✅ ${d.tcKimlik}` : '❌ missing TCKN' };
      }
      
      for (const [name, actual, expected] of checks) {
        const r = compareField(actual, expected, name);
        totalScore += r.score;
        fieldCount++;
        fields[name] = r;
      }
      
      const accuracy = fieldCount > 0 ? totalScore / fieldCount : 0;
      
      console.log(`(${(accuracy * 100).toFixed(0)}%)`);
      if (accuracy < 0.8) {
        Object.entries(fields).forEach(([k, v]) => {
          if (v.score < 1) console.log(`  ${v.detail}`);
        });
      }
      
      const entry = {
        file,
        provider: result.provider,
        accuracy,
        fields,
        premium: d.premium,
        plate: d.vehiclePlate,
        vkn: d.vkn,
        tcKimlik: d.tcKimlik,
        policyNumber: d.policyNumber,
      };
      
      fs.writeFileSync(cacheFile, JSON.stringify(entry, null, 2));
      results.push(entry);
      
    } catch (e) {
      console.log(`❌ Error: ${e.message}`);
      results.push({ file, error: e.message, score: 0 });
    }
  }
  
  // For unknown files — just log what was extracted (no ground truth to compare)
  for (const file of filesUnknown) {
    process.stdout.write(`🔍 ${file} (no ground truth)... `);
    try {
      const { text, pages } = await extractText(path.join(POLICIES_DIR, file));
      const res = await fetchWithTimeout(`${BACKEND}/api/ai/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentText: text.substring(0, 50000),
          systemPrompt: 'You are an expert Turkish kasko insurance policy parser. Extract all policy details into structured JSON, including: policy number, provider, insured name (full), vehicle plate, VIN (Şasi No), make and model (split), year, premium (total), coverage start and end dates, TC Kimlik No (11-digit individual ID), and Vergi No VKN (10-digit tax ID for companies). Scan ALL lines for ID numbers near labels like Vergi No or TC Kimlik. Return null for any missing field. Do NOT guess.'
        }),
      }, 180000);
      const result = await res.json();
      
      if (result.success) {
        const d = result.data || {};
        console.log(`(${pages}p, ${result.provider}) plate:${d.vehiclePlate || '?'} vin:${d.vin ? d.vin.substring(0,8)+'...' : '?'} premium:${d.premium || '?'} vkn:${d.vkn || '?'} tckn:${d.tcKimlik || '?'}`);
      } else {
        console.log(`❌ ${result.error}`);
      }
    } catch (e) {
      console.log(`❌ ${e.message}`);
    }
  }
  
  // =========================================================================
  // FINAL REPORT
  // =========================================================================
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 ACCURACY REPORT');
  console.log('═══════════════════════════════════════════════');
  
  const scoredResults = results.filter(r => r.accuracy !== undefined);
  
  if (scoredResults.length === 0) {
    console.log('\nNo ground truth data to compare. To add expected values:');
    console.log('1. Review extraction output for a policy');
    console.log('2. Add it to the EXPECTED object in this script');
    return;
  }
  
  const avgAccuracy = scoredResults.reduce((s, r) => s + r.accuracy, 0) / scoredResults.length;
  
  console.log(`\nTotal policies with ground truth: ${scoredResults.length}/${filesToRun.length}`);
  console.log(`Average accuracy: ${(avgAccuracy * 100).toFixed(1)}%`);
  console.log(`Threshold: ${(MIN_ACCURACY * 100).toFixed(0)}%`);
  
  // Per-field breakdown
  const fieldTotals = {};
  const fieldCounts = {};
  for (const r of scoredResults) {
    for (const [field, result] of Object.entries(r.fields)) {
      if (!fieldTotals[field]) { fieldTotals[field] = 0; fieldCounts[field] = 0; }
      fieldTotals[field] += result.score;
      fieldCounts[field]++;
    }
  }
  
  console.log('\n--- Per-field accuracy ---');
  const fieldEntries = Object.entries(fieldTotals)
    .map(([field, total]) => [field, total / fieldCounts[field], fieldCounts[field]])
    .sort((a, b) => a[1] - b[1]);
  
  for (const [field, acc, count] of fieldEntries) {
    const bar = '█'.repeat(Math.round(acc * 20));
    console.log(`  ${field.padEnd(15)} ${(acc * 100).toFixed(0).padStart(3)}% ${bar} (${count})`);
  }
  
  // Individual report
  console.log('\n--- Per-policy ---');
  for (const r of scoredResults) {
    const bar = '█'.repeat(Math.round(r.accuracy * 20));
    console.log(`  ${(r.accuracy * 100).toFixed(0).padStart(3)}% ${bar} ${r.file.substring(0, 60)}`);
  }
  
  console.log('\n');
  if (avgAccuracy >= MIN_ACCURACY) {
    console.log(`✅ PASS: accuracy ${(avgAccuracy * 100).toFixed(1)}% ≥ ${(MIN_ACCURACY * 100).toFixed(0)}%`);
    process.exit(0);
  } else {
    console.log(`❌ FAIL: accuracy ${(avgAccuracy * 100).toFixed(1)}% < ${(MIN_ACCURACY * 100).toFixed(0)}%`);
    console.log('\nSuggestions to improve:');
    console.log('  1. Review the weakest fields above and update the extraction prompt');
    console.log('  2. Add more ground truth entries to EXPECTED in this script');
    console.log('  3. Fix specific failing fields: add Turkish anchors to the prompt');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
