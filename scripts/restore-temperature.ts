import { createClient } from '@supabase/supabase-js'

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    // Try to read from .env
    const dotenv = await import('dotenv')
    dotenv.config()
    const url2 = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
    const key2 =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY
    if (!url2 || !key2) {
      console.error(
        'Still missing after dotenv. Available:',
        Object.keys(process.env).filter((k) => k.includes('SUPABASE'))
      )
      process.exit(1)
    }
    return run(url2, key2)
  }
  return run(url, key)
}

async function run(url: string, key: string) {
  const sb = createClient(url, key)

  const { data, error } = await sb
    .from('app_settings')
    .update({ value: '0.1' })
    .eq('category', 'ai')
    .eq('key', 'temperature')
    .select()
    .single()

  if (error) {
    console.error('Error:', error)
    process.exit(1)
  }
  console.log('✅ Restored temperature to:', data.value)

  // Verify via API
  const configRes = await fetch('http://localhost:4001/api/config/ai')
  const configData = (await configRes.json()) as any
  console.log('Verified via API:', configData?.data?.temperature)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
