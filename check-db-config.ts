import { db } from './server/db/index.js';
import { appSettings } from './server/db/schema.js';

async function run() {
  const settings = await db.select().from(appSettings);
  console.log("DB settings:", settings.map(s => ({ key: s.key, value: s.value })));
  process.exit(0);
}
run();
