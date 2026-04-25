import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const ids = [
    '54e1e5a8-2293-4341-84ca-c4a4ff5909b2',
    '4480c204-6bd8-435e-a40a-fe13d9e7a55d',
    '0b8273bb-b028-4416-a806-302d73bad2dd',
    '5a96af60-5c36-42bf-b960-60d48e91be27'
  ];

  console.log('Deleting garbage rows...');
  const { data, error } = await supabase
    .from('policies')
    .delete()
    .in('id', ids);

  if (error) {
    console.error('Error deleting rows:', error);
  } else {
    console.log('Deleted successfully', data);
  }
}

run();
