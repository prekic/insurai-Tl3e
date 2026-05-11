/**
 * Extraction Quality Gate — run after unit tests in CI.
 * 
 * Checks that key system prompts and extraction logic meet quality criteria.
 * This is a static analysis check — no AI calls needed (would cost too much in CI).
 * 
 * Usage: node scripts/extraction-quality-gate.cjs
 * Exit code: 0 = pass, 1 = fail
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const EXTRACTION_PROMPT_FILE = path.join(PROJECT_ROOT, 'src', 'lib', 'ai', 'kasko-parser-prompts.ts');
const EXTRACTION_SCHEMA_FILE = path.join(PROJECT_ROOT, 'shared', 'extraction-schema.ts');
const EXTRACTION_IMPL_FILE = path.join(PROJECT_ROOT, 'src', 'lib', 'ai', 'policy-extractor.ts');

let errors = [];
let warnings = [];

function checkFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`❌ ${label}: File not found at ${filePath}`);
    return null;
  }
  return fs.readFileSync(filePath, 'utf-8');
}

function checkContains(content, needle, label, severity = 'error') {
  if (!content.includes(needle)) {
    const msg = `❌ ${label}: Missing '${needle}'`;
    if (severity === 'warning') warnings.push(msg);
    else errors.push(msg);
  }
}

function checkNotMissing(content, needles, label) {
  needles.forEach(n => checkContains(content, n, `${label}/${n}`));
}

console.log('=== Extraction Quality Gate ===\n');

// 1. Check prompt file has required fields
let promptContent = checkFile(EXTRACTION_PROMPT_FILE, 'EXTRACTION_SYSTEM_PROMPT');
if (promptContent) {
  const checks = [
    ['tcKimlik', 'Prompt mentions TC Kimlik'],
    ['vkn', 'Prompt mentions VKN/Vergi No'],
    ['Vergi', 'Prompt mentions Vergi/Vergi No'],
    ['netPremium', 'Prompt mentions netPremium'],
    ['totalPremium', 'Prompt mentions totalPremium'],
    ['tax', 'Prompt mentions tax'],
    ['Ödenecek Tutar', 'Prompt has Ödenecek Tutar anchor'],
    ['Vergi Öncesi Prim', 'Prompt has Vergi Öncesi Prim anchor'],
    ['BSMV', 'Prompt has BSMV anchor'],
    ['vehicle.make', 'Prompt has vehicle.make'],
    ['vehicle.model', 'Prompt has vehicle.model'],
    ['vehicle.plate', 'Prompt has vehicle.plate'],
    ['vehicle.year', 'Prompt has vehicle.year'],
    ['coverages', 'Prompt has coverages array'],
    ['deductiblesPenalties', 'Prompt has deductiblesPenalties'],
    ['exclusions', 'Prompt has exclusions array'],
    ['qualityScore', 'Prompt has qualityScore'],
    ['Kasko Bedeli', 'Prompt warns about Kasko Bedeli confusion'],
  ];
  checks.forEach(([needle, label]) => checkContains(promptContent, needle, label));
}

// 2. Check schema file
let schemaContent = checkFile(EXTRACTION_SCHEMA_FILE, 'EXTRACTION_JSON_SCHEMA');
if (schemaContent) {
  checkContains(schemaContent, 'tcKimlik', 'Schema/tcKimlik');
  checkContains(schemaContent, 'vkn', 'Schema/vkn');
  checkContains(schemaContent, 'premium', 'Schema/premium');
  checkContains(schemaContent, 'vin', 'Schema/vin');
  checkContains(schemaContent, 'vehiclePlate', 'Schema/vehiclePlate');
}

// 3. Check extraction implementation
let implContent = checkFile(EXTRACTION_IMPL_FILE, 'Policy Extractor');
if (implContent) {
  checkContains(implContent, 'tcKimlik', 'Impl/tcKimlik extraction mapping');
  checkContains(implContent, 'vkn', 'Impl/vkn extraction mapping');
  checkContains(implContent, 'totalPremium', 'Impl/totalPremium');
}

// 4. Check extraction schema test passes (already in unit tests)

console.log('\n=== Results ===');
if (errors.length === 0 && warnings.length === 0) {
  console.log('✅ All extraction quality checks passed');
  process.exit(0);
}

errors.forEach(e => console.log(e));
warnings.forEach(w => console.log(w));

if (errors.length > 0) {
  console.log(`\n❌ ${errors.length} error(s) found — extraction quality gate FAILED`);
  process.exit(1);
} else {
  console.log(`\n⚠️  ${warnings.length} warning(s) found — extraction quality gate PASSED with warnings`);
  process.exit(0);
}
