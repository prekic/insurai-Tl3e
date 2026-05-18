const { OpenAI } = require('openai');

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
console.log(`DEEPSEEK_API_KEY set: ${!!DEEPSEEK_API_KEY}`);

let deepseekClient = null;
if (DEEPSEEK_API_KEY) {
  deepseekClient = new OpenAI({
    apiKey: DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
  });
}
console.log(`deepseekClient null: ${deepseekClient === null}`);

const healingResult = { success: false, data: null, error: "429 You exceeded your current quota", code: "WORKER_ERROR" };
const wouldFallback = !healingResult.success && !healingResult.data && deepseekClient;
console.log(`wouldFallback: ${wouldFallback}`);
console.log(`!success: ${!healingResult.success}`);
console.log(`!data: ${!healingResult.data}`);
console.log(`client truthy: ${!!deepseekClient}`);

async function testDeepSeek() {
  try {
    const response = await deepseekClient.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Output JSON.' },
        { role: 'user', content: 'Say hello in JSON format like {"message": "hello"}' },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 50,
      temperature: 0,
    });
    console.log(`DeepSeek SUCCESS ✓`);
    console.log(`Response: ${response.choices[0]?.message?.content}`);
    console.log(`Usage: input=${response.usage?.prompt_tokens}, output=${response.usage?.completion_tokens}`);
    console.log(`Model: ${response.model}`);
  } catch (err) {
    console.log(`DeepSeek ERROR: ${err.message}`);
  }
}

testDeepSeek().then(() => console.log('Done'));
