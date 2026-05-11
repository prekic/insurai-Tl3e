/**
 * Compare AI extraction output vs human-readable policy data.
 * Usage: node scripts/compare-extraction.cjs
 *
 * Requirements:
 * - Backend running on localhost:4001
 * - pdfjs-dist installed
 */

const { getDocument } = require('pdfjs-dist/legacy/build/pdf.mjs');
const fs = require('fs');
const path = require('path');

async function extractText(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const doc = await getDocument({ data: buf.buffer }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return { text, pages: doc.numPages };
}

const policiesDir = 'policies';

// Pick diverse policies: old Anadolu, company policy, 2 fleet vehicles, motorcycle
const files = [
  'ANADOLU.PDF',
  'KASKO POLİÇESİ.pdf',
];

const allFiles = fs.readdirSync(policiesDir);
const erdemFiles = allFiles.filter(f => f.startsWith('KASKO_ERDEM'));
files.push(erdemFiles.find(f => f.includes('67TY932')));
files.push(erdemFiles.find(f => f.includes('06ADF115')));
files.push(allFiles.find(f => f.startsWith('201605061110')));

async function main() {
  // === Step 1: Show raw text key data ===
  for (const file of files) {
    if (!file || !fs.existsSync(path.join(policiesDir, file))) continue;
    const { text, pages } = await extractText(path.join(policiesDir, file));
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`📄 ${file} — ${pages} pages, ${(text.length/1000).toFixed(0)}KB`);
    console.log('═══════════════════════════════════════════');
    console.log(text.substring(0, 1500));
  }
  
  // === Step 2: AI comparison ===
  console.log('\n\n█████████████████████████████████████████');
  console.log('██  AI EXTRACTION COMPARISON');
  console.log('█████████████████████████████████████████\n');
  
  for (const file of files) {
    if (!file || !fs.existsSync(path.join(policiesDir, file))) continue;
    
    try {
      const { text } = await extractText(path.join(policiesDir, file));
      const res = await fetch('http://localhost:4001/api/ai/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentText: text.substring(0, 30000),
          systemPrompt: 'Extract all insurance policy details as structured JSON.'
        }),
        signal: AbortSignal.timeout(120000)
      });
      
      const result = await res.json();
      console.log('───────────────────────────────────────────');
      console.log(`🤖 ${file}`);
      if (result.success) {
        const d = result.data || {};
        console.log(`   Provider: ${result.provider}`);
        console.log(`   Policy#: ${d.policyNumber}`);
        console.log(`   Insured: ${d.insuredName}`);
        console.log(`   Plate: ${d.vehiclePlate}`);
        console.log(`   Vehicle: ${d.vehicleMake} ${d.vehicleModel} (${d.vehicleYear})`);
        console.log(`   VIN: ${d.vin}`);
        console.log(`   Premium: ${d.premium} ${d.currency}`);
        console.log(`   Period: ${d.startDate || '?'} → ${d.endDate || '?'}`);
        console.log(`   TCKN: ${d.tcKimlik || '—'} | VKN: ${d.vkn || '—'}`);
        console.log(`   Coverages: ${(d.coverages || []).length}`);
        (d.coverages || []).slice(0, 5).forEach(c =>
          console.log(`     • ${c.name || c.coverageName}: ${c.limit || c.amount}`));
      } else {
        console.log(`   ❌ ${result.error}`);
      }
    } catch(e) {
      console.log(`   ❌ ${file}: ${e.message}`);
    }
  }
}

main().catch(e => console.error(e));
