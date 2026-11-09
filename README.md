# Social Hub Demo — v5

A **local, fictional social-media-inspired registration demo** with user flow and server-gated admin dashboard. No external npm packages. It is **not affiliated with Snapchat**, does not authenticate with Snapchat, and must not be used to collect any real account passwords.

## Reaction Rush — new in v5

After demo registration, the participant opens `/arena.html` for **Reaction Rush**. Press Start, wait for the green screen, then tap or use Space / Enter. Pressing early triggers a false-start message. The result uses `performance.now()` and is measured in milliseconds. You can replay, see your fastest time, and open the member dashboard after the game.

The backend associates reaction results to the demo registration using a random ticket. The protected admin table shows best result and attempt count, and the CSV export includes best, latest and attempts. Results are client-reported demonstration values and **not tamper-proof competitive rankings**.

## Registration demo details

The registration demo accepts **any invented, non-secret challenge phrase** (Arabic, Latin letters, spaces, symbols, up to 80 characters) rather than requiring `DEMO-1234`. The exact value including spaces is saved and shown to an authenticated admin after the participant explicitly consents. The test-phrase field is visible text and clearly **not a Snapchat password field**. Never put a real password there.

The admin table and CSV export show the challenge phrase. CSV output has a basic spreadsheet-formula injection defense. Both the homepage and server reject genuine password field names such as `password`, and no genuine account authentication happens.

## Getting started — Windows PowerShell / VS Code

Open **the directory containing `package.json`** (avoid opening a parent wrapper folder) and run:

```powershell
npm.cmd start
```

Open `http://localhost:3000/` to submit a demo username, your own invented test phrase, and consent. The user page intentionally has no admin link.

Open `http://localhost:3000/admin-login.html` for admin login; enter the `Temporary ADMIN_TOKEN` shown in the terminal. The protected dashboard lives at `/admin`. It updates every five seconds and supports CSV export and clearing the demo records.

To configure a stable token for this terminal session before starting:

```powershell
$env:ADMIN_TOKEN='replace-with-a-long-random-private-token'
npm.cmd start
```

Run automated tests:

```powershell
npm.cmd test
```

## How data works

`POST /api/demo-session` accepts only:

```json
{"handle":"demo_user","challengeText":"  تجربة 123!  ","consent":true}
```

The server rejects other JSON keys. Example fields: `password`, `snapPassword`. The phrase is preserved exactly in `data/visits.json`, along with the demo username, timestamp and event ID, and is visible only via the authenticated admin API. **Do not enter secrets.** The field is only a test of form → server → admin data flow.

The admin page is server-gated, not merely hidden in the navigation. Session tokens are stored hashed in RAM and sent using `HttpOnly` `SameSite=Strict` cookies (plus `Secure` on HTTPS/production). Deletes require a CSRF token. Rate limiting is basic and process-local. The demo is not production-ready. Files may be lost on ephemeral hosting. For public hosting, additionally use TLS, a durable database, a proper identity provider for admin auth, and privacy/retention controls.

## Files

```
server.mjs
public/
  index.html         standalone demo form
  login.js           submits demo handle + non-secret phrase + consent
  dashboard.html     simulated member dashboard
  dashboard.js
  arena.html         reaction timing game after demo registration
  arena.js           browser timing + result submission
  admin-login.html   separate admin login
  admin-login.js
  admin.html         server-guarded admin dashboard
  admin.js           refresh, export and clear
  style.css
 test/server.test.mjs
```

**Note:** the user is not actually authenticated. This is a UI and data-transfer demo; avoid presenting it as a real Snapchat login. The admin token is for the test console only.
