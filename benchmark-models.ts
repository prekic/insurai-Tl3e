import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, Schema } from '@google/generative-ai';
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

async function testOpenAI(text: string) {
  console.log("\n--- Testing OpenAI (gpt-5.5) ---");
  const startTime = Date.now();
  const client = new OpenAI();
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-5.5',
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
    const duration = Date.now() - startTime;
    console.log(`OpenAI Duration: ${duration}ms`);
    console.log("OpenAI length:", content.length);
    console.log("OpenAI ends with:", content.substring(content.length - 100).replace(/\n/g, ' '));
    try {
      JSON.parse(content);
      console.log("OpenAI Output: VALID JSON");
    } catch(e) {
      console.log("OpenAI Output: INVALID JSON");
    }
  } catch(e: any) {
    console.error("OpenAI Error:", e.message);
  }
}

async function testAnthropic(text: string) {
  console.log("\n--- Testing Anthropic (claude-opus-4-7) ---");
  const startTime = Date.now();
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("No Anthropic Key");
    return;
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const schemaPrompt = buildAnthropicSchemaPrompt({});
  try {
    const stream = await client.messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 32768,
      system: schemaPrompt,
      messages: [{ role: 'user', content: text }],
    });
    
    let jsonContent = '';
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        jsonContent += chunk.delta.text;
      }
    }
    
    const match = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonContent = match[1].trim();
    
    const duration = Date.now() - startTime;
    console.log(`Anthropic Duration: ${duration}ms`);
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

async function testGemini(text: string) {
  console.log("\n--- Testing Gemini (gemini-3.1-pro-preview) ---");
  const startTime = Date.now();
  const apiKey = process.env.GOOGLE_CLOUD_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No Gemini Key");
    return;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-pro-preview",
    generationConfig: {
      responseMimeType: "application/json",
      // If we want to strictly enforce the schema:
      // responseSchema: EXTRACTION_JSON_SCHEMA as Schema,
      maxOutputTokens: 8192,
    }
  });

  try {
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: 'Extract policy information as JSON matching the schema. \n\n' + text }]
      }]
    });
    const response = result.response;
    const jsonContent = response.text();
    
    const duration = Date.now() - startTime;
    console.log(`Gemini Duration: ${duration}ms`);
    console.log("Gemini length:", jsonContent.length);
    console.log("Gemini ends with:", jsonContent.substring(jsonContent.length - 100).replace(/\n/g, ' '));
    try {
      JSON.parse(jsonContent);
      console.log("Gemini Output: VALID JSON");
    } catch(e) {
      console.log("Gemini Output: INVALID JSON");
    }
  } catch(e: any) {
    console.error("Gemini Error:", e.message);
  }
}

async function run() {
  const text = await extractTextWithPdfjs(path.join(process.cwd(), 'upload/real-kasko-pdf/KASKO POLİÇESİ.pdf'));
  console.log("PDF length:", text.length);

  // await testOpenAI(text);
  await testAnthropic(text);
  // await testGemini(text);
}

run();
