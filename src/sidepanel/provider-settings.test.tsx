import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { clearDebugLogs, recordDebugLog } from "./debug-log";
import { ProviderSettingsView } from "./views/ProviderSettingsView";

describe("ProviderSettingsView", () => {
  beforeEach(() => clearDebugLogs());
  afterEach(() => { vi.restoreAllMocks(); });
  it("renders four independent API key and model controls", () => {
    render(<ProviderSettingsView />);
    expect(screen.getByText("服務商設定")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "選擇 API 服務商" })).toBeTruthy();
    expect(screen.getByLabelText("Gemini API 金鑰")).toBeTruthy();
    expect(screen.queryByLabelText("OpenAI API 金鑰")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Groq API 金鑰")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("OpenRouter API 金鑰")).not.toBeInTheDocument();
    expect(screen.getByText("內容階段模型路由")).toBeTruthy();
    expect(screen.getByRole("button", { name: "取得模型列表" })).toBeTruthy();
    expect(screen.getByText("溫度（控制 AI 隨機性的參數）")).toBeTruthy();
    const settingsRow = screen.getByLabelText("Gemini API 金鑰").closest(".provider-setting-row");
    expect(settingsRow).toBeTruthy();
    expect(settingsRow?.children).toHaveLength(3);
    expect(settingsRow?.children[0]).toHaveClass("provider-api-field");
    expect(settingsRow?.children[1]).toHaveClass("provider-model-field");
    expect(settingsRow?.children[2]).toHaveClass("provider-temperature-field");
  });

  it("switches providers without losing each provider's saved fields", async () => {
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        storage: { local: { get: async () => ({ flowProviderSettings: { apiKeys: { gemini: "gemini-key", openai: "openai-key", groq: "groq-key", openrouter: "openrouter-key" }, models: { gemini: "gemini-model", openai: "openai-model", groq: "groq-model", openrouter: "openrouter-model" }, temperatures: { gemini: 0.1, openai: 0.2, groq: 0.3, openrouter: 0.4 } } }) } }
      }
    });

    try {
      render(<ProviderSettingsView />);
      await waitFor(() => expect((screen.getByLabelText("Gemini API 金鑰") as HTMLInputElement).value).toBe("gemini-key"));
      fireEvent.change(screen.getByRole("combobox", { name: "選擇 API 服務商" }), { target: { value: "openai" } });
      expect((screen.getByLabelText("OpenAI API 金鑰") as HTMLInputElement).value).toBe("openai-key");
      expect((screen.getByLabelText("OpenAI 模型（模型名稱）") as HTMLInputElement).value).toBe("openai-model");
      expect(screen.getByText("0.2")).toBeInTheDocument();
      expect(screen.queryByLabelText("Gemini API 金鑰")).not.toBeInTheDocument();
    } finally {
      delete (globalThis as any).chrome;
    }
  });

  it("loads every returned model into the provider select and applies the selected model", async () => {
    const models = Array.from({ length: 25 }, (_, index) => ({ id: `gemini-test-${index + 1}`, label: `Gemini Test ${index + 1}` }));
    Object.defineProperty(globalThis, "chrome", {
      configurable: true,
      value: {
        storage: { local: { get: async () => ({}) } },
        runtime: { sendMessage: (_message: unknown, callback: (response: unknown) => void) => callback({ ok: true, models }) }
      }
    });

    try {
      render(<ProviderSettingsView />);
      fireEvent.change(screen.getByLabelText("Gemini API 金鑰"), { target: { value: "test-gemini-key" } });
      fireEvent.click(screen.getAllByRole("button", { name: "取得模型列表" })[0]);
      expect(await screen.findByRole("option", { name: /Gemini Test 25/ })).toBeInTheDocument();
      const modelSelect = screen.getByLabelText("Gemini 模型（模型名稱）") as HTMLSelectElement;
      expect(modelSelect.options).toHaveLength(26);
      fireEvent.change(modelSelect, { target: { value: "gemini-test-25" } });
      expect(modelSelect.value).toBe("gemini-test-25");
      expect(screen.getByText("已套用 Gemini 模型：gemini-test-25")).toBeInTheDocument();
    } finally {
      delete (globalThis as any).chrome;
    }
  });

  it("expands logs and exposes copy, clear, and download actions", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const createObjectURL = vi.fn(() => "blob:debug");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    recordDebugLog("error", "script", "測試錯誤紀錄", { safe: "value" });

    render(<ProviderSettingsView />);
    fireEvent.click(screen.getByText("錯誤／除錯日誌紀錄（1 筆）"));
    expect(screen.getByText("測試錯誤紀錄")).toBeInTheDocument();
    expect(screen.getByText(/UTC\+8/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "複製" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "清除" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下載" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "複製" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "下載" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "清除" }));
    expect(screen.getByText("錯誤／除錯日誌紀錄（0 筆）")).toBeInTheDocument();
    expect(screen.queryByText("測試錯誤紀錄")).not.toBeInTheDocument();
  });
});
