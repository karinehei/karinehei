/**
 * Export Find the Signal from the local playground.
 *
 * Usage:
 *   cd tools
 *   npm install
 *   npm run export
 *
 * Requires Google Chrome, or set CHROME_PATH to a Chromium binary.
 * Writes assets/find-the-signal.gif and assets/find-the-signal-static.png.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ffmpegPath from "ffmpeg-static";
import puppeteer from "puppeteer-core";

const DURATION_MS = 12000;
const FPS = 20;
const FRAME_STEP_MS = 1000 / FPS;
const STATIC_TIME_MS = 10000;
const MAX_GIF_BYTES = 5 * 1024 * 1024;
const VIEWPORT = { width: 1100, height: 900, deviceScaleFactor: 1 };

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const playgroundHtml = path.join(repoRoot, "playground", "index.html");
const assetsDir = path.join(repoRoot, "assets");
const framesDir = path.join(scriptDir, ".frames");
const gifPath = path.join(assetsDir, "find-the-signal.gif");
const pngPath = path.join(assetsDir, "find-the-signal-static.png");

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  throw new Error(
    "Could not find Chrome. Install Google Chrome or set CHROME_PATH."
  );
}

function frameTimes(fps) {
  const step = 1000 / fps;
  const times = [];
  for (let t = 0; t < DURATION_MS; t += step) {
    times.push(Math.round(t));
  }
  return times;
}

function formatBytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function emptyDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, name), { recursive: true, force: true });
  }
}

async function waitForPaint(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      })
  );
}

async function renderAt(page, timeMs) {
  await page.evaluate((t) => {
    window.signalDemo.renderAt(t);
  }, timeMs);
  await waitForPaint(page);
}

function encodeGif(inputPattern, outputPath, captureFps, outputFps, maxColors, dither) {
  const filter =
    "fps=" +
    outputFps +
    ",split[s0][s1];" +
    "[s0]palettegen=max_colors=" +
    maxColors +
    ":stats_mode=full:reserve_transparent=0[p];" +
    "[s1][p]paletteuse=dither=" +
    dither +
    ":diff_mode=rectangle";

  execFileSync(
    ffmpegPath,
    [
      "-y",
      "-framerate",
      String(captureFps),
      "-i",
      inputPattern,
      "-vf",
      filter,
      "-loop",
      "0",
      outputPath
    ],
    { stdio: "inherit" }
  );
}

async function captureFrames(page, times, directory) {
  emptyDir(directory);
  for (let i = 0; i < times.length; i += 1) {
    await renderAt(page, times[i]);
    const framePath = path.join(
      directory,
      "frame-" + String(i).padStart(4, "0") + ".png"
    );
    const stage = await page.$("#stage-frame");
    await stage.screenshot({ path: framePath, type: "png" });
    if ((i + 1) % 40 === 0 || i === times.length - 1) {
      console.log("Captured " + (i + 1) + "/" + times.length + " frames");
    }
  }
}

async function main() {
  if (!fs.existsSync(playgroundHtml)) {
    throw new Error("Missing playground at " + playgroundHtml);
  }
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide an ffmpeg binary.");
  }

  fs.mkdirSync(assetsDir, { recursive: true });
  emptyDir(framesDir);

  const chromePath = findChrome();
  console.log("Chrome: " + chromePath);
  console.log("ffmpeg: " + ffmpegPath);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--hide-scrollbars", "--hide-crash-restore-bubble"]
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "no-preference" }
    ]);

    const url = pathToFileURL(playgroundHtml).href;
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(
      () =>
        window.signalDemo &&
        typeof window.signalDemo.pause === "function" &&
        typeof window.signalDemo.renderAt === "function"
    );
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.signalDemo.pause());
    await page.waitForFunction(() => {
      const stage = document.querySelector("#stage-frame");
      if (!stage) return false;
      const width = stage.getBoundingClientRect().width;
      return width >= 959 && width <= 961;
    });

    const stageSize = await page.evaluate(() => {
      const box = document.querySelector("#stage-frame").getBoundingClientRect();
      return { width: Math.round(box.width), height: Math.round(box.height) };
    });
    console.log(
      "Stage size: " + stageSize.width + " × " + stageSize.height
    );

    let fps = FPS;
    const times = frameTimes(fps);
    console.log(
      "Capturing " + times.length + " frames at " + fps + " fps"
    );
    await captureFrames(page, times, framesDir);

    await renderAt(page, STATIC_TIME_MS);
    const stage = await page.$("#stage-frame");
    await stage.screenshot({ path: pngPath, type: "png" });
    console.log("Wrote " + pngPath);
  } finally {
    await browser.close();
  }

  const inputPattern = path.join(framesDir, "frame-%04d.png");
  const attempts = [
    { fps: 20, maxColors: 256, dither: "bayer:bayer_scale=2" },
    { fps: 20, maxColors: 192, dither: "bayer:bayer_scale=3" },
    { fps: 15, maxColors: 192, dither: "bayer:bayer_scale=3" }
  ];

  let chosen = attempts[0];
  for (const attempt of attempts) {
    console.log(
      "Encoding GIF at " +
        attempt.fps +
        " fps, " +
        attempt.maxColors +
        " colors, dither " +
        attempt.dither
    );
    encodeGif(
      inputPattern,
      gifPath,
      FPS,
      attempt.fps,
      attempt.maxColors,
      attempt.dither
    );
    chosen = attempt;
    const size = fs.statSync(gifPath).size;
    console.log("GIF size: " + formatBytes(size));
    if (size <= MAX_GIF_BYTES) break;
    if (attempt === attempts[attempts.length - 1]) {
      console.warn("GIF is still over 5 MB after optimization attempts.");
    }
  }

  const gifStat = fs.statSync(gifPath);
  const pngStat = fs.statSync(pngPath);
  let gifWidth = null;
  let gifHeight = null;
  let gifDuration = null;
  let gifFps = null;
  try {
    execFileSync(ffmpegPath, ["-i", gifPath], { encoding: "utf8" });
  } catch (error) {
    const details = String(error.stderr || "");
    const sizeMatch = details.match(/(\d{2,4})x(\d{2,4})/);
    const durationMatch = details.match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    const fpsMatch = details.match(/([\d.]+) fps/);
    if (sizeMatch) {
      gifWidth = Number(sizeMatch[1]);
      gifHeight = Number(sizeMatch[2]);
    }
    if (durationMatch) {
      gifDuration =
        Number(durationMatch[1]) * 3600 +
        Number(durationMatch[2]) * 60 +
        Number(durationMatch[3]);
    }
    if (fpsMatch) gifFps = Number(fpsMatch[1]);
  }

  const encodedFrames = Math.round((gifDuration || 12) * chosen.fps);

  console.log("\nExport complete");
  console.log("GIF: " + gifPath);
  console.log("PNG: " + pngPath);
  console.log("Dimensions: " + gifWidth + " × " + gifHeight);
  console.log("Duration: " + (gifDuration || 12) + "s");
  console.log("Frame count: " + encodedFrames);
  console.log("Encoded fps: " + (gifFps || chosen.fps));
  console.log("GIF file size: " + formatBytes(gifStat.size));
  console.log("PNG file size: " + formatBytes(pngStat.size));

  fs.rmSync(framesDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
