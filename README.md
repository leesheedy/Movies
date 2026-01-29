# MittaMedia Streaming

MittaMedia Desktop is a hybrid Electron app that bundles the Vega provider ecosystem with a local Express API and a Chromium front-end. It delivers a self-contained streaming content explorer for Windows without requiring a system-wide Node.js install.

## What this app includes

- **Electron shell**: launches the local API, waits for `/health`, and opens a maximized window with standard controls.
- **Provider engine**: TypeScript providers in `providers/` compile to `dist/` and power catalogs, metadata, and streams.
- **Local API**: `dev-server.js` exposes `/api/:provider/catalog`, `/posts`, `/search`, `/meta`, `/episodes`, `/stream`, and proxy helpers.
- **Streaming UI**: home dashboard, search, watch history, discovery, and TMDB-driven collections.

## Designed for TV remotes & Xbox controllers

The UI follows a “10-foot” layout and keyboard-first navigation so it works smoothly with:

- **D-pad / arrow keys** to move between cards, buttons, and sections.
- **A / Enter** to select.
- **B / Backspace** to go back or close modals.
- **Menu / Esc** to exit overlays.

If you’re using a TV remote, make sure it’s paired as a keyboard or gamepad; the interface uses focus states and large targets for quick left-right movement across rows.

## Run locally

### Prerequisites

- **Node.js 18+**
- **npm 9+**

### 1) Install dependencies

```bash
npm install
```

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
