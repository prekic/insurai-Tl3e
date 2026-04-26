import Anthropic from '@anthropic-ai/sdk';
import { EXTRACTION_JSON_SCHEMA } from './shared/extraction-schema.js';
import { buildAnthropicSchemaPrompt } from './server/lib/ai-prompts.js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const text = await fs.readFile(path.join(process.cwd(), 'upload/real-kasko-pdf/KASKO POLİÇESİ.pdf'), 'utf8');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const schemaPrompt = buildAnthropicSchemaPrompt({});
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: schemaPrompt,
      messages: [{ role: 'user', content: 'test document' }], // we just want to see if it responds without 404
    });
    console.log("Anthropic success!", response.content[0]);
  } catch(e: any) {
    console.error("Anthropic Error:", e.message);
  }
}
run();
