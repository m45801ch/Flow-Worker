import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProviderSettingsView } from "./views/ProviderSettingsView";

describe("ProviderSettingsView", () => {
  it("renders four independent API key and model controls", () => {
    render(<ProviderSettingsView />);
    expect(screen.getByText("PROVIDER API KEYS")).toBeTruthy();
    expect(screen.getByLabelText("Gemini API Key")).toBeTruthy();
    expect(screen.getByLabelText("OpenAI API Key")).toBeTruthy();
    expect(screen.getByLabelText("Groq API Key")).toBeTruthy();
    expect(screen.getByLabelText("OpenRouter API Key")).toBeTruthy();
    expect(screen.getByText("STAGE MODEL ROUTING")).toBeTruthy();
  });

  it("shows models beyond the previous 20-item display cap", async () => {
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
      fireEvent.change(screen.getByLabelText("Gemini API Key"), { target: { value: "test-gemini-key" } });
      fireEvent.click(screen.getByRole("button", { name: "取得該 Provider 模型列表" }));
      expect(await screen.findByText("Gemini Test 25")).toBeInTheDocument();
    } finally {
      delete (globalThis as any).chrome;
    }
  });
});
