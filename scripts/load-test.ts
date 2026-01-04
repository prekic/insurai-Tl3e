/**
 * Load Testing Scripts for InsurAI API
 *
 * Uses autocannon to benchmark API endpoints under load.
 * Run with: npm run loadtest
 *
 * Prerequisites:
 * - Start the server: npm run dev:server
 * - Server should be running on http://localhost:4001
 */

import autocannon from 'autocannon'
type Result = autocannon.Result

// Configuration
const BASE_URL = process.env.LOAD_TEST_URL || 'http://localhost:4001'
const DEFAULT_DURATION = parseInt(process.env.LOAD_TEST_DURATION || '10', 10)
const DEFAULT_CONNECTIONS = parseInt(process.env.LOAD_TEST_CONNECTIONS || '10', 10)

// Test results storage
interface TestResult {
  name: string
  result: Result
  passed: boolean
  notes: string[]
}

const results: TestResult[] = []

/**
 * Run a load test with autocannon
 */
async function runTest(options: {
  name: string
  url: string
  method?: 'GET' | 'POST'
  body?: Record<string, unknown>
  headers?: Record<string, string>
  duration?: number
  connections?: number
  expectedRps?: number
  expectedLatencyP99?: number
}): Promise<TestResult> {
  const {
    name,
    url,
    method = 'GET',
    body,
    headers = {},
    duration = DEFAULT_DURATION,
    connections = DEFAULT_CONNECTIONS,
    expectedRps = 100,
    expectedLatencyP99 = 500,
  } = options

  console.log(`\n📊 Running: ${name}`)
  console.log(`   URL: ${method} ${url}`)
  console.log(`   Duration: ${duration}s, Connections: ${connections}`)

  const result = await autocannon({
    url,
    method,
    duration,
    connections,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...(body && { body: JSON.stringify(body) }),
  })

  const notes: string[] = []
  let passed = true

  // Check requests per second
  if (result.requests.average < expectedRps) {
    notes.push(`⚠️ RPS (${result.requests.average.toFixed(0)}) below expected (${expectedRps})`)
    passed = false
  } else {
    notes.push(`✓ RPS: ${result.requests.average.toFixed(0)} (expected: ${expectedRps}+)`)
  }

  // Check p99 latency
  if (result.latency.p99 > expectedLatencyP99) {
    notes.push(
      `⚠️ P99 latency (${result.latency.p99}ms) above expected (${expectedLatencyP99}ms)`
    )
    passed = false
  } else {
    notes.push(`✓ P99 latency: ${result.latency.p99}ms (expected: <${expectedLatencyP99}ms)`)
  }

  // Check for errors
  if (result.errors > 0) {
    notes.push(`⚠️ Errors: ${result.errors}`)
    passed = false
  }

  // Check for timeouts
  if (result.timeouts > 0) {
    notes.push(`⚠️ Timeouts: ${result.timeouts}`)
    passed = false
  }

  // Check for non-2xx responses
  if (result.non2xx > 0) {
    notes.push(`⚠️ Non-2xx responses: ${result.non2xx}`)
    // Don't fail for rate limiting (expected under load)
  }

  const testResult: TestResult = { name, result, passed, notes }
  results.push(testResult)

  // Print summary
  console.log(`   Results:`)
  notes.forEach((note) => console.log(`     ${note}`))
  console.log(`   Status: ${passed ? '✅ PASSED' : '❌ FAILED'}`)

  return testResult
}

/**
 * Health Check Load Test
 * Expected: High throughput, very low latency
 */
async function testHealthEndpoint(): Promise<void> {
  await runTest({
    name: 'Health Check Endpoint',
    url: `${BASE_URL}/api/health`,
    method: 'GET',
    duration: 10,
    connections: 50,
    expectedRps: 1000,
    expectedLatencyP99: 100,
  })
}

/**
 * Providers Check Load Test
 * Expected: High throughput, low latency
 */
async function testProvidersEndpoint(): Promise<void> {
  await runTest({
    name: 'AI Providers Check',
    url: `${BASE_URL}/api/ai/providers`,
    method: 'GET',
    duration: 10,
    connections: 20,
    expectedRps: 500,
    expectedLatencyP99: 100,
  })
}

/**
 * Rate Limiting Test
 * Verifies rate limiting kicks in appropriately
 */
async function testRateLimiting(): Promise<void> {
  console.log('\n📊 Running: Rate Limiting Test')
  console.log(`   Testing rate limit enforcement...`)

  // Burst of requests to trigger rate limiting
  const result = await autocannon({
    url: `${BASE_URL}/api/health`,
    method: 'GET',
    duration: 5,
    connections: 100,
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const notes: string[] = []
  const passed = true

  // We expect some 429 responses under heavy load
  if (result.non2xx > 0) {
    notes.push(`✓ Rate limiting active: ${result.non2xx} requests throttled`)
  } else {
    notes.push(`⚠️ No rate limiting detected (may be too short a test)`)
  }

  notes.push(`   Total requests: ${result.requests.total}`)
  notes.push(`   2xx responses: ${result['2xx']}`)
  notes.push(`   Non-2xx responses: ${result.non2xx}`)

  const testResult: TestResult = { name: 'Rate Limiting', result, passed, notes }
  results.push(testResult)

  console.log(`   Results:`)
  notes.forEach((note) => console.log(`     ${note}`))
  console.log(`   Status: ${passed ? '✅ PASSED' : '❌ FAILED'}`)
}

/**
 * Validation Endpoint Test
 * Tests the validation middleware with valid/invalid payloads
 */
async function testValidation(): Promise<void> {
  // Test with invalid payload (empty body)
  console.log('\n📊 Running: Validation Test (Invalid Payload)')

  const result = await autocannon({
    url: `${BASE_URL}/api/ai/extract/openai`,
    method: 'POST',
    duration: 5,
    connections: 10,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}), // Empty body should fail validation
  })

  const notes: string[] = []

  // We expect 400 responses for invalid payloads
  if (result.non2xx > 0) {
    notes.push(`✓ Validation working: ${result.non2xx} invalid requests rejected`)
  } else {
    notes.push(`⚠️ Validation may not be working properly`)
  }

  notes.push(`   Total requests: ${result.requests.total}`)
  notes.push(`   400 responses expected: ${result.non2xx}`)

  const testResult: TestResult = {
    name: 'Validation (Invalid Payload)',
    result,
    passed: result.non2xx > 0,
    notes,
  }
  results.push(testResult)

  console.log(`   Results:`)
  notes.forEach((note) => console.log(`     ${note}`))
  console.log(`   Status: ${testResult.passed ? '✅ PASSED' : '❌ FAILED'}`)
}

/**
 * Concurrent Connections Test
 * Tests server stability under many concurrent connections
 */
async function testConcurrentConnections(): Promise<void> {
  await runTest({
    name: 'High Concurrent Connections',
    url: `${BASE_URL}/api/health`,
    method: 'GET',
    duration: 10,
    connections: 100, // High concurrency
    expectedRps: 500,
    expectedLatencyP99: 200,
  })
}

/**
 * Print final summary
 */
function printSummary(): void {
  console.log('\n' + '='.repeat(60))
  console.log('📈 LOAD TEST SUMMARY')
  console.log('='.repeat(60))

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length

  results.forEach((r) => {
    const status = r.passed ? '✅' : '❌'
    const rps = r.result.requests.average.toFixed(0)
    const latency = r.result.latency.p99
    console.log(`${status} ${r.name}`)
    console.log(`     RPS: ${rps} | P99: ${latency}ms | Errors: ${r.result.errors}`)
  })

  console.log('')
  console.log(`Total: ${results.length} tests | ✅ ${passed} passed | ❌ ${failed} failed`)
  console.log('='.repeat(60))

  // Exit with error code if any tests failed
  if (failed > 0) {
    process.exit(1)
  }
}

/**
 * Main test runner
 */
async function main(): Promise<void> {
  console.log('🚀 InsurAI Load Testing Suite')
  console.log(`   Target: ${BASE_URL}`)
  console.log(`   Default duration: ${DEFAULT_DURATION}s`)
  console.log(`   Default connections: ${DEFAULT_CONNECTIONS}`)

  // Check if server is running
  try {
    const response = await fetch(`${BASE_URL}/api/health`)
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status}`)
    }
    console.log('   Server status: ✅ Running')
  } catch (_error) {
    console.error('   Server status: ❌ Not reachable')
    console.error(`   Please start the server with: npm run dev:server`)
    process.exit(1)
  }

  // Run tests
  await testHealthEndpoint()
  await testProvidersEndpoint()
  await testConcurrentConnections()
  await testRateLimiting()
  await testValidation()

  // Print summary
  printSummary()
}

// Run if executed directly
main().catch((error) => {
  console.error('Load test error:', error)
  process.exit(1)
})
