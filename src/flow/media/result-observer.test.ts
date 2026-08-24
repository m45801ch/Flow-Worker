import { describe, expect, it } from "vitest";
import { captureMediaBaseline, findNewMedia } from "./result-observer";

describe("Flow result observer", () => {
  it("only returns media absent from the pre-submit baseline", () => {
    document.body.innerHTML = '<video data-flow-media="old" src="old.mp4"></video><img data-flow-media="new" src="new.png">';
    const baseline = captureMediaBaseline(document);
    const added = document.createElement("video");
    added.dataset.flowMedia = "latest";
    added.src = "latest.mp4";
    document.body.appendChild(added);
    expect(findNewMedia(document, baseline).map((item) => item.dataset.flowMedia)).toEqual(["latest"]);
  });
});
