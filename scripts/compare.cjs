const { Anthropic } = require('@anthropic-ai/sdk');
const fs = require('fs');
const doc = fs.readFileSync('/tmp/kasko_pdf_text.txt', 'utf8').substring(0, 12000);

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  console.log('ANTHROPIC_API_KEY present:', !!apiKey);
  
  const client = new Anthropic({ apiKey });
  
  // Minimal request — just list coverages
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: 'You are a Turkish insurance policy analyst. List all coverage items you find as JSON array.',
      messages: [{ role: 'user', content: 'List all TEMINAT (coverage) items from this policy as JSON: ' + doc.substring(0, 8000) }],
    });
    console.log('SUCCESS!');
    console.log('Output:', msg.content[0].text.substring(0, 500));
  } catch (e) {
    console.log('ERROR:', e.status, e.message?.substring(0, 200));
  }
}
main().catch(console.error);
