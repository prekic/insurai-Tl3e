const OpenAI = require('openai');
const fs = require('fs');
const doc = fs.readFileSync('/tmp/kasko_pdf_text.txt', 'utf8').substring(0, 12000);

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  console.log('OPENAI_API_KEY present:', !!apiKey);
  
  const client = new OpenAI({ apiKey });
  
  // Try gpt-4.1-mini or gpt-5.4-mini  
  for (const model of ['gpt-5.4-mini', 'gpt-4.1-mini', 'gpt-5.4']) {
    try {
      console.log(`\nTrying ${model}...`);
      const resp = await client.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: [
          { role: 'system', content: 'List ALL insurance coverages as JSON: {"coverages":[{"nameTr":string}]}. Be thorough.' },
          { role: 'user', content: doc.substring(0, 8000) },
        ],
        response_format: { type: 'json_object' },
      });
      const data = JSON.parse(resp.choices[0].message.content);
      console.log(`SUCCESS! Coverages: ${data.coverages?.length || 0}`);
      (data.coverages || []).forEach(c => console.log(`  ${c.nameTr}`));
      break;
    } catch (e) {
      console.log(`  FAIL: ${e.status} ${(e.message||'').substring(0,120)}`);
    }
  }
}
main().catch(console.error);
