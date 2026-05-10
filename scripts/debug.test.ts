import dotenv from 'dotenv'
dotenv.config()
import { createClient } from '@supabase/supabase-js'
import { test } from 'vitest'

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

test('debug failures — cross‑reference policies table with PDFs', async () => {
  // List recent policies with their raw_data
  const { data, error } = await supabase
    .from('policies')
    .select('id, policy_number, provider, type, status')
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.log(`Query error: ${error.message}`)
    return
  }
  if (!data || data.length === 0) {
    console.log('No policies found in database')
    return
  }
  console.log('Recent policies:')
  for (const row of data) {
    console.log(
      `  ${row.id} | ${row.policy_number} | ${row.provider?.slice(0, 30)} | ${row.type} | ${row.status}`
    )
  }
})
