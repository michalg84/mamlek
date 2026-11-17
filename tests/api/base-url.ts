// Which server the API tests call. Vitest sets BASE_URL to "/" (Vite's base path) in every worker, so a BASE_URL given
// on the command line never arrives: the caller's choice travels in API_BASE_URL. An absolute BASE_URL is still
// accepted as a fallback, a relative one (Vitest's own) is ignored.
const DEFAULT_BASE_URL = "http://localhost:4321";

export function resolveBaseUrl(env: Record<string, string | undefined>): string {
  const chosen = [env.API_BASE_URL, env.BASE_URL].find((value) => value?.startsWith("http"));
  return (chosen ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}
