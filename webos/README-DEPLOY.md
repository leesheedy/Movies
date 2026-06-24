# Notflix — LG webOS TV App

This folder is a complete webOS app that launches Notflix on your LG TV in
10-foot **TV mode** (D-pad / Magic Remote spatial navigation). It's a thin
launcher that opens the live, always-up-to-date site
(`https://mittamovies.netlify.app/?tv=1&webos=1`) — so once it's installed you
never have to repackage it when the site updates.

```
webos/
├── appinfo.json     # app id, title "Notflix", icons, splash
├── index.html       # branded splash → launches Notflix in TV mode
├── icon.png         # 80×80 app icon (red "N")
├── largeIcon.png    # 130×130 app icon
├── splash.png       # 1920×1080 launch splash
└── splash-logo.png  # wordmark used on the bridge splash
```

## Important — about your login

I can't (and don't need to) use your LG account password. The webOS CLI does
**not** authenticate with your `leesheedy123@gmail.com` password. It connects to
your TV using the **Developer Mode passphrase** shown inside the *Developer Mode*
app on the TV itself (you've already signed in + enabled Dev Mode there). That
on-device passphrase is the only credential the steps below need. (Also: it's a
good idea to change any password you've shared in chat.)

## One-time setup (Windows)

1. Install the webOS CLI (Node 18+):
   ```powershell
   npm install -g @webos-tools/cli
   ```
   (older alias: `@webosose/ares-cli` — either provides the `ares-*` commands)

2. On the TV: open **Developer Mode** app → make sure **Dev Mode Status = ON** and
   **Key Server = ON**. Note the TV's **IP address** and the **passphrase**
   (a 6-character code shown in the app).

3. Register the TV with the CLI:
   ```powershell
   ares-setup-device --add notflixtv --info "host=<TV_IP> port=9922 username=prisoner"
   ares-novacom --device notflixtv --getkey      # prompts for the on-screen passphrase
   ```
   (Or run `ares-setup-device` with no args for the interactive editor.)

4. Confirm the TV is reachable:
   ```powershell
   ares-device-info --device notflixtv
   ```

## Build, install, run

From the repo root (`C:\Users\efextech\Movies`):

```powershell
ares-package webos                                   # → com.notflix.app_1.0.0_all.ipk
ares-install --device notflixtv com.notflix.app_1.0.0_all.ipk
ares-launch  --device notflixtv com.notflix.app
```

Notflix will appear on your TV's home launcher with the red "N" icon and run
full-screen. To update later, just `ares-package` + `ares-install` again (only
needed if you change this wrapper — the content itself updates automatically
from the cloud).

### Handy one-liner (PowerShell)
```powershell
ares-package webos; ares-install --device notflixtv (Get-ChildItem com.notflix.app_*_all.ipk | Select-Object -Last 1).Name; ares-launch --device notflixtv com.notflix.app
```

## Notes
- **Dev Mode apps expire** after ~50 hours and the TV must renew via the
  Developer Mode app (keep it installed/signed in). This is an LG limitation for
  side-loaded apps.
- To publish to the **LG Content Store** (permanent, public), you'd submit the
  `.ipk` through the LG Seller Lounge with your developer account — that's a
  manual review/submission you do from your signed-in browser; I can't submit on
  your behalf.
- Magic Remote: the pointer works like a mouse; the D-pad + OK + Back are all
  wired (Back exits the app from the home screen).
