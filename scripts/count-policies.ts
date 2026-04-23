import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data, count } = await sb.from('policies').select('id, provider', { count: 'exact' })
  const providers = [...new Set(data?.map((p: any) => p.provider))]
  console.log('Total policies:', count ?? data?.length)
  console.log('Unique providers:', providers.length)
  providers.forEach((p: string) => console.log('  -', p))
}

main()
