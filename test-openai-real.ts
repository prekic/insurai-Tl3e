import OpenAI from 'openai';
import { EXTRACTION_JSON_SCHEMA } from './shared/extraction-schema';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
dotenv.config();

async function run() {
  const text = await fs.readFile(path.join(process.cwd(), 'upload/real-kasko-pdf/KASKO POLİÇESİ.pdf'));
  console.log("PDF bytes:", text.length);

  const client = new OpenAI();
  console.log("Calling OpenAI with Structured Outputs...");
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-5.4',
      messages: [
        { role: 'system', content: 'Extract policy information as JSON.\n\nRespond with valid JSON only.' },
        { role: 'user', content: 'hello' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: EXTRACTION_JSON_SCHEMA
      },
      max_completion_tokens: 15512 // wait, I will just hardcode the prompt string. Wait, I already know it truncated.
    });
  } catch (err: any) {
  }
}
