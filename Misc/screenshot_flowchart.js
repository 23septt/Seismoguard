const puppeteer = require('./node_modules/puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const filePath = 'file:///' + path.resolve(`${__dirname}/flowchart.html`).replace(/\\/g, '/');
  await page.goto(filePath, { waitUntil: 'networkidle0' });

  // Set viewport to match SVG size + small padding
  await page.setViewport({ width: 900, height: 1446, deviceScaleFactor: 2 });

  await page.screenshot({
    path: `${__dirname}/flowchart_new.png`,
    fullPage: true,
    omitBackground: false
  });

  await browser.close();
  console.log('Done: flowchart_new.png');
})();
