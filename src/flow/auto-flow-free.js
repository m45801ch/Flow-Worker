// ============================================================
// Flow Automation — Content Script (injected into Google Flow)
// Fills prompts, selects options, submits jobs and tracks
// progress inside labs.google/fx/tools/flow
// ============================================================

(() => {
  if (window.__flowCompanionAutoFlowInjected) return;
  window.__flowCompanionAutoFlowInjected = true;

  const LOG_PREFIX = "[FlowCompanionAutoFlow]";
  let config = null;
  let queue = [];
  let stopped = false;
  let chainLastFrame = null;
  let resumeFrameFile = null;
  let prevSegmentFrame = null;
  const chainRetriedCount = {};
  let flowCurrentMode = null; // "video" | "image": cached mode detection
  let prevImage = null; // 上一段生成的圖片（File）供「延用」使用（img2img 保持風格連貫）

  // Chrome message listener
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "START_BATCH") {
      config = msg.config;
      queue = msg.queue;
      stopped = false;
      if (!findPromptTextarea()) {
        logError("START_BATCH ignored: no prompt textarea in this frame");
        queue.forEach(item => reportItemStatus(item.id, "error"));
        return;
      }
      if (config.resumeIndex > 0 && config.frames && config.frames.length) {
        const fr = config.frames[0];
        dataURLToFile(fr.dataUrl, fr.name || "chain-last-frame.png")
          .then(f => { resumeFrameFile = f; log("Resumed chain frame restored:", fr.name); })
          .catch(e => log("Resume frame restore failed:", e.message));
      }
      runBatch();
    } else if (msg.type === "STOP_BATCH") {
      stopped = true;
    }
  });

  function log(...args) {
    console.log(LOG_PREFIX, ...args);
    reportDebugLog(args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" "), "info");
  }
  function logError(...args) {
    console.error(LOG_PREFIX, ...args);
    reportDebugLog(args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" "), "error");
  }

  // 透過 React fiber 找 Slate editor 實例（data-slate-editor 的編輯器）
  // Slate 的 editor 是放在 <Slate> 的 React Context 裡，需遍歷 fiber 的 props/hooks state
  function findSlateEditor(el) {
    try {
      const isEditor = c => c && typeof c === "object" &&
        typeof c.insertText === "function" &&
        Array.isArray(c.children) &&
        "selection" in c;
      const seen = new Set();
      let foundKeys = [];
      let node = el;
      for (let depth = 0; node && depth < 10; depth++, node = node.parentElement) {
        const keys = Object.getOwnPropertyNames(node).filter(k => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$") || k.startsWith("__reactProps$") || k.startsWith("__reactEvents$"));
        if (keys.length) foundKeys.push(node.tagName + ":" + keys.join(","));
        for (const fk of keys) {
          let fiber = node[fk];
          if (fk.startsWith("__reactProps$")) {
            // 從 props 直接找 editor/onBeforeInput
            const p = node[fk];
            if (isEditor(p && p.editor)) return p.editor;
            continue;
          }
          for (let i = 0; fiber && i < 300; i++) {
            if (seen.has(fiber)) break;
            seen.add(fiber);
            const props = fiber.memoizedProps || fiber.pendingProps || {};
            if (isEditor(props.editor)) return props.editor;
            if (isEditor(props.value)) return props.value; // Context provider value
            // 遍歷 hooks state
            let state = fiber.memoizedState;
            while (state) {
              const m = state.memoizedState;
              if (isEditor(m)) return m;
              if (m && isEditor(m.current)) return m.current;
              if (m && isEditor(m.memoizedState)) return m.memoizedState;
              state = state.next;
            }
            fiber = fiber.return;
          }
        }
      }
      if (foundKeys.length) log("[Prompt] React keys found:", foundKeys.join(" | "));
      else log("[Prompt] No React fiber keys found on element or ancestors");
    } catch (e) { log("[Prompt] findSlateEditor error:", e.message); }
    return null;
  }

  // Utility: set native input value
  function setNativeValue(el, value) {
    if (el && el.isContentEditable) {
      el.focus();
      // 記錄編輯器資訊（判斷是哪種富文字框架，方便除錯）
      try {
        const cls = (el.className || "") + " " + ((el.parentElement && el.parentElement.className) || "");
        const isPM = /prosemirror/i.test(cls) || !!el.querySelector(".ProseMirror");
        const isLex = /lexical/i.test(cls) || el.hasAttribute("data-lexical-editor");
        const isSlate = el.hasAttribute("data-slate-editor") || (el.outerHTML || "").includes("data-slate-editor");
        log("[Prompt] editor type:", isSlate ? "Slate" : isPM ? "ProseMirror" : isLex ? "Lexical" : "unknown", "| class:", cls.slice(0, 80));
      } catch (e) { /* ignore */ }

      // 方法 A（Slate 專用）：透過 React fiber 找到 Slate editor，設定 selection 後用 editor.insertText
      const slateEditor = findSlateEditor(el);
      if (slateEditor) {
        try {
          // 空編輯器通常是 [{children:[{text:""}]}]，path [0,0] 是第一個文字節點
          slateEditor.selection = { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 0 } };
          slateEditor.insertText(value);
          // 驗證 Slate 內部值是否真的寫入
          let inner = "";
          try {
            const first = slateEditor.children && slateEditor.children[0] && slateEditor.children[0].children;
            inner = first ? (first[0] && first[0].text ? String(first[0].text).slice(0, 50) : "") : "";
          } catch (e) {}
          log("[Prompt] filled via Slate editor.insertText, length:", value.length, "| inner:", JSON.stringify(inner));
          return;
        } catch (e) {
          log("[Prompt] Slate insertText failed:", e.message);
        }
      } else {
        log("[Prompt] Slate editor NOT found via fiber, falling back");
      }

      // 方法 B：設定 DOM 游標到第一個 block 的開頭，再 dispatch beforeinput
      //（Slate/ProseMirror 的 onBeforeInput 處理 insertText 並更新內部狀態）
      try {
        const block = el.querySelector("p, div, [data-slate-node='element']") || el;
        const range = document.createRange();
        range.selectNodeContents(block);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) { /* ignore */ }
      try {
        el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertText", data: value }));
      } catch (e) { /* ignore */ }
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));

      // 方法 C：execCommand 補 DOM（若框架沒處理 beforeinput，至少視覺上要有文字）
      const cur = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!cur.includes(value.replace(/\s+/g, " ").slice(0, 10))) {
        try {
          const range = document.createRange();
          range.selectNodeContents(el.querySelector("p, div, [data-slate-node='element']") || el);
          range.collapse(true);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand("insertText", false, value);
          el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        } catch (e) { /* ignore */ }
      }
      log("[Prompt] filled (beforeinput/execCommand), length:", value.length);
      return;
    }
    // textarea / input
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // 填字後驗證：記錄 DOM 是否真的有文字、以及偵測到的富文字框架
  function verifyPromptFill(el, expected) {
    try {
      const domText = (el.textContent || "").replace(/\s+/g, " ").trim();
      const exp = (expected || "").replace(/\s+/g, " ").trim();
      const domOk = domText.length > 0 && (domText.includes(exp.slice(0, 30)) || exp.includes(domText.slice(0, 30)));
      // 檢查 Slate 內部文字節點（data-slate-node="text"）——若 Slate 內部值是空的，這裡會是空
      let slateText = "";
      try {
        const txtNodes = Array.from(el.querySelectorAll('[data-slate-node="text"]')).map(n => n.textContent || "");
        slateText = txtNodes.join("").replace(/\s+/g, " ").trim();
      } catch (e) {}
      log("[Prompt] verify: domText len=" + domText.length, "domMatch=" + domOk, "| slateText len=" + slateText.length);
      return domOk;
    } catch (e) { return false; }
  }

  // Click helpers
  function click(el) {
    if (!el) return false;
    try {
      el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true }));
    } catch (e) { /* ignore */ }
    el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    el.click();
    return true;
  }

  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  function randWait() {
    const min = Math.min(config.waitMin || 0, config.waitMax || 0);
    const max = Math.max(config.waitMin || 0, config.waitMax || 0);
    return min + Math.random() * (max - min);
  }

  // Status reporting
  function reportItemStatus(id, status) {
    try { chrome.runtime.sendMessage({ type: "ITEM_STATUS", id, status }); } catch (e) { /* ignore */ }
  }

  // Element finders (Google Flow UI)
  function findPromptTextarea() {
    const all = Array.from(document.querySelectorAll(
      "textarea, [contenteditable='true'], [contenteditable='plaintext-only'], [contenteditable='']"
    ));
    const isVisible = el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 &&
        getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none";
    };
    const visible = all.filter(isVisible);
    const attrs = (el) =>
      (el.getAttribute("placeholder") || "") + " " +
      (el.getAttribute("aria-label") || "") + " " +
      (el.getAttribute("data-testid") || "") + " " +
      (el.getAttribute("title") || "");
    // 除錯：列出所有候選輸入框（判斷是否抓錯元素）
    try {
      const cand = all.map(el => {
        const r = el.getBoundingClientRect();
        return el.tagName + "(ce=" + el.isContentEditable + ",ph=" + JSON.stringify((el.getAttribute("placeholder") || "").slice(0, 20)) + ",al=" + JSON.stringify((el.getAttribute("aria-label") || "").slice(0, 20)) + ",cls=" + JSON.stringify((el.className || "").toString().slice(0, 40)) + ",vis=" + (r.width > 0 && r.height > 0) + ")";
      });
      log("[Prompt] candidates:", cand.join(" | "));
    } catch (e) { /* ignore */ }
    const byKeyword = visible.filter(el => /prompt|提示|描述|Describe|Prompt|prompt/i.test(attrs(el)));
    if (byKeyword.length > 0) return byKeyword[0];
    const ce = visible.find(el => el.isContentEditable);
    if (ce) return ce;
    const withPh = visible.filter(el => (el.getAttribute("placeholder") || "").trim());
    if (withPh.length > 0) return withPh[0];
    if (visible.length > 0) return visible[0];
    return all[0] || null;
  }

  function findSubmitButton() {
    const describe = b => (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
    const pos = b => { const r = b.getBoundingClientRect(); return Math.round(r.left) + "," + Math.round(r.top); };
    // 收集所有可見 <button>（含停用——送出鍵可能因提示詞未被辨識而停用，需記錄）
    const btns = Array.from(document.querySelectorAll("button")).filter(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const createRe = /创建|創建|create|生成|產生|送出|提交|執行|submit/i;
    const excludeRe = /取消|cancel|close|關閉|清除|更多|more_vert|搜索|search|排序|filter|添加媒体|返回|收起/i;
    const candidates = btns.filter(b => {
      const t = (b.textContent || "").replace(/\s+/g, " ").trim();
      if (!t) return false;
      if (excludeRe.test(t)) return false;
      return createRe.test(t);
    });
    // 診斷：列出所有候選按鈕（含停用狀態與位置）
    try {
      log("[Submit] candidate buttons:", candidates.map(b => "'" + describe(b) + "' d=" + (b.disabled || b.getAttribute("aria-disabled") === "true") + " pos=" + pos(b)).join(" | "));
    } catch (e) { /* ignore */ }
    // 優先：含 arrow_forward 的主送出鍵（Flow 的 arrow_forward创建）
    const submit = candidates.find(b => /arrow_forward/i.test(b.textContent || ""));
    if (submit) {
      const dis = submit.disabled || submit.getAttribute("aria-disabled") === "true";
      log("Submit button:", describe(submit), dis ? "(DISABLED—提示詞可能未被 Flow 辨識)" : "");
      return submit;
    }
    // 其次：取最右邊的「創建」按鈕（排除 add_2 加號鍵）
    const noAdd = candidates.filter(b => !/add_2|^add\b|^add$/.test((b.textContent || "").replace(/\s+/g, " ").trim()));
    if (noAdd.length > 0) {
      const btn = noAdd.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
      log("Submit button (rightmost create):", describe(btn));
      return btn;
    }
    // 最後：候選中最右邊的
    if (candidates.length > 0) {
      const btn = candidates.sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
      log("Submit button (fallback):", describe(btn));
      return btn;
    }
    // 極端 fallback：最後一個可見 button
    if (btns.length > 0) {
      const last = btns[btns.length - 1];
      log("Submit button (last fallback):", describe(last));
      return last;
    }
    log("Submit button: NOT FOUND");
    return null;
  }

  // 啟動真正的主送出按鈕一次。不要再點擊所有子節點：子節點事件會冒泡，
  // 會讓同一個建立動作被重入，並且在 Flow 重繪按鈕時留下失效的第二次 click。
  async function activateSubmitButton(button) {
    if (!button) return false;
    if (button.disabled || button.getAttribute("aria-disabled") === "true") {
      log("[Submit] primary button is disabled");
      return false;
    }
    try {
      const r = button.getBoundingClientRect();
      const top = document.elementFromPoint(
        Math.round(r.left + r.width / 2),
        Math.round(r.top + r.height / 2)
      );
      if (top && top !== button && !button.contains(top)) {
        log("[Submit] primary button is covered by:", top.tagName, (top.textContent || "").trim().slice(0, 40));
        return false;
      }
    } catch (e) {
      log("[Submit] button hit-test failed:", e.message);
      return false;
    }
    let x, y;
    try {
      const r = button.getBoundingClientRect();
      x = Math.round(r.left + r.width / 2);
      y = Math.round(r.top + r.height / 2);
    } catch (e) {
      log("[Submit] button coordinates unavailable:", e.message);
      return false;
    }
    try { button.focus(); } catch (e) { /* ignore */ }
    try {
      const reply = await chrome.runtime.sendMessage({ type: "TRUSTED_CLICK", x, y });
      if (reply && reply.ok) {
        log("[Submit] trusted click sent at", x + "," + y);
        return true;
      }
      log("[Submit] trusted click rejected:", (reply && reply.error) || "no response");
    } catch (e) {
      log("[Submit] trusted click failed:", e.message);
    }
    return false;
  }

  function submissionStateChanged(button) {
    if (!button || !document.contains(button)) return true;
    if (button.disabled || button.getAttribute("aria-disabled") === "true" ||
      button.getAttribute("aria-busy") === "true") return true;
    const busy = button.querySelector("[aria-busy='true'], [data-loading='true'], [role='progressbar']");
    if (busy) return true;
    try {
      return snapshotMedia().some(src => src && !mediaBefore.has(src));
    } catch (e) { return false; }
  }

  async function waitForSubmissionStart(button, maxMs = 12000) {
    const deadline = performance.now() + maxMs;
    while (performance.now() < deadline) {
      if (submissionStateChanged(button)) return true;
      await sleep(100);
    }
    return submissionStateChanged(button);
  }

  async function submitPrompt(item) {
    let button = findSubmitButton();
    for (let attempt = 1; attempt <= 2; attempt++) {
      if (!button) break;
      log("[Submit] activating primary button, attempt", attempt);
      if (await activateSubmitButton(button) && await waitForSubmissionStart(button)) {
        log("Submitted item", item.id, "(Flow acknowledged)");
        return true;
      }
      if (attempt < 2) {
        log("[Submit] no Flow acknowledgement; refreshing primary button before retry");
        await sleep(500);
        button = findSubmitButton();
      }
    }
    throw new Error("Flow did not acknowledge the create button");
  }

  function findAspectRatioButtons() {
    const ratios = ["16:9", "9:16", "1:1", "3:4", "4:3"];
    // 匹配 16:9, 16/9, 16_9 等格式（含圖示前綴如 "crop_16_9x1"）
    const ratioRe = /16[_:/]9|9[_:/]16|1[_:/]1|3[_:/]4|4[_:/]3/;
    const isRatioEl = el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      const text = (el.textContent || "").trim();
      // 排除模型選擇器按鈕（含 crop_ 與 x1/x4）和工具列大按鈕
      // 排除純模型名稱按鈕，但保留含比例文字的 crop 按鈕（如 "crop_16_916:9"）
      const hasRatio = /16[_:]9|9[_:]16|1[_:]1|3[_:]4|4[_:]3/.test(text);
      if (!hasRatio && /crop|x[1-4]|Nano|Veo|🍌|720|1080/.test(text)) return false;
      if (text.length > 20) return false;
      const al = (el.getAttribute("aria-label") || "").trim();
      const ti = (el.getAttribute("title") || "").trim();
      const dt = (el.getAttribute("data-testid") || "").trim();
      const all = text + " " + al + " " + ti + " " + dt;
      // 精確比對或 regex 匹配
      return ratios.some(r => all.includes(r)) || ratioRe.test(all) ||
             /aspect|ratio|比例|寬高/.test(all);
    };
    // 搜尋所有可互動元素（含 Shadow DOM）
    return queryAllVisible(document).filter(isRatioEl);
  }

  // Flow panel mode switch (chain)
  const MODE_BUTTON_LABELS = {
    text2video: ["文字轉影片", "文字转视频", "Text to Video"],
    frame2video: [
      "幀數轉影片", "幀轉影片", "帧数转视频", "帧转视频", "從幀轉換", "从帧转换",
      "Frames to Video", "Frame to Video", "Frame2Video", "Frame to video"
    ]
  };
  function findModeSwitchButton(modeKey) {
    const labels = MODE_BUTTON_LABELS[modeKey] || [];
    const candidates = Array.from(document.querySelectorAll(
      "button, [role='button'], [role='tab'], [role='radio'], nav a, a[href], " +
      "[data-testid*='mode'], [data-testid*='tab'], [class*='mode'], [class*='tab']"
    ));
    for (const label of labels) {
      const el = candidates.find(c => (c.textContent || "").trim() === label);
      if (el) return el;
    }
    for (const label of labels) {
      const el = candidates.find(c => (c.textContent || "").trim().includes(label));
      if (el) return el;
    }
    const kw = modeKey === "frame2video" ? /frame|幀|帧/i : /text|文字|文本/i;
    const el = candidates.find(c => kw.test(
      (c.getAttribute("aria-label") || "") + " " +
      (c.getAttribute("data-testid") || "") + " " +
      (c.getAttribute("title") || "")
    ));
    return el || null;
  }
  async function switchMode(modeKey) {
    const el = findModeSwitchButton(modeKey);
    if (!el) {
      logError("Mode switch failed: button not found for", modeKey);
      try {
        const seen = Array.from(document.querySelectorAll("button, [role='button'], [role='tab'], [role='radio'], nav a, a[href]"))
          .map(c => (c.textContent || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 30);
        log("Available UI labels:", JSON.stringify(seen));
      } catch (e) { /* ignore */ }
      return false;
    }
    log("Switching Flow panel to", modeKey);
    click(el);
    await sleep(3500);
    return true;
  }

  // Select dropdown option — exact match + fallback includes + attribute match
  function selectByText(text) {
    // 1) leaf 精確比對
    const leaves = Array.from(document.querySelectorAll("*")).filter(
      el => el.children.length === 0 && (el.textContent || "").trim() === text);
    for (const el of leaves) { if (click(el)) return true; }
    // 2) 可點擊元素精確比對
    const clickables = Array.from(document.querySelectorAll(
      "button, [role='button'], [role='option'], [role='tab'], [role='radio'], li, a"
    )).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (el.textContent || "").trim() === text;
    });
    for (const el of clickables) { if (click(el)) return true; }
    // 3) Fallback: includes 比對 + 屬性比對
    const normS = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const tLower = normS(text);
    const leafInc = Array.from(document.querySelectorAll("*")).filter(
      el => el.children.length === 0 && normS(el.textContent) === tLower);
    for (const el of leafInc) { if (click(el)) return true; }
    const clickInc = Array.from(document.querySelectorAll(
      "button, [role='button'], [role='option'], [role='tab'], [role='radio'], li, a, div, span"
    )).filter(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      const al = normS(el.getAttribute("aria-label") || "");
      const ti = normS(el.getAttribute("title") || "");
      const dt = normS(el.getAttribute("data-testid") || "");
      if (al === tLower || ti === tLower || dt === tLower) return true;
      if (normS(el.textContent) === tLower) return true;
      return false;
    });
    for (const el of clickInc) { if (click(el)) return true; }
    return false;
  }

  // 模糊比對：忽略 emoji/圖示前綴，文字「包含」目標（限制長度避免誤點觸發鈕/控制項）
  function selectFuzzy(text) {
    const strip = s => (s || "").replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
    const target = strip(text);
    if (!target) return false;
    const els = Array.from(document.querySelectorAll("button, [role='button'], [role='option'], [role='tab'], [role='radio'], li, a")).filter(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      const t = strip(el.textContent);
      if (!t) return false;
      if (/\b(x[1-4]|crop_)\b/.test(t)) return false;
      // 文字要包含目標，且長度不能超出目標太多（避免點到「🍌 Nano Banana 2crop_16_9x2」這類含尾綴的觸發鈕）
      return t.includes(target) && t.length <= target.length + 8;
    });
    for (const el of els) { if (click(el)) return true; }
    return false;
  }

  // DataURL to File
  async function dataURLToFile(dataURL, name) {
    const resp = await fetch(dataURL);
    const blob = await resp.blob();
    return new File([blob], name, { type: "image/png" });
  }

  // Report to popup
  function reportChainFrame(index, dataURL) {
    try { chrome.runtime.sendMessage({ type: "CHAIN_FRAME", index, dataURL }); } catch (e) { /* ignore */ }
  }
  function reportItemResult(id, videoUrl, dataURL, metadata = {}) {
    try { chrome.runtime.sendMessage({ type: "ITEM_RESULT", id, videoUrl, dataURL, ...metadata }); } catch (e) { /* ignore */ }
  }
  function reportItemRetry(id) {
    try { chrome.runtime.sendMessage({ type: "ITEM_RETRY", id }); } catch (e) { /* ignore */ }
  }
  function reportDebugLog(text, level) {
    try { chrome.runtime.sendMessage({ type: "DEBUG_LOG", text, level }); } catch (e) { /* ignore */ }
  }

  // Upload frames
  async function uploadFrames(files) {
    log("Uploading", files.length, "frames");
    const input = document.querySelector('input[type="file"][accept*="image"]') ||
      document.querySelector('input[type="file"]');
    if (!input) {
      reportItemStatus(queue[0]?.id, "error");
      return false;
    }
    const dt = new DataTransfer();
    files.forEach(f => dt.items.add(f));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(3000);
    return true;
  }

  // Chain Prompt: capture last frame
  async function captureLastFrame(url) {
    try {
      log("Capturing last frame from video URL:", url.slice(0, 80));
      const resp = await fetch(url);
      const blob = await resp.blob();
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      const loaded = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("video load timeout")), 30000);
        video.addEventListener("loadeddata", () => { clearTimeout(timer); resolve(); }, { once: true });
        video.addEventListener("error", () => { clearTimeout(timer); reject(new Error("video load error")); }, { once: true });
      });
      video.src = URL.createObjectURL(blob);
      await loaded;
      video.currentTime = Math.max(0, (video.duration || 0) - 0.1);
      await new Promise(r => { video.addEventListener("seeked", r, { once: true }); });
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pngBlob = await new Promise(r => canvas.toBlob(r, "image/png"));
      URL.revokeObjectURL(video.src);
      const file = new File([pngBlob], "chain-last-frame.png", { type: "image/png" });
      log("Last frame captured:", canvas.width, "x", canvas.height, pngBlob.size, "bytes");
      return file;
    } catch (e) {
      log("captureLastFrame failed:", e.message);
      return null;
    }
  }

  async function waitForResult(maxMs) {
    const start = performance.now();
    return new Promise(resolve => {
      const check = () => {
        const media = Array.from(document.querySelectorAll("video, img")).filter(m => {
          const src = m.src || m.currentSrc;
          return src && !mediaBefore.has(src);
        });
        if (media.length > 0) { resolve(media[media.length - 1]); return true; }
        if (performance.now() - start > maxMs) { resolve(null); return false; }
        requestAnimationFrame(check);
      };
      check();
    });
  }

  // Diagnostic: collect visible element labels
  function optionLabels(limit = 40) {
    const seen = [];
    Array.from(document.querySelectorAll("button, [role='button'], [role='option'], [role='tab'], [role='radio'], li"))
      .forEach(el => {
        const r = el.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return;
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (t && t.length < 40 && seen.indexOf(t) === -1) seen.push(t);
      });
    return seen.slice(0, limit);
  }
  function logOptionCandidates(desc, els, limit = 20) {
    try {
      const seen = [];
      (els || []).forEach(el => {
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (t && seen.indexOf(t) === -1) seen.push(t);
      });
      log(desc, JSON.stringify(seen.slice(0, limit)));
    } catch (e) { /* ignore */ }
  }

  // Full-page DOM dump for debugging
  function dumpPageElements() {
    const norm = s => (s || "").replace(/\s+/g, " ").trim();
    const els = Array.from(document.querySelectorAll(
      "button, [role='button'], [role='tab'], [role='radio'], [role='option'], " +
      "li, a, select, input, [contenteditable], [data-testid], [aria-label]"
    )).filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    const info = els.slice(0, 80).map(el => {
      const tag = el.tagName;
      const text = norm(el.textContent).slice(0, 50);
      const al = norm(el.getAttribute("aria-label"));
      const ti = norm(el.getAttribute("title"));
      const dt = norm(el.getAttribute("data-testid"));
      const role = norm(el.getAttribute("role"));
      const cls = (el.className || "").toString().replace(/\s+/g, " ").trim().slice(0, 60);
      const pressed = el.getAttribute("aria-pressed");
      const selected = el.getAttribute("aria-selected");
      const parts = ["<" + tag + ">"];
      if (text) parts.push("text=" + JSON.stringify(text));
      if (al) parts.push("aria-label=" + JSON.stringify(al));
      if (ti) parts.push("title=" + JSON.stringify(ti));
      if (dt) parts.push("data-testid=" + JSON.stringify(dt));
      if (role) parts.push("role=" + role);
      if (cls) parts.push("class=" + JSON.stringify(cls.slice(0, 40)));
      if (pressed) parts.push("pressed=" + pressed);
      if (selected) parts.push("selected=" + selected);
      return parts.join(" ");
    });
    log("[DOM] Page interactive elements (" + els.length + " total):");
    for (let i = 0; i < info.length; i += 5) {
      log("[DOM]", info.slice(i, i + 5).join(" | "));
    }
  }

  // --------------- Auto-detect Flow mode ---------------
  // Uses URL, bottom toolbar button text, and MODEL NAMES to determine mode.
  // Nano Banana = image model, Veo = video model.
  function detectFlowMode() {
    const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    // Strategy 1: URL path keywords
    try {
      const url = (location.href || "").toLowerCase();
      if (/video|影片|視訊/.test(url)) return "video";
      if (/image|圖片|照片/.test(url)) return "image";
    } catch (e) { /* ignore */ }
    // Strategy 2: Bottom toolbar buttons (y > 70% viewport height)
    const viewH = window.innerHeight || document.documentElement.clientHeight;
    const bottomThreshold = viewH * 0.7;
    const videoTextRe = /video|視頻|影片|視訊|動畫|视频|veo/i;
    const imageTextRe = /image|圖片|照片|画|畫像|图片|nano.banana|banana/i;
    const toolbarBtns = Array.from(document.querySelectorAll(
      "button, [role='button'], [role='tab'], [role='radio']"
    )).filter(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      return r.top > bottomThreshold && r.width < 300 && r.height < 80;
    });
    // Check for active/pressed buttons
    for (const el of toolbarBtns) {
      const isActive = el.getAttribute("aria-pressed") === "true" ||
        el.getAttribute("aria-selected") === "true" ||
        el.classList.contains("active") || el.classList.contains("selected");
      if (!isActive) continue;
      const t = norm(el.textContent);
      const al = norm(el.getAttribute("aria-label") || "");
      if (videoTextRe.test(t) || videoTextRe.test(al)) return "video";
      if (imageTextRe.test(t) || imageTextRe.test(al)) return "image";
    }
    // Check all toolbar buttons for video/image model names
    for (const el of toolbarBtns) {
      const t = norm(el.textContent);
      // Match video/image by text patterns
      if (/^视频|video/.test(t)) return "video";
      if (/^图片|image/.test(t)) return "image";
      // Match by model name: Veo = video, Nano Banana = image
      if (videoTextRe.test(t)) return "video";
      if (imageTextRe.test(t)) return "image";
    }
    // Strategy 3: Check prompt area for mode hints (e.g., emoji 🍌 = Nano Banana)
    const promptBtns = Array.from(document.querySelectorAll("button")).filter(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      return r.top > bottomThreshold;
    });
    for (const el of promptBtns) {
      const t = norm(el.textContent);
      if (/veo/i.test(t)) return "video";
      if (/banana|🍌/i.test(t)) return "image";
    }
    return null;
  }

  function validateAndFixMode() {
    flowCurrentMode = detectFlowMode();
    const isImageConfig = config.mode === "text2image" || config.mode === "image2image";
    log("[Mode] detected Flow mode:", flowCurrentMode, "config.mode:", config.mode);
    // 不覆蓋 config.mode，讓 ensureOutputMode 負責切換 Flow UI
    if (flowCurrentMode === "image" && !isImageConfig) {
      log("[Mode] Flow 在圖片模式但 config 是影片模式 → 將嘗試切換 Flow 到影片模式");
    } else if (flowCurrentMode === "video" && isImageConfig) {
      log("[Mode] Flow 在影片模式但 config 是圖片模式 → 將嘗試切換 Flow 到圖片模式");
    } else if (flowCurrentMode) {
      log("[Mode] Flow 模式與 config 一致");
    }
  }

  // --------------- 點擊模型選擇器按鈕開啟設定面板 ---------------
  // Flow 底部工具列的模型按鈕（如 "🍌 Nano Banana 2crop_16_9x1"）
  // 點擊後會打開模型/比例/數量設定面板，再從中選擇正確選項。
  async function openModelPanel() {
    const viewH = window.innerHeight || document.documentElement.clientHeight;
    const bottomThreshold = viewH * 0.6;
    // 找底部工具列的按鈕（放宽尺寸限制）
    const toolbarBtns = Array.from(document.querySelectorAll(
      "button, [role='button']"
    )).filter(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      return r.top > bottomThreshold && r.height > 15 && r.height < 80;
    });
    // Debug: 列出底部工具列按鈕
    const btnInfo = toolbarBtns.map(b => {
      const t = (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30);
      const r = b.getBoundingClientRect();
      return "'" + t + "' " + Math.round(r.width) + "x" + Math.round(r.height) + " y=" + Math.round(r.top);
    });
    log("[Model] Toolbar buttons (" + toolbarBtns.length + "):", JSON.stringify(btnInfo));
    // 找含模型名稱或模式文字的按鈕（Veo / Nano Banana / 🍌 / 视频 / 720p）
    const modelBtn = toolbarBtns.find(el => {
      const t = (el.textContent || "").toLowerCase();
      return /veo|banana|🍌|omni|视频|视频|video|720|1080|4k|crop/i.test(t);
    }) || toolbarBtns.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
    if (modelBtn) {
      click(modelBtn);
      log("[Model] Clicked model selector:", (modelBtn.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40));
      await sleep(2000); // 等面板完全渲染
      return true;
    }
    log("[Model] Model selector button not found");
    return false;
  }

  // --------------- Panel DOM dump (debug) ---------------
  // 遞迴搜尋 Shadow DOM 和主文件的所有可見互動元素
  function queryAllVisible(root) {
    const els = [];
    const seen = new Set();
    // 基礎選擇器：標準互動元素
    const baseSelector = "button, [role='button'], [role='tab'], [role='radio'], [role='option'], li, a, select, option";
    // 主文件：標準互動元素
    try {
      Array.from(root.querySelectorAll(baseSelector)).forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && !seen.has(el)) { seen.add(el); els.push(el); }
      });
    } catch(e) {}
    // 額外搜尋：div/span 中文字長度 ≤15 的葉子元素（面板內的比例/時長/數量按鈕）
    try {
      Array.from(root.querySelectorAll("div, span")).forEach(el => {
        const r = el.getBoundingClientRect();
        if (!(r.width > 15 && r.height > 10 && r.width < 200 && r.height < 80)) return;
        if (seen.has(el)) return;
        const text = (el.textContent || "").trim();
        // 只取葉子元素或文字很短的元素
        if (text.length > 0 && text.length <= 15 && el.children.length <= 3) {
          seen.add(el); els.push(el);
        }
      });
    } catch(e) {}
    // 遞迴搜尋 Shadow DOM
    try {
      root.querySelectorAll("*").forEach(el => {
        if (el.shadowRoot) {
          queryAllVisible(el.shadowRoot).forEach(e => { if (!seen.has(e)) { seen.add(e); els.push(e); } });
        }
      });
    } catch(e) {}
    // 搜尋 iframes
    try {
      Array.from(root.querySelectorAll("iframe")).forEach(iframe => {
        try {
          const iDoc = iframe.contentDocument || iframe.contentWindow.document;
          queryAllVisible(iDoc).forEach(e => { if (!seen.has(e)) { seen.add(e); els.push(e); } });
        } catch(e) { /* cross-origin */ }
      });
    } catch(e) {}
    return els;
  }
  function dumpPanelElements() {
    const norm = s => (s || "").replace(/\s+/g, " ").trim();
    const els = queryAllVisible(document);
    // 過濾：只保留面板相關的元素（排除 sidebar 元素）
    // sidebar 通常在 x < 250 的位置
    const panelEls = els.filter(el => {
      const r = el.getBoundingClientRect();
      return r.x > 200 || r.width > 300; // 排除 sidebar 按鈕
    });
    const allInfo = els.slice(0, 120).map(el => {
      const r = el.getBoundingClientRect();
      const tag = el.tagName;
      const text = norm(el.textContent).slice(0, 40);
      return "<" + tag + "> " + JSON.stringify(text) + " pos=" + Math.round(r.x) + "," + Math.round(r.y) + " sz=" + Math.round(r.width) + "x" + Math.round(r.height);
    });
    const panelInfo = panelEls.slice(0, 80).map(el => {
      const r = el.getBoundingClientRect();
      const tag = el.tagName;
      const text = norm(el.textContent).slice(0, 40);
      return "<" + tag + "> " + JSON.stringify(text) + " pos=" + Math.round(r.x) + "," + Math.round(r.y) + " sz=" + Math.round(r.width) + "x" + Math.round(r.height);
    });
    log("[Panel] total visible elements:", els.length, "panel-area elements:", panelEls.length, "(div/span included)");
    const chunkSize = 8;
    for (let i = 0; i < allInfo.length; i += chunkSize) {
      log("[Panel] all (" + (i + 1) + "-" + Math.min(i + chunkSize, allInfo.length) + "):", allInfo.slice(i, i + chunkSize).join(" | "));
    }
    if (panelInfo.length > 0) {
      for (let i = 0; i < panelInfo.length; i += chunkSize) {
        log("[Panel] panel (" + (i + 1) + "-" + Math.min(i + chunkSize, panelInfo.length) + "):", panelInfo.slice(i, i + chunkSize).join(" | "));
      }
    } else {
      log("[Panel] WARNING: No panel-area elements found! Panel may be in Shadow DOM or not rendered.");
    }
  }

  // --------------- Auto-scan characters from Flow UI ---------------
  function autoScanCharacters() {
    if (config.charNames && config.charNames.length > 0) return;
    const norm = s => (s || "").replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const found = [];
    // Icon prefixes that Flow prepends to card names
    const iconPrefixes = /^(accessibility_new|image|movie|apps_spark_2|smart_3|delete|filter_list|arrow_back|arrow_forward|left_panel_close|more_vert|search|help|settings_2|add|add_2|dashboard|image_2|PRO)*/i;
    // Junk patterns applied AFTER extracting name (not on raw text)
    const junkNameRe = /^(您希望|创作|什么|内容|智能体|工具|回收|排序|过滤|添加|帮助|查看|设置|更多|返回|收起|添加媒体|翻译|translate|create|character|card|prompt|identical|stacks|720|1080|4k|nano|banana|veo|视频|图片|影像|照片|比例|时长|数量|更多选项|搜索|排序和过滤|产品帮助|查看设置|所有媒体内容|查看图片|角色|查看场景|查看回收站|_2创建|创建|选项|点击|拖曳)$/;
    // Target: character/asset cards with role=button
    const btns = Array.from(document.querySelectorAll("[role='button'], button"));
    for (const el of btns) {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      const rawText = (el.textContent || "").trim();
      if (!rawText || rawText.length > 30 || rawText.length < 2) continue;
      // 先提取名稱：去掉 icon 前綴文字
      let name = rawText.replace(iconPrefixes, "").trim();
      if (!name || name.length < 2 || name.length > 20) continue;
      // 去掉尾部裝飾詞
      name = name.replace(/(stacks|card|scene|prompt|character)$/i, "").trim();
      if (!name || name.length < 2) continue;
      // 對提取後的名稱做過濾（而非原始文字）
      if (junkNameRe.test(name)) continue;
      // 跳過含空格的多詞描述
      if (name.includes(" ")) continue;
      // 跳過純數字或過短
      if (/^\d+$/.test(name)) continue;
      const nn = norm(name);
      if (nn && nn.length >= 2 && !found.some(f => norm(f) === nn)) {
        found.push(name);
      }
    }
    if (found.length > 0) {
      log("[AutoScan] Flow 頁面自動掃描到角色:", JSON.stringify(found));
      config.charNames = found;
      config.charSelected = found;
    } else {
      log("[AutoScan] Flow 頁面未掃描到角色");
    }
  }

  // Ensure output mode: switch Flow to video/image mode
  async function ensureOutputMode(kind) {
    // If already detected and correct, skip
    if (flowCurrentMode === kind) {
      log("Flow already in", kind, "mode (detected), skipping toggle");
      return true;
    }
    const isVisible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const btns = queryAllVisible(document);
    const videoRe = /video|視頻|影片|視訊|動畫|veo|text.to.video|文字轉影片|文字转视频|帧转视频|帧数转视频|frames.to.video/i;
    const imageRe = /image|圖片|照片|画|畫像|text.to.image|文字轉圖片|文字转图片|图片转图片|图片|新圖片/i;
    const actionRe = /创建|生成|提交|送出|arrow|create|submit|generate|翻译|translate|identical|character.card|🍌|nano|banana|veo/i;
    const target = btns.find(el => {
      const t = norm(el.textContent);
      if (t.length > 40 || t.length < 2) return false;
      if (actionRe.test(t)) return false;
      const al = norm(el.getAttribute("aria-label") || "");
      const ti = norm(el.getAttribute("title") || "");
      const dt = norm(el.getAttribute("data-testid") || "");
      const cls = norm(el.className || "");
      const all = t + " " + al + " " + ti + " " + dt + " " + cls;
      const isVideo = videoRe.test(all);
      const isImage = imageRe.test(all);
      if (kind === "video") return isVideo && !isImage;
      return isImage && !isVideo;
    });
    if (target) {
      const active = target.getAttribute("aria-pressed") === "true" ||
        target.getAttribute("aria-selected") === "true" ||
        target.classList.contains("active") || target.classList.contains("selected");
      if (!active) { click(target); flowCurrentMode = kind; log("Switched output to", kind, "mode"); }
      else { flowCurrentMode = kind; log("Already in", kind, "mode"); }
      return true;
    }
    // Fallback: tool selector
    const toolLabels = kind === "video"
      ? ["文字轉影片", "文字转视频", "Text to Video"]
      : ["文字轉圖片", "文字转图片", "Text to Image"];
    for (const label of toolLabels) {
      const el = btns.find(b => {
        const t = (b.textContent || "").trim();
        return t === label || t.includes(label);
      });
      if (el) {
        const active = el.getAttribute("aria-pressed") === "true" ||
          el.getAttribute("aria-selected") === "true" ||
          el.classList.contains("active") || el.classList.contains("selected");
        if (!active) { click(el); flowCurrentMode = kind; log("Switched Flow tool to", kind, "mode via:", label); await sleep(2000); }
        else { flowCurrentMode = kind; log("Already on", kind, "mode tool:", label); }
        return true;
      }
    }
    log(kind, "mode toggle not found. Toggle candidates:", JSON.stringify(btns.map(b => norm(b.textContent) || norm(b.getAttribute("aria-label") || "")).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 20)));
    return false;
  }

  function setAspect() {
    if (!config.aspect) return;
    const btns = findAspectRatioButtons();
    for (const b of btns) {
      const t = (b.textContent || "").trim();
      // 精確比對或包含比對（處理圖示前綴如 "crop_16_9x1"）
      if (t === config.aspect || t.includes(config.aspect)) {
        click(b);
        log("Aspect set to", config.aspect);
        return;
      }
    }
    logOptionCandidates("Aspect not found. Ratio candidates:", btns);
  }

  function setModel() {
    if (!config.model) return;
    // Flow UI 顯示的模型名稱（含 dash）
    const map = {
      "veo3.1-lite": "Veo 3.1 - Lite",
      "veo3.1-lite-low": "Veo 3.1 - Lite",
      "veo3.1-fast": "Veo 3.1 - Fast",
      "veo3.1-quality": "Veo 3.1 - Quality",
      "omni-flash": "Omni Flash",
      "veo2-fast": "Veo 2 - Fast",
      "veo2-quality": "Veo 2 - Quality",
    };
    const label = map[config.model] || config.model;
    // 方法1：嘗試直接 selectByText
    if (selectByText(label)) { log("Model set to", label); return; }
    // 方法2：找面板內的模型下拉選單（含 V 向下箭頭圖示的按鈕）
    const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const targetLower = norm(label);
    // 用 queryAllVisible 搜尋所有可見元素（含 Shadow DOM）
    const allEls = queryAllVisible(document);
    const dropdownTrigger = allEls.find(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 50 && r.height > 15 && r.height < 80)) return false;
      const t = norm(el.textContent);
      // 含模型名稱（Veo/omni）和速度描述（fast/lite/quality/flash）
      return /veo|omni/.test(t) && /fast|lite|quality|flash/.test(t);
    });
    if (dropdownTrigger) {
      log("[Model] Found dropdown trigger:", (dropdownTrigger.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40));
      click(dropdownTrigger);
      // 等待 dropdown 展開（多層等待）
      return new Promise(resolve => {
        let attempts = 0;
        const maxAttempts = 5;
        const tryFind = () => {
          attempts++;
          const options = queryAllVisible(document).filter(el => {
            const r = el.getBoundingClientRect();
            if (!(r.width > 20 && r.height > 10)) return false;
            const t = norm(el.textContent);
            // 匹配：含 "veo" 和 "lite"（忽略空格/dash/emoji）
            const clean = t.replace(/[\s\-_🎤🔊🎶🎵]/g, " ").trim();
            return clean.includes("veo") && clean.includes("lite");
          });
          if (options.length > 0) {
            // 取最小的元素（最精確的匹配）
            const best = options.sort((a, b) => {
              const ra = a.getBoundingClientRect();
              const rb = b.getBoundingClientRect();
              return (ra.width * ra.height) - (rb.width * rb.height);
            })[0];
            click(best);
            log("Model set to", label, "(from dropdown, attempt", attempts, ")");
            resolve();
          } else if (attempts < maxAttempts) {
            setTimeout(tryFind, 600);
          } else {
            log("Model not found in dropdown:", label, "- available dropdown items:", JSON.stringify(
              queryAllVisible(document).filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 20 && r.height > 10 && r.height < 60 &&
                  /veo|omni|flash|lite|fast|quality/i.test(norm(el.textContent));
              }).map(el => norm(el.textContent).slice(0, 30))
            ));
            try { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch(e) {}
            resolve();
          }
        };
        setTimeout(tryFind, 1000); // 首次等待1秒
      });
    }
    log("Model not found in UI:", label, "available:", JSON.stringify(optionLabels(15)));
  }

  function setImageModel() {
    if (!config.imageModel) return;
    const map = {
      "nano-banana-pro": "🍌 Nano Banana Pro",
      "nano-banana-2": "🍌 Nano Banana 2",
      "nano-banana-2-lite": "🍌 Nano Banana 2 Lite",
    };
    const label = map[config.imageModel] || config.imageModel;
    if (selectByText(label) || selectFuzzy(label)) { log("Image model set to", label); return; }
    // 方法2：找模型下拉觸發鈕（含 arrow_drop_down + banana/nano），點開後選選項（同 setModel 的作法）
    const norm = s => (s || "").replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
    const target = norm(label);
    const trigger = queryAllVisible(document).find(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 50 && r.height > 15 && r.height < 60)) return false;
      const t = norm(el.textContent);
      return /arrow_drop_down/.test(t) && /banana|nano/.test(t);
    });
    if (trigger) {
      log("[ImageModel] Found dropdown trigger:", (trigger.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40));
      click(trigger);
      return new Promise(resolve => {
        let attempts = 0;
        const tryFind = () => {
          attempts++;
          const options = queryAllVisible(document).filter(el => {
            const r = el.getBoundingClientRect();
            if (!(r.width > 20 && r.height > 10 && r.height < 60)) return false;
            const t = norm(el.textContent);
            return t.includes(target);
          });
          if (options.length > 0) {
            const best = options.sort((a, b) => {
              const ra = a.getBoundingClientRect();
              const rb = b.getBoundingClientRect();
              return (ra.width * ra.height) - (rb.width * rb.height);
            })[0];
            click(best);
            log("Image model set to", label, "(from dropdown, attempt", attempts + ")");
            resolve();
          } else if (attempts < 5) {
            setTimeout(tryFind, 600);
          } else {
            log("Image model not found in dropdown:", label, "- available:", JSON.stringify(
              queryAllVisible(document).filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 20 && r.height > 10 && r.height < 60 && /banana|nano/.test(norm(el.textContent));
              }).map(el => norm(el.textContent).slice(0, 30))
            ));
            try { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) {}
            resolve();
          }
        };
        setTimeout(tryFind, 1000);
      });
    }
    log("Image model not found in UI:", label);
  }

  function setImageMode(mode) {
    const m = mode || config.imageMode;
    if (!m) return;
    const map = { "new": "新圖片", "last": "上一張圖片", "new_image": "新圖片", "last_image": "上一張圖片" };
    const label = map[m] || m;
    if (selectByText(label) || selectFuzzy(label)) log("Image mode set to", label);
    else log("Image mode not found in UI:", label);
  }

  function setOutputs(n) {
    // Flow 面板內的數量按鈕格式為 "x1", "x2", "x3", "x4"
    if (selectByText(String(n))) { log("Outputs set to", n); return; }
    if (selectByText("x" + n)) { log("Outputs set to", n, "(x" + n + ")"); return; }
    // Fallback: 搜尋含數字的按鈕（用 queryAllVisible 含 Shadow DOM）
    const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const target = String(n);
    const btns = queryAllVisible(document).filter(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      // 排除 sidebar 和角色卡片
      const cls = (el.className || "").toString();
      if (/c4ba2852|16c4830a/.test(cls)) return false;
      return true;
    });
    const hit = btns.find(el => {
      const t = norm(el.textContent);
      return t === target || t === "x" + target || (t.length <= 5 && t.endsWith(target));
    });
    if (hit) { click(hit); log("Outputs set to", n); }
    else { log("Outputs not found:", n, "- available:", JSON.stringify(btns.map(b => norm(b.textContent)).filter(t => /^x?[1-4]$/.test(t)))); }
  }

  function setDuration(sec) {
    const v = String(sec);
    let candidates = [v];
    if (/^(\d+)-merge$/i.test(v)) {
      const base = v.replace(/-merge$/i, "");
      candidates = [base + "秒(合併)", base + "秒 (合併)"];
    } else if (/^\d+$/.test(v)) {
      candidates = [v + "秒"];
    }
    for (const c of candidates) {
      if (selectByText(c)) { log("Duration set to", c); return; }
    }
    // Fallback: 搜尋含秒數的元素（用 queryAllVisible 含 Shadow DOM）
    const norm = s => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
    const target = String(sec);
    const els = queryAllVisible(document).filter(el => {
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return false;
      const cls = (el.className || "").toString();
      if (/c4ba2852|16c4830a/.test(cls)) return false; // 排除 sidebar/角色卡片
      return true;
    });
    const hit = els.find(el => {
      const t = norm(el.textContent);
      return t === target + "秒" || t === target || (t.length <= 10 && t.includes(target) && /秒|s|sec/i.test(t));
    });
    if (hit) { click(hit); log("Duration set to", target + "秒 (fallback)"); return; }
    log("Duration not found:", candidates[0], "- 此模型可能不支援時長設定");
  }

  // --------------- Add matched assets via "+" button ---------------
  // Flow 的素材選擇器是單選模式，每次只加入一個素材。
  // 對每個匹配的角色：點 + → 開啟 picker → 點角色 → 點「添加到提示」→ 等待關閉 → 下一個。
  async function tryAddMatchedAssets(text) {
    const chars = charsInText(text);
    if (chars.length === 0) {
      log("No character/asset names matched in prompt, skipping add-asset step");
      return;
    }
    const ta = findPromptTextarea();
    if (!ta) return;
    const pressEscape = () => {
      try { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); } catch (e) { /* ignore */ }
    };
    const norm = s => (s || "").replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    // Find "+" button near prompt
    let plus = null;
    const taR = ta.getBoundingClientRect();
    // 方法1：向上搜尋父容器內的按鈕
    let node = ta;
    for (let i = 0; node && i < 6; i++) {
      node = node.parentElement;
      if (!node) break;
      plus = Array.from(node.querySelectorAll("button, [role='button']")).find(b => {
        const r = b.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return false;
        const t = (b.textContent || "").trim();
        const al = (b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "");
        return t === "+" || /add|新增|添加|加入|attach|素材|asset|character/i.test(t + " " + al);
      });
      if (plus) break;
    }
    // 方法2：全頁搜尋（含 Shadow DOM），找 prompt 附近的按鈕
    if (!plus) {
      const addRe = /^\+$|^add$|^add[_2]|^添加|^新增|^加入|^attach|素材|asset|character/i;
      const nearbyBtns = queryAllVisible(document).filter(el => {
        const r = el.getBoundingClientRect();
        if (!(r.width > 10 && r.height > 10)) return false;
        // 只找 prompt 附近的按鈕（垂直距離 < 150px）
        if (Math.abs(r.top - taR.top) > 150) return false;
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        const al = (el.getAttribute("aria-label") || "") + " " + (el.getAttribute("title") || "");
        return addRe.test(t) || addRe.test(al);
      });
      if (nearbyBtns.length > 0) {
        // 取離 prompt 最近的按鈕
        plus = nearbyBtns.sort((a, b) =>
          Math.abs(a.getBoundingClientRect().top - taR.top) - Math.abs(b.getBoundingClientRect().top - taR.top)
        )[0];
      }
    }
    if (!plus) { log("Add-asset (+) button not found near prompt"); return; }
    // Helper: find picker container
    function findPicker() {
      let p = Array.from(document.querySelectorAll(
        "dialog, [role='dialog'], [aria-modal='true'], [class*='picker'], [class*='asset'], [class*='library'], [class*='panel'], [class*='modal'], [class*='popup'], [class*='popover'], [class*='dropdown'], [class*='overlay']"
      )).find(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      if (!p) {
        p = Array.from(document.querySelectorAll("div, section, aside, nav")).find(el => {
          const r = el.getBoundingClientRect();
          if (!(r.width > 100 && r.height > 100)) return false;
          const s = getComputedStyle(el);
          return (parseInt(s.zIndex) || 0) > 100 || s.position === "fixed" || s.position === "sticky";
        });
      }
      return p;
    }
    // Helper: find "添加到提示" confirm button in picker
    function findConfirmBtn(picker) {
      if (!picker) return null;
      const btns = Array.from(picker.querySelectorAll("button, [role='button']")).filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      return btns.find(b => {
        const r = b.getBoundingClientRect();
        if (!(r.width > 0 && r.width < 500 && r.height < 60)) return false;
        const t = (b.textContent || "").replace(/\s+/g, " ").trim();
        return t.includes("添加到提示") || /^(Done|Confirm|OK|Select)$/i.test(t);
      });
    }
    // Helper: find matching character in picker
    function findCharInPicker(picker, name) {
      const nn = norm(name);
      const els = Array.from(picker.querySelectorAll("*")).filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      return els.find(el => {
        if (el.children.length === 0) {
          const t = norm(el.textContent);
          if (t === nn) return true;
        }
        const fullT = norm(el.textContent);
        if (fullT === nn) return true;
        const al = norm(
          (el.getAttribute("alt") || "") + " " +
          (el.getAttribute("aria-label") || "") + " " +
          (el.getAttribute("title") || "") + " " +
          (el.getAttribute("data-name") || "")
        );
        if (al.includes(nn)) return true;
        return false;
      });
    }
    // Add each character ONE AT A TIME
    let addedCount = 0;
    for (const name of chars) {
      // Click + to open picker
      click(plus);
      log("Clicked + for asset:", name);
      await sleep(2000);
      const picker = findPicker();
      if (!picker) { log("Picker not found for", name); pressEscape(); continue; }
      // Find and click the character
      const hit = findCharInPicker(picker, name);
      if (!hit) { log("Asset not found in picker:", name); pressEscape(); await sleep(500); continue; }
      click(hit);
      log("Selected asset:", name);
      await sleep(500);
      // Find and click confirm button
      const confirmBtn = findConfirmBtn(picker);
      if (confirmBtn) {
        click(confirmBtn);
        log("Confirmed adding:", name);
        addedCount++;
      } else {
        log("Confirm button not found for", name, "; trying body click");
        document.body.click();
      }
      await sleep(1000); // Wait for picker to close and prompt to update
    }
    log("Assets added:", addedCount, "of", chars.length);
  }

  // Frame handling
  function getFramesForPrompt(index) {
    const frames = config.frames || [];
    const total = frames.length;
    const perPrompt = Math.max(1, Math.ceil(total / queue.length));
    if (config.frameOption === "first") return total > 0 ? [frames[0]] : [];
    if (config.frameOption === "firstLast") {
      if (total === 0) return [];
      if (total === 1) return [frames[0]];
      return [frames[0], frames[total - 1]];
    }
    return frames.slice(index * perPrompt, (index + 1) * perPrompt);
  }

  // Auto character / voice
  function tryAutoCharacter(text) {
    if (!config.charEnabled) return;
    log("Auto character requested for:", text.slice(0, 50));
    const matched = charsInText(text);
    const names = matched.length > 0 ? matched : (config.defaultChar ? [config.defaultChar] : []);
    if (names.length === 0) {
      log("No character matched and no default character set, skipping");
      return;
    }
    for (const name of names) {
      if (selectCharacter(name)) {
        log("Character selected:", name);
        return;
      }
    }
    log("Character not found in UI:", names.join(", "));
  }

  function selectCharacter(name) {
    const nn = (name || "").trim();
    if (!nn) return false;
    const nnorm = nn.replace(/_/g, " ").toLowerCase();
    const normText = (s) => (s || "").replace(/_/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const hit = (s) => {
      const t = normText(s);
      if (!t) return false;
      if (t === nnorm) return true;
      return t.split(/[\s,，、;；|\\/]+/).includes(nnorm);
    };
    const leaves = Array.from(document.querySelectorAll("span, div, p, a, button, li, figcaption"))
      .filter(el => el.children.length === 0);
    for (const el of leaves) {
      if (normText(el.textContent) === nnorm) {
        if (click(el)) { log("Character text clicked:", nn); return true; }
      }
    }
    const cards = [];
    for (const img of Array.from(document.querySelectorAll("img[src]"))) {
      let node = img;
      for (let i = 0; node && i < 8; i++) {
        node = node.parentElement;
        if (!node) break;
        const tag = (node.tagName || "").toUpperCase();
        if (tag === "BUTTON" || tag === "A" || tag === "FIGURE" || tag === "LI" || tag === "DIV") {
          if (hit(node.textContent)) cards.push(node);
        }
      }
    }
    cards.sort((a, b) => ((a.textContent || "").length - (b.textContent || "").length));
    for (const card of cards) {
      if (click(card)) { log("Character card clicked:", nn); return true; }
    }
    for (const el of Array.from(document.querySelectorAll("button, [role='button'], [role='option'], li, a"))) {
      if (normText(el.textContent) === nnorm) {
        if (click(el)) { log("Character option clicked:", nn); return true; }
      }
    }
    return false;
  }

  function isVoiceDisabledForPrompt(text) { return /\[NOVOICE\]/i.test(text || ""); }
  function cleanPromptText(text) { return (text || "").replace(/\[NOVOICE\]\s*/i, ""); }
  function tryAutoVoice(text) {
    if (!config.voiceEnabled) return;
    if (isVoiceDisabledForPrompt(text)) { log("[NOVOICE] tag found: skipping voice selection"); return; }
    log("Auto voice requested for:", text.slice(0, 50));
    const matched = voiceNamesInText(text);
    const target = matched.length > 0 ? matched[0] : (config.defaultVoice || "");
    if (!target) { log("No voice matched and no default voice configured, skipping"); return; }
    const gender = voiceGender(target);
    const label = gender ? target + " - " + gender : target;
    if (selectByText(label)) { log("Voice selected:", label); return; }
    if (selectByText(target)) { log("Voice selected:", target); } else { log("Voice not found in UI:", label); }
  }
  const VOICES = [
    { name: "Achernar", gender: "female" }, { name: "Achird", gender: "male" },
    { name: "Algenib", gender: "male" }, { name: "Algieba", gender: "male" },
    { name: "Alnilam", gender: "male" }, { name: "Aoede", gender: "female" },
    { name: "Autonoe", gender: "female" }, { name: "Callirrhoe", gender: "female" },
    { name: "Charon", gender: "male" }, { name: "Despina", gender: "female" },
    { name: "Enceladus", gender: "male" }, { name: "Erinome", gender: "female" },
    { name: "Fenrir", gender: "male" }, { name: "Gacrux", gender: "female" },
    { name: "Iapetus", gender: "male" }, { name: "Kore", gender: "female" },
    { name: "Laomedeia", gender: "female" }, { name: "Leda", gender: "female" },
    { name: "Orus", gender: "male" }, { name: "Pulcherrima", gender: "female" },
    { name: "Puck", gender: "male" }, { name: "Rasalgethi", gender: "male" },
    { name: "Sadachbia", gender: "male" }, { name: "Sadaltager", gender: "male" },
    { name: "Schedar", gender: "male" }, { name: "Sulafat", gender: "female" },
    { name: "Umbriel", gender: "male" }, { name: "Vindemiatrix", gender: "female" },
    { name: "Zephyr", gender: "female" }, { name: "Zubenelgenubi", gender: "male" },
  ];
  function voiceGender(name) {
    const v = VOICES.find(x => x.name === name);
    return v ? (v.gender === "male" ? "男" : "女") : "";
  }
  function voiceNamesInText(text) {
    const p = normBase(text);
    const allNames = VOICES.map(v => v.name);
    return allNames.filter(n => charHitInContext(p, normBase(n), allNames) || tokensSubset(normBase(n), p));
  }

  // Auto-add character images
  function normBase(s) {
    return (s || "").replace(/_/g, " ").toLowerCase();
  }
  function tokens(s) {
    const parts = ((s || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fff]+/g, " ")
      .split(/\s+/)
      .filter(Boolean));
    return parts;
  }
  function charHitInContext(p, nn, allNames) {
    if (!nn || !p.includes(nn)) return false;
    const isCJK = /[\u4e00-\u9fff]/.test(nn);
    const others = allNames.map(m => normBase(m)).filter(m => m && m !== nn && m.includes(nn));
    const occs = [];
    let idx = p.indexOf(nn);
    while (idx !== -1) {
      const before = idx > 0 ? p[idx - 1] : null;
      const after = idx + nn.length < p.length ? p[idx + nn.length] : null;
      let absorbed = false;
      const isWordChar = ch => ch !== null && /[\w\u4e00-\u9fff]/.test(ch);
      if (isCJK) {
        if (isWordChar(before) || isWordChar(after)) {
          absorbed = others.length > 0 && others.some(m => p.includes(m));
        }
      } else {
        if (isWordChar(before) || isWordChar(after)) { absorbed = true; }
      }
      occs.push(!absorbed);
      idx = p.indexOf(nn, idx + 1);
    }
    return occs.some(hit => hit);
  }
  function charsInText(text) {
    const p = normBase(text);
    const pool = (config.charSelected && config.charSelected.length > 0)
      ? config.charSelected
      : (config.charNames || []);
    const allNames = pool.map(n => (n || "").trim()).filter(Boolean);
    return allNames
      .map(n => (n || "").trim())
      .filter(n => {
        const nn = normBase(n);
        if (!nn) return false;
        return charHitInContext(p, nn, allNames) || tokensSubset(nn, p) || tokensSubset(n, text);
      });
  }
  function tokensSubset(a, b) {
    const ta = tokens(a);
    const tb = tokens(b);
    if (ta.length === 0 || tb.length === 0 || ta.length > tb.length) return false;
    for (let i = 0; i <= tb.length - ta.length; i++) {
      let ok = true;
      for (let j = 0; j < ta.length; j++) {
        if (tb[i + j] !== ta[j]) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }
  function charMatched(fileName, names) {
    const base = normBase((fileName || '').replace(/\.[^.]+$/, ""));
    if (!base) return false;
    const allKnown = ((config && config.charNames) || []).map(m => normBase(m)).filter(Boolean);
    const allNorm = allKnown.length > 0 ? allKnown : names.map(m => normBase(m)).filter(Boolean);
    return names.some(n => {
      const nn = normBase(n);
      if (!nn) return false;
      const tb = tokens(base);
      const ta = tokens(nn);
      if (ta.length === 0 || tb.length === 0 || ta.length > tb.length) return false;
      for (let i = 0; i <= tb.length - ta.length; i++) {
        let ok = true;
        for (let j = 0; j < ta.length; j++) {
          if (tb[i + j] !== ta[j]) { ok = false; break; }
        }
        if (!ok) continue;
        const others = allNorm.filter(m => m !== nn && m.includes(nn));
        let absorbed = false;
        if (others.length > 0) {
          for (const m of others) {
            const tm = tokens(m);
            if (tm.length <= ta.length) continue;
            if (i - (tm.length - ta.length) >= 0) {
              let ext = true;
              for (let k = 0; k < tm.length; k++) {
                if (tb[i - (tm.length - ta.length) + k] !== tm[k]) { ext = false; break; }
              }
              if (ext) { absorbed = true; break; }
            }
            if (i + ta.length + (tm.length - ta.length) <= tb.length) {
              let ext = true;
              for (let k = 0; k < tm.length; k++) {
                if (tb[i + k] !== tm[k]) { ext = false; break; }
              }
              if (ext) { absorbed = true; break; }
            }
          }
        }
        if (!absorbed) return true;
      }
      return false;
    });
  }
  function tryAutoCharImages(text, promptFiles) {
    if (!config.charImageEnabled) return [];
    const textChars = charsInText(text);
    if (textChars.length === 0) return [];
    const pool = (promptFiles || []).filter(Boolean);
    const seen = new Set();
    const picked = [];
    for (const ch of textChars) {
      const poolHits = pool.filter(f => charMatched(f.name, [ch]));
      const hits = poolHits.length > 0 ? poolHits : (config.frames || []).filter(f => charMatched(f.name, [ch]));
      hits.forEach(f => { if (!seen.has(f.name)) { seen.add(f.name); picked.push(f); } });
    }
    if (picked.length > 0) { log("Char images matched:", picked.map(p => p.name).join(", ")); }
    return picked;
  }

  // Track generation progress & download
  let observedNodes = null;
  const downloadUrls = new Set();
  function snapshotMedia() {
    return new Set(Array.from(document.querySelectorAll("video, img")).map(m => m.src || m.currentSrc));
  }
  let mediaBefore = snapshotMedia();

  function shouldDownloadMedia(url, el) {
    if (!url) return false;
    if (/redirect|getMediaUrl|avatar|profile|icon|emoji|placeholder/i.test(url)) return false;
    if (/=(?:s|w|h)\d{1,4}(?:-c)?([?&]|$)/i.test(url)) return false;
    const u = url.split("?")[0];
    if (el && el.tagName === "VIDEO") {
      if (/^blob:/i.test(url)) return true;
      if (el.videoWidth > 0 && el.duration > 0) return true;
      return false;
    }
    if (/\.(png|jpe?g|webp|gif)$/i.test(u)) {
      const w = (el && (el.naturalWidth || el.width)) || 0;
      if (w >= 200) return true;
    }
    return false;
  }

  function observeResults(item) {
    const observer = new MutationObserver(() => {
      document.querySelectorAll("video, img").forEach(media => {
        const url = media.src || media.currentSrc;
        if (!url || downloadUrls.has(url)) return;
        if (!shouldDownloadMedia(url, media)) return;
        downloadUrls.add(url);
        autoDownload(url, item);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  async function autoDownload(url, item) {
    const isImage = /\.(png|jpg|jpeg|webp)$/i.test(url.split("?")[0]) || /image/i.test(item.text || "");
    const targetRes = isImage ? (config.imageRes || "2k").toLowerCase() : (config.videoRes || "1080p").toLowerCase();
    const skip = isImage && targetRes === "none";
    if (skip) { log("Image download skipped (configured: none)"); return; }
    let finalUrl = await trySelectResolution(url, isImage, targetRes);
    const folder = config.folder || "veo-folder-1";
    const safeFolder = folder.replace(/[\\/:*?"<>|]/g, "_").trim() || "veo-folder-1";
    let filename = (finalUrl || url).split("/").pop().split("?")[0] || `flow-${item.id}`;
    if (config.rename) {
      const ext = filename.split(".").pop() || (isImage ? "png" : "mp4");
      filename = `${safeFolder}/${item.id + 1}.${ext}`;
    } else {
      filename = `${safeFolder}/${filename}`;
    }
    try {
      await fetch(finalUrl || url)
        .then(r => r.blob())
        .then(blob => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          a.dataset.download = "true";
          a.click();
          URL.revokeObjectURL(a.href);
          log("Downloaded:", filename);
        });
    } catch (e) { log("Download failed:", e.message); }
  }

  async function trySelectResolution(url, isImage, res) {
    const candidates = document.querySelectorAll(
      "[role=menuitem], [role=option], button[aria-haspopup], [class*='quality'], [class*='res']"
    );
    const norm2 = (s) => String(s || "").toLowerCase().trim();
    for (const el of candidates) {
      const label = norm2(el.getAttribute("aria-label") || el.textContent);
      if (!label) continue;
      const isMatch = (!isImage && (label === res || label.startsWith(res))) ||
        (isImage && (label === res || label === res + " resolution"));
      if (isMatch && !/disabled/i.test(el.getAttribute("aria-disabled") || "")) {
        try { el.click(); log("Resolution option clicked:", res); await sleep(800); return url; } catch (e) {}
        break;
      }
    }
    if (/size=|resolution=|quality=/.test(url)) {
      const key = /size=/.test(url) ? "size" : /resolution=/.test(url) ? "resolution" : "quality";
      const replaced = url.replace(new RegExp(`([?&]${key}=)[^&]*`), `$1${encodeURIComponent(res)}`);
      if (replaced !== url) return replaced;
    }
    return url;
  }

  // Main batch loop
  async function runBatch() {
    log("Starting batch:", queue.length, "prompts, concurrency:", config.concurrency);
    log("[Config] mode=", config.mode, "aspect=", config.aspect, "model=", config.model,
      "imageModel=", config.imageModel, "outputCount=", config.outputCount, "duration=", config.duration,
      "charEnabled=", config.charEnabled, "defaultChar=", config.defaultChar,
      "charNames=", JSON.stringify(config.charNames || []),
      "charSelected=", JSON.stringify(config.charSelected || []));
    if (config.chainEnabled) {
      log("Chain Prompt enabled — processing sequentially, each item uses the previous video's last frame.");
    }

    const worker = async () => {
      while (queue.length > 0 && !stopped) {
        const item = queue.shift();
        if (!item) break;
        const res = await processOneWithRetry(item);
        if (res.ok) { reportItemStatus(item.id, "done"); }
        else { logError("Error on item", item.id, res.err); reportItemStatus(item.id, "error"); }
        if (queue.length > 0) await sleep(randWait() * 1000);
      }
    };

    const resumeIndex = config.resumeIndex || 0;
    if (resumeIndex > 0 && queue.length > resumeIndex) {
      log("Resuming: skipping", resumeIndex, "completed segments");
      queue.splice(0, resumeIndex);
    }

    const workers = Array.from(
      { length: Math.min(config.concurrency || 1, queue.length) },
      () => worker()
    );
    await Promise.all(workers);
    log("Batch finished, stopped:", stopped);
    stopped = false;
  }

  // Process one prompt
  async function processOne(item) {
    if (stopped) throw new Error("stopped");
    reportItemStatus(item.id, "running");
    mediaBefore = snapshotMedia();
    // Diagnostics on first item
    if (item.id === 0) {
      log("[Config] mode=", config.mode, "aspect=", config.aspect, "model=", config.model,
        "outputCount=", config.outputCount, "duration=", config.duration,
        "charEnabled=", config.charEnabled, "charNames=", JSON.stringify(config.charNames || []),
        "charSelected=", JSON.stringify(config.charSelected || []),
        "isImageMode=", (config.mode === "text2image" || config.mode === "image2image"));
      dumpPageElements();
      validateAndFixMode();
      autoScanCharacters();
      log("[After-fix] mode=", config.mode, "charNames=", JSON.stringify(config.charNames));
      // 警示：如果 config 有影片設定（model/aspect/duration）但模式是圖片，提示使用者
      const isImageMode = config.mode === "text2image" || config.mode === "image2image";
      if (isImageMode && (config.model || config.aspect || config.duration)) {
        log("[⚠️ WARNING] config.mode=" + config.mode + " 但有影片設定 (model=" + config.model + ", aspect=" + config.aspect + ", duration=" + config.duration + ")." +
          "如要生成影片，請在擴充功能面板切換為「文字轉影片」模式。");
      }
    }

    // Chain mode
    if (config.chainEnabled && config.mode === "frame2video") {
      if (chainLastFrame) {
        log("Chain: uploading last frame for item", item.id);
        const ok = await uploadFrames([chainLastFrame]);
        if (!ok) throw new Error("chain frame upload failed");
        chainLastFrame = null;
      } else if (resumeFrameFile) {
        log("Chain resume: uploading saved last frame for item", item.id);
        const ok = await uploadFrames([resumeFrameFile]);
        if (!ok) throw new Error("chain frame upload failed");
        resumeFrameFile = null;
      }
    }

    // Upload frames (non-chain)
    if (config.mode === "frame2video" && !config.chainEnabled) {
      const frames = getFramesForPrompt(item.id);
      if (frames.length > 0) {
        const ok = await uploadFrames(frames);
        if (!ok) throw new Error("frame upload failed");
      }
    }

    // Image-based modes
    const maxImages = Math.max(1, Math.min(10, parseInt(config.maxImages) || 2));
    let sliced = [];
    if (config.mode !== "frame2video" && config.mode !== "text2video" && config.mode !== "text2image") {
      const batch = config.frames || [];
      sliced = batch.slice(item.id * maxImages, (item.id + 1) * maxImages);
    }
    const charPicks = tryAutoCharImages(item.text, sliced);
    const uploadBatch = charPicks.length > 0 ? charPicks : sliced;
    if (uploadBatch.length > 0) {
      const ok = await uploadFrames(uploadBatch);
      if (!ok) throw new Error("input image upload failed");
    }

    // Fill prompt
    const textarea = findPromptTextarea();
    if (!textarea) throw new Error("prompt textarea not found");
    log("Prompt input:", textarea.tagName, "ce=" + textarea.isContentEditable, "placeholder=" + JSON.stringify(textarea.getAttribute("placeholder") || ""));
    textarea.focus();
    await sleep(200);
    setNativeValue(textarea, cleanPromptText(item.text));
    await sleep(500);
    verifyPromptFill(textarea, item.text);

    // Auto character / voice
    tryAutoCharacter(item.text);
    tryAutoVoice(item.text);

    // Set options
    await sleep(800);
    const isImageMode = config.mode === "text2image" || config.mode === "image2image";
    // 點擊模型選擇器按鈕開啟設定面板（如 "🍌 Nano Banana 2..."）
    const panelOpened = await openModelPanel();
    if (panelOpened) {
      // 面板已開啟：等待渲染後再 dump
      await sleep(1000);
      dumpPanelElements();
      // 如果模式不一致才切換（避免誤點模型選擇器按鈕導致面板關閉）
      const targetMode = isImageMode ? "image" : "video";
      if (flowCurrentMode && flowCurrentMode !== targetMode) {
        // 需要切換模式：找面板內的純模式 tab（排除含模型/比例文字的大按鈕）
        const modeRe = isImageMode ? /图片|image/i : /视频|video/i;
        const panelBtns = queryAllVisible(document).filter(el => {
          const r = el.getBoundingClientRect();
          if (!(r.width > 0 && r.height > 0)) return false;
          const t = (el.textContent || "").trim();
      // 排除模型選擇器按鈕（含 x1/x4/Nano/Veo 等，但不排除含 ratio 的 crop 按鈕）
      if (/x[1-4]|Nano|Veo|🍌|720|1080|视频.*720/.test(t)) return false;
          // 只匹配純模式 tab 文字（如 "图片"、"视频"）
          if (t.length > 10) return false;
          return modeRe.test(t);
        });
        if (panelBtns.length > 0) {
          click(panelBtns[0]);
          log("Panel: switched to", targetMode, "mode");
          await sleep(1500); // 等待面板重新渲染
          flowCurrentMode = targetMode;
          // 面板切換後重新 dump
          dumpPanelElements();
        }
      } else {
        log("Panel: mode already correct (" + targetMode + "), skipping switch");
      }
      // 切換子頁籤：text2video → 素材，frame2video → 帧
      if (!isImageMode && panelOpened) {
        const subTabRe = config.mode === "frame2video"
          ? /帧|frame/i
          : /素材|material|asset/i;
        const subTabs = queryAllVisible(document).filter(el => {
          const r = el.getBoundingClientRect();
          if (!(r.width > 30 && r.height > 15 && r.width < 200)) return false;
          const t = (el.textContent || "").trim();
          // 排除模型/比例/數量按鈕
          if (/crop_|x[1-4]|Nano|Veo|🍌|720|1080|arrow_drop/.test(t)) return false;
          // 長度限制放寬（"chrome_extension素材" = 18 chars）
          if (t.length > 25) return false;
          return subTabRe.test(t);
        });
        if (subTabs.length > 0) {
          // 檢查是否已選中（aria-pressed/selected 或 active class）
          const alreadyActive = subTabs.some(el =>
            el.getAttribute("aria-pressed") === "true" ||
            el.getAttribute("aria-selected") === "true" ||
            el.classList.contains("active") || el.classList.contains("selected")
          );
          if (!alreadyActive) {
            click(subTabs[0]);
            log("Panel: switched to sub-tab:", (subTabs[0].textContent || "").trim());
            await sleep(1000);
          } else {
            log("Panel: sub-tab already correct:", (subTabs[0].textContent || "").trim());
          }
        }
      }
    } else {
      await ensureOutputMode(isImageMode ? "image" : "video");
    }
    // 先設定面板選項（比例、模型、數量、時長）
    await sleep(400);
    setAspect();
    await sleep(300);
    if (isImageMode) {
      if (config.imageModel) await setImageModel();
      await sleep(300);
      // 圖片模式：使用該 prompt 的 per-prompt 圖片模式（新建/延用）
      const imgMode = (item && item.imageMode) || config.imageMode;
      const wantReuse = imgMode === "last";
      if (wantReuse && prevImage) {
        // 延用：上傳上一段生成的圖片作為輸入，並設為「上一張圖片」保持風格連貫
        log("Reuse: uploading previous image for item", item.id);
        const ok = await uploadFrames([prevImage]);
        await sleep(1500); // 等待上傳狀態穩定（上傳可能短暫停用送出鍵）
        if (ok) {
          setImageMode("last");
          await sleep(500);
        } else {
          log("Reuse: upload failed, falling back to new image");
          setImageMode("new");
          await sleep(400);
        }
      } else if (wantReuse && !prevImage) {
        // 第 1 段無上一張 → 改為新建
        log("Reuse: no previous image, using new image");
        setImageMode("new");
        await sleep(400);
      } else {
        setImageMode("new");
        await sleep(400);
      }
    } else {
      await setModel();
      await sleep(300);
    }
    setOutputs(parseInt(config.outputCount) || 1);
    await sleep(300);
    if (!isImageMode) {
      const sec = (item && (item.durationSec || item.duration)) || config.duration;
      if (sec) setDuration(sec);
      await sleep(500);
    }
    // 面板選項設定完成後，再加入匹配的角色素材（會打開/關閉 picker）
    await sleep(500);
    await tryAddMatchedAssets(item.text);
    // Submit（等待面板動畫完成和 DOM 穩定）
    await sleep(1200);
    // 送出前重新確認提示詞仍在——中間的面板/頁籤/picker 操作可能把輸入框清掉或重渲染
    const promptEl = findPromptTextarea();
    if (promptEl) {
      const cur = (promptEl.textContent || "").replace(/\s+/g, " ").trim();
      const want = cleanPromptText(item.text).replace(/\s+/g, " ").trim();
      if (cur.length === 0 || (want.length > 0 && !cur.includes(want.slice(0, 30)))) {
        log("[Submit] prompt empty/lost before submit, re-filling...");
        setNativeValue(promptEl, cleanPromptText(item.text));
        await sleep(600);
        verifyPromptFill(promptEl, item.text);
      } else {
        log("[Submit] prompt present before submit, len=" + cur.length);
      }
    }
    await submitPrompt(item);

    // Observe results
    observeResults(item);

    // Wait for generation
    await sleep(10000);

    // 圖片模式：擷取本段生成的圖片，存為 prevImage 供下一段「延用」使用
    if (isImageMode) {
      try {
        const media = await waitForResult(20000);
        if (media && media.tagName === "IMG") {
          const url = media.src || media.currentSrc;
          if (url) {
            const resp = await fetch(url);
            const blob = await resp.blob();
            prevImage = new File([blob], "prev-image.png", { type: "image/png" });
            log("Reuse: captured previous image", blob.size, "bytes");
          }
        } else {
          log("Reuse: no image result captured for item", item.id);
        }
      } catch (e) {
        log("Reuse: capture failed:", e.message);
      }
    }

    // Chain Prompt: capture last frame
    if (config.chainEnabled && config.mode === "frame2video") {
      try {
        const media = await waitForResult(60000);
        if (media) {
          const url = media.src || media.currentSrc;
          if (media.tagName === "VIDEO" || /\.(mp4|webm)/i.test(url)) {
            const frame = await captureLastFrame(url);
            if (frame) chainLastFrame = frame;
            try {
              const canvas = document.createElement("canvas");
              const v = document.createElement("video");
              v.muted = true; v.preload = "auto";
              v.src = url;
              await new Promise((res, rej) => {
                const t = setTimeout(() => rej(new Error("load timeout")), 15000);
                v.addEventListener("loadeddata", () => { clearTimeout(t); res(); }, { once: true });
                v.addEventListener("error", () => { clearTimeout(t); rej(new Error("load error")); }, { once: true });
              });
              v.currentTime = Math.max(0, (v.duration || 0) - 0.1);
              await new Promise(r => v.addEventListener("seeked", r, { once: true }));
              canvas.width = v.videoWidth || 1920;
              canvas.height = v.videoHeight || 1080;
              canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
              const dataURL = canvas.toDataURL("image/png");
              reportChainFrame(item.id, dataURL);
              reportItemResult(item.id, url);
              URL.revokeObjectURL && canvas.remove();
              if (prevSegmentFrame && chainRetriedCount[item.id] !== true) {
                const dist = await frameColorDistance(prevSegmentFrame, dataURL);
                if (dist !== null && dist > COLOR_GAP_THRESHOLD && chainRetriedCount[item.id] !== false) {
                  log("Item", item.id, "color transition gap detected (distance", dist.toFixed(3), "), auto retrying once");
                  reportItemRetry(item.id);
                  chainRetriedCount[item.id] = false;
                  const prevFrameForRetry = await dataURLToFile(prevSegmentFrame, "chain-last-frame.png");
                  chainLastFrame = prevFrameForRetry;
                  const retryRes = await processOneWithRetry(item);
                  if (retryRes.ok) { log("Item", item.id, "auto-retry succeeded"); }
                  else { log("Item", item.id, "auto-retry failed, keeping original output"); }
                  const mediaAfter = await waitForResult(60000);
                  if (mediaAfter) {
                    const url2 = mediaAfter.src || mediaAfter.currentSrc;
                    if (mediaAfter.tagName === "VIDEO" || /\.(mp4|webm)/i.test(url2)) {
                      const f2 = await captureLastFrame(url2);
                      if (f2) chainLastFrame = f2;
                    }
                  }
                  chainRetriedCount[item.id] = true;
                } else if (dist !== null) { chainRetriedCount[item.id] = true; }
              } else if (!prevSegmentFrame) { chainRetriedCount[item.id] = true; }
              prevSegmentFrame = dataURL;
            } catch (e) { log("preview report skipped:", e.message); }
          } else {
            const resp = await fetch(url);
            const blob = await resp.blob();
            chainLastFrame = new File([blob], "chain-last-frame.png", { type: "image/png" });
            reportChainFrame(item.id, await blobToDataURL(blob));
            log("Chain: image output saved as next input frame");
          }
        } else { log("Chain: no result media found for item", item.id); }
      } catch (e) { log("Chain frame capture skipped:", e.message); }
    }
    // Cut-first text-to-video result: report the generated media so the background can map it to the Segment Manifest.
    if (config.mode === "text2video") {
      const media = await waitForResult(60000);
      if (!media) throw new Error("video result not found");
      const url = media.src || media.currentSrc;
      if (!url) throw new Error("video result URL not found");
      reportItemResult(item.id, url, undefined, {
        segmentId: item.segmentId,
        cutId: item.cutId || item.sourceEntityId,
        durationSec: item.durationSec,
        localFileName: `${item.cutId || item.sourceEntityId || `cut-${item.id}`}.mp4`,
      });
      log("Video result reported for Cut", item.cutId || item.sourceEntityId, url.slice(0, 100));
    }
  }

  function blobToDataURL(blob) {
    return new Promise(resolve => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  }

  // Color transition detection
  async function frameColorDistance(dataURL1, dataURL2) {
    try {
      const draw = dataURL => new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const W = 64, H = 36;
          canvas.width = W; canvas.height = H;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, W, H);
          const data = ctx.getImageData(0, 0, W, H).data;
          let r = 0, g = 0, b = 0, n = data.length / 4;
          for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
          resolve([r / n / 255, g / n / 255, b / n / 255]);
        };
        img.onerror = () => reject(new Error("image load error"));
        img.src = dataURL;
      });
      const [c1, c2] = await Promise.all([draw(dataURL1), draw(dataURL2)]);
      const dr = Math.abs(c1[0] - c2[0]), dg = Math.abs(c1[1] - c2[1]), db = Math.abs(c1[2] - c2[2]);
      return Math.sqrt(dr * dr * 0.3 + dg * dg * 0.5 + db * db * 0.3);
    } catch (e) { log("frameColorDistance failed:", e.message); return null; }
  }
  const COLOR_GAP_THRESHOLD = 0.25;
  const CHAIN_MAX_RETRYS = 1;

  // Retry helper
  function sleepRand() {
    const min = Math.min(config.waitMin || 0, config.waitMax || 0);
    const max = Math.max(config.waitMin || 0, config.waitMax || 0);
    return (min + Math.random() * (max - min)) * 1000;
  }

  async function processOneWithRetry(item) {
    const MAX_FAIL_RETRIES = 2;
    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_FAIL_RETRIES; attempt++) {
      if (stopped) { log("Stop requested — aborting item", item.id); return { ok: false, err: new Error("stopped") }; }
      try { await processOne(item); return { ok: true }; }
      catch (err) {
        lastErr = err;
        if (attempt < MAX_FAIL_RETRIES && !stopped) {
          logError("Item", item.id, "failed (attempt", attempt + 1, "), retrying:", err.message);
          reportItemStatus(item.id, "retrying");
          await sleep(sleepRand());
        }
      }
    }
    return { ok: false, err: lastErr };
  }

  log("Content script ready. Waiting for START_BATCH message.");
})();
