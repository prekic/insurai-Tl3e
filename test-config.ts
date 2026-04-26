import { ServerConfigService } from './server/services/config-service.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const service = ServerConfigService.getInstance();
  const config = await service.getAIConfig();
  console.log("AI Config:", config);
  process.exit(0);
}
run();
