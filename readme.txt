-> What this automation does ?

This automation streamlines the AppTrana WAF vulnerability report workflow.
You no longer need to manually navigate the UI for each domain.
The process runs end to end with minimal human involvement.

-> What we did earlier was

Open microsoft.myapps
Click the AppTrana tile
Log in using SSO
Wait for the AppTrana dashboard to load
Open the Vulnerabilities tab
Open the domain dropdown
Select a domain
Scroll down the page
Click Request if the report was not requested
Download the report if available
Repeat the same steps for every domain


This process was repetitive.
It consumed time.
It required constant manual interaction.


-> How the automation works now

Logs in to AppTrana using SSO
Loads the AppTrana dashboard automatically
Navigates to the Vulnerabilities section
Iterates through all domains
Requests vulnerability reports when missing
Downloads reports when available
Completes the full flow without manual clicks

-> Result

Faster execution
Consistent output
Reduced manual effort
Lower risk of human error


-> Fix implemented

When the script swyftcomply.js starts, two different behaviors are observed.
Sometimes it opens the Vulnerabilities tab directly.
Other times, it first opens the login page, then loads the dashboard, clicks the Vulnerabilities tab, and finally loads the vulnerability dashboard.



-> Issue identified
During automation, the login page opens and credentials are submitted correctly.
After login, the application redirects to the dashboard as expected.

In some runs, an authentication refresh happens in the background.
The application redirects back to the login page without user action.

The automation assumes the Vulnerabilities dashboard is already loaded.
Because of this mismatch, the script waits for elements that do not exist.
As a result, the automation gets stuck.

This issue is intermittent.
It occurs roughly 1 to 2 times out of 10 runs.


-> Reasons why building reliable automation for WAF applications is difficult.

1. Authentication is not stable
WAF platforms rely on SSO, token refresh, and session revalidation.
Tokens expire silently.
Redirects happen without UI signals.

2. UI state changes dynamically
The same page loads in different states.
Sometimes charts load automatically.
Sometimes navigation is required.
Automation must handle both paths.

3. Heavy use of frontend frameworks
Angular renders elements asynchronously.
Elements appear attached but are not interactive.
Timing issues are common in headless runs.

4. Security protections affect automation
WAF products actively monitor unusual behavior.
Rapid clicks or repeated actions trigger refreshes.
This affects consistency across runs.

5. Dynamic selectors and reused text
The same text appears in navigation, headings, and tables.
Strict selector matching fails unless carefully scoped.

6. Headless browser differences
Headless rendering behaves differently from visible browsers.
Animations, lazy loading, and focus handling change execution order.

7. Domain level context switching
Each domain selection reloads partial UI state.
Background requests invalidate previous assumptions.
Automation must revalidate state on every loop.