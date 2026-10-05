# Ember

Tasks, learning goals and a pomodoro focus timer. Local-first: data lives in your browser, and can sync between devices through your own Google Drive.

## Develop

```bash
npm install
npm run dev        # http://localhost:5199 (fixed: Google sign-in allows this address)
npm test
npm run build
```

## Install as an app

Open the hosted address in Chrome (Mac or Android) and choose **Install app** (Safari on Mac: **File → Add to Dock**). Ember then opens in its own window and works offline. When a new version is deployed, a bar offers **Reload**.

## One-time setup: hosting and sync

1. **GitHub.** Create a public repo named `ember`, push `main`, then **Settings → Pages → Source: GitHub Actions**. Each push to `main` tests, builds and deploys to `https://<you>.github.io/ember/`.
2. **Google Cloud** (https://console.cloud.google.com):
   1. Create a project, e.g. "Ember".
   2. **APIs & Services → Library**: enable **Google Drive API**.
   3. **OAuth consent screen**: External; app name Ember; your email; scope `.../auth/drive.appdata`; publishing status **Testing**; add yourself as a test user.
   4. **Credentials → Create credentials → OAuth client ID → Web application.** Authorised JavaScript origins: `https://<you>.github.io` and `http://localhost:5199`. No redirect URIs.
3. **Client ID.**
   - GitHub: **Settings → Secrets and variables → Actions → Variables → New repository variable** `VITE_GOOGLE_CLIENT_ID`, then re-run the Deploy workflow.
   - Locally: copy `.env.example` to `.env.local` and fill it in.
4. **Optional: stop the weekly sign-in.** While the consent screen is in Testing, Google expires sign-in after 7 days. **OAuth consent screen → Publish app** removes that; the `drive.appdata` scope doesn't need Google's review.

## Moving your data onto the hosted app

1. In the app you've been using (e.g. http://localhost:5199): **Data → Connect Google Drive**. Drive is empty, so your data uploads.
2. On each other device: open the hosted app, **Data → Connect Google Drive → Use Drive's data here**.

## How sync behaves

- Syncs when Ember opens, when you come back to it, 5 seconds after a change, and every minute while it's open.
- The timer, the selected task, sound and demo speed stay per device; finished focus sessions sync.
- Edits on two devices merge item by item; the newest edit to the same item wins. Deletes sync.
- Google's sign-in lasts an hour; after that the Data menu shows **Reconnect**. Your work carries on locally meanwhile.
- **Restore** while connected replaces the data on all devices (each keeps a safety copy).
- Data → **Disconnect** stops syncing; your data and the Drive file are kept.
