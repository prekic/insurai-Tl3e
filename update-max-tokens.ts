import { db } from './server/db/index.js';
import { appSettings } from './server/db/schema.js';
import { eq } from 'drizzle-orm';

async function run() {
  await db.update(appSettings)
    .set({ value: '8192' })
    .where(eq(appSettings.key, 'max_tokens'));
  console.log("Updated max_tokens to 8192 in db");
  process.exit(0);
}
run();
