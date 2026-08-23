import { createProvider, listModels } from "../providers";

declare const chrome: any;

const enableActionToOpenPanel = () => chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
chrome.runtime?.onInstalled?.addListener(() => { void enableActionToOpenPanel(); });
void enableActionToOpenPanel();

chrome.runtime?.onMessage?.addListener((message: any, _sender: unknown, sendResponse: (response: unknown) => void) => {
  if (message?.type !== "GENERATE_TEXT" && message?.type !== "LIST_MODELS") return false;
  (async () => {
    try {
      const settings = await chrome.storage.local.get(["provider", "apiKey", "model", "temperature"]);
      const apiKey = message.apiKey ?? settings.apiKey; const providerName = message.provider ?? settings.provider ?? "gemini";
      if (!apiKey) throw new Error("請先在設定頁輸入 API Key");
      if (message.type === "LIST_MODELS") { sendResponse({ ok: true, models: await listModels(providerName, apiKey) }); return; }
      const provider = createProvider(providerName, { apiKey, model: settings.model, temperature: settings.temperature ?? 0.7 });
      sendResponse({ ok: true, result: await provider.generateText(message.input) });
    } catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : "Provider request failed" }); }
  })();
  return true;
});
