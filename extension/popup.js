const STORAGE_KEYS = {
  USER_ID: "wm_user_id",
  API_BASE_URL: "wm_api_base_url",
  LAST_RUN: "wm_last_run",
  PENDING_FEEDBACK: "wm_pending_feedback",
  CHAT_HISTORY: "wm_chat_history",
};

const DEFAULT_API_BASE_URL = "http://localhost:3000";
const WINDOW_DAYS = 90;
const MAX_HISTORY_RESULTS = 100000;
const FEEDBACK_TIMEOUT_MS = 6000;
const CHAT_TIMEOUT_MS = 25000;
const GENERATE_TIMEOUT_MS = 120000;
const HISTORY_CACHE_WINDOW_MS = 3 * 60 * 1000;
const FINAL_SYNC_MAX_WAIT_MS = 1800;
const MAX_CARDS_PER_RUN = 10;

const elements = {
  generateButton: document.getElementById("generateButton"),
  status: document.getElementById("status"),
  progressFill: document.getElementById("progressFill"),
  cardBadge: document.getElementById("cardBadge"),
  assumptionTitle: document.getElementById("assumptionTitle"),
  assumptionReason: document.getElementById("assumptionReason"),
  evidenceList: document.getElementById("evidenceList"),
  disagreeButton: document.getElementById("disagreeButton"),
  agreeButton: document.getElementById("agreeButton"),
  cardCounter: document.getElementById("cardCounter"),
  runMeta: document.getElementById("runMeta"),
  prevButton: document.getElementById("prevButton"),
  nextButton: document.getElementById("nextButton"),
  toggleChatButton: document.getElementById("toggleChatButton"),
  chatPanel: document.getElementById("chatPanel"),
  chatMessages: document.getElementById("chatMessages"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  chatSendButton: document.getElementById("chatSendButton"),
};

let userId = null;
let apiBaseUrl = DEFAULT_API_BASE_URL;
let currentRun = null;
let busy = false;
let chatOpen = false;
let chatHistory = [];
let feedbackSyncPromise = null;
let autoRegenerateInFlight = false;
let historyCache = null;
let queueLock = Promise.resolve();
let voteActionInFlight = false;

function setStatus(message) {
  elements.status.textContent = message;
}

function setProgress(percent) {
  const safe = Math.max(0, Math.min(100, percent));
  elements.progressFill.style.width = `${safe}%`;
}

function setBusy(isBusy) {
  busy = isBusy;
  elements.generateButton.disabled = isBusy;
  elements.chatSendButton.disabled = isBusy;

  const disableVotes =
    isBusy ||
    !currentRun ||
    !Array.isArray(currentRun.assumptions) ||
    currentRun.assumptions.length === 0;

  elements.disagreeButton.disabled = disableVotes;
  elements.agreeButton.disabled = disableVotes;
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result));
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    chrome.storage.local.set(values, () => resolve());
  });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function getOrCreateUserId() {
  const data = await storageGet([STORAGE_KEYS.USER_ID]);
  const existing = data[STORAGE_KEYS.USER_ID];

  if (typeof existing === "string" && existing.length > 0) {
    return existing;
  }

  const generated = crypto.randomUUID();
  await storageSet({ [STORAGE_KEYS.USER_ID]: generated });
  return generated;
}

async function getApiBaseUrl() {
  const data = await storageGet([STORAGE_KEYS.API_BASE_URL]);
  const configured = data[STORAGE_KEYS.API_BASE_URL];

  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.trim().replace(/\/$/, "");
  }

  return DEFAULT_API_BASE_URL;
}

async function getPendingFeedbackQueue() {
  const data = await storageGet([STORAGE_KEYS.PENDING_FEEDBACK]);
  const queue = data[STORAGE_KEYS.PENDING_FEEDBACK];

  if (!Array.isArray(queue)) {
    return [];
  }

  return queue.filter(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      typeof entry.userId === "string" &&
      typeof entry.runId === "string" &&
      Array.isArray(entry.feedback)
  );
}

async function savePendingFeedbackQueue(queue) {
  await storageSet({ [STORAGE_KEYS.PENDING_FEEDBACK]: queue });
}

function withQueueLock(task) {
  const next = queueLock.then(task, task);
  queueLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function mergeFeedbackEntries(existingEntries, incomingEntries) {
  const merged = new Map();

  for (const entry of existingEntries) {
    merged.set(entry.assumptionId, entry.vote);
  }

  for (const entry of incomingEntries) {
    merged.set(entry.assumptionId, entry.vote);
  }

  return Array.from(merged.entries()).map(([assumptionId, vote]) => ({
    assumptionId,
    vote,
  }));
}

async function queueFeedback(userIdValue, runId, entries) {
  await withQueueLock(async () => {
    const queue = await getPendingFeedbackQueue();
    const existing = queue.find(
      (item) => item.userId === userIdValue && item.runId === runId
    );

    if (!existing) {
      queue.push({
        userId: userIdValue,
        runId,
        feedback: entries,
      });
    } else {
      existing.feedback = mergeFeedbackEntries(existing.feedback, entries);
    }

    await savePendingFeedbackQueue(queue);
  });
}

async function dequeuePendingFeedbackBatch() {
  return withQueueLock(async () => {
    const queue = await getPendingFeedbackQueue();
    if (queue.length === 0) {
      return null;
    }

    const [nextBatch, ...rest] = queue;
    await savePendingFeedbackQueue(rest);
    return nextBatch;
  });
}

async function requeuePendingFeedbackBatch(batch) {
  await withQueueLock(async () => {
    const queue = await getPendingFeedbackQueue();
    const existing = queue.find(
      (item) => item.userId === batch.userId && item.runId === batch.runId
    );

    if (!existing) {
      queue.unshift(batch);
    } else {
      existing.feedback = mergeFeedbackEntries(existing.feedback, batch.feedback);
    }

    await savePendingFeedbackQueue(queue);
  });
}

async function flushPendingFeedbackQueue() {
  let fullySynced = true;

  while (true) {
    const batch = await dequeuePendingFeedbackBatch();
    if (!batch) {
      break;
    }

    try {
      await sendFeedback(batch.userId, batch.runId, batch.feedback, true);
    } catch {
      await requeuePendingFeedbackBatch(batch);
      fullySynced = false;
      break;
    }
  }

  return fullySynced;
}

async function syncPendingFeedbackInBackground() {
  if (feedbackSyncPromise) {
    return feedbackSyncPromise;
  }

  feedbackSyncPromise = (async () => {
    try {
      return await flushPendingFeedbackQueue();
    } finally {
      feedbackSyncPromise = null;
    }
  })();

  return feedbackSyncPromise;
}

function normalizeRun(run) {
  if (!run || typeof run !== "object" || !Array.isArray(run.assumptions)) {
    return null;
  }

  const assumptions = run.assumptions.filter(
    (item) => item && typeof item === "object" && typeof item.id === "string"
  ).slice(0, MAX_CARDS_PER_RUN);

  if (assumptions.length === 0) {
    return null;
  }

  const maxIndex = assumptions.length - 1;
  const requestedIndex =
    typeof run.currentIndex === "number" && Number.isFinite(run.currentIndex)
      ? Math.floor(run.currentIndex)
      : 0;

  return {
    runId: typeof run.runId === "string" ? run.runId : crypto.randomUUID(),
    generatedAt:
      typeof run.generatedAt === "string" ? run.generatedAt : new Date().toISOString(),
    assumptions,
    votes: run.votes && typeof run.votes === "object" ? run.votes : {},
    currentIndex: Math.max(0, Math.min(maxIndex, requestedIndex)),
  };
}

async function saveLastRun() {
  if (!currentRun) return;
  await storageSet({ [STORAGE_KEYS.LAST_RUN]: currentRun });
}

async function loadLastRun() {
  const data = await storageGet([STORAGE_KEYS.LAST_RUN]);
  return normalizeRun(data[STORAGE_KEYS.LAST_RUN]);
}

async function loadChatHistory() {
  const data = await storageGet([STORAGE_KEYS.CHAT_HISTORY]);
  const raw = data[STORAGE_KEYS.CHAT_HISTORY];
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry.role === "user" || entry.role === "assistant") &&
        typeof entry.content === "string"
    )
    .slice(-40);
}

async function saveChatHistory() {
  await storageSet({ [STORAGE_KEYS.CHAT_HISTORY]: chatHistory.slice(-40) });
}

function getAnsweredCount(run) {
  if (!run || !Array.isArray(run.assumptions)) return 0;

  return run.assumptions.reduce((count, assumption) => {
    const vote = run.votes?.[assumption.id];
    return vote === "agree" || vote === "disagree" ? count + 1 : count;
  }, 0);
}

function allCardsVoted() {
  if (!currentRun || !Array.isArray(currentRun.assumptions)) {
    return false;
  }

  return currentRun.assumptions.every((assumption) => {
    const vote = currentRun.votes?.[assumption.id];
    return vote === "agree" || vote === "disagree";
  });
}

function setVoteButtons(activeVote) {
  elements.disagreeButton.classList.toggle("active", activeVote === "disagree");
  elements.agreeButton.classList.toggle("active", activeVote === "agree");
}

function renderEvidenceList(evidence) {
  elements.evidenceList.innerHTML = "";

  if (!Array.isArray(evidence) || evidence.length === 0) {
    const empty = document.createElement("li");
    empty.innerHTML = '<span class="evidence-signal">No evidence available.</span>';
    elements.evidenceList.append(empty);
    return;
  }

  evidence.slice(0, 2).forEach((entry) => {
    const item = document.createElement("li");

    const signal = document.createElement("span");
    signal.className = "evidence-signal";
    signal.textContent = entry.signal || "Signal";

    const source = document.createElement("span");
    source.className = "evidence-source";
    source.textContent = entry.source || "unknown source";

    item.append(signal, source);
    elements.evidenceList.append(item);
  });
}

function renderEmptyCard() {
  elements.cardBadge.textContent = "assumption";
  elements.assumptionTitle.textContent = "Click Generate to start profiling";
  elements.assumptionReason.textContent =
    "Tastemaker will analyze your last 90 days and create wild assumptions.";
  elements.evidenceList.innerHTML = "";
  elements.cardCounter.textContent = "Card 0/0";
  elements.runMeta.textContent = "";
  setVoteButtons(null);
  setProgress(0);
  elements.prevButton.disabled = true;
  elements.nextButton.disabled = true;
  elements.disagreeButton.disabled = true;
  elements.agreeButton.disabled = true;
}

function renderCurrentCard() {
  if (!currentRun || !Array.isArray(currentRun.assumptions) || currentRun.assumptions.length === 0) {
    renderEmptyCard();
    return;
  }

  const assumption = currentRun.assumptions[currentRun.currentIndex];
  if (!assumption) {
    renderEmptyCard();
    return;
  }

  const badge = Array.isArray(assumption.tags) && assumption.tags[0]
    ? String(assumption.tags[0]).replace(/_/g, " ")
    : "assumption";

  elements.cardBadge.textContent = badge;
  elements.assumptionTitle.textContent = assumption.assumption || "Untitled assumption";
  elements.assumptionReason.textContent = assumption.reason || "No reason provided.";
  renderEvidenceList(assumption.evidence);

  const total = currentRun.assumptions.length;
  const answered = getAnsweredCount(currentRun);
  const progress = total > 0 ? (answered / total) * 100 : 0;

  elements.cardCounter.textContent = `Card ${currentRun.currentIndex + 1}/${total}`;
  elements.runMeta.textContent = `Run ${currentRun.runId.slice(0, 8)} • ${answered}/${total} rated`;
  setProgress(progress);

  setVoteButtons(currentRun.votes?.[assumption.id]);

  elements.prevButton.disabled = busy || currentRun.currentIndex === 0;
  elements.nextButton.disabled = busy || currentRun.currentIndex >= total - 1;
  elements.disagreeButton.disabled = busy;
  elements.agreeButton.disabled = busy;
}

function renderChatMessages() {
  elements.chatMessages.innerHTML = "";

  if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
    const starter = document.createElement("div");
    starter.className = "chat-message assistant";
    starter.textContent = "Ask anything about your assumptions or pattern.";
    elements.chatMessages.append(starter);
    return;
  }

  for (const message of chatHistory) {
    const bubble = document.createElement("div");
    bubble.className = `chat-message ${message.role}`;
    bubble.textContent = message.content;
    elements.chatMessages.append(bubble);
  }

  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function renderChatPanelState() {
  elements.chatPanel.classList.toggle("hidden", !chatOpen);
  elements.toggleChatButton.textContent = chatOpen
    ? "Hide Chat"
    : "Open Chat (Optional)";
}

function getCurrentAssumption() {
  if (!currentRun || !Array.isArray(currentRun.assumptions)) {
    return null;
  }

  return currentRun.assumptions[currentRun.currentIndex] || null;
}

async function collectLast90DaysHistory() {
  const startTime = Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const items = await new Promise((resolve, reject) => {
    chrome.history.search(
      {
        text: "",
        startTime,
        maxResults: MAX_HISTORY_RESULTS,
      },
      (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(Array.isArray(results) ? results : []);
      }
    );
  });

  return items
    .map((item) => ({
      url: typeof item.url === "string" ? item.url : "",
      title: typeof item.title === "string" ? item.title : "",
      lastVisitTime:
        typeof item.lastVisitTime === "number" ? item.lastVisitTime : Date.now(),
      visitCount: typeof item.visitCount === "number" ? item.visitCount : 1,
    }))
    .filter((item) => item.url.length > 0);
}

async function getHistoryForGeneration(auto = false) {
  if (
    auto &&
    historyCache &&
    Array.isArray(historyCache.items) &&
    Date.now() - historyCache.collectedAt < HISTORY_CACHE_WINDOW_MS
  ) {
    return historyCache.items;
  }

  const items = await collectLast90DaysHistory();
  historyCache = {
    collectedAt: Date.now(),
    items,
  };
  return items;
}

async function sendFeedback(userIdValue, runId, feedbackEntries, silent = false) {
  if (!feedbackEntries || feedbackEntries.length === 0) {
    return;
  }

  const response = await fetchWithTimeout(
    `${apiBaseUrl}/api/assumptions/feedback`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userIdValue,
        runId,
        feedback: feedbackEntries,
      }),
    },
    FEEDBACK_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const details =
      errorBody && typeof errorBody === "object"
        ? errorBody.details || errorBody.error
        : "";
    throw new Error(
      `Feedback request failed (${response.status})${details ? `: ${details}` : ""}`
    );
  }

  if (!silent) {
    setStatus("Feedback saved.");
  }
}

async function sendChatMessage(message) {
  const response = await fetchWithTimeout(
    `${apiBaseUrl}/api/assumptions/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        message,
        runId: currentRun?.runId,
      }),
    },
    CHAT_TIMEOUT_MS
  );

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const details =
      errorBody && typeof errorBody === "object"
        ? errorBody.details || errorBody.error
        : "";
    throw new Error(
      `Chat request failed (${response.status})${details ? `: ${details}` : ""}`
    );
  }

  const payload = await response.json();
  if (!payload || typeof payload.reply !== "string") {
    throw new Error("Chat API returned invalid response");
  }

  return payload.reply;
}

async function flushCurrentRunVotes() {
  if (!currentRun) {
    return {
      fullySynced: true,
      timedOut: false,
    };
  }

  const entries = Object.entries(currentRun.votes || {})
    .filter(([, vote]) => vote === "agree" || vote === "disagree")
    .map(([assumptionId, vote]) => ({ assumptionId, vote }));

  if (entries.length === 0) {
    return {
      fullySynced: true,
      timedOut: false,
    };
  }

  await queueFeedback(userId, currentRun.runId, entries);

  const syncPromise = syncPendingFeedbackInBackground();
  const result = await Promise.race([
    syncPromise.then((fullySynced) => ({
      fullySynced,
      timedOut: false,
    })),
    new Promise((resolve) => {
      setTimeout(
        () =>
          resolve({
            fullySynced: false,
            timedOut: true,
          }),
        FINAL_SYNC_MAX_WAIT_MS
      );
    }),
  ]);

  return result;
}

async function maybeStartNextPhase() {
  if (!currentRun || busy || autoRegenerateInFlight || !allCardsVoted()) {
    return false;
  }

  autoRegenerateInFlight = true;
  setBusy(true);
  setStatus("Phase complete. Preparing next assumptions...");
  renderCurrentCard();

  try {
    const syncResult = await flushCurrentRunVotes();

    if (syncResult.timedOut) {
      setStatus("Starting next phase while feedback continues syncing...");
    } else if (!syncResult.fullySynced) {
      setStatus("Starting next phase. Some feedback will sync shortly.");
    } else {
      setStatus("Feedback synced. Starting next phase...");
    }

    await generateAssumptions({ auto: true });
    return true;
  } finally {
    autoRegenerateInFlight = false;
  }
}

async function handleVote(vote) {
  if (!currentRun || busy || voteActionInFlight) {
    return;
  }

  voteActionInFlight = true;
  const assumption = getCurrentAssumption();
  if (!assumption) {
    voteActionInFlight = false;
    return;
  }

  try {
    currentRun.votes = currentRun.votes || {};
    currentRun.votes[assumption.id] = vote;
    await queueFeedback(userId, currentRun.runId, [
      {
        assumptionId: assumption.id,
        vote,
      },
    ]);
    void saveLastRun();

    if (currentRun.currentIndex < currentRun.assumptions.length - 1) {
      currentRun.currentIndex += 1;
      void saveLastRun();
    }

    renderCurrentCard();
    setStatus("Answer saved. Syncing in background...");
    void syncPendingFeedbackInBackground();
    await maybeStartNextPhase();
  } finally {
    voteActionInFlight = false;
  }
}

async function generateAssumptions(options = {}) {
  const auto = options && options.auto === true;
  setBusy(true);
  setStatus(
    auto
      ? "Refreshing with a new assumption stack..."
      : "Collecting last 90 days of history..."
  );

  try {
    const history = await getHistoryForGeneration(auto);

    if (history.length === 0) {
      setStatus("No history found for the last 90 days.");
      renderEmptyCard();
      return;
    }

    setStatus(`Generating from ${history.length} history events...`);

    const response = await fetchWithTimeout(
      `${apiBaseUrl}/api/assumptions/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          windowDays: WINDOW_DAYS,
          history,
          clientContext: {
            source: "chrome_extension_popup",
            extensionVersion: chrome.runtime.getManifest().version,
          },
        }),
      },
      GENERATE_TIMEOUT_MS
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const details =
        errorBody && typeof errorBody === "object"
          ? errorBody.details || errorBody.error
          : "";
      throw new Error(
        `Generate request failed (${response.status})${details ? `: ${details}` : ""}`
      );
    }

    const payload = await response.json();

    if (!payload || !Array.isArray(payload.assumptions) || payload.assumptions.length === 0) {
      throw new Error("API returned empty assumptions payload");
    }

    const normalizedRun = normalizeRun({
      runId: payload.runId,
      generatedAt: payload.generatedAt,
      assumptions: payload.assumptions,
      votes: {},
      currentIndex: 0,
    });

    if (!normalizedRun) {
      throw new Error("Generated assumptions payload was invalid");
    }

    currentRun = normalizedRun;

    await saveLastRun();
    void syncPendingFeedbackInBackground();

    setStatus(auto ? "New stack ready. Keep rating." : "Wild assumptions ready. Rate each card.");
    renderCurrentCard();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setStatus(`Error: ${message}`);
    renderCurrentCard();
  } finally {
    setBusy(false);
    renderCurrentCard();
  }
}

async function moveCard(direction) {
  if (!currentRun || busy) {
    return;
  }

  const nextIndex = currentRun.currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= currentRun.assumptions.length) {
    return;
  }

  currentRun.currentIndex = nextIndex;
  await saveLastRun();
  renderCurrentCard();
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const message = elements.chatInput.value.trim();
  if (!message) {
    return;
  }

  elements.chatInput.value = "";
  elements.chatSendButton.disabled = true;

  chatHistory.push({ role: "user", content: message });
  renderChatMessages();
  await saveChatHistory();

  try {
    const reply = await sendChatMessage(message);
    chatHistory.push({ role: "assistant", content: reply });
    renderChatMessages();
    await saveChatHistory();
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    chatHistory.push({
      role: "assistant",
      content: `Could not reach chat endpoint: ${reason}`,
    });
    renderChatMessages();
    await saveChatHistory();
  } finally {
    elements.chatSendButton.disabled = false;
  }
}

async function initializePopup() {
  setBusy(true);
  setStatus("Booting extension...");

  try {
    userId = await getOrCreateUserId();
    apiBaseUrl = await getApiBaseUrl();
    chatHistory = await loadChatHistory();
    renderChatMessages();
    renderChatPanelState();

    void syncPendingFeedbackInBackground();

    const cachedRun = await loadLastRun();
    if (cachedRun) {
      currentRun = cachedRun;
      setStatus("Loaded cached card stack. Click Generate for fresh assumptions.");
      renderCurrentCard();
    } else {
      renderEmptyCard();
      setStatus("Ready. Click Generate.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    renderEmptyCard();
    setStatus(`Initialization failed: ${message}`);
  } finally {
    setBusy(false);
    renderCurrentCard();
    void maybeStartNextPhase();
  }
}

elements.generateButton.addEventListener("click", () => {
  generateAssumptions();
});

elements.disagreeButton.addEventListener("click", () => {
  handleVote("disagree");
});

elements.agreeButton.addEventListener("click", () => {
  handleVote("agree");
});

elements.prevButton.addEventListener("click", () => {
  moveCard(-1);
});

elements.nextButton.addEventListener("click", () => {
  moveCard(1);
});

elements.toggleChatButton.addEventListener("click", () => {
  chatOpen = !chatOpen;
  renderChatPanelState();
});

elements.chatForm.addEventListener("submit", (event) => {
  handleChatSubmit(event);
});

initializePopup();
