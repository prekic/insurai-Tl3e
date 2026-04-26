import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config()

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const db = createClient(url, key)

async function test() {
  const { data } = await db.from('app_settings').select('*').eq('category', 'ai')
  console.log(data)
}
test()
