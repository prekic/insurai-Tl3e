import OpenAI from 'openai';
import { EXTRACTION_JSON_SCHEMA } from './shared/extraction-schema';
import dotenv from 'dotenv';
dotenv.config();

const client = new OpenAI();
console.log("Calling OpenAI...");
try {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'Extract policy info' },
      { role: 'user', content: 'test policy 12345' }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: EXTRACTION_JSON_SCHEMA
    },
    max_completion_tokens: 100
  });
  console.log("SUCCESS:", response.choices[0].message.content);
} catch (err: any) {
  console.error("ERROR:", err.message);
}
