const { IOS_LABEL } = require("./constants");

const ANSI_ESCAPE_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const SOURCE_FILE_PATTERN =
  /([\w.-]+\.(?:swift|m|mm|c|cpp|h|java|kt|js|ts))\b/g;
const GRADLE_TASK_PATTERN = /> Task (:[\w:-]+)/;
const GRADLE_PERCENT_PATTERN = /(\d{1,3})%\s*(?:EXECUTING|CONFIGURING|IDLE)/;
const IOS_COMPILE_PATTERN =
  /CompileC |SwiftCompile |CompileSwift |\bCompileSwiftSources\b|PrecompileModule /;
const ERROR_PATTERN =
  /\*\* ARCHIVE FAILED \*\*|\*\* EXPORT FAILED \*\*|\*\* BUILD FAILED \*\*|\bfatal error:|\berror: /i;

const IOS_COMPILE_PROGRESS_START = 24;
const IOS_COMPILE_PROGRESS_END = 80;
const EXPECTED_IOS_COMPILES = 200;
const ANDROID_TASK_PROGRESS_START = 18;
const ANDROID_TASK_PROGRESS_END = 84;
const EXPECTED_ANDROID_TASKS = 120;
const STATUS_MAX_CHARS = 80;

const IOS_MILESTONES = [
  {
    pattern: /Archiving .+ App Store Connect/,
    progress: 3,
    status: "Preparing archive",
  },
  {
    pattern: /Resolve Package Graph|Fetching from https?:/,
    progress: 7,
    status: "Resolving packages",
  },
  {
    pattern: /Prepare build|CreateBuildDirectory/,
    progress: 10,
    status: "Preparing build",
  },
  {
    pattern: /Writing bundle output|Done writing bundle output|iOS Bundled /,
    progress: 18,
    status: "Bundling JavaScript",
  },
  {
    pattern: /PhaseScriptExecution/,
    progress: 14,
    status: "Running Xcode scripts",
  },
  {
    pattern: /CompileAssetCatalog|CompileStoryboard|\bActool /,
    progress: 22,
    status: "Compiling assets",
  },
  {
    pattern: /\bLd\b /,
    progress: 82,
    status: "Linking",
  },
  {
    pattern: /GenerateDSYMFile/,
    progress: 85,
    status: "Generating dSYM",
  },
  {
    pattern: /CodeSign /,
    progress: 87,
    status: "Signing",
  },
  {
    pattern: /\*\* ARCHIVE SUCCEEDED \*\*/,
    progress: 90,
    status: "Archive complete",
  },
  {
    pattern: /Uploading archive to App Store Connect/,
    progress: 93,
    status: "Uploading to App Store Connect",
  },
  {
    pattern: /\*\* EXPORT SUCCEEDED \*\*|Uploaded .+ to App Store Connect/,
    progress: 100,
    status: "Uploaded",
  },
];

const ANDROID_MILESTONES = [
  {
    pattern: /Skipping Android build/,
    progress: 80,
    status: "Using existing AAB",
  },
  {
    pattern: /Building .+ Android App Bundle/,
    progress: 3,
    status: "Starting EAS build",
  },
  {
    pattern: /\[RUN_GRADLEW\]|gradlew :app:bundle|Running[^\n]*gradlew/,
    progress: 12,
    status: "Starting Gradle",
  },
  {
    pattern: /Writing bundle output|Android Bundled /,
    progress: 22,
    status: "Bundling JavaScript",
  },
  {
    pattern: /> Configure project/,
    progress: 16,
    status: "Configuring Gradle",
  },
  {
    pattern: /BUILD SUCCESSFUL/,
    progress: 86,
    status: "Bundle built",
  },
  {
    pattern: /Uploading .+ Google Play|Uploading .+ to Google Play/,
    progress: 90,
    status: "Uploading to Play",
  },
  {
    pattern: /Uploaded .+ Google Play|Submitted .+ Google Play/,
    progress: 100,
    status: "Uploaded",
  },
];

function stripAnsi(text) {
  return text.replace(ANSI_ESCAPE_PATTERN, "");
}

function lastSourceFile(line) {
  let last = null;
  SOURCE_FILE_PATTERN.lastIndex = 0;
  for (const match of line.matchAll(SOURCE_FILE_PATTERN)) {
    last = match[1];
  }
  return last;
}

function scaledProgress(count, start, end, expected) {
  const ratio = Math.min(count / expected, 1);
  return start + ratio * (end - start);
}

function matchMilestones(milestones, line) {
  let best = null;
  for (const milestone of milestones) {
    if (!milestone.pattern.test(line)) continue;
    if (!best || milestone.progress >= best.progress) {
      best = milestone;
    }
  }
  return best
    ? { progress: best.progress, status: best.status }
    : null;
}

function ingestIos(state, line) {
  if (IOS_COMPILE_PATTERN.test(line)) {
    const file = lastSourceFile(line);
    if (file) {
      state.compileFiles.add(file);
    } else {
      state.compileFiles.add(`compile-${state.compileFiles.size}`);
    }
    return {
      progress: scaledProgress(
        state.compileFiles.size,
        IOS_COMPILE_PROGRESS_START,
        IOS_COMPILE_PROGRESS_END,
        EXPECTED_IOS_COMPILES,
      ),
      status: file ? `Compiling ${file}` : "Compiling native sources",
    };
  }

  const milestone = matchMilestones(IOS_MILESTONES, line);
  if (milestone) return milestone;

  if (ERROR_PATTERN.test(line)) {
    return { status: line.slice(0, STATUS_MAX_CHARS) };
  }

  return null;
}

function ingestAndroid(state, line) {
  const task = line.match(GRADLE_TASK_PATTERN);
  if (task) {
    state.gradleTasks.add(task[1]);
    return {
      progress: scaledProgress(
        state.gradleTasks.size,
        ANDROID_TASK_PROGRESS_START,
        ANDROID_TASK_PROGRESS_END,
        EXPECTED_ANDROID_TASKS,
      ),
      status: task[1],
    };
  }

  const percent = line.match(GRADLE_PERCENT_PATTERN);
  if (percent) {
    const value = Number(percent[1]);
    if (value >= 0 && value <= 100) {
      return {
        progress:
          ANDROID_TASK_PROGRESS_START +
          (value / 100) *
            (ANDROID_TASK_PROGRESS_END - ANDROID_TASK_PROGRESS_START),
        status: `Gradle ${value}%`,
      };
    }
  }

  const milestone = matchMilestones(ANDROID_MILESTONES, line);
  if (milestone) return milestone;

  if (ERROR_PATTERN.test(line)) {
    return { status: line.slice(0, STATUS_MAX_CHARS) };
  }

  return null;
}

function snapshot(state) {
  return {
    progress: state.progress,
    status: state.status,
  };
}

function createProgressTracker(platform) {
  const ingestLine = platform === IOS_LABEL ? ingestIos : ingestAndroid;
  const state = {
    progress: 0,
    status: "Starting",
    compileFiles: new Set(),
    gradleTasks: new Set(),
  };

  return {
    ingest(rawLine) {
      const line = stripAnsi(String(rawLine)).replace(/\s+/g, " ").trim();
      if (!line) return snapshot(state);

      const update = ingestLine(state, line);
      if (update) {
        if (
          typeof update.progress === "number" &&
          update.progress > state.progress
        ) {
          state.progress = Math.min(update.progress, 100);
        }
        if (update.status) {
          state.status = update.status;
        }
      }

      return snapshot(state);
    },
    snapshot() {
      return snapshot(state);
    },
  };
}

module.exports = {
  createProgressTracker,
  stripAnsi,
};
