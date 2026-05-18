const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

const fs = require('fs');
const documentText = fs.readFileSync('/tmp/kasko_pdf_text.txt', 'utf8').substring(0, 15000);

const SYSTEM_PROMPT = `Extract ALL insurance coverages from this Turkish Birleşik Kasko policy as JSON.
Output { "coverages": [{ "nameTr": string, "canonicalName": string }] }
Be VERY thorough — extract every single coverage item.`;

async function testClaude() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: documentText.substring(0, 10000) }],
    });
    return { ok: true, text: msg.content[0].text.substring(0, 500) };
  } catch (e) {
    return { ok: false, error: e.message.substring(0, 200) };
  }
}

async function main() {
  // Try Claude
  console.log('Trying Claude Sonnet 4...');
  const r = await testClaude();
  if (r.ok) {
    console.log('SUCCESS:', r.text.substring(0, 300));
  } else {
    console.log('FAIL:', r.error);
  }
}

main().catch(console.error);
