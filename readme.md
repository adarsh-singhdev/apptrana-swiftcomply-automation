# AppTrana Automation

## What is it?
This project automates the AppTrana WAF vulnerability report workflow, eliminating manual UI navigation and reducing human effort. It handles login, dashboard navigation, domain iteration, report requests, and downloads automatically.

## What it does
- Logs in to AppTrana using SSO
- Loads the AppTrana dashboard
- Navigates to the Vulnerabilities section
- Iterates through all domains
- Requests vulnerability reports when missing
- Downloads reports when available
- Completes the full workflow without manual clicks

## Tech Stack Used
- Node.js
- Playwright (for browser automation)
- JavaScript

## How to Use
1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the automation script:
   ```bash
   node swyftcomply.js
   ```
3. The script will log in, navigate the dashboard, iterate through domains, request/download reports, and complete the workflow automatically.

For configuration or environment setup, refer to the comments in `swyftcomply.js`.