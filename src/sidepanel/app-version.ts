import packageJson from "../../package.json";

const viteAppVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : packageJson.version;

export function getAppVersion(): string {
  const chromeApi = (globalThis as { chrome?: { runtime?: { getManifest?: () => { version?: string } } } }).chrome;
  return chromeApi?.runtime?.getManifest?.().version ?? viteAppVersion;
}
