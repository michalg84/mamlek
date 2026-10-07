// UI state screenshots: drives the real /szukaj into each state of the 10x-ui state matrix at desktop and phone width,
// as the visual gate and review evidence of a UI change. Needs a one-time `npx playwright install chromium`, a running
// local server and the registry imported (the list must be non-empty, see `npm run registry:import` in AGENTS.md).
//
//   BASE_URL=http://localhost:4321 npm run ui:shots -- --label before
//
// Output: .ui-shots/<label>/<state>-<width>.png. Signs up a throwaway account (local hosts only, email confirmation
// off, like `perf-search.mjs`) and signs in once; every state then runs in a new browser context (empty HTTP cache)
// that reuses the session cookies. Page-level server states (the registry not imported, the list query failing) cannot
// be forced from the browser: check them by hand. Exit codes: 0 done, 1 a state could not be reached, 2 usage error.

import { mkdir } from "node:fs/promises";
import { URL, fileURLToPath } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright";
import { signIn, signUpTestAccount } from "./lib/test-account.mjs";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const INPUT = 'input[role="combobox"]';
const OPTION = '[role="option"]';
const LIST_URL = "**/api/registry/search-list*";
const READY_MARK = "mamlek:search-list-ready";
const LOADING_TEXT = "Wczytywanie listy leków…";
const WIDTHS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];
const STATE_TIMEOUT_MS = 30_000;
const SETTLE_MS = 400;
const OUT_DIR = fileURLToPath(new URL("../.ui-shots/", import.meta.url));

class UsageError extends Error {}
class StateError extends Error {}

function parseArgs(argv) {
  const options = { label: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--label") {
      options.label = argv[++i];
      if (!options.label || !/^[\w.-]+$/.test(options.label) || /^\.+$/.test(options.label)) {
        throw new UsageError("--label needs a name made of letters, digits, `.`, `_` or `-`");
      }
    } else throw new UsageError(`Unknown argument: ${arg}`);
  }
  if (!options.label) throw new UsageError("Usage: npm run ui:shots -- --label <name>");
  return options;
}

function parseBaseUrl() {
  let url;
  try {
    url = new URL(process.env.BASE_URL ?? "http://localhost:4321");
  } catch {
    throw new UsageError("BASE_URL is not a valid URL");
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new UsageError(`${url.origin} is not a local server: the script signs up a throwaway account`);
  }
  return url.origin;
}

// Opens /szukaj and waits until the search field is interactive (its island is hydrated).
async function openSearch(page, baseUrl) {
  await page.goto(`${baseUrl}/szukaj`);
  await page.waitForSelector(`astro-island:has(${INPUT}):not([ssr])`, {
    state: "attached",
    timeout: STATE_TIMEOUT_MS,
  });
}

async function openReady(page, baseUrl) {
  await openSearch(page, baseUrl);
  await page.waitForFunction((mark) => globalThis.performance.getEntriesByName(mark).length > 0, READY_MARK, {
    timeout: STATE_TIMEOUT_MS,
  });
}

// Presses Tab until `isTarget` accepts the focused element; returns the focused element's description.
async function tabTo(page, isTarget, what) {
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = globalThis.document.activeElement;
      return { tag: el?.tagName ?? "", role: el?.getAttribute("role") ?? "", inMain: Boolean(el?.closest("main")) };
    });
    if (isTarget(info)) return;
  }
  throw new StateError(`Tab never reached ${what}`);
}

async function typeQuery(page, text) {
  await page.locator(INPUT).pressSequentially(text, { delay: 40 });
}

async function openSuggestions(page, baseUrl) {
  await openReady(page, baseUrl);
  await typeQuery(page, "ibu");
  await page.locator(OPTION).first().waitFor({ timeout: STATE_TIMEOUT_MS });
}

// Each state: `route` runs on the new context before any navigation, `reach` drives the page into the state.
const STATES = [
  {
    name: "default",
    reach: async (page, baseUrl) => {
      await openReady(page, baseUrl);
    },
  },
  {
    name: "focus-input",
    reach: async (page, baseUrl) => {
      await openReady(page, baseUrl);
      await tabTo(page, (info) => info.role === "combobox", "the search field");
    },
  },
  {
    name: "focus-topbar",
    reach: async (page, baseUrl) => {
      await openReady(page, baseUrl);
      await tabTo(page, (info) => !info.inMain && (info.tag === "A" || info.tag === "BUTTON"), "a Topbar control");
    },
  },
  {
    name: "hint-short",
    reach: async (page, baseUrl) => {
      await openReady(page, baseUrl);
      await typeQuery(page, "ib");
      await page.getByText("Wpisz co najmniej").first().waitFor({ timeout: STATE_TIMEOUT_MS });
    },
  },
  {
    name: "suggestions",
    reach: async (page, baseUrl) => {
      await openSuggestions(page, baseUrl);
      await page.keyboard.press("ArrowDown");
      await page.locator(`${OPTION}[aria-selected="true"]`).waitFor({ timeout: STATE_TIMEOUT_MS });
    },
  },
  {
    name: "hover-option",
    reach: async (page, baseUrl) => {
      await openSuggestions(page, baseUrl);
      if ((await page.locator(OPTION).count()) < 2) throw new StateError("Fewer than two options to hover");
      await page.locator(OPTION).nth(1).hover();
    },
  },
  {
    name: "no-match",
    reach: async (page, baseUrl) => {
      await openReady(page, baseUrl);
      await typeQuery(page, "xqzw");
      await page.getByText("Brak leku o takiej nazwie").waitFor({ timeout: STATE_TIMEOUT_MS });
    },
  },
  {
    name: "result",
    reach: async (page, baseUrl) => {
      await openSuggestions(page, baseUrl);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await page.locator('[aria-label="Wybrany lek"]').waitFor({ timeout: STATE_TIMEOUT_MS });
    },
  },
  {
    name: "loading",
    // The request is never answered, so the page stays in the loading state.
    route: async (context) => {
      await context.route(LIST_URL, () => undefined);
    },
    reach: async (page, baseUrl) => {
      await openSearch(page, baseUrl);
      await page.getByText(LOADING_TEXT).waitFor({ timeout: STATE_TIMEOUT_MS });
    },
  },
  {
    name: "error",
    route: async (context) => {
      await context.route(LIST_URL, (route) => route.abort());
    },
    reach: async (page, baseUrl) => {
      await openSearch(page, baseUrl);
      await page.getByText("Nie udało się wczytać listy leków").first().waitFor({ timeout: STATE_TIMEOUT_MS });
    },
  },
  {
    name: "unauthorized",
    route: async (context) => {
      await context.route(LIST_URL, (route) => route.fulfill({ status: 401, body: "" }));
    },
    reach: async (page, baseUrl) => {
      await openSearch(page, baseUrl);
      await page.getByText("Sesja wygasła").first().waitFor({ timeout: STATE_TIMEOUT_MS });
    },
  },
];

async function shoot(browser, { baseUrl, storageState, state, viewport, file }) {
  const context = await browser.newContext({ viewport, storageState });
  try {
    await state.route?.(context);
    const page = await context.newPage();
    await state.reach(page, baseUrl);
    await sleep(SETTLE_MS);
    await page.screenshot({ path: file });
  } finally {
    await context.close();
  }
}

async function main() {
  const { label } = parseArgs(process.argv.slice(2));
  const baseUrl = parseBaseUrl();
  const outDir = `${OUT_DIR}${label}/`;
  await mkdir(outDir, { recursive: true });

  const credentials = await signUpTestAccount(baseUrl, "shots");

  let browser;
  try {
    browser = await chromium.launch();
  } catch (error) {
    const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
    throw new StateError(`Could not start Chromium (run "npx playwright install chromium" once): ${reason}`);
  }

  const failures = [];
  try {
    const loginContext = await browser.newContext();
    let storageState;
    try {
      await signIn(await loginContext.newPage(), baseUrl, credentials);
      storageState = await loginContext.storageState();
    } finally {
      await loginContext.close();
    }

    for (const state of STATES) {
      for (const viewport of WIDTHS) {
        const name = `${state.name}-${viewport.width}`;
        try {
          await shoot(browser, { baseUrl, storageState, state, viewport, file: `${outDir}${name}.png` });
          console.log(`ok    ${name}`);
        } catch (error) {
          const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
          failures.push(name);
          console.log(`FAIL  ${name}: ${reason}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  const total = STATES.length * WIDTHS.length;
  console.log(`\n${total - failures.length}/${total} screenshots in ${outDir}`);
  if (failures.length > 0) throw new StateError(`Could not reach: ${failures.join(", ")}`);
}

try {
  await main();
} catch (error) {
  console.error(`ui:shots failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(error instanceof UsageError ? 2 : 1);
}
