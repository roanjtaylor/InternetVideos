# TubeLens

A distraction-free YouTube for iPhone: subscriptions, playlists and search.
No home feed, no recommendations, no Shorts, no comments, no autoplay-next.

- `backend/` SBCL server that talks to the YouTube Data API with your account
  and serves clean JSON (see `backend/README.md`).
- `app/` Expo app (SDK 54, iOS 15.1+, so it runs on an iPhone 7).

## One-time setup

### 1. Google Cloud (10 minutes)
1. https://console.cloud.google.com → new project, e.g. `tubelens`.
2. APIs & Services → Library → enable **YouTube Data API v3**.
3. APIs & Services → OAuth consent screen → External. Add yourself under
   **Test users**. Add scope `.../auth/youtube.readonly`.
4. Credentials → Create credentials → OAuth client ID → type **Desktop app**.
   Copy the client ID and secret.
5. Later, once it works: set the consent screen **Publishing status** to
   *In production* (leave it unverified). In *Testing* the refresh token
   dies every 7 days.

### 2. Backend
```
cd backend
cp config.example.json config.json      # fill in client_id, client_secret, app_key
sbcl --non-interactive --load run.lisp auth     # open the printed URL, approve
sbcl --non-interactive --load run.lisp serve
curl http://localhost:8788/health
```
The server listens on all interfaces on port 8788. Your phone must reach it:
same Wi-Fi via your laptop's LAN IP (`ipconfig`), or install Tailscale on
both devices and use the laptop's Tailscale IP. Allow port 8788 through
Windows Firewall for the private network.

### 3. App config
Copy `app/.env.example` to `app/.env` and set your laptop's IP and the same
`app_key` as `backend/config.json`.

### 4. Build for the iPhone 7 (no Mac needed)
Requires an Apple Developer Program membership.
```
cd app
npx eas-cli login
npx eas-cli build:configure
npx eas-cli device:create            # register the iPhone 7 UDID (opens a link to open on the phone)
npx eas-cli build --profile development --platform ios
```
Install the build from the link EAS prints, then on the laptop run
`npx expo start --dev-client` and open the app: it loads code live from your
laptop, so edits show up without rebuilding.

TestFlight when ready:
```
npx eas-cli build --profile production --platform ios
npx eas-cli submit --platform ios
```
