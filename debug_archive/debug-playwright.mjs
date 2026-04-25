import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  console.log('Navigating to /admin...');
  const response = await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
  console.log('Response status:', response?.status());
  
  await page.waitForTimeout(2000);
  
  console.log('Current URL:', page.url());
  const body = await page.innerHTML('body');
  console.log('Body snippet:', body.substring(0, 500));
  
  await browser.close();
})();
