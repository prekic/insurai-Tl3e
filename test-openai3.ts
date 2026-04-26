import OpenAI from 'openai';
import { EXTRACTION_JSON_SCHEMA } from './shared/extraction-schema';
import dotenv from 'dotenv';
dotenv.config();

const client = new OpenAI();
console.log("Calling OpenAI with Structured Outputs...");
try {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4',
    messages: [
      { role: 'user', content: 'test' }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: EXTRACTION_JSON_SCHEMA
    },
    max_completion_tokens: 4096
  });
  console.log("SUCCESS:", response.choices[0].message.content);
} catch (err: any) {
  console.error("ERROR:", err.message);
}
