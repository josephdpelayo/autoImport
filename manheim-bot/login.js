// Corre esto UNA vez (y de nuevo cuando la sesión expire). Abre una ventana de
// Chrome dedicada a este bot. Inicia sesión ahí (incluye MFA si lo pide) y
// cuando termines simplemente CIERRA la ventana — la sesión queda guardada en
// disco (.chrome-profile/) para que scan.js la reutilice sin volver a loguear.
const { chromium } = require('playwright');
const path = require('path');

const PROFILE_DIR = path.join(__dirname, '.chrome-profile');

(async () => {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1400, height: 1000 },
  });
  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://www.manheim.com/', { waitUntil: 'domcontentloaded' });

  console.log('Inicia sesión en esta ventana (incluye MFA si lo pide).');
  console.log('Cuando termines, cierra la ventana de Chrome para guardar la sesión.');

  await context.waitForEvent('close', { timeout: 0 });
  console.log('Sesión guardada. Ya puedes correr: node scan.js');
})();
