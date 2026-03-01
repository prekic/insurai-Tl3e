import * as dotenv from 'dotenv'
dotenv.config()
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function generateMocks() {
    const mockRuns = []
    const now = new Date()

    // We need an actual policy_id from the database to satisfy the foreign key constraint
    const { data: policies } = await supabase.from('policies').select('id').limit(1)
    if (!policies || policies.length === 0) {
        console.error("No policies found in DB. Cannot insert mock evaluation runs due to FK constraint.");
        return;
    }
    const policyId = policies[0].id;

    for (let i = 0; i < 50; i++) {
        const completedAt = new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000)
        const isError = Math.random() < 0.05
        const layerAMs = Math.floor(100 + Math.random() * 50)
        const layerBMs = Math.floor(20 + Math.random() * 10)
        const layerCMs = Math.floor(150 + Math.random() * 100)
        const layerDMs = Math.random() > 0.5 ? Math.floor(50 + Math.random() * 30) : null
        const durationMs = layerAMs + layerBMs + layerCMs + (layerDMs || 0) + Math.floor(Math.random() * 20)

        mockRuns.push({
            policy_id: policyId,
            result_data: { test: true },
            eligible: !isError,
            duration_ms: durationMs,
            layer_a_ms: layerAMs,
            layer_b_ms: layerBMs,
            layer_c_ms: layerCMs,
            layer_d_ms: layerDMs,
            completed_at: completedAt.toISOString()
        })
    }

    // Reload schema cache just in case
    await supabase.rpc('reload_schema', {})

    const { error } = await supabase.from('actuarial_evaluation_runs').insert(mockRuns)
    if (error) {
        console.error("Error inserting:", error)
    } else {
        console.log("Successfully inserted 50 mock runs.")
    }
}

generateMocks()
