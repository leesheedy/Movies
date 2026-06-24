# NOTFLIX — Movies, TV Shows & Live Sports

NOTFLIX is a TMDB-driven streaming front-end (deployable as a static Netlify site or as a hybrid Electron app) with a full movie & TV catalogue, a combined **Live TV & Sports** hub, and a dedicated **10-foot TV mode** for couch/remote use.

## What this app includes

- **Movies & TV**: TMDB-powered home, search, discovery and collections, played through embed providers.
- **Live TV & Sports**: ~1,800 live channels (via ntv.cx) plus live sports (via streamed.pk) in one section with a server switcher.
- **TV / 10-foot mode**: auto-detects Smart TVs, consoles and big screens, then switches to a large-type, focus-ring layout with full D-pad / gamepad spatial navigation. Force with `?tv=1` (or `window.toggleTvMode()`).
- **Electron shell / Local API**: `dev-server.js` exposes the catalogue API plus the live/availability proxies; the Electron shell launches it and opens a window.

## Streaming sources

Movie/TV embeds are configured in `public/app.js` → `STREAM_PROVIDERS` (priority order):

1. **111Movies** (`111movies.net`) — primary
2. **VidLove** (`player.vidlove.cc`)
3. **ZStream** (`zstream.mov`) — open-source P-Stream fork, **no ads by design** (FMHY-listed)
4. **VidFast** (`vidfast.pro`) — clean, ad-light player
5. **Videasy** (`player.videasy.to`)

All five were live-probed to be reachable, iframe-embeddable, and free of ad/popup scripts in their player shell. Other clean, embeddable alternatives (verified, FMHY-listed) if you want to swap one: `vidlink.pro`, `bcine.ru`, `vyla.pages.dev`, `bingr.live`. (The original "Clinzo" request had no live domain, so it was replaced by ZStream.)

The player shows a **server chip per provider** with a live availability dot (green = reachable, dim = down). Availability is probed by the serverless `/api/stream-check` endpoint (providers send no CORS, so the browser can't check them directly). Live-TV channel data is relayed through `/api/live` for the same reason. Both run as Netlify functions (`netlify/functions/`) in production and as `dev-server.js` routes locally.

## Designed for TV remotes & Xbox controllers

The UI follows a “10-foot” layout and keyboard-first navigation so it works smoothly with:

- **D-pad / arrow keys** to move between cards, buttons, and sections.
- **A / Enter** to select.
- **B / Backspace** to go back or close modals.
- **Menu / Esc** to exit overlays.

If you’re using a TV remote, make sure it’s paired as a keyboard or gamepad; the interface uses focus states and large targets for quick left-right movement across rows.

## Watch on your LG (webOS) TV

- **Easiest:** open your TV’s web browser and go to `mittamovies.netlify.app/?tv=1`.
- **As an app:** the in-app **/tv** page (`public/tv.html`) has copy-paste steps and
  a direct `.ipk` download. Full CLI deploy steps are in [`webos/README-DEPLOY.md`](webos/README-DEPLOY.md).

## Run locally

### Prerequisites

- **Node.js 18+**
- **npm 9+**

### 1) Install dependencies

```bash
npm install
```

### 1.5) Configure TMDB API key

Set the TMDB API key in your environment so the UI can fetch trending, popular, and now-playing movies:

```bash
export VITE_TMDB_KEY="your_tmdb_key"
```

For Netlify, add `VITE_TMDB_KEY` in the site environment variables. Locally, you can copy `.env.example` to `.env` and load it in your shell.

### 2) Build provider bundle

```bash
npm run build
```

### 3) Start the local web server

```bash
npm run dev
```

Open `http://localhost:3001` in your browser. The UI calls the local API on the same origin, so catalogs and metadata load as soon as the server is running.

### 4) Run the Electron desktop app

```bash
npm run electron:dev
```

This builds providers, starts the API inside Electron, and launches the desktop window.

## Build installers

```bash
npm run electron:build:portable
npm run electron:build:installer
```

Outputs land in the `release/` directory.

## Project structure

```
public/            # Front-end assets (HTML/CSS/JS)
providers/         # Provider source folders (TypeScript)
dist/              # Compiled provider outputs (generated)
electron/          # Electron entry point and preload scripts
icons/             # Application icons
build-simple.js    # Provider build pipeline
dev-server.js      # Express server powering the API
package.json       # Scripts, dependencies, electron-builder config
```

## Credits

- Built with provider modules from [`Zenda-Cross/vega-providers`](https://github.com/Zenda-Cross/vega-providers.git)
- Special thanks to [Zenda-Cross](https://github.com/Zenda-Cross)
