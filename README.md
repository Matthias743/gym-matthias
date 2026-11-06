# GYM Matthias

A mobile gym tracker built around my weekly training program (Push / Pull / Legs / Upper).
It's a **Progressive Web App (PWA)**: it installs on an Android phone like a native app, opens full screen and works **offline** at the gym.

**Live app:** https://matthias743.github.io/gym-matthias/

## Features

- **Weekly view**: the 4 sessions of the program with all their exercises, one line per set (kg + reps)
- **Weekly counter and goal**: sessions done this week, configurable weekly goal, "up next" suggestion
- **Last time**: shows what I did last time for each exercise, and copies it in one tap
- **Progression hint** (double progression): when every work set reaches the top of the rep range, the app suggests the next weight
- **Rest timer**: rest time read from the program, beep + vibration, keeps the screen on
- **Progress**: sessions per week chart, week streak, chart and history per exercise
- **Editable program**: rename, add, reorder or remove sessions and exercises; history is kept
- **Backup**: export to JSON (full backup) or CSV (table for Excel / Google Sheets), import back

## Tech

- Vanilla **HTML, CSS and JavaScript**, no framework and no build step
- **localStorage** to save data on the device
- **Service worker** (`sw.js`) with a cache-first strategy for offline use
- **Web App Manifest** for installation (name, icons, standalone display)
- **Screen Wake Lock** and **Vibration** APIs for the rest timer
- Charts drawn by hand in **SVG**
- Light and dark theme following the phone's setting

## Project structure

```
index.html            page structure
style.css             design (colors, layout, light/dark theme)
app.js                app logic: data, rendering, timer, charts, backup
sw.js                 service worker: offline cache
manifest.webmanifest  install info: name, icons, colors
icons/                app icons
fonts/                fonts stored locally for offline use
```

## Run it locally

A service worker only works over `http://localhost` or HTTPS, so open the app through a small local server:

```
python -m http.server 8000
```

Then go to http://localhost:8000.

## Deploy

The app is hosted with **GitHub Pages** (Settings → Pages → Deploy from branch `main`, folder `/root`).
After each change, bump `CACHE_VERSION` in `sw.js` so installed apps get the new version.
