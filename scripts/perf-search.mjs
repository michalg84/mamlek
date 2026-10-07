// Search performance: measures the /szukaj flow in a clean Chromium with network and CPU throttling, so the same numbers
// can be compared before and after every change of the suggestion component. Needs a one-time
// `npx playwright install chromium` and a running server.
//
//   BASE_URL=http://localhost:4321 npm run perf -- --profile slow --runs 5 --json
//   BASE_URL=https://... PERF_EMAIL=... PERF_PASSWORD=... npm run perf
//
// One run = new browser context (empty HTTP cache) -> sign in through the form (not throttled) -> throttling on ->
// open /szukaj. Measured: time until the list is ready, then typing `ibu 400` while the list still loads and again
// after it is ready (longest interaction and longest task). Exit codes: 0 done, 1 measurement failed, 2 usage error.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";

// Throttling presets of the Chrome DevTools network panel (Chromium front end, NetworkManager "Slow 4G" / "Fast 4G"):
// throughput = nominal rate * 0.9 in bytes per second, latency = nominal RTT * 3.75 in ms.
const NETWORK = {
  fast: {
    latency: 60 * 3.75,
    downloadThroughput: ((9 * 1000 * 1000) / 8) * 0.9,
    uploadThroughput: ((1.5 * 1000 * 1000) / 8) * 0.9,
  },
  slow: {
    latency: 150 * 3.75,
    downloadThroughput: ((1.6 * 1000 * 1000) / 8) * 0.9,
    uploadThroughput: ((750 * 1000) / 8) * 0.9,
  },
};
const PROFILES = {
  fast: { label: "Fast 4G + CPU 4x", network: NETWORK.fast, cpuRate: 4 },
  slow: { label: "Slow 4G + CPU 6x", network: NETWORK.slow, cpuRate: 6 },
};
// Targets from the S-09 plan (median of the runs). Typing targets exist for the slow profile only.
const TARGETS = {
  fast: { listReadyMs: { max: 3000, strict: true } },
  slow: {
    listReadyMs: { max: 5000, strict: false },
    interactionMs: { max: 200, strict: true },
    // "No task longer than 200 ms" is judged on the worst run, not on the median.
    taskMs: { max: 200, strict: false, worst: true },
  },
};

const LOADING_TEXT = "Wczytywanie listy leków…";
const READY_MARK = "mamlek:search-list-ready";
const QUERY = "ibu 400";
const KEY_DELAY_MS = 150;
const SETTLE_MS = 500;
const READY_TIMEOUT_MS = 120_000;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const INPUT = 'input[role="combobox"]';
const OUT_DIR = fileURLToPath(new URL("../.perf/", import.meta.url));

class UsageError extends Error {}
class MeasurementError extends Error {}

function parseArgs(argv) {
  const options = { profile: "both", runs: 5, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--profile") {
      options.profile = argv[++i];
      if (!["fast", "slow", "both"].includes(options.profile)) {
        throw new UsageError("--profile needs fast, slow or both");
      }
    } else if (arg === "--runs") {
      options.runs = Number(argv[++i]);
      if (!Number.isInteger(options.runs) || options.runs < 1) throw new UsageError("--runs needs a positive integer");
    } else throw new UsageError(`Unknown argument: ${arg}`);
  }
  return options;
}

function parseBaseUrl() {
  let url;
  try {
    url = new URL(process.env.BASE_URL ?? "http://localhost:4321");
  } catch {
    throw new UsageError("BASE_URL is not a valid URL");
  }
  return { baseUrl: url.origin, local: LOCAL_HOSTS.has(url.hostname) };
}

function median(values) {
  const sorted = values.filter((value) => value !== null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function maximum(values) {
  const present = values.filter((value) => value !== null);
  return present.length ? Math.max(...present) : null;
}

// Local test account, like scripts/smoke.mjs (sign-up without email confirmation: local Supabase only).
async function signUpTestAccount(baseUrl) {
  const email = `perf-${Date.now()}@example.com`;
  const password = "Perf-Test-Passw0rd!";
  const response = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    redirect: "manual",
    headers: { Origin: baseUrl, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email, password }).toString(),
  });
  const location = response.headers.get("location") ?? "";
  if (response.status !== 302 || !location.startsWith("/auth/confirm-email")) {
    throw new MeasurementError(`Could not create the test account: sign-up answered ${response.status} ${location}`);
  }
  return { email, password };
}

// Page-side recorder, installed before any page script runs. Collects long tasks and event timings (with
// timestamps relative to the navigation start, like performance.now()) and the moment the loading text disappears
// (the fallback for "list ready" when the page does not set the performance mark yet).
function installRecorder({ loadingText }) {
  const state = { textSeen: false, textGoneAt: null, longTasks: [], events: [] };
  globalThis.__perf = state;
  const hasLoadingText = () => (globalThis.document.body?.textContent ?? "").includes(loadingText);
  const check = () => {
    if (!state.textSeen) {
      state.textSeen = hasLoadingText();
    } else if (state.textGoneAt === null && !hasLoadingText()) {
      state.textGoneAt = globalThis.performance.now();
    }
  };
  new globalThis.MutationObserver(check).observe(globalThis.document, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  const observe = (options, handle) => {
    try {
      new globalThis.PerformanceObserver((list) => {
        list.getEntries().forEach(handle);
      }).observe(options);
    } catch {
      // The entry type is not supported by this browser: the metric stays empty.
    }
  };
  observe({ type: "longtask", buffered: true }, (entry) => {
    state.longTasks.push({ start: entry.startTime, duration: entry.duration });
  });
  observe({ type: "event", durationThreshold: 16, buffered: true }, (entry) => {
    state.events.push({
      name: entry.name,
      start: entry.startTime,
      duration: entry.duration,
      interactionId: entry.interactionId,
    });
  });
}

// Resolves to the "list ready" moment in ms since the navigation start: the performance mark when the page sets it,
// otherwise the moment the loading text disappeared. `failed` is set when the page shows an error instead of a list.
// `buildMs` is the worker's own decode + parse + index time carried by the mark (null without it).
function readReadiness({ mark, errorTexts }) {
  const entry = globalThis.performance.getEntriesByName(mark)[0];
  const state = globalThis.__perf;
  const text = globalThis.document.body?.textContent ?? "";
  if (entry) {
    const buildMs = typeof entry.detail?.buildMs === "number" ? entry.detail.buildMs : null;
    return { at: entry.startTime, source: "mark", failed: false, buildMs };
  }
  if (state.textGoneAt !== null) {
    return {
      at: state.textGoneAt,
      source: "text",
      failed: errorTexts.some((error) => text.includes(error)),
      buildMs: null,
    };
  }
  return null;
}

// Sets the CPU rate in dedicated workers too: a worker is a separate CDP target and Emulation.setCPUThrottlingRate on
// the page session does not reach it. Workers are attached through the page session with auto-attach (paused at start,
// so no worker code runs unthrottled) and driven with Target.sendMessageToTarget, because Playwright's CDPSession
// cannot address flattened child sessions.
async function enableWorkerThrottling(cdp, cpuRate) {
  const state = { seen: 0, throttled: 0, problems: [] };
  let nextId = 1;
  const pending = new Map();
  const send = async (sessionId, method, params = {}) => {
    const id = nextId++;
    pending.set(`${sessionId}:${id}`, method);
    await cdp.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method, params }) });
  };
  cdp.on("Target.receivedMessageFromTarget", ({ sessionId, message }) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    const key = `${sessionId}:${data.id}`;
    const method = pending.get(key);
    if (method === undefined) return;
    pending.delete(key);
    if (method !== "Emulation.setCPUThrottlingRate") return;
    if (data.error) state.problems.push(data.error.message);
    else state.throttled++;
  });
  cdp.on("Target.attachedToTarget", async ({ sessionId, targetInfo, waitingForDebugger }) => {
    try {
      if (targetInfo.type === "worker") {
        state.seen++;
        await send(sessionId, "Emulation.setCPUThrottlingRate", { rate: cpuRate });
      }
    } catch (error) {
      state.problems.push(error instanceof Error ? error.message : String(error));
    } finally {
      if (waitingForDebugger) {
        await send(sessionId, "Runtime.runIfWaitingForDebugger").catch(() => undefined);
      }
    }
  });
  try {
    await cdp.send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: false });
  } catch (error) {
    state.problems.push(`auto-attach failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return state;
}

async function signIn(page, baseUrl, { email, password }) {
  await page.goto(`${baseUrl}/auth/signin`);
  // The form is a React island; wait for hydration so the typed values are not reset by it.
  await page.waitForSelector("astro-island:has(#email):not([ssr])", { state: "attached" });
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/auth/"), { timeout: 30_000 });
  } catch {
    throw new MeasurementError(`Sign-in failed (still on ${page.url()})`);
  }
}

// Longest interaction and longest task that overlap the [from, to] window (ms since navigation start).
async function typingMetrics(page, from, to) {
  const { longTasks, events } = await page.evaluate(() => globalThis.__perf);
  const overlaps = (item) => item.start <= to && item.start + item.duration >= from;
  const tasks = longTasks.filter(overlaps).map((task) => task.duration);
  // Only events that belong to an interaction (keydown/keyup/input of a key press), like INP.
  const interactions = events
    .filter((event) => event.interactionId > 0 && overlaps(event))
    .map((event) => event.duration);
  return { interactionMs: maximum(interactions) ?? 0, taskMs: maximum(tasks) ?? 0 };
}

async function type(page) {
  const from = await page.evaluate(() => globalThis.performance.now());
  await page.locator(INPUT).pressSequentially(QUERY, { delay: KEY_DELAY_MS });
  const to = await page.evaluate(() => globalThis.performance.now());
  await sleep(SETTLE_MS);
  return { from, to };
}

async function measureRun(browser, { baseUrl, credentials, profile }) {
  const context = await browser.newContext({ viewport: { width: 412, height: 915 } });
  try {
    await context.addInitScript(installRecorder, { loadingText: LOADING_TEXT });
    const page = await context.newPage();
    await signIn(page, baseUrl, credentials);

    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: false, ...profile.network });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuRate });
    const workers = await enableWorkerThrottling(cdp, profile.cpuRate);

    await page.goto(`${baseUrl}/szukaj`, { waitUntil: "commit" });
    // Type as soon as the field reacts (its island is hydrated), i.e. while the list is still loading.
    await page.waitForSelector(`astro-island:has(${INPUT}):not([ssr])`, {
      state: "attached",
      timeout: READY_TIMEOUT_MS,
    });
    const readyAtStart = await page.evaluate(readReadiness, { mark: READY_MARK, errorTexts: [] });
    const earlyWindow = await type(page);
    const early = readyAtStart ? null : await typingMetrics(page, earlyWindow.from, earlyWindow.to);

    const errorTexts = ["Nie udało się wczytać listy leków", "Sesja wygasła"];
    await page.waitForFunction(
      readReadiness,
      { mark: READY_MARK, errorTexts },
      { timeout: READY_TIMEOUT_MS, polling: 250 },
    );
    const readiness = await page.evaluate(readReadiness, { mark: READY_MARK, errorTexts });
    if (readiness.failed) {
      throw new MeasurementError(
        "The page showed an error instead of the list (on a local `astro preview` this is a truncated download: serve the build with `wrangler dev` instead, see AGENTS.md)",
      );
    }

    await page.fill(INPUT, "");
    await sleep(SETTLE_MS);
    const readyWindow = await type(page);
    const ready = await typingMetrics(page, readyWindow.from, readyWindow.to);

    const workerCount = page.workers().length;
    let workerThrottling = "n/a";
    if (workerCount > 0) {
      workerThrottling = workers.throttled > 0 && workers.problems.length === 0 ? "ok" : "failed";
    }
    // Without worker throttling the build ran at full speed: add the time it would take at the profile's CPU rate.
    let workerEstimateMs = null;
    if (readiness.buildMs !== null) {
      workerEstimateMs =
        workerThrottling === "failed" ? readiness.at + readiness.buildMs * (profile.cpuRate - 1) : readiness.at;
    }
    return {
      listReadyMs: readiness.at,
      listReadySource: readiness.source,
      workerBuildMs: readiness.buildMs,
      workerEstimateMs,
      early,
      ready,
      workerThrottling,
      workerProblems: workers.problems,
    };
  } finally {
    await context.close();
  }
}

function formatMs(value) {
  return value === null ? "-" : String(Math.round(value));
}

function printProfile(name, runs, profileRuns) {
  const profile = PROFILES[name];
  const targets = TARGETS[name];
  const earlyRuns = profileRuns.filter((run) => run.early);
  const rows = [
    ["list ready (ms)", profileRuns.map((run) => run.listReadyMs), targets.listReadyMs],
    ["early typing: longest interaction (ms)", earlyRuns.map((run) => run.early.interactionMs), targets.interactionMs],
    ["early typing: longest task (ms)", earlyRuns.map((run) => run.early.taskMs), targets.taskMs],
    [
      "ready typing: longest interaction (ms)",
      profileRuns.map((run) => run.ready.interactionMs),
      targets.interactionMs,
    ],
    ["ready typing: longest task (ms)", profileRuns.map((run) => run.ready.taskMs), targets.taskMs],
  ];
  const estimateRuns = profileRuns.filter((run) => run.workerEstimateMs !== null && run.workerEstimateMs !== undefined);
  if (estimateRuns.length > 0) {
    rows.splice(
      1,
      0,
      ["worker build, unthrottled (ms)", estimateRuns.map((run) => run.workerBuildMs), null],
      ["list ready, est. throttled worker (ms)", estimateRuns.map((run) => run.workerEstimateMs), targets.listReadyMs],
    );
  }
  console.log(`\n${name}: ${profile.label}, ${profileRuns.length}/${runs} runs`);
  console.log(`${"metric".padEnd(42)}${"median".padStart(8)}${"max".padStart(8)}  target`);
  for (const [label, values, target] of rows) {
    const med = median(values);
    const max = maximum(values);
    let verdict = "";
    if (target && med !== null) {
      const judged = target.worst ? max : med;
      const ok = target.strict ? judged < target.max : judged <= target.max;
      const what = target.worst ? "max" : "median";
      verdict = `${target.strict ? "<" : "<="} ${target.max}  ${ok ? "✓" : "✗"} (${what})`;
    }
    console.log(`${label.padEnd(42)}${formatMs(med).padStart(8)}${formatMs(max).padStart(8)}  ${verdict}`);
  }
  const sources = [...new Set(profileRuns.map((run) => run.listReadySource))].join(", ");
  console.log(`list ready measured from: ${sources === "mark" ? `performance mark ${READY_MARK}` : sources}`);
  if (earlyRuns.length < profileRuns.length) {
    console.log(
      `early typing skipped in ${profileRuns.length - earlyRuns.length} run(s): the list was ready before typing`,
    );
  }
  const failedWorker = profileRuns.filter((run) => run.workerThrottling === "failed");
  if (failedWorker.length > 0) {
    const reasons = [...new Set(failedWorker.flatMap((run) => run.workerProblems))].join("; ");
    console.log(
      `WARNING: CPU throttling could not be applied to the search worker in ${failedWorker.length} run(s)` +
        `${reasons ? ` (${reasons})` : ""}: the time spent in the worker is under-reported (see the estimate row)`,
    );
  }
}

async function saveJson(baseUrl, entry) {
  await mkdir(OUT_DIR, { recursive: true });
  const file = `${OUT_DIR}perf-${new Date().toISOString().slice(0, 10)}.json`;
  let existing = [];
  try {
    existing = JSON.parse(await readFile(file, "utf8"));
  } catch {
    // New file for today.
  }
  await writeFile(file, `${JSON.stringify([...existing, { baseUrl, ...entry }], null, 2)}\n`);
  console.log(`\nRaw results appended to ${file}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { baseUrl, local } = parseBaseUrl();
  const email = process.env.PERF_EMAIL;
  const password = process.env.PERF_PASSWORD;
  if (Boolean(email) !== Boolean(password)) {
    throw new UsageError("Set both PERF_EMAIL and PERF_PASSWORD, or neither");
  }
  if (!email && !local) {
    throw new UsageError(`${baseUrl} is not a local server: set PERF_EMAIL and PERF_PASSWORD of an existing account`);
  }

  const names = options.profile === "both" ? ["fast", "slow"] : [options.profile];
  const credentials = email ? { email, password } : await signUpTestAccount(baseUrl);

  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new MeasurementError(`Could not start Chromium (run "npx playwright install chromium" once): ${reason}`);
  }
  const results = {};
  try {
    for (const name of names) {
      results[name] = [];
      for (let run = 1; run <= options.runs; run++) {
        const result = await measureRun(browser, { baseUrl, credentials, profile: PROFILES[name] });
        results[name].push(result);
        console.log(`${name} run ${run}/${options.runs}: list ready ${formatMs(result.listReadyMs)} ms`);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${baseUrl}  (median and max of ${options.runs} run(s))`);
  for (const name of names) {
    printProfile(name, options.runs, results[name]);
  }
  if (options.json) {
    await saveJson(baseUrl, { at: new Date().toISOString(), runs: options.runs, results });
  }
}

try {
  await main();
} catch (error) {
  console.error(`Perf measurement failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error instanceof UsageError ? 2 : 1);
}
