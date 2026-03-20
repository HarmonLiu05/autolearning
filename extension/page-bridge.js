(function () {
  if (window.__AUTOLEARNING_PAGE_BRIDGE__) {
    return;
  }

  window.__AUTOLEARNING_PAGE_BRIDGE__ = true;

  const REQUEST_EVENT = "autolearning:bridge-request";
  const RESPONSE_EVENT = "autolearning:bridge-response";

  window.addEventListener(REQUEST_EVENT, async (event) => {
    const detail = event.detail || {};
    const requestId = detail.requestId;
    const type = detail.type;
    const payload = detail.payload || {};

    if (!requestId || !type) {
      return;
    }

    let response;

    try {
      if (type === "getEditorValue") {
        const result = await readEditorValue();
        response = { ok: true, value: result.value, meta: result.meta };
      } else if (type === "isEditorCopyContext") {
        response = { ok: true, active: isEditorCopyContext() };
      } else if (type === "get-editor-debug") {
        response = { ok: true, debug: await collectEditorDebug() };
      } else if (type === "setEditorValue") {
        response = { ok: setEditorValue(String(payload.code || "")) };
      } else if (type === "selectChoiceOptions") {
        response = await selectChoiceOptions(payload.labels || []);
      } else if (type === "submitSolution") {
        response = await clickSubmitButton();
      } else {
        response = { ok: false, error: "未知的 bridge 请求" };
      }
    } catch (error) {
      response = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }

    window.dispatchEvent(
      new CustomEvent(RESPONSE_EVENT, {
        detail: {
          requestId,
          response,
        },
      }),
    );
  });

  async function readEditorValue() {
    const monacoModel = pickMonacoModel();
    if (monacoModel) {
      return {
        value: normalizeCode(monacoModel.getValue()),
        meta: buildEditorMeta("monaco-model"),
      };
    }

    const copiedMonacoResult = await extractMonacoByCopy();
    if (copiedMonacoResult.value) {
      return copiedMonacoResult;
    }

    const codeMirror5 = pickCodeMirror5();
    if (codeMirror5) {
      return {
        value: normalizeCode(codeMirror5.getValue()),
        meta: buildEditorMeta("codemirror"),
      };
    }

    const aceEditor = pickAceEditor();
    if (aceEditor) {
      return {
        value: normalizeCode(aceEditor.getValue()),
        meta: buildEditorMeta("ace"),
      };
    }

    const textarea = pickTextarea();
    if (textarea) {
      return {
        value: normalizeCode(textarea.value),
        meta: buildEditorMeta("textarea"),
      };
    }

    return {
      value: readVisibleCodeDom(),
      meta: buildEditorMeta("visible-dom"),
    };
  }

  function setEditorValue(code) {
    const monacoModel = pickMonacoModel();
    if (monacoModel) {
      monacoModel.setValue(code);
      return true;
    }

    const codeMirror5 = pickCodeMirror5();
    if (codeMirror5) {
      codeMirror5.setValue(code);
      return true;
    }

    const aceEditor = pickAceEditor();
    if (aceEditor) {
      aceEditor.setValue(code, -1);
      return true;
    }

    const textarea = pickTextarea();
    if (textarea) {
      textarea.focus();
      textarea.value = code;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    return false;
  }

  async function clickSubmitButton() {
    const button = findSubmitButton();
    if (!(button instanceof HTMLElement)) {
      return { ok: false, error: "没有找到可点击的提交按钮。" };
    }

    button.click();
    return {
      ok: true,
      label: normalizeText(button.innerText || button.textContent || "提交"),
    };
  }

  async function selectChoiceOptions(labels) {
    const normalizedLabels = Array.from(
      new Set(
        (Array.isArray(labels) ? labels : [])
          .map((label) => String(label || "").trim().toUpperCase())
          .filter((label) => /^(A|B|C|D|对|错)$/.test(label)),
      ),
    );
    if (normalizedLabels.length === 0) {
      return { ok: false, labels: [], error: "没有有效选项标签。" };
    }

    const checkboxGroups = Array.from(document.querySelectorAll(".el-checkbox-group.checkbox-view")).filter(
      (node) => node instanceof Element && isVisible(node) && !isInsideAssistant(node),
    );

    if (checkboxGroups.length > 0) {
      const picked = await selectElementUiCheckboxGroup(checkboxGroups[0], normalizedLabels);
      return {
        ok: picked.length > 0,
        labels: picked,
        error: picked.length > 0 ? "" : "页面上下文里也没有成功勾选多选项。",
      };
    }

    return { ok: false, labels: [], error: "页面里没有找到可见的多选框分组。" };
  }

  async function selectElementUiCheckboxGroup(group, labels) {
    if (!(group instanceof Element)) {
      return [];
    }

    const optionLabels = Array.from(group.querySelectorAll("label.el-checkbox"));
    if (optionLabels.length === 0) {
      return [];
    }

    const picked = [];
    for (const targetLabel of labels) {
      const option = optionLabels.find((node) => getChoiceLabelFromElementUiNode(node) === targetLabel);
      if (!(option instanceof Element)) {
        continue;
      }
      if (!isElementUiCheckboxSelected(option)) {
        await bruteForceElementUiCheckbox(option);
      }
      if (isElementUiCheckboxSelected(option)) {
        picked.push(targetLabel);
      }
      await delay(120);
    }

    return picked;
  }

  async function bruteForceElementUiCheckbox(option) {
    if (!(option instanceof Element)) {
      return false;
    }

    const targets = [
      option.querySelector(".el-checkbox__inner"),
      option.querySelector(".el-checkbox__input"),
      option.querySelector(".el-checkbox__label"),
      option,
      option.querySelector("input.el-checkbox__original"),
    ].filter(Boolean);

    for (const target of targets) {
      if (!(target instanceof Element)) {
        continue;
      }
      dispatchDirectClick(target);
      await delay(90);
      if (isElementUiCheckboxSelected(option)) {
        return true;
      }
    }

    const input = option.querySelector("input.el-checkbox__original");
    if (input instanceof HTMLInputElement && !input.checked) {
      input.checked = true;
      input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      await delay(90);
    }

    return isElementUiCheckboxSelected(option);
  }

  function dispatchDirectClick(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    target.scrollIntoView?.({ block: "center", inline: "center", behavior: "auto" });
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + Math.max(1, rect.width / 2 || 1);
    const clientY = rect.top + Math.max(1, rect.height / 2 || 1);
    const mouseInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      button: 0,
    };

    if (typeof PointerEvent === "function") {
      for (const type of ["pointerdown", "pointerup"]) {
        target.dispatchEvent(
          new PointerEvent(type, {
            ...mouseInit,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
        );
      }
    }

    for (const type of ["mousedown", "mouseup", "click"]) {
      target.dispatchEvent(new MouseEvent(type, mouseInit));
    }
    target.click?.();
    return true;
  }

  function isElementUiCheckboxSelected(option) {
    if (!(option instanceof Element)) {
      return false;
    }
    const inputWrap = option.querySelector(".el-checkbox__input");
    return inputWrap instanceof Element
      ? inputWrap.classList.contains("is-checked")
      : false;
  }

  function getChoiceLabelFromElementUiNode(option) {
    if (!(option instanceof Element)) {
      return "";
    }

    const direct = normalizeText(
      option.querySelector(".letterSort, .el-checkbox__label .letterSort")?.textContent || "",
    )
      .replace(/[^A-Da-d]/g, "")
      .toUpperCase();
    if (/^[A-D]$/.test(direct)) {
      return direct;
    }

    const text = normalizeText(option.textContent || "").replace(/\s+/g, "").toUpperCase();
    const match = text.match(/^([A-D])(?:[\.、:：\)\）]|$)/);
    return match ? match[1] : "";
  }

  function findSubmitButton() {
    const selectors = [
      "button",
      "[role='button']",
      "a",
      ".ant-btn",
    ];

    const candidates = Array.from(document.querySelectorAll(selectors.join(",")));
    const submitPatterns = [/评测并提交/, /^提交$/, /提交代码/, /运行并提交/, /提交答案/];
    const debugPatterns = [/调试/, /运行/, /下一题/, /上一题/, /保存/];

    for (const candidate of candidates) {
      if (!(candidate instanceof HTMLElement) || !isVisible(candidate)) {
        continue;
      }

      const text = normalizeText(candidate.innerText || candidate.textContent || "");
      if (!text) {
        continue;
      }
      if (debugPatterns.some((pattern) => pattern.test(text))) {
        continue;
      }
      if (submitPatterns.some((pattern) => pattern.test(text))) {
        return candidate;
      }
    }

    return null;
  }

  function pickMonacoModel() {
    const monaco = resolveMonaco();
    if (!monaco?.editor?.getModels) {
      return null;
    }

    const models = monaco.editor
      .getModels()
      .filter((model) => model && typeof model.getValue === "function");

    if (models.length === 0) {
      return null;
    }

    return models.sort((left, right) => {
      return right.getValue().length - left.getValue().length;
    })[0];
  }

  function resolveMonaco() {
    if (window.monaco?.editor) {
      return window.monaco;
    }

    if (typeof window.require === "function") {
      try {
        const required = window.require("vs/editor/editor.main");
        if (required?.editor) {
          return required;
        }
        if (required?.monaco?.editor) {
          return required.monaco;
        }
      } catch {
        return null;
      }
    }

    return null;
  }

  async function extractMonacoByScrolling() {
    const monacoContext = pickBestMonacoContext();
    if (!monacoContext) {
      return "";
    }

    const { editorRoot, scrollable, linesRoot } = monacoContext;

    const lineMap = new Map();
    const lineHeight = detectMonacoLineHeight(linesRoot);
    const maxScrollTop = Math.max(scrollable.scrollHeight - scrollable.clientHeight, 0);
    const step = Math.max(lineHeight * 4, 72);
    const originalScrollTop = scrollable.scrollTop;
    const originalEditorScrollBehavior = scrollable.style.scrollBehavior;

    scrollable.style.scrollBehavior = "auto";
    scrollable.scrollTop = 0;
    dispatchMonacoScroll(scrollable);
    await waitForMonacoSettled();
    collectVisibleMonacoLines(lineMap, lineHeight, editorRoot);

    for (let top = 0; top <= maxScrollTop + step; top += step) {
      scrollable.scrollTop = Math.min(top, maxScrollTop);
      dispatchMonacoScroll(scrollable);
      await waitForMonacoSettled();
      collectVisibleMonacoLines(lineMap, lineHeight, editorRoot);
      if (scrollable.scrollTop >= maxScrollTop) {
        break;
      }
    }

    scrollable.scrollTop = originalScrollTop;
    scrollable.style.scrollBehavior = originalEditorScrollBehavior;
    dispatchMonacoScroll(scrollable);
    await waitForMonacoSettled();

    if (lineMap.size === 0) {
      return "";
    }

    const maxLineNumber = Math.max(...lineMap.keys());
    const lines = [];
    for (let lineNumber = 1; lineNumber <= maxLineNumber; lineNumber += 1) {
      lines.push(lineMap.get(lineNumber) || "");
    }
    return normalizeCode(lines.join("\n"));
  }

  async function extractMonacoByCopy() {
    const monacoContext = pickBestMonacoContext();
    if (!monacoContext) {
      return "";
    }

    const { editorRoot } = monacoContext;
    const textarea = editorRoot.querySelector("textarea.inputarea");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return "";
    }

    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousScrollX = window.scrollX;
    const previousScrollY = window.scrollY;
    const visibleLineHint = getMaxVisibleLineNumber(editorRoot);

    let previousClipboardText = "";
    let canRestoreClipboard = false;

    try {
      if (navigator.clipboard?.readText && navigator.clipboard?.writeText) {
        try {
          previousClipboardText = await navigator.clipboard.readText();
          canRestoreClipboard = true;
        } catch {
          canRestoreClipboard = false;
        }
      }

      focusMonacoEditor(editorRoot, textarea);
      await waitForMonacoSettled();

      await triggerMonacoShortcut(textarea, { key: "a", code: "KeyA", ctrlKey: true });
      await triggerMonacoShortcut(textarea, { key: "a", code: "KeyA", metaKey: true });
      await waitForMonacoSettled();

      let copiedText = await copySelectionAndCapture();

      if (!copiedText && navigator.clipboard?.readText) {
        copiedText = await navigator.clipboard.readText().catch(() => "");
      }

      const normalized = normalizeCode(copiedText);
      if (normalized) {
        const lineCount = normalized.split("\n").length;
        if (lineCount > 1 || visibleLineHint <= 1) {
          return {
            value: normalized,
            meta: buildEditorMeta("monaco-copy", {
              visibleLineHint,
              clipboardRestore: canRestoreClipboard,
            }),
          };
        }
      }

      return {
        value: "",
        meta: buildEditorMeta("monaco-copy-empty", {
          visibleLineHint,
          clipboardRestore: canRestoreClipboard,
        }),
      };
    } finally {
      if (canRestoreClipboard && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(previousClipboardText).catch(() => {});
      }

      if (previousActiveElement?.focus) {
        previousActiveElement.focus({ preventScroll: true });
      }
      window.scrollTo(previousScrollX, previousScrollY);
    }
  }

  function buildEditorMeta(source, extras = {}) {
    const monacoContext = pickBestMonacoContext();
    return {
      source,
      monacoGlobal: Boolean(resolveMonaco()),
      monacoContextFound: Boolean(monacoContext),
      visibleLineHint: monacoContext ? getMaxVisibleLineNumber(monacoContext.editorRoot) : 0,
      ...extras,
    };
  }

  async function collectEditorDebug() {
    const monaco = resolveMonaco();
    const monacoContext = pickBestMonacoContext();
    const models =
      monaco?.editor?.getModels?.().map((model, index) => {
        const value = typeof model.getValue === "function" ? model.getValue() : "";
        return {
          index,
          lineCount: value ? value.split("\n").length : 0,
          charCount: value.length,
          uri: typeof model.uri?.toString === "function" ? model.uri.toString() : "",
          preview: normalizeCode(value).slice(0, 300),
        };
      }) || [];

    const copyAttempt = await extractMonacoByCopy().catch((error) => ({
      value: "",
      meta: {
        source: "monaco-copy-error",
        error: error instanceof Error ? error.message : String(error),
      },
    }));

    const textarea = monacoContext?.editorRoot?.querySelector("textarea.inputarea");

    return {
      location: location.href,
      title: document.title,
      monacoGlobal: Boolean(monaco),
      modelCount: models.length,
      models,
      monacoContext: monacoContext
        ? {
            overflow: monacoContext.overflow,
            visibleLineHint: getMaxVisibleLineNumber(monacoContext.editorRoot),
            scrollTop: monacoContext.scrollable.scrollTop,
            scrollHeight: monacoContext.scrollable.scrollHeight,
            clientHeight: monacoContext.scrollable.clientHeight,
          }
        : null,
      textareaPresent: textarea instanceof HTMLTextAreaElement,
      textareaValueLength:
        textarea instanceof HTMLTextAreaElement ? textarea.value.length : 0,
      copyAttempt: {
        lineCount: copyAttempt.value ? copyAttempt.value.split("\n").length : 0,
        charCount: copyAttempt.value ? copyAttempt.value.length : 0,
        meta: copyAttempt.meta || null,
        preview: normalizeCode(copyAttempt.value || "").slice(0, 300),
      },
      visibleDomPreview: readVisibleCodeDom().slice(0, 300),
    };
  }

  function pickBestMonacoContext() {
    const editorRoots = Array.from(
      document.querySelectorAll("#task-right-panel .monaco-editor, .my-monaco-editor .monaco-editor"),
    ).filter((node) => node instanceof HTMLElement);

    const candidates = editorRoots
      .map((editorRoot) => {
        const scrollables = Array.from(
          editorRoot.querySelectorAll(".monaco-scrollable-element.editor-scrollable, .monaco-scrollable-element"),
        ).filter((node) => node instanceof HTMLElement);

        const scrollable = scrollables
          .sort((left, right) => {
            const leftOverflow = left.scrollHeight - left.clientHeight;
            const rightOverflow = right.scrollHeight - right.clientHeight;
            return rightOverflow - leftOverflow;
          })[0];

        const linesRoot = editorRoot.querySelector(".view-lines");
        if (!(scrollable instanceof HTMLElement) || !(linesRoot instanceof HTMLElement)) {
          return null;
        }

        return {
          editorRoot,
          scrollable,
          linesRoot,
          overflow: Math.max(scrollable.scrollHeight - scrollable.clientHeight, 0),
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.overflow - left.overflow);

    return candidates[0] || null;
  }

  function getMaxVisibleLineNumber(editorRoot) {
    const numberNodes = Array.from(editorRoot.querySelectorAll(".margin-view-overlays .line-numbers"));
    const lineNumbers = numberNodes
      .map((node) => Number.parseInt((node.textContent || "").trim(), 10))
      .filter((value) => Number.isFinite(value));
    return lineNumbers.length > 0 ? Math.max(...lineNumbers) : 0;
  }

  function collectVisibleMonacoLines(lineMap, lineHeight, editorRoot) {
    const numberNodes = Array.from(
      editorRoot.querySelectorAll(".margin-view-overlays .line-numbers"),
    );
    const lineNodes = Array.from(editorRoot.querySelectorAll(".view-lines .view-line"));

    const numberedEntries = numberNodes
      .map((node) => {
        const lineNumber = Number.parseInt((node.textContent || "").trim(), 10);
        const top = Number.parseFloat(node.parentElement?.style.top || "NaN");
        return {
          lineNumber,
          top,
        };
      })
      .filter((entry) => Number.isFinite(entry.lineNumber) && Number.isFinite(entry.top))
      .sort((left, right) => left.top - right.top);

    for (const node of lineNodes) {
      const top = Number.parseFloat(node.style.top || "NaN");
      if (!Number.isFinite(top)) {
        continue;
      }

      const candidate = findNearestLineNumber(numberedEntries, top, lineHeight);
      if (!candidate) {
        continue;
      }

      const text = normalizeCode(node.textContent || "");
      if (!text) {
        continue;
      }

      const previous = lineMap.get(candidate.lineNumber) || "";
      if (!previous || text.length > previous.length) {
        lineMap.set(candidate.lineNumber, text);
      }
    }
  }

  function findNearestLineNumber(entries, top, lineHeight) {
    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const entry of entries) {
      const distance = Math.abs(entry.top - top);
      if (distance <= Math.max(lineHeight * 0.6, 8) && distance < bestDistance) {
        best = entry;
        bestDistance = distance;
      }
    }

    return best;
  }

  function detectMonacoLineHeight(linesRoot) {
    const firstLine = linesRoot.querySelector(".view-line");
    const lineStyleHeight = Number.parseFloat(firstLine?.style.height || "NaN");
    if (Number.isFinite(lineStyleHeight) && lineStyleHeight > 0) {
      return lineStyleHeight;
    }

    const computed = window.getComputedStyle(linesRoot);
    const computedLineHeight = Number.parseFloat(computed.lineHeight || "NaN");
    if (Number.isFinite(computedLineHeight) && computedLineHeight > 0) {
      return computedLineHeight;
    }

    return 24;
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });
  }

  async function copySelectionAndCapture() {
    return new Promise((resolve) => {
      let done = false;

      const finish = (value) => {
        if (done) {
          return;
        }
        done = true;
        document.removeEventListener("copy", onCopy, false);
        resolve(value || "");
      };

      const onCopy = (event) => {
        const text = event.clipboardData?.getData("text/plain") || "";
        finish(text);
      };

      document.addEventListener("copy", onCopy, false);

      try {
        document.execCommand("copy");
      } catch {
        finish("");
        return;
      }

      window.setTimeout(() => {
        finish("");
      }, 120);
    });
  }

  async function waitForMonacoSettled() {
    await waitForPaint();
    await delay(90);
    await waitForPaint();
  }

  function focusMonacoEditor(editorRoot, textarea) {
    editorRoot.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    textarea.focus({ preventScroll: true });
    editorRoot.dispatchEvent(
      new MouseEvent("mouseup", {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    );
    textarea.focus({ preventScroll: true });
  }

  async function triggerMonacoShortcut(
    textarea,
    { key, code, ctrlKey = false, metaKey = false },
  ) {
    const eventInit = {
      key,
      code,
      ctrlKey,
      metaKey,
      bubbles: true,
      cancelable: true,
      composed: true,
    };

    textarea.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    textarea.dispatchEvent(new KeyboardEvent("keyup", eventInit));
    await delay(25);
  }

  function dispatchMonacoScroll(scrollable) {
    scrollable.dispatchEvent(new Event("scroll", { bubbles: true }));
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function pickCodeMirror5() {
    const nodes = document.querySelectorAll(".CodeMirror");
    for (const node of nodes) {
      if (node?.CodeMirror && typeof node.CodeMirror.getValue === "function") {
        return node.CodeMirror;
      }
    }
    return null;
  }

  function pickAceEditor() {
    if (!window.ace?.edit) {
      return null;
    }

    const node = document.querySelector(".ace_editor");
    if (!node) {
      return null;
    }

    try {
      return window.ace.edit(node);
    } catch {
      return null;
    }
  }

  function pickTextarea() {
    const selectors = [
      "#task-right-panel textarea",
      ".monaco-editor textarea.inputarea",
      "textarea:not([readonly]):not([disabled])",
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (node instanceof HTMLTextAreaElement) {
        return node;
      }
    }

    return null;
  }

  function isEditorCopyContext() {
    const activeElement = document.activeElement;
    if (isInsideAssistant(activeElement)) {
      return false;
    }

    if (isCodeEditorElement(activeElement)) {
      return true;
    }

    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode || null;
    const focusNode = selection?.focusNode || null;

    return isCodeEditorNode(anchorNode) || isCodeEditorNode(focusNode);
  }

  function isCodeEditorNode(node) {
    if (!(node instanceof Node)) {
      return false;
    }

    const element = node instanceof Element ? node : node.parentElement;
    return isCodeEditorElement(element);
  }

  function isCodeEditorElement(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    return Boolean(
      element.closest(
        "#task-right-panel, .monaco-editor, .CodeMirror, .ace_editor, .cm-editor, .cm-content, textarea",
      ),
    );
  }

  function isInsideAssistant(node) {
    if (!(node instanceof Node)) {
      return false;
    }

    const host = document.getElementById("autolearning-host");
    return host instanceof HTMLElement ? host.contains(node) : false;
  }

  function isVisible(node) {
    if (!(node instanceof Element)) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function readVisibleCodeDom() {
    const monacoLines = Array.from(
      document.querySelectorAll(".monaco-editor .view-line"),
    )
      .map((node) => node.textContent || "")
      .join("\n");

    if (normalizeCode(monacoLines).trim()) {
      return normalizeCode(monacoLines);
    }

    const cmLines = Array.from(document.querySelectorAll(".cm-content"))
      .map((node) => node.textContent || "")
      .join("\n");

    if (normalizeCode(cmLines).trim()) {
      return normalizeCode(cmLines);
    }

    return "";
  }

  function normalizeCode(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n");
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
})();
