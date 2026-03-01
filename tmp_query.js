import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing SUPABASE env vars")
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
    console.log("Fetching actuarial runs...")
    const { data, error } = await supabase.from('actuarial_evaluation_runs').select('*').limit(100)
    if (error) {
        console.error(error)
        return
    }

    if (data.length === 0) {
        console.log("No data found.")
        return
    }

    const avgDuration = data.reduce((sum, r) => sum + (r.duration_ms || 0), 0) / data.length
    const maxDuration = Math.max(...data.map(r => r.duration_ms || 0))
    const minDuration = Math.min(...data.map(r => r.duration_ms || Infinity))

    console.log(`Total rows: ${data.length}`)
    console.log(`Avg Duration: ${avgDuration}ms`)
    console.log(`Min Duration: ${minDuration}ms`)
    console.log(`Max Duration: ${maxDuration}ms`)

    console.log("\nLayer averages:")
    const avgA = data.reduce((sum, r) => sum + (r.layer_a_ms || 0), 0) / data.length
    const avgB = data.reduce((sum, r) => sum + (r.layer_b_ms || 0), 0) / data.length
    const avgC = data.reduce((sum, r) => sum + (r.layer_c_ms || 0), 0) / data.length
    const dCount = data.filter(r => r.layer_d_ms != null).length
    const avgD = dCount > 0 ? data.reduce((sum, r) => sum + (r.layer_d_ms || 0), 0) / dCount : 0

    console.log(`Layer A: ${avgA}ms`)
    console.log(`Layer B: ${avgB}ms`)
    console.log(`Layer C: ${avgC}ms`)
    console.log(`Layer D (if run): ${avgD}ms`)
}

run()
