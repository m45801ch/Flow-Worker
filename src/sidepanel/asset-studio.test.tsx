import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AssetStudioView } from "./views/AssetStudioView";
import { builtInImageModels } from "../flow/image-models";

const character = {
  id: "C01",
  name: "林相如",
  persona: { role: "使者" },
  relationships: [],
  evidence: [],
  image: {
    prompt: "Cinematic portrait of Lin Xiangru, an observant envoy with composed eyes, long dark hair, layered historical robes, warm rim lighting, shallow depth of field, detailed facial features, cinematic composition, high resolution.",
    sheetPrompt: "16:9 horizontal character sheet with front, side, back and costume detail views, same face, same hair, same proportions.",
    negativePrompt: "text, watermark",
  },
  voice: { prompt: "calm" },
};

describe("Asset Studio image models", () => {
  it("lists the three built-in banana models and sends the selected plain name to the Flow job", async () => {
    const onQueue = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<AssetStudioView cast={{ characters: [character] }} projectId="project-1" sourceDocumentVersion={2} imageModel="Nano Banana 2" onQueue={onQueue} />);
    const modelSelect = screen.getByLabelText("圖片模型") as HTMLSelectElement;
    expect(Array.from(modelSelect.options).map((option) => option.textContent)).toEqual(builtInImageModels.map((model) => model.label));
    fireEvent.change(modelSelect, { target: { value: "Nano Banana Pro" } });
    fireEvent.click(screen.getByRole("button", { name: /在 Flow 生成三視圖/ }));
    expect(onQueue).toHaveBeenCalledWith([expect.objectContaining({ outputMode: "image", modelName: "Nano Banana Pro" })]);
    expect(await screen.findByText("已送出 Flow 佇列")).toBeInTheDocument();
    expect(container.querySelector(".import-notice")).toHaveTextContent("已成功送入 Flow 佇列：林相如 · Nano Banana Pro · 16:9 · 1 張");
    expect(screen.getByText("已送出 Flow 佇列")).toBeInTheDocument();
    expect(screen.getByText("已送出資訊（1）")).toBeInTheDocument();
    expect(container.querySelector(".submission-entry strong")).toHaveTextContent(/林相如 · Nano Banana Pro · 16:9 · 1 張/);
  });

  it("shows a failure message when saving the Flow queue task fails", async () => {
    const onQueue = vi.fn().mockRejectedValue(new Error("儲存任務失敗"));
    const { container } = render(<AssetStudioView cast={{ characters: [character] }} projectId="project-1" sourceDocumentVersion={2} imageModel="Nano Banana 2" onQueue={onQueue} />);
    fireEvent.click(screen.getByRole("button", { name: /在 Flow 生成三視圖/ }));
    expect(await screen.findByText("送入 Flow 佇列失敗：儲存任務失敗")).toBeInTheDocument();
    expect(screen.getByText("送入 Flow 佇列失敗：儲存任務失敗")).toHaveClass("generation-error");
    expect(container.querySelector(".action-result.error")).toHaveTextContent("失敗：儲存任務失敗");
  });
});


  it("keeps every submitted asset task in the upper submission list", async () => {
    const onQueue = vi.fn().mockResolvedValue(undefined);
    const secondCharacter = { ...character, id: "C02", name: "趙王" };
    const { container } = render(<AssetStudioView cast={{ characters: [character, secondCharacter] }} projectId="project-1" sourceDocumentVersion={2} imageModel="Nano Banana 2" onQueue={onQueue} />);
    const buttons = screen.getAllByRole("button", { name: /在 Flow 生成三視圖/ });
    fireEvent.click(buttons[0]);
    expect(await screen.findByText("已送出資訊（1）")).toBeInTheDocument();
    fireEvent.click(buttons[1]);
    expect(await screen.findByText("已送出資訊（2）")).toBeInTheDocument();
    expect(container.querySelectorAll(".submission-entry strong")[1]).toHaveTextContent(/林相如 · Nano Banana 2/);
    expect(container.querySelectorAll(".submission-entry strong")[0]).toHaveTextContent(/趙王 · Nano Banana 2/);
  });
