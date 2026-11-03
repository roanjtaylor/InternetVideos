# TubeLens

A distraction-free YouTube for iPhone: subscriptions, playlists and search.
No home feed, no recommendations, no Shorts, no comments, no autoplay-next.

- `app/` Expo app (SDK 54, iOS 15.1+, so it runs on an iPhone 7). It talks to
  the YouTube Data API directly from the phone: sign in with Google once and
  it works anywhere, with no server. Saving to playlists and liking work too.
- `backend/` the earlier SBCL server. No longer needed by the app; kept for
  reference (see `backend/README.md`).

## One-time setup

### 1. Google Cloud (10 minutes)
1. https://console.cloud.google.com → new project, e.g. `tubelens`.
2. APIs & Services → Library → enable **YouTube Data API v3**.
3. APIs & Services → OAuth consent screen → External. Add yourself under
   **Test users**. Add scope `.../auth/youtube` (read and write: the app saves
   to playlists).
4. Credentials → Create credentials → OAuth client ID → type **iOS**, bundle
   ID `com.roanjtaylor.tubelens`. Copy the client ID (iOS clients have no secret).
5. Later, once it works: set the consent screen **Publishing status** to
   *In production* (leave it unverified). In *Testing* the sign-in expires
   every 7 days.

### 2. App config
Copy `app/.env.example` to `app/.env` and set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
to that client ID. It also registers the OAuth redirect URL scheme, so
changing it needs a new native build.

### 3. Run
```
cd app
npx expo start --dev-client
```
Sign in with Google on the first launch. Tokens stay in the iOS Keychain.
Daily quota is 10,000 units; a full refresh of everything costs roughly 250.
The Subscriptions tab shows today's usage at the bottom.

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
