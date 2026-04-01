import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '');

async function run() {
  const { data, error } = await supabase
    .from('policies')
    .select('*')
    .eq('policy_number', '1680600025');
    
  if (error) {
    console.error('Error fetching policy:', error);
    return;
  }
  
  if (!data || data.length === 0) {
     console.log('NO ROWS FOUND');
     return;
  }
  
  const record = data[0];
  console.log('--- BASIC COLUMNS ---');
  console.log('id:', record.id);
  console.log('provider:', record.provider);
  console.log('type:', record.type);
  console.log('insured:', record.insured);
  
  console.log('\n--- EXTRACTED DATA ---');
  console.log(JSON.stringify(record.extracted_data, null, 2));
  
  console.log('\n--- COVERAGES ---');
  console.log(JSON.stringify(record.coverages, null, 2));
  
  console.log('\n--- EXCLUSIONS ---');
  console.log(JSON.stringify(record.exclusions, null, 2));

  console.log('\n--- RAW DATA / OCR OTHER ---');
  if (record.raw_data) {
    const subset = { ...record.raw_data };
    delete subset.extractedText;
    delete subset.processedText;
    delete subset.original_text;
    delete subset.text;
    delete subset.coverages;
    delete subset.exclusions;
    delete subset.aiInsights;
    console.log(JSON.stringify(subset, null, 2));
  } else {
    console.log('No raw_data');
  }
}
run();
