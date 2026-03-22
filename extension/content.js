(function () {
  const SUPPORTED_SITE_HOSTS = ["zhihuishu.com", "educoder.net"];

  function isSupportedLearningSite(hostname) {
    const host = String(hostname || "").trim().toLowerCase();
    if (!host) {
      return false;
    }
    return SUPPORTED_SITE_HOSTS.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
    if (mode === "choice") {
      renderGeneratedCode("");
    } else {
      renderCompactCodeCopyStatus(false);
    }
  }

  if (window.top !== window) {
    installFrameShortcutRelay();
    return;
  }

  if (!isSupportedLearningSite(location.hostname)) {
    return;
  }

  if (window.__AUTOLEARNING_CONTENT__) {
    return;
  }

  window.__AUTOLEARNING_CONTENT__ = true;

  const BRIDGE_REQUEST_EVENT = "autolearning:bridge-request";
  const BRIDGE_RESPONSE_EVENT = "autolearning:bridge-response";
  const PANEL_ID = "autolearning-panel";
  const LAUNCHER_ID = "autolearning-launcher";
  const STYLE_ID = "autolearning-style";
  const HOST_ID = "autolearning-host";
  const POSITION_STORAGE_KEY = "autolearningLauncherPosition";
  const FIXED_CAPTURE_STORAGE_KEY = "autolearningFixedCaptureRegions";
  const CUSTOM_EXTRACT_STORAGE_KEY = "autolearningCustomExtractRules";
  const QUESTION_BANK_STORAGE_KEY = "autolearningQuestionBankV1";
  const GITHUB_AUTH_STORAGE_KEY = "autolearningGithubAuthSession";
  const QUESTION_BANK_CATEGORY_DEFS = [
    { key: "educoder", label: "Educoder" },
    { key: "zhihuishu", label: "智慧树" },
    { key: "leetcode", label: "LeetCode" },
    { key: "general", label: "通用" },
  ];
  const QUESTION_BANK_CATEGORIES = QUESTION_BANK_CATEGORY_DEFS.map((item) => item.key);
  const LAUNCHER_SIZE = 62;
  const PANEL_GAP = 12;
  const PANEL_MAX_WIDTH = 420;
  const MOBILE_BREAKPOINT = 720;
  const DRAG_THRESHOLD = 6;
  const PANEL_VISIBLE_STRIP = 72;
  const LAUNCHER_ICON_URL = chrome.runtime.getURL("assets/launcher-logo.png");
  const SPINNER_ICON_URL = chrome.runtime.getURL("assets/spinner-logo.png");
  const DEFAULT_CHOICE_PROMPT =
    "当前页面大概率是选择题、判断题、概念题或简答型理论题。请优先输出最终答案，而不是写完整程序。若题目是单选题，code 字段只放最终选项，例如 A、B、C、D；若是多选题，code 字段只放选项组合，例如 AC；若是判断题，code 字段只放“对”或“错”；若是简短填空或概念问答，code 字段只放最终可直接填写的简短答案。不要输出 main 函数，不要伪造代码。approach 用 3 到 5 句简洁说明你的判断依据，重点使用关键词匹配、概念定义和排除法。";
  const DEFAULT_CODE_PROMPT =
    "当前页面大概率是编程题、代码填空题或需要补全模板的题。只要当前编辑器里已经有非空代码模板，你就必须基于这份模板补全，不能擅自重写整体结构。不要改函数签名、类名、输入输出格式、主流程结构、已有辅助函数名和注释约定；只补全 TODO、空函数、占位返回值、核心逻辑以及必要 import。若题面与模板冲突，优先遵循题面和样例，但仍尽量在原模板内修正，不要另起一份独立实现。若当前编辑器为空，再正常生成完整答案。code 字段只放最终可提交或可复制的完整代码，不要在 code 里混入解释。尽量给出最稳妥、最容易通过样例和评测的做法。";

  const solveModelConfig = globalThis.AUTOLEARNING_SOLVE_MODELS || {};
  const SOLVE_MODELS = Array.isArray(solveModelConfig.SOLVE_MODELS) ? solveModelConfig.SOLVE_MODELS : [];
  const SUPPORTED_SOLVE_MODELS = Array.isArray(solveModelConfig.SUPPORTED_SOLVE_MODELS)
    ? solveModelConfig.SUPPORTED_SOLVE_MODELS
    : ["gpt-5.4-mini"];
  const DEFAULT_ACTIVE_SOLVE_MODEL = String(solveModelConfig.DEFAULT_ACTIVE_SOLVE_MODEL || "gpt-5.4-mini");
  const MODEL_ICON_URLS = Object.fromEntries(
    SOLVE_MODELS.map((item) => [item.value, chrome.runtime.getURL(item.icon)]),
  );

  const state = {
    mounted: false,
    solving: false,
    fullAutoRunning: false,
    fullAutoStopRequested: false,
    fullAutoRunToken: 0,
    fullAutoRound: 0,
    problem: null,
    result: null,
    history: [],
    lastUrl: location.href,
    launcherPosition: null,
    panelManualPosition: null,
    dragPointerId: null,
    dragStartPointer: null,
    dragStartPosition: null,
    isDraggingLauncher: false,
    suppressLauncherClick: false,
    dragSource: "",
    clipboardSyncInstalled: false,
    clipboardSyncPending: false,
    lastAutoSolveCode: "",
    noticeTimer: 0,
    statusHintTimerShort: 0,
    statusHintTimerLong: 0,
    statusBusy: false,
    statusHint: "准备就绪",
    currentSolveRequestId: "",
    solveCancelRequested: false,
    promptPreview: null,
    screenshotShortcutInstalled: false,
    frameShortcutBridgeInstalled: false,
    fixedCaptureRegion: null,
    customStatementRule: null,
    questionBank: {},
    questionBankLoaded: false,
    questionBankReviewQueue: [],
    lastQuestionBankHit: null,
    reviewModalOpen: false,
    reviewModalRefresh: null,
    cloudSyncStarted: false,
    githubAuth: null,
    settings: {
      promptMode: "choice",
      extraInstructionsChoice: DEFAULT_CHOICE_PROMPT,
      extraInstructionsCode: DEFAULT_CODE_PROMPT,
      includeScreenshotInSolver: true,
      autoSolveAfterCapture: true,
      screenshotShortcut: "Alt+Shift+S",
      fullPageScreenshotShortcut: "Alt+Shift+F",
      fullAutoShortcut: "Alt+Shift+A",
      autoSubmitAfterFullCapture: false,
      fullAutoNextDelayMs: 1500,
      autoPickNextDelayMs: 600,
      fullAutoMode: "extract",
      activeSolveModel: DEFAULT_ACTIVE_SOLVE_MODEL,
      serverOrigin: "http://03hhhx.dpdns.org",
      cloudRepoOwner: "liuhexiong",
      cloudRepoName: "question-bank",
      cloudRepoBranch: "main",
      cloudAutoSync: false,
      contributionEmail: "",
    },
  };

  const elements = {};

  installBridge();
  bootstrap();
  observePageChanges();

  function bootstrap() {
    if (state.mounted) {
      return;
    }

    state.mounted = true;
    mountUi();
    installAutoClipboardSync();
    installScreenshotShortcut();
    installFrameShortcutBridge();
    void hydrateFixedCaptureRegion();
    void hydrateCustomStatementRule();
    void hydrateQuestionBank();
    void hydrateGitHubAuthStatus({ forceRefresh: true, silent: true });
    renderSummary("插件已在当前页面就绪。你可以直接截图、读剪贴板，或先识别当前页面内容。");
    renderGeneratedTitle("");
    renderCurrentClassification(null);
    renderPromptPreview("还没有可预览的内容。");
    renderScreenshotStatus(null);
    renderOcrText("");
    renderGeneratedCode("");
    renderCompactCodeCopyStatus(false);
    syncActiveSolveModelUi();
    renderPlatformSummary();
    syncPromptModeUi();
    renderHistory([]);
    setStatus("插件已在当前网站启用。");
  }

  function observePageChanges() {
    const observer = new MutationObserver(() => {
      if (location.href !== state.lastUrl) {
        state.lastUrl = location.href;
        state.problem = null;
        state.result = null;
        state.lastQuestionBankHit = null;
        state.lastAutoSolveCode = "";
        state.promptPreview = null;
        state.panelManualPosition = null;
        markResultReady(false);
        renderGeneratedTitle("");
        renderCurrentClassification(null);
        renderPromptPreview("页面已切换，等待重新提取当前关卡内容。");
        renderScreenshotStatus(null);
        renderOcrText("");
        state.fixedCaptureRegion = null;
        void hydrateFixedCaptureRegion();
        state.customStatementRule = null;
        void hydrateCustomStatementRule();
      }
      bootstrap();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    window.setInterval(() => {
      if (location.href !== state.lastUrl) {
        state.lastUrl = location.href;
        state.problem = null;
        state.result = null;
        state.lastQuestionBankHit = null;
        state.lastAutoSolveCode = "";
        state.promptPreview = null;
        state.panelManualPosition = null;
        markResultReady(false);
        renderGeneratedTitle("");
        renderCurrentClassification(null);
        renderPromptPreview("页面已切换，等待重新提取当前关卡内容。");
        renderScreenshotStatus(null);
        renderOcrText("");
        state.fixedCaptureRegion = null;
        void hydrateFixedCaptureRegion();
        state.customStatementRule = null;
        void hydrateCustomStatementRule();
      }
      bootstrap();
    }, 1200);
  }

  function mountUi() {
    injectStyles();

    const host = document.createElement("div");
    host.id = HOST_ID;
    host.innerHTML = `
      <button id="${LAUNCHER_ID}" type="button" aria-label="打开智拓"><span class="al-visually-hidden">智拓</span></button>
      <div id="autolearning-toast" aria-live="polite"></div>
      <aside id="${PANEL_ID}" data-open="false" aria-hidden="true">
        <div class="al-card">
          <header class="al-header">
            <div>
              <p class="al-kicker">智拓</p>
              <h2>智拓</h2>
              <p class="al-slogan">智启新知，拓学无界</p>
            </div>
            <div class="al-header-note">
              <p>多选题现在支持提取题面和选项。</p>
              <p>单选题和多选题都支持自动勾选。</p>
              <p>多选题自动勾选后请确认选择是否完整。</p>
            </div>
            <button class="al-close" type="button" aria-label="关闭面板"><span class="al-visually-hidden">关闭</span></button>
          </header>

          <section class="al-status-card" data-role="status-card" data-busy="false">
            <div class="al-status-icon" aria-hidden="true">
              <span class="al-status-spinner"></span>
            </div>
            <div class="al-status-copy">
              <p class="al-status-label">当前状态</p>
              <p class="al-status" data-role="status">初始化中...</p>
              <p class="al-status-hint" data-role="status-hint">准备就绪</p>
            </div>
            <div class="al-status-actions">
              <button class="al-api-key-action" data-role="open-api-key" type="button">获取 API Key</button>
              <button class="al-status-action" data-role="status-action" type="button">提交</button>
            </div>
          </section>

          <section class="al-model-switcher">
            <div class="al-model-switcher-head">
              <div>
                <p class="al-model-switcher-label">当前模型</p>
                <p class="al-model-switcher-hint">切换后会影响后续“生成答案”，文本和截图解题统一使用同一个模型。</p>
              </div>
              <select class="al-model-select" data-role="active-solve-model" aria-label="当前模型">
                ${renderSolveModelOptions()}
              </select>
            </div>
          </section>

          <div class="al-actions al-actions-primary">
            <button data-role="extract" type="button">提取题面</button>
            <button data-role="solve" type="button" class="al-primary">生成答案</button>
            <button data-role="capture-primary" type="button" hidden>框选截图</button>
            <button data-role="full-auto" type="button">开启全自动</button>
            <button data-role="edit-question-bank" type="button">编辑题库</button>
          </div>
          <div class="al-summary" data-role="mode-flow-hint">先选题型，再提取题面或生成答案。</div>

          <section class="al-section">
            <div class="al-code-head">
              <h3>云端题库</h3>
            </div>
            <div class="al-actions al-actions-secondary">
              <button data-role="cloud-sync" type="button">下载云端题库</button>
              <button data-role="open-contribution" type="button">贡献题库</button>
            </div>
            <div class="al-summary" data-role="platform-summary">云端题库会下载到本地缓存使用；下载云端题库需要当前网络能访问 GitHub；贡献会打开 GitHub Issue 页面，由仓库自动处理。</div>
          </section>

          <section class="al-section" data-role="choice-answer-wrap" hidden>
            <div class="al-code-head">
              <h3>最终答案</h3>
              <button data-role="copy-choice-answer" type="button" class="al-link">复制</button>
            </div>
            <div data-role="choice-answer" class="al-choice-answer">还没有生成答案。</div>
          </section>

          <section class="al-section" data-role="compact-code-wrap">
            <div class="al-code-head">
              <h3 data-role="compact-preview-title">代码速览</h3>
              <button data-role="copy-compact-preview" type="button" class="al-link">复制</button>
              <span data-role="compact-code-copy-status" class="al-mini-status" hidden>已自动复制</span>
            </div>
            <pre data-role="compact-code" class="al-compact-code">还没有生成代码。</pre>
          </section>

          <section class="al-section">
            <h3>当前识别</h3>
            <div class="al-summary" data-role="summary"></div>
          </section>

          <section class="al-section" data-role="approach-wrap">
            <div class="al-code-head">
              <h3>解题思路</h3>
              <button data-role="copy-approach" type="button" class="al-link">复制</button>
            </div>
            <div class="al-result" data-role="approach">还没有生成内容。</div>
          </section>

          <section class="al-section">
            <div class="al-code-head">
              <h3>答题模式</h3>
              <div class="al-mode-switch" data-role="prompt-mode-switch">
                <button data-role="prompt-mode-choice" type="button" class="al-mode-button">选择题</button>
                <button data-role="prompt-mode-code" type="button" class="al-mode-button">代码题</button>
              </div>
            </div>
            <div class="al-summary" data-role="prompt-mode-summary">先选题型，再提取题面或生成答案。</div>
          </section>

          <details class="al-section al-details">
            <summary>
              <span>更多操作</span>
              <span class="al-details-summary-hint">点击展开</span>
            </summary>
            <div class="al-actions al-actions-secondary">
              <button data-role="capture" type="button">框选截图</button>
              <button data-role="define-capture-region" type="button">设定区域</button>
              <button data-role="pick-statement-element" type="button">选取题面元素</button>
              <button data-role="paste-code" type="button">读取剪贴板代码</button>
              <button data-role="settings" type="button">设置</button>
            </div>
            <section class="al-section">
              <div class="al-code-head">
                <h3>自定义题面</h3>
                <button data-role="clear-custom-statement-rule" type="button" class="al-link-button">清除规则</button>
              </div>
              <div data-role="custom-statement-rule-status" class="al-summary">当前页面还没有自定义题面规则。</div>
            </section>
            <section class="al-section">
              <div class="al-code-head">
                <h3>全自动模式</h3>
                <div class="al-mode-switch" data-role="full-auto-mode-switch">
                  <button data-role="full-auto-mode-capture" type="button" class="al-mode-button">截图全自动</button>
                  <button data-role="full-auto-mode-extract" type="button" class="al-mode-button">提取题面全自动</button>
                </div>
              </div>
              <div class="al-summary" data-role="full-auto-mode-summary">先选择全自动模式，再点击“开启全自动”。</div>
            </section>
            <section class="al-section">
              <div class="al-code-head">
                <h3>截图辅助</h3>
                <div class="al-inline-actions">
                  <button data-role="clear-screenshot-buffer" type="button" class="al-link-button" hidden>清空缓冲</button>
                </div>
              </div>
              <div data-role="screenshot-status" class="al-summary">还没有附带题面截图。</div>
            </section>
          </details>

          <details class="al-section al-details" data-role="prompt-preview-wrap">
            <summary>
              <span>高级信息</span>
              <span class="al-details-summary-hint">点击展开</span>
            </summary>
            <section class="al-section">
              <div class="al-code-head">
                <h3>发送给 AI 的内容预览</h3>
                <div class="al-inline-actions">
                  <button data-role="refresh-preview" type="button" class="al-link-button">刷新预览</button>
                  <button data-role="copy-preview" type="button" class="al-link-button">复制预览</button>
                </div>
              </div>
              <pre data-role="prompt-preview" class="al-details-content">还没有可预览的内容。</pre>
            </section>

            <section class="al-section">
              <div class="al-code-head">
                <h3>提取管理</h3>
                <div class="al-inline-actions">
                  <button data-role="copy-problem" type="button" class="al-link-button">复制 JSON</button>
                  <button data-role="export-problem" type="button" class="al-link-button">导出 JSON</button>
                  <button data-role="clear-problem" type="button" class="al-link-button">清空提取</button>
                </div>
              </div>
            </section>

            <section class="al-section">
              <h3>查看提取详情</h3>
              <pre data-role="details" class="al-details-content">还没有提取内容。</pre>
            </section>
          </section>

          <section class="al-section" data-role="code-wrap">
            <div class="al-code-head">
              <h3>生成代码</h3>
              <button data-role="copy-code" type="button" class="al-link">复制</button>
            </div>
            <textarea
              data-role="code"
              class="al-code"
              spellcheck="false"
              readonly
              placeholder="生成后的代码会显示在这里，可直接复制或填回编辑器。"
            ></textarea>
          </section>
        </div>
      </aside>
    `;

    document.documentElement.appendChild(host);

    elements.host = host;
    elements.launcher = host.querySelector(`#${LAUNCHER_ID}`);
    elements.toast = host.querySelector("#autolearning-toast");
    elements.panel = host.querySelector(`#${PANEL_ID}`);
    elements.statusCard = host.querySelector('[data-role="status-card"]');
    elements.status = host.querySelector('[data-role="status"]');
    elements.statusHint = host.querySelector('[data-role="status-hint"]');
    elements.statusAction = host.querySelector('[data-role="status-action"]');
    elements.statusSpinner = host.querySelector(".al-status-spinner");
    elements.activeSolveModel = host.querySelector('[data-role="active-solve-model"]');
    elements.summary = host.querySelector('[data-role="summary"]');
    elements.generatedTitle = host.querySelector('[data-role="generated-title"]');
    elements.problemType = host.querySelector('[data-role="problem-type"]');
    elements.problemDefinition = host.querySelector('[data-role="problem-definition"]');
    elements.approachWrap = host.querySelector('[data-role="approach-wrap"]');
    elements.codeWrap = host.querySelector('[data-role="code-wrap"]');
    elements.compactCodeWrap = host.querySelector('[data-role="compact-code-wrap"]');
    elements.approach = host.querySelector('[data-role="approach"]');
    elements.code = host.querySelector('[data-role="code"]');
    elements.compactCode = host.querySelector('[data-role="compact-code"]');
    elements.compactCodeCopyStatus = host.querySelector('[data-role="compact-code-copy-status"]');
    elements.compactPreviewTitle = host.querySelector('[data-role="compact-preview-title"]');
    elements.choiceAnswerWrap = host.querySelector('[data-role="choice-answer-wrap"]');
    elements.choiceAnswer = host.querySelector('[data-role="choice-answer"]');
    elements.modeFlowHint = host.querySelector('[data-role="mode-flow-hint"]');
    elements.promptModeSummary = host.querySelector('[data-role="prompt-mode-summary"]');
    elements.promptModeChoice = host.querySelector('[data-role="prompt-mode-choice"]');
    elements.promptModeCode = host.querySelector('[data-role="prompt-mode-code"]');
    elements.fullAutoModeCapture = host.querySelector('[data-role="full-auto-mode-capture"]');
    elements.fullAutoModeExtract = host.querySelector('[data-role="full-auto-mode-extract"]');
    elements.fullAutoModeSummary = host.querySelector('[data-role="full-auto-mode-summary"]');
    elements.details = host.querySelector('[data-role="details"]');
    elements.promptPreview = host.querySelector('[data-role="prompt-preview"]');
    elements.screenshotStatus = host.querySelector('[data-role="screenshot-status"]');
    elements.customStatementRuleStatus = host.querySelector('[data-role="custom-statement-rule-status"]');
    elements.clearScreenshotBuffer = host.querySelector('[data-role="clear-screenshot-buffer"]');
    elements.shortcutTip = host.querySelector('[data-role="shortcut-tip"]');
    elements.capturePrimaryButton = host.querySelector('[data-role="capture-primary"]');
    elements.captureMoreButton = host.querySelector('[data-role="capture"]');
    elements.fullAutoButton = host.querySelector('[data-role="full-auto"]');
    elements.platformSummary = host.querySelector('[data-role="platform-summary"]');
    elements.cloudSync = host.querySelector('[data-role="cloud-sync"]');
    elements.editQuestionBank = host.querySelector('[data-role="edit-question-bank"]');
    elements.openContribution = host.querySelector('[data-role="open-contribution"]');
    elements.questionBankSection = elements.platformSummary?.closest(".al-section") || null;
    elements.header = host.querySelector(".al-header");
    elements.ocrText = host.querySelector('[data-role="ocr-text"]');
    elements.historyList = host.querySelector('[data-role="history-list"]');

    const bindIfPresent = (selector, eventName, handler) => {
      host.querySelector(selector)?.addEventListener(eventName, handler);
    };

    bindIfPresent(".al-close", "click", closePanel);
    elements.statusAction?.addEventListener("click", () => {
      void handleStatusAction();
    });
    elements.launcher.addEventListener("click", togglePanel);
    bindIfPresent('[data-role="extract"]', "click", () => {
      void handleExtract();
    });
    bindIfPresent('[data-role="solve"]', "click", () => {
      void handleSolve();
    });
    elements.cloudSync?.addEventListener("click", () => {
      void handleCloudSync();
    });
    bindIfPresent('[data-role="open-contribution"]', "click", () => {
      void handleOpenQuestionBankEditor({ activeTab: "mine" });
    });
    bindIfPresent('[data-role="capture"]', "click", () => {
      void handleCaptureScreenshot();
    });
    bindIfPresent('[data-role="capture-primary"]', "click", () => {
      void handleCaptureScreenshot();
    });
    bindIfPresent('[data-role="define-capture-region"]', "click", () => {
      void handleDefineFixedCaptureRegion();
    });
    bindIfPresent('[data-role="pick-statement-element"]', "click", () => {
      void handlePickCustomStatementElement();
    });
    bindIfPresent('[data-role="full-auto"]', "click", () => {
      void handleToggleFullAuto();
    });
    bindIfPresent('[data-role="settings"]', "click", () => {
      void handleOpenSettings();
    });
    bindIfPresent('[data-role="open-api-key"]', "click", () => {
      void handleOpenSettings();
    });
    bindIfPresent('[data-role="edit-question-bank"]', "click", () => {
      void handleOpenQuestionBankEditor();
    });
    bindIfPresent('[data-role="paste-code"]', "click", () => {
      void handlePasteCode();
    });
    elements.promptModeChoice?.addEventListener("click", () => {
      void handlePromptModeSwitch("choice");
    });
    elements.promptModeCode?.addEventListener("click", () => {
      void handlePromptModeSwitch("code");
    });
    elements.fullAutoModeCapture?.addEventListener("click", () => {
      void handleFullAutoModeSwitch("capture");
    });
    elements.fullAutoModeExtract?.addEventListener("click", () => {
      void handleFullAutoModeSwitch("extract");
    });
    elements.activeSolveModel?.addEventListener("change", (event) => {
      void handleActiveSolveModelChange(event);
    });
    bindIfPresent('[data-role="refresh-preview"]', "click", () => {
      void refreshPromptPreview();
    });
    bindIfPresent('[data-role="copy-preview"]', "click", () => {
      void handleCopyPromptPreview();
    });
    bindIfPresent('[data-role="copy-compact-preview"]', "click", () => {
      void handleCopyCompactPreview();
    });
    bindIfPresent('[data-role="copy-code"]', "click", () => {
      void handleCopy();
    });
    bindIfPresent('[data-role="copy-approach"]', "click", () => {
      void handleCopyApproach();
    });
    bindIfPresent('[data-role="copy-choice-answer"]', "click", () => {
      void handleCopyChoiceAnswer();
    });
    bindIfPresent('[data-role="copy-problem"]', "click", () => {
      void handleCopyProblem();
    });
    bindIfPresent('[data-role="export-problem"]', "click", () => {
      void handleExportProblem();
    });
    bindIfPresent('[data-role="clear-problem"]', "click", () => {
      handleClearProblemState();
    });
    bindIfPresent('[data-role="export-history"]', "click", () => {
      void handleExportHistoryMarkdown();
    });
    bindIfPresent('[data-role="refresh-history"]', "click", () => {
      void refreshHistory();
    });
    bindIfPresent('[data-role="clear-history"]', "click", () => {
      void handleClearHistory();
    });
    bindIfPresent('[data-role="clear-screenshot-buffer"]', "click", () => {
      void handleClearScreenshotBuffer();
    });
    bindIfPresent('[data-role="clear-custom-statement-rule"]', "click", () => {
      void handleClearCustomStatementRule();
    });

    initFloatingPosition();
    setupLauncherDrag();
    window.addEventListener("resize", handleViewportResize);
    chrome.storage?.onChanged?.addListener(handleStorageChanged);
    renderFullAutoButton();
    renderStatusActionButton();
    void hydrateInlineSettings();
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${HOST_ID} {
        position: fixed;
        top: 0;
        left: 0;
        z-index: 2147483647;
        pointer-events: none;
        font-family: "IBM Plex Sans", "PingFang SC", "Helvetica Neue", sans-serif;
      }

      #${HOST_ID} .al-visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      #${LAUNCHER_ID} {
        position: fixed;
        right: 18px;
        top: 112px;
        width: 62px;
        height: 62px;
        border: 0;
        border-radius: 999px;
        cursor: pointer;
        pointer-events: auto;
        overflow: hidden;
        background:
          url("${LAUNCHER_ICON_URL}") center/cover no-repeat,
          radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.18) 38%, transparent 39%),
          linear-gradient(180deg, #f4efe7 0%, #d7cec1 100%);
        border: 2px solid rgba(42, 36, 31, 0.14);
        box-shadow:
          0 18px 36px rgba(16, 24, 28, 0.24),
          inset 0 2px 10px rgba(255, 255, 255, 0.65);
        transition:
          transform 160ms ease,
          box-shadow 160ms ease,
          opacity 160ms ease;
      }

      #${LAUNCHER_ID}:hover {
        transform: translateY(-2px);
        box-shadow:
          0 22px 40px rgba(16, 24, 28, 0.28),
          inset 0 2px 10px rgba(255, 255, 255, 0.7);
      }

      #${LAUNCHER_ID}[data-has-result="true"]::after {
        content: "新";
        position: absolute;
        top: -6px;
        right: -6px;
        min-width: 22px;
        height: 22px;
        padding: 0 6px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        font-size: 11px;
        font-weight: 800;
        color: #fff8ef;
        background: linear-gradient(135deg, #ef8f3a 0%, #c83f2f 100%);
        box-shadow: 0 10px 24px rgba(200, 63, 47, 0.32);
      }

      #autolearning-toast {
        position: fixed;
        right: 18px;
        top: 72px;
        max-width: min(340px, calc(100vw - 28px));
        padding: 12px 14px;
        border-radius: 16px;
        color: #fff8ef;
        font-size: 13px;
        line-height: 1.5;
        background:
          radial-gradient(circle at top left, rgba(255, 204, 140, 0.24), transparent 42%),
          linear-gradient(135deg, rgba(219, 122, 48, 0.96) 0%, rgba(191, 79, 41, 0.96) 100%);
        box-shadow: 0 20px 42px rgba(133, 54, 25, 0.28);
        opacity: 0;
        transform: translateY(-8px);
        pointer-events: none;
        transition:
          opacity 180ms ease,
          transform 180ms ease;
      }

      #autolearning-toast[data-show="true"] {
        opacity: 1;
        transform: translateY(0);
      }

      #${PANEL_ID} {
        position: fixed;
        right: 18px;
        top: 176px;
        width: min(420px, calc(100vw - 28px));
        max-height: calc(100vh - 194px);
        overflow: hidden;
        transform: translateX(calc(100% + 18px));
        opacity: 0;
        pointer-events: none;
        transition:
          transform 220ms ease,
          opacity 220ms ease;
      }

      #${PANEL_ID}[data-open="true"] {
        transform: translateX(0);
        opacity: 1;
        pointer-events: auto;
      }

      #${PANEL_ID} .al-card {
        display: grid;
        gap: 14px;
        padding: 18px;
        max-height: calc(100vh - 194px);
        overflow-y: auto;
        overscroll-behavior: contain;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 24px;
        color: #f3f2ef;
        background:
          radial-gradient(circle at top right, rgba(219, 122, 48, 0.22), transparent 32%),
          linear-gradient(180deg, rgba(13, 23, 28, 0.96) 0%, rgba(15, 20, 24, 0.94) 100%);
        box-shadow: 0 28px 70px rgba(6, 13, 18, 0.38);
        backdrop-filter: blur(14px);
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 180, 107, 0.45) rgba(255, 255, 255, 0.08);
      }

      #${PANEL_ID} .al-card::-webkit-scrollbar {
        width: 10px;
      }

      #${PANEL_ID} .al-card::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.06);
        border-radius: 999px;
      }

      #${PANEL_ID} .al-card::-webkit-scrollbar-thumb {
        background: rgba(255, 180, 107, 0.4);
        border-radius: 999px;
      }

      #${PANEL_ID} .al-card::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 180, 107, 0.58);
      }

      #${PANEL_ID} .al-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        cursor: grab;
        user-select: none;
      }

      #${PANEL_ID} .al-header:active {
        cursor: grabbing;
      }

      #${PANEL_ID} .al-kicker {
        margin: 0 0 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: #ffb46b;
      }

      #${PANEL_ID} .al-slogan {
        margin: 4px 0 0;
        font-size: 11px;
        font-style: italic;
        color: #f7dcc0;
        letter-spacing: 0.05em;
      }

      #${PANEL_ID} .al-header-note {
        flex: 1 1 auto;
        min-width: 0;
        margin-top: 2px;
        padding: 8px 10px;
        border-radius: 12px;
        border: 1px solid rgba(255, 189, 110, 0.26);
        background: linear-gradient(135deg, rgba(255, 170, 91, 0.2) 0%, rgba(191, 79, 41, 0.16) 100%);
      }

      #${PANEL_ID} .al-header-note p {
        margin: 0;
        font-size: 11px;
        line-height: 1.45;
        color: #f7dcc0;
      }

      #${PANEL_ID} .al-header-note p + p {
        margin-top: 2px;
      }

      #${PANEL_ID} h2,
      #${PANEL_ID} h3 {
        margin: 0;
      }

      #${PANEL_ID} h2 {
        font-size: 22px;
        letter-spacing: -0.03em;
      }

      #${PANEL_ID} h3 {
        font-size: 14px;
        color: #f7f3ea;
      }

      #${PANEL_ID} .al-mini-tip {
        font-size: 11px;
        color: #ffcf9a;
      }

      #${PANEL_ID} .al-close {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 999px;
        position: relative;
        display: grid;
        place-items: center;
        background: rgba(255, 255, 255, 0.08);
        cursor: pointer;
        flex: 0 0 auto;
      }

      #${PANEL_ID} .al-close::before {
        content: "×";
        font-size: 20px;
        line-height: 1;
        font-weight: 500;
        color: rgba(255, 244, 236, 0.92);
        transform: translateY(-1px);
      }

      #${PANEL_ID} .al-status-card {
        display: grid;
        grid-template-columns: 36px minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
        padding: 12px 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.06);
      }

      #${PANEL_ID} .al-model-switcher {
        padding: 12px 14px;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.06);
      }

      #${PANEL_ID} .al-model-switcher-head {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 12px;
        align-items: center;
      }

      #${PANEL_ID} .al-model-switcher-label {
        margin: 0;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: rgba(243, 242, 239, 0.72);
      }

      #${PANEL_ID} .al-model-switcher-hint {
        margin: 6px 0 0;
        font-size: 12px;
        line-height: 1.5;
        color: rgba(243, 242, 239, 0.72);
      }

      #${PANEL_ID} .al-model-select {
        min-width: 182px;
        padding: 10px 14px;
        border-radius: 14px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(9, 18, 22, 0.78);
        color: #f3f2ef;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        outline: none;
      }

      #${PANEL_ID} .al-model-select:focus {
        border-color: rgba(244, 170, 92, 0.7);
        box-shadow: 0 0 0 3px rgba(244, 170, 92, 0.16);
      }

      #${PANEL_ID} .al-status-icon {
        width: 36px;
        height: 36px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.84), rgba(255, 255, 255, 0.18) 38%, transparent 39%),
          linear-gradient(180deg, #f4efe7 0%, #d7cec1 100%);
        border: 1px solid rgba(42, 36, 31, 0.14);
      }

      #${PANEL_ID} .al-status-spinner {
        width: 24px;
        height: 24px;
        opacity: 0.92;
        border-radius: 50%;
        background: url("${SPINNER_ICON_URL}") center/cover no-repeat;
        transform-origin: center;
      }

      #${PANEL_ID} .al-status-card[data-busy="true"] .al-status-spinner {
        opacity: 1;
        animation: al-spin 2200ms linear infinite;
      }

      #${PANEL_ID} .al-status-card[data-busy="false"] .al-status-spinner {
        opacity: 0.92;
        animation: none;
      }

      #${PANEL_ID} .al-status-copy {
        min-width: 0;
      }

      #${PANEL_ID} .al-status-actions {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
      }

      #${PANEL_ID} .al-api-key-action,
      #${PANEL_ID} .al-status-action {
        border: 0;
        border-radius: 999px;
        padding: 8px 14px;
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        color: #20140e;
        cursor: pointer;
        transition:
          transform 160ms ease,
          box-shadow 160ms ease,
          background 160ms ease,
          color 160ms ease;
      }

      #${PANEL_ID} .al-status-action {
        background: linear-gradient(135deg, #ffb56a 0%, #f08a3a 100%);
        box-shadow: 0 10px 20px rgba(240, 138, 58, 0.18);
      }

      #${PANEL_ID} .al-api-key-action {
        padding: 6px 12px;
        font-size: 11px;
        color: rgba(255, 244, 236, 0.88);
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: none;
      }

      #${PANEL_ID} .al-api-key-action:hover,
      #${PANEL_ID} .al-status-action:hover {
        transform: translateY(-1px);
      }

      #${PANEL_ID} .al-api-key-action:hover {
        background: rgba(255, 255, 255, 0.12);
      }

      #${PANEL_ID} .al-status-action[data-variant="cancel"] {
        color: #fff4ec;
        background: linear-gradient(135deg, #d04b35 0%, #9d2e28 100%);
        box-shadow: 0 10px 20px rgba(157, 46, 40, 0.22);
      }

      #${PANEL_ID} .al-status-label,
      #${PANEL_ID} .al-status,
      #${PANEL_ID} .al-status-hint {
        margin: 0;
      }

      #${PANEL_ID} .al-status-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #ffb46b;
      }

      #${PANEL_ID} .al-status {
        margin-top: 4px;
        font-size: 14px;
        line-height: 1.5;
        color: #f5efe6;
      }

      #${PANEL_ID} .al-status-hint {
        margin-top: 4px;
        font-size: 12px;
        line-height: 1.5;
        color: #cdbda9;
      }

      #${PANEL_ID} .al-actions {
        display: grid;
        gap: 10px;
      }

      #${PANEL_ID} .al-actions-primary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      #${PANEL_ID} .al-actions-secondary {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      #${PANEL_ID} .al-actions button,
      #${PANEL_ID} .al-link {
        border: 0;
        border-radius: 14px;
        padding: 11px 12px;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        color: #f5efe6;
        cursor: pointer;
        background: rgba(255, 255, 255, 0.08);
      }

      #${PANEL_ID} .al-primary {
        color: #fff6eb;
        background: linear-gradient(135deg, #db7a30 0%, #bf4f29 100%);
      }

      #${PANEL_ID} .al-actions button[data-running="true"] {
        color: #fff6eb;
        background: linear-gradient(135deg, #d04b35 0%, #9d2e28 100%);
      }

      #${PANEL_ID} .al-section {
        display: grid;
        gap: 10px;
      }

      #${PANEL_ID} .al-summary,
      #${PANEL_ID} .al-result,
      #${PANEL_ID} .al-details-content {
        margin: 0;
        padding: 12px 14px;
        border-radius: 16px;
        font-size: 13px;
        line-height: 1.68;
        color: #efe7db;
        background: rgba(255, 255, 255, 0.06);
        white-space: pre-wrap;
        word-break: break-word;
      }

      #${PANEL_ID} .al-summary-card {
        display: grid;
        gap: 10px;
      }

      #${PANEL_ID} .al-summary-grid {
        display: grid;
        gap: 8px;
      }

      #${PANEL_ID} .al-summary-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
        flex-wrap: wrap;
      }

      #${PANEL_ID} .al-summary-key {
        flex: 0 0 auto;
        font-size: 12px;
        font-weight: 700;
        color: #ffcf9a;
      }

      #${PANEL_ID} .al-summary-value {
        min-width: 0;
        flex: 1 1 180px;
        color: #f1e7d8;
      }

      #${PANEL_ID} .al-summary-preview {
        display: grid;
        gap: 8px;
      }

      #${PANEL_ID} .al-summary-preview-card {
        display: grid;
        gap: 6px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.05);
      }

      #${PANEL_ID} .al-summary-preview-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        color: #ffb46b;
      }

      #${PANEL_ID} .al-summary-preview-text {
        font-size: 12px;
        line-height: 1.7;
        color: #efe7db;
      }

      #${PANEL_ID} .al-summary-hint {
        padding: 10px 12px;
        border-radius: 14px;
        font-size: 12px;
        line-height: 1.7;
        color: #eadfce;
        background: rgba(255, 180, 107, 0.08);
        border: 1px solid rgba(255, 180, 107, 0.16);
      }

      #${PANEL_ID} .al-summary-hint[data-variant="warning"] {
        color: #ffe4c4;
        background: rgba(208, 75, 53, 0.12);
        border-color: rgba(208, 75, 53, 0.26);
      }

      #${PANEL_ID} .al-code-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      #${PANEL_ID} .al-inline-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }

      #${PANEL_ID} .al-link {
        padding: 0;
        color: #ffb46b;
        background: transparent;
      }

      #${PANEL_ID} .al-link-button {
        border: 0;
        padding: 0;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        color: #ffb46b;
        cursor: pointer;
        background: transparent;
      }

      #${PANEL_ID} .al-code {
        width: 100%;
        min-height: 220px;
        resize: vertical;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 14px;
        font:
          13px/1.6 "IBM Plex Mono",
          "SFMono-Regular",
          "JetBrains Mono",
          monospace;
        color: #e8e2d8;
        background: rgba(9, 16, 20, 0.72);
      }

      #${PANEL_ID} .al-compact-code {
        margin: 0;
        min-height: 82px;
        max-height: 168px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 12px 14px;
        white-space: pre-wrap;
        word-break: break-word;
        font:
          12px/1.55 "IBM Plex Mono",
          "SFMono-Regular",
          "JetBrains Mono",
          monospace;
        color: #efe6d9;
        background:
          radial-gradient(circle at top left, rgba(255, 208, 149, 0.08), transparent 42%),
          rgba(9, 16, 20, 0.76);
      }

      #${PANEL_ID} .al-mini-status {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 700;
        color: #ffe7c8;
        background: rgba(255, 180, 107, 0.14);
        border: 1px solid rgba(255, 180, 107, 0.18);
      }

      #${PANEL_ID} .al-prompt {
        width: 100%;
        min-height: 96px;
        resize: vertical;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 14px;
        font:
          13px/1.6 "IBM Plex Sans",
          "PingFang SC",
          "Helvetica Neue",
          sans-serif;
        color: #e8e2d8;
        background: rgba(9, 16, 20, 0.72);
      }

      #${PANEL_ID} .al-code:focus,
      #${PANEL_ID} .al-prompt:focus {
        outline: 1px solid rgba(255, 180, 107, 0.6);
      }

      #${PANEL_ID} .al-choice-answer {
        border-radius: 18px;
        padding: 16px 18px;
        font-size: 28px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: 0.04em;
        color: #fff6e8;
        text-align: center;
        background:
          radial-gradient(circle at top left, rgba(255, 208, 149, 0.2), transparent 42%),
          linear-gradient(135deg, rgba(219, 122, 48, 0.26) 0%, rgba(191, 79, 41, 0.2) 100%);
        border: 1px solid rgba(255, 180, 107, 0.18);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
      }

      #${PANEL_ID} .al-mode-switch {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
      }

      @media (max-width: 560px) {
        #${PANEL_ID} .al-status-card {
          grid-template-columns: 36px minmax(0, 1fr);
          align-items: start;
        }

        #${PANEL_ID} .al-status-actions {
          grid-column: 2;
          flex-direction: row;
          justify-content: flex-start;
          flex-wrap: wrap;
          align-items: center;
        }

        #${PANEL_ID} .al-model-switcher-head {
          grid-template-columns: 1fr;
        }

        #${PANEL_ID} .al-model-select {
          min-width: 0;
          width: 100%;
        }
      }

      #${PANEL_ID} .al-mode-button {
        border: 0;
        border-radius: 999px;
        padding: 6px 12px;
        color: rgba(243, 242, 239, 0.76);
        font-size: 12px;
        font-weight: 700;
        background: transparent;
        cursor: pointer;
        transition:
          background 150ms ease,
          color 150ms ease,
          transform 150ms ease;
      }

      #${PANEL_ID} .al-mode-button:hover {
        color: #fff3de;
        transform: translateY(-1px);
      }

      #${PANEL_ID} .al-mode-button[data-active="true"] {
        color: #20140e;
        background: linear-gradient(135deg, #ffb56a 0%, #f08a3a 100%);
        box-shadow: 0 10px 22px rgba(240, 138, 58, 0.2);
      }

      #${PANEL_ID} .al-details summary {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px;
        border-radius: 16px;
        cursor: pointer;
        list-style: none;
        color: #ffcf9a;
        font-size: 13px;
        font-weight: 700;
        background: rgba(255, 180, 107, 0.08);
        border: 1px dashed rgba(255, 180, 107, 0.24);
      }

      #${PANEL_ID} .al-details summary::-webkit-details-marker {
        display: none;
      }

      #${PANEL_ID} .al-details summary::after {
        content: ">";
        font-size: 14px;
        color: #ffb46b;
        transform: rotate(90deg);
        transition: transform 160ms ease;
      }

      #${PANEL_ID} .al-details[open] summary::after {
        transform: rotate(270deg);
      }

      #${PANEL_ID} .al-details-summary-hint {
        margin-left: auto;
        font-size: 11px;
        font-weight: 600;
        color: #cdbda9;
      }

      #${PANEL_ID} .al-details[open] summary {
        margin-bottom: 6px;
      }

      #${PANEL_ID} [data-role="prompt-preview-wrap"] {
        gap: 12px;
      }

      #${PANEL_ID} .al-details-content {
        max-height: 220px;
        overflow: auto;
        font:
          12px/1.6 "IBM Plex Mono",
          "SFMono-Regular",
          "JetBrains Mono",
          monospace;
      }

      #${PANEL_ID} .al-history-list {
        display: grid;
        gap: 10px;
        max-height: 240px;
        overflow: auto;
      }

      #${PANEL_ID} .al-history-item {
        display: grid;
        gap: 8px;
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.06);
      }

      #${PANEL_ID} .al-history-meta,
      #${PANEL_ID} .al-history-tags {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
      }

      #${PANEL_ID} .al-history-meta strong {
        color: #fff4e6;
      }

      #${PANEL_ID} .al-history-meta span,
      #${PANEL_ID} .al-history-tags span {
        font-size: 12px;
        color: #ffcf9a;
      }

      #${PANEL_ID} .al-history-tags span {
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(255, 180, 107, 0.12);
      }

      #${PANEL_ID} .al-history-text {
        margin: 0;
        font-size: 13px;
        line-height: 1.6;
        color: #efe7db;
      }

      #${PANEL_ID} .al-history-link {
        font-size: 12px;
        font-weight: 700;
        color: #ffb46b;
        text-decoration: none;
      }

      .al-bank-modal {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        padding: 16px;
        background: rgba(6, 11, 14, 0.56);
        pointer-events: auto;
      }

      .al-bank-modal-card {
        width: min(860px, calc(100vw - 24px));
        max-height: min(82vh, 760px);
        overflow: auto;
        display: grid;
        gap: 12px;
        padding: 16px;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        color: #f7efe1;
        background:
          radial-gradient(circle at top right, rgba(219, 122, 48, 0.18), transparent 40%),
          rgba(15, 20, 24, 0.97);
      }

      .al-bank-modal-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }

      .al-bank-modal-head h3 {
        margin: 0;
        font-size: 18px;
      }

      .al-bank-modal-head p {
        margin: 6px 0 0;
        font-size: 13px;
        color: #d7c9b3;
      }

      .al-bank-modal-tools {
        display: flex;
        align-items: stretch;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .al-bank-modal-tool-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .al-bank-modal-contrib-tools {
        width: 100%;
        display: grid;
        gap: 10px;
        padding: 14px;
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(255, 181, 106, 0.14) 0%, rgba(255, 255, 255, 0.06) 100%);
        border: 1px solid rgba(255, 181, 106, 0.22);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
      }

      .al-bank-modal-contrib-tools select {
        min-height: 44px;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 12px;
        padding: 10px 12px;
        font-size: 13px;
        font-weight: 700;
        color: #fff3df;
        background: rgba(8, 14, 18, 0.78);
      }

      .al-bank-modal-contrib-actions {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
        gap: 10px;
      }

      .al-bank-auth-summary {
        width: 100%;
      }

      .al-bank-modal-tool-buttons button {
        border: 0;
        border-radius: 10px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
        color: #fff3df;
        background: rgba(255, 255, 255, 0.1);
        cursor: pointer;
      }

      .al-bank-modal-tool-buttons button[data-active="true"] {
        color: #20140e;
        background: linear-gradient(135deg, #ffb56a 0%, #f08a3a 100%);
      }

      .al-bank-modal-tool-buttons select {
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 12px;
        color: #fff3df;
        background: rgba(8, 14, 18, 0.72);
      }

      .al-bank-save-indicator {
        min-height: 20px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        color: #f6ead7;
        background: rgba(255, 255, 255, 0.08);
      }

      .al-bank-save-indicator[data-state="saving"] {
        color: #20140e;
        background: linear-gradient(135deg, #ffb56a 0%, #f08a3a 100%);
      }

      .al-bank-save-indicator[data-state="saved"] {
        color: #fff4e8;
        background: rgba(83, 186, 122, 0.2);
      }

      .al-bank-notice {
        display: none;
        padding: 10px 12px;
        border-radius: 12px;
        font-size: 13px;
        line-height: 1.5;
        color: #f7efe1;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.08);
      }

      .al-bank-notice[data-show="true"] {
        display: block;
      }

      .al-bank-notice[data-state="saving"] {
        color: #20140e;
        background: linear-gradient(135deg, rgba(255, 181, 106, 0.96) 0%, rgba(240, 138, 58, 0.96) 100%);
        border-color: rgba(255, 181, 106, 0.55);
      }

      .al-bank-notice[data-state="success"] {
        color: #f4fff6;
        background: rgba(83, 186, 122, 0.18);
        border-color: rgba(83, 186, 122, 0.4);
      }

      .al-bank-notice[data-state="error"] {
        color: #fff3ef;
        background: rgba(220, 92, 73, 0.18);
        border-color: rgba(220, 92, 73, 0.4);
      }

      .al-bank-notice[data-state="info"] {
        color: #fff3df;
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.12);
      }

      .al-bank-modal-close {
        border: 0;
        border-radius: 999px;
        width: 30px;
        height: 30px;
        font-size: 16px;
        color: #fff3df;
        background: rgba(255, 255, 255, 0.1);
        cursor: pointer;
      }

      .al-bank-list {
        display: grid;
        gap: 10px;
      }

      .al-bank-item {
        display: grid;
        gap: 8px;
        padding: 12px;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.06);
      }

      .al-bank-item-pick {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #ffcf9a;
      }

      .al-bank-empty {
        padding: 24px 12px;
        text-align: center;
      }

      .al-bank-empty p {
        margin: 0;
        font-size: 13px;
        line-height: 1.6;
        color: #d5c4ad;
      }

      .al-bank-item-title {
        margin: 0;
        font-size: 13px;
        line-height: 1.5;
        color: #fff3df;
      }

      .al-bank-item-meta {
        margin: 0;
        font-size: 12px;
        color: #d5c4ad;
      }

      .al-bank-item-answer {
        display: grid;
        gap: 6px;
      }

      .al-bank-item-answer label {
        font-size: 12px;
        color: #ffcf9a;
      }

      .al-bank-item-answer input {
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 10px;
        padding: 8px 10px;
        font-size: 14px;
        color: #fff6e8;
        background: rgba(8, 14, 18, 0.72);
      }

      .al-bank-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .al-bank-modal-actions button {
        border: 0;
        border-radius: 10px;
        padding: 9px 14px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      .al-bank-modal-cancel {
        color: #ecdcc6;
        background: rgba(255, 255, 255, 0.1);
      }

      .al-bank-modal-save {
        color: #20140e;
        background: linear-gradient(135deg, #ffb56a 0%, #f08a3a 100%);
      }

      .al-bank-contrib-secondary {
        min-height: 48px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 14px;
        padding: 12px 14px;
        font-size: 14px;
        font-weight: 800;
        color: #fff3df;
        background: rgba(255, 255, 255, 0.08);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
        cursor: pointer;
      }

      .al-bank-contrib-primary {
        min-height: 48px;
        border-radius: 14px;
        padding: 12px 18px;
        font-size: 15px;
        font-weight: 900;
        letter-spacing: 0.02em;
        box-shadow: 0 12px 26px rgba(240, 138, 58, 0.24);
      }

      .al-bank-contrib-secondary:disabled,
      .al-bank-contrib-primary:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        box-shadow: none;
      }

      @media (max-width: 720px) {
        #${LAUNCHER_ID} {
          top: auto;
          bottom: 18px;
        }

        #autolearning-toast {
          right: 10px;
          top: auto;
          bottom: 148px;
          max-width: calc(100vw - 20px);
        }

        #${PANEL_ID} {
          right: 10px;
          top: auto;
          bottom: 82px;
          width: calc(100vw - 20px);
          max-height: calc(100vh - 108px);
        }

        #${PANEL_ID} .al-card {
          max-height: calc(100vh - 108px);
        }

        #${PANEL_ID} .al-header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: start;
          gap: 10px;
        }

        #${PANEL_ID} .al-header-note {
          grid-column: 1 / -1;
          margin-top: 0;
        }

        #${PANEL_ID} .al-actions-primary,
        #${PANEL_ID} .al-actions-secondary {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @keyframes al-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
    `;

    document.documentElement.appendChild(style);
  }

  function openPanel() {
    syncFloatingUiPosition();
    elements.panel.setAttribute("data-open", "true");
    elements.panel.setAttribute("aria-hidden", "false");
  }

  function closePanel() {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    elements.panel.setAttribute("data-open", "false");
    elements.panel.setAttribute("aria-hidden", "true");
    elements.launcher.focus();
  }

  function togglePanel() {
    if (state.suppressLauncherClick) {
      state.suppressLauncherClick = false;
      return;
    }

    if (elements.panel.getAttribute("data-open") === "true") {
      closePanel();
    } else {
      openPanel();
    }
  }

  async function handleExtract() {
    openPanel();
    const mode = getPromptMode();

    const activeCustomRule = getUsableCustomStatementRule();
    if (!activeCustomRule) {
      const hasSavedRule = Boolean(state.customStatementRule);
      if (hasSavedRule) {
        setStatus("当前页面保存过题面规则，但这条规则现在没有命中，正在重新选取。", {
          hint: "请重新点击要作为题面的元素，保存后会自动继续提取。",
        });
      } else {
        setStatus("当前页面还没有题面规则，请先点击要作为题面的元素。", {
          hint: "第一次配置后，后续点“提取题面”会直接复用。",
        });
      }
      await handlePickCustomStatementElement({
        autoExtractAfterSave: true,
        skipOpenPanel: true,
        },
      );
      return;
    }

    startBusyStatus("正在识别题面和当前代码...", "正在优先按已保存的题面规则读取页面内容。");

    if (false && mode !== "choice") {
      state.statusHint = "姝ｅ湪鐩存帴璇锋眰 AI 鐢熸垚浠ｇ爜缁撴灉銆?";
      syncStatusIndicator();
    }

    if (false && mode === "code") {
      const codeModeScreenshotCount = state.problem ? getProblemScreenshotItems(state.problem).length : 0;
      const codeModeHint =
        Number(state.problem?.currentCodeLineCount) > 0
          ? codeModeScreenshotCount > 0
            ? `先检查本地题库，再决定是否调用 AI。当前会附带题面文本、代码和 ${codeModeScreenshotCount} 张截图。`
            : "先检查本地题库，再决定是否调用 AI。当前会附带题面文本和代码；如果题面里还有图片，也可以稍后补截图。"
          : codeModeScreenshotCount > 0
            ? `先检查本地题库，再决定是否调用 AI。当前会附带题面文本和 ${codeModeScreenshotCount} 张截图，但还没有同步编辑器代码。`
            : "先检查本地题库，再决定是否调用 AI。当前只有题面文本，若右侧编辑器有代码，建议先复制后再生成。";
      startBusyStatus("正在准备答案...", codeModeHint);
    }

    if (false && mode === "code") {
      startBusyStatus("正在准备答案...", state.statusHint || "先检查本地题库，再决定是否调用 AI。");
    }

    if (false && mode === "code") {
      startBusyStatus("正在准备答案...", state.statusHint || "先检查本地题库，再决定是否调用 AI。");
    }

    try {
      const problem = await extractProblem();
      state.problem = problem;
      state.result = null;
      state.lastAutoSolveCode = "";
      markResultReady(false);

      renderProblem(problem);
      renderGeneratedTitle("");
      renderCurrentClassification(null);
      elements.approach.textContent = "还没有生成内容。";
      renderGeneratedCode("");
      renderCompactCodeCopyStatus(false);
      renderChoiceAnswer("");
      await refreshPromptPreview({ silent: true });
      const mode = getPromptMode();
      const successMessage =
        problem.statementSource === "custom"
          ? "已按当前页面的自定义题面规则提取内容。"
          : mode === "code"
            ? "题面已提取，下一步建议先复制编辑器代码。"
            : "题面已提取，可以直接生成答案。";
      const successHint =
        problem.customRuleRequested && !problem.customRuleMatched
          ? "当前页面自定义题面规则未命中，已自动回退到内置提取逻辑。"
          : mode === "code"
            ? "代码题流程：先复制编辑器代码，再按需框选题面图片，最后生成答案。"
            : "题面已识别完成。";
      stopBusyStatus(successMessage, successHint);
    } catch (error) {
      stopBusyStatus(error instanceof Error ? error.message : String(error), "提取失败，请检查当前页面。");
    }
  }

  async function handlePickCustomStatementElement(options = {}) {
    const autoExtractAfterSave = Boolean(options.autoExtractAfterSave);
    const skipOpenPanel = Boolean(options.skipOpenPanel);
    if (!skipOpenPanel) {
      openPanel();
    }
    setStatus("请在页面上点击要作为题面的元素，按 Esc 可以取消。", {
      hint: "移动鼠标时会高亮当前候选元素。",
    });

    try {
      const target = await selectCustomStatementElement();
      if (!(target instanceof Element)) {
        setStatus("已取消自定义题面选择。");
        return;
      }

      const previewText = summarizePreviewText(target.innerText || target.textContent || "");
      const selectorCandidates = buildCustomSelectorCandidates(target);
      if (selectorCandidates.length === 0) {
        setStatus("没有生成出可用的题面定位规则，请换一个更具体的元素重试。");
        return;
      }

      const confirmed = window.confirm(
        `将当前元素保存为本页题面规则？\n\n预览：\n${previewText || "[当前元素几乎没有文本内容]"}\n\n保存后，插件提取题面时会优先使用这个元素。`,
      );
      if (!confirmed) {
        setStatus("已取消保存自定义题面规则。");
        return;
      }

      const rule = {
        scopeKey: getCustomExtractScopeKey(),
        selectorCandidates,
        textPreview: previewText,
        pickedTag: target.tagName.toLowerCase(),
        pickedPreview: previewText,
        savedAt: new Date().toISOString(),
      };
      await persistCustomStatementRule(rule);
      state.customStatementRule = normalizeCustomStatementRule(rule);
      renderCustomStatementRuleStatus();
      if (autoExtractAfterSave) {
        setStatus("当前页面的自定义题面规则已保存，正在继续提取。", {
          hint: "后续点击“提取题面”会直接复用这条规则。",
        });
        await handleExtract();
        return;
      }
      setStatus("当前页面的自定义题面规则已保存。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleClearCustomStatementRule() {
    if (!state.customStatementRule) {
      setStatus("当前页面没有可清除的自定义题面规则。");
      return;
    }

    try {
      await removeCustomStatementRule();
      state.customStatementRule = null;
      renderCustomStatementRuleStatus();
      setStatus("当前页面的自定义题面规则已清除。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function handleClearProblemState() {
    state.problem = null;
    state.result = null;
    state.lastQuestionBankHit = null;
    state.lastAutoSolveCode = "";
    state.promptPreview = null;
    markResultReady(false);
    renderSummary("还没有提取内容。");
    renderGeneratedTitle("");
    renderCurrentClassification(null);
    renderPromptPreview("还没有可预览的内容。");
    renderScreenshotStatus(null);
    renderOcrText("");
    renderCompactCodeCopyStatus(false);
    renderChoiceAnswer("");
    if (elements.approach) {
      elements.approach.textContent = "还没有生成内容。";
    }
    renderGeneratedCode("");
    renderStatusActionButton();
    if (elements.details) {
      elements.details.textContent = "还没有提取内容。";
    }
    setStatus("已清空当前提取结果。");
  }

  async function handleSolve(options = {}) {
    const auto = Boolean(options.auto);
    const autoNavigate = options.autoNavigate !== false;
    const skipQuestionBank = Boolean(options.skipQuestionBank);
    const rejectHitBeforeRetry = Boolean(options.rejectHitBeforeRetry);
    const sourceCode = typeof options.sourceCode === "string" ? options.sourceCode : "";
    const extraInstructions = getStoredExtraInstructions();
    const mode = getPromptMode();
    const requestId = `solve-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    if (!auto) {
      openPanel();
    }

    if (state.solving) {
      return { ok: false, error: "当前正在生成答案，请稍后再试。" };
    }

    if (!state.problem) {
      if (mode === "choice") {
        setStatus("选择题模式不会自动提取题面，请先点“提取题面”。");
        return { ok: false, error: "选择题模式缺少题面上下文。" };
      }
      await handleExtract();
    }

    state.solving = true;
    state.solveCancelRequested = false;
    state.currentSolveRequestId = requestId;
    state.lastQuestionBankHit = null;
    renderStatusActionButton();
    if (mode === "code") {
      const codeModeScreenshotCount = state.problem ? getProblemScreenshotItems(state.problem).length : 0;
      const codeModeHint =
        Number(state.problem?.currentCodeLineCount) > 0
          ? codeModeScreenshotCount > 0
            ? `先检查本地题库，再决定是否调用 AI。当前会附带题面文本、代码和 ${codeModeScreenshotCount} 张截图。`
            : "先检查本地题库，再决定是否调用 AI。当前会附带题面文本和代码；如果题面里还有图片，也可以稍后补截图。"
          : codeModeScreenshotCount > 0
            ? `先检查本地题库，再决定是否调用 AI。当前会附带题面文本和 ${codeModeScreenshotCount} 张截图，但还没有同步编辑器代码。`
            : "先检查本地题库，再决定是否调用 AI。当前只有题面文本，若右侧编辑器有代码，建议先复制后再生成。";
      state.statusHint = codeModeHint;
    }
    if (false && mode !== "choice") {
      state.statusHint = "姝ｅ湪鐩存帴璇锋眰 AI 鐢熸垚浠ｇ爜缁撴灉銆?";
    }
    startBusyStatus("正在准备答案...", "先检查本地题库，再决定是否调用 AI。");

    try {
      await ensureQuestionBankLoaded();
      let questionBankHit = null;
      if (!skipQuestionBank && mode === "choice") {
        questionBankHit = findChoiceQuestionBankAnswer(state.problem);
      }
      if (rejectHitBeforeRetry && questionBankHit?.entry && questionBankHit.entry.source !== "cloud") {
        await markQuestionBankEntryStatus(questionBankHit, "rejected");
        questionBankHit = null;
      }
      state.lastQuestionBankHit = questionBankHit;
      const usedQuestionBank = Boolean(questionBankHit?.entry);
      let solveResult = null;

      if (usedQuestionBank) {
        setStatus("题库命中，正在使用本地记录...", {
          busy: true,
          hint:
            questionBankHit?.matchStrength === "strong"
              ? "已命中已确认题库答案，本题不会调用 AI。"
              : "当前只命中了弱匹配记录，本次仅展示历史疑似答案。",
        });
        solveResult = buildQuestionBankResult(questionBankHit, state.problem);
      } else {
        setStatus("本地题库未命中，正在请求 AI...", {
          busy: true,
          hint: "已开始调用模型。",
        });
        const response = await sendMessage({
          type: "autolearning:solve-problem",
          requestId,
          problem: state.problem,
          extraInstructions,
        });

        if (!response?.ok) {
          throw new Error(response?.error || "生成失败");
        }
        solveResult = response.result || {};
      }

      solveResult = enrichSolveResultForQuestionBank(state.problem, mode, solveResult, {
        fromQuestionBank: usedQuestionBank,
        matchStrength: questionBankHit?.matchStrength || "",
        },
      );
      state.result = solveResult;
      const choiceAnswerText = String(solveResult.answer || solveResult.code || "").trim();
      renderGeneratedTitle(solveResult.generatedTitle || solveResult.summary || "");
      renderCurrentClassification(solveResult);
      elements.approach.textContent = solveResult.approach || solveResult.summary || "已拿到答案。";
      renderGeneratedCode(solveResult.code || "");
      renderChoiceAnswer(choiceAnswerText);

      if (!usedQuestionBank && mode === "choice") {
        await upsertQuestionBankEntry(state.problem, mode, solveResult, {
          source: "local",
          status: "candidate",
        });
      }
      if (mode === "choice" && choiceAnswerText && !usedQuestionBank) {
        queueQuestionBankReviewItem(state.problem, mode, choiceAnswerText);
      }

      let autoPickResult = null;
      if (mode === "choice" && choiceAnswerText && questionBankHit?.matchStrength !== "weak") {
        autoPickResult = await pickChoiceOptions(choiceAnswerText);
      }
      if (auto && sourceCode) {
        state.lastAutoSolveCode = sourceCode;
      }
      markResultReady(true);
      await refreshHistory({ silent: true });
      blurAssistantEditable();
      const copySource = mode === "choice" ? choiceAnswerText : elements.code.value;
      const copied = await copyTextToClipboard(copySource);
      renderCompactCodeCopyStatus(mode === "code" && copied);
      const autoPickSuffix =
        autoPickResult?.ok && autoPickResult.labels.length > 0
          ? `，并自动选择 ${autoPickResult.labels.join("/")}`
          : "";
      const manualPickSuffix = autoPickResult?.manualRequired
        ? autoPickResult?.multiChoiceUnsupported
          ? "，检测到多选题，当前不会自动勾选"
          : autoPickResult.labels.length > 0
            ? `，已自动选择 ${autoPickResult.labels.join("/")}，请手动确认剩余选项`
            : "，当前未能确认选中态，请手动检查"
        : "";
      let nextQuestionSuffix = "";
      let nextClicked = false;
      if (auto && autoNavigate && mode === "choice" && autoPickResult?.ok) {
        await delay(normalizeAutoPickDelay(state.settings.autoPickNextDelayMs));
        nextClicked = clickNextQuestionButton();
        if (nextClicked) {
          nextQuestionSuffix = "，已自动进入下一题";
        }
      }
      stopBusyStatus(
        copied
          ? `已生成答案${autoPickSuffix}${manualPickSuffix}${nextQuestionSuffix}并自动复制，来源：${usedQuestionBank ? "本地题库" : solveResult.model || "AI"}`
          : `已生成答案${autoPickSuffix}${manualPickSuffix}${nextQuestionSuffix}，来源：${usedQuestionBank ? "本地题库" : solveResult.model || "AI"}`,
        questionBankHit?.matchStrength === "weak"
          ? "本题只命中了弱匹配题库记录，已展示历史答案但没有自动勾选。"
          : autoPickResult?.manualRequired
          ? autoPickResult?.multiChoiceUnsupported
            ? "多选题当前不支持自动勾选。请先查看解析，再到“编辑题库”修正答案并手动勾选。"
            : autoPickResult.labels.length > 0
              ? "已尝试自动勾选部分答案，请手动确认页面上的最终选中态。"
              : "这题没有稳定匹配到可点击选项，请手动确认；看完解析后也可以到“编辑题库”修正答案。"
          : usedQuestionBank
            ? "答案来自本地题库。"
            : solveResult.needsVerification
              ? "AI 已返回候选结果，确认无误后可再入库。"
              : "AI 已返回结果。",
      );
      showToast(
        questionBankHit?.matchStrength === "weak"
          ? `本题仅命中弱匹配记录，当前展示的历史答案是 ${choiceAnswerText}，请先人工确认。`
          : autoPickResult?.manualRequired
          ? autoPickResult?.multiChoiceUnsupported
            ? `这是多选题，答案是 ${choiceAnswerText}。当前请手动勾选。`
            : autoPickResult.labels.length > 0
              ? `已按答案 ${autoPickResult.labels.join("/")} 尝试勾选，请手动确认是否完整。`
              : `答案是 ${choiceAnswerText}，但这页选项没有稳定匹配成功，请手动检查。`
          : "答案已经生成好了，点 AL 就能查看。",
      );
      return {
        ok: true,
        result: solveResult,
        choiceAnswerText,
        autoPickResult,
        nextClicked,
        source: usedQuestionBank ? "question-bank" : "ai",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cancelled = state.solveCancelRequested || /请求已取消/.test(message);
      stopBusyStatus(
        cancelled ? "已取消本次请求。" : message,
        cancelled ? "你可以继续截图或重新提交。" : "本次请求没有成功完成。",
      );
      return {
        ok: false,
        error: cancelled ? "请求已取消" : message,
      };
    } finally {
      state.solving = false;
      state.solveCancelRequested = false;
      state.currentSolveRequestId = "";
      renderStatusActionButton();
    }
  }

  async function handleToggleFullAuto() {
    openPanel();

    if (state.fullAutoRunning) {
      state.fullAutoStopRequested = true;
      renderFullAutoButton();
      setStatus("已请求停止全自动模式，会在当前这一题结束后停下。");
      return;
    }

    if (getPromptMode() !== "choice") {
      setStatus("全自动模式当前只支持选择题模式，请先切换到“选择题”。");
      return;
    }

    const fullAutoMode = getFullAutoMode();
    if (fullAutoMode === "capture") {
      const rect = await getOrCreateFixedCaptureRect();
      if (!rect) {
        setStatus("截图全自动启动前需要先设定固定截图区域。");
        return;
      }
      state.fixedCaptureRegion = rectToStoredCaptureRegion(rect);
    }

    state.fullAutoRunning = true;
    state.fullAutoStopRequested = false;
    state.fullAutoRound = 0;
    state.fullAutoRunToken += 1;
    const runToken = state.fullAutoRunToken;
    renderFullAutoButton();
    setStatus(
      fullAutoMode === "capture"
        ? "全自动模式已启动，将按截图链路连续答题并跳到下一题。"
        : "全自动模式已启动，将直接提取题面文本、答题并跳到下一题。",
    );
    showToast(
      fullAutoMode === "capture"
        ? "截图全自动已启动。再次点击按钮可停止。"
        : "提取题面全自动已启动，当前不会使用 OCR。再次点击按钮可停止。",
    );

    void runFullAutoLoop(runToken);
  }

  async function runFullAutoLoop(runToken) {
    try {
      while (
        state.fullAutoRunning &&
        !state.fullAutoStopRequested &&
        runToken === state.fullAutoRunToken
      ) {
        const beforeFingerprint = getPageFingerprint();
        state.fullAutoRound += 1;
        setStatus(`全自动模式运行中，正在处理第 ${state.fullAutoRound} 题...`);

        const fullAutoMode = getFullAutoMode();
        const flowResult =
          fullAutoMode === "capture"
            ? await handleCaptureImageFlow({
                mode: "fixedRegion",
                autoSolve: true,
                autoSubmit: false,
                autoNavigate: false,
              })
            : await runTextOnlyFullAutoRound();

        if (runToken !== state.fullAutoRunToken || state.fullAutoStopRequested) {
          break;
        }

        if (!flowResult?.ok) {
          throw new Error(flowResult?.error || "全自动模式执行失败。");
        }

        const solveResult = flowResult.solveResult;
        if (!solveResult?.ok) {
          throw new Error(solveResult?.error || "全自动模式没有拿到有效答案。");
        }

        const choiceAnswerText = String(solveResult.choiceAnswerText || "").trim();
        if (solveResult.autoPickResult?.multiChoiceUnsupported) {
          throw new Error(
            `第 ${state.fullAutoRound} 题是多选题。当前全自动只支持单选题自动勾选，请按答案 ${choiceAnswerText} 手动处理。`,
          );
        }
        if (!solveResult.autoPickResult?.ok) {
          // Some pages do not expose stable "selected" DOM states. In full-auto mode,
          // prioritize continuity: if we already have an answer, keep going.
          if (!choiceAnswerText) {
            throw new Error(
              fullAutoMode === "capture"
                ? "这一题没有拿到有效答案，请检查截图区域、OCR 结果或答案格式。"
                : "这一题没有拿到有效答案，请检查题面提取结果或答案格式。",
            );
          }
          setStatus(
            `第 ${state.fullAutoRound} 题已拿到答案 ${choiceAnswerText}，未确认选中态，继续尝试下一题...`,
          );
        }

        const navigationResult = await advanceToNextQuestionOrSubmit(beforeFingerprint, runToken);
        if (navigationResult.action === "submit") {
          setStatus(`第 ${state.fullAutoRound} 题已完成，已检测到最后一题并尝试点击“提交作业”。`);
          showToast("已到最后一题并提交。看完解析后，可在面板里点“编辑题库”修正答案。");
          break;
        }
        if (!navigationResult.ok && !state.fullAutoStopRequested && runToken === state.fullAutoRunToken) {
          setStatus(
            `第 ${state.fullAutoRound} 题已完成，但自动跳题失败：${navigationResult.error || "页面没有进入下一题"}。`,
          );
          showToast("自动跳题失败，全自动模式已停止。");
          break;
        }

        resetProblemForNextAutoRound();
        await delay(320);
      }
    } catch (error) {
      if (runToken === state.fullAutoRunToken) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`全自动模式已停止：${message}`);
        showToast("全自动模式已停止，请检查当前页面后再继续。");
      }
    } finally {
      if (runToken === state.fullAutoRunToken) {
        const stoppedByUser = state.fullAutoStopRequested;
        state.fullAutoRunning = false;
        state.fullAutoStopRequested = false;
        renderFullAutoButton();
        if (stoppedByUser) {
          setStatus(`全自动模式已停止，共处理 ${state.fullAutoRound} 题。`);
          showToast("全自动模式已停止。");
        }
      }
    }
  }

  async function runTextOnlyFullAutoRound() {
    const problem = await extractProblem();
    problem.screenshotDataUrl = "";
    problem.screenshotRect = null;
    problem.screenshotMode = "";
    problem.ocrText = "";
    problem.ocrModel = "";
    problem.ocrSkipped = true;
    state.problem = problem;
    renderProblem(problem);
    renderScreenshotStatus(problem);
    renderOcrText("");
    await refreshPromptPreview({ silent: true });
    const solveResult = await handleSolve({ auto: true, autoNavigate: false });
    return {
      ok: true,
      problem,
      solveResult,
    };
  }

  async function handleFill() {
    openPanel();
    const code = String(elements.code.value || "");

    if (!hasMeaningfulCode(code)) {
      setStatus("当前没有可填充的代码。");
      return;
    }

    setStatus("正在把代码填回编辑器...");

    const result = await callPageBridge("setEditorValue", { code });
    if (result?.ok) {
      setStatus("代码已经填入编辑器。");
      return;
    }

    setStatus("自动填充失败，请手动复制代码。");
  }

  async function handleCopy() {
    const code = String(elements.code.value || "");
    if (!hasMeaningfulCode(code)) {
      setStatus("还没有可复制的代码。");
      return;
    }

    if (await copyTextToClipboard(code)) {
      setStatus("代码已复制到剪贴板。");
    } else {
      setStatus("复制失败，请手动选择代码。");
    }
  }

  async function handleCopyCompactPreview() {
    const mode = getPromptMode();
    if (mode === "choice") {
      const preview = buildChoiceAnswerPreview(state.problem, state.result);
      if (!preview || preview === "还没有生成答案映射。") {
        setStatus("还没有可复制的答案映射。");
        return;
      }
      if (await copyTextToClipboard(preview)) {
        setStatus("答案映射已复制到剪贴板。");
      } else {
        setStatus("复制答案映射失败，请手动选择。");
      }
      return;
    }

    await handleCopy();
  }

  async function handleCopyApproach() {
    const approach = String(elements.approach?.textContent || "").trim();
    if (!approach || approach === "还没有生成内容。") {
      setStatus("还没有可复制的解题思路。");
      return;
    }

    if (await copyTextToClipboard(approach)) {
      setStatus("解题思路已复制到剪贴板。");
    } else {
      setStatus("复制解题思路失败，请手动选择。");
    }
  }

  async function handleCopyChoiceAnswer() {
    const answer = String(elements.choiceAnswer?.textContent || "").trim();
    if (!answer || answer === "还没有生成答案。") {
      setStatus("还没有可复制的答案。");
      return;
    }

    if (await copyTextToClipboard(answer)) {
      setStatus("答案已复制到剪贴板。");
    } else {
      setStatus("复制答案失败，请手动选择。");
    }
  }

  async function pickChoiceOptions(answerText) {
    const labels = extractChoiceLabels(answerText);
    if (labels.length === 0) {
      return { ok: false, labels: [], error: "答案不是 A/B/C/D 或 对/错 格式。" };
    }

    const initialItems = collectChoiceItems();
    if (initialItems.length === 0) {
      return { ok: false, labels: [], error: "页面没有找到可点击的选项列表。" };
    }

    const multiChoiceMode = isMultiChoiceQuestionContext() || labels.length > 1;

    // 优先尝试使用专门的多选框处理函数
    if (multiChoiceMode) {
      const checkboxGroups = Array.from(document.querySelectorAll(".el-checkbox-group.checkbox-view")).filter(
        (node) => node instanceof Element && isVisible(node) && !isInsideAssistant(node),
      );
      if (checkboxGroups.length > 0) {
        const pickedFromCheckbox = await pickChoiceOptionsInElementUiCheckboxGroup(labels);
        if (pickedFromCheckbox.length === labels.length) {
          return {
            ok: true,
            labels: pickedFromCheckbox,
            error: "",
            manualRequired: false,
          };
        }
        // 如果专门函数没有选中所有选项，继续使用通用逻辑
      }
    }

    const picked = [];
    for (const label of labels) {
      if (picked.includes(label)) {
        continue;
      }
      const items = collectChoiceItems();
      const item =
        items.find((candidate) => matchesChoiceItemByLabel(candidate, label)) ||
        items.find((candidate, index) => matchesChoiceItemBySemanticFallback(candidate, label, index, items));
      if (!item) {
        const selectedMatch =
          items.find((candidate) => isChoiceItemSelected(candidate) && matchesChoiceItemByLabel(candidate, label)) ||
          items.find(
            (candidate, index) =>
              isChoiceItemSelected(candidate) &&
              matchesChoiceItemBySemanticFallback(candidate, label, index, items),
          );
        if (selectedMatch) {
          picked.push(label);
        }
        continue;
      }

      const clicked = multiChoiceMode
        ? await ensureChoiceItemSelected(item)
        : await clickChoiceItem(item, labels.length > 1);
      if (clicked || isChoiceItemSelected(item)) {
        picked.push(label);
      }
    }

    const allPicked = picked.length === labels.length;
    const partialPicked = picked.length > 0 && !allPicked;

    return {
      ok: allPicked,
      labels: picked,
      error: allPicked ? "" : partialPicked ? "只匹配到部分选项，请手动确认勾选结果。" : "没有匹配到可点击的选项。",
      manualRequired: !allPicked,
    };
  }

  async function pickChoiceOptionsInElementUiCheckboxGroup(labels) {
    if (!Array.isArray(labels) || labels.length === 0) {
      return [];
    }

    const questionRoot = getActiveQuestionRoot();
    const groupSource =
      questionRoot instanceof Element
        ? questionRoot.querySelectorAll(".el-checkbox-group.checkbox-view")
        : document.querySelectorAll(".questionContent .el-checkbox-group.checkbox-view, .el-checkbox-group.checkbox-view");
    const groups = Array.from(groupSource).filter(
      (group) => group instanceof Element && isVisible(group) && !isInsideAssistant(group),
    );
    if (groups.length === 0) {
      return [];
    }

    const group = groups[0];
    const optionLabels = Array.from(group.querySelectorAll("label.el-checkbox"));
    if (optionLabels.length === 0) {
      return [];
    }
    const targetSet = new Set(labels);

    for (const option of optionLabels) {
      const optionLabel = getChoiceLabelFromItem(option);
      if (!optionLabel || targetSet.has(optionLabel) || !isChoiceItemSelected(option)) {
        continue;
      }
      await ensureElementUiCheckboxLabelDeselected(option);
      await delay(80);
    }

    const picked = [];
    for (const targetLabel of labels) {
      const option = optionLabels.find((node) => getChoiceLabelFromItem(node) === targetLabel);
      if (!option) {
        continue;
      }
      const ok = await ensureElementUiCheckboxLabelSelected(option);
      if (ok || isChoiceItemSelected(option)) {
        picked.push(targetLabel);
      }
      await delay(120);
    }

    return picked;
  }

  async function ensureElementUiCheckboxLabelSelected(option) {
    if (!(option instanceof Element)) {
      return false;
    }
    if (isChoiceItemSelected(option)) {
      return true;
    }

    const clickTargets = [
      option.querySelector(".el-checkbox__inner"),
      option.querySelector(".el-checkbox__input"),
      option.querySelector(".el-checkbox__label"),
      option,
    ].filter(Boolean);

    for (const target of clickTargets) {
      if (!(target instanceof Element)) {
        continue;
      }
      if (!simulateDirectUserClick(target, { useNativeClick: true })) {
        continue;
      }
      if (await waitForChoiceItemSelected(option, 240)) {
        return true;
      }
    }

    const input = option.querySelector("input.el-checkbox__original");
    if (input instanceof HTMLInputElement && !input.checked) {
      input.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      input.focus?.();
      simulateDirectUserClick(input, { useNativeClick: true });
      input.click?.();
      input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      if (await waitForChoiceItemSelected(option, 240)) {
        return true;
      }
    }

    return isChoiceItemSelected(option);
  }

  async function ensureElementUiCheckboxLabelDeselected(option) {
    if (!(option instanceof Element)) {
      return false;
    }
    if (!isChoiceItemSelected(option)) {
      return true;
    }

    const clickTargets = [
      option,
      option.querySelector(".el-checkbox__label"),
      option.querySelector(".el-checkbox__input"),
      option.querySelector(".el-checkbox__inner"),
      option.querySelector("input.el-checkbox__original"),
    ].filter(Boolean);

    for (const target of clickTargets) {
      if (!(target instanceof Element)) {
        continue;
      }
      if (!simulateDirectUserClick(target, { useNativeClick: true })) {
        continue;
      }
      if (await waitForChoiceItemUnselected(option, 280)) {
        return true;
      }
    }

    const input = option.querySelector("input.el-checkbox__original");
    if (input instanceof HTMLInputElement && input.checked) {
      input.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      input.focus?.();
      input.click?.();
      input.checked = false;
      input.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      input.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      if (await waitForChoiceItemUnselected(option, 280)) {
        return true;
      }
    }

    return !isChoiceItemSelected(option);
  }

  function isMultiChoiceQuestionContext() {
    const problemText = normalizeText(
      `${state.problem?.title || ""}\n${state.problem?.statementText || ""}\n${state.problem?.ocrText || ""}`,
    );
    if (/(多选题|多项选择|multiple\s*choice)/i.test(problemText)) {
      return true;
    }

    const visibleQuestionHint = normalizeText(
      firstVisible([
        ".questionTitle",
        ".questionContent .questionTitle",
        ".ques-detail .questionTitle",
        "#task-left-panel .task-header",
      ])?.textContent || "",
    );
    return /(多选题|多项选择|multiple\s*choice)/i.test(visibleQuestionHint);
  }

  function extractChoiceLabels(answerText) {
    const raw = String(answerText || "").trim();
    const normalizedRaw = raw.toLowerCase();
    if (/(^|[^a-z])(true|正确|对)([^a-z]|$)/i.test(raw)) {
      return ["对"];
    }
    if (/(^|[^a-z])(false|错误|错)([^a-z]|$)/i.test(raw)) {
      return ["错"];
    }

    const cleaned = String(raw)
      .replace(/答案\s*[:：]?\s*/gi, " ")
      .replace(/[^A-Da-d]/g, "")
      .toUpperCase();
    const unique = [];
    for (const char of cleaned) {
      if (/^[A-D]$/.test(char) && !unique.includes(char)) {
        unique.push(char);
      }
    }
    return unique;
  }

  function matchesChoiceItemByLabel(item, label) {
    if (!(item instanceof Element)) {
      return false;
    }
    const explicitLetter = getChoiceLabelFromItem(item);
    const text = normalizeText(item.textContent || "")
      .replace(/\s+/g, "")
      .toUpperCase();
    if (label === "对") {
      return text.includes("对") || text.includes("正确") || text.includes("TRUE");
    }
    if (label === "错") {
      return text.includes("错") || text.includes("错误") || text.includes("FALSE");
    }

    if (explicitLetter) {
      return explicitLetter === label;
    }
    return (
      text.startsWith(`${label}.`) ||
      text.startsWith(`${label}、`) ||
      text.startsWith(`${label}`) ||
      text.includes(`${label}.`) ||
      text.includes(`${label}、`)
    );
  }

  function getChoiceLabelFromItem(item) {
    if (!(item instanceof Element)) {
      return "";
    }
    const direct = normalizeText(
      item.querySelector(".letterSort, .option-letter, .el-checkbox__label .letterSort, .el-radio__label .letterSort")
        ?.textContent || "",
    )
      .replace(/[^A-Da-d]/g, "")
      .toUpperCase();
    if (/^[A-D]$/.test(direct)) {
      return direct;
    }

    const text = normalizeText(item.textContent || "")
      .replace(/\s+/g, "")
      .toUpperCase();
    const match = text.match(/^([A-D])(?:[\.、:：\)\）]|$)/);
    return match ? match[1] : "";
  }

  function matchesChoiceItemBySemanticFallback(item, label, index, items = []) {
    if (!(item instanceof Element)) {
      return false;
    }

    const normalized = normalizeText(item.textContent || "")
      .replace(/\s+/g, "")
      .toUpperCase();

    if (label === "对") {
      return (
        normalized.startsWith("A.") ||
        normalized.startsWith("A、") ||
        normalized.startsWith("A对") ||
        normalized === "A" ||
        index === 0
      );
    }

    if (label === "错") {
      return (
        normalized.startsWith("B.") ||
        normalized.startsWith("B、") ||
        normalized.startsWith("B错") ||
        normalized === "B" ||
        index === 1
      );
    }

    if (/^[A-D]$/.test(label)) {
      // For A/B/C/D do not rely on index fallback by default.
      // Some pages render answer cards or navigation lists that also contain numbers/labels,
      // causing index-based fallback to click wrong targets.
      if (!isLikelyReliableChoiceOrder(items)) {
        return false;
      }
      return index === label.charCodeAt(0) - 65;
    }

    return false;
  }

  function isLikelyReliableChoiceOrder(items) {
    if (!Array.isArray(items) || items.length < 2 || items.length > 6) {
      return false;
    }
    const directLabelCount = items.reduce((count, item) => {
      const text = normalizeText(item?.textContent || "")
        .replace(/\s+/g, "")
        .toUpperCase();
      if (/^[A-D][\.\、:：\)\）]/.test(text)) {
        return count + 1;
      }
      return count;
    }, 0);
    return directLabelCount >= Math.max(2, Math.floor(items.length * 0.6));
  }

  async function clickChoiceItem(item, preferCheckbox = false) {
    if (!(item instanceof Element)) {
      return false;
    }

    if (isChoiceItemSelected(item)) {
      return true;
    }
    const beforeSignature = getChoiceGroupSelectionSignature(item);
    let clickTriggered = false;

    const candidates = [
      item.querySelector("input[type='checkbox']"),
      item.querySelector("input[type='radio']"),
      item.querySelector(".checkIcon"),
      item.querySelector("label"),
      item.querySelector(".item-content"),
      item.querySelector(".stem"),
      item.querySelector(".preStyle"),
      item,
    ].filter(Boolean);

    if (preferCheckbox) {
      candidates.sort((a, b) => {
        const aScore = a instanceof Element && a.matches("input[type='checkbox'], .el-checkbox, .ant-checkbox-wrapper") ? 1 : 0;
        const bScore = b instanceof Element && b.matches("input[type='checkbox'], .el-checkbox, .ant-checkbox-wrapper") ? 1 : 0;
        return bScore - aScore;
        },
      );
    }

    for (const candidate of candidates) {
      if (!(candidate instanceof Element)) {
        continue;
      }

      if (!simulateUserClick(candidate, { useNativeClick: true })) {
        continue;
      }
      clickTriggered = true;

      await delay(90);
      if (isChoiceItemSelected(item)) {
        return true;
      }
      if (getChoiceGroupSelectionSignature(item) !== beforeSignature) {
        return true;
      }
    }

    if (clickTriggered && getChoiceGroupSelectionSignature(item) !== beforeSignature) {
      return true;
    }

    return false;
  }

  async function ensureChoiceItemSelected(item) {
    if (!(item instanceof Element)) {
      return false;
    }
    if (isChoiceItemSelected(item)) {
      return true;
    }

    if (isElementUiCheckboxItem(item)) {
      return ensureElementUiCheckboxLabelSelected(resolveElementUiCheckboxLabel(item) || item);
    }

    const checkbox = item.querySelector("input[type='checkbox']");
    if (checkbox instanceof HTMLInputElement) {
      if (!checkbox.checked) {
        // Use click-first for frameworks that rely on native pointer/click event chains.
        // Avoid "checked=true + click()" because it may toggle back to unchecked.
        simulateUserClick(checkbox, { useNativeClick: true });
        await delay(70);
      }
      if (!checkbox.checked) {
        checkbox.focus?.();
        checkbox.checked = true;
        checkbox.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        checkbox.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
        await delay(60);
      }
      if (isChoiceItemSelected(item)) {
        return true;
      }
    }

    const radio = item.querySelector("input[type='radio']");
    if (radio instanceof HTMLInputElement) {
      // Some sites mislabel multi-choice as radio in DOM wrappers.
      if (!radio.checked) {
        radio.checked = true;
        radio.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        radio.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      }
      if (isChoiceItemSelected(item)) {
        return true;
      }
    }

    const clickCandidates = [
      item.querySelector(".el-checkbox__input"),
      item.querySelector(".el-checkbox__label"),
      item.querySelector(".el-checkbox__original"),
      item.querySelector("label"),
      item.querySelector(".checkIcon"),
      item.querySelector(".el-checkbox__inner"),
      item.querySelector(".ant-checkbox-input"),
      item.querySelector(".ant-checkbox-wrapper"),
      item.querySelector(".item-content"),
      item,
    ].filter(Boolean);

    for (const candidate of clickCandidates) {
      if (!(candidate instanceof Element)) {
        continue;
      }
      if (!simulateUserClick(candidate, { useNativeClick: true })) {
        continue;
      }
      await delay(90);
      if (isChoiceItemSelected(item)) {
        return true;
      }
    }

    const checkboxRoot =
      item.closest("label.el-checkbox, .el-checkbox, .checkbox-view label") ||
      item.querySelector("label.el-checkbox, .el-checkbox");
    if (checkboxRoot instanceof HTMLElement) {
      checkboxRoot.click();
      await delay(90);
      if (isChoiceItemSelected(item)) {
        return true;
      }
    }

    const checkboxInputLike =
      item.querySelector("input.el-checkbox__original") ||
      item.querySelector("input[type='checkbox']");
    if (checkboxInputLike instanceof HTMLInputElement) {
      checkboxInputLike.click?.();
      checkboxInputLike.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      await delay(80);
      if (isChoiceItemSelected(item)) {
        return true;
      }
    }

    return isChoiceItemSelected(item);
  }

  async function waitForChoiceItemSelected(item, timeoutMs = 200) {
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
      if (isChoiceItemSelected(item)) {
        return true;
      }
      await delay(30);
    }
    return isChoiceItemSelected(item);
  }

  async function waitForChoiceItemUnselected(item, timeoutMs = 200) {
    const start = Date.now();
    while (Date.now() - start <= timeoutMs) {
      if (!isChoiceItemSelected(item)) {
        return true;
      }
      await delay(30);
    }
    return !isChoiceItemSelected(item);
  }

  function isChoiceItemSelected(item) {
    if (!(item instanceof Element)) {
      return false;
    }

    if (isElementUiCheckboxItem(item)) {
      const label = resolveElementUiCheckboxLabel(item);
      const checkboxInput =
        label?.querySelector(".el-checkbox__input") || item.querySelector(".el-checkbox__input");
      if (checkboxInput instanceof Element && checkboxInput.classList.contains("is-checked")) {
        return true;
      }
      const ariaChecked = String(label?.getAttribute("aria-checked") || item.getAttribute("aria-checked") || "").toLowerCase();
      return ariaChecked === "true";
    }

    const input = item.querySelector("input[type='checkbox'], input[type='radio']");
    if (input instanceof HTMLInputElement && input.checked) {
      return true;
    }

    if (item.matches("label.el-checkbox, .el-checkbox")) {
      const checkboxInput = item.querySelector(".el-checkbox__input");
      if (checkboxInput instanceof Element && checkboxInput.classList.contains("is-checked")) {
        return true;
      }
    }

    const explicitSelectedMarker = item.querySelector(
      ".is-checked, .checked, .selected, .active, [aria-checked='true'], [aria-selected='true']",
    );
    if (explicitSelectedMarker instanceof Element) {
      return true;
    }

    const selectedNodes = [
      item,
      item.querySelector(".checkIcon"),
      item.querySelector("label"),
      item.querySelector(".item-content"),
      item.querySelector(".el-radio__input"),
      item.querySelector(".el-checkbox__input"),
      item.querySelector(".ant-radio-wrapper"),
      item.querySelector(".ant-checkbox-wrapper"),
    ].filter(Boolean);

    return selectedNodes.some((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }
      const className = String(node.className || "");
      // Avoid matching partial words like "option" as selected.
      if (/(?:^|\s)(?:checked|selected|active|current|is-checked|is-selected|is-active|on)(?:\s|$)/i.test(className)) {
        return true;
      }
      const ariaChecked = String(node.getAttribute("aria-checked") || "").toLowerCase();
      if (ariaChecked === "true") {
        return true;
      }
      const ariaSelected = String(node.getAttribute("aria-selected") || "").toLowerCase();
      if (ariaSelected === "true") {
        return true;
      }
      const style = window.getComputedStyle(node);
      return /(56, 107, 255|64, 117, 255|82, 102, 255)/.test(style.backgroundColor || "");
    });
  }

  function isElementUiCheckboxItem(item) {
    if (!(item instanceof Element)) {
      return false;
    }
    return Boolean(
      item.matches("label.el-checkbox, .el-checkbox") ||
        item.closest("label.el-checkbox, .el-checkbox") ||
        item.querySelector(".el-checkbox__input, input.el-checkbox__original"),
    );
  }

  function resolveElementUiCheckboxLabel(item) {
    if (!(item instanceof Element)) {
      return null;
    }
    if (item.matches("label.el-checkbox")) {
      return item;
    }
    return item.closest("label.el-checkbox") || item.querySelector("label.el-checkbox");
  }

  function getChoiceGroupSelectionSignature(item) {
    if (!(item instanceof Element)) {
      return "";
    }

    const groupRoot =
      item.closest("ul.radio-view, ul.checkbox-view, .radio-view, .checkbox-view, ul, ol") || item.parentElement;
    const groupItems =
      groupRoot instanceof Element ? Array.from(groupRoot.querySelectorAll("li")) : [item];
    if (groupItems.length === 0) {
      return isChoiceItemSelected(item) ? "self" : "";
    }

    return groupItems
      .map((node, index) => (isChoiceItemSelected(node) ? String(index) : ""))
      .filter(Boolean)
      .join(",");
  }

  function collectChoiceItems() {
    const inputFirst = Array.from(
      document.querySelectorAll("input[type='checkbox'], input[type='radio']"),
    )
      .filter((node) => node instanceof Element && isVisible(node) && !isInsideAssistant(node))
      .map((node) => resolveChoiceItemContainer(node))
      .filter((node) => node instanceof Element && isVisible(node) && !isInsideAssistant(node));
    if (inputFirst.length > 0) {
      const dedupedInput = Array.from(new Set(inputFirst));
      const filteredInput = dedupedInput.filter((node) => looksLikeChoiceItem(node));
      if (filteredInput.length > 0) {
        return filteredInput;
      }
    }

    const preferred = Array.from(
      document.querySelectorAll("ul.radio-view li, ul.checkbox-view li, .radio-view li, .checkbox-view li"),
    ).filter((node) => node instanceof Element && isVisible(node) && !isInsideAssistant(node));
    if (preferred.length > 0) {
      return preferred;
    }

    const candidates = Array.from(
      document.querySelectorAll(
        "li, label, [role='radio'], [role='checkbox'], input[type='radio'], input[type='checkbox'], .option, .option-item, .answer-item, .el-radio, .el-checkbox, .ant-radio-wrapper, .ant-checkbox-wrapper",
      ),
    );

    const mapped = candidates
      .map((node) => resolveChoiceItemContainer(node))
      .filter((node) => node instanceof Element && isVisible(node) && !isInsideAssistant(node));

    const deduped = [];
    const seen = new Set();
    for (const node of mapped) {
      if (!(node instanceof Element)) {
        continue;
      }
      const key = `${node.tagName}:${node.className}:${normalizeText(node.textContent || "").slice(0, 120)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      deduped.push(node);
    }

    return deduped.filter((node) => looksLikeChoiceItem(node));
  }

  function resolveChoiceItemContainer(node) {
    if (!(node instanceof Element)) {
      return null;
    }

    if (node.matches("input[type='radio'], input[type='checkbox']")) {
      return (
        node.closest(
          "li, label, [role='radio'], [role='checkbox'], .el-radio, .el-checkbox, .ant-radio-wrapper, .ant-checkbox-wrapper, .option-item, .answer-item",
        ) ||
        node.parentElement ||
        node
      );
    }

    return node.closest("li, label, [role='radio'], [role='checkbox'], .option-item, .answer-item") || node;
  }

  function looksLikeChoiceItem(node) {
    if (!(node instanceof Element)) {
      return false;
    }

    const normalizedText = normalizeText(node.textContent || "").replace(/\s+/g, "");
    if (!normalizedText) {
      return false;
    }

    const looksLikeLabelText =
      /^[A-D][\.\、:：\)\）]/i.test(normalizedText) ||
      /^(对|错|正确|错误|TRUE|FALSE)/i.test(normalizedText);
    if (looksLikeLabelText) {
      return true;
    }

    const className = String(node.className || "").toLowerCase();
    const mayBeChoiceClass = /(radio|checkbox|option|answer|choice|select|item)/.test(className);
    if (!mayBeChoiceClass) {
      return false;
    }

    return /[A-D][\.\、:：\)\）]/i.test(normalizedText) || /(对|错|正确|错误|TRUE|FALSE)/i.test(normalizedText);
  }

  function simulateUserClick(element, options = {}) {
    if (!(element instanceof Element)) {
      return false;
    }
    const target = resolveClickableTarget(element);
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const useNativeClick = Boolean(options.useNativeClick);

    for (const type of ["mouseover", "mousedown", "mouseup", "click"]) {
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
    }
    if (useNativeClick) {
      target.click?.();
    }
    return true;
  }

  function simulateDirectUserClick(element, options = {}) {
    if (!(element instanceof Element)) {
      return false;
    }

    const target = element instanceof HTMLElement ? element : element.parentElement;
    if (!(target instanceof HTMLElement)) {
      return false;
    }

    target.scrollIntoView?.({ block: "center", inline: "center", behavior: "instant" });
    const rect = target.getBoundingClientRect();
    const clientX = rect.left + Math.max(1, Math.min(rect.width - 1, rect.width / 2 || 1));
    const clientY = rect.top + Math.max(1, Math.min(rect.height - 1, rect.height / 2 || 1));
    const common = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX,
      clientY,
      button: 0,
    };

    if (typeof PointerEvent === "function") {
      for (const type of ["pointerover", "pointerenter", "pointerdown", "pointerup"]) {
        target.dispatchEvent(
          new PointerEvent(type, {
            ...common,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          }),
        );
      }
    }

    for (const type of ["mouseover", "mouseenter", "mousedown", "mouseup", "click"]) {
      target.dispatchEvent(new MouseEvent(type, common));
    }

    if (options.useNativeClick) {
      target.click?.();
    }
    return true;
  }

  function resolveClickableTarget(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    const choiceTarget = element.closest(
      "input[type='checkbox'], input[type='radio'], label, [role='checkbox'], [role='radio'], .el-radio, .el-checkbox, .ant-radio-wrapper, .ant-checkbox-wrapper, .checkIcon",
    );
    if (choiceTarget instanceof Element) {
      return choiceTarget;
    }

    return (
      element.closest(
        ".next-topic, .reviewDone, .ZHIHUISHU_QZMD, button.next-topic, button.reviewDone, [role='button']",
      ) || element
    );
  }

  function clickNextQuestionButton() {
    const nextButton = findNextQuestionButton();
    if (!(nextButton instanceof Element) || isElementDisabledLike(nextButton)) {
      return false;
    }
    return simulateUserClick(nextButton, { useNativeClick: false });
  }

  function findNextQuestionButton() {
    const candidates = [
      ".next-topic.next-t",
      "span.next-topic.next-t",
      ".next-topic",
      "button.next-topic",
      ".pre-next .next-t",
    ];

    for (const selector of candidates) {
      const target = firstVisible([selector]);
      if (!(target instanceof Element)) {
        continue;
      }
      const text = normalizeText(target.textContent || "");
      if (!text || /下一题|下一个|next/i.test(text)) {
        return target;
      }
    }

    const textFallback = Array.from(document.querySelectorAll("span,button,a,div")).find((node) => {
      const text = normalizeText(node.textContent || "");
      return /^(下一题|下一个|Next)$/i.test(text);
    });
    return textFallback instanceof Element ? textFallback : null;
  }

  function findSubmitHomeworkButton() {
    const preferredSelectors = [
      ".reviewDone.ZHIHUISHU_QZMD",
      ".reviewDone",
      "span.reviewDone.ZHIHUISHU_QZMD",
      ".right-H .reviewDone.ZHIHUISHU_QZMD",
      ".header-content .right-H:nth-of-type(2) .reviewDone.ZHIHUISHU_QZMD",
      ".header-content .right-H .reviewDone",
      "[class*='reviewDone']",
    ];

    for (const selector of preferredSelectors) {
      const target = firstVisible([selector]);
      if (target instanceof Element && isVisible(target)) {
        return target;
      }
    }

    const textPatterns = [/提交作业/, /提交考试/, /提交试卷/, /交卷/, /^提交$/];
    const candidates = Array.from(document.querySelectorAll("span,button,a,div"));
    return (
      candidates.find((node) => {
        if (!(node instanceof HTMLElement) || !isVisible(node)) {
          return false;
        }
        const text = normalizeText(node.innerText || node.textContent || "");
        return textPatterns.some((pattern) => pattern.test(text));
      }) || null
    );
  }

  function isElementDisabledLike(element) {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    if ("disabled" in element && element.disabled) {
      return true;
    }

    const ariaDisabled = String(element.getAttribute("aria-disabled") || "").toLowerCase();
    if (ariaDisabled === "true") {
      return true;
    }

    const className = `${element.className || ""} ${element.parentElement?.className || ""}`;
    if (/(^|\s)(disabled|is-disabled|btn-disabled|forbid|ban)(\s|$)/i.test(className)) {
      return true;
    }

    const style = window.getComputedStyle(element);
    if (style.pointerEvents === "none" || style.visibility === "hidden" || style.display === "none") {
      return true;
    }
    if (style.cursor === "not-allowed") {
      return true;
    }
    if (Number.parseFloat(style.opacity || "1") <= 0.45) {
      return true;
    }
    if (looksLikeGrayDisabledButton(style)) {
      return true;
    }

    return false;
  }

  function looksLikeGrayDisabledButton(style) {
    const backgroundColor = parseCssRgb(style.backgroundColor);
    const color = parseCssRgb(style.color);
    if (!backgroundColor || !color) {
      return false;
    }

    const backgroundIsGray =
      Math.abs(backgroundColor.r - backgroundColor.g) <= 14 &&
      Math.abs(backgroundColor.g - backgroundColor.b) <= 14 &&
      backgroundColor.r >= 190;
    const textIsGray =
      Math.abs(color.r - color.g) <= 18 &&
      Math.abs(color.g - color.b) <= 18 &&
      color.r >= 120;
    return backgroundIsGray && textIsGray;
  }

  function parseCssRgb(value) {
    const match = String(value || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) {
      return null;
    }
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
    };
  }

  function hasStrongSubmitHomeworkButton() {
    return Boolean(
      firstVisible([
        ".reviewDone.ZHIHUISHU_QZMD",
        "span.reviewDone.ZHIHUISHU_QZMD",
        ".header-content .right-H:nth-of-type(2) .reviewDone.ZHIHUISHU_QZMD",
      ]),
    );
  }

  function isLikelyLastQuestionState() {
    const nextButton = findNextQuestionButton();
    const submitButton = findSubmitHomeworkButton();
    if (!(submitButton instanceof Element)) {
      return false;
    }
    if (!(nextButton instanceof Element)) {
      return true;
    }
    return isElementDisabledLike(nextButton);
  }

  async function advanceToNextQuestionOrSubmit(previousFingerprint, runToken) {
    const nextButton = findNextQuestionButton();
    const submitButton = findSubmitHomeworkButton();

    if (isLikelyLastQuestionState()) {
      if (!simulateUserClick(submitButton)) {
        return { ok: false, action: "submit-failed", error: "已经到最后一题，但提交作业按钮无法点击。" };
      }
      return { ok: true, action: "submit" };
    }

    if (!(nextButton instanceof Element)) {
      if (submitButton instanceof Element && simulateUserClick(submitButton)) {
        return { ok: true, action: "submit" };
      }
      return { ok: false, action: "missing-next", error: "没有找到“下一题”按钮。" };
    }

    if (!simulateUserClick(nextButton)) {
      return { ok: false, action: "next-click-failed", error: "“下一题”按钮点击失败。" };
    }

    const pageChanged = await waitForNextQuestion(previousFingerprint, runToken);
    if (pageChanged) {
      return { ok: true, action: "next" };
    }

    const afterNextButton = findNextQuestionButton();
    const afterSubmitButton = findSubmitHomeworkButton();
    const nextDisabled = afterNextButton instanceof Element && isElementDisabledLike(afterNextButton);
    if ((nextDisabled || !(afterNextButton instanceof Element)) && afterSubmitButton instanceof Element) {
      if (!simulateUserClick(afterSubmitButton)) {
        return { ok: false, action: "submit-failed", error: "疑似已经到最后一题，但提交作业按钮点击失败。" };
      }
      return { ok: true, action: "submit" };
    }

    if (afterSubmitButton instanceof Element && hasStrongSubmitHomeworkButton()) {
      if (!simulateUserClick(afterSubmitButton)) {
        return { ok: false, action: "submit-failed", error: "检测到提交作业按钮，但点击提交失败。" };
      }
      return { ok: true, action: "submit" };
    }

    return {
      ok: false,
      action: "stalled",
      error: "点击“下一题”后页面没有明显变化，且未满足最后一题提交条件。",
    };
  }

  async function handleOpenSettings() {
    try {
      const response = await sendMessage({ type: "autolearning:open-options" });
      if (!response?.ok) {
        throw new Error(response?.error || "无法打开设置页");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function hydrateInlineSettings() {
    try {
      const settings = await getCurrentSettings();
      applySettings(settings);
      await hydrateGitHubAuthStatus({ forceRefresh: true, silent: true });
      renderPlatformSummary();
      await refreshPromptPreview({ silent: true });
      await refreshHistory({ silent: true });
      if (state.settings.cloudAutoSync && !state.cloudSyncStarted) {
        state.cloudSyncStarted = true;
        void handleCloudSync({ silent: true });
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function getCurrentSettings() {
    const response = await sendMessage({ type: "autolearning:get-settings" });
    if (!response?.ok) {
      throw new Error(response?.error || "读取设置失败");
    }
    return response.settings || {};
  }

  function applySettings(settings) {
    const activeSolveModel = sanitizeActiveSolveModel(
      settings?.activeSolveModel || settings?.textModel || settings?.imageModel || state.settings.activeSolveModel,
    );
    state.settings = {
      ...state.settings,
      ...settings,
      promptMode: sanitizePromptMode(settings?.promptMode ?? state.settings.promptMode),
      fullAutoMode: sanitizeFullAutoMode(settings?.fullAutoMode ?? state.settings.fullAutoMode),
      activeSolveModel,
      extraInstructionsChoice:
        String(settings?.extraInstructionsChoice || state.settings.extraInstructionsChoice || DEFAULT_CHOICE_PROMPT).trim() ||
        DEFAULT_CHOICE_PROMPT,
      extraInstructionsCode:
        String(settings?.extraInstructionsCode || state.settings.extraInstructionsCode || DEFAULT_CODE_PROMPT).trim() ||
        DEFAULT_CODE_PROMPT,
      screenshotShortcut:
        normalizeShortcut(settings?.screenshotShortcut) || state.settings.screenshotShortcut,
      fullPageScreenshotShortcut:
        normalizeShortcut(settings?.fullPageScreenshotShortcut) ||
        state.settings.fullPageScreenshotShortcut,
      fullAutoShortcut:
        normalizeShortcut(settings?.fullAutoShortcut) || state.settings.fullAutoShortcut,
      autoSubmitAfterFullCapture: Boolean(
        settings?.autoSubmitAfterFullCapture ?? state.settings.autoSubmitAfterFullCapture,
      ),
      autoPickNextDelayMs: normalizeAutoPickDelay(
        settings?.autoPickNextDelayMs ?? state.settings.autoPickNextDelayMs,
      ),
      fullAutoNextDelayMs: normalizeFullAutoDelay(
        settings?.fullAutoNextDelayMs ?? state.settings.fullAutoNextDelayMs,
      ),
      serverOrigin: "http://03hhhx.dpdns.org",
      cloudRepoOwner: "liuhexiong",
      cloudRepoName: "question-bank",
      cloudRepoBranch: "main",
      cloudAutoSync: Boolean(settings?.cloudAutoSync),
      contributionEmail: String(settings?.contributionEmail || state.settings.contributionEmail || "").trim(),
    };
    state.settings.textModel = activeSolveModel;
    state.settings.imageModel = activeSolveModel;
    renderShortcutTip();
    syncActiveSolveModelUi();
    syncPromptModeUi();
    syncFullAutoModeUi();
    renderPlatformSummary();
  }

  function handleStorageChanged(changes, areaName) {
    if (areaName !== "local") {
      return;
    }

    const nextSettings = {};
    if (changes.promptMode) {
      nextSettings.promptMode = changes.promptMode.newValue;
    }
    if (changes.fullAutoMode) {
      nextSettings.fullAutoMode = changes.fullAutoMode.newValue;
    }
    if (changes.activeSolveModel || changes.textModel || changes.imageModel) {
      nextSettings.activeSolveModel =
        changes.activeSolveModel?.newValue || changes.textModel?.newValue || changes.imageModel?.newValue || "";
    }
    if (changes.extraInstructionsChoice) {
      nextSettings.extraInstructionsChoice = changes.extraInstructionsChoice.newValue || "";
    }
    if (changes.extraInstructionsCode) {
      nextSettings.extraInstructionsCode = changes.extraInstructionsCode.newValue || "";
    }
    if (changes.extraInstructions && !changes.extraInstructionsCode && !changes.extraInstructionsChoice) {
      nextSettings.extraInstructionsCode = changes.extraInstructions.newValue || "";
    }
    if (changes.includeScreenshotInSolver) {
      nextSettings.includeScreenshotInSolver = Boolean(changes.includeScreenshotInSolver.newValue);
    }
    if (changes.autoSolveAfterCapture) {
      nextSettings.autoSolveAfterCapture = Boolean(changes.autoSolveAfterCapture.newValue);
    }
    if (changes.screenshotShortcut) {
      nextSettings.screenshotShortcut =
        normalizeShortcut(changes.screenshotShortcut.newValue) || state.settings.screenshotShortcut;
    }
    if (changes.fullPageScreenshotShortcut) {
      nextSettings.fullPageScreenshotShortcut =
        normalizeShortcut(changes.fullPageScreenshotShortcut.newValue) ||
        state.settings.fullPageScreenshotShortcut;
    }
    if (changes.fullAutoShortcut) {
      nextSettings.fullAutoShortcut =
        normalizeShortcut(changes.fullAutoShortcut.newValue) || state.settings.fullAutoShortcut;
    }
    if (changes.autoSubmitAfterFullCapture) {
      nextSettings.autoSubmitAfterFullCapture = Boolean(changes.autoSubmitAfterFullCapture.newValue);
    }
    if (changes.autoPickNextDelayMs) {
      nextSettings.autoPickNextDelayMs = normalizeAutoPickDelay(changes.autoPickNextDelayMs.newValue);
    }
    if (changes.fullAutoNextDelayMs) {
      nextSettings.fullAutoNextDelayMs = normalizeFullAutoDelay(changes.fullAutoNextDelayMs.newValue);
    }
    if (changes.cloudAutoSync) {
      nextSettings.cloudAutoSync = Boolean(changes.cloudAutoSync.newValue);
    }
    if (changes.contributionEmail) {
      nextSettings.contributionEmail = String(changes.contributionEmail.newValue || "").trim();
    }
    if (changes[GITHUB_AUTH_STORAGE_KEY]) {
      state.githubAuth = normalizeGitHubAuthSession(changes[GITHUB_AUTH_STORAGE_KEY].newValue);
      renderPlatformSummary();
    }
    if (changes[CUSTOM_EXTRACT_STORAGE_KEY]) {
      void hydrateCustomStatementRule();
    }

    if (Object.keys(nextSettings).length === 0) {
      return;
    }

    applySettings(nextSettings);
    syncPromptModeUi();
    syncFullAutoModeUi();
    void refreshPromptPreview({ silent: true });
  }

  async function refreshHistory(options = {}) {
    const silent = Boolean(options.silent);

    try {
      const response = await sendMessage({ type: "autolearning:get-history" });
      if (!response?.ok) {
        throw new Error(response?.error || "读取记录失败");
      }

      state.history = Array.isArray(response.history) ? response.history : [];
      renderHistory(state.history);
      if (!silent) {
        setStatus("已刷新搜题记录。");
      }
    } catch (error) {
      state.history = [];
      renderHistory([]);
      if (!silent) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }
  }

  async function handleClearHistory() {
    try {
      const response = await sendMessage({ type: "autolearning:clear-history" });
      if (!response?.ok) {
        throw new Error(response?.error || "清空记录失败");
      }

      state.history = [];
      renderHistory([]);
      setStatus("搜题记录已清空。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleExportHistoryMarkdown() {
    const history = Array.isArray(state.history) && state.history.length > 0
      ? state.history
      : await loadHistoryForExport();

    if (!Array.isArray(history) || history.length === 0) {
      setStatus("还没有搜题记录可导出。");
      return;
    }

    const markdown = buildHistoryMarkdown(history);
    const exportedAt = new Date().toISOString().slice(0, 10);
    downloadTextFile(`autolearning-history-${exportedAt}.md`, markdown, "text/markdown;charset=utf-8");
    setStatus("搜题记录已导出为 Markdown。");
  }

  async function loadHistoryForExport() {
    const response = await sendMessage({ type: "autolearning:get-history" });
    if (!response?.ok) {
      throw new Error(response?.error || "读取记录失败");
    }
    const history = Array.isArray(response.history) ? response.history : [];
    state.history = history;
    renderHistory(history);
    return history;
  }

  async function refreshPromptPreview(options = {}) {
    const silent = Boolean(options.silent);
    const mode = getPromptMode();

    try {
      if (!state.problem && mode === "choice") {
        renderPromptPreview("选择题模式不会自动提取题面，请先点击“提取题面”。");
        if (!silent) {
          setStatus("选择题模式不会自动提取题面。");
        }
        return;
      }

      const problem = state.problem || (await extractProblem());
      state.problem = problem;
      renderProblem(problem);

      const response = await sendMessage({
        type: "autolearning:preview-prompt",
        problem,
        extraInstructions: getStoredExtraInstructions(),
      });

      if (!response?.ok) {
        throw new Error(response?.error || "预览生成失败");
      }

      state.promptPreview = response.preview;
      renderPromptPreview(formatPromptPreview(response.preview));

      if (!silent) {
        setStatus("已刷新发送给 AI 的内容预览。");
      }
    } catch (error) {
      renderPromptPreview("预览生成失败。");
      if (!silent) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    }
  }

  async function handleCopyPromptPreview() {
    const previewText = elements.promptPreview?.textContent || "";
    if (!previewText || previewText === "还没有可预览的内容。") {
      setStatus("还没有可复制的预览内容。");
      return;
    }

    if (await copyTextToClipboard(previewText)) {
      setStatus("预览内容已复制到剪贴板。");
    } else {
      setStatus("复制预览失败，请手动选择。");
    }
  }

  function formatPromptPreview(preview) {
    return [
      `模型：${preview?.model || "未知"}`,
      `提示词模式：${preview?.promptMode === "choice" ? "选择题" : "代码题"}`,
      `温度：${preview?.temperature ?? "未知"}`,
      `额外提示词：${preview?.extraInstructions || "[空]"}`,
      `直接发图：${preview?.hasImage ? "是" : "否"}`,
      `附带 OCR：${preview?.hasOcr ? "是" : "否"}`,
      "",
      "[System Prompt]",
      preview?.system || "[空]",
      "",
      "[User Prompt]",
      preview?.user || "[空]",
    ].join("\n");
  }

  function renderPromptPreview(text) {
    if (elements.promptPreview) {
      elements.promptPreview.textContent = text;
    }
  }

  function renderChoiceAnswer(text) {
    const mode = getPromptMode();
    const value = String(text || "").trim();
    if (elements.choiceAnswerWrap) {
      elements.choiceAnswerWrap.hidden = mode !== "choice";
    }
    if (elements.codeWrap) {
      elements.codeWrap.hidden = mode === "choice";
    }
    if (elements.compactCodeWrap) {
      elements.compactCodeWrap.hidden = false;
    }
    if (elements.compactPreviewTitle) {
      elements.compactPreviewTitle.textContent = mode === "choice" ? "答案映射速览" : "代码速览";
    }
    if (elements.choiceAnswer) {
      elements.choiceAnswer.textContent = value || "还没有生成答案。";
    }
    if (mode === "choice") {
      renderGeneratedCode("");
    } else {
      renderCompactCodeCopyStatus(false);
    }
  }

  function renderGeneratedCode(text) {
    const value = String(text || "");
    const mode = getPromptMode();
    if (elements.code) {
      elements.code.value = value;
    }
    if (elements.compactCode) {
      elements.compactCode.textContent =
        mode === "choice"
          ? buildChoiceAnswerPreview(state.problem, state.result)
          : buildCompactCodePreview(value);
    }
  }

  function renderCompactCodeCopyStatus(visible) {
    if (!(elements.compactCodeCopyStatus instanceof HTMLElement)) {
      return;
    }

    elements.compactCodeCopyStatus.hidden = !visible;
  }

  function buildCompactCodePreview(text) {
    const normalized = normalizeCode(text).trim();
    if (!normalized) {
      return "还没有生成代码。";
    }

    const maxLines = 6;
    const maxChars = 320;
    const lines = normalized.split("\n");
    let preview = lines.slice(0, maxLines).join("\n");
    let truncated = lines.length > maxLines;

    if (preview.length > maxChars) {
      preview = preview.slice(0, maxChars).trimEnd();
      truncated = true;
    }

    if (!truncated) {
      return preview;
    }

    return `${preview.trimEnd()}\n...`;
  }

  function buildChoiceAnswerPreview(problem, result) {
    const lines = resolveChoiceAnswerPreviewLines(problem, result);
    if (lines.length === 0) {
      const fallback = String(result?.answer || result?.code || "").trim();
      return fallback || "还没有生成答案映射。";
    }
    return lines.join("\n");
  }

  function resolveChoiceAnswerPreviewLines(problem, result) {
    const answer = normalizeChoiceAnswerForBank(result?.answerLetter || result?.answer || result?.code || "");
    if (!answer) {
      return [];
    }

    const labels = extractChoiceLabels(answer);
    if (labels.length === 0) {
      return [];
    }

    const currentOptions = normalizeChoiceOptionSnapshot(problem?.choiceOptions || []);
    const snapshotOptions = normalizeChoiceOptionSnapshot(result?.optionMapSnapshot || []);
    const answerTextParts = String(result?.answerText || "")
      .split("|")
      .map((item) => normalizeText(item))
      .filter(Boolean);

    return labels
      .map((label, index) => {
        const currentMatch = currentOptions.find((option) => option.label === label)?.text || "";
        const snapshotMatch = snapshotOptions.find((option) => option.label === label)?.text || "";
        const answerTextMatch = answerTextParts[index] || "";
        const finalText = normalizeText(currentMatch || answerTextMatch || snapshotMatch);
        return finalText ? `${label}: ${finalText}` : label;
      })
      .filter(Boolean);
  }

  function renderGeneratedTitle(text) {
    if (elements.generatedTitle) {
      elements.generatedTitle.textContent = text || "还没有 AI 标题。";
    }
  }

  function renderCurrentClassification(result) {
    if (elements.problemType) {
      elements.problemType.textContent = result?.problemType || "还没有题型分类。";
    }
    if (elements.problemDefinition) {
      elements.problemDefinition.textContent = result?.problemDefinition || "还没有问题定义。";
    }
  }

  function renderHistory(history) {
    if (!elements.historyList) {
      return;
    }

    if (!Array.isArray(history) || history.length === 0) {
      elements.historyList.textContent = "还没有搜题记录。";
      return;
    }

      elements.historyList.innerHTML = history
      .map((item) => {
        const title = escapeHtml(item.generatedTitle || item.title || "未命名题目");
        const sourceTitle = escapeHtml(item.sourceTitle || "");
        const problemType = escapeHtml(item.problemType || "未分类");
        const definition = escapeHtml(item.problemDefinition || "没有问题定义。");
        const approach = escapeHtml(item.approach || "没有保存解题思路。");
        const savedAt = escapeHtml(formatDateTime(item.savedAt));
        const model = escapeHtml(item.model || "未知模型");
        const language = escapeHtml(item.language || "未知语言");
        const pageUrl = String(item.pageUrl || "").trim();

        return `
          <article class="al-history-item">
            <div class="al-history-meta">
              <strong>${title}</strong>
              <span>${savedAt}</span>
            </div>
            ${sourceTitle ? `<p class="al-history-text"><b>页面标题：</b>${sourceTitle}</p>` : ""}
            <div class="al-history-tags">
              <span>${problemType}</span>
              <span>${language}</span>
              <span>${model}</span>
            </div>
            <p class="al-history-text"><b>问题定义：</b>${definition}</p>
            <p class="al-history-text"><b>解题思路：</b>${approach}</p>
            ${
              pageUrl
                ? `<a class="al-history-link" href="${escapeHtml(pageUrl)}" target="_blank" rel="noreferrer">打开原题</a>`
                : ""
            }
          </article>
        `;
      })
      .join("");
  }

  function buildHistoryMarkdown(history) {
    const lines = [
      "# AutoLearning 搜题记录",
      "",
      `导出时间：${formatDateTime(new Date().toISOString())}`,
      `记录数量：${history.length}`,
      "",
      "---",
      "",
    ];

    history.forEach((item, index) => {
      const title = String(item.generatedTitle || item.title || "未命名题目").trim();
      const sourceTitle = String(item.sourceTitle || "").trim();
      const pageUrl = String(item.pageUrl || "").trim();
      const problemType = String(item.problemType || "未分类").trim();
      const problemDefinition = String(item.problemDefinition || "没有问题定义。").trim();
      const approach = String(item.approach || "没有保存解题思路。").trim();
      const summary = String(item.summary || "").trim();
      const model = String(item.model || "未知模型").trim();
      const language = String(item.language || "未知语言").trim();
      const code = String(item.code || "");

      lines.push(`## ${index + 1}. ${title}`);
      lines.push("");
      lines.push(`- 保存时间：${formatDateTime(item.savedAt)}`);
      lines.push(`- 原题链接：${pageUrl || "无"}`);
      if (sourceTitle) {
        lines.push(`- 页面标题：${sourceTitle}`);
      }
      lines.push(`- 题型分类：${problemType}`);
      lines.push(`- 编程语言：${language}`);
      lines.push(`- 使用模型：${model}`);
      if (summary) {
        lines.push(`- 结果总结：${summary}`);
      }
      lines.push("");
      lines.push("### 问题定义");
      lines.push("");
      lines.push(problemDefinition);
      lines.push("");
      lines.push("### 解题思路");
      lines.push("");
      lines.push(approach);
      lines.push("");
      lines.push("### 代码");
      lines.push("");
      lines.push("```");
      lines.push(code);
      lines.push("```");
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    return lines.join("\n");
  }

  function renderShortcutTip() {
    if (elements.shortcutTip) {
      elements.shortcutTip.textContent =
        `框选 ${state.settings.screenshotShortcut} / 固定区 ${state.settings.fullPageScreenshotShortcut} / 全自动 ${state.settings.fullAutoShortcut}${
          state.fixedCaptureRegion ? " 已设定" : " 未设定"
        }`;
    }
  }

  function renderPlatformSummary() {
    if (!elements.platformSummary) {
      return;
    }
    if (!isQuestionBankEnabledForCurrentMode()) {
      elements.platformSummary.textContent = "代码题模式暂不支持题库功能，当前直接使用 AI 生成结果。";
      return;
    }
    const activeSolveModel = sanitizeActiveSolveModel(state.settings.activeSolveModel);
    const owner = String(state.settings.cloudRepoOwner || "").trim();
    const repo = String(state.settings.cloudRepoName || "").trim();
    const branch = String(state.settings.cloudRepoBranch || "").trim() || "main";
    if (!owner || !repo) {
      elements.platformSummary.textContent =
        `当前解题模型：${activeSolveModel}。还没有配置云端仓库；配置后可下载 GitHub 云端题库到本地缓存使用。`;
      return;
    }
    elements.platformSummary.textContent =
      `当前解题模型：${activeSolveModel}。当前云端仓库：${owner}/${repo}@${branch}。下载云端题库不需要登录，但当前网络需要能访问 GitHub；贡献题目会打开 GitHub Issue 页面，由仓库里的 Actions 自动校验并生成待审核更新。`;
  }

  async function hydrateGitHubAuthStatus(options = {}) {
    try {
      const response = await sendMessage({
        type: "autolearning:github-auth-status",
        forceRefresh: Boolean(options.forceRefresh),
      });
      if (!response?.ok) {
        throw new Error(response?.error || "读取 GitHub 登录状态失败");
      }
      state.githubAuth = normalizeGitHubAuthSession(response.authSession);
      renderPlatformSummary();
      return state.githubAuth;
    } catch (error) {
      state.githubAuth = null;
      renderPlatformSummary();
      if (!options.silent) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
      return null;
    }
  }

  async function handleGitHubAuthLogin(options = {}) {
    try {
      if (!options.silent) {
        setStatus("正在打开 GitHub 登录...", {
          busy: true,
          hint: "需要后端服务可访问。",
        });
      }
      const response = await sendMessage({ type: "autolearning:github-auth-start" });
      if (!response?.ok) {
        throw new Error(response?.error || "GitHub 登录失败");
      }
      state.githubAuth = normalizeGitHubAuthSession(response.authSession);
      renderPlatformSummary();
      if (!options.silent) {
        const login = state.githubAuth?.user?.login;
        setStatus(login ? `GitHub 登录成功：${login}` : "GitHub 登录成功。");
      }
      return state.githubAuth;
    } catch (error) {
      if (!options.silent) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  async function handleGitHubAuthLogout(options = {}) {
    try {
      if (!options.silent) {
        setStatus("正在退出 GitHub...");
      }
      const response = await sendMessage({ type: "autolearning:github-auth-logout" });
      if (!response?.ok) {
        throw new Error(response?.error || "退出 GitHub 登录失败");
      }
      state.githubAuth = null;
      renderPlatformSummary();
      if (!options.silent) {
        setStatus("已退出 GitHub 登录。");
      }
    } catch (error) {
      if (!options.silent) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
      throw error;
    }
  }

  function normalizeGitHubAuthSession(authSession) {
    if (!authSession || typeof authSession !== "object") {
      return null;
    }
    const sessionToken = String(authSession.sessionToken || "").trim();
    const user = authSession.user && typeof authSession.user === "object" ? authSession.user : null;
    if (!sessionToken || !user) {
      return null;
    }
    return {
      sessionToken,
      user: {
        id: String(user.id || "").trim(),
        login: String(user.login || "").trim(),
        name: String(user.name || "").trim(),
        avatarUrl: String(user.avatarUrl || "").trim(),
        profileUrl: String(user.profileUrl || "").trim(),
        isAdmin: Boolean(user.isAdmin),
      },
      updatedAt: String(authSession.updatedAt || "").trim(),
    };
  }

  function buildGitHubAuthSummaryHtml(options = {}) {
    return `
      <div class="al-summary-card">
        <div class="al-summary-grid">
          ${buildSummaryRow("GitHub", "无需登录")}
          ${buildSummaryHint("提交时会打开 GitHub Issue 页面，仓库会自动解析 JSON 并生成待审核更新。")}
        </div>
      </div>
    `;
  }

  async function handleCloudSync(options = {}) {
    if (!isQuestionBankEnabledForCurrentMode()) {
      setStatus("浠ｇ爜棰樻ā寮忔殏涓嶆敮鎸佷簯绔搴撳姛鑳斤紝褰撳墠鐩存帴浣跨敤 AI 鐢熸垚缁撴灉銆?");
      return;
    }
    const silent = Boolean(options.silent);
    setStatus("正在从 GitHub 下载云端题库...", {
      busy: !silent,
      hint: "请确保当前网络可以访问 GitHub。",
    });
    try {
      const response = await sendMessage({ type: "autolearning:cloud-sync" });
      if (!response?.ok) {
        throw new Error(response?.error || "下载云端题库失败");
      }
      const importedCount = mergeCloudQuestionBank(response.cloudBank);
      if (importedCount > 0) {
        await persistQuestionBank();
        if (typeof state.reviewModalRefresh === "function") {
          state.reviewModalRefresh({ preserveNotice: true });
        }
      }
      setStatus(`云端题库下载完成，已合并 ${importedCount} 条记录。`, {
        hint: "云端题库已缓存到本地，可直接参与匹配。",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`下载云端题库失败：${message}`, {
        hint: "请检查当前网络是否可以访问 GitHub。",
      });
    }
  }

  function renderCustomStatementRuleStatus() {
    if (!elements.customStatementRuleStatus) {
      return;
    }

    const rule = state.customStatementRule;
    if (!rule) {
      elements.customStatementRuleStatus.textContent = "当前页面还没有自定义题面规则。";
      return;
    }

    const resolved = resolveCustomStatementElement(rule);
    const preview = summarizeEdgeText(rule.textPreview || "", "start", 80);
    const savedAt = formatDateTime(rule.savedAt);
    const matchedSelector = resolved?.selector || "";
    renderCustomStatementRuleStatusHtml(`
      <div class="al-summary-card">
        <div class="al-summary-grid">
          ${buildSummaryRow("状态", resolved ? "已保存，可用" : "已保存，当前未命中")}
          ${buildSummaryRow("保存时间", savedAt || "未知")}
          ${rule.pickedTag ? buildSummaryRow("保存节点", rule.pickedTag) : ""}
          ${buildSummaryRow("候选规则", `${Array.isArray(rule.selectorCandidates) ? rule.selectorCandidates.length : 0} 条`)}
          ${matchedSelector ? buildSummaryRow("当前命中", matchedSelector) : ""}
          ${buildSummaryHint(
            resolved
              ? "提取题面时会优先使用这条自定义规则。"
              : "当前页面没有命中这条规则；提取时会自动回退到内置选择器。",
            resolved ? "default" : "warning",
          )}
        </div>
        <div class="al-summary-preview-card">
          <div class="al-summary-preview-label">保存时预览</div>
          <div class="al-summary-preview-text">${escapeHtml(preview || "无预览文本")}</div>
        </div>
      </div>
    `);
  }

  function renderCustomStatementRuleStatusHtml(html) {
    if (elements.customStatementRuleStatus) {
      elements.customStatementRuleStatus.innerHTML = html;
    }
  }

  function renderFullAutoButton() {
    if (!(elements.fullAutoButton instanceof HTMLButtonElement)) {
      return;
    }

    elements.fullAutoButton.textContent = state.fullAutoRunning ? "停止全自动" : "开启全自动";
    elements.fullAutoButton.setAttribute("data-running", state.fullAutoRunning ? "true" : "false");
    elements.fullAutoButton.classList.toggle("al-primary", !state.fullAutoRunning);
  }

  function buildCodeModeAssetHint(problem) {
    const codeReady = Number(problem?.currentCodeLineCount) > 0;
    const screenshotCount = getProblemScreenshotItems(problem).length;

    if (codeReady && screenshotCount > 0) {
      return `已准备题面、代码和 ${screenshotCount} 张截图，生成答案时会一起发送给 AI。`;
    }
    if (codeReady) {
      return "已准备题面和代码；如果题面里还有图片信息，可以继续框选截图后再生成答案。";
    }
    if (screenshotCount > 0) {
      return `已准备题面和 ${screenshotCount} 张截图，但还没有同步编辑器代码；生成前建议先复制代码。`;
    }
    return "已准备题面；下一步建议先从编辑器复制代码，再按需框选题面图片。";
  }

  function renderScreenshotStatus(problem) {
    if (!elements.screenshotStatus) {
      return;
    }

    const screenshotItems = getProblemScreenshotItems(problem);
    renderScreenshotBufferButton(screenshotItems.length > 0);
    if (screenshotItems.length > 1) {
      const ocrReadyCount = screenshotItems.filter((item) => item.ocrText).length;
      const directImageCount = screenshotItems.filter((item) => item.ocrSkipped).length;
      const modeText = screenshotItems[0]?.mode === "fixedRegion" ? "固定区域截图" : "题面截图";
      if (directImageCount === screenshotItems.length) {
        elements.screenshotStatus.textContent =
          getPromptMode() === "code"
            ? `已缓冲 ${screenshotItems.length} 张${modeText}，生成答案时会连同题面文本和代码一起发给 AI。`
            : `已缓冲 ${screenshotItems.length} 张${modeText}，提交时会一并发给 AI，不会自动提交。`;
        return;
      }
      if (ocrReadyCount === screenshotItems.length) {
        elements.screenshotStatus.textContent =
          getPromptMode() === "code"
            ? `已缓冲 ${screenshotItems.length} 张${modeText}，OCR 文本已准备好，生成答案时会连同题面文本和代码一起发送。`
            : `已缓冲 ${screenshotItems.length} 张${modeText}，OCR 文本已准备好，等待你手动提交。`;
        return;
      }
      elements.screenshotStatus.textContent = `已缓冲 ${screenshotItems.length} 张${modeText}，其中 ${ocrReadyCount} 张已完成 OCR。`;
      return;
    }

    if (problem?.screenshotDataUrl) {
      if (problem?.ocrSkipped) {
        elements.screenshotStatus.textContent =
          problem?.screenshotMode === "fixedRegion"
            ? getPromptMode() === "code"
              ? "已截取固定区域截图，生成答案时会把图片、题面文本和代码一起发给 AI，不再调用 OCR。"
              : "已截取固定区域截图，生成时将直接发送图片，不再调用 OCR。"
            : getPromptMode() === "code"
              ? "已截取题面截图，生成答案时会把图片、题面文本和代码一起发给 AI，不再调用 OCR。"
              : "已截取题面截图，生成时将直接发送图片，不再调用 OCR。";
        return;
      }

      elements.screenshotStatus.textContent = problem?.ocrText
        ? problem?.screenshotMode === "fixedRegion"
          ? "已截取固定区域截图，并已转写为 OCR 文本。"
          : "已截取题面截图，并已转写为 OCR 文本。"
        : problem?.screenshotMode === "fixedRegion"
          ? "已截取固定区域截图，等待 OCR 转写。"
          : "已截取题面截图，等待 OCR 转写。";
      return;
    }

    elements.screenshotStatus.textContent = "还没有附带题面截图。";
  }

  function renderScreenshotBufferButton(visible) {
    if (!(elements.clearScreenshotBuffer instanceof HTMLButtonElement)) {
      return;
    }

    elements.clearScreenshotBuffer.hidden = !visible;
  }

  function renderOcrText(text) {
    if (!elements.ocrText) {
      return;
    }

    elements.ocrText.textContent = text || "还没有 OCR 结果。";
  }

  function getProblemScreenshotItems(problem) {
    if (!Array.isArray(problem?.screenshotItems)) {
      return [];
    }

    return problem.screenshotItems.filter(
      (item) => item && typeof item.dataUrl === "string" && item.dataUrl.startsWith("data:image/"),
    );
  }

  function createScreenshotItem({ dataUrl, rect, mode, ocrText = "", ocrModel = "", ocrSkipped = false }) {
    return {
      id: `shot-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      dataUrl,
      rect,
      mode,
      ocrText: String(ocrText || ""),
      ocrModel: String(ocrModel || ""),
      ocrSkipped: Boolean(ocrSkipped),
      capturedAt: new Date().toISOString(),
    };
  }

  function mergeScreenshotData(problem, screenshotItems) {
    const items = Array.isArray(screenshotItems) ? screenshotItems.filter(Boolean) : [];
    const latest = items[items.length - 1] || null;
    const mergedOcrText = items
      .map((item, index) => {
        const text = normalizeText(item?.ocrText || "");
        if (!text) {
          return "";
        }
        return items.length > 1 ? `第 ${index + 1} 张截图 OCR：\n${text}` : text;
      })
      .filter(Boolean)
      .join("\n\n");

    return {
      ...problem,
      screenshotItems: items,
      screenshotDataUrl: latest?.dataUrl || "",
      screenshotRect: latest?.rect || null,
      screenshotMode: latest?.mode || "",
      ocrText: mergedOcrText,
      ocrModel: items.map((item) => item?.ocrModel || "").filter(Boolean).join(", "),
      ocrSkipped: items.length > 0 ? items.every((item) => item?.ocrSkipped) : false,
    };
  }

  function clearScreenshotData(problem) {
    return {
      ...problem,
      screenshotItems: [],
      screenshotDataUrl: "",
      screenshotRect: null,
      screenshotMode: "",
      ocrText: "",
      ocrModel: "",
      ocrSkipped: false,
    };
  }

  function sanitizePromptMode(value) {
    return value === "choice" ? "choice" : "code";
  }

  function sanitizeActiveSolveModel(value) {
    const normalized = String(value || "").trim();
    return SUPPORTED_SOLVE_MODELS.includes(normalized) ? normalized : DEFAULT_ACTIVE_SOLVE_MODEL;
  }

  function renderSolveModelOptions() {
    return SOLVE_MODELS.map((item) => {
      const value = escapeHtml(item?.value || "");
      return `<option value="${value}">${value}</option>`;
    }).join("");
  }

  function getActiveSolveModelIconUrl(model) {
    const normalizedModel = sanitizeActiveSolveModel(model);
    const modelIconUrl = MODEL_ICON_URLS[normalizedModel];
    if (typeof modelIconUrl === "string" && modelIconUrl.trim()) {
      return modelIconUrl;
    }
    const defaultModelIconUrl = MODEL_ICON_URLS[DEFAULT_ACTIVE_SOLVE_MODEL];
    if (typeof defaultModelIconUrl === "string" && defaultModelIconUrl.trim()) {
      return defaultModelIconUrl;
    }
    return SPINNER_ICON_URL;
  }

  function sanitizeFullAutoMode(value) {
    return value === "capture" ? "capture" : "extract";
  }

  function getPromptMode() {
    return sanitizePromptMode(state.settings.promptMode);
  }

  function getFullAutoMode() {
    return sanitizeFullAutoMode(state.settings.fullAutoMode);
  }

  function getPromptStorageKey(mode) {
    return sanitizePromptMode(mode) === "choice"
      ? "extraInstructionsChoice"
      : "extraInstructionsCode";
  }

  function getPromptValueByMode(mode) {
    return sanitizePromptMode(mode) === "choice"
      ? String(state.settings.extraInstructionsChoice || DEFAULT_CHOICE_PROMPT).trim()
      : String(state.settings.extraInstructionsCode || DEFAULT_CODE_PROMPT).trim();
  }

  function syncActiveSolveModelUi() {
    renderActiveSolveModelIcon();
    if (!elements.activeSolveModel) {
      return;
    }
    elements.activeSolveModel.value = sanitizeActiveSolveModel(state.settings.activeSolveModel);
  }

  function renderActiveSolveModelIcon() {
    if (!(elements.statusSpinner instanceof HTMLElement)) {
      return;
    }
    const iconUrl = getActiveSolveModelIconUrl(state.settings.activeSolveModel);
    elements.statusSpinner.style.backgroundImage = `url("${iconUrl}")`;
  }

  function syncPromptModeUi() {
    const mode = getPromptMode();
    if (elements.promptModeChoice) {
      elements.promptModeChoice.setAttribute("data-active", mode === "choice" ? "true" : "false");
    }
    if (elements.promptModeCode) {
      elements.promptModeCode.setAttribute("data-active", mode === "code" ? "true" : "false");
    }
    renderChoiceAnswer(mode === "choice" ? state.result?.answer || state.result?.code || "" : "");
    renderGeneratedCode(state.result?.code || "");
    renderPromptModeDependentUi(mode);
    renderFullAutoButton();
    syncQuestionBankUiByMode(mode);
  }

  function renderPromptModeDependentUi(mode = getPromptMode()) {
    const isCodeMode = sanitizePromptMode(mode) === "code";
    if (elements.capturePrimaryButton instanceof HTMLButtonElement) {
      elements.capturePrimaryButton.hidden = !isCodeMode;
      elements.capturePrimaryButton.disabled = !isCodeMode;
      elements.capturePrimaryButton.classList.toggle("al-primary", isCodeMode);
    }
    if (elements.fullAutoButton instanceof HTMLButtonElement) {
      elements.fullAutoButton.hidden = isCodeMode;
      elements.fullAutoButton.disabled = isCodeMode;
    }
    if (elements.captureMoreButton instanceof HTMLButtonElement) {
      elements.captureMoreButton.hidden = isCodeMode;
      elements.captureMoreButton.disabled = isCodeMode;
    }
    if (elements.modeFlowHint instanceof HTMLElement) {
      elements.modeFlowHint.textContent = isCodeMode
        ? "代码题流程：1. 提取题面 2. 从编辑器复制代码 3. 框选题面图片后生成答案。代码、题面文本、截图会一起发给 AI。"
        : "选择题流程：提取题面后生成答案；如需连续答题，可直接开启全自动。";
    }
    if (elements.promptModeSummary instanceof HTMLElement) {
      elements.promptModeSummary.textContent = isCodeMode
        ? "代码题建议先提取题面，再复制编辑器代码，按需框选题面图片，最后生成答案。"
        : "先选题型，再提取题面或生成答案。";
    }
  }

  function isQuestionBankEnabledForCurrentMode(mode = getPromptMode()) {
    return sanitizePromptMode(mode) === "choice";
  }

  function syncQuestionBankUiByMode(mode = getPromptMode()) {
    const enabled = isQuestionBankEnabledForCurrentMode(mode);
    if (elements.editQuestionBank instanceof HTMLElement) {
      elements.editQuestionBank.hidden = !enabled;
      elements.editQuestionBank.disabled = !enabled;
    }
    if (elements.cloudSync instanceof HTMLElement) {
      elements.cloudSync.hidden = !enabled;
      elements.cloudSync.disabled = !enabled;
    }
    if (elements.openContribution instanceof HTMLElement) {
      elements.openContribution.hidden = !enabled;
      elements.openContribution.disabled = !enabled;
    }
    if (elements.questionBankSection instanceof HTMLElement) {
      elements.questionBankSection.hidden = !enabled;
    }
  }

  async function handleActiveSolveModelChange(event) {
    const nextModel = sanitizeActiveSolveModel(event?.target?.value);
    const previousModel = sanitizeActiveSolveModel(state.settings.activeSolveModel);
    if (nextModel === previousModel) {
      syncActiveSolveModelUi();
      return;
    }

    state.settings.activeSolveModel = nextModel;
    state.settings.textModel = nextModel;
    state.settings.imageModel = nextModel;
    syncActiveSolveModelUi();
    renderPlatformSummary();

    try {
      await storageSet({
        activeSolveModel: nextModel,
        textModel: nextModel,
        imageModel: nextModel,
        model: nextModel,
      });
      setStatus(`已切换模型：${nextModel}`);
      void refreshPromptPreview({ silent: true });
    } catch (error) {
      state.settings.activeSolveModel = previousModel;
      state.settings.textModel = previousModel;
      state.settings.imageModel = previousModel;
      syncActiveSolveModelUi();
      renderPlatformSummary();
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  function syncFullAutoModeUi() {
    const mode = getFullAutoMode();
    if (elements.fullAutoModeCapture) {
      elements.fullAutoModeCapture.setAttribute("data-active", mode === "capture" ? "true" : "false");
    }
    if (elements.fullAutoModeExtract) {
      elements.fullAutoModeExtract.setAttribute("data-active", mode === "extract" ? "true" : "false");
    }
    if (elements.fullAutoModeSummary) {
      elements.fullAutoModeSummary.textContent =
        mode === "capture"
          ? "截图全自动会使用固定区域截图继续答题，适合页面题面不容易直接提取时使用。"
          : "提取题面全自动会直接读取页面题干和选项文本，不使用 OCR，适合纯文本模型。";
    }
    renderFullAutoButton();
  }

  function getStoredExtraInstructions() {
    return getPromptValueByMode(getPromptMode());
  }

  async function handlePromptModeSwitch(mode) {
    const nextMode = sanitizePromptMode(mode);
    const currentMode = getPromptMode();
    if (nextMode === currentMode) {
      return;
    }

    const currentValue = getPromptValueByMode(currentMode);
    const currentStorageKey = getPromptStorageKey(currentMode);
    const nextStorageKey = getPromptStorageKey(nextMode);

    state.settings[currentStorageKey] = currentValue || getPromptValueByMode(currentMode);
    state.settings.promptMode = nextMode;
    syncPromptModeUi();

    try {
      await storageSet({
        promptMode: nextMode,
        [currentStorageKey]: state.settings[currentStorageKey],
        [nextStorageKey]: getPromptValueByMode(nextMode),
      });
      await refreshPromptPreview({ silent: true });
      setStatus(`已切换到${nextMode === "choice" ? "选择题" : "代码题"}提示词模式。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleFullAutoModeSwitch(mode) {
    const nextMode = sanitizeFullAutoMode(mode);
    const currentMode = getFullAutoMode();
    if (nextMode === currentMode) {
      return;
    }

    state.settings.fullAutoMode = nextMode;
    syncFullAutoModeUi();

    try {
      await storageSet({
        fullAutoMode: nextMode,
      });
      setStatus(`已切换到${nextMode === "capture" ? "截图全自动" : "提取题面全自动"}。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCaptureScreenshot() {
    return handleCaptureImageFlow({
      mode: "selection",
      appendToBuffer: true,
      respectAutoSolveSetting: false,
    });
  }

  async function handleDefineFixedCaptureRegion() {
    openPanel();
    setStatus("请框选一个固定截图区域，后续快捷键会直接使用它。");

    try {
      const rect = await selectScreenshotArea("拖拽设定固定截图区域，松开保存，Esc 取消");
      if (!rect) {
        setStatus("已取消固定区域设定。");
        return;
      }

      await persistFixedCaptureRegion(rect);
      state.fixedCaptureRegion = rectToStoredCaptureRegion(rect);
      renderShortcutTip();
      setStatus("固定截图区域已保存。之后按固定区快捷键会直接截这里。");
      showToast("固定区域已经记住了，之后按快捷键就会直接截图并生成。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCaptureFullPageScreenshot() {
    return handleCaptureImageFlow({ mode: "fixedRegion", autoSolve: true, autoSubmit: true });
  }

  async function handleClearScreenshotBuffer() {
    if (!state.problem) {
      renderScreenshotBufferButton(false);
      setStatus("当前没有可清空的截图缓冲。");
      return;
    }

    const screenshotItems = getProblemScreenshotItems(state.problem);
    if (screenshotItems.length === 0) {
      renderScreenshotBufferButton(false);
      setStatus("当前没有可清空的截图缓冲。");
      return;
    }

    state.problem = clearScreenshotData(state.problem);
    renderProblem(state.problem);
    renderScreenshotStatus(state.problem);
    renderOcrText("");
    await refreshPromptPreview({ silent: true });
    setStatus("截图缓冲已清空。");
  }

  async function handleCaptureImageFlow(options = {}) {
    openPanel();
    const mode = options.mode === "fixedRegion" ? "fixedRegion" : "selection";
    const promptMode = getPromptMode();
    const autoSolveRequested = Boolean(options.autoSolve);
    const autoSubmitRequested = Boolean(options.autoSubmit);
    const autoNavigate = options.autoNavigate !== false;
    const appendToBuffer = Boolean(options.appendToBuffer);
    const respectAutoSolveSetting = options.respectAutoSolveSetting !== false;
    startBusyStatus(
      mode === "fixedRegion"
        ? "正在使用固定区域截图..."
        : "请框选题面区域，按 Esc 可以取消。",
      mode === "fixedRegion" ? "正在准备固定区域截图。" : "请拖拽选择题面区域。",
    );

    try {
      let rect = null;
      if (mode === "selection") {
        rect = await selectScreenshotArea();
        if (!rect) {
          stopBusyStatus("已取消截图。", "本次没有执行截图。");
          return;
        }
      } else {
        rect = await getOrCreateFixedCaptureRect();
        if (!rect) {
          stopBusyStatus("还没有设定固定截图区域。", "需要先设定固定区域。");
          return;
        }
      }

      setStatus(mode === "fixedRegion" ? "正在截取固定区域图片..." : "正在截取题面图片...");
      const response = await sendMessage({ type: "autolearning:capture-visible-tab" });
      if (!response?.ok || !response.dataUrl) {
        throw new Error(response?.error || "页面截图失败");
      }

      const screenshotDataUrl = await cropImageDataUrl(response.dataUrl, rect);
      const settings = await getCurrentSettings();
      applySettings(settings);
      const useDirectImage = Boolean(state.settings.includeScreenshotInSolver);
      const autoSolveAfterCapture =
        autoSolveRequested ||
        autoSubmitRequested ||
        (respectAutoSolveSetting && Boolean(state.settings.autoSolveAfterCapture));
      let problem =
        promptMode === "choice"
          ? createEmptyProblemContext()
          : state.problem || (await extractProblem());
      const existingItems = appendToBuffer ? getProblemScreenshotItems(problem) : [];
      const screenshotItem = createScreenshotItem({
        dataUrl: screenshotDataUrl,
        rect,
        mode,
        ocrSkipped: useDirectImage,
      });
      let screenshotItems = [...existingItems, screenshotItem];
      problem = mergeScreenshotData(problem, screenshotItems);
      state.problem = problem;

      renderProblem(problem);
      renderScreenshotStatus(problem);
      renderOcrText("");
      if (useDirectImage) {
        await refreshPromptPreview({ silent: true });
        stopBusyStatus(
          appendToBuffer
            ? `已缓冲第 ${screenshotItems.length} 张截图。当前设置为直接发图，暂未自动提交。`
            : mode === "fixedRegion"
              ? "固定区域截图完成。当前设置为直接发图，已跳过 OCR。"
              : "截图完成。当前设置为直接发图，已跳过 OCR。",
          appendToBuffer ? "你可以继续截图，准备好后再点提交。" : "截图已完成，这次会直接把图片发给 AI。",
        );
        showToast(
          appendToBuffer
            ? `已加入截图缓冲，当前共 ${screenshotItems.length} 张。`
            : autoSolveAfterCapture
              ? "固定区域截图已完成，准备生成答案。"
              : "这次生成会直接附带截图，不再额外做 OCR。",
        );
        let solveResult = null;
        if (autoSolveAfterCapture) {
          solveResult = await handleSolve({ auto: true, autoNavigate });
        }
        if (autoSubmitRequested && state.settings.autoSubmitAfterFullCapture) {
          await handleAutoSubmit();
        }
        return { ok: true, problem, solveResult };
      }

      setStatus(
        mode === "fixedRegion" ? "固定区域截图完成，正在调用 OCR..." : "截图完成，正在调用 OCR...",
      );

      const ocrResponse = await sendMessage({
        type: "autolearning:run-ocr",
        imageDataUrl: screenshotDataUrl,
      });
      if (!ocrResponse?.ok || !ocrResponse.ocr?.text) {
        throw new Error(ocrResponse?.error || "OCR 识别失败");
      }

      problem.ocrText = ocrResponse.ocr.text;
      screenshotItems[screenshotItems.length - 1] = {
        ...screenshotItems[screenshotItems.length - 1],
        ocrText: ocrResponse.ocr.text,
        ocrModel: ocrResponse.ocr.model || "",
        ocrSkipped: false,
      };
      problem = mergeScreenshotData(problem, screenshotItems);
      state.problem = problem;

      renderProblem(problem);
      renderOcrText(problem.ocrText);
      await refreshPromptPreview({ silent: true });
      stopBusyStatus(
        appendToBuffer
          ? `已缓冲第 ${screenshotItems.length} 张截图，OCR 已完成，暂未自动提交。`
          : mode === "fixedRegion"
            ? "固定区域截图已完成 OCR，接下来生成会把 OCR 文本发进提示词。"
            : "题面截图已完成 OCR，接下来生成会把 OCR 文本发进提示词。",
        appendToBuffer ? "你可以继续截图，准备好后再点提交。" : "OCR 已完成，截图文字已经可用于生成。",
      );
      showToast(
        appendToBuffer
          ? `截图已加入缓冲，当前共 ${screenshotItems.length} 张。`
          : autoSolveAfterCapture
            ? "OCR 已完成，准备生成答案。"
            : "OCR 已完成，接下来生成会直接参考转写后的文本。",
      );
      let solveResult = null;
      if (autoSolveAfterCapture) {
        solveResult = await handleSolve({ auto: true, autoNavigate });
      }
      if (autoSubmitRequested && state.settings.autoSubmitAfterFullCapture) {
        await handleAutoSubmit();
      }
      return { ok: true, problem, solveResult };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stopBusyStatus(message, "截图或 OCR 流程失败。");
      return {
        ok: false,
        error: message,
      };
    }
  }

  async function handleAutoSubmit() {
    const code = String(elements.code?.value || "");
    if (!hasMeaningfulCode(code)) {
      setStatus("自动提交前没有拿到可填写的代码。");
      return;
    }

    setStatus("正在自动填充代码并提交...");
    const fillResult = await callPageBridge("setEditorValue", { code });
    if (!fillResult?.ok) {
      throw new Error(fillResult?.error || "自动填充失败，无法提交。");
    }

    await delay(250);
    const submitResult = await callPageBridge("submitSolution", {});
    if (!submitResult?.ok) {
      throw new Error(submitResult?.error || "没有找到提交按钮。");
    }

    setStatus(`已自动点击${submitResult.label || "提交"}按钮。`);
    showToast("代码已自动填充，并已尝试提交。");
  }

  async function getOrCreateFixedCaptureRect() {
    const resolved = resolveStoredCaptureRegion(state.fixedCaptureRegion);
    if (resolved) {
      return resolved;
    }

    await handleDefineFixedCaptureRegion();
    return resolveStoredCaptureRegion(state.fixedCaptureRegion);
  }

  async function hydrateFixedCaptureRegion() {
    try {
      const items = await storageGet({
        [FIXED_CAPTURE_STORAGE_KEY]: {},
      });
      const regions = items?.[FIXED_CAPTURE_STORAGE_KEY];
      state.fixedCaptureRegion = normalizeStoredCaptureRegion(
        regions?.[getFixedCaptureScopeKey()] || null,
      );
      renderShortcutTip();
    } catch {
      state.fixedCaptureRegion = null;
      renderShortcutTip();
    }
  }

  async function persistFixedCaptureRegion(rect) {
    const items = await storageGet({
      [FIXED_CAPTURE_STORAGE_KEY]: {},
    });
    const regions =
      items?.[FIXED_CAPTURE_STORAGE_KEY] && typeof items[FIXED_CAPTURE_STORAGE_KEY] === "object"
        ? items[FIXED_CAPTURE_STORAGE_KEY]
        : {};
    const nextRegions = {
      ...regions,
      [getFixedCaptureScopeKey()]: rectToStoredCaptureRegion(rect),
    };
    await storageSet({
      [FIXED_CAPTURE_STORAGE_KEY]: nextRegions,
    });
  }

  function getFixedCaptureScopeKey() {
    return `${location.origin}${location.pathname}`;
  }

  async function hydrateCustomStatementRule() {
    try {
      const items = await storageGet({
        [CUSTOM_EXTRACT_STORAGE_KEY]: {},
      });
      const rules = items?.[CUSTOM_EXTRACT_STORAGE_KEY];
      state.customStatementRule = normalizeCustomStatementRule(rules?.[getCustomExtractScopeKey()] || null);
      renderCustomStatementRuleStatus();
    } catch {
      state.customStatementRule = null;
      renderCustomStatementRuleStatus();
    }
  }

  async function persistCustomStatementRule(rule) {
    const items = await storageGet({
      [CUSTOM_EXTRACT_STORAGE_KEY]: {},
    });
    const rules =
      items?.[CUSTOM_EXTRACT_STORAGE_KEY] && typeof items[CUSTOM_EXTRACT_STORAGE_KEY] === "object"
        ? items[CUSTOM_EXTRACT_STORAGE_KEY]
        : {};
    const nextRules = {
      ...rules,
      [getCustomExtractScopeKey()]: normalizeCustomStatementRule(rule),
    };
    await storageSet({
      [CUSTOM_EXTRACT_STORAGE_KEY]: nextRules,
    });
  }

  async function removeCustomStatementRule() {
    const items = await storageGet({
      [CUSTOM_EXTRACT_STORAGE_KEY]: {},
    });
    const rules =
      items?.[CUSTOM_EXTRACT_STORAGE_KEY] && typeof items[CUSTOM_EXTRACT_STORAGE_KEY] === "object"
        ? { ...items[CUSTOM_EXTRACT_STORAGE_KEY] }
        : {};
    delete rules[getCustomExtractScopeKey()];
    await storageSet({
      [CUSTOM_EXTRACT_STORAGE_KEY]: rules,
    });
  }

  function getCustomExtractScopeKey() {
    return `${location.origin}${location.pathname}`;
  }

  function rectToStoredCaptureRegion(rect) {
    return normalizeStoredCaptureRegion({
      leftRatio: rect.left / Math.max(window.innerWidth, 1),
      topRatio: rect.top / Math.max(window.innerHeight, 1),
      widthRatio: rect.width / Math.max(window.innerWidth, 1),
      heightRatio: rect.height / Math.max(window.innerHeight, 1),
    });
  }

  function normalizeStoredCaptureRegion(region) {
    if (!region || typeof region !== "object") {
      return null;
    }

    const leftRatio = Number(region.leftRatio);
    const topRatio = Number(region.topRatio);
    const widthRatio = Number(region.widthRatio);
    const heightRatio = Number(region.heightRatio);
    if (
      !Number.isFinite(leftRatio) ||
      !Number.isFinite(topRatio) ||
      !Number.isFinite(widthRatio) ||
      !Number.isFinite(heightRatio) ||
      widthRatio <= 0 ||
      heightRatio <= 0
    ) {
      return null;
    }

    return {
      leftRatio: Math.min(Math.max(0, leftRatio), 1),
      topRatio: Math.min(Math.max(0, topRatio), 1),
      widthRatio: Math.min(Math.max(0.02, widthRatio), 1),
      heightRatio: Math.min(Math.max(0.02, heightRatio), 1),
    };
  }

  function resolveStoredCaptureRegion(region) {
    const normalized = normalizeStoredCaptureRegion(region);
    if (!normalized) {
      return null;
    }

    return clampViewportRect({
      left: Math.round(normalized.leftRatio * window.innerWidth),
      top: Math.round(normalized.topRatio * window.innerHeight),
      width: Math.round(normalized.widthRatio * window.innerWidth),
      height: Math.round(normalized.heightRatio * window.innerHeight),
    });
  }

  async function selectScreenshotArea(hintText = "拖拽框选题面区域，松开完成，Esc 取消") {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      const shade = document.createElement("div");
      const selection = document.createElement("div");
      const hint = document.createElement("div");

      overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "z-index:2147483647",
        "cursor:crosshair",
        "pointer-events:auto",
      ].join(";");
      shade.style.cssText = [
        "position:absolute",
        "inset:0",
        "background:rgba(7,12,18,0.35)",
      ].join(";");
      selection.style.cssText = [
        "position:absolute",
        "border:2px solid #ffb46b",
        "background:rgba(255,180,107,0.18)",
        "display:none",
      ].join(";");
      hint.style.cssText = [
        "position:absolute",
        "top:16px",
        "left:50%",
        "transform:translateX(-50%)",
        "padding:10px 14px",
        "border-radius:999px",
        "font:12px/1.4 IBM Plex Sans, PingFang SC, sans-serif",
        "color:#fff8ef",
        "background:rgba(15,20,24,0.88)",
        "box-shadow:0 12px 28px rgba(6,13,18,0.28)",
      ].join(";");
      hint.textContent = hintText;

      overlay.appendChild(shade);
      overlay.appendChild(selection);
      overlay.appendChild(hint);
      document.documentElement.appendChild(overlay);

      let startX = 0;
      let startY = 0;
      let dragging = false;

      const cleanup = (result) => {
        window.removeEventListener("keydown", onKeyDown, true);
        overlay.removeEventListener("mousedown", onMouseDown, true);
        window.removeEventListener("mousemove", onMouseMove, true);
        window.removeEventListener("mouseup", onMouseUp, true);
        overlay.remove();
        resolve(result);
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cleanup(null);
        }
      };

      const onMouseDown = (event) => {
        if (event.button !== 0) {
          return;
        }
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        selection.style.display = "block";
        updateSelectionRect(selection, startX, startY, startX, startY);
        event.preventDefault();
      };

      const onMouseMove = (event) => {
        if (!dragging) {
          return;
        }
        updateSelectionRect(selection, startX, startY, event.clientX, event.clientY);
      };

      const onMouseUp = (event) => {
        if (!dragging) {
          return;
        }
        dragging = false;
        const rect = normalizeViewportRect(startX, startY, event.clientX, event.clientY);
        if (rect.width < 24 || rect.height < 24) {
          cleanup(null);
          return;
        }
        cleanup(rect);
      };

      window.addEventListener("keydown", onKeyDown, true);
      overlay.addEventListener("mousedown", onMouseDown, true);
      window.addEventListener("mousemove", onMouseMove, true);
      window.addEventListener("mouseup", onMouseUp, true);
    });
  }

  async function cropImageDataUrl(dataUrl, rect) {
    const image = await loadImage(dataUrl);
    const scaleX = image.naturalWidth / window.innerWidth;
    const scaleY = image.naturalHeight / window.innerHeight;
    const cropX = Math.max(0, Math.round(rect.left * scaleX));
    const cropY = Math.max(0, Math.round(rect.top * scaleY));
    const cropWidth = Math.max(1, Math.round(rect.width * scaleX));
    const cropHeight = Math.max(1, Math.round(rect.height * scaleY));

    const canvas = document.createElement("canvas");
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("截图裁剪失败。");
    }

    context.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );
    return canvas.toDataURL("image/png");
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("截图图片加载失败。"));
      image.src = dataUrl;
    });
  }

  function updateSelectionRect(node, x1, y1, x2, y2) {
    const rect = normalizeViewportRect(x1, y1, x2, y2);
    node.style.left = `${rect.left}px`;
    node.style.top = `${rect.top}px`;
    node.style.width = `${rect.width}px`;
    node.style.height = `${rect.height}px`;
  }

  function normalizeViewportRect(x1, y1, x2, y2) {
    return clampViewportRect({
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    });
  }

  function clampViewportRect(rect) {
    const left = Math.min(Math.max(0, Number(rect.left) || 0), Math.max(0, window.innerWidth - 1));
    const top = Math.min(Math.max(0, Number(rect.top) || 0), Math.max(0, window.innerHeight - 1));
    const maxWidth = Math.max(1, window.innerWidth - left);
    const maxHeight = Math.max(1, window.innerHeight - top);

    return {
      left,
      top,
      width: Math.min(Math.max(1, Number(rect.width) || 1), maxWidth),
      height: Math.min(Math.max(1, Number(rect.height) || 1), maxHeight),
    };
  }

  async function handlePasteCode(options = {}) {
    const auto = Boolean(options.auto);
    const mode = getPromptMode();
    const source = auto ? "clipboard-auto" : "clipboard-manual";
    const statusPrefix = auto ? "已自动同步" : "已用";

    if (!auto) {
      openPanel();
    }

    try {
      const clipboardText = normalizeCode(await navigator.clipboard.readText());
      if (!hasMeaningfulCode(clipboardText)) {
        if (!auto) {
          setStatus("剪贴板里没有读取到代码。");
        }
        return { updated: false, text: "" };
      }

      if (!state.problem && mode === "choice") {
        if (!auto) {
          setStatus("选择题模式不会自动提取题面，已跳过剪贴板同步。");
        }
        return { updated: false, text: clipboardText };
      }

      const problem = state.problem || (await extractProblem());
      if (problem.currentCode === clipboardText && problem.currentCodeSource === source) {
        if (!auto) {
          setStatus("剪贴板代码和当前记录一致。");
        }
        return { updated: false, text: clipboardText };
      }

      problem.currentCode = clipboardText;
      problem.currentCodeLineCount = clipboardText.split("\n").length;
      problem.currentCodeSource = source;
      problem.currentCodeDebug = {
        source,
      };

      state.problem = problem;
      markResultReady(false);
      renderProblem(problem);
      await refreshPromptPreview({ silent: true });
      setStatus(`${statusPrefix}剪贴板代码。`, {
        hint:
          getPromptMode() === "code"
            ? "代码题现在会把题面文本、编辑器代码和截图一起发给 AI；如果题面里有图片，可继续框选截图。"
            : "代码已同步到当前题目上下文。",
      });
      if (auto) {
        showToast(
          getPromptMode() === "code"
            ? "代码已同步，若题面里还有图片可先框选截图，再回到面板生成答案。"
            : "代码成功复制，请去主面板点击生成答案。",
        );
      }
      return { updated: true, text: clipboardText };
    } catch {
      if (!auto) {
        setStatus("读取剪贴板失败，请先在代码框里全选并复制。");
      }
      return { updated: false, text: "" };
    }
  }

  async function copyTextToClipboard(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      return true;
    } catch {
      return false;
    }
  }

  async function handleDebugExport() {
    openPanel();
    setStatus("正在采集真实页面调试信息...");

    try {
      const debugResponse = await callPageBridge("get-editor-debug", {});
      if (!debugResponse?.ok) {
        throw new Error(debugResponse?.error || "调试信息采集失败");
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        pageUrl: location.href,
        problem: state.problem,
        editorDebug: debugResponse.debug,
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "autolearning-editor-debug.json";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);

      setStatus("真实页面调试信息已导出。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleCopyProblem() {
    if (!state.problem) {
      setStatus("请先识别题面，再复制提取结果。");
      return;
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(buildProblemExportPayload(), null, 2));
      setStatus("提取结果已复制到剪贴板。");
    } catch {
      setStatus("复制提取结果失败，请改用导出 JSON。");
    }
  }

  async function handleExportProblem() {
    if (!state.problem) {
      setStatus("请先识别题面，再导出 JSON。");
      return;
    }

    const payload = buildProblemExportPayload();
    window.__AUTOLEARNING_LAST_EXPORT_PAYLOAD__ = payload;
    downloadTextFile(
      buildExportFileName(),
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8",
    );
    setStatus("提取结果已导出为 JSON。");
  }

  async function extractProblem() {
    const editorResult = await readCurrentCode();
    const zhihuishuQuestion = extractZhihuishuQuestionBlock();
    const customStatementResult = resolveCustomStatementElement(state.customStatementRule);
    const titleElement = firstVisible([
      "#task-left-panel .task-header h3",
      "#task-left-panel h3",
      "h1",
      ".questionContent .questionTitle",
      "[class*='problem-title']",
      "[class*='question-title']",
      ".title",
    ]);

    const statementElement = firstVisible([
      "#task-left-panel .markdown-body",
      "#task-left-panel [class*='tab-panel-body']",
      "#task-left-panel",
      "[class*='problem-content']",
      "[class*='question-content']",
      "article",
      "main",
    ]);

    const title = normalizeText(zhihuishuQuestion?.title || titleElement?.innerText || document.title || "未识别标题");
    const questionType = normalizeText(zhihuishuQuestion?.questionType || "");
    const choiceOptions = Array.isArray(zhihuishuQuestion?.choiceOptions)
      ? zhihuishuQuestion.choiceOptions
          .map((option) => ({
            label: normalizeText(option?.label || "").slice(0, 20),
            text: normalizeText(option?.text || "").slice(0, 1200),
          }))
          .filter((option) => option.label || option.text)
      : extractChoiceOptionsNearElement(customStatementResult?.element || statementElement);
    const customStatementText = customStatementResult?.element
      ? buildCustomStatementText(customStatementResult.element, choiceOptions)
      : "";
    const statementSource = customStatementResult
      ? "custom"
      : zhihuishuQuestion
        ? "builtin"
        : statementElement
          ? "fallback"
          : "fallback";
    const statementText = normalizeText(
      customStatementText ||
        zhihuishuQuestion?.statementText ||
        statementElement?.innerText ||
        "",
    );
    const statementHtml =
      customStatementResult?.element?.innerHTML || zhihuishuQuestion?.statementHtml || statementElement?.innerHTML || "";
    const samples = extractSamples();
    const language = detectLanguage();
    const limits = extractLimits();

    return {
      url: location.href,
      title,
      questionType,
      statementText: statementText.slice(0, 24000),
      statementHtml,
      statementSource,
      customRuleRequested: Boolean(state.customStatementRule),
      customRuleMatched: Boolean(customStatementResult),
      customRuleSelector: customStatementResult?.selector || "",
      customRulePickedTag: customStatementResult?.pickedTag || state.customStatementRule?.pickedTag || "",
      customRulePickedPreview:
        customStatementResult?.pickedPreview || state.customStatementRule?.pickedPreview || "",
      choiceOptions,
      currentCode: editorResult.text,
      currentCodeLineCount: editorResult.text ? editorResult.text.split("\n").length : 0,
      currentCodeSource: editorResult.source,
      currentCodeDebug: editorResult.debug,
      samples,
      limits: {
        language,
        time: limits.time,
        memory: limits.memory,
      },
      screenshotDataUrl: state.problem?.screenshotDataUrl || "",
      screenshotRect: state.problem?.screenshotRect || null,
      screenshotMode: state.problem?.screenshotMode || "",
      screenshotItems: Array.isArray(state.problem?.screenshotItems) ? state.problem.screenshotItems : [],
      ocrText: state.problem?.ocrText || "",
      ocrModel: state.problem?.ocrModel || "",
      ocrSkipped: Boolean(state.problem?.ocrSkipped),
    };
  }

  function extractZhihuishuQuestionBlock() {
    const questionRoot = getActiveQuestionRoot();
    if (!(questionRoot instanceof Element)) {
      return null;
    }

    const typeText = normalizeText(
      questionRoot.querySelector(".questionTitle .letterSortNum, .questionTitle")?.textContent || "",
    );
    const stemText = normalizeText(
      questionRoot.querySelector(
        ".questionName .centent-pre .preStyle, .questionName pre.preStyle, .questionName .preStyle, .centent-pre .preStyle",
      )?.textContent || "",
    );
    const choiceOptions = extractZhihuishuChoiceOptions(questionRoot);
    const options = choiceOptions.map((option) => option.line).filter(Boolean);

    if (!stemText && options.length === 0) {
      return null;
    }

    const statementParts = [];
    if (typeText) {
      statementParts.push(typeText);
    }
    if (stemText) {
      statementParts.push(stemText);
    }
    if (options.length > 0) {
      statementParts.push(options.join("\n"));
    }

    return {
      title: [typeText, stemText].filter(Boolean).join(" ").slice(0, 120),
      questionType: typeText,
      statementText: statementParts.join("\n"),
      statementHtml: questionRoot.innerHTML || "",
      choiceOptions: choiceOptions.map((option) => ({
        label: option.label,
        text: option.text,
      })),
    };
  }

  function extractZhihuishuChoiceOptions(questionRoot) {
    if (!(questionRoot instanceof Element)) {
      return [];
    }

    const optionSelectors = [
      ".radio-view li",
      ".checkbox-view li",
      ".checkbox-view label.el-checkbox",
      ".radio-view label.el-radio",
      ".checkbox-views label.el-checkbox",
      ".radio-views label.el-radio",
      ".el-checkbox-group.checkbox-view > label.el-checkbox",
      ".el-radio-group.radio-view > label.el-radio",
    ];
    const rawNodes = Array.from(questionRoot.querySelectorAll(optionSelectors.join(", ")));
    const nodes = [];
    const seen = new Set();
    for (const node of rawNodes) {
      if (!(node instanceof Element) || !isVisible(node)) {
        continue;
      }
      if (seen.has(node)) {
        continue;
      }
      seen.add(node);
      nodes.push(node);
    }

    return nodes
      .map((node) => {
        const label = getChoiceLabelFromItem(node) || normalizeChoiceOptionLabel(node.textContent || "");
        let text = normalizeText(
          node.querySelector(
            ".stem, .preStyle, .option-text, .option-content, .el-checkbox__label .preStyle, .el-radio__label .preStyle",
          )?.textContent || "",
        );
        if (!text) {
          const wholeLine = normalizeText(node.textContent || "");
          text = label ? normalizeText(wholeLine.replace(new RegExp(`^\\s*${label}\\s*`), "")) : wholeLine;
        }
        const line = [label, text].filter(Boolean).join(" ").trim();
        if (!label && !text) {
          return null;
        }
        return {
          label,
          text,
          line,
        };
      })
      .filter((option) => option && (option.label || option.text));
  }

  function extractChoiceOptionsNearElement(element) {
    if (!(element instanceof Element)) {
      return [];
    }

    const questionRoot =
      element.closest(
        [
          ".questionContent",
          ".ques-detail",
          ".question",
          "[class*='question']",
          "[class*='problem-content']",
          "[class*='question-content']",
        ].join(", "),
      ) || getActiveQuestionRoot();
    if (!(questionRoot instanceof Element)) {
      return [];
    }

    return extractZhihuishuChoiceOptions(questionRoot).map((option) => ({
      label: normalizeText(option?.label || "").slice(0, 20),
      text: normalizeText(option?.text || "").slice(0, 1200),
    }));
  }

  function buildCustomStatementText(element, choiceOptions = []) {
    if (!(element instanceof Element)) {
      return "";
    }

    const baseText = normalizeText(element.innerText || element.textContent || "");
    if (!baseText) {
      return "";
    }

    const optionLines = Array.isArray(choiceOptions)
      ? choiceOptions
          .map((option) => [normalizeText(option?.label || ""), normalizeText(option?.text || "")].filter(Boolean).join(" "))
          .filter(Boolean)
      : [];
    if (optionLines.length === 0) {
      return baseText;
    }

    const fullText = [baseText, ...optionLines].join("\n");
    return normalizeText(fullText);
  }

  function normalizeChoiceOptionLabel(value) {
    const text = normalizeText(value || "")
      .replace(/\s+/g, "")
      .toUpperCase();
    const latinMatch = text.match(/[A-F]/);
    if (latinMatch) {
      return latinMatch[0];
    }
    if (/(对|正确|TRUE)/i.test(text)) {
      return "对";
    }
    if (/(错|错误|FALSE)/i.test(text)) {
      return "错";
    }
    return "";
  }

  function getActiveQuestionRoot() {
    const questionRoot = firstVisible([
      ".questionContent",
      ".ques-detail .questionContent",
      "div[class*='questionContent']",
    ]);
    return questionRoot instanceof Element ? questionRoot : null;
  }

  async function readCurrentCode() {
    const bridgeValue = await callPageBridge("getEditorValue", {});
    if (bridgeValue?.ok && hasMeaningfulCode(bridgeValue.value || "")) {
      return {
        text: normalizeCode(bridgeValue.value || ""),
        source: bridgeValue.meta?.source || "bridge",
        debug: bridgeValue.meta || null,
      };
    }

    const selectors = [
      "#task-right-panel .monaco-editor .view-line",
      ".monaco-editor .view-line",
      ".cm-content",
      "pre code",
    ];

    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      const value = normalizeCode(nodes.map((node) => node.textContent || "").join("\n"));
      if (hasMeaningfulCode(value)) {
        return {
          text: value,
          source: "visible-dom-fallback",
          debug: {
            source: "visible-dom-fallback",
            selector,
          },
        };
      }
    }

    const textarea = document.querySelector(
      "#task-right-panel textarea, textarea:not([readonly]):not([disabled])",
    );
    if (textarea instanceof HTMLTextAreaElement) {
      return {
        text: normalizeCode(textarea.value),
        source: "textarea-fallback",
        debug: {
          source: "textarea-fallback",
        },
      };
    }

    return {
      text: "",
      source: "empty",
      debug: {
        source: "empty",
      },
    };
  }

  function extractSamples() {
    const educoderSamples = Array.from(document.querySelectorAll(".test-case-item___E3CU9"));
    if (educoderSamples.length > 0) {
      return educoderSamples
        .map((item) => {
          const blocks = Array.from(item.querySelectorAll(".diff-panel-container___IpXsK"));
          return {
            input: normalizeText(blocks[0]?.textContent || ""),
            output: normalizeText(blocks[1]?.textContent || ""),
          };
        })
        .filter((sample) => sample.input || sample.output);
    }

    const genericSamples = Array.from(document.querySelectorAll(".sample-test, .sample, .example"));
    return genericSamples
      .map((item) => ({
        input: normalizeText(item.querySelector(".input, .sample-input")?.textContent || ""),
        output: normalizeText(item.querySelector(".output, .sample-output")?.textContent || ""),
      }))
      .filter((sample) => sample.input || sample.output);
  }

  function extractLimits() {
    const text = normalizeText(document.body?.innerText || "").slice(0, 6000);
    const timeMatch = text.match(/(?:时间限制|Time Limit)[:：]?\s*([^\n]+)/i);
    const memoryMatch = text.match(/(?:内存限制|Memory Limit)[:：]?\s*([^\n]+)/i);

    return {
      time: normalizeText(timeMatch?.[1] || ""),
      memory: normalizeText(memoryMatch?.[1] || ""),
    };
  }

  function detectLanguage() {
    const selectors = [
      "#env_1215668_1 span",
      ".item___MSfbI.active___Rkf93 span",
      "[class*='language'] [aria-selected='true']",
      "[class*='lang'] [class*='active']",
    ];

    for (const selector of selectors) {
      const node = document.querySelector(selector);
      const text = normalizeText(node?.textContent || "");
      if (text) {
        return text;
      }
    }

    return "";
  }

  function renderProblem(problem) {
    const statementText = normalizeText(problem.statementText || "");
    const statementHead = summarizeEdgeText(statementText, "start", 48);
    const statementTail = summarizeEdgeText(statementText, "end", 36);
    const optionCount = Array.isArray(problem.choiceOptions) ? problem.choiceOptions.length : 0;
    const mode = getPromptMode();
    const screenshotItems = getProblemScreenshotItems(problem);
    const screenshotText = problem.screenshotDataUrl
      ? screenshotItems.length > 1
        ? `已附带 ${screenshotItems.length} 张截图`
        : problem.screenshotMode === "fixedRegion"
          ? "已附带固定区域截图"
          : "已附带局部截图"
      : "未附带";
    const extractSourceText =
      problem.statementSource === "custom"
        ? "自定义规则"
        : problem.statementSource === "builtin"
          ? "站点专用"
          : "通用回退";

    renderSummaryHtml(`
      <div class="al-summary-card">
        <div class="al-summary-grid">
          ${buildSummaryRow("标题", problem.title || "未识别")}
          ${buildSummaryRow("题面长度", `${statementText.length} 字`)}
          ${buildSummaryRow("提取来源", extractSourceText)}
          ${buildSummaryRow("当前代码", `${problem.currentCodeLineCount} 行`)}
          ${buildSummaryHint(buildCurrentCodeHint(problem))}
          ${buildSummaryRow("样例数量", `${problem.samples.length}`)}
          ${buildSummaryRow("选项数量", `${optionCount}`)}
          ${buildSummaryRow("截图", screenshotText)}
          ${mode === "code" ? buildSummaryHint(buildCodeModeAssetHint(problem)) : ""}
          ${
            problem.customRuleRequested && !problem.customRuleMatched
              ? buildSummaryHint("当前页面自定义题面规则未命中，已自动回退到内置提取逻辑。", "warning")
              : ""
          }
        </div>
        <div class="al-summary-preview">
          <div class="al-summary-preview-card">
            <div class="al-summary-preview-label">题面开头</div>
            <div class="al-summary-preview-text">${escapeHtml(statementHead || "未提取到")}</div>
          </div>
          <div class="al-summary-preview-card">
            <div class="al-summary-preview-label">题面结尾</div>
            <div class="al-summary-preview-text">${escapeHtml(statementTail || "未提取到")}</div>
          </div>
        </div>
      </div>
    `);

    elements.details.textContent = JSON.stringify(problem, null, 2);
    renderScreenshotStatus(problem);
    renderOcrText(problem.ocrText || "");
  }

  function buildSummaryRow(label, value) {
    return `
      <div class="al-summary-row">
        <span class="al-summary-key">${escapeHtml(label)}</span>
        <span class="al-summary-value">${escapeHtml(value)}</span>
      </div>
    `;
  }

  function buildSummaryHint(text, variant = "default") {
    if (!text) {
      return "";
    }

    const variantAttr = variant && variant !== "default" ? ` data-variant="${escapeHtml(variant)}"` : "";
    return `<div class="al-summary-hint"${variantAttr}>${escapeHtml(text)}</div>`;
  }

  function buildCurrentCodeHint(problem) {
    if (Number(problem.currentCodeLineCount) > 0) {
      return getPromptMode() === "code"
        ? "已识别到编辑器代码；生成答案时会要求 AI 基于这份现有框架补全，而不是另起一份重写。若内容不对，请先在右侧编辑器全选后重新复制。"
        : "如果当前代码识别不对，请到右侧编辑器里全选代码后复制到剪贴板，插件就能重新识别原有代码模板。";
    }

    return getPromptMode() === "code"
      ? "当前还没有识别到编辑器代码。代码题建议先在右侧编辑器里全选并复制代码，再生成答案。"
      : "当前没有识别到代码模板。如果右侧编辑器其实有代码，请先全选后复制到剪贴板，插件就能重新识别题面和原有代码模板。";
  }

  function summarizeEdgeText(text, side = "start", maxLength = 40) {
    const normalized = normalizeText(text);
    if (!normalized) {
      return "";
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    if (side === "end") {
      return `...${normalized.slice(-maxLength)}`;
    }

    return `${normalized.slice(0, maxLength)}...`;
  }

  function createEmptyProblemContext() {
    const limits = extractLimits();
    return {
      url: location.href,
      title: normalizeText(document.title || "未识别标题"),
      statementText: "",
      statementHtml: "",
      statementSource: "fallback",
      customRuleRequested: Boolean(state.customStatementRule),
      customRuleMatched: false,
      customRuleSelector: "",
      customRulePickedTag: state.customStatementRule?.pickedTag || "",
      customRulePickedPreview: state.customStatementRule?.pickedPreview || "",
      choiceOptions: [],
      currentCode: "",
      currentCodeLineCount: 0,
      currentCodeSource: "empty",
      currentCodeDebug: {
        source: "empty",
      },
      samples: [],
      limits: {
        language: detectLanguage(),
        time: limits.time,
        memory: limits.memory,
      },
      screenshotDataUrl: state.problem?.screenshotDataUrl || "",
      screenshotRect: state.problem?.screenshotRect || null,
      screenshotMode: state.problem?.screenshotMode || "",
      screenshotItems: Array.isArray(state.problem?.screenshotItems) ? state.problem.screenshotItems : [],
      ocrText: state.problem?.ocrText || "",
      ocrModel: state.problem?.ocrModel || "",
      ocrSkipped: Boolean(state.problem?.ocrSkipped),
    };
  }

  function buildProblemExportPayload() {
    return {
      exportedAt: new Date().toISOString(),
      pageUrl: location.href,
      problem: state.problem,
      result: state.result,
    };
  }

  function buildExportFileName() {
    const title = String(state.result?.generatedTitle || state.problem?.title || "autolearning-extract")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 48);
    return `${title || "autolearning-extract"}.json`;
  }

  function downloadTextFile(filename, text, mimeType) {
    const blob = new Blob([text], {
      type: mimeType,
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function renderSummary(text) {
    elements.summary.textContent = text;
  }

  function renderSummaryHtml(html) {
    elements.summary.innerHTML = html;
  }

  function setStatus(text, options = {}) {
    if (elements.status) {
      elements.status.textContent = text;
    }

    if (typeof options.busy === "boolean") {
      state.statusBusy = options.busy;
    }
    if (typeof options.hint === "string") {
      state.statusHint = options.hint;
    }

    syncStatusIndicator();
  }

  function startBusyStatus(text, hint = "正在处理中，请稍候...") {
    clearStatusHintTimers();
    state.statusBusy = true;
    state.statusHint = hint;
    setStatus(text, { busy: true, hint });

    state.statusHintTimerShort = window.setTimeout(() => {
      if (!state.statusBusy) {
        return;
      }
      state.statusHint = "请求已发出，正在等待 AI 或页面返回结果。";
      syncStatusIndicator();
    }, 6000);

    state.statusHintTimerLong = window.setTimeout(() => {
      if (!state.statusBusy) {
        return;
      }
      state.statusHint = "这次等待有点久，可能是网络较慢，或者模型接口正在排队。";
      syncStatusIndicator();
    }, 15000);
  }

  function stopBusyStatus(text, hint = "已完成，可以继续下一步。") {
    clearStatusHintTimers();
    state.statusBusy = false;
    state.statusHint = hint;
    setStatus(text, { busy: false, hint });
  }

  function clearStatusHintTimers() {
    if (state.statusHintTimerShort) {
      window.clearTimeout(state.statusHintTimerShort);
      state.statusHintTimerShort = 0;
    }
    if (state.statusHintTimerLong) {
      window.clearTimeout(state.statusHintTimerLong);
      state.statusHintTimerLong = 0;
    }
  }

  function syncStatusIndicator() {
    if (elements.statusCard instanceof HTMLElement) {
      elements.statusCard.setAttribute("data-busy", state.statusBusy ? "true" : "false");
    }
    if (elements.statusHint) {
      elements.statusHint.textContent = state.statusHint || "准备就绪";
    }
    renderStatusActionButton();
  }

  function renderStatusActionButton() {
    if (!(elements.statusAction instanceof HTMLButtonElement)) {
      return;
    }
    const mode = getPromptMode();

    if (state.solving) {
      elements.statusAction.textContent = "取消";
      elements.statusAction.setAttribute("data-variant", "cancel");
      return;
    }

    const currentResult = state.result;
    if (mode === "choice" && currentResult?.needsVerification) {
      elements.statusAction.textContent = "设为当前可用答案";
      elements.statusAction.setAttribute("data-variant", "submit");
      return;
    }

    if (mode === "choice" && currentResult?.fromQuestionBank) {
      elements.statusAction.textContent = "重问 AI";
      elements.statusAction.setAttribute("data-variant", "submit");
      return;
    }

    elements.statusAction.textContent = "提交";
    elements.statusAction.setAttribute("data-variant", "submit");
  }

  async function handleStatusAction() {
    const mode = getPromptMode();
    if (state.solving) {
      await cancelCurrentSolve();
      return;
    }

    if (mode === "choice" && state.result?.needsVerification) {
      await confirmCurrentResultIntoQuestionBank();
      return;
    }

    if (mode === "choice" && state.result?.fromQuestionBank) {
      await retryCurrentProblemWithAi();
      return;
    }

    await handleSolve();
  }

  async function retryCurrentProblemWithAi() {
    await handleSolve({
      skipQuestionBank: true,
      rejectHitBeforeRetry: Boolean(state.lastQuestionBankHit?.entry && state.lastQuestionBankHit.entry.source !== "cloud"),
    });
  }

  async function confirmCurrentResultIntoQuestionBank() {
    if (!state.problem || !state.result) {
      setStatus("当前没有可设为可用答案的结果。");
      return;
    }

    const mode = getPromptMode();
    if (mode !== "choice") {
      setStatus("浠ｇ爜棰樻ā寮忔殏涓嶆敮鎸侀搴撲繚瀛橈紝褰撳墠鐩存帴浣跨敤 AI 缁撴灉銆?");
      return;
    }
    try {
      await upsertQuestionBankEntry(state.problem, mode, state.result, {
        source: "local",
        status: "verified",
      });
      if (mode === "choice") {
        removeQuestionBankReviewQueueItem({
          primaryKey: buildQuestionBankLookupKeys(state.problem, mode)[0] || "",
          statementFingerprint: buildStatementFingerprint(state.problem),
          title: state.problem.title || "",
          statementPreview: normalizeText(state.problem.statementText || "").slice(0, 240),
        });
      }
      state.result = {
        ...state.result,
        needsVerification: false,
      };
      if (typeof state.reviewModalRefresh === "function") {
        state.reviewModalRefresh({ preserveNotice: true });
      }
      renderStatusActionButton();
      setStatus("当前结果已设为可用答案，并写入题库。", {
        hint: "后续仍可在题库管理里继续修改、撤销或重新问 AI。",
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function cancelCurrentSolve() {
    if (!state.currentSolveRequestId) {
      return;
    }

    state.solveCancelRequested = true;
    setStatus("正在取消请求...", {
      busy: true,
      hint: "已向后台发送取消指令，请稍候。",
    });

    try {
      await sendMessage({
        type: "autolearning:cancel-solve",
        requestId: state.currentSolveRequestId,
      });
    } catch (error) {
      stopBusyStatus(
        error instanceof Error ? error.message : String(error),
        "取消请求失败，请稍后重试。",
      );
      state.solveCancelRequested = false;
    }
  }

  function initFloatingPosition() {
    void chrome.storage.local.get({ [POSITION_STORAGE_KEY]: null }, (items) => {
      if (chrome.runtime.lastError) {
        state.launcherPosition = getDefaultLauncherPosition();
        syncFloatingUiPosition();
        return;
      }

      state.launcherPosition = sanitizeLauncherPosition(items[POSITION_STORAGE_KEY]);
      if (!state.launcherPosition) {
        state.launcherPosition = getDefaultLauncherPosition();
      }
      syncFloatingUiPosition();
    });
  }

  function getDefaultLauncherPosition() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const top =
      viewportWidth <= MOBILE_BREAKPOINT
        ? Math.max(18, viewportHeight - LAUNCHER_SIZE - 18)
        : 112;

    return clampLauncherPosition({
      left: viewportWidth - LAUNCHER_SIZE - 18,
      top,
    });
  }

  function sanitizeLauncherPosition(position) {
    if (!position || typeof position !== "object") {
      return null;
    }

    const left = Number(position.left);
    const top = Number(position.top);
    if (!Number.isFinite(left) || !Number.isFinite(top)) {
      return null;
    }

    return clampLauncherPosition({ left, top });
  }

  function clampLauncherPosition(position) {
    const maxLeft = Math.max(8, window.innerWidth - LAUNCHER_SIZE - 8);
    const maxTop = Math.max(8, window.innerHeight - LAUNCHER_SIZE - 8);

    return {
      left: Math.min(Math.max(8, Number(position.left) || 0), maxLeft),
      top: Math.min(Math.max(8, Number(position.top) || 0), maxTop),
    };
  }



  function snapLauncherToEdgeIfNeeded() {
    if (!state.launcherPosition) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const currentLeft = state.launcherPosition.left;
    const maxLeft = Math.max(8, viewportWidth - LAUNCHER_SIZE - 8);
    const visiblePart = 20; // 吸附后露出的部分

    // 检查是否靠近左边缘
    if (currentLeft < EDGE_SNAP_THRESHOLD) {
      state.launcherPositionBeforeSnap = { ...state.launcherPosition };
      state.launcherPosition.left = -(LAUNCHER_SIZE - visiblePart);
      state.launcherSnappedEdge = 'left';
      syncFloatingUiPosition();
      persistLauncherPosition();
      return;
    }

    // 检查是否靠近右边缘
    if (currentLeft > maxLeft - EDGE_SNAP_THRESHOLD) {
      state.launcherPositionBeforeSnap = { ...state.launcherPosition };
      state.launcherPosition.left = viewportWidth - visiblePart;
      state.launcherSnappedEdge = 'right';
      syncFloatingUiPosition();
      persistLauncherPosition();
      return;
    }

    // 如果不在边缘附近，清除吸附状态
    state.launcherSnappedEdge = null;
    state.launcherPositionBeforeSnap = null;
  }

  function getPanelMetrics() {
    const panelWidth =
      window.innerWidth <= MOBILE_BREAKPOINT
        ? Math.max(280, window.innerWidth - 20)
        : Math.min(PANEL_MAX_WIDTH, window.innerWidth - 28);
    const panelHeight =
      window.innerWidth <= MOBILE_BREAKPOINT
        ? Math.max(260, window.innerHeight - 108)
        : Math.max(260, window.innerHeight - 194);

    return { panelWidth, panelHeight };
  }

  function getPanelPosition() {
    const { panelWidth, panelHeight } = getPanelMetrics();
    if (state.panelManualPosition) {
      return clampPanelManualPosition(state.panelManualPosition, { panelWidth, panelHeight });
    }

    const launcherPosition = state.launcherPosition || getDefaultLauncherPosition();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = launcherPosition.left + LAUNCHER_SIZE - panelWidth;
    left = Math.min(Math.max(10, left), Math.max(10, viewportWidth - panelWidth - 10));

    let top = launcherPosition.top + LAUNCHER_SIZE + PANEL_GAP;
    if (top + panelHeight > viewportHeight - 10) {
      top = launcherPosition.top - panelHeight - PANEL_GAP;
    }
    top = Math.min(Math.max(10, top), Math.max(10, viewportHeight - panelHeight - 10));

    return { left, top, panelWidth, panelHeight };
  }

  function clampPanelManualPosition(position, metrics = getPanelMetrics()) {
    const panelWidth = metrics.panelWidth;
    const panelHeight = metrics.panelHeight;
    const maxLeft = Math.max(window.innerWidth - PANEL_VISIBLE_STRIP, 10);
    const maxTop = Math.max(window.innerHeight - PANEL_VISIBLE_STRIP, 10);

    return {
      left: Math.min(Math.max(-panelWidth + PANEL_VISIBLE_STRIP, Number(position.left) || 0), maxLeft),
      top: Math.min(Math.max(-panelHeight + PANEL_VISIBLE_STRIP, Number(position.top) || 0), maxTop),
      panelWidth,
      panelHeight,
    };
  }

  function syncFloatingUiPosition() {
    if (!elements.launcher || !elements.panel) {
      return;
    }

    const launcherPosition = state.launcherPosition || getDefaultLauncherPosition();
    const panelPosition = getPanelPosition();

    Object.assign(elements.launcher.style, {
      left: `${launcherPosition.left}px`,
      top: `${launcherPosition.top}px`,
      right: "auto",
      bottom: "auto",
    });

    Object.assign(elements.panel.style, {
      left: `${panelPosition.left}px`,
      top: `${panelPosition.top}px`,
      right: "auto",
      bottom: "auto",
      width: `${panelPosition.panelWidth}px`,
      maxHeight: `${panelPosition.panelHeight}px`,
    });
  }

  function persistLauncherPosition() {
    if (!state.launcherPosition) {
      return;
    }

    chrome.storage.local.set({
      [POSITION_STORAGE_KEY]: state.launcherPosition,
    });
  }

  function setupLauncherDrag() {
    elements.launcher.addEventListener("pointerdown", onLauncherPointerDown);
    elements.header?.addEventListener("pointerdown", onPanelPointerDown);
    window.addEventListener("pointermove", onLauncherPointerMove);
    window.addEventListener("pointerup", onLauncherPointerUp);
    window.addEventListener("pointercancel", onLauncherPointerUp);
  }

  function onLauncherMouseEnter() {
    clearLauncherHoverState();
    
    if (state.launcherAnimating || state.isDraggingLauncher) {
      return;
    }
    
    if (state.launcherSnappedEdge && state.launcherPosition) {
      state.launcherAnimating = true;
      const viewportWidth = window.innerWidth;
      
      // 根据吸附的边缘，将launcher滑出到完全可见的位置
      if (state.launcherSnappedEdge === 'left') {
        state.launcherPosition.left = 8;
      } else if (state.launcherSnappedEdge === 'right') {
        state.launcherPosition.left = viewportWidth - LAUNCHER_SIZE - 8;
      }
      
      syncFloatingUiPosition();
      persistLauncherPosition();
      
      // 等待动画完成后再允许下一次操作
      window.setTimeout(() => {
        state.launcherAnimating = false;
        syncLauncherMotionState();
      }, 200);
    }
  }

  function onLauncherMouseLeave() {
    if (state.launcherHoverTimer) {
      window.clearTimeout(state.launcherHoverTimer);
    }
    
    // 添加延迟，避免快速抖动
    state.launcherHoverTimer = window.setTimeout(() => {
      state.launcherHoverTimer = 0;
      
      // 如果之前处于吸附状态，且鼠标离开时没有在拖动，则滑回吸附位置
      if (state.launcherSnappedEdge && state.launcherPosition && !state.isDraggingLauncher && !state.launcherAnimating) {
        state.launcherAnimating = true;
        const viewportWidth = window.innerWidth;
        const visiblePart = 20;
        
        // 根据吸附的边缘，将launcher滑回吸附位置
        if (state.launcherSnappedEdge === 'left') {
          state.launcherPosition.left = -(LAUNCHER_SIZE - visiblePart);
        } else if (state.launcherSnappedEdge === 'right') {
          state.launcherPosition.left = viewportWidth - visiblePart;
        }
        
        syncFloatingUiPosition();
        persistLauncherPosition();
        
        // 等待动画完成后再允许下一次操作
        window.setTimeout(() => {
          state.launcherAnimating = false;
          syncLauncherMotionState();
        }, 200);
      }
    }, 150);
  }

  function onLauncherPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    beginFloatingDrag(event, "launcher");
  }

  function onPanelPointerDown(event) {
    if (event.button !== 0 || shouldIgnorePanelDragStart(event.target)) {
      return;
    }

    beginFloatingDrag(event, "panel");
  }

  function beginFloatingDrag(event, source) {
    state.dragPointerId = event.pointerId;
    state.dragSource = source;
    state.dragStartPointer = {
      x: event.clientX,
      y: event.clientY,
    };
    state.dragStartPosition =
      source === "panel"
        ? { ...getPanelPosition() }
        : { ...(state.launcherPosition || getDefaultLauncherPosition()) };
    state.isDraggingLauncher = false;
    state.suppressLauncherClick = false;

    if (source === "launcher") {
      elements.launcher.setPointerCapture?.(event.pointerId);
    } else {
      elements.header?.setPointerCapture?.(event.pointerId);
    }
  }

  function onLauncherPointerMove(event) {
    if (event.pointerId !== state.dragPointerId || !state.dragStartPointer || !state.dragStartPosition) {
      return;
    }

    const deltaX = event.clientX - state.dragStartPointer.x;
    const deltaY = event.clientY - state.dragStartPointer.y;
    if (!state.isDraggingLauncher) {
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < DRAG_THRESHOLD) {
        return;
      }
      state.isDraggingLauncher = true;
    }

    if (state.dragSource === "panel") {
      state.panelManualPosition = clampPanelManualPosition({
        left: state.dragStartPosition.left + deltaX,
        top: state.dragStartPosition.top + deltaY,
      });
    } else {
      state.panelManualPosition = null;
      state.launcherPosition = clampLauncherPosition({
        left: state.dragStartPosition.left + deltaX,
        top: state.dragStartPosition.top + deltaY,
      });
    }
    state.suppressLauncherClick = true;
    syncFloatingUiPosition();
    event.preventDefault();
  }

  function onLauncherPointerUp(event) {
    if (event.pointerId !== state.dragPointerId) {
      return;
    }

    const dragSource = state.dragSource;

    if (dragSource === "launcher") {
      elements.launcher.releasePointerCapture?.(event.pointerId);
    } else if (dragSource === "panel") {
      elements.header?.releasePointerCapture?.(event.pointerId);
    }
    state.dragPointerId = null;
    state.dragSource = "";
    state.dragStartPointer = null;
    state.dragStartPosition = null;
    state.isDraggingLauncher = false;
    if (dragSource === "launcher") {
      persistLauncherPosition();
    }
  }

  function shouldIgnorePanelDragStart(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest("button, input, textarea, select, option, summary, a, [role='button']"));
  }

  function handleViewportResize() {
    state.launcherPosition = clampLauncherPosition(state.launcherPosition || getDefaultLauncherPosition());
    if (state.panelManualPosition) {
      state.panelManualPosition = clampPanelManualPosition(state.panelManualPosition);
    }
    syncFloatingUiPosition();
  }

  function firstVisible(selectors) {
    for (const selector of selectors) {
      const nodes = Array.from(document.querySelectorAll(selector));
      const node = nodes.find((candidate) => isVisible(candidate));
      if (node) {
        return node;
      }
    }
    return null;
  }

  function isVisible(node) {
    if (!(node instanceof Element)) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  async function selectCustomStatementElement(hintText = "请点击要作为题面的元素，按 Esc 取消") {
    return new Promise((resolve) => {
      const highlight = document.createElement("div");
      const hint = document.createElement("div");
      let currentTarget = null;

      highlight.style.cssText = [
        "position:fixed",
        "display:none",
        "pointer-events:none",
        "z-index:2147483647",
        "border:2px solid #ffb46b",
        "background:rgba(255,180,107,0.16)",
        "box-shadow:0 0 0 9999px rgba(7,12,18,0.18)",
      ].join(";");
      hint.style.cssText = [
        "position:fixed",
        "top:16px",
        "left:50%",
        "transform:translateX(-50%)",
        "pointer-events:none",
        "z-index:2147483647",
        "padding:10px 14px",
        "border-radius:999px",
        "font:12px/1.4 IBM Plex Sans, PingFang SC, sans-serif",
        "color:#fff8ef",
        "background:rgba(15,20,24,0.88)",
        "box-shadow:0 12px 28px rgba(6,13,18,0.28)",
      ].join(";");
      hint.textContent = hintText;

      document.documentElement.appendChild(highlight);
      document.documentElement.appendChild(hint);

      const cleanup = (result) => {
        document.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("mousemove", onMouseMove, true);
        document.removeEventListener("click", onClick, true);
        highlight.remove();
        hint.remove();
        document.body.style.cursor = "";
        resolve(result);
      };

      const updateHighlight = (target) => {
        if (!(target instanceof Element) || target === document.documentElement || target === document.body) {
          currentTarget = null;
          highlight.style.display = "none";
          return;
        }
        currentTarget = target;
        const rect = target.getBoundingClientRect();
        highlight.style.display = "block";
        highlight.style.left = `${Math.max(rect.left, 0)}px`;
        highlight.style.top = `${Math.max(rect.top, 0)}px`;
        highlight.style.width = `${Math.max(rect.width, 0)}px`;
        highlight.style.height = `${Math.max(rect.height, 0)}px`;
      };

      const onKeyDown = (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cleanup(null);
        }
      };

      const onMouseMove = (event) => {
        const target = findSelectableStatementTarget(event.target);
        updateHighlight(target);
      };

      const onClick = (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const target = findSelectableStatementTarget(event.target) || currentTarget;
        cleanup(target instanceof Element ? target : null);
      };

      document.body.style.cursor = "crosshair";
      document.addEventListener("keydown", onKeyDown, true);
      document.addEventListener("mousemove", onMouseMove, true);
      document.addEventListener("click", onClick, true);
    });
  }

  function findSelectableStatementTarget(source) {
    const element = source instanceof Element ? source : source instanceof Node ? source.parentElement : null;
    if (!(element instanceof Element) || element.closest(`#${HOST_ID}`)) {
      return null;
    }

    return normalizePickedStatementElement(element);
  }

  function normalizePickedStatementElement(element) {
    if (!(element instanceof Element)) {
      return null;
    }

    let current = element;
    if (current.matches("input, button, svg, path, use, i, label, span, strong, em, b")) {
      current = current.parentElement || current;
    }

    const optionContainer = current.closest(
      [
        "ul.radio-view > li",
        "ul.checkbox-view > li",
        ".radio-view li",
        ".checkbox-view li",
        ".el-radio",
        ".el-checkbox",
        "[role='radio']",
        "[role='checkbox']",
        ".option-item",
        ".answer-item",
      ].join(", "),
    );
    if (optionContainer instanceof Element) {
      current = optionContainer;
    }

    const preferredContainer = current.closest(
      [
        ".questionContent",
        ".ques-detail",
        ".question",
        "[class*='question']",
        "[class*='problem-content']",
        "[class*='question-content']",
        "#task-left-panel .markdown-body",
        "#task-left-panel [class*='tab-panel-body']",
        "#task-left-panel",
        "article",
        "main",
        "section",
      ].join(", "),
    );
    if (preferredContainer instanceof Element && isVisible(preferredContainer)) {
      current = preferredContainer;
    }

    let best = current;
    let cursor = current;
    let depth = 0;
    while (cursor instanceof Element && depth < 6) {
      if (!cursor.closest(`#${HOST_ID}`) && isVisible(cursor)) {
        const text = normalizeText(cursor.innerText || cursor.textContent || "");
        if (text.length >= 30) {
          best = cursor;
        }
        if (isQuestionLikeContainer(cursor, text)) {
          best = cursor;
          break;
        }
      }
      cursor = cursor.parentElement;
      depth += 1;
    }

    return best instanceof Element && !best.closest(`#${HOST_ID}`) ? best : null;
  }

  function isQuestionLikeContainer(element, text = "") {
    if (!(element instanceof Element)) {
      return false;
    }

    if (
      element.matches(
        [
          ".questionContent",
          ".ques-detail",
          ".question",
          "[class*='question']",
          "[class*='problem-content']",
          "[class*='question-content']",
          "#task-left-panel",
          "article",
          "main",
          "section",
        ].join(", "),
      )
    ) {
      return true;
    }

    if (element.querySelector("ul.radio-view, ul.checkbox-view, .radio-view, .checkbox-view")) {
      return true;
    }

    return String(text || "").length >= 80;
  }

  function normalizeCustomStatementRule(rule) {
    if (!rule || typeof rule !== "object") {
      return null;
    }

    const selectorCandidates = Array.isArray(rule.selectorCandidates)
      ? rule.selectorCandidates
          .map((selector) => String(selector || "").trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
    if (selectorCandidates.length === 0) {
      return null;
    }

    return {
      scopeKey: String(rule.scopeKey || getCustomExtractScopeKey()).trim() || getCustomExtractScopeKey(),
      selectorCandidates,
      textPreview: normalizeText(rule.textPreview || ""),
      pickedTag: String(rule.pickedTag || "").trim(),
      pickedPreview: normalizeText(rule.pickedPreview || ""),
      savedAt: String(rule.savedAt || new Date().toISOString()),
    };
  }

  function resolveCustomStatementElement(rule) {
    const normalizedRule = normalizeCustomStatementRule(rule);
    if (!normalizedRule) {
      return null;
    }

    for (const selector of normalizedRule.selectorCandidates) {
      try {
        const node = document.querySelector(selector);
        if (!(node instanceof Element) || !isVisible(node) || node.closest(`#${HOST_ID}`)) {
          continue;
        }
        const text = normalizeText(node.innerText || node.textContent || "");
        if (!text) {
          continue;
        }
        return {
          element: node,
          selector,
          pickedTag: normalizedRule.pickedTag || node.tagName.toLowerCase(),
          pickedPreview: normalizedRule.pickedPreview || normalizedRule.textPreview || "",
        };
      } catch {
        continue;
      }
    }

    return null;
  }

  function getUsableCustomStatementRule() {
    const normalizedRule = normalizeCustomStatementRule(state.customStatementRule);
    if (!normalizedRule) {
      return null;
    }

    const resolved = resolveCustomStatementElement(normalizedRule);
    return resolved ? normalizedRule : null;
  }

  function buildCustomSelectorCandidates(element) {
    if (!(element instanceof Element)) {
      return [];
    }

    const candidates = [];
    const addCandidate = (selector) => {
      const normalized = String(selector || "").trim();
      if (!normalized || candidates.includes(normalized)) {
        return;
      }
      candidates.push(normalized);
    };

    const id = String(element.id || "").trim();
    if (id) {
      addCandidate(`#${escapeCssIdentifier(id)}`);
    }

    for (const attrName of ["data-testid", "data-test", "data-qa", "name", "role", "aria-label"]) {
      const attrValue = String(element.getAttribute(attrName) || "").trim();
      if (!isStableAttributeValue(attrValue)) {
        continue;
      }
      addCandidate(`${element.tagName.toLowerCase()}[${attrName}="${escapeAttributeSelectorValue(attrValue)}"]`);
    }

    const classSelector = buildStableClassSelector(element);
    if (classSelector) {
      addCandidate(classSelector);
    }

    const ancestorSelector = buildAncestorAnchoredSelector(element);
    if (ancestorSelector) {
      addCandidate(ancestorSelector);
    }

    const domPathSelector = buildDomPathSelector(element);
    if (domPathSelector) {
      addCandidate(domPathSelector);
    }

    return candidates.slice(0, 4);
  }

  function buildStableClassSelector(element) {
    const classes = Array.from(element.classList || []).filter(isStableClassName).slice(0, 3);
    if (classes.length === 0) {
      return "";
    }
    return `${element.tagName.toLowerCase()}.${classes.map((value) => escapeCssIdentifier(value)).join(".")}`;
  }

  function buildAncestorAnchoredSelector(element) {
    let current = element.parentElement;
    let depth = 0;
    while (current && depth < 4) {
      const parentId = String(current.id || "").trim();
      if (parentId) {
        return buildSelectorPathFromAncestor(current, element);
      }

      const parentClasses = Array.from(current.classList || []).filter(isStableClassName).slice(0, 2);
      if (parentClasses.length > 0) {
        return buildSelectorPathFromAncestor(current, element);
      }

      current = current.parentElement;
      depth += 1;
    }

    return "";
  }

  function buildDomPathSelector(element) {
    const segments = [];
    let current = element;
    let depth = 0;

    while (current && depth < 5 && current !== document.body) {
      const segment = buildElementSelectorSegment(current, {
        preferClass: depth < 2,
        includeNth: true,
      });
      if (!segment) {
        break;
      }
      segments.unshift(segment);
      if (current.id) {
        break;
      }
      current = current.parentElement;
      depth += 1;
    }

    return segments.join(" > ");
  }

  function buildSelectorPathFromAncestor(ancestor, element) {
    if (!(ancestor instanceof Element) || !(element instanceof Element)) {
      return "";
    }

    const segments = [];
    let current = element;
    while (current) {
      segments.unshift(
        buildElementSelectorSegment(current, {
          preferClass: current === element || current === ancestor,
          includeNth: current !== ancestor,
        }),
      );
      if (current === ancestor) {
        break;
      }
      current = current.parentElement;
    }

    return current === ancestor ? segments.filter(Boolean).join(" > ") : "";
  }

  function buildElementSelectorSegment(element, options = {}) {
    if (!(element instanceof Element)) {
      return "";
    }

    const id = String(element.id || "").trim();
    if (id) {
      return `#${escapeCssIdentifier(id)}`;
    }

    const tag = element.tagName.toLowerCase();
    const stableClasses = Array.from(element.classList || []).filter(isStableClassName).slice(0, 2);
    if (options.preferClass && stableClasses.length > 0) {
      return `${tag}.${stableClasses.map((value) => escapeCssIdentifier(value)).join(".")}`;
    }

    if (options.includeNth) {
      return `${tag}:nth-of-type(${getNthOfTypeIndex(element)})`;
    }

    return tag;
  }

  function getNthOfTypeIndex(element) {
    if (!(element instanceof Element) || !(element.parentElement instanceof Element)) {
      return 1;
    }

    const siblings = Array.from(element.parentElement.children).filter(
      (child) => child.tagName === element.tagName,
    );
    const index = siblings.indexOf(element);
    return index >= 0 ? index + 1 : 1;
  }

  function isStableClassName(value) {
    const text = String(value || "").trim();
    if (!text || text.length > 48) {
      return false;
    }
    if (/^(active|selected|hover|focus|open|close|show|hide|visible|hidden|disabled)$/i.test(text)) {
      return false;
    }
    if (/\d{4,}/.test(text)) {
      return false;
    }
    if (/[A-Fa-f0-9]{10,}/.test(text)) {
      return false;
    }
    return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(text);
  }

  function isStableAttributeValue(value) {
    const text = String(value || "").trim();
    if (!text || text.length > 60) {
      return false;
    }
    if (/\s{2,}/.test(text)) {
      return false;
    }
    return !/[A-Fa-f0-9]{12,}/.test(text);
  }

  function escapeCssIdentifier(value) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(String(value || ""));
    }
    return String(value || "").replace(/[^A-Za-z0-9_-]/g, "\\$&");
  }

  function escapeAttributeSelectorValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function summarizePreviewText(value, maxLength = 220) {
    const text = normalizeText(value);
    if (!text) {
      return "";
    }
    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
  }

  function installAutoClipboardSync() {
    if (state.clipboardSyncInstalled) {
      return;
    }

    state.clipboardSyncInstalled = true;
    document.addEventListener(
      "copy",
      () => {
        void scheduleClipboardSync();
      },
      true,
    );
  }

  function installScreenshotShortcut() {
    if (state.screenshotShortcutInstalled) {
      return;
    }

    state.screenshotShortcutInstalled = true;
    document.addEventListener(
      "keydown",
      (event) => {
        if (matchesShortcut(event, state.settings.fullAutoShortcut)) {
          if (event.repeat) {
            return;
          }
          event.preventDefault();
          void handleToggleFullAuto();
          return;
        }

        if (matchesShortcut(event, state.settings.fullPageScreenshotShortcut)) {
          if (event.repeat || isEditableTarget(event.target)) {
            return;
          }
          event.preventDefault();
          void handleCaptureFullPageScreenshot();
          return;
        }

        if (!matchesShortcut(event, state.settings.screenshotShortcut)) {
          return;
        }

        if (event.repeat || isEditableTarget(event.target)) {
          return;
        }
        event.preventDefault();
        void handleCaptureScreenshot();
      },
      true,
    );
  }

  function matchesShortcut(event, shortcut) {
    const parsed = parseShortcut(shortcut);
    if (!parsed.key) {
      return false;
    }

    return (
      event.altKey === parsed.alt &&
      event.ctrlKey === parsed.ctrl &&
      event.metaKey === parsed.meta &&
      event.shiftKey === parsed.shift &&
      normalizeEventKey(event) === parsed.key
    );
  }

  function parseShortcut(value) {
    const normalized = normalizeShortcut(value);
    if (!normalized) {
      return { alt: false, ctrl: false, meta: false, shift: false, key: "" };
    }

    const parts = normalized.split("+");
    const last = parts[parts.length - 1] || "";
    return {
      alt: parts.includes("Alt"),
      ctrl: parts.includes("Ctrl"),
      meta: parts.includes("Meta"),
      shift: parts.includes("Shift"),
      key: last.toLowerCase(),
    };
  }

  function installFrameShortcutBridge() {
    if (state.frameShortcutBridgeInstalled) {
      return;
    }

    state.frameShortcutBridgeInstalled = true;
    window.addEventListener("message", (event) => {
      if (event.source === window) {
        return;
      }

      const data = event?.data;
      if (!data || data.source !== "autolearning:frame-shortcut") {
        return;
      }

      const shortcut = data.shortcut;
      if (!shortcut || typeof shortcut !== "object") {
        return;
      }

      const parsed = parseShortcut(state.settings.fullAutoShortcut);
      if (!parsed.key) {
        return;
      }

      const key = String(shortcut.key || "").toLowerCase();
      if (
        Boolean(shortcut.alt) !== parsed.alt ||
        Boolean(shortcut.ctrl) !== parsed.ctrl ||
        Boolean(shortcut.meta) !== parsed.meta ||
        Boolean(shortcut.shift) !== parsed.shift ||
        key !== parsed.key
      ) {
        return;
      }

      void handleToggleFullAuto();
    });
  }

  function normalizeShortcut(value) {
    const raw = String(value || "")
      .trim()
      .replace(/\s+/g, "");
    if (!raw) {
      return "";
    }

    const parts = raw
      .split("+")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      return "";
    }

    const modifiers = [];
    let key = "";

    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower === "cmd" || lower === "command" || lower === "meta") {
        if (!modifiers.includes("Meta")) {
          modifiers.push("Meta");
        }
        continue;
      }
      if (lower === "ctrl" || lower === "control") {
        if (!modifiers.includes("Ctrl")) {
          modifiers.push("Ctrl");
        }
        continue;
      }
      if (lower === "alt" || lower === "option") {
        if (!modifiers.includes("Alt")) {
          modifiers.push("Alt");
        }
        continue;
      }
      if (lower === "shift") {
        if (!modifiers.includes("Shift")) {
          modifiers.push("Shift");
        }
        continue;
      }
      key = formatShortcutKey(part);
    }

    if (!key) {
      return "";
    }

    return [...modifiers, key].join("+");
  }

  function formatShortcutKey(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    if (raw.length === 1) {
      return raw.toUpperCase();
    }
    const specialKeys = {
      space: "Space",
      enter: "Enter",
      escape: "Escape",
      esc: "Escape",
      tab: "Tab",
    };
    return specialKeys[raw.toLowerCase()] || `${raw.slice(0, 1).toUpperCase()}${raw.slice(1).toLowerCase()}`;
  }

  function normalizeEventKey(event) {
    const key = String(event.key || "").toLowerCase();
    if (key === " ") {
      return "space";
    }
    if (key === "esc") {
      return "escape";
    }
    return key;
  }

  function installFrameShortcutRelay() {
    if (window.__AUTOLEARNING_FRAME_SHORTCUT_RELAY__) {
      return;
    }

    window.__AUTOLEARNING_FRAME_SHORTCUT_RELAY__ = true;
    document.addEventListener(
      "keydown",
      (event) => {
        if (event.repeat) {
          return;
        }

        const key = normalizeFrameRelayKey(event.key);
        if (!key) {
          return;
        }

        window.top.postMessage(
          {
            source: "autolearning:frame-shortcut",
            shortcut: {
              alt: Boolean(event.altKey),
              ctrl: Boolean(event.ctrlKey),
              meta: Boolean(event.metaKey),
              shift: Boolean(event.shiftKey),
              key,
            },
          },
          "*",
        );
      },
      true,
    );
  }

  function normalizeFrameRelayKey(value) {
    const key = String(value || "").toLowerCase();
    if (!key) {
      return "";
    }
    if (key === " ") {
      return "space";
    }
    if (key === "esc") {
      return "escape";
    }
    return key;
  }

  async function scheduleClipboardSync() {
    if (state.clipboardSyncPending) {
      return;
    }

    state.clipboardSyncPending = true;

    try {
      await delay(60);

      const editorContext = await callPageBridge("isEditorCopyContext", {});
      if (!editorContext?.ok || !editorContext.active) {
        return;
      }

      if (isInsideAssistant(document.activeElement)) {
        return;
      }

      const syncResult = await handlePasteCode({ auto: true });
      if (!syncResult?.updated || !hasMeaningfulCode(syncResult.text)) {
        return;
      }
      setStatus("已自动同步剪贴板代码。", {
        hint:
          getPromptMode() === "code"
            ? "代码题可继续框选题面图片，准备好后点击“生成答案”，会把题面文本、代码和截图一起提交。"
            : "点击“生成答案”后再提交。",
      });
    } finally {
      state.clipboardSyncPending = false;
    }
  }

  function isInsideAssistant(node) {
    return node instanceof Node && elements.host instanceof HTMLElement
      ? elements.host.contains(node)
      : false;
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) {
      return false;
    }

    return Boolean(target.closest("input, textarea, [contenteditable='true'], [contenteditable='']"));
  }

  function blurAssistantEditable() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && isInsideAssistant(active) && isEditableTarget(active)) {
      active.blur();
    }
  }

  function hasMeaningfulCode(value) {
    return normalizeCode(value).trim().length > 0;
  }

  function markResultReady(ready) {
    if (elements.launcher instanceof HTMLElement) {
      elements.launcher.setAttribute("data-has-result", ready ? "true" : "false");
    }
  }

  function showToast(text) {
    if (!(elements.toast instanceof HTMLElement)) {
      return;
    }

    elements.toast.textContent = text;
    elements.toast.setAttribute("data-show", "true");

    if (state.noticeTimer) {
      window.clearTimeout(state.noticeTimer);
    }

    state.noticeTimer = window.setTimeout(() => {
      elements.toast?.setAttribute("data-show", "false");
    }, 3200);
  }

  function normalizeText(value) {
    return String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function normalizeCode(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n");
  }

  function normalizeFullAutoDelay(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 3000;
    }
    return Math.min(15000, Math.max(500, Math.round(parsed)));
  }

  function normalizeAutoPickDelay(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return 600;
    }
    return Math.min(5000, Math.max(100, Math.round(parsed)));
  }

  function getPageFingerprint() {
    const assistantText = normalizeText(document.getElementById(HOST_ID)?.innerText || "");
    const bodyText = normalizeText(document.body?.innerText || "")
      .replace(assistantText, "")
      .slice(0, 4000);
    return `${location.href}::${hashText(`${document.title}\n${bodyText}`)}`;
  }

  function hashText(value) {
    const text = String(value || "");
    let hash = 0;
    for (let index = 0; index < text.length; index += 1) {
      hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
    }
    return hash.toString(16);
  }

  async function waitForNextQuestion(previousFingerprint, runToken) {
    const fixedDelayMs = normalizeFullAutoDelay(state.settings.fullAutoNextDelayMs);
    const timeoutMs = fixedDelayMs + 8000;
    const startTime = Date.now();

    while (Date.now() - startTime < fixedDelayMs) {
      if (runToken !== state.fullAutoRunToken || state.fullAutoStopRequested) {
        return false;
      }
      await delay(120);
    }

    while (Date.now() - startTime < timeoutMs) {
      if (runToken !== state.fullAutoRunToken || state.fullAutoStopRequested) {
        return false;
      }

      await delay(350);
      if (getPageFingerprint() !== previousFingerprint) {
        await delay(900);
        return true;
      }
    }

    return false;
  }

  function resetProblemForNextAutoRound() {
    state.problem = null;
    state.result = null;
    state.lastQuestionBankHit = null;
    state.lastAutoSolveCode = "";
    state.promptPreview = null;
    markResultReady(false);
    renderGeneratedTitle("");
    renderCurrentClassification(null);
    renderPromptPreview("正在等待下一题内容...");
    renderScreenshotStatus(null);
    renderOcrText("");
    renderCompactCodeCopyStatus(false);
    renderChoiceAnswer("");
    if (elements.approach) {
      elements.approach.textContent = "正在等待下一题...";
    }
    renderGeneratedCode("");
  }

  async function hydrateQuestionBank() {
    try {
      const items = await storageGet({
        [QUESTION_BANK_STORAGE_KEY]: {},
      });
      state.questionBank = normalizeQuestionBankMap(items?.[QUESTION_BANK_STORAGE_KEY]);
      state.questionBankLoaded = true;
    } catch {
      state.questionBank = {};
      state.questionBankLoaded = true;
    }
  }

  async function ensureQuestionBankLoaded() {
    if (state.questionBankLoaded) {
      return;
    }
    await hydrateQuestionBank();
  }

  function normalizeQuestionBankMap(raw) {
    if (!raw || typeof raw !== "object") {
      return {};
    }

    const normalized = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!key || !value || typeof value !== "object") {
        continue;
      }
      
      const rawAnswer = String(value.answer || value.answerLetter || value.code || "");
      const isChoiceAnswer = /^[A-Fa-f]+$/.test(rawAnswer) || /^(对|错|正确|错误|true|false)$/i.test(rawAnswer);
      const promptMode =
        value.promptMode === "choice" || value.promptMode === "code"
          ? value.promptMode
          : value.questionType === "choice" || value.questionType === "code"
            ? value.questionType
            : isChoiceAnswer
              ? "choice"
              : "code";
      const normalizedChoiceOptions = normalizeChoiceOptionSnapshot(value.optionMapSnapshot || value.choiceOptions || []);
      const normalizedAnswerLetter =
        promptMode === "choice"
          ? normalizeChoiceAnswerForBank(value.answerLetter || value.answer || value.code || "")
          : "";
      const normalizedAnswerText =
        promptMode === "choice"
          ? normalizeText(value.answerText || resolveChoiceAnswerTextFromSnapshot(normalizedAnswerLetter, normalizedChoiceOptions))
          : "";
      const defaultStatus = promptMode === "choice" || promptMode === "code"
        ? String(rawAnswer || value.finalCode || "").trim()
          ? (value.source === "cloud" ? "verified" : "verified")
          : "draft"
        : "draft";
      
      normalized[key] = {
        key: String(value.key || key),
        promptMode,
        questionType: promptMode,
        title: String(value.title || ""),
        statementPreview: String(value.statementPreview || ""),
        answer: promptMode === "choice" ? normalizedAnswerLetter : "",
        answerLetter: promptMode === "choice" ? normalizedAnswerLetter : "",
        answerText: normalizedAnswerText,
        optionMapSnapshot: normalizedChoiceOptions,
        code:
          promptMode === "choice"
            ? normalizedAnswerLetter
            : String(value.finalCode || value.code || rawAnswer || ""),
        finalCode:
          promptMode === "code"
            ? String(value.finalCode || value.code || rawAnswer || "")
            : "",
        language: String(value.language || ""),
        samplesFingerprint: String(value.samplesFingerprint || ""),
        statementFingerprint: String(value.statementFingerprint || ""),
        summary: String(value.summary || ""),
        approach: String(value.approach || ""),
        generatedTitle: String(value.generatedTitle || ""),
        model: String(value.model || ""),
        source: normalizeQuestionBankSource(value.source),
        status: normalizeQuestionBankStatus(value.status || defaultStatus, rawAnswer || value.finalCode || ""),
        category: normalizeQuestionBankCategory(value.category),
        pageUrl: String(value.pageUrl || ""),
        cloudFingerprint: String(value.cloudFingerprint || ""),
        cloudCategory: String(value.cloudCategory || ""),
        cloudStatus: String(value.cloudStatus || ""),
        createdAt: Number.isFinite(Number(value.createdAt)) ? Number(value.createdAt) : Date.now(),
        updatedAt: Number.isFinite(Number(value.updatedAt)) ? Number(value.updatedAt) : Date.now(),
      };
    }
    return normalized;
  }

  function buildChoiceKeyFromStem(stem) {
    const normalizedStem = normalizeQuestionStem(stem);
    if (!normalizedStem) {
      return "";
    }
    return `choice:${hashText(`choice\n${normalizedStem}`)}`;
  }

  function mergeCloudQuestionBank(cloudBank) {
    let mergedCount = 0;
    for (const categoryData of Array.isArray(cloudBank) ? cloudBank : []) {
      const category = String(categoryData?.category || "").trim();
      const questions = Array.isArray(categoryData?.questions) ? categoryData.questions : [];
      for (const item of questions) {
        const stem = String(item?.stem || "").trim();
        const answer = normalizeChoiceAnswerForBank(item?.answer || "");
        if (!stem || !answer) {
          continue;
        }
        const key = buildChoiceKeyFromStem(stem);
        if (!key) {
          continue;
        }
        const existing = state.questionBank[key] || {};
        const source = existing.source === "local" || existing.source === "imported" ? existing.source : "cloud";
        const status = normalizeQuestionBankStatus(existing.status, existing.answer || answer);
        const cloudOptionMapSnapshot = normalizeChoiceOptionSnapshot(item?.optionMapSnapshot || item?.choiceOptions || []);
        const cloudAnswerText = normalizeText(
          item?.answerText || resolveChoiceAnswerTextFromSnapshot(answer, cloudOptionMapSnapshot),
        );
        const existingOptionMapSnapshot = normalizeChoiceOptionSnapshot(existing.optionMapSnapshot || []);
        const optionMapSnapshot =
          existingOptionMapSnapshot.length >= cloudOptionMapSnapshot.length ? existingOptionMapSnapshot : cloudOptionMapSnapshot;
        const answerText = normalizeText(existing.answerText || cloudAnswerText);
        const categoryValue =
          existing.category && existing.category !== "general"
            ? existing.category
            : normalizeQuestionBankCategory(category);
        state.questionBank[key] = {
          ...existing,
          key,
          promptMode: "choice",
          questionType: "choice",
          title: String(existing.title || stem.split("\n")[0] || "云端题库题目").slice(0, 300),
          statementPreview: stem,
          answer: existing.answer || answer,
          answerLetter: existing.answerLetter || existing.answer || answer,
          answerText,
          optionMapSnapshot,
          code: existing.code || existing.answer || answer,
          finalCode: "",
          language: String(existing.language || ""),
          samplesFingerprint: String(existing.samplesFingerprint || ""),
          statementFingerprint: String(existing.statementFingerprint || item?.statementFingerprint || buildStatementFingerprintFromText(stem)),
          summary: String(existing.summary || "命中云端题库答案。"),
          approach: String(existing.approach || "已同步云端题库记录，优先使用云端答案。"),
          generatedTitle: String(existing.generatedTitle || ""),
          model: String(existing.model || "cloud-question-bank"),
          source,
          status: "verified",
          category: categoryValue,
          pageUrl: String(existing.pageUrl || ""),
          cloudFingerprint: String(item?.fingerprint || existing.cloudFingerprint || ""),
          cloudCategory: category,
          cloudStatus: "approved",
          createdAt: existing.createdAt || Date.now(),
          updatedAt: Date.now(),
        };
        mergedCount += 1;
      }
    }
    return mergedCount;
  }

  function normalizeQuestionBankSource(value) {
    const source = String(value || "").trim().toLowerCase();
    if (source === "cloud" || source === "imported" || source === "local") {
      return source;
    }
    return "local";
  }

  function normalizeQuestionBankCategory(value) {
    const category = String(value || "").trim().toLowerCase();
    if (QUESTION_BANK_CATEGORIES.includes(category)) {
      return category;
    }
    return "general";
  }

  function getQuestionBankCategoryLabel(category) {
    const normalized = normalizeQuestionBankCategory(category);
    return (
      QUESTION_BANK_CATEGORY_DEFS.find((item) => item.key === normalized)?.label ||
      normalized
    );
  }

  function inferQuestionBankCategory(urlOrHost) {
    const raw = String(urlOrHost || "").trim().toLowerCase();
    if (!raw) {
      return "general";
    }
    let host = raw;
    try {
      host = new URL(raw).hostname.toLowerCase();
    } catch {
      host = raw.replace(/^https?:\/\//, "").split("/")[0];
    }
    if (host === "zhihuishu.com" || host.endsWith(".zhihuishu.com")) {
      return "zhihuishu";
    }
    if (host === "educoder.net" || host.endsWith(".educoder.net")) {
      return "educoder";
    }
    if (host === "leetcode.com" || host === "leetcode.cn" || host.endsWith(".leetcode.com") || host.endsWith(".leetcode.cn")) {
      return "leetcode";
    }
    return "general";
  }

  function resolvePreferredQuestionBankCategory(problemOrUrl) {
    const url =
      typeof problemOrUrl === "string"
        ? problemOrUrl
        : String(problemOrUrl?.url || state.problem?.url || location.href || "").trim();
    return normalizeQuestionBankCategory(inferQuestionBankCategory(url));
  }

  function inferLegacyQuestionBankCategory(entry) {
    const promptMode =
      entry?.promptMode === "choice" || entry?.promptMode === "code"
        ? entry.promptMode
        : normalizeChoiceAnswerForBank(entry?.answer || entry?.code || "")
          ? "choice"
          : "";
    if (promptMode === "choice") {
      return "zhihuishu";
    }
    if (promptMode === "code") {
      return "educoder";
    }
    return "general";
  }

  function normalizeQuestionBankStatus(status, answer) {
    const normalizedStatus = String(status || "").trim().toLowerCase();
    if (
      normalizedStatus === "draft" ||
      normalizedStatus === "candidate" ||
      normalizedStatus === "verified" ||
      normalizedStatus === "rejected"
    ) {
      return normalizedStatus;
    }
    if (normalizedStatus === "answered") {
      return "verified";
    }
    return String(answer || "").trim() ? "verified" : "draft";
  }

  function normalizeChoiceOptionSnapshot(options) {
    return Array.isArray(options)
      ? options
          .map((option) => ({
            label: normalizeChoiceOptionLabel(option?.label || ""),
            text: normalizeText(option?.text || ""),
          }))
          .filter((option) => option.label || option.text)
      : [];
  }

  function resolveChoiceAnswerTextFromSnapshot(answerLetter, optionMapSnapshot) {
    const labels = extractChoiceLabels(answerLetter);
    if (labels.length === 0) {
      return "";
    }
    const snapshot = normalizeChoiceOptionSnapshot(optionMapSnapshot);
    const matchedTexts = labels
      .map((label) => snapshot.find((option) => option.label === label)?.text || "")
      .filter(Boolean);
    return matchedTexts.join(" | ");
  }

  function buildStatementFingerprint(problem) {
    return buildStatementFingerprintFromText(extractQuestionCoreText(problem));
  }

  function buildStatementFingerprintFromText(text) {
    const normalized = normalizeQuestionStem(text || "");
    return normalized ? `stem:${hashText(normalized)}` : "";
  }

  function buildSamplesFingerprint(problem) {
    const sampleText = Array.isArray(problem?.samples)
      ? problem.samples
          .map((sample) => `${normalizeQuestionStem(sample?.input || "")}=>${normalizeQuestionStem(sample?.output || "")}`)
          .join("|")
      : "";
    return sampleText ? `samples:${hashText(sampleText)}` : "";
  }

  function resolveChoiceCloudDuplicateState(entry) {
    if (!entry || normalizeQuestionBankSource(entry.source) === "cloud") {
      return { duplicated: false, reason: "" };
    }
    const normalizedQuestionType = String(entry.questionType || entry.promptMode || "").trim();
    if (normalizedQuestionType !== "choice") {
      return { duplicated: false, reason: "" };
    }
    const entryCategory = normalizeQuestionBankCategory(entry.category);
    const entryStatementFingerprint = String(entry.statementFingerprint || "").trim();
    const entryCloudFingerprint = String(entry.cloudFingerprint || entry.fingerprint || "").trim();
    const entryStem = normalizeQuestionStem(entry.statementPreview || entry.title || "");
    const entryAnswerText = normalizeText(entry.answerText || "");
    for (const candidate of Object.values(state.questionBank || {})) {
      if (!candidate || normalizeQuestionBankSource(candidate.source) !== "cloud") {
        continue;
      }
      if (String(candidate.questionType || candidate.promptMode || "").trim() !== "choice") {
        continue;
      }
      const candidateCategory = normalizeQuestionBankCategory(candidate.category || candidate.cloudCategory);
      if (entryCategory !== candidateCategory) {
        continue;
      }
      const candidateStatementFingerprint = String(candidate.statementFingerprint || "").trim();
      if (
        entryStatementFingerprint &&
        candidateStatementFingerprint &&
        entryStatementFingerprint === candidateStatementFingerprint
      ) {
        return { duplicated: true, reason: "Already in cloud" };
      }
      const candidateCloudFingerprint = String(candidate.cloudFingerprint || candidate.fingerprint || "").trim();
      if (
        entryCloudFingerprint &&
        candidateCloudFingerprint &&
        entryCloudFingerprint === candidateCloudFingerprint
      ) {
        return { duplicated: true, reason: "Already in cloud" };
      }
      const candidateStem = normalizeQuestionStem(candidate.statementPreview || candidate.title || "");
      if (entryStem && candidateStem && entryStem === candidateStem) {
        const candidateAnswerText = normalizeText(candidate.answerText || "");
        if (!entryAnswerText || !candidateAnswerText || entryAnswerText === candidateAnswerText) {
          return { duplicated: true, reason: "Already in cloud" };
        }
      }
    }
    return { duplicated: false, reason: "" };
  }
  function applyContributionResults(items, results, category) {
    const resultMap = new Map();
    for (const item of Array.isArray(results) ? results : []) {
      const clientEntryId = String(item?.clientEntryId || "").trim();
      if (clientEntryId) {
        resultMap.set(clientEntryId, item);
      }
    }

    for (const editorItem of Array.isArray(items) ? items : []) {
      const result = resultMap.get(String(editorItem.id || ""));
      if (!result) {
        continue;
      }
      const cloudStatus =
        result.status === "issue_created" || result.status === "submitted"
          ? "issue_created"
          : result.status === "issue_opened"
            ? "issue_opened"
          : result.status === "duplicate"
            ? "duplicate"
            : "";
      if (!cloudStatus) {
        continue;
      }
      editorItem.cloudStatus = cloudStatus;
      editorItem.cloudCategory = category;
      editorItem.cloudFingerprint = String(result.fingerprint || "");
      editorItem.category = normalizeQuestionBankCategory(category);
      for (const aliasKey of Array.isArray(editorItem.keys) ? editorItem.keys : []) {
        const existing = state.questionBank[aliasKey];
        if (!existing) {
          continue;
        }
        state.questionBank[aliasKey] = {
          ...existing,
          category:
            normalizeQuestionBankCategory(existing.category) === "general"
              ? normalizeQuestionBankCategory(category)
              : normalizeQuestionBankCategory(existing.category),
          cloudStatus,
          cloudCategory: category,
          cloudFingerprint: String(result.fingerprint || existing.cloudFingerprint || ""),
          updatedAt: Date.now(),
        };
      }
    }
  }

  function buildQuestionBankLookupKeys(problem, mode = "choice") {
    const promptMode = mode === "choice" ? "choice" : "code";
    const title = normalizeQuestionStem(problem?.title || "");
    const statement = extractQuestionCoreText(problem);
    const ocr = normalizeQuestionStem(problem?.ocrText || "");
    const sampleText = Array.isArray(problem?.samples)
      ? problem.samples
          .map((sample) => {
            const input = normalizeQuestionStem(sample?.input || "");
            const output = normalizeQuestionStem(sample?.output || "");
            return `${input}=>${output}`;
          })
          .join(" | ")
      : "";
    const core = statement || ocr || title;
    const primaryRaw = `${promptMode}\n${core}`;
    const secondaryRaw = `${promptMode}\n${title}\n${core}`;
    const tertiaryRaw = `${promptMode}\n${core}\n${sampleText}`;
    const keys = [
      `${promptMode}:${hashText(primaryRaw)}`,
      `${promptMode}:${hashText(secondaryRaw)}`,
      `${promptMode}:${hashText(tertiaryRaw)}`,
    ];
    return Array.from(new Set(keys.filter(Boolean)));
  }

  function findChoiceQuestionBankAnswer(problem) {
    const keys = buildQuestionBankLookupKeys(problem, "choice");
    for (const key of keys) {
      const entry = state.questionBank[key];
      const strongHit = buildChoiceHitFromEntry(problem, entry, key, keys);
      if (strongHit) {
        return strongHit;
      }
    }

    const targetStem = extractQuestionCoreText(problem);
    if (!targetStem) {
      return null;
    }

    for (const [bankKey, entry] of Object.entries(state.questionBank || {})) {
      const fallbackHit = buildChoiceHitFromEntry(problem, entry, bankKey, keys);
      if (!fallbackHit) {
        continue;
      }
      const candidateStems = buildQuestionBankEntryCoreTexts(entry);
      if (candidateStems.some((candidateStem) => stemsLooselyMatch(targetStem, candidateStem))) {
        return fallbackHit;
      }
    }

    return null;
  }

  function buildChoiceHitFromEntry(problem, entry, key, keys) {
    if (!entry || entry.promptMode !== "choice" || entry.status !== "verified") {
      return null;
    }
    const answerLetter = normalizeChoiceAnswerForBank(entry.answerLetter || entry.answer || entry.code || "");
    if (!answerLetter) {
      return null;
    }

    const currentOptions = normalizeChoiceOptionSnapshot(problem?.choiceOptions || []);
    const snapshot = normalizeChoiceOptionSnapshot(entry.optionMapSnapshot || []);
    const answerText = normalizeText(entry.answerText || resolveChoiceAnswerTextFromSnapshot(answerLetter, snapshot));
    const remappedLetter = remapChoiceAnswerByText(answerText, currentOptions);
    const hasSnapshot = snapshot.length > 0;
    const optionSetChanged = hasSnapshot && haveChoiceOptionSetsDiverged(snapshot, currentOptions);

    if (hasSnapshot && currentOptions.length > 0 && !remappedLetter && optionSetChanged) {
      return null;
    }

    return {
      key,
      keys,
      entry,
      matchStrength: remappedLetter ? "strong" : "weak",
      answer: remappedLetter || answerLetter,
      answerText,
      optionMapSnapshot: snapshot,
      currentOptions,
    };
  }

  function findCodeQuestionBankAnswer(problem) {
    const keys = buildQuestionBankLookupKeys(problem, "code");
    const statementFingerprint = buildStatementFingerprint(problem);
    const samplesFingerprint = buildSamplesFingerprint(problem);
    const language = String(problem?.limits?.language || "").trim().toLowerCase();

    for (const key of keys) {
      const entry = state.questionBank[key];
      if (!entry || entry.promptMode !== "code" || entry.status !== "verified") {
        continue;
      }
      if (!String(entry.finalCode || entry.code || "").trim()) {
        continue;
      }
      const entryLanguage = String(entry.language || "").trim().toLowerCase();
      if (entryLanguage && language && entryLanguage !== language) {
        continue;
      }
      if (entry.statementFingerprint && statementFingerprint && entry.statementFingerprint !== statementFingerprint) {
        continue;
      }
      if (entry.samplesFingerprint && samplesFingerprint && entry.samplesFingerprint !== samplesFingerprint) {
        continue;
      }
      return {
        key,
        keys,
        entry,
        matchStrength: "strong",
      };
    }

    return null;
  }

  function buildQuestionBankEntryCoreTexts(entry) {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const candidates = [
      extractQuestionCoreText({
        statementText: String(entry.statementPreview || ""),
        ocrText: "",
      }),
      extractQuestionCoreText({
        statementText: String(entry.title || ""),
        ocrText: "",
      }),
      normalizeQuestionStem(entry.statementPreview || ""),
      normalizeQuestionStem(entry.title || ""),
    ];

    return Array.from(new Set(candidates.filter(Boolean)));
  }

  function stemsLooselyMatch(left, right) {
    const a = normalizeQuestionStem(left || "");
    const b = normalizeQuestionStem(right || "");
    if (!a || !b) {
      return false;
    }
    return a === b || a.includes(b) || b.includes(a);
  }

  function extractQuestionCoreText(problem) {
    const raw = normalizeText(problem?.statementText || problem?.ocrText || "");
    if (!raw) {
      return "";
    }

    const lines = raw
      .split("\n")
      .map((line) => normalizeText(line))
      .filter(Boolean);
    const filtered = [];

    for (const rawLine of lines) {
      let line = stripQuestionOrderPrefix(rawLine);
      if (!line) {
        continue;
      }
      line = line.replace(/^(单选题|多选题|判断题|填空题|选择题|题目)\s*/g, "");
      line = line.replace(/^第\s*\d+\s*题\s*/g, "");
      if (!line) {
        continue;
      }
      if (isChoiceOptionLine(line)) {
        continue;
      }
      filtered.push(line);
      if (filtered.length >= 4) {
        break;
      }
    }

    const joined = filtered.join(" ");
    return normalizeQuestionStem(joined);
  }

  function stripQuestionOrderPrefix(value) {
    let line = String(value || "");
    line = line.replace(/^\s*[\[(（【]?\s*\d+\s*[\])）】]?\s*[\.、。．:：-]\s*/g, "");
    line = line.replace(/^\s*\d+\s+/g, "");
    line = line.replace(/^\s*(\d+\s*[\.、。．:：-]\s*)+/g, "");
    return normalizeText(line);
  }

  function isChoiceOptionLine(value) {
    const line = String(value || "");
    if (!line) {
      return false;
    }

    if (/^[A-FＡ-Ｆ][\.、。．:：\s]/.test(line)) {
      return true;
    }
    if (/^[\(\[（【]?[A-FＡ-Ｆ][\)\]）】][\.、。．:：\s]*/.test(line)) {
      return true;
    }
    if (/[A-FＡ-Ｆ][\.、。．:：].{0,80}[A-FＡ-Ｆ][\.、。．:：]/.test(line)) {
      return true;
    }
    return false;
  }

  function normalizeQuestionStem(value) {
    return normalizeText(value)
      .toLowerCase()
      .replace(/[“”"']/g, "")
      .replace(/[（）()【】\[\]《》<>]/g, " ")
      .replace(/[，,。！？!?:：;；、]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function buildQuestionBankResult(hit, problem) {
    const entry = hit?.entry || null;
    const answer = String(hit?.answer || entry?.answerLetter || entry?.answer || "").trim();
    const code = String(entry?.finalCode || entry?.code || "").trim();
    return {
      generatedTitle: entry?.generatedTitle || problem?.title || "本地题库答案",
      summary:
        hit?.matchStrength === "weak"
          ? entry?.summary || "命中历史疑似答案，请优先人工确认。"
          : entry?.summary || "命中本地题库答案。",
      problemType: entry?.promptMode === "choice" ? "选择题" : "代码题",
      problemDefinition: "",
      approach:
        hit?.matchStrength === "weak"
          ? entry?.approach || "当前只命中了弱匹配记录，插件不会把它当作稳定答案自动勾选。"
          : entry?.approach || "已命中本地题库记录，优先使用本地答案。",
      answer,
      answerText: String(hit?.answerText || entry?.answerText || ""),
      code: code || (entry?.promptMode === "choice" ? answer : ""),
      model: "local-question-bank",
      fromQuestionBank: true,
      matchStrength: hit?.matchStrength || "strong",
      needsVerification: false,
    };
  }

  function enrichSolveResultForQuestionBank(problem, mode, solveResult, options = {}) {
    const nextResult = solveResult && typeof solveResult === "object" ? { ...solveResult } : {};
    if (mode === "choice") {
      const answerLetter = normalizeChoiceAnswerForBank(nextResult.answerLetter || nextResult.answer || nextResult.code || "");
      const optionMapSnapshot = normalizeChoiceOptionSnapshot(problem?.choiceOptions || nextResult.optionMapSnapshot || []);
      const answerText = normalizeText(
        nextResult.answerText || resolveChoiceAnswerTextFromSnapshot(answerLetter, optionMapSnapshot),
      );
      nextResult.answer = answerLetter;
      nextResult.answerLetter = answerLetter;
      nextResult.answerText = answerText;
      nextResult.optionMapSnapshot = optionMapSnapshot;
    } else {
      nextResult.finalCode = String(nextResult.finalCode || nextResult.code || "");
      nextResult.language = String(problem?.limits?.language || nextResult.language || "");
      nextResult.samplesFingerprint = buildSamplesFingerprint(problem);
      nextResult.statementFingerprint = buildStatementFingerprint(problem);
    }
    nextResult.fromQuestionBank = mode === "choice" && Boolean(options.fromQuestionBank || nextResult.fromQuestionBank);
    nextResult.matchStrength = String(options.matchStrength || nextResult.matchStrength || "");
    nextResult.needsVerification = mode === "choice" && !nextResult.fromQuestionBank;
    return nextResult;
  }

  async function upsertQuestionBankEntry(problem, mode, solveResult, options = {}) {
    if (!problem || !solveResult) {
      return;
    }

    const keys = buildQuestionBankLookupKeys(problem, mode);
    if (keys.length === 0) {
      return;
    }

    const now = Date.now();
    const firstKey = keys[0];
    const existing = state.questionBank[firstKey] || state.questionBank[keys[1]] || null;
    const normalizedAnswer =
      mode === "choice"
        ? normalizeChoiceAnswerForBank(solveResult.answerLetter || solveResult.answer || solveResult.code || "")
        : "";
    const optionMapSnapshot = normalizeChoiceOptionSnapshot(problem?.choiceOptions || solveResult.optionMapSnapshot || []);
    const answerText =
      mode === "choice"
        ? normalizeText(
            solveResult.answerText ||
              resolveChoiceAnswerTextFromSnapshot(normalizedAnswer, optionMapSnapshot),
          )
        : "";
    const inferredCategory = resolvePreferredQuestionBankCategory(problem);
    const existingCategory = normalizeQuestionBankCategory(existing?.category);
    const finalCategory =
      existingCategory && existingCategory !== "general" ? existingCategory : inferredCategory;
    const nextStatus = normalizeQuestionBankStatus(
      options.status || existing?.status || (mode === "choice" ? "candidate" : "candidate"),
      normalizedAnswer || solveResult.code || solveResult.finalCode || "",
    );
    const nextEntry = {
      key: firstKey,
      promptMode: mode === "choice" ? "choice" : "code",
      questionType: mode === "choice" ? "choice" : "code",
      title: String(problem.title || "").slice(0, 300),
      statementPreview: normalizeText(problem.statementText || "").slice(0, 1600),
      answer: mode === "choice" ? normalizedAnswer : "",
      answerLetter: mode === "choice" ? normalizedAnswer : "",
      answerText,
      optionMapSnapshot,
      code: mode === "choice" ? normalizedAnswer : String(solveResult.finalCode || solveResult.code || ""),
      finalCode: mode === "code" ? String(solveResult.finalCode || solveResult.code || "") : "",
      language: String(problem?.limits?.language || existing?.language || ""),
      samplesFingerprint: mode === "code" ? buildSamplesFingerprint(problem) : "",
      statementFingerprint: buildStatementFingerprint(problem),
      summary: String(solveResult.summary || ""),
      approach: String(solveResult.approach || ""),
      generatedTitle: String(solveResult.generatedTitle || ""),
      model: String(solveResult.model || ""),
      source: normalizeQuestionBankSource(existing?.source || options.source || "local"),
      status: nextStatus,
      category: finalCategory,
      pageUrl: String(problem.url || existing?.pageUrl || ""),
      cloudFingerprint: existing?.cloudFingerprint || "",
      cloudCategory: existing?.cloudCategory || "",
      cloudStatus: existing?.cloudStatus || "",
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    for (const key of keys) {
      state.questionBank[key] = {
        ...nextEntry,
        key,
      };
    }
    await persistQuestionBank();
  }

  async function markQuestionBankEntryStatus(hit, nextStatus) {
    if (!hit?.entry) {
      return;
    }
    const keys = Array.isArray(hit.keys) && hit.keys.length > 0 ? hit.keys : [hit.key];
    const now = Date.now();
    for (const key of keys) {
      const existing = state.questionBank[key];
      if (!existing) {
        continue;
      }
      state.questionBank[key] = {
        ...existing,
        status: normalizeQuestionBankStatus(nextStatus, existing.answer || existing.code || existing.finalCode || ""),
        updatedAt: now,
      };
    }
    await persistQuestionBank();
  }

  function remapChoiceAnswerByText(answerText, currentOptions) {
    const expectedTexts = String(answerText || "")
      .split("|")
      .map((item) => normalizeQuestionStem(item))
      .filter(Boolean);
    if (expectedTexts.length === 0 || !Array.isArray(currentOptions) || currentOptions.length === 0) {
      return "";
    }
    const matchedLabels = [];
    for (const expectedText of expectedTexts) {
      const match = currentOptions.find((option) => normalizeQuestionStem(option.text || "") === expectedText);
      if (!match?.label) {
        return "";
      }
      matchedLabels.push(match.label);
    }
    return normalizeChoiceAnswerForBank(matchedLabels.join(""));
  }

  function haveChoiceOptionSetsDiverged(leftOptions, rightOptions) {
    const left = normalizeChoiceOptionSnapshot(leftOptions)
      .map((option) => normalizeQuestionStem(option.text || ""))
      .filter(Boolean)
      .sort();
    const right = normalizeChoiceOptionSnapshot(rightOptions)
      .map((option) => normalizeQuestionStem(option.text || ""))
      .filter(Boolean)
      .sort();
    if (left.length === 0 || right.length === 0) {
      return false;
    }
    return left.join("|") !== right.join("|");
  }

  function queueQuestionBankReviewItem(problem, mode, answerText) {
    if (mode !== "choice" || !problem) {
      return;
    }
    const answer = normalizeChoiceAnswerForBank(answerText);
    if (!answer) {
      return;
    }

    const keys = buildQuestionBankLookupKeys(problem, mode);
    if (keys.length === 0) {
      return;
    }

    const primaryKey = keys[0];
    const statementPreview = normalizeText(problem.statementText || "").slice(0, 240);
    const normalizedTitle = normalizeText(problem.title || "");
    const statementFingerprint = buildStatementFingerprint(problem);
    const hasStableDecision = Object.values(state.questionBank || {}).some((entry) => {
      if (!entry || normalizeQuestionBankSource(entry.source) === "cloud") {
        return false;
      }
      const status = normalizeQuestionBankStatus(entry.status, entry.answer || entry.code || entry.finalCode || "");
      if (status !== "verified" && status !== "rejected") {
        return false;
      }
      if (statementFingerprint && String(entry.statementFingerprint || "").trim() === statementFingerprint) {
        return true;
      }
      const entryKey = String(entry.key || "").trim();
      if (primaryKey && entryKey === primaryKey) {
        return true;
      }
      return (
        normalizeText(entry.title || "") === normalizedTitle &&
        normalizeText(entry.statementPreview || "").slice(0, 240) === statementPreview
      );
    });
    if (hasStableDecision) {
      return;
    }
    const existingIndex = state.questionBankReviewQueue.findIndex((item) => {
      if (item.primaryKey === primaryKey) {
        return true;
      }
      if (statementFingerprint && String(item.statementFingerprint || "").trim() === statementFingerprint) {
        return true;
      }
      return (
        normalizeText(item.title || "") === normalizedTitle &&
        normalizeText(item.statementPreview || "") === statementPreview
      );
    });
    const nextItem = {
      primaryKey,
      keys,
      mode: "choice",
      title: String(problem.title || "未命名题目"),
      statementPreview,
      statementFingerprint,
      answer,
      answerText: normalizeText(resolveChoiceAnswerTextFromSnapshot(answer, problem?.choiceOptions || [])),
      optionMapSnapshot: normalizeChoiceOptionSnapshot(problem?.choiceOptions || []),
    };
    if (existingIndex >= 0) {
      state.questionBankReviewQueue[existingIndex] = nextItem;
      return;
    }
    state.questionBankReviewQueue.push(nextItem);
  }

  function removeQuestionBankReviewQueueItem(target) {
    const primaryKey = String(target?.primaryKey || "").trim();
    const statementFingerprint = String(target?.statementFingerprint || "").trim();
    const normalizedTitle = normalizeText(target?.title || "");
    const statementPreview = normalizeText(target?.statementPreview || "");
    const originalLength = Array.isArray(state.questionBankReviewQueue) ? state.questionBankReviewQueue.length : 0;
    if (!originalLength) {
      return false;
    }
    state.questionBankReviewQueue = state.questionBankReviewQueue.filter((item) => {
      if (!item) {
        return false;
      }
      if (primaryKey && String(item.primaryKey || "").trim() === primaryKey) {
        return false;
      }
      if (statementFingerprint && String(item.statementFingerprint || "").trim() === statementFingerprint) {
        return false;
      }
      if (
        normalizedTitle &&
        statementPreview &&
        normalizeText(item.title || "") === normalizedTitle &&
        normalizeText(item.statementPreview || "") === statementPreview
      ) {
        return false;
      }
      return true;
    });
    return state.questionBankReviewQueue.length !== originalLength;
  }

  async function persistQuestionBank() {
    await storageSet({
      [QUESTION_BANK_STORAGE_KEY]: state.questionBank,
    });
  }

  function normalizeChoiceAnswerForBank(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }

    if (/^(对|正确|true|yes|√)$/i.test(raw)) {
      return "对";
    }
    if (/^(错|错误|false|no|×)$/i.test(raw)) {
      return "错";
    }

    const letters = raw.toUpperCase().match(/[A-F]/g) || [];
    if (letters.length > 0) {
      const deduped = [];
      for (const label of letters) {
        if (!deduped.includes(label)) {
          deduped.push(label);
        }
      }
      return deduped.join("");
    }

    return raw.slice(0, 24);
  }

  async function handleOpenQuestionBankEditor(options = {}) {
    if (!isQuestionBankEnabledForCurrentMode()) {
      setStatus("浠ｇ爜棰樻ā寮忔殏涓嶆敮鎸侀搴撳姛鑳斤紝褰撳墠鐩存帴浣跨敤 AI 鐢熸垚缁撴灉銆?");
      return;
    }
    await ensureQuestionBankLoaded();
    const items = buildQuestionBankEditorItems();
    openQuestionBankReviewModal(items, options);
  }

  function buildQuestionBankEditorItems() {
    const map = new Map();
    const getStatusPriority = (status) => {
      const normalized = normalizeQuestionBankStatus(status, "");
      if (normalized === "candidate") {
        return 4;
      }
      if (normalized === "verified") {
        return 3;
      }
      if (normalized === "rejected") {
        return 2;
      }
      return 1;
    };
    const resolveQuestionBankEditorPrimaryKey = (payload) => {
      const fingerprint = String(payload?.statementFingerprint || "").trim();
      if (fingerprint) {
        return `fingerprint:${fingerprint}`;
      }
      const stableKey =
        String(payload?.primaryKey || "").trim() ||
        (Array.isArray(payload?.keys) ? String(payload.keys[0] || "").trim() : "");
      if (stableKey) {
        return `key:${stableKey}`;
      }
      return `text:${hashText(
        `${normalizeText(payload?.title || "").toLowerCase()}\n${normalizeText(payload?.statementPreview || "").toLowerCase()}`,
      )}`;
    };
    const buildQuestionBankEditorDedupeKey = (payload) => `question:${resolveQuestionBankEditorPrimaryKey(payload)}`;

    const upsertItem = (key, payload) => {
      const current = map.get(key);
      if (!current) {
        map.set(key, {
          id: key,
          primaryKey: String(payload.primaryKey || ""),
          statementFingerprint: String(payload.statementFingerprint || ""),
          title: payload.title || "未命名题目",
          statementPreview: payload.statementPreview || "",
          answer: payload.answer || "",
          keys: Array.from(new Set(payload.keys || [])),
          updatedAt: Number.isFinite(Number(payload.updatedAt)) ? Number(payload.updatedAt) : 0,
          preferred: Boolean(payload.preferred),
          source: normalizeQuestionBankSource(payload.source),
          status: normalizeQuestionBankStatus(payload.status, payload.answer),
          category: normalizeQuestionBankCategory(payload.category),
          pageUrl: String(payload.pageUrl || ""),
          questionType: payload.questionType || "choice",
          answerText: payload.answerText || "",
          optionMapSnapshot: normalizeChoiceOptionSnapshot(payload.optionMapSnapshot || []),
          cloudStatus: payload.cloudStatus || "",
          cloudFingerprint: payload.cloudFingerprint || "",
          cloudCategory: payload.cloudCategory || "",
          cloudDuplicate: Boolean(payload.cloudDuplicate),
          cloudDuplicateReason: String(payload.cloudDuplicateReason || ""),
        });
        return;
      }

      current.keys = Array.from(new Set([...current.keys, ...(payload.keys || [])]));
      if (payload.primaryKey && !current.primaryKey) {
        current.primaryKey = String(payload.primaryKey || "");
      }
      if (payload.statementFingerprint && !current.statementFingerprint) {
        current.statementFingerprint = String(payload.statementFingerprint || "");
      }
      if (payload.answer && (payload.preferred || !current.answer)) {
        current.answer = payload.answer;
      }
      if (payload.statementPreview && !current.statementPreview) {
        current.statementPreview = payload.statementPreview;
      }
      if (payload.title && current.title === "未命名题目") {
        current.title = payload.title;
      }
      current.updatedAt = Math.max(current.updatedAt, Number(payload.updatedAt) || 0);
      if (payload.preferred) {
        current.preferred = true;
      }
      if (payload.cloudStatus) {
        current.cloudStatus = payload.cloudStatus;
      }
      if (payload.cloudFingerprint) {
        current.cloudFingerprint = payload.cloudFingerprint;
      }
      if (payload.cloudCategory) {
        current.cloudCategory = payload.cloudCategory;
      }
      if (payload.cloudDuplicate) {
        current.cloudDuplicate = true;
      }
      if (payload.cloudDuplicateReason) {
        current.cloudDuplicateReason = String(payload.cloudDuplicateReason || "");
      }
      if (payload.source && current.source !== "local") {
        current.source = normalizeQuestionBankSource(payload.source);
      }
      if (payload.status) {
        const nextStatus = normalizeQuestionBankStatus(payload.status, payload.answer || current.answer);
        const currentStatus = normalizeQuestionBankStatus(current.status, current.answer);
        const currentIsStable = currentStatus === "verified" || currentStatus === "rejected";
        const nextIsCandidateFromQueue = Boolean(payload.preferred) && nextStatus === "candidate";
        if (!currentIsStable || !nextIsCandidateFromQueue) {
          if (getStatusPriority(nextStatus) >= getStatusPriority(currentStatus)) {
            current.status = nextStatus;
          }
        }
      }
      if (payload.category && current.category === "general") {
        current.category = normalizeQuestionBankCategory(payload.category);
      }
      if (payload.pageUrl && !current.pageUrl) {
        current.pageUrl = String(payload.pageUrl || "");
      }
      if (payload.answerText && (payload.preferred || !current.answerText)) {
        current.answerText = payload.answerText;
      }
      if (Array.isArray(payload.optionMapSnapshot) && payload.optionMapSnapshot.length >= current.optionMapSnapshot.length) {
        current.optionMapSnapshot = normalizeChoiceOptionSnapshot(payload.optionMapSnapshot);
      }
    };

    const allEntries = Object.entries(state.questionBank || {});
    for (const [storageKey, entry] of allEntries) {
      if (!entry || entry.promptMode !== "choice") {
        continue;
      }
      const answer = normalizeChoiceAnswerForBank(entry.answer || entry.code || "");
      const primaryKey = String(entry.statementFingerprint || entry.key || storageKey || "").trim() || storageKey;
      const entryKeys = Array.from(
        new Set([primaryKey, storageKey, ...(Array.isArray(entry.keys) ? entry.keys : [])].filter(Boolean)),
      );
      const cloudDuplicateState = resolveChoiceCloudDuplicateState(entry);
      upsertItem(
        buildQuestionBankEditorDedupeKey({
          primaryKey,
          keys: entryKeys,
          title: entry.title,
          statementPreview: entry.statementPreview,
          statementFingerprint: entry.statementFingerprint,
        }),
        {
          primaryKey,
        title: String(entry.title || "未命名题目"),
        statementPreview: String(entry.statementPreview || ""),
        answer,
        keys: entryKeys,
        updatedAt: entry.updatedAt,
        preferred: false,
        source: entry.source || "local",
        status: entry.status || (answer ? "verified" : "draft"),
        category: entry.category || inferQuestionBankCategory(entry.pageUrl || ""),
        pageUrl: entry.pageUrl || "",
        questionType: entry.questionType || entry.promptMode || "choice",
        answerText: entry.answerText || "",
        optionMapSnapshot: entry.optionMapSnapshot || [],
        cloudStatus: entry.cloudStatus || "",
        cloudFingerprint: entry.cloudFingerprint || "",
        cloudCategory: entry.cloudCategory || "",
        cloudDuplicate: cloudDuplicateState.duplicated,
        cloudDuplicateReason: cloudDuplicateState.reason,
        statementFingerprint: entry.statementFingerprint || "",
      });
    }

    for (const queueItem of state.questionBankReviewQueue || []) {
      upsertItem(
        buildQuestionBankEditorDedupeKey({
          primaryKey: queueItem.primaryKey,
          keys: queueItem.keys,
          title: queueItem.title,
          statementPreview: queueItem.statementPreview,
          statementFingerprint: queueItem.statementFingerprint,
        }),
        {
          primaryKey: queueItem.primaryKey,
        title: String(queueItem.title || "未命名题目"),
        statementPreview: String(queueItem.statementPreview || ""),
        answer: normalizeChoiceAnswerForBank(queueItem.answer || ""),
        keys: Array.isArray(queueItem.keys) ? queueItem.keys : [],
        updatedAt: Date.now(),
        preferred: true,
        source: "local",
        status: queueItem.answer ? "candidate" : "draft",
        category: resolvePreferredQuestionBankCategory(state.problem),
        pageUrl: String(state.problem?.url || location.href || ""),
          questionType: "choice",
          answerText: queueItem.answerText || "",
          optionMapSnapshot: queueItem.optionMapSnapshot || [],
          statementFingerprint: queueItem.statementFingerprint || "",
        });
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.preferred !== b.preferred) {
        return a.preferred ? -1 : 1;
      }
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
  }

  function openQuestionBankReviewModal(items, options = {}) {
    if (state.reviewModalOpen) {
      return;
    }

    state.reviewModalOpen = true;
    let activeTab = options.activeTab === "cloud" ? "cloud" : "mine";
    let selectedCategory = resolvePreferredQuestionBankCategory(state.problem);
    let isSubmittingContribution = false;
    let contributionEmailDraft = String(state.settings.contributionEmail || "").trim();
    const modal = document.createElement("div");
    modal.className = "al-bank-modal";
    modal.setAttribute("data-role", "question-bank-modal");
    modal.innerHTML = `
      <div class="al-bank-modal-card" role="dialog" aria-modal="true" aria-label="题库更正">
        <div class="al-bank-modal-head">
          <div>
            <h3>题库管理</h3>
            <p>“我的题库”可编辑、可贡献；“云端题库”只读查看，用于本地命中。</p>
          </div>
          <button type="button" class="al-bank-modal-close" data-role="bank-close" aria-label="关闭">×</button>
        </div>
        <div class="al-bank-modal-tools">
          <div class="al-bank-modal-tool-buttons">
            <button type="button" data-role="bank-tab-mine">我的题库</button>
            <button type="button" data-role="bank-tab-cloud">云端题库</button>
          </div>
          <div class="al-bank-modal-tool-buttons">
            <button type="button" data-role="bank-export">导出题库</button>
            <button type="button" data-role="bank-import">导入题库</button>
          </div>
          <div class="al-bank-save-indicator" data-role="bank-save-indicator" data-state="idle">支持自动保存</div>
        </div>
        <div class="al-bank-notice" data-role="bank-notice" data-show="false" data-state="info"></div>
        <input type="file" data-role="bank-import-input" accept="application/json,.json" hidden />
        <div data-role="bank-tab-panel"></div>
      </div>
    `;

    const closeModal = () => {
      modal.remove();
      state.reviewModalOpen = false;
      if (state.reviewModalRefresh) {
        state.reviewModalRefresh = null;
      }
    };

    const autoSaveTimers = new Map();
    let saveIndicatorTimer = 0;
    let bankNoticeTimer = 0;
    const saveIndicator = modal.querySelector('[data-role="bank-save-indicator"]');
    const bankNotice = modal.querySelector('[data-role="bank-notice"]');
    const importInput = modal.querySelector('[data-role="bank-import-input"]');
    const tabPanel = modal.querySelector('[data-role="bank-tab-panel"]');
    const toolButtonGroups = Array.from(modal.querySelectorAll(".al-bank-modal-tool-buttons"));

    if (toolButtonGroups[1] instanceof HTMLElement) {
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.setAttribute("data-role", "bank-clear");
      clearButton.textContent = "清空题库";
      toolButtonGroups[1].appendChild(clearButton);
    }

    const setSaveIndicator = (text, stateName = "idle", autoReset = false) => {
      if (!(saveIndicator instanceof HTMLElement)) {
        return;
      }
      saveIndicator.textContent = text;
      saveIndicator.setAttribute("data-state", stateName);
      if (saveIndicatorTimer) {
        window.clearTimeout(saveIndicatorTimer);
        saveIndicatorTimer = 0;
      }
      if (autoReset) {
        saveIndicatorTimer = window.setTimeout(() => {
          if (saveIndicator instanceof HTMLElement) {
            saveIndicator.textContent = "支持自动保存";
            saveIndicator.setAttribute("data-state", "idle");
          }
        }, 1800);
      }
    };

    const setBankNotice = (text, stateName = "info", autoReset = false) => {
      if (!(bankNotice instanceof HTMLElement)) {
        return;
      }
      bankNotice.textContent = String(text || "").trim();
      bankNotice.setAttribute("data-state", stateName);
      bankNotice.setAttribute("data-show", text ? "true" : "false");
      if (bankNoticeTimer) {
        window.clearTimeout(bankNoticeTimer);
        bankNoticeTimer = 0;
      }
      if (autoReset && text) {
        bankNoticeTimer = window.setTimeout(() => {
          if (bankNotice instanceof HTMLElement) {
            bankNotice.textContent = "";
            bankNotice.setAttribute("data-show", "false");
            bankNotice.setAttribute("data-state", "info");
          }
        }, 2600);
      }
    };

    const refreshQuestionBankEditorItems = (options = {}) => {
      items.splice(0, items.length, ...buildQuestionBankEditorItems());
      if (!options.preserveNotice) {
        setBankNotice("", "info");
      }
      renderTabPanel();
      return items;
    };
    state.reviewModalRefresh = refreshQuestionBankEditorItems;

    const clearQuestionBankForTesting = async () => {
      const confirmed = window.confirm(
        "这会清空当前浏览器里的本地题库和待确认记录，但不会清空设置、历史记录或 GitHub 登录状态。确定继续吗？",
      );
      if (!confirmed) {
        return false;
      }

      try {
        state.questionBank = {};
        state.questionBankReviewQueue = [];
        state.lastQuestionBankHit = null;
        state.questionBankLoaded = true;
        await persistQuestionBank();
        refreshQuestionBankEditorItems({ preserveNotice: true });
        setSaveIndicator("本地题库已清空", "saved", true);
        setStatus("本地题库已清空。", {
          hint: "后续题目会重新从 AI 候选结果开始。",
        });
        setBankNotice("本地题库已清空。", "success", true);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSaveIndicator("清空题库失败", "idle", true);
        setStatus(`清空题库失败：${message}`);
        setBankNotice(`清空题库失败：${message}`, "error", true);
        return false;
      }
    };

    const updateEditorItemStatus = async (editorItem, nextStatus) => {
      if (!editorItem || !Array.isArray(editorItem.keys) || editorItem.keys.length === 0) {
        return false;
      }
      const now = Date.now();
      let changed = false;
      const normalizedEditorStatus = normalizeQuestionBankStatus(nextStatus, editorItem.answer || "");
      for (const aliasKey of editorItem.keys) {
        const existing = state.questionBank[aliasKey];
        if (!existing) {
          continue;
        }
        const normalizedStatus = normalizeQuestionBankStatus(
          nextStatus,
          existing.answer || existing.code || existing.finalCode || "",
        );
        if (existing.status === normalizedStatus) {
          continue;
        }
        state.questionBank[aliasKey] = {
          ...existing,
          status: normalizedStatus,
          updatedAt: now,
        };
        changed = true;
      }
      const removedQueue = normalizedEditorStatus === "verified"
        ? removeQuestionBankReviewQueueItem({
            primaryKey: editorItem.primaryKey || editorItem.keys[0] || "",
            statementFingerprint: editorItem.statementFingerprint || "",
            title: editorItem.title || "",
            statementPreview: editorItem.statementPreview || "",
          })
        : false;
      const needsUiSync = editorItem.status !== normalizedEditorStatus || removedQueue;
      if (!changed && !needsUiSync) {
        return false;
      }
      editorItem.status = normalizedEditorStatus;
      if (changed || removedQueue) {
        await persistQuestionBank();
      }
      if (typeof state.reviewModalRefresh === "function") {
        state.reviewModalRefresh({ preserveNotice: true });
      }
      return true;
    };

    const applySingleUpdate = (editorItem, normalizedAnswer) => {
      if (!normalizedAnswer || !Array.isArray(editorItem.keys) || editorItem.keys.length === 0) {
        return false;
      }

      let changed = false;
      const now = Date.now();
      let latestAnswerText = "";

      for (const aliasKey of editorItem.keys) {
        const existing = state.questionBank[aliasKey];
        const previousAnswer = normalizeChoiceAnswerForBank(existing?.answer || existing?.code || "");
        if (previousAnswer === normalizedAnswer) {
          continue;
        }
        const nextOptionSnapshot = normalizeChoiceOptionSnapshot(
          existing?.optionMapSnapshot || editorItem.optionMapSnapshot || [],
        );
        const nextAnswerText = resolveChoiceAnswerTextFromSnapshot(normalizedAnswer, nextOptionSnapshot);
        if (nextAnswerText) {
          latestAnswerText = nextAnswerText;
        }
        state.questionBank[aliasKey] = {
          key: aliasKey,
          promptMode: "choice",
          questionType: "choice",
          title: editorItem.title || existing?.title || "",
          statementPreview: editorItem.statementPreview || existing?.statementPreview || "",
          answer: normalizedAnswer,
          answerLetter: normalizedAnswer,
          code: normalizedAnswer,
          answerText: nextAnswerText || editorItem.answerText || existing?.answerText || "",
          optionMapSnapshot: nextOptionSnapshot,
          summary: existing?.summary || "",
          approach: existing?.approach || "",
          generatedTitle: existing?.generatedTitle || "",
          model: existing?.model || "",
          source: normalizeQuestionBankSource(existing?.source || editorItem.source || "local"),
          status: "verified",
          category:
            normalizeQuestionBankCategory(existing?.category) !== "general"
              ? normalizeQuestionBankCategory(existing?.category)
              : normalizeQuestionBankCategory(editorItem.category),
          pageUrl: String(existing?.pageUrl || editorItem.pageUrl || ""),
          cloudFingerprint: existing?.cloudFingerprint || editorItem.cloudFingerprint || "",
          cloudCategory: existing?.cloudCategory || editorItem.cloudCategory || "",
          cloudStatus: existing?.cloudStatus || editorItem.cloudStatus || "",
          createdAt: existing?.createdAt || now,
          updatedAt: now,
        };
        changed = true;
      }

      for (const queueItem of state.questionBankReviewQueue || []) {
        const intersects = queueItem.keys?.some((key) => editorItem.keys.includes(key));
        if (intersects) {
          queueItem.answer = normalizedAnswer;
          queueItem.answerText = latestAnswerText || queueItem.answerText || "";
        }
      }

      if (changed) {
        editorItem.answer = normalizedAnswer;
        editorItem.answerText = latestAnswerText || editorItem.answerText || "";
        editorItem.status = "verified";
      }
      return changed;
    };

    const persistContributionEmail = async (nextEmail) => {
      const normalizedEmail = String(nextEmail || "").trim();
      if (normalizedEmail === String(state.settings.contributionEmail || "").trim()) {
        return;
      }
      state.settings.contributionEmail = normalizedEmail;
      await storageSet({ contributionEmail: normalizedEmail });
    };

    const saveInputValue = async (input, options = {}) => {
      if (!(input instanceof HTMLInputElement)) {
        return false;
      }
      const index = Number(input.dataset.index);
      if (!Number.isInteger(index) || index < 0 || index >= items.length) {
        return false;
      }
      const editorItem = items[index];
      const normalizedAnswer = normalizeChoiceAnswerForBank(input.value);
      if (!normalizedAnswer) {
        return false;
      }
      input.value = normalizedAnswer;

      const changed = applySingleUpdate(editorItem, normalizedAnswer);
      if (!changed) {
        return false;
      }
      setSaveIndicator("自动保存中...", "saving");
      await persistQuestionBank();
      setSaveIndicator("已自动保存", "saved", true);
      if (!options.silent) {
        setStatus(`已自动保存：${editorItem.title}`);
        setBankNotice(`已自动保存：${editorItem.title}`, "success", true);
      }
      return true;
    };

    const flushAutoSaveTimer = async (input) => {
      const index = Number(input?.dataset?.index);
      if (!Number.isInteger(index)) {
        return;
      }
      const timer = autoSaveTimers.get(index);
      if (timer) {
        window.clearTimeout(timer);
        autoSaveTimers.delete(index);
      }
      await saveInputValue(input, { silent: false });
    };

    const scheduleAutoSave = (input) => {
      const index = Number(input?.dataset?.index);
      if (!Number.isInteger(index)) {
        return;
      }
      const oldTimer = autoSaveTimers.get(index);
      if (oldTimer) {
        window.clearTimeout(oldTimer);
      }
      const timer = window.setTimeout(() => {
        autoSaveTimers.delete(index);
        void saveInputValue(input, { silent: false });
      }, 280);
      autoSaveTimers.set(index, timer);
    };

    const getVisibleItems = () =>
      (Array.isArray(items) ? items : []).filter((item) => {
        const tabMatch = activeTab === "mine" ? item.source !== "cloud" : item.source === "cloud";
        const categoryMatch = normalizeQuestionBankCategory(item.category) === selectedCategory;
        return tabMatch && categoryMatch;
      });

    const renderTabButtons = () => {
      const mineButton = modal.querySelector('[data-role="bank-tab-mine"]');
      const cloudButton = modal.querySelector('[data-role="bank-tab-cloud"]');
      if (mineButton instanceof HTMLElement) {
        mineButton.setAttribute("data-active", activeTab === "mine" ? "true" : "false");
      }
      if (cloudButton instanceof HTMLElement) {
        cloudButton.setAttribute("data-active", activeTab === "cloud" ? "true" : "false");
      }
    };

    const renderTabPanel = () => {
      if (!(tabPanel instanceof HTMLElement)) {
        return;
      }

      const visibleItems = getVisibleItems();
      const isMineTab = activeTab === "mine";
      const contributableCount = visibleItems.filter(
        (item) =>
          item.source === "local" &&
          item.status === "verified" &&
          item.questionType === "choice" &&
          normalizeQuestionBankCategory(item.category) === selectedCategory &&
          !item.cloudDuplicate,
      ).length;
      tabPanel.innerHTML = `
        ${
          isMineTab
            ? `<div class="al-bank-modal-tools">
                <div class="al-bank-modal-contrib-tools">
                  <select data-role="bank-category-select">
                    ${QUESTION_BANK_CATEGORY_DEFS.map(
                      (category) =>
                        `<option value="${category.key}" ${category.key === selectedCategory ? "selected" : ""}>${category.label}</option>`,
                    ).join("")}
                  </select>
                  <div class="al-bank-modal-contrib-actions">
                    <button type="button" class="al-bank-contrib-secondary" data-role="bank-select-all">全选可贡献题</button>
                    <button type="button" class="al-bank-modal-save al-bank-contrib-primary" data-role="bank-submit" ${contributableCount > 0 && !isSubmittingContribution ? "" : "disabled"}>
                      ${isSubmittingContribution ? "提交贡献中..." : "贡献选中题目"}
                    </button>
                  </div>
                </div>
                <div class="al-bank-item-answer">
                  <label for="al-bank-contribution-email">贡献邮箱</label>
                  <input
                    id="al-bank-contribution-email"
                    type="email"
                    data-role="bank-contribution-email"
                    value="${escapeHtml(contributionEmailDraft)}"
                    placeholder="例如 name@example.com"
                    autocomplete="email"
                    ${isSubmittingContribution ? "disabled" : ""}
                  />
                  <p class="al-bank-item-meta">仅用于贡献标记和后续人工发放额度，不做登录验证。</p>
                </div>
                <div class="al-bank-auth-summary">${buildGitHubAuthSummaryHtml()}</div>
              </div>`
            : `<div class="al-bank-empty"><p>云端题库只读展示，会在本地直接参与匹配，不会出现在贡献列表里。</p></div>`
        }
        <div class="al-bank-list">
          ${
            visibleItems.length === 0
              ? `<div class="al-bank-empty"><p>${isMineTab ? `当前分类下还没有${getQuestionBankCategoryLabel(selectedCategory)}题库；先点“生成答案”或导入题库。` : `当前分类下还没有${getQuestionBankCategoryLabel(selectedCategory)}云端题库；可以先点面板里的“下载云端题库”。`}</p></div>`
              : visibleItems
                  .map((item, index) => {
                    const globalIndex = items.indexOf(item);
                    const categoryValue = normalizeQuestionBankCategory(item.category);
                    const cloudDuplicateReason = item.cloudDuplicateReason || (item.cloudDuplicate ? "Already in cloud" : "");
                    const canContribute =
                      isMineTab &&
                      item.source === "local" &&
                      item.status === "verified" &&
                      item.questionType === "choice" &&
                      categoryValue === selectedCategory &&
                      !item.cloudDuplicate;
                    const sourceText =
                      item.source === "cloud" ? "云端同步" : item.source === "imported" ? "手动导入" : "本地提取";
                    const statusText =
                      item.status === "candidate"
                        ? "待确认"
                        : item.status === "verified"
                          ? "已确认"
                          : item.status === "rejected"
                            ? "已弃用"
                            : "待补答案";
                    const cloudStatusText = item.cloudDuplicate
                      ? cloudDuplicateReason
                      : item.cloudStatus === "approved"
                        ? "Cloud synced"
                        : item.cloudStatus === "issue_opened"
                          ? "Waiting for GitHub review"
                          : item.cloudStatus === "issue_created" || item.cloudStatus === "submitted"
                            ? "Issue created"
                            : item.cloudStatus === "duplicate"
                              ? "Possible cloud duplicate"
                              : "Not uploaded";
                    return `
                      <article class="al-bank-item">
                        ${
                          isMineTab
                            ? `<label class="al-bank-item-pick">
                                <input type="checkbox" data-role="bank-pick-input" data-index="${globalIndex}" ${canContribute ? "" : "disabled"} />
                                <span>${canContribute ? "Contribute" : cloudDuplicateReason ? `Unavailable (${escapeHtml(cloudDuplicateReason)})` : "Unavailable"}</span>
                              </label>`
                            : ""
                        }
                        <p class="al-bank-item-title">${index + 1}. ${escapeHtml(item.title)}</p>
                        <p class="al-bank-item-meta">${escapeHtml(item.statementPreview || "题面预览为空。")}</p>
                        <p class="al-bank-item-meta">分类：${escapeHtml(getQuestionBankCategoryLabel(categoryValue))} / 来源：${escapeHtml(sourceText)} / 状态：${escapeHtml(statusText)} / 云端：${escapeHtml(cloudStatusText)}</p>
                        <div class="al-bank-item-answer">
                          <label>答案</label>
                          <input type="text" data-role="bank-answer-input" data-index="${globalIndex}" value="${escapeHtml(item.answer)}" placeholder="例如 A / AC / 对 / 错" ${isMineTab ? "" : "disabled"} />
                        </div>
                        ${
                          isMineTab
                            ? `<div class="al-inline-actions">
                                <button type="button" class="al-link-button" data-role="bank-mark-verified" data-index="${globalIndex}" ${item.status === "verified" ? "disabled" : ""}>设为可用</button>
                                <button type="button" class="al-link-button" data-role="bank-mark-rejected" data-index="${globalIndex}" ${item.status === "rejected" ? "disabled" : ""}>标记错误</button>
                              </div>`
                            : ""
                        }
                      </article>
                    `;
                  })
                  .join("")
          }
        </div>
        <div class="al-bank-modal-actions">
          <button type="button" class="al-bank-modal-cancel" data-role="bank-cancel">关闭</button>
          ${isMineTab && visibleItems.length > 0 ? `<button type="button" class="al-bank-modal-save" data-role="bank-save">手动保存（可选）</button>` : ""}
        </div>
      `;

      const answerInputs = Array.from(tabPanel.querySelectorAll("input[data-role='bank-answer-input']"));
      for (const input of answerInputs) {
        if (!(input instanceof HTMLInputElement) || input.disabled) {
          continue;
        }
        input.addEventListener("input", () => {
          scheduleAutoSave(input);
        });
        input.addEventListener("blur", () => {
          void flushAutoSaveTimer(input);
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void flushAutoSaveTimer(input);
            input.blur();
          }
        });
      }

      const categorySelect = tabPanel.querySelector('[data-role="bank-category-select"]');
      if (categorySelect instanceof HTMLSelectElement) {
        categorySelect.addEventListener("change", () => {
          selectedCategory = normalizeQuestionBankCategory(categorySelect.value);
          renderTabPanel();
        });
      }

      const contributionEmailInput = tabPanel.querySelector('[data-role="bank-contribution-email"]');
      if (contributionEmailInput instanceof HTMLInputElement) {
        contributionEmailInput.addEventListener("input", () => {
          contributionEmailDraft = contributionEmailInput.value.trim();
        });
        contributionEmailInput.addEventListener("blur", () => {
          contributionEmailInput.value = contributionEmailInput.value.trim();
          contributionEmailDraft = contributionEmailInput.value;
        });
      }

      renderTabButtons();
    };

    const onSave = async () => {
      const answerInputs = Array.from(tabPanel.querySelectorAll("input[data-role='bank-answer-input']"));
      let updatedCount = 0;

      setSaveIndicator("保存中...", "saving");
      for (const input of answerInputs) {
        const changed = await saveInputValue(input, { silent: true });
        if (changed) {
          updatedCount += 1;
        }
      }

      if (updatedCount > 0) {
        setStatus(`题库更正已保存，共更新 ${updatedCount} 条记录。`);
        setBankNotice(`题库更正已保存，共更新 ${updatedCount} 条记录。`, "success", true);
        setSaveIndicator(`已保存 ${updatedCount} 条`, "saved", true);
      } else {
        setStatus("当前内容已经是最新，已自动保存。");
        setBankNotice("当前内容已经是最新，已自动保存。", "info", true);
        setSaveIndicator("当前已是最新", "saved", true);
      }
    };

    const exportQuestionBank = async () => {
      await ensureQuestionBankLoaded();
      const rawBank = state.questionBank || {};
      const simplifiedBank = {};
      
      for (const [key, entry] of Object.entries(rawBank)) {
        if (!entry) continue;
        simplifiedBank[key] = {
          title: entry.title || "",
          statementPreview: entry.statementPreview || "",
          answer: entry.answer || entry.code || "",
          source: normalizeQuestionBankSource(entry.source),
          status: normalizeQuestionBankStatus(entry.status, entry.answer || entry.code || ""),
          category: normalizeQuestionBankCategory(entry.category),
          pageUrl: String(entry.pageUrl || ""),
        };
      }
      
      const payload = {
        exportedAt: new Date().toISOString(),
        version: 1,
        questionBank: simplifiedBank,
      };
      const exportedAt = new Date().toISOString().slice(0, 10);
      downloadTextFile(
        `zhituo-question-bank-${exportedAt}.json`,
        JSON.stringify(payload, null, 2),
        "application/json;charset=utf-8",
      );
      setStatus("题库已导出为 JSON。");
      setBankNotice("题库已导出。", "success", true);
    };

    const importQuestionBank = async (file) => {
      if (!(file instanceof File)) {
        return;
      }

      setSaveIndicator("导入中...", "saving");
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const rawQuestionBank =
          parsed && typeof parsed === "object" && parsed.questionBank && typeof parsed.questionBank === "object"
            ? parsed.questionBank
            : parsed;
        const normalized = normalizeQuestionBankMap(rawQuestionBank);
        for (const entry of Object.values(normalized)) {
          entry.source = entry.source === "cloud" ? "cloud" : "imported";
          entry.status = normalizeQuestionBankStatus(entry.status, entry.answer || entry.code || "");
          entry.category = normalizeQuestionBankCategory(entry.category || inferQuestionBankCategory(entry.pageUrl || ""));
        }
        const importedKeys = Object.keys(normalized);
        if (importedKeys.length === 0) {
          throw new Error("导入文件里没有可用的题库数据。");
        }

        state.questionBank = {
          ...state.questionBank,
          ...normalized,
        };
        state.questionBankLoaded = true;
        await persistQuestionBank();
        refreshQuestionBankEditorItems({ preserveNotice: true });
        setStatus(`题库导入成功，共合并 ${importedKeys.length} 条记录。`);
        setBankNotice(`题库已导入 ${importedKeys.length} 条。`, "success", true);
        setSaveIndicator(`已导入 ${importedKeys.length} 条`, "saved", true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`题库导入失败：${message}`);
        setBankNotice(`题库导入失败：${message}`, "error");
        setSaveIndicator("导入失败", "idle", true);
      }
    };

    const submitContributions = async () => {
      const categorySelect = modal.querySelector('[data-role="bank-category-select"]');
      const submitCategory =
        categorySelect instanceof HTMLSelectElement
          ? normalizeQuestionBankCategory(categorySelect.value)
          : normalizeQuestionBankCategory(selectedCategory);
      const pickedInputs = Array.from(tabPanel.querySelectorAll("input[data-role='bank-pick-input']:checked"));
      if (pickedInputs.length === 0) {
        setSaveIndicator("请先勾选题目", "idle", true);
        setStatus("请先勾选要贡献的题目。");
        setBankNotice("请先勾选要贡献的题目。", "info", true);
        return;
      }

      const contributionEmailInput = tabPanel.querySelector('[data-role="bank-contribution-email"]');
      const contributorEmail = String(
        contributionEmailInput instanceof HTMLInputElement
          ? contributionEmailInput.value
          : contributionEmailDraft || state.settings.contributionEmail || "",
      ).trim();
      contributionEmailDraft = contributorEmail;
      let skippedCloudDuplicateCount = 0;
      const entries = pickedInputs
        .map((input) => {
          const index = Number(input.getAttribute("data-index"));
          const item = items[index];
          if (!item) {
            return null;
          }
          if (
            item.source !== "local" ||
            item.status !== "verified" ||
            item.questionType !== "choice" ||
            normalizeQuestionBankCategory(item.category) !== submitCategory
          ) {
            return null;
          }
          const cloudDuplicateState = resolveChoiceCloudDuplicateState(item);
          if (cloudDuplicateState.duplicated) {
            skippedCloudDuplicateCount += 1;
            return null;
          }
          const normalizedStem = String(item.statementPreview || item.title || "").trim();
          const normalizedAnswer = normalizeChoiceAnswerForBank(item.answer || "");
          const optionMapSnapshot = normalizeChoiceOptionSnapshot(item.optionMapSnapshot || []);
          const answerText = normalizeText(
            item.answerText || resolveChoiceAnswerTextFromSnapshot(normalizedAnswer, optionMapSnapshot),
          );
          const statementFingerprint = String(item.statementFingerprint || buildStatementFingerprintFromText(normalizedStem)).trim();
          return {
            clientEntryId: item.id,
            stem: normalizedStem,
            answer: normalizedAnswer,
            fingerprint: String(item.cloudFingerprint || item.fingerprint || statementFingerprint).trim(),
            questionType: "choice",
            statementFingerprint,
            answerText,
            optionMapSnapshot,
            formatStrength: answerText && optionMapSnapshot.length > 0 ? "strong" : "weak",
            contributorEmail,
            sourceMeta: {
              title: item.title,
              category: normalizeQuestionBankCategory(item.category),
              source: "extension-question-bank",
              site: location.hostname || "",
              pageUrl: location.href,
            },
          };
        })
        .filter(Boolean);

      if (entries.length === 0) {
        const duplicateOnly = skippedCloudDuplicateCount > 0;
        setSaveIndicator(duplicateOnly ? "Already in cloud" : "Nothing to submit", "idle", true);
        setStatus(
          duplicateOnly
            ? "All selected questions already exist in the cloud and cannot be contributed again."
            : "The selected questions have nothing to submit.",
        );
        setBankNotice(
          duplicateOnly
            ? "All selected questions already exist in the cloud and cannot be contributed again."
            : "The selected questions have nothing to submit.",
          "info",
          true,
        );
        return;
      }

      if (skippedCloudDuplicateCount > 0) {
        setBankNotice(
          "Skipped " + skippedCloudDuplicateCount + " question(s) already in the cloud; only the remaining items will be submitted.",
          "info",
          true,
        );
      }
      if (!contributorEmail) {
        setBankNotice("未填写贡献邮箱，后续将无法按邮箱人工发放额度。", "info", true);
      }

      isSubmittingContribution = true;
      renderTabPanel();
      setSaveIndicator("提交贡献中...", "saving");
      setBankNotice("提交贡献中...", "saving");
      try {
        const response = await sendMessage({
          type: "autolearning:submit-contribution",
          category: submitCategory,
          entries,
          contributorEmail,
        });
        if (!response?.ok) {
          throw new Error(response?.error || "贡献提交失败");
        }

        const results = Array.isArray(response.result?.results) ? response.result.results : [];
        applyContributionResults(items, results, submitCategory);
        await persistQuestionBank();
        await persistContributionEmail(contributorEmail);
        const openedCount = results.filter(
          (item) => item.status === "issue_opened" || item.status === "issue_created",
        ).length;
        const duplicateCount = results.filter((item) => item.status === "duplicate").length;
        if (response.result?.needsPaste && response.result?.payloadText) {
          try {
            await navigator.clipboard.writeText(String(response.result.payloadText));
          } catch {}
        }
        const usedFallback = Boolean(response.result?.fallbackUsed);
        const summaryText = response.result?.needsPaste
          ? usedFallback
            ? `服务端不可用，已切回手动提交流程：本次整理了 ${openedCount} 条题目，完整 JSON 已复制到剪贴板，请在 GitHub 页面粘贴后提交。`
            : `贡献入口已打开：本次整理了 ${openedCount} 条题目，完整 JSON 已复制到剪贴板，请在 GitHub 页面粘贴后提交。`
          : usedFallback
            ? `服务端不可用，已回退到 GitHub 预填提交流程：本次整理了 ${openedCount} 条题目，重复标记 ${duplicateCount} 条。`
            : `GitHub Issue 已创建：本次整理了 ${openedCount} 条题目，重复标记 ${duplicateCount} 条。`;
        setSaveIndicator(summaryText, "saved", true);
        setStatus(
          response.result?.needsPaste
            ? "服务端不可用，已回退到手动粘贴模式。"
            : usedFallback
              ? "服务端不可用，已打开 GitHub 预填页面，请在新页面确认提交。"
              : "GitHub Issue 已创建并打开，请在新页面确认。",
        );
        setBankNotice(summaryText, "success", true);
        const cleanSummary = `GitHub Issue created and opened. ${openedCount} item(s) included, ${duplicateCount} duplicate(s).`;
        setSaveIndicator(cleanSummary, "saved", true);
        setStatus("GitHub Issue created and opened.");
        setBankNotice(cleanSummary, "success", true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setSaveIndicator("提交失败", "idle", true);
        setStatus(message);
        setBankNotice(`Contribution failed: ${message}`, "error", true);
        setBankNotice(`贡献提交失败：${message}`, "error");
        throw error;
      } finally {
        isSubmittingContribution = false;
        renderTabPanel();
      }
    };

    modal.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.getAttribute("data-role") === "bank-export") {
        void exportQuestionBank();
        return;
      }
      if (target.getAttribute("data-role") === "bank-import") {
        if (importInput instanceof HTMLInputElement) {
          importInput.value = "";
          importInput.click();
        }
        return;
      }
      if (target.getAttribute("data-role") === "bank-clear") {
        void clearQuestionBankForTesting();
        return;
      }
      if (target.getAttribute("data-role") === "bank-close" || target.getAttribute("data-role") === "bank-cancel") {
        closeModal();
        return;
      }
      if (target.getAttribute("data-role") === "bank-tab-mine") {
        activeTab = "mine";
        renderTabPanel();
        return;
      }
      if (target.getAttribute("data-role") === "bank-tab-cloud") {
        activeTab = "cloud";
        renderTabPanel();
        return;
      }
      if (target.getAttribute("data-role") === "bank-save") {
        void onSave();
        return;
      }
      if (target.getAttribute("data-role") === "bank-select-all") {
        const pickInputs = Array.from(tabPanel.querySelectorAll("input[data-role='bank-pick-input']"));
        for (const input of pickInputs) {
          if (input instanceof HTMLInputElement) {
            input.checked = !input.disabled;
          }
        }
        return;
      }
      if (target.getAttribute("data-role") === "bank-submit") {
        void submitContributions().catch((error) => {
          setSaveIndicator("提交失败", "idle", true);
          setStatus(error instanceof Error ? error.message : String(error));
          setBankNotice(`贡献提交失败：${error instanceof Error ? error.message : String(error)}`, "error");
        });
        return;
      }
      if (target.getAttribute("data-role") === "bank-mark-verified") {
        const index = Number(target.getAttribute("data-index"));
        const editorItem = items[index];
        if (!editorItem) {
          return;
        }
        void updateEditorItemStatus(editorItem, "verified").then((changed) => {
          if (!changed) {
            return;
          }
          renderTabPanel();
          setStatus(`已将“${editorItem.title}”设为当前可用答案。`);
          setBankNotice(`已将“${editorItem.title}”设为当前可用答案。`, "success", true);
          setSaveIndicator("状态已更新", "saved", true);
        });
        return;
      }
      if (target.getAttribute("data-role") === "bank-mark-rejected") {
        const index = Number(target.getAttribute("data-index"));
        const editorItem = items[index];
        if (!editorItem) {
          return;
        }
        void updateEditorItemStatus(editorItem, "rejected").then((changed) => {
          if (!changed) {
            return;
          }
          renderTabPanel();
          setStatus(`已将“${editorItem.title}”标记为错误，不再参与命中。`);
          setBankNotice(`已将“${editorItem.title}”标记为错误，不再参与命中。`, "success", true);
          setSaveIndicator("状态已更新", "saved", true);
        });
      }
    });

    if (importInput instanceof HTMLInputElement) {
      importInput.addEventListener("change", () => {
        const file = importInput.files?.[0];
        if (file) {
          void importQuestionBank(file);
        }
      });
    }

    renderTabPanel();
    document.documentElement.appendChild(modal);
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "未知时间";
    }

    return date.toLocaleString("zh-CN", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(normalizeRuntimeErrorMessage(chrome.runtime.lastError.message)));
          return;
        }
        resolve(response);
      });
    });
  }

  function storageSet(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(normalizeRuntimeErrorMessage(chrome.runtime.lastError.message)));
          return;
        }
        resolve();
      });
    });
  }

  function storageGet(defaults) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(defaults, (items) => {
        if (chrome.runtime.lastError) {
          reject(new Error(normalizeRuntimeErrorMessage(chrome.runtime.lastError.message)));
          return;
        }
        resolve(items);
      });
    });
  }

  function normalizeRuntimeErrorMessage(message) {
    const text = String(message || "");
    if (/Extension context invalidated/i.test(text)) {
      return "插件刚刚被重新加载或更新了，请刷新当前题目页面后再试。";
    }
    return text || "插件通信失败，请刷新页面后重试。";
  }

  function installBridge() {
    if (document.querySelector('script[data-autolearning-bridge="true"]')) {
      return;
    }

    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("page-bridge.js");
    script.dataset.autolearningBridge = "true";
    script.async = false;
    script.addEventListener("load", () => {
      script.remove();
    });
    (document.head || document.documentElement).appendChild(script);
  }

  function callPageBridge(type, payload) {
    return new Promise((resolve) => {
      const requestId = `autolearning-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let settled = false;
      let timeoutId = 0;

      const onResponse = (event) => {
        const detail = event.detail || {};
        if (settled || detail.requestId !== requestId) {
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        window.removeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
        resolve(detail.response);
      };

      window.addEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
      window.dispatchEvent(
        new CustomEvent(BRIDGE_REQUEST_EVENT, {
          detail: {
            requestId,
            type,
            payload,
          },
        }),
      );

      timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        window.removeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
        resolve({ ok: false, error: "bridge timeout" });
      }, 1200);
    });
  }
})();
