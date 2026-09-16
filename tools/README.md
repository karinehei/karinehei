# Find the Signal export

Captures only the playground animation stage (`#stage-frame`) into a
looping GIF and a still PNG for the profile README.

## Usage

Requires Node.js and Google Chrome (or another Chromium browser).
Optional: set `CHROME_PATH` if Chrome is not in a default location.

```bash
cd tools
npm install
npm run export
```

Writes:

- `../assets/find-the-signal.gif` — 12s loop at 20 fps
- `../assets/find-the-signal-static.png` — final answer at 10000ms

Temporary PNG frames are stored in `.frames/` and removed after encoding.
