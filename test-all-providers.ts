import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { EXTRACTION_JSON_SCHEMA } from './shared/extraction-schema.js';
import { buildAnthropicSchemaPrompt } from './server/lib/ai-prompts.js';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
dotenv.config();

async function extractTextWithPdfjs(filePath: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
  
  const dataBuffer = await fs.readFile(filePath);
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(dataBuffer) });
  const pdfDocument = await loadingTask.promise;
  
  let fullText = '';
  for (let i = 1; i <= pdfDocument.numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }
  return fullText;
}

async function testOpenAIBackup(text: string) {
  console.log("--- Testing OpenAI (gpt-4o-mini) ---");
  const client = new OpenAI();
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Extract policy information as JSON.\n\nRespond with valid JSON only.' },
        { role: 'user', content: text + '\n\nRespond with valid JSON only.' }
      ],
      response_format: {
        type: 'json_schema',
        json_schema: EXTRACTION_JSON_SCHEMA
      },
      max_completion_tokens: 8192
    });
    const content = response.choices[0].message.content || '';
    console.log("OpenAI-mini length:", content.length);
    console.log("OpenAI-mini ends with:", content.substring(content.length - 100).replace(/\n/g, ' '));
    try {
      JSON.parse(content);
      console.log("OpenAI-mini Output: VALID JSON");
    } catch(e) {
      console.log("OpenAI-mini Output: INVALID JSON");
    }
  } catch(e: any) {
    console.error("OpenAI-mini Error:", e.message);
  }
}

async function testAnthropic(text: string) {
  console.log("\n--- Testing Anthropic (claude-sonnet-4-20250514) ---");
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("No Anthropic Key");
    return;
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const schemaPrompt = buildAnthropicSchemaPrompt({});
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: schemaPrompt,
      messages: [{ role: 'user', content: text }],
    });
    const textBlock = response.content.find((block) => block.type === 'text');
    let jsonContent = textBlock?.type === 'text' ? textBlock.text : '';
    const match = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonContent = match[1].trim();
    
    console.log("Anthropic length:", jsonContent.length);
    console.log("Anthropic ends with:", jsonContent.substring(jsonContent.length - 100).replace(/\n/g, ' '));
    try {
      JSON.parse(jsonContent);
      console.log("Anthropic Output: VALID JSON");
    } catch(e) {
      console.log("Anthropic Output: INVALID JSON");
    }
  } catch(e: any) {
    console.error("Anthropic Error:", e.message);
  }
}

async function run() {
  const text = await extractTextWithPdfjs(path.join(process.cwd(), 'upload/real-kasko-pdf/KASKO POLİÇESİ.pdf'));
  console.log("PDF length:", text.length);

  await testOpenAIBackup(text);
  await testAnthropic(text);
}
run();
