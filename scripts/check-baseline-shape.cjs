const fs = require('fs');
const path = require('path');

// Read one sample to understand structure
const d = JSON.parse(fs.readFileSync('tests/fixtures/baseline/T0/anadolu-volkswagen-golf.pdf.json','utf8'));
console.log('Top keys:', Object.keys(d));
console.log('Fixture:', d.fixture);
console.log('Runs:', d.runs?.length);
const r = d.runs?.[0];
if(r) {
  console.log('Run keys:', Object.keys(r));
  console.log('Has data:', !!r.data);
  if(r.data) {
    console.log('Data keys:', Object.keys(r.data));
    console.log('Coverages count:', r.data.coverages?.length);
    if(r.data.coverages?.[0]) {
      console.log('Coverage keys:', Object.keys(r.data.coverages[0]));
      console.log('Sample:', JSON.stringify(r.data.coverages[0]).slice(0,300));
    }
  }
}

// Also check T0_strict/golf
const d2 = JSON.parse(fs.readFileSync('tests/fixtures/baseline/T0_strict/anadolu-volkswagen-golf.pdf.json','utf8'));
console.log('\nT0_strict golf:');
console.log('Runs:', d2.runs?.length, 'successful:', d2.runs?.filter(r => !r.error).length);
