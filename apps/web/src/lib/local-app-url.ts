/** Keep local session cookies and CORS on the launcher's canonical hostname. */
export function localAppUrl(
  current: string,
  api: string,
  development: boolean,
): string | undefined {
  if (!development) return;
  try {
    const page = new URL(current);
    const server = new URL(api);
    if (
      page.protocol === "http:" &&
      page.hostname === "127.0.0.1" &&
      server.protocol === "http:" &&
      server.hostname === "localhost"
    ) {
      page.hostname = "localhost";
      return page.href;
    }
  } catch {
    /* Invalid configuration is handled by the connection screen. */
  }
}
