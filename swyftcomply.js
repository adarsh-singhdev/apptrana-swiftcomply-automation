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

  const dir = path.join(BASE_DOWNLOAD_DIR, 'SwiftComply', `${year}_${month}`);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return dir;
}

// get csv log file path
function getCsvLogPath() {
  const monthlyDir = getMonthlyDownloadDir();
  return path.join(monthlyDir, 'result.csv');
}

// csv logging function
function logCsv(domain, component, action, message = '') {
  const csvPath = getCsvLogPath();
  const timestamp = new Date().toISOString();
  const row = `"${timestamp}","${domain}","${component}","${action}","${message}"\n`;

  try {
    fs.appendFileSync(csvPath, row);
  } catch (err) {
    console.log(`Failed to log to CSV: ${err.message}`);
  }
}



// helper functions

// close overlay backdrop if present
async function closeOverlayIfPresent(page) {
  const backdrop = page.locator('.cdk-overlay-backdrop');
  if (await backdrop.count() > 0) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}

// start keep alive interval to prevent timeout
function startKeepAlive(page) {
  return setInterval(async () => {
    try {
      await page.mouse.move(100, 100);
      await page.keyboard.press('Shift');
    } catch { }
  }, 60000);
}

// get all domains from dropdown
async function getAllDomains(page) {
  // ensure session still valid
  if (await page.locator(LOGIN_HEADER).count() > 0) {
    await resolveLogin(page);
  }

  // wait for dropdown to be available instead of strict networkidle
  const dropdown = page.locator('div.primary-select').first();
  await dropdown.waitFor({ state: 'attached', timeout: 60000 });
  await page.waitForTimeout(1500);

  await dropdown.scrollIntoViewIfNeeded();
  await dropdown.waitFor({ state: 'visible', timeout: 30000 });

  await closeOverlayIfPresent(page);
  await dropdown.click();

  const list = page.locator('div.sites-list');
  await list.waitFor({ state: 'visible', timeout: 60000 });

  let previousCount = 0;

  while (true) {
    const items = page.locator('div.site-item');
    const count = await items.count();
    if (count === previousCount) break;
    previousCount = count;

    await list.evaluate(el => el.scrollTop = el.scrollHeight);
    await page.waitForTimeout(300);
  }

  const domains = await page
    .locator('div.site-item div.site-name')
    .allTextContents();

  await page.keyboard.press('Escape');
  return domains.map(d => d.trim()).filter(Boolean);
}

// resolve login and navigate to vulnerabilities dashboard
async function resolveLogin(page) {
  const loginHeader = page.locator(LOGIN_HEADER);

  const vulnPageHeader = page.locator(
    'span',
    { hasText: 'LIST OF VULNERABILITIES DETECTED' }
  );

  const donutChart = page.locator('generic-donut-chart.ng-star-inserted');
  const ganttChart = page.locator('gantt-chart.ng-star-inserted');

  // wait for login page or app shell
  await Promise.race([
    loginHeader.waitFor({ timeout: 30000 }),
    vulnPageHeader.waitFor({ timeout: 30000 }),
    donutChart.waitFor({ timeout: 30000 }),
    ganttChart.waitFor({ timeout: 30000 })
  ]);

  // handle login
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

  // if already on vulnerabilities page, stop here
  if (await vulnPageHeader.count() > 0) {
    console.log('Vulnerabilities page already open');
    return;
  }

  // click left nav Vulnerabilities tab
  const vulnerabilitiesTab = page.locator(
    'div.d-flex.align-items-center',
    {
      has: page.locator('span.text-default, span.text-secondary', {
        hasText: 'Vulnerabilities'
      })
    }
  ).first();

  await vulnerabilitiesTab.waitFor({ state: 'visible', timeout: 60000 });
  await vulnerabilitiesTab.scrollIntoViewIfNeeded();
  await vulnerabilitiesTab.click();

  // wait for charts
  await Promise.race([
    // donutChart.waitFor({ state: 'visible', timeout: 60000 }),
    ganttChart.waitFor({ state: 'visible', timeout: 60000 })
  ]);

  console.log('Vulnerabilities dashboard loaded');
}





// download report with retry logic
async function downloadWithRetry(page, app, retries = 2) {
  const monthlyDir = getMonthlyDownloadDir();
  const downloadBtn = page.locator('button.download-btn');
  const btnCount = await downloadBtn.count();
  if (btnCount === 0) {
    logCsv(app, 'DOWNLOAD', 'REPORT_NOT_AVAILABLE');
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
      logCsv(app, 'DOWNLOAD', 'REPORT_DOWNLOADED');
      console.log(`Downloaded report for ${app}`);
      return;
    } catch (err) {
      if (attempt === retries) {
        logCsv(app, 'DOWNLOAD', 'FAILED', err.message);
        console.log(`Download failed for ${app}`);
        return;
      }
      console.log(`Download retry ${attempt} for ${app}`);
      await page.waitForTimeout(5000);
    }
  }
}

// main automation flow
(async () => {
  console.log('\n=== AppTrana SwiftComply Automation Started ===\n');

  const monthlyDir = getMonthlyDownloadDir();

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'msedge',
    headless: true,
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    args: [
      '--disable-features=SameSiteByDefaultCookies,CookiesWithoutSameSiteMustBeSecure',
      '--disable-blink-features=CSSAnimations'
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
      logCsv(app, 'SWYFTCOMPLY', 'SKIPPED');
      console.log(`Skipping SwiftComply for ${app}`);
      continue;
    }

    try {
      // guard auth refresh
      if (await page.locator(LOGIN_HEADER).count() > 0) {
        await resolveLogin(page);
        await page.waitForTimeout(3000);
      }

      const dropdown = page.locator('div.primary-select').first();
      await dropdown.waitFor({ state: 'attached', timeout: 60000 });
      await dropdown.scrollIntoViewIfNeeded();
      await dropdown.waitFor({ state: 'visible', timeout: 30000 });

      await closeOverlayIfPresent(page);
      await dropdown.click();

      const domainItem = page
        .locator('div.site-item')
        .filter({
          has: page.locator('div.site-name', { hasText: app })
        })
        .first();

      await domainItem.waitFor({ state: 'visible', timeout: 60000 });
      await domainItem.scrollIntoViewIfNeeded();
      await domainItem.click();
      // await page.keyboard.press('Escape');

      // ensure domain actually switched
      await page.waitForTimeout(3000);

      const requestBtn = page.locator(
        'button[accesscontrol="vulnerabilityPage.previousScans.swyftComplySection.requestSwyftComply"]'
      );

      if (await requestBtn.count() === 0) {
        logCsv(app, 'SWYFTCOMPLY', 'NOT_AVAILABLE');
        console.log('SwiftComply not available');
        continue;
      }

      await requestBtn.first().scrollIntoViewIfNeeded();
      await requestBtn.first().waitFor({ state: 'visible', timeout: 15000 });

      // Check if button has "disabled" class (already requested)
      const hasDisabledClass = await requestBtn.first().evaluate(el =>
        el.classList.contains('disabled')
      );

      if (hasDisabledClass) {
        logCsv(app, 'SWYFTCOMPLY', 'ALREADY_REQUESTED');
        console.log(`SwiftComply already requested for ${app}`);
        continue;
      }

      await closeOverlayIfPresent(page);
      await requestBtn.first().click({ force: true });

      const confirmContainer = page.locator('app-swyft-comply-confirmation');
      await confirmContainer.waitFor({ state: 'visible', timeout: 20000 });

      const startBtn = confirmContainer.locator(
        'button.mat-mdc-raised-button.mat-primary'
      ).first();
      await startBtn.click();

      logCsv(app, 'SWYFTCOMPLY', 'SWYFTCOMPLY_STARTED');
      console.log(`SwiftComply started for ${app}`);
      await page.waitForTimeout(7000);

      // await downloadWithRetry(page, app);

    } catch (err) {
      logCsv(app, 'SWYFTCOMPLY', 'FAILED', err.message);
      console.log(`Failed for ${app}: ${err.message}`);
      await page.waitForTimeout(15000);
    }
  }


  clearInterval(keepAlive);
  await context.close();

  console.log('\n=== SwiftComply Automation Completed ===\n');
})();


