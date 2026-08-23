import { describe, expect, it } from "vitest";
import { aspectRatioOptions, genreOptions, visualStyleOptions } from "./options";

describe("project dropdown options", () => {
  it("starts both lists with custom and provides about fifteen choices", () => {
    expect(genreOptions[0]).toBe("自訂");
    expect(visualStyleOptions[0]).toBe("自訂");
    expect(genreOptions.length).toBe(15);
    expect(visualStyleOptions.length).toBe(15);
    expect(aspectRatioOptions).toEqual(["16:9", "9:16"]);
  });
});
