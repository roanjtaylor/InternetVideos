# TubeLens backend (SBCL)

Serves your YouTube subscriptions, playlists and search as plain JSON with
Shorts removed and nothing recommended. One user, one refresh token.

## Setup
1. Copy `config.example.json` to `config.json` and fill in `client_id` and
   `client_secret` (Google Cloud OAuth client, type **Desktop app**) and a
   random `app_key` (the phone sends it as the `X-App-Key` header).
2. `sbcl --non-interactive --load run.lisp auth` then open the printed URL.
3. `sbcl --non-interactive --load run.lisp serve`

## Endpoints (all need `X-App-Key` except /health)
- `GET /health`
- `GET /feed`             latest uploads across subscriptions, Shorts removed (15 min cache)
- `GET /playlists`        your playlists
- `GET /playlist?id=...`  videos in one playlist
- `GET /search?q=...`     25 results, Shorts removed (100 quota units per new query)
- `GET /refresh`          clear caches
