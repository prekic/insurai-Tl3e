import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
dotenv.config();

console.log("Starting...");
async function test() {
  const client = new Anthropic({ 
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultHeaders: { 'anthropic-beta': 'max-tokens-3-5-sonnet-2024-07-15' }
  });
  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      messages: [{ role: 'user', content: 'Say hello and test your max tokens.' }]
    });
    console.log("Tokens used:", response.usage);
  } catch(e: any) {
    console.log("Error 1:", e.message);
  }
}
test().then(() => console.log("Done."));
