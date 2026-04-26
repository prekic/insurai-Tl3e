import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const client = new OpenAI();
console.log("Calling OpenAI...");
try {
  const response = await client.chat.completions.create({
    model: 'gpt-5.4',
    messages: [
      { role: 'user', content: 'test' }
    ]
  });
  console.log("SUCCESS:", response.choices[0].message.content);
} catch (err: any) {
  console.error("ERROR:", err.message);
}
