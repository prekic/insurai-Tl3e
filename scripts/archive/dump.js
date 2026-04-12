import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env' });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

supabase.from('policies')
  .select('coverage, raw_data')
  .eq('policy_number', '1680600025')
  .single()
  .then(({data, error}) => {
    if (error) {
      console.error(error);
      return;
    }
    fs.writeFileSync('db_coverages.json', JSON.stringify({
      rootCoverage: data.coverage,
      rawCoverageObj: data.raw_data?.coverage,
      rawCoveragesArr: data.raw_data?.coverages
    }, null, 2));
    console.log('Wrote to db_coverages.json');
  });
