# Internet Vids

A distraction-free YouTube for iPhone: subscriptions, playlists and search.
No home feed, no recommendations, no Shorts, no comments, no autoplay-next.

Tabs: **Home** (your pinned playlists, oldest addition first, then recent
watch history), **Playlists** (sort and privacy filter in the header; long
press or the menu pins one to Home), **Search**, **Subscriptions**, **You**.

Google removed watch history and the Watch Later queue from the Data API in
2016, so the app keeps both itself: every video it plays goes into a local
history with its playback position (so it resumes), and Home pins a playlist
of yours called "Watch later" by default. The player fetches views, likes and
the channel, and can like, save, subscribe and hand the video to Google's AI
Mode ("Ask"); YouTube's in-app Gemini is not open to other apps.

- `app/` Expo app (SDK 54, iOS 15.1+, so it runs on an iPhone 7). It talks to
  the YouTube Data API directly from the phone: sign in with Google once and
  it works anywhere, with no server. Saving to playlists and liking work too.
- `backend/` the earlier SBCL server. No longer needed by the app; kept for
  reference (see `backend/README.md`).

## One-time setup

### 1. Google Cloud (10 minutes)
1. https://console.cloud.google.com → new project, e.g. `internet-vids`.
2. APIs & Services → Library → enable **YouTube Data API v3**.
3. APIs & Services → OAuth consent screen → External. Add yourself under
   **Test users**. Add scope `.../auth/youtube` (read and write: the app saves
   to playlists).
4. Credentials → Create credentials → OAuth client ID → type **iOS**, bundle
   ID `com.roanjtaylor.internetvids`. Copy the client ID (iOS clients have no secret).
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

### 4. Two apps on the phone (no Mac needed)
Requires an Apple Developer Program membership. Two variants of the app are
built from the same code, chosen by `APP_VARIANT` (see `app/app.config.js`):

| Variant | Name | Bundle ID | Purpose |
|---|---|---|---|
| production | Internet Vids | `com.roanjtaylor.internetvids` | The standalone app, via TestFlight |
| development | Internet Vids Dev | `com.roanjtaylor.internetvids.dev` | A dev client that loads code live from the laptop |

Each needs its own iOS OAuth client in Google Cloud (step 1.4, with the
matching bundle ID). The production client ID lives in `app/.env` and the
EAS project's environment; the dev one goes in `app/.env.development` and in
the `env` of the `development` and `development-testflight` profiles in
`app/eas.json`, replacing the `PASTE-DEV-CLIENT-ID` placeholder.

**Dev client, once.** The phone's Safari is too old for expo.dev's install
pages, so deliver it through TestFlight (works on iOS 15):
```
cd app
npx eas-cli build --profile development-testflight --platform ios
npx eas-cli submit --profile development-testflight --platform ios
```
Add yourself as an internal tester in App Store Connect and install
"Internet Vids Dev" from the TestFlight app. Rebuild it only when native code
changes (a new native library, or `app.json` changes to plugins, bundle ID or
URL schemes).

**Every day.** On the laptop:
```
cd app
npx expo start --dev-client
```
Open Internet Vids Dev and connect to the laptop; edits show up on save.

**Release.** When a change is ready, ship the standalone app:
```
npx eas-cli build --profile production --platform ios
npx eas-cli submit --platform ios
```
