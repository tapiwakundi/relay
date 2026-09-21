#!/usr/bin/env node

/**
 * Bumps the current app's build number once, then archives and uploads
 * iOS and Android in parallel with that same version and build.
 *
 * On a TTY, child logs stay off the screen: two in-place tracks show
 * estimated progress. Set ARCHIVE_STREAM_LOGS=1 to print prefixed logs.
 *
 * Run from the mobile app directory (`pnpm --filter @relay/mobile archive`).
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const {
  SKIP_BUMP_FLAG,
  IOS_LABEL,
  ANDROID_LABEL,
  IOS_SCRIPT,
  ANDROID_SCRIPT,
  INCREMENT_SCRIPT,
  BUILD_DIR_NAME,
  STREAM_LOGS_ENV,
  STREAM_LOGS_VALUE,
  ARCHIVE_LOG_FILE_NAME,
  LAST_ERROR_LINE_COUNT,
  getAppRoot,
  readExpoConfig,
} = require("./constants");
const { runReturningStatus } = require("./run");
const { createProgressTracker } = require("./estimateProgress");
const {
  createProgressView,
  COLOR_IOS,
  COLOR_ANDROID,
} = require("./progressView");

const appRoot = getAppRoot();
const children = [];
const FAILED_STATUS = "Failed";
const SUCCESS_STATUS = "Uploaded";
const LINE_SPLIT_PATTERN = /\r?\n|\r/;

function shouldUseProgressView() {
  return (
    process.stdout.isTTY && process.env[STREAM_LOGS_ENV] !== STREAM_LOGS_VALUE
  );
}

function archiveLogPath(label) {
  const platformDir = label === IOS_LABEL ? "ios" : "android";
  return path.join(appRoot, platformDir, BUILD_DIR_NAME, ARCHIVE_LOG_FILE_NAME);
}

function createRingBuffer(max) {
  const items = [];
  return {
    push(line) {
      const trimmed = line.trim();
      if (!trimmed) return;
      items.push(trimmed);
      if (items.length > max) {
        items.shift();
      }
    },
    toArray() {
      return items.slice();
    },
  };
}

function consumeLines(stream, onLine) {
  let leftover = "";
  const write = (text) => {
    leftover += text;
    const parts = leftover.split(LINE_SPLIT_PATTERN);
    leftover = parts.pop() ?? "";
    for (const line of parts) {
      onLine(line);
    }
  };
  stream.on("data", (chunk) => write(chunk.toString()));
  stream.on("end", () => {
    if (leftover) onLine(leftover);
  });
}

function prefixStream(stream, label) {
  consumeLines(stream, (line) => {
    process.stdout.write(`[${label}] ${line}\n`);
  });
}

function attachProgressOutput(
  stream,
  { label, tracker, view, logStream, ring },
) {
  stream.on("data", (chunk) => {
    logStream.write(chunk);
  });
  consumeLines(stream, (line) => {
    ring.push(line);
    const snapshot = tracker.ingest(line);
    view.update(label, snapshot);
  });
}

function printLogTail(label, logPath, tail) {
  if (tail.length === 0) {
    console.error(`${label} failed. Full log: ${logPath}`);
    return;
  }
  console.error(`${label} failed. Last output:`);
  for (const line of tail) {
    console.error(`  ${line}`);
  }
  console.error(`Full log: ${logPath}`);
}

function runPlatform(label, scriptName, progress) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, scriptName), SKIP_BUMP_FLAG],
      {
        cwd: appRoot,
        env: process.env,
        stdio:
          label === ANDROID_LABEL
            ? ["inherit", "pipe", "pipe"]
            : ["ignore", "pipe", "pipe"],
      },
    );
    children.push(child);

    const tracker = progress ? createProgressTracker(label) : null;
    const ring = progress ? createRingBuffer(LAST_ERROR_LINE_COUNT) : null;
    const logPath = progress ? archiveLogPath(label) : null;
    let logStream = null;

    if (progress) {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      logStream = fs.createWriteStream(logPath);
      logStream.on("error", () => {});
      if (child.stdout) {
        attachProgressOutput(child.stdout, {
          label,
          tracker,
          view: progress.view,
          logStream,
          ring,
        });
      }
      if (child.stderr) {
        attachProgressOutput(child.stderr, {
          label,
          tracker,
          view: progress.view,
          logStream,
          ring,
        });
      }
    } else {
      if (child.stdout) prefixStream(child.stdout, label);
      if (child.stderr) prefixStream(child.stderr, label);
    }

    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      const status = code ?? 1;
      if (logStream) {
        logStream.end();
      }
      if (progress) {
        progress.view.finish(label, {
          ok: status === 0,
          status: status === 0 ? SUCCESS_STATUS : FAILED_STATUS,
        });
      }
      resolve({
        status,
        label,
        logPath,
        tail: ring ? ring.toArray() : [],
      });
    };

    child.on("error", (error) => {
      if (!progress) {
        console.error(`[${label}] ${error.message}`);
      } else {
        progress.view.update(label, { status: error.message });
      }
      finish(1);
    });
    child.on("close", (code) => finish(code ?? 1));
  });
}

function handleInterrupt() {
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGINT");
    }
  }
}

async function main() {
  const incrementStatus = runReturningStatus(process.execPath, [
    path.join(__dirname, INCREMENT_SCRIPT),
  ]);
  if (incrementStatus !== 0) {
    process.exit(incrementStatus);
  }

  const expo = readExpoConfig();
  const version = String(expo.version);
  const buildNumber = String(expo.buildNumber);
  const useProgressView = shouldUseProgressView();
  const view = useProgressView
    ? createProgressView({
        title: `${expo.name}  ${version} (${buildNumber})`,
        tracks: [
          { id: IOS_LABEL, label: IOS_LABEL, color: COLOR_IOS },
          { id: ANDROID_LABEL, label: ANDROID_LABEL, color: COLOR_ANDROID },
        ],
      })
    : null;
  const progress = view ? { view } : null;

  process.on("SIGINT", handleInterrupt);
  process.on("exit", () => {
    if (view) view.restoreTerminal();
  });

  if (view) {
    view.start();
  } else {
    console.log(
      `Archiving ${expo.name} ${version} (${buildNumber}) for ${IOS_LABEL} and ${ANDROID_LABEL} in parallel`,
    );
  }

  const [iosResult, androidResult] = await Promise.all([
    runPlatform(IOS_LABEL, IOS_SCRIPT, progress),
    runPlatform(ANDROID_LABEL, ANDROID_SCRIPT, progress),
  ]);

  if (view) {
    await view.waitForIdle();
    view.stop();
  }

  const failed = [iosResult, androidResult].filter(
    (result) => result.status !== 0,
  );
  if (failed.length > 0) {
    for (const result of failed) {
      if (result.logPath) {
        printLogTail(result.label, result.logPath, result.tail);
      }
    }
    console.error(
      `Archive finished with errors (${failed
        .map((result) => result.label)
        .join(
          ", ",
        )}). Version ${version} (${buildNumber}) was not bumped again.`,
    );
    process.exit(1);
  }

  console.log(
    `Uploaded ${expo.name} ${version} (${buildNumber}) to App Store Connect and Google Play internal testing.`,
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
