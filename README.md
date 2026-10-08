# CampusLost

A college lost-and-found project built with HTML, CSS, JavaScript and a dependency-free Node.js server. Approved listings are public; students submit reports and private ownership claims, and administrators review them.

## Resume and portfolio demo

This repository contains the working full-stack Node.js application, not just screenshots. Use the public demo URL from your hosting dashboard as the **Visit Website** link, and this GitHub repository as the **Source Code** link.

### Deploy the same app for free

1. Upload this repository to GitHub.
2. Sign in at https://render.com with GitHub.
3. Select **New → Blueprint** and select this repository.
4. Review render.yaml: it requests one **free** Node web service. Apply the Blueprint.
5. Wait for a successful deployment and copy the service's public URL.
6. Open that URL in a private browser window, try both demo accounts, and place the verified URL on your resume.

The configuration uses demo mode, public sample credentials, HTTPS-only session cookies and limited demo record counts. Private local data, photos and backups are excluded from Git. Hosting creates fresh sample data.

Free hosting may take about a minute to wake after inactivity. Reports, registrations and photos can reset when the host restarts or redeploys; this is intentional for a disposable portfolio demo. It is not a persistent college service. Keep your Render account active and periodically check the resume link. Do not use GitHub Pages for this Node app: it does not run server.js.

## Run

Requires Node.js 20 or later. No packages need to be installed.

```bash
cd "/Users/ayush/Documents/Project"
npm start
```

Open http://127.0.0.1:3000 and keep the terminal running. Stop with Control+C. After backend changes, restart the server; refresh the browser after frontend changes. For automatic backend restart use `npm run dev`.

If port 3000 is occupied, stop the old server in its terminal or use:

```bash
PORT=3001 npm start
```

Then open http://127.0.0.1:3001. Open through the server, rather than double-clicking index.html.

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Student (Ayush Kumar) | aarav@campuslost.local | Password123! |
| Admin | admin@campuslost.local | Admin123! |

New registrations always receive the student role, even if the email contains "admin". Email delivery and college verification are not connected.

## Working features

- Search and filter approved lost/found listings; load more results.
- Register, log in and sign out with password hashing and expiring cookie sessions.
- Report an item with type, category, location, occurrence date and description.
- Review personal reports, claim evidence and decisions in the dashboard.
- Admin approval/rejection of reports and claims.
- Approved claims mark items returned and reject competing pending claims.
- Server validation, role checks, duplicate/self-claim prevention and escaped user text.
- Public statistics calculated from saved data; connection errors and retry control.
- Private data and source files excluded from static serving.

## Demo workflow

1. Sign in as student and submit a report.
2. Sign out and sign in as admin. Scroll to Admin Console and approve the report.
3. Sign in as another student (or use an existing sample found item) and submit a claim with identifying details.
4. Admin reviews and approves/rejects the claim.
5. Student dashboard shows the decision. Approved items disappear from public listings.

Use Refresh in the dashboard to retrieve decisions made from another browser.

## Storage and limits

Existing users, reports and claims are preserved in data.json. The server creates demo data only when this file is absent. Writes use atomic file replacement. Back up this file before resetting anything. Never commit it.

Storage is designed for one local Node process. Sessions are in memory and require login again after restart. Email verification/reset, persistent sessions and database-backed multi-instance storage are future work. This is a working local MVP, not a public production deployment.

## Verification

```bash
npm test
```

The integration test uses isolated temporary data and a temporary port. It checks report moderation, claims, dashboard state, persistence, authorization, logout and private-file protection without modifying your data.json.

## GitHub and hosting

Initialize Git in this directory, commit the source and connect your own GitHub repository. data.json is excluded by .gitignore. GitHub stores code; a Node hosting service runs the app.

For hosting, set HOST=0.0.0.0 and the provider's PORT, and start with npm start. Environment variables must be supplied by the shell or host; .env.example is documentation and is not automatically loaded. DATA_FILE can point to a persistent writable path. The previous SESSION_SECRET setting is removed because sessions do not use it.

Before public use: replace JSON storage with a database, use persistent sessions and secure HTTPS cookies, remove known demo credentials, and add rate limiting and account recovery. Do not run multiple instances against the same JSON file.

## Optional item photos

Choose one JPEG, PNG or WebP photo (up to 2 MB) in the report form. A preview appears; Remove photo clears it. Reports can still be submitted without a photo. The browser reduces large dimensions and re-encodes photos as JPEG to strip metadata. Photos appear on approved item cards and in item details; admins can view them before approving reports. Pending/rejected/returned photos require their reporter or admin session.

Files are stored in uploads/ with server-generated names. Keep uploads/ together with data.json when backing up the app. UPLOAD_DIR can specify persistent storage. Local cloud disks may be temporary, so public hosting needs persistent storage or an image service.

A code snapshot before this feature is saved in .backups/before-image-upload/. To revert the feature, restore that snapshot's code files and restart the server. Preserve data.json and uploads/ so accounts, reports, claims and photos are retained.
