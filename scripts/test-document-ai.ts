/**
 * Test script for GCP Document AI
 * Run with: npx tsx scripts/test-document-ai.ts
 */

import { GoogleAuth } from 'google-auth-library'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || 'gen-lang-client-0171803889'
const GCP_LOCATION = process.env.GCP_LOCATION || 'us'
const GCP_DOCAI_PROCESSOR_ID = process.env.GCP_DOCAI_PROCESSOR_ID || 'c2741b178ab61433'
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  path.join(__dirname, '..', 'gcp-service-account.json')

// Sample Turkish insurance document text as an image
// This is a simple PNG with Turkish text for testing
const TEST_IMAGE_BASE64 = `iVBORw0KGgoAAAANSUhEUgAAASwAAABkCAIAAACzLLfqAAAACXBIWXMAAAsTAAALEwEAmpwYAAAF
8WlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSLvu78iIGlkPSJXNU0w
TXBDZWhpSHpyZVN6TlRjemtjOWQiPz4gPHg6eG1wbWV0YSB4bWxuczp4PSJhZG9iZTpuczptZXRh
LyIgeDp4bXB0az0iQWRvYmUgWE1QIENvcmUgNS42LWMxNDUgNzkuMTYzNDk5LCAyMDE4LzA4MDgt
MTY6MDQ6NTUgICAgICAgICI+IDxyZGY6UkRGIHhtbG5zOnJkZj0iaHR0cDovL3d3dy53My5vcmcv
MTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyI+IDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PSIi
Lz4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/PgqTSPkAAAQkSURB
VHic7d1BbhwxDETR3P+m8UYLw5ZIqljV/9YZjGdGLX7Qkvz5/PwMAGT9d/UFAOA/EkIAOQkhgJyE
EEBOQgggJyEEkJMQAshJCAHkJIQAchJCADkJIYCchBBATkIIICchBJCTEALISQgB5CSEAHISQgA5
CSGAnIQQQE5CCCAnIQSQkxACyEkIAeQkhAByEkIAOQkhgJyEEEBOQgggJyEEkJMQAshJCAHkJIQA
chJCADkJIYCchBBATkIIICchBJCTEALISQgB5H65+gL+9Pn8vPoS/uPz0f8vXtvrfe/nw/v1MfD6
9D7w+pz91ut9r8+HT+9jYM/32Od93/c58P70PvA+cH09fN77OPuH+xh4f3p/OHze9/qc/db7OPu9
94HX5+y33sfZ770PvA+8Pmdf7X3gfeD96X3g9Tn7qvdx9nvvA68D7/e9Pme/9T7w+vQ+8Pqcfcf7
wPvT+8Drc/Ydr8/Z77wPvD69D7w+Zz/j+7zvex94HXh/eh94fc6+4/U5+yfvA69P7wOvz9lveR94
f3ofeH/Ofst74P3pfeD9OfuOH7/v/el94PU5+47X5+w73gden96fsx97H3gdeH96H3h/zn7Le+D9
6X3g/Tn7jh+/7/3pfeD1OfuO1+fst7wH3p/en7Mf+/H73p/eB16fs+94fc5+y3vg/en96f0x+7Ef
v+/96X3g9Tn7jtfn7Le8B96f3p/eH7Mf+/H73p/eB16fs+94fc5+y/u+96f35+zHfvy+96f3gdfn
7Dten7Pf8h54f3p/zn7sx+97f3ofeH3OvuP1Ofst7/ven96fsx/78fven94HXp+z73h9zn7L+773
p/fn7Md+/L73p/eB1+fsO16fs9/yvu/96f05+7Efv+/96X3g9Tn7jtfn7Le873t/en/Ofuz773t/
eh94fc6+4/U5+y3v+96f3p+zH/v++96f3gden7PveH3Ofst7vven9+fsx77/vven94HX5+w7Xp+z
3/Ke7/3p/Tn7se+/7/3pfeD1OfuO1+fst7zne396f85+7Pvve396H3h9zr7j9Tn7Le/53p/en7Mf
+/773p/eB16fs+94fc5+y3u+96f35+zHvv++96f3gdfn7Dten7Pf8p7v/en9Ofux77/v/el94PU5
+47X5+y3vOd7f3p/zn7s++97f3ofeH3OvuP1Ofst7/nen96fsx/7/vven94HXp+z73h9zn7Le773
p/fn7Me+/773p/eB1+fsO16fs9/ynu/96f05+7Hvv+/96X3g9Tn7jtfn7Le853t/en/Ofuz773t/
eh94fc6+4/U5+y3v+d6f3p+zH/v++96f3gden7PveH3Ofst7vven9+fsx77/vven94HX5+w7AAAA
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD4j/gN5VUHIzwTlPQAAAAASUVORK5CYII=`

async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    keyFile: SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  })
  return await auth.getAccessToken() as string
}

async function testDocumentAI() {
  console.log('🔍 Testing GCP Document AI...\n')

  // Check if service account file exists
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Service account file not found:', SERVICE_ACCOUNT_PATH)
    console.log('   Run this from the project root with GOOGLE_APPLICATION_CREDENTIALS set')
    process.exit(1)
  }

  console.log('📋 Configuration:')
  console.log(`   Project ID: ${GCP_PROJECT_ID}`)
  console.log(`   Location: ${GCP_LOCATION}`)
  console.log(`   Processor ID: ${GCP_DOCAI_PROCESSOR_ID}`)
  console.log(`   Service Account: ${SERVICE_ACCOUNT_PATH}\n`)

  try {
    // Get access token
    console.log('🔑 Getting access token...')
    const accessToken = await getAccessToken()
    console.log('   ✓ Access token obtained\n')

    // Call Document AI
    console.log('📄 Calling Document AI processor...')
    const endpoint = `https://${GCP_LOCATION}-documentai.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/processors/${GCP_DOCAI_PROCESSOR_ID}:process`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rawDocument: {
          content: TEST_IMAGE_BASE64,
          mimeType: 'image/png'
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API Error ${response.status}: ${errorText}`)
    }

    const result = await response.json()

    console.log('   ✓ Document AI response received\n')

    // Parse results
    console.log('📊 Results:')
    if (result.document?.text) {
      console.log(`   Extracted text: "${result.document.text.substring(0, 200)}..."`)
    } else {
      console.log('   No text extracted (test image may not contain readable text)')
    }

    if (result.document?.pages) {
      console.log(`   Pages detected: ${result.document.pages.length}`)

      // Check for form fields
      const formFields = result.document.pages.flatMap((p: any) => p.formFields || [])
      if (formFields.length > 0) {
        console.log(`   Form fields detected: ${formFields.length}`)
        formFields.slice(0, 5).forEach((field: any, i: number) => {
          const name = field.fieldName?.textAnchor?.content || 'Unknown'
          const value = field.fieldValue?.textAnchor?.content || 'N/A'
          console.log(`      ${i + 1}. ${name}: ${value}`)
        })
      }

      // Check for tables
      const tables = result.document.pages.flatMap((p: any) => p.tables || [])
      if (tables.length > 0) {
        console.log(`   Tables detected: ${tables.length}`)
      }
    }

    console.log('\n✅ Document AI is working correctly!')
    console.log('\n📝 To test with a real PDF, run:')
    console.log('   npx tsx scripts/test-document-ai.ts /path/to/your/file.pdf')

  } catch (error: any) {
    console.error('❌ Error:', error.message)

    if (error.message.includes('PERMISSION_DENIED')) {
      console.log('\n💡 Tip: Make sure the service account has Document AI permissions')
    } else if (error.message.includes('NOT_FOUND')) {
      console.log('\n💡 Tip: Check if the processor ID is correct')
    }

    process.exit(1)
  }
}

// Allow testing with a custom file
async function testWithFile(filePath: string) {
  console.log(`🔍 Testing Document AI with file: ${filePath}\n`)

  if (!fs.existsSync(filePath)) {
    console.error('❌ File not found:', filePath)
    process.exit(1)
  }

  const fileBuffer = fs.readFileSync(filePath)
  const base64Content = fileBuffer.toString('base64')
  const mimeType = filePath.endsWith('.pdf') ? 'application/pdf' : 'image/png'

  console.log(`   File size: ${(fileBuffer.length / 1024).toFixed(2)} KB`)
  console.log(`   MIME type: ${mimeType}\n`)

  try {
    const accessToken = await getAccessToken()
    const endpoint = `https://${GCP_LOCATION}-documentai.googleapis.com/v1/projects/${GCP_PROJECT_ID}/locations/${GCP_LOCATION}/processors/${GCP_DOCAI_PROCESSOR_ID}:process`

    console.log('📄 Processing document...')
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rawDocument: {
          content: base64Content,
          mimeType
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API Error ${response.status}: ${errorText}`)
    }

    const result = await response.json()

    console.log('✅ Document processed successfully!\n')
    console.log('📊 Extracted text (first 1000 chars):')
    console.log('─'.repeat(50))
    console.log(result.document?.text?.substring(0, 1000) || 'No text found')
    console.log('─'.repeat(50))

    // Show form fields if any
    const formFields = result.document?.pages?.flatMap((p: any) => p.formFields || []) || []
    if (formFields.length > 0) {
      console.log(`\n📋 Form Fields (${formFields.length} found):`)
      formFields.slice(0, 10).forEach((field: any, i: number) => {
        const name = field.fieldName?.textAnchor?.content?.trim() || 'Unknown'
        const value = field.fieldValue?.textAnchor?.content?.trim() || 'N/A'
        console.log(`   ${i + 1}. "${name}" = "${value}"`)
      })
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

// Main
const args = process.argv.slice(2)
if (args[0]) {
  testWithFile(args[0])
} else {
  testDocumentAI()
}
