const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
require('dotenv').config();
 
const EXCLUDED_APPS = [
  'powermedev.titan.in'
];
 
 
const BASE_DOWNLOAD_DIR = process.env.DOWNLOAD_DIR;
  
const APPTRANA_VULN_URL = process.env.APPTRANA_VULN_URL;
if (!process.env.EMAIL || !BASE_DOWNLOAD_DIR || !APPTRANA_VULN_URL) {
  throw new Error('Missing required environment variables');
}

const userDataDir = path.join(__dirname, 'edge-profile');
const LOGIN_HEADER = 'h4.login-form-header';
const EMAIL_INPUT = 'input#login';
const NEXT_BUTTON = 'input[type="submit"][value="Next"]';
 
//monthly folder logic
 
function getMonthlyDownloadDir() {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const year = now.getFullYear();
 
  const dir = path.join(BASE_DOWNLOAD_DIR, `${year}_${month}`);
 
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
 
  return dir;
}
 
 
 
//helper
 
async function closeOverlayIfPresent(page) {
  const backdrop = page.locator('.cdk-overlay-backdrop');
  if (await backdrop.count() > 0) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}
 
function startKeepAlive(page) {
  return setInterval(async () => {
    try {
      await page.mouse.move(100, 100);
      await page.keyboard.press('Shift');
    } catch {}
  }, 60000);
}
 
async function getAllDomains(page) {
  const dropdown = page.locator('div.primary-select').first();
  await dropdown.waitFor({ timeout: 60000 });
 
  await closeOverlayIfPresent(page);
  await dropdown.click({ force: true });
 
  const list = page.locator('div.sites-list');
  await list.waitFor({ timeout: 60000 });
 
  let previousCount = 0;
 
  while (true) {
    const items = page.locator('div.site-item');
    const count = await items.count();
    if (count === previousCount) break;
    previousCount = count;
 
    await list.evaluate(el => (el.scrollTop = el.scrollHeight));
    await page.waitForTimeout(300);
  }
 
  const domains = await page
    .locator('div.site-item div.site-name')
    .allTextContents();
 
  await page.keyboard.press('Escape');
  return domains.map(d => d.trim()).filter(Boolean);
}
 
//login
 
async function resolveLogin(page) {
    const loginHeader = page.locator(LOGIN_HEADER);
    const vulnerabilitiesTab = page.locator('text=Vulnerabilities');

    const donutChart = page.locator('generic-donut-chart.ng-star-inserted');
    const ganttChart = page.locator('gantt-chart.ng-star-inserted');

    // Wait until either login page or vuln charts appear
    await Promise.race([
        loginHeader.waitFor({ timeout: 30000 }),
        donutChart.waitFor({ timeout: 30000 }),
        ganttChart.waitFor({ timeout: 30000 })
    ]);

    // Handle login only if login page is visible
    if (await loginHeader.count() > 0) {
        console.log('Login page detected');

        await page.fill(EMAIL_INPUT, process.env.EMAIL);

        await page.click(NEXT_BUTTON);

        await page.waitForURL(
            url => !url.href.includes('/login'),
            { timeout: 60000 }
        );

        console.log('Login redirect completed');
    }

    // If charts already exist, we are done
    if (await donutChart.count() > 0 || await ganttChart.count() > 0) {
        console.log('Vulnerabilities already loaded');
        return;
    }

    // Otherwise click Vulnerabilities tab once
    await vulnerabilitiesTab.waitFor({ timeout: 60000 });
    await vulnerabilitiesTab.first().click();

    // Confirm page load via charts
    await Promise.race([
        donutChart.waitFor({ timeout: 60000 }),
        ganttChart.waitFor({ timeout: 60000 })
    ]);

    console.log('Vulnerabilities dashboard loaded');
}
 
// download
async function downloadWithRetry(page, app, retries = 2) {
  const monthlyDir = getMonthlyDownloadDir();
  const downloadBtn = page.locator('button.download-btn');
  const btnCount = await downloadBtn.count();
  if (btnCount === 0) {
    console.log(`Download report not available for ${app}`);
    return;
  }
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await downloadBtn.waitFor({ timeout: 15000 });
 
      const downloadPromise = page.waitForEvent('download', {
        timeout: 30000
      });
 
      await downloadBtn.first().click({ force: true });
      const download = await downloadPromise;
 
      const safeName = app.replace(/[^a-zA-Z0-9]/g, '_');
      const filePath = path.join(
        monthlyDir,
        `${safeName}_SwyftComply_Report.pdf`
      );
 
      await download.saveAs(filePath);
 
      console.log(`Downloaded report for ${app}`);
      return;
 
    } catch (err) {
      if (attempt === retries) {
        console.log(`Download failed for ${app}`);
        return;
      }
 
      console.log(`Download retry ${attempt} for ${app}`);
      await page.waitForTimeout(10000);
    }
  }
}
 
 
//main
 
(async () => {
  console.log('\n=== AppTrana SwiftComply Automation Started ===\n');
 
  const monthlyDir = getMonthlyDownloadDir();
 
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'msedge',
    headless: false,
    acceptDownloads: true,
    downloadsPath: monthlyDir,
    args: [
      '--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure'
    ]
  });
 
  const page = await context.newPage();
 
  await page.goto(APPTRANA_VULN_URL, { waitUntil: 'domcontentloaded' });
  await resolveLogin(page);
 
  const donutChart = page.locator('generic-donut-chart.ng-star-inserted');
  const ganttChart = page.locator('gantt-chart.ng-star-inserted');
 
  if (await donutChart.count() > 0 && !(await ganttChart.count() > 0)) {
    const vulnTab = page.locator('div[tabindex="0"]', { hasText: 'Vulnerabilities' });
    await vulnTab.waitFor({ timeout: 30000 });
    await vulnTab.click();
    await ganttChart.waitFor({ timeout: 60000 });
  }
 
  console.log('Vulnerability dashboard ready');
 
  const keepAlive = startKeepAlive(page);
 
  const apps = await getAllDomains(page);
  console.log(`Total domains: ${apps.length}\n`);
 
  for (const app of apps) {
    console.log(`Processing: ${app}`);
    if (EXCLUDED_APPS.includes(app)) {
    console.log(`Skipping SwiftComply for ${app}`);
    continue;
  }
 
 
    try {
      const dropdown = page.locator('div.primary-select').first();
      await dropdown.waitFor({ timeout: 60000 });
 
      await closeOverlayIfPresent(page);
      await dropdown.click({ force: true });
 
      const domainItem = page
        .locator('div.site-item')
        .filter({ hasText: app })
        .first();
 
      await domainItem.waitFor({ timeout: 60000 });
      await domainItem.click();
 
      //swiftcomply option
      await page.waitForTimeout(2000);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
 
      const requestBtn = page.locator(
        'button[accesscontrol="vulnerabilityPage.previousScans.swyftComplySection.requestSwyftComply"]'
      );
 
      if (await requestBtn.count() === 0) {
        console.log('SwiftComply not available');
        continue;
      }
 
      await closeOverlayIfPresent(page);
      await requestBtn.first().click({ force: true });
 
      const confirmContainer = page.locator('app-swyft-comply-confirmation');
      await confirmContainer.waitFor({ timeout: 20000 });
 
      const startBtn = confirmContainer.locator(
        'button.mat-mdc-raised-button.mat-primary'
      );
      await startBtn.click({ force: true });
 
      console.log(`SwiftComply started for ${app}`);
 
      await page.waitForTimeout(7000);
      await downloadWithRetry(page, app);
 
    } catch (err) {
      console.log(`Failed for ${app}: ${err.message}`);
      await page.waitForTimeout(20000);
    }
  }
 
  clearInterval(keepAlive);
  await context.close();
 
  console.log('\n=== SwiftComply Automation Completed ===\n');
})();