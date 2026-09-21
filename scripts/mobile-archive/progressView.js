const readline = require("readline");

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const DISABLE_WRAP = "\x1b[?7l";
const ENABLE_WRAP = "\x1b[?7h";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const COLOR_IOS = "\x1b[36m";
const COLOR_ANDROID = "\x1b[33m";
const COLOR_SUCCESS = "\x1b[32m";
const COLOR_FAIL = "\x1b[31m";
const BAR_FILLED = "█";
const BAR_EMPTY = "░";
const BAR_WIDTH = 24;
const TICK_MS = 50;
const LERP = 0.22;
const SETTLE_THRESHOLD = 0.4;
const SETTLE_TIMEOUT_MS = 700;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_FRAME_MS = 80;
const IN_PROGRESS_CAP = 99;
const DEFAULT_COLUMNS = 80;
const LABEL_WIDTH = 8;
const STATE_RUNNING = "running";
const STATE_SUCCESS = "success";
const STATE_FAILED = "failed";
const SUCCESS_MARK = "✓";
const FAIL_MARK = "✗";
const HEADER_LINE_COUNT = 2;
const DEFAULT_STATUS = "Starting";

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

function formatElapsed(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function padPercent(percent) {
  return `${String(percent).padStart(3, " ")}%`;
}

function renderBar(percent) {
  const filled = Math.max(
    0,
    Math.min(BAR_WIDTH, Math.round((percent / 100) * BAR_WIDTH)),
  );
  return `[${BAR_FILLED.repeat(filled)}${BAR_EMPTY.repeat(BAR_WIDTH - filled)}]`;
}

function effectiveTarget(track) {
  if (track.state === STATE_SUCCESS) return 100;
  if (track.state === STATE_FAILED) return clampPercent(track.targetProgress);
  return Math.min(track.targetProgress, IN_PROGRESS_CAP);
}

function trackColor(track) {
  if (track.state === STATE_SUCCESS) return COLOR_SUCCESS;
  if (track.state === STATE_FAILED) return COLOR_FAIL;
  return track.color;
}

function trackMark(track, spinnerFrame) {
  if (track.state === STATE_SUCCESS) return SUCCESS_MARK;
  if (track.state === STATE_FAILED) return FAIL_MARK;
  return SPINNER_FRAMES[spinnerFrame];
}

function formatTrackLine(track, columns, spinnerFrame) {
  const percent = Math.round(track.displayProgress);
  const mark = trackMark(track, spinnerFrame);
  const label = track.label.padEnd(LABEL_WIDTH);
  const bar = renderBar(track.displayProgress);
  const prefix = `${mark} ${label} ${bar}  ${padPercent(percent)}  `;
  const statusWidth = Math.max(0, columns - prefix.length);
  const status = (track.status || DEFAULT_STATUS).slice(0, statusWidth);
  return `${trackColor(track)}${prefix}${status}${RESET}`;
}

function createProgressView({ title, tracks }) {
  const trackState = tracks.map((track) => ({
    id: track.id,
    label: track.label,
    color: track.color,
    targetProgress: 0,
    displayProgress: 0,
    status: DEFAULT_STATUS,
    state: STATE_RUNNING,
  }));
  const lineCount = HEADER_LINE_COUNT + trackState.length;
  const startedAt = Date.now();
  let drawn = false;
  let active = false;
  let tickTimer = null;
  let spinnerFrame = 0;
  let spinnerElapsedMs = 0;

  function columns() {
    return process.stdout.columns || DEFAULT_COLUMNS;
  }

  function findTrack(id) {
    return trackState.find((track) => track.id === id);
  }

  function buildLines() {
    const elapsed = `${DIM}${formatElapsed(Date.now() - startedAt)}${RESET}`;
    return [
      `${BOLD}${title}${RESET}  ${elapsed}`,
      "",
      ...trackState.map((track) =>
        formatTrackLine(track, columns(), spinnerFrame),
      ),
    ];
  }

  function render() {
    if (!active) return;

    const lines = buildLines();
    if (drawn) {
      readline.moveCursor(process.stdout, 0, -lineCount);
    }
    for (const line of lines) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      process.stdout.write(`${line}\n`);
    }
    drawn = true;
  }

  function tick() {
    spinnerElapsedMs += TICK_MS;
    if (spinnerElapsedMs >= SPINNER_FRAME_MS) {
      spinnerElapsedMs = 0;
      spinnerFrame = (spinnerFrame + 1) % SPINNER_FRAMES.length;
    }

    for (const track of trackState) {
      const target = effectiveTarget(track);
      const delta = target - track.displayProgress;
      if (Math.abs(delta) <= SETTLE_THRESHOLD) {
        track.displayProgress = target;
      } else {
        track.displayProgress += delta * LERP;
      }
    }

    render();
  }

  function start() {
    if (active) return;
    active = true;
    process.stdout.write(HIDE_CURSOR + DISABLE_WRAP);
    render();
    tickTimer = setInterval(tick, TICK_MS);
  }

  function update(id, { progress, status }) {
    const track = findTrack(id);
    if (!track || track.state !== STATE_RUNNING) return;
    if (typeof progress === "number") {
      track.targetProgress = Math.max(
        track.targetProgress,
        clampPercent(progress),
      );
    }
    if (status) {
      track.status = status;
    }
  }

  function finish(id, { ok, status }) {
    const track = findTrack(id);
    if (!track) return;
    track.state = ok ? STATE_SUCCESS : STATE_FAILED;
    if (ok) {
      track.targetProgress = 100;
      track.status = status || "Uploaded";
    } else if (status) {
      track.status = status;
    }
  }

  function restoreTerminal() {
    process.stdout.write(SHOW_CURSOR + ENABLE_WRAP);
  }

  function stop() {
    if (!active) return;
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = null;
    }
    for (const track of trackState) {
      track.displayProgress = effectiveTarget(track);
    }
    render();
    active = false;
    restoreTerminal();
  }

  function waitForIdle() {
    return new Promise((resolve) => {
      const startedWait = Date.now();
      const check = () => {
        const settled = trackState.every(
          (track) =>
            Math.abs(track.displayProgress - effectiveTarget(track)) <=
            SETTLE_THRESHOLD,
        );
        if (settled || Date.now() - startedWait >= SETTLE_TIMEOUT_MS) {
          resolve();
          return;
        }
        setTimeout(check, TICK_MS);
      };
      check();
    });
  }

  return {
    start,
    update,
    finish,
    stop,
    waitForIdle,
    restoreTerminal,
  };
}

module.exports = {
  createProgressView,
  COLOR_IOS,
  COLOR_ANDROID,
};
