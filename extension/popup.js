const STORAGE_KEYS = {
  USER_ID: "wm_user_id",
  API_BASE_URL: "wm_api_base_url",
  LAST_SESSION: "wm_last_run",
  PENDING_FEEDBACK: "wm_pending_feedback",
  CHAT_HISTORY: "wm_chat_history",
};

const DEFAULT_API_BASE_URL = "http://localhost:3000";
const WINDOW_DAYS = 90;
const INITIAL_BATCH_SIZE = 10;
const PREFETCH_BATCH_SIZE = 5;
const PREFETCH_THRESHOLD = 5;
const MAX_HISTORY_RESULTS = 100000;
const FEEDBACK_TIMEOUT_MS = 6000;
const CHAT_TIMEOUT_MS = 25000;
const GENERATE_TIMEOUT_MS = 120000;
const HISTORY_CACHE_WINDOW_MS = 3 * 60 * 1000;
const PREFETCH_READY_RESET_MS = 2200;

const elements = {
  progressTrack: document.getElementById("progressTrack"),
  introScreen: document.getElementById("introScreen"),
  introStatus: document.getElementById("introStatus"),
  introGenerateButton: document.getElementById("introGenerateButton"),
  experienceShell: document.getElementById("experienceShell"),
  assumptionsPage: document.getElementById("assumptionsPage"),
  chatPage: document.getElementById("chatPage"),
  generateButton: document.getElementById("generateButton"),
  status: document.getElementById("status"),
  queueSummary: document.getElementById("queueSummary"),
  activityChips: document.getElementById("activityChips"),
  progressFill: document.getElementById("progressFill"),
  prefetchRetryButton: document.getElementById("prefetchRetryButton"),
  cardShell: document.getElementById("cardShell"),
  cardSkeleton: document.getElementById("cardSkeleton"),
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
  backToCardsButton: document.getElementById("backToCardsButton"),
  chatMessages: document.getElementById("chatMessages"),
  chatForm: document.getElementById("chatForm"),
  chatInput: document.getElementById("chatInput"),
  chatSendButton: document.getElementById("chatSendButton"),
};

let userId = null;
let apiBaseUrl = DEFAULT_API_BASE_URL;
let currentSession = null;
let activePage = "assumptions";
let chatHistory = [];
let historyCache = null;
let queueLock = Promise.resolve();
let feedbackSyncPromise = null;
let feedbackSyncState = "idle";
let feedbackSyncError = "";
let voteActionInFlight = false;
let manualGenerationInFlight = false;
let manualGenerationPhase = "idle";
let chatThinking = false;
let initializationInFlight = false;
let primaryStatusMessage = "";
let showSkeletonCard = false;
let activeSessionToken = 0;
let requestTokenCounter = 0;
let activeManualRequestToken = 0;
let activePrefetchRequestToken = 0;
let prefetchReadyTimer = null;

function setPrimaryStatus(message) {
  primaryStatusMessage = message;
  renderStatusRail();
}

function setProgress(percent) {
  const safe = Math.max(0, Math.min(100, percent));
  elements.progressFill.style.width = `${safe}%`;
}

function shouldShowIntroScreen() {
  return !currentSession && !manualGenerationInFlight;
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

function normalizeAssumptionText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getVoteKey(card) {
  return `${card.runId}:${card.id}`;
}

function isStoredVote(value) {
  return value === "agree" || value === "disagree";
}

function normalizeEvidenceEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const signal = typeof entry.signal === "string" ? entry.signal.trim() : "";
  const source = typeof entry.source === "string" ? entry.source.trim() : "";
  const eventId = typeof entry.eventId === "string" ? entry.eventId.trim() : undefined;

  if (!signal || !source) {
    return null;
  }

  return {
    signal,
    source,
    eventId,
  };
}

function normalizeQueuedCard(card, fallbackRunId, fallbackGeneratedAt) {
  if (!card || typeof card !== "object") {
    return null;
  }

  const id = typeof card.id === "string" ? card.id.trim() : "";
  const assumption = typeof card.assumption === "string" ? card.assumption.trim() : "";
  const reason = typeof card.reason === "string" ? card.reason.trim() : "";

  if (!id || !assumption || !reason) {
    return null;
  }

  const evidence = Array.isArray(card.evidence)
    ? card.evidence.map(normalizeEvidenceEntry).filter(Boolean).slice(0, 2)
    : [];

  return {
    id,
    runId:
      typeof card.runId === "string" && card.runId.trim().length > 0
        ? card.runId.trim()
        : fallbackRunId,
    generatedAt:
      typeof card.generatedAt === "string" && card.generatedAt.trim().length > 0
        ? card.generatedAt
        : fallbackGeneratedAt,
    assumption,
    reason,
    evidence,
    confidence:
      typeof card.confidence === "number" && Number.isFinite(card.confidence)
        ? Math.max(0, Math.min(1, card.confidence))
        : 0.5,
    tags: Array.isArray(card.tags)
      ? Array.from(
          new Set(
            card.tags
              .map((tag) => (typeof tag === "string" ? tag.trim().toLowerCase() : ""))
              .filter((tag) => tag.length > 0)
          )
        ).slice(0, 6)
      : [],
  };
}

function buildSessionFromLegacyRun(run) {
  if (!run || typeof run !== "object" || !Array.isArray(run.assumptions)) {
    return null;
  }

  const runId = typeof run.runId === "string" ? run.runId : crypto.randomUUID();
  const generatedAt =
    typeof run.generatedAt === "string" ? run.generatedAt : new Date().toISOString();
  const cards = run.assumptions
    .map((card) => normalizeQueuedCard(card, runId, generatedAt))
    .filter(Boolean);

  if (cards.length === 0) {
    return null;
  }

  const votes = {};
  for (const card of cards) {
    const legacyVote = run.votes && typeof run.votes === "object" ? run.votes[card.id] : null;
    if (isStoredVote(legacyVote)) {
      votes[getVoteKey(card)] = legacyVote;
    }
  }

  const requestedCursor =
    typeof run.currentIndex === "number" && Number.isFinite(run.currentIndex)
      ? Math.floor(run.currentIndex)
      : 0;

  return {
    sessionId: crypto.randomUUID(),
    createdAt: generatedAt,
    updatedAt: new Date().toISOString(),
    cursor: Math.max(0, Math.min(cards.length - 1, requestedCursor)),
    cards,
    votes,
    prefetchState: "idle",
    prefetchError: "",
  };
}

function normalizeSession(rawSession) {
  if (!rawSession || typeof rawSession !== "object") {
    return null;
  }

  if (Array.isArray(rawSession.assumptions)) {
    return buildSessionFromLegacyRun(rawSession);
  }

  if (!Array.isArray(rawSession.cards)) {
    return null;
  }

  const sessionId =
    typeof rawSession.sessionId === "string" && rawSession.sessionId.trim().length > 0
      ? rawSession.sessionId
      : crypto.randomUUID();

  const cards = rawSession.cards
    .map((card) =>
      normalizeQueuedCard(
        card,
        typeof card?.runId === "string" ? card.runId : crypto.randomUUID(),
        typeof card?.generatedAt === "string" ? card.generatedAt : new Date().toISOString()
      )
    )
    .filter(Boolean);

  if (cards.length === 0) {
    return null;
  }

  const requestedCursor =
    typeof rawSession.cursor === "number" && Number.isFinite(rawSession.cursor)
      ? Math.floor(rawSession.cursor)
      : 0;

  const votes = {};
  if (rawSession.votes && typeof rawSession.votes === "object") {
    for (const [key, value] of Object.entries(rawSession.votes)) {
      if (typeof key === "string" && isStoredVote(value)) {
        votes[key] = value;
      }
    }
  }

  const prefetchState =
    rawSession.prefetchState === "error" || rawSession.prefetchState === "ready"
      ? rawSession.prefetchState
      : "idle";

  return {
    sessionId,
    createdAt:
      typeof rawSession.createdAt === "string"
        ? rawSession.createdAt
        : cards[0].generatedAt,
    updatedAt:
      typeof rawSession.updatedAt === "string"
        ? rawSession.updatedAt
        : new Date().toISOString(),
    cursor: Math.max(0, Math.min(cards.length - 1, requestedCursor)),
    cards,
    votes,
    prefetchState,
    prefetchError:
      prefetchState === "error" && typeof rawSession.prefetchError === "string"
        ? rawSession.prefetchError
        : "",
  };
}

function serializeSession(session) {
  if (!session) {
    return null;
  }

  return {
    ...session,
    prefetchState: session.prefetchState === "loading" ? "idle" : session.prefetchState,
  };
}

async function saveLastSession() {
  if (!currentSession) {
    await storageSet({ [STORAGE_KEYS.LAST_SESSION]: null });
    return;
  }

  await storageSet({
    [STORAGE_KEYS.LAST_SESSION]: serializeSession(currentSession),
  });
}

async function loadLastSession() {
  const data = await storageGet([STORAGE_KEYS.LAST_SESSION]);
  return normalizeSession(data[STORAGE_KEYS.LAST_SESSION]);
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

function getCurrentCard() {
  if (!currentSession || !Array.isArray(currentSession.cards) || currentSession.cards.length === 0) {
    return null;
  }

  return currentSession.cards[currentSession.cursor] || null;
}

function getRatedCount(session) {
  if (!session || !Array.isArray(session.cards)) {
    return 0;
  }

  return session.cards.reduce((count, card) => {
    const vote = session.votes?.[getVoteKey(card)];
    return isStoredVote(vote) ? count + 1 : count;
  }, 0);
}

function getRemainingCount(session) {
  if (!session || !Array.isArray(session.cards)) {
    return 0;
  }

  return Math.max(0, session.cards.length - getRatedCount(session));
}

function getSourceRunCount(session) {
  if (!session || !Array.isArray(session.cards)) {
    return 0;
  }

  return new Set(session.cards.map((card) => card.runId)).size;
}

function setVoteButtons(activeVote) {
  elements.disagreeButton.classList.toggle("active", activeVote === "disagree");
  elements.agreeButton.classList.toggle("active", activeVote === "agree");
}

function renderEvidenceList(evidence) {
  elements.evidenceList.innerHTML = "";

  if (!Array.isArray(evidence) || evidence.length === 0) {
    const empty = document.createElement("li");
    empty.innerHTML = '<span class="evidence-signal">Fresh intuition only. No evidence returned.</span>';
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
  elements.assumptionTitle.textContent = "Generate a fresh queue of assumptions";
  elements.assumptionReason.textContent =
    "TasteMaker reads your last 90 days of browsing history, then turns it into sharp behavioral assumptions you can rate.";
  elements.evidenceList.innerHTML = "";
  elements.cardCounter.textContent = "Card 0/0";
  elements.runMeta.textContent = "";
  setVoteButtons(null);
  setProgress(0);
}

function triggerCardAdvanceAnimation() {
  elements.cardShell.classList.remove("card-advance");
  void elements.cardShell.offsetWidth;
  elements.cardShell.classList.add("card-advance");
}

function renderCurrentCard() {
  const card = getCurrentCard();
  elements.cardShell.classList.toggle("show-skeleton", showSkeletonCard);
  elements.cardSkeleton.classList.toggle("hidden", !showSkeletonCard);

  if (!card) {
    renderEmptyCard();
    syncControlStates();
    return;
  }

  const badge =
    Array.isArray(card.tags) && card.tags[0]
      ? String(card.tags[0]).replace(/_/g, " ")
      : "assumption";
  const ratedCount = getRatedCount(currentSession);
  const total = currentSession.cards.length;
  const progress = total > 0 ? (ratedCount / total) * 100 : 0;
  const currentVote = currentSession.votes?.[getVoteKey(card)] || null;
  const confidenceText = `${Math.round(card.confidence * 100)}% confidence`;

  elements.cardBadge.textContent = badge;
  elements.assumptionTitle.textContent = card.assumption;
  elements.assumptionReason.textContent = card.reason;
  renderEvidenceList(card.evidence);
  elements.cardCounter.textContent = `Card ${currentSession.cursor + 1}/${total}`;
  elements.runMeta.textContent = `${confidenceText} • source ${card.runId.slice(0, 8)}`;
  setVoteButtons(currentVote);
  setProgress(progress);
  syncControlStates();
}

function renderChatMessages() {
  elements.chatMessages.innerHTML = "";

  if (!Array.isArray(chatHistory) || chatHistory.length === 0) {
    const starter = document.createElement("div");
    starter.className = "chat-message assistant";
    const paragraph = document.createElement("p");
    paragraph.textContent =
      "Ask why a card showed up, what pattern stands out, or what changed between runs.";
    starter.append(paragraph);
    elements.chatMessages.append(starter);
    return;
  }

  for (const message of chatHistory) {
    const bubble = document.createElement("div");
    bubble.className = `chat-message ${message.role}`;
    renderFormattedChatMessage(bubble, message.content);
    elements.chatMessages.append(bubble);
  }

  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function isBulletListLine(line) {
  return /^[-*]\s+/.test(line.trim());
}

function isOrderedListLine(line) {
  return /^\d+\.\s+/.test(line.trim());
}

function isHeadingOnlyLine(line) {
  return /^\*\*.+\*\*:?\s*$/.test(line.trim());
}

function appendInlineChatContent(container, text) {
  const tokens = String(text).split(/(\*\*[^*][\s\S]*?\*\*:?|`[^`\n]+`)/g);

  for (const token of tokens) {
    if (!token) {
      continue;
    }

    if (token.startsWith("**")) {
      const match = token.match(/^\*\*([\s\S]+?)\*\*(.*)$/);
      if (match) {
        const strong = document.createElement("strong");
        strong.textContent = match[1];
        container.append(strong);
        if (match[2]) {
          container.append(document.createTextNode(match[2]));
        }
        continue;
      }
    }

    if (token.startsWith("**") && token.endsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      container.append(strong);
      continue;
    }

    if (token.startsWith("`") && token.endsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      container.append(code);
      continue;
    }

    container.append(document.createTextNode(token));
  }
}

function appendParagraph(container, lines, isHeading = false) {
  const paragraph = document.createElement("p");
  if (isHeading) {
    paragraph.className = "chat-message-heading";
  }

  lines.forEach((line, index) => {
    appendInlineChatContent(paragraph, line);
    if (index < lines.length - 1) {
      paragraph.append(document.createElement("br"));
    }
  });

  container.append(paragraph);
}

function appendList(container, lines, ordered = false) {
  const list = document.createElement(ordered ? "ol" : "ul");

  for (const line of lines) {
    const item = document.createElement("li");
    const trimmed = line.trim().replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, "");
    appendInlineChatContent(item, trimmed);
    list.append(item);
  }

  container.append(list);
}

function renderFormattedChatMessage(container, content) {
  const normalized = String(content || "").replace(/\r\n/g, "\n").trim();

  if (!normalized) {
    const emptyParagraph = document.createElement("p");
    emptyParagraph.textContent = "";
    container.append(emptyParagraph);
    return;
  }

  const lines = normalized.split("\n");
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const trimmedLine = rawLine.trim();

    if (!trimmedLine) {
      index += 1;
      continue;
    }

    if (isHeadingOnlyLine(trimmedLine)) {
      appendParagraph(container, [trimmedLine], true);
      index += 1;
      continue;
    }

    if (isBulletListLine(trimmedLine) || isOrderedListLine(trimmedLine)) {
      const ordered = isOrderedListLine(trimmedLine);
      const listLines = [];

      while (index < lines.length) {
        const candidate = lines[index].trim();
        if (!candidate) {
          break;
        }

        if ((ordered && isOrderedListLine(candidate)) || (!ordered && isBulletListLine(candidate))) {
          listLines.push(candidate);
          index += 1;
          continue;
        }

        break;
      }

      appendList(container, listLines, ordered);
      continue;
    }

    const paragraphLines = [];

    while (index < lines.length) {
      const candidate = lines[index].trim();
      if (!candidate) {
        break;
      }

      if (isHeadingOnlyLine(candidate) || isBulletListLine(candidate) || isOrderedListLine(candidate)) {
        break;
      }

      paragraphLines.push(candidate);
      index += 1;
    }

    appendParagraph(container, paragraphLines);
  }
}

function renderExperiencePage() {
  const showChatPage = activePage === "chat";
  elements.assumptionsPage.classList.toggle("hidden", showChatPage);
  elements.chatPage.classList.toggle("hidden", !showChatPage);
}

function buildIntroStatus() {
  if (!shouldShowIntroScreen()) {
    return "";
  }

  if (
    primaryStatusMessage.startsWith("Could not") ||
    primaryStatusMessage.startsWith("Initialization failed") ||
    primaryStatusMessage.startsWith("No history found")
  ) {
    return primaryStatusMessage;
  }

  return "Nothing is analyzed until you click Generate.";
}

function renderLayoutMode() {
  const showIntro = shouldShowIntroScreen();
  if (showIntro) {
    activePage = "assumptions";
  }
  elements.introScreen.classList.toggle("hidden", !showIntro);
  elements.experienceShell.classList.toggle("hidden", showIntro);
  elements.progressTrack.classList.toggle("hidden", showIntro);
}

function renderIntroScreen() {
  elements.introStatus.textContent = buildIntroStatus();
  if (shouldShowIntroScreen()) {
    setProgress(0);
  }
}

function buildQueueSummary() {
  if (manualGenerationInFlight) {
    return manualGenerationPhase === "collecting"
      ? "Pulling browsing history and assembling a fresh queue."
      : "Fresh queue in progress. Current voting is paused until the new stack lands.";
  }

  if (!currentSession || currentSession.cards.length === 0) {
    return "No active queue yet.";
  }

  const ratedCount = getRatedCount(currentSession);
  const remainingCount = getRemainingCount(currentSession);
  const sourceRuns = getSourceRunCount(currentSession);
  const parts = [
    `${ratedCount} rated`,
    `${remainingCount} left`,
    `${sourceRuns} run${sourceRuns === 1 ? "" : "s"}`,
  ];

  if (currentSession.prefetchState === "loading") {
    parts.push("next 5 loading");
  } else if (currentSession.prefetchState === "ready") {
    parts.push("next 5 ready");
  } else if (currentSession.prefetchState === "error") {
    parts.push("next 5 stalled");
  }

  if (feedbackSyncState === "loading") {
    parts.push("feedback syncing");
  }

  return parts.join(" • ");
}

function buildActivityChips() {
  const chips = [];

  if (initializationInFlight) {
    chips.push({ label: "Booting extension", tone: "active" });
  }

  if (manualGenerationPhase === "collecting") {
    chips.push({ label: "Collecting history", tone: "active" });
  }

  if (manualGenerationPhase === "generating") {
    chips.push({ label: `Generating ${INITIAL_BATCH_SIZE}`, tone: "active" });
  }

  if (currentSession?.prefetchState === "loading") {
    chips.push({ label: `Warming next ${PREFETCH_BATCH_SIZE}`, tone: "active" });
  } else if (currentSession?.prefetchState === "ready") {
    chips.push({ label: `Next ${PREFETCH_BATCH_SIZE} ready`, tone: "success" });
  } else if (currentSession?.prefetchState === "error") {
    chips.push({ label: "Prefetch needs retry", tone: "error" });
  }

  if (feedbackSyncState === "loading") {
    chips.push({ label: "Syncing feedback", tone: "active" });
  } else if (feedbackSyncState === "error") {
    chips.push({ label: "Feedback queued locally", tone: "error" });
  }

  if (chatThinking) {
    chips.push({ label: "Chat thinking", tone: "active" });
  }

  return chips;
}

function renderStatusRail() {
  elements.status.textContent = primaryStatusMessage;
  elements.queueSummary.textContent = buildQueueSummary();

  const chips = buildActivityChips();
  elements.activityChips.innerHTML = "";
  for (const chip of chips) {
    const node = document.createElement("span");
    node.className = "activity-chip";
    node.dataset.tone = chip.tone;
    node.textContent = chip.label;
    elements.activityChips.append(node);
  }

  const showRetry =
    currentSession &&
    currentSession.prefetchState === "error" &&
    !manualGenerationInFlight;
  elements.prefetchRetryButton.classList.toggle("hidden", !showRetry);
  elements.prefetchRetryButton.disabled = !showRetry;
}

function syncControlStates() {
  const card = getCurrentCard();
  const hasCards = !!card;
  const blockingCardActions = initializationInFlight || manualGenerationInFlight || voteActionInFlight;

  elements.generateButton.disabled = initializationInFlight || manualGenerationInFlight;
  elements.generateButton.classList.toggle("is-loading", manualGenerationInFlight);
  elements.introGenerateButton.disabled = initializationInFlight || manualGenerationInFlight;
  elements.introGenerateButton.classList.toggle("is-loading", manualGenerationInFlight);
  elements.chatSendButton.disabled = chatThinking;
  elements.chatSendButton.classList.toggle("is-loading", chatThinking);
  elements.disagreeButton.disabled = !hasCards || blockingCardActions;
  elements.agreeButton.disabled = !hasCards || blockingCardActions;
  elements.prevButton.disabled = !hasCards || blockingCardActions || currentSession.cursor === 0;
  elements.nextButton.disabled =
    !hasCards ||
    blockingCardActions ||
    currentSession.cursor >= currentSession.cards.length - 1;
  elements.toggleChatButton.disabled = !currentSession || manualGenerationInFlight || initializationInFlight;
  elements.backToCardsButton.disabled = manualGenerationInFlight || initializationInFlight;
  elements.chatInput.disabled = chatThinking;
}

function renderAll() {
  renderLayoutMode();
  renderIntroScreen();
  renderStatusRail();
  renderCurrentCard();
  renderExperiencePage();
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

async function getHistoryForGeneration(useCache = false) {
  if (
    useCache &&
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

async function sendFeedback(userIdValue, runId, feedbackEntries) {
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
}

async function flushPendingFeedbackQueue() {
  let fullySynced = true;
  feedbackSyncError = "";

  while (true) {
    const batch = await dequeuePendingFeedbackBatch();
    if (!batch) {
      break;
    }

    try {
      await sendFeedback(batch.userId, batch.runId, batch.feedback);
    } catch (error) {
      await requeuePendingFeedbackBatch(batch);
      fullySynced = false;
      feedbackSyncError =
        error instanceof Error ? error.message : "Feedback sync failed";
      break;
    }
  }

  return fullySynced;
}

async function syncPendingFeedbackInBackground() {
  if (feedbackSyncPromise) {
    return feedbackSyncPromise;
  }

  feedbackSyncState = "loading";
  renderStatusRail();

  feedbackSyncPromise = (async () => {
    try {
      const fullySynced = await flushPendingFeedbackQueue();
      feedbackSyncState = fullySynced ? "idle" : "error";
      return fullySynced;
    } catch (error) {
      feedbackSyncState = "error";
      feedbackSyncError = error instanceof Error ? error.message : "Feedback sync failed";
      return false;
    } finally {
      feedbackSyncPromise = null;
      renderStatusRail();
    }
  })();

  return feedbackSyncPromise;
}

async function sendChatMessage(message) {
  const currentCard = getCurrentCard();
  const response = await fetchWithTimeout(
    `${apiBaseUrl}/api/assumptions/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        message,
        runId: currentCard?.runId,
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

function normalizeBatchPayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("API returned invalid assumptions payload");
  }

  const runId =
    typeof payload.runId === "string" && payload.runId.trim().length > 0
      ? payload.runId.trim()
      : crypto.randomUUID();
  const generatedAt =
    typeof payload.generatedAt === "string" && payload.generatedAt.trim().length > 0
      ? payload.generatedAt
      : new Date().toISOString();
  const assumptions = Array.isArray(payload.assumptions) ? payload.assumptions : [];
  const cards = assumptions
    .map((card) => normalizeQueuedCard(card, runId, generatedAt))
    .filter(Boolean);

  if (cards.length === 0) {
    throw new Error("API returned empty assumptions payload");
  }

  return {
    runId,
    generatedAt,
    cards,
  };
}

function filterUniqueCards(existingCards, incomingCards) {
  const seenTexts = new Set(existingCards.map((card) => normalizeAssumptionText(card.assumption)));
  const uniqueCards = [];

  for (const card of incomingCards) {
    const normalizedText = normalizeAssumptionText(card.assumption);
    if (!normalizedText || seenTexts.has(normalizedText)) {
      continue;
    }

    seenTexts.add(normalizedText);
    uniqueCards.push(card);
  }

  return uniqueCards;
}

function buildSessionFromBatch(batch) {
  return {
    sessionId: crypto.randomUUID(),
    createdAt: batch.generatedAt,
    updatedAt: new Date().toISOString(),
    cursor: 0,
    cards: batch.cards,
    votes: {},
    prefetchState: "idle",
    prefetchError: "",
  };
}

function schedulePrefetchReadyReset(sessionId) {
  if (prefetchReadyTimer) {
    clearTimeout(prefetchReadyTimer);
  }

  prefetchReadyTimer = setTimeout(() => {
    if (!currentSession || currentSession.sessionId !== sessionId) {
      return;
    }

    if (currentSession.prefetchState === "ready") {
      currentSession.prefetchState = "idle";
      currentSession.updatedAt = new Date().toISOString();
      void saveLastSession();
      renderStatusRail();
    }
  }, PREFETCH_READY_RESET_MS);
}

async function requestAssumptionsBatch(batchSize, useHistoryCache) {
  const history = await getHistoryForGeneration(useHistoryCache);

  if (history.length === 0) {
    throw new Error("No history found for the last 90 days.");
  }

  const response = await fetchWithTimeout(
    `${apiBaseUrl}/api/assumptions/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        windowDays: WINDOW_DAYS,
        batchSize,
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
  return normalizeBatchPayload(payload);
}

function maybeAdvanceCursorAfterAppend(previousCount) {
  if (!currentSession || previousCount <= 0) {
    return;
  }

  const previousCard = currentSession.cards[Math.min(currentSession.cursor, previousCount - 1)];
  if (!previousCard) {
    return;
  }

  const previousVote = currentSession.votes?.[getVoteKey(previousCard)];
  if (isStoredVote(previousVote) && currentSession.cursor >= previousCount - 1) {
    currentSession.cursor = previousCount;
    triggerCardAdvanceAnimation();
  }
}

async function startPrefetch(options = {}) {
  if (!currentSession || manualGenerationInFlight || initializationInFlight) {
    return false;
  }

  const force = options.force === true;
  const remainingCount = getRemainingCount(currentSession);
  if (!force && remainingCount > PREFETCH_THRESHOLD) {
    return false;
  }

  if (currentSession.prefetchState === "loading") {
    return false;
  }

  const sessionToken = activeSessionToken;
  const requestToken = ++requestTokenCounter;
  activePrefetchRequestToken = requestToken;

  currentSession.prefetchState = "loading";
  currentSession.prefetchError = "";
  currentSession.updatedAt = new Date().toISOString();
  void saveLastSession();
  setPrimaryStatus("Keep rating. Warming the next 5 assumptions in the background.");
  renderAll();

  try {
    const batch = await requestAssumptionsBatch(PREFETCH_BATCH_SIZE, true);

    if (sessionToken !== activeSessionToken || requestToken !== activePrefetchRequestToken || !currentSession) {
      return false;
    }

    const uniqueCards = filterUniqueCards(currentSession.cards, batch.cards);
    if (uniqueCards.length === 0) {
      throw new Error("Prefetch returned only repeated assumptions. Retry for a fresh batch.");
    }

    const previousCount = currentSession.cards.length;
    currentSession.cards = currentSession.cards.concat(uniqueCards);
    currentSession.prefetchState = "ready";
    currentSession.prefetchError = "";
    currentSession.updatedAt = new Date().toISOString();
    maybeAdvanceCursorAfterAppend(previousCount);
    await saveLastSession();
    schedulePrefetchReadyReset(currentSession.sessionId);
    setPrimaryStatus("Next 5 assumptions are queued. Keep rating.");
    renderAll();
    return true;
  } catch (error) {
    if (sessionToken !== activeSessionToken || requestToken !== activePrefetchRequestToken || !currentSession) {
      return false;
    }

    const message = error instanceof Error ? error.message : "Unknown prefetch error";
    currentSession.prefetchState = "error";
    currentSession.prefetchError = message;
    currentSession.updatedAt = new Date().toISOString();
    await saveLastSession();
    setPrimaryStatus("Keep rating. The next 5 assumptions failed to load.");
    renderAll();
    return false;
  } finally {
    if (activePrefetchRequestToken === requestToken) {
      activePrefetchRequestToken = 0;
    }
  }
}

async function startManualGeneration() {
  if (manualGenerationInFlight || initializationInFlight) {
    return;
  }

  if (currentSession) {
    currentSession.prefetchState = "idle";
    currentSession.prefetchError = "";
    currentSession.updatedAt = new Date().toISOString();
  }

  manualGenerationInFlight = true;
  manualGenerationPhase = "collecting";
  showSkeletonCard = true;
  const previousSession = currentSession;
  const sessionToken = ++activeSessionToken;
  const requestToken = ++requestTokenCounter;
  activeManualRequestToken = requestToken;
  activePrefetchRequestToken = 0;
  if (prefetchReadyTimer) {
    clearTimeout(prefetchReadyTimer);
  }

  setPrimaryStatus("Collecting the last 90 days of history...");
  renderAll();

  try {
    const history = await getHistoryForGeneration(false);
    if (history.length === 0) {
      throw new Error("No history found for the last 90 days.");
    }

    if (sessionToken !== activeSessionToken || requestToken !== activeManualRequestToken) {
      return;
    }

    manualGenerationPhase = "generating";
    setPrimaryStatus(`Generating ${INITIAL_BATCH_SIZE} assumptions from ${history.length} history events...`);
    renderAll();

    const response = await fetchWithTimeout(
      `${apiBaseUrl}/api/assumptions/generate`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          windowDays: WINDOW_DAYS,
          batchSize: INITIAL_BATCH_SIZE,
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
    const batch = normalizeBatchPayload(payload);

    if (sessionToken !== activeSessionToken || requestToken !== activeManualRequestToken) {
      return;
    }

    currentSession = buildSessionFromBatch(batch);
    await saveLastSession();
    setPrimaryStatus("Fresh assumptions ready. Rate what lands and the next 5 will warm up automatically.");
    renderAll();
  } catch (error) {
    if (sessionToken !== activeSessionToken || requestToken !== activeManualRequestToken) {
      return;
    }

    currentSession = previousSession;
    const message = error instanceof Error ? error.message : "Unknown error";
    setPrimaryStatus(`Could not generate a fresh queue: ${message}`);
    renderAll();
  } finally {
    if (activeManualRequestToken === requestToken) {
      activeManualRequestToken = 0;
    }

    if (sessionToken === activeSessionToken) {
      manualGenerationInFlight = false;
      manualGenerationPhase = "idle";
      showSkeletonCard = false;
      renderAll();
      void maybeStartPrefetch();
    }
  }
}

async function handleVote(vote) {
  if (!currentSession || voteActionInFlight || manualGenerationInFlight || initializationInFlight) {
    return;
  }

  const card = getCurrentCard();
  if (!card) {
    return;
  }

  voteActionInFlight = true;

  try {
    currentSession.votes[getVoteKey(card)] = vote;
    currentSession.updatedAt = new Date().toISOString();
    await queueFeedback(userId, card.runId, [
      {
        assumptionId: card.id,
        vote,
      },
    ]);

    if (currentSession.cursor < currentSession.cards.length - 1) {
      currentSession.cursor += 1;
      triggerCardAdvanceAnimation();
    }

    await saveLastSession();
    setPrimaryStatus("Answer saved. Keep going while feedback syncs in the background.");
    renderAll();
    void syncPendingFeedbackInBackground();
    void maybeStartPrefetch();
  } finally {
    voteActionInFlight = false;
    syncControlStates();
  }
}

async function maybeStartPrefetch() {
  if (!currentSession || manualGenerationInFlight || initializationInFlight) {
    return false;
  }

  if (getRemainingCount(currentSession) > PREFETCH_THRESHOLD) {
    return false;
  }

  if (currentSession.prefetchState === "loading") {
    return false;
  }

  if (currentSession.prefetchState === "error") {
    return false;
  }

  return startPrefetch();
}

async function retryPrefetch() {
  if (!currentSession || currentSession.prefetchState !== "error") {
    return;
  }

  await startPrefetch({ force: true });
}

async function moveCard(direction) {
  if (!currentSession || manualGenerationInFlight || initializationInFlight) {
    return;
  }

  const nextIndex = currentSession.cursor + direction;
  if (nextIndex < 0 || nextIndex >= currentSession.cards.length) {
    return;
  }

  currentSession.cursor = nextIndex;
  currentSession.updatedAt = new Date().toISOString();
  await saveLastSession();
  triggerCardAdvanceAnimation();
  renderAll();
}

async function handleChatSubmit(event) {
  event.preventDefault();

  const message = elements.chatInput.value.trim();
  if (!message || chatThinking) {
    return;
  }

  chatThinking = true;
  elements.chatInput.value = "";
  renderStatusRail();
  syncControlStates();

  chatHistory.push({ role: "user", content: message });
  renderChatMessages();
  await saveChatHistory();

  try {
    const reply = await sendChatMessage(message);
    chatHistory.push({ role: "assistant", content: reply });
    setPrimaryStatus("Chat updated with the latest read.");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown error";
    chatHistory.push({
      role: "assistant",
      content: `Could not reach chat endpoint: ${reason}`,
    });
    setPrimaryStatus(`Chat request failed: ${reason}`);
  } finally {
    chatThinking = false;
    renderChatMessages();
    await saveChatHistory();
    renderStatusRail();
    syncControlStates();
  }
}

async function initializePopup() {
  initializationInFlight = true;
  showSkeletonCard = false;
  setPrimaryStatus("Booting extension...");
  renderAll();

  try {
    userId = await getOrCreateUserId();
    apiBaseUrl = await getApiBaseUrl();
    chatHistory = await loadChatHistory();
    renderChatMessages();
    void syncPendingFeedbackInBackground();

    const cachedSession = await loadLastSession();
    if (cachedSession) {
      currentSession = cachedSession;
      activeSessionToken = 1;
      setPrimaryStatus("Loaded your cached queue. Generate for a fresh read.");
    } else {
      setPrimaryStatus("Ready. Generate a fresh queue from your last 90 days.");
    }

    renderAll();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    currentSession = null;
    setPrimaryStatus(`Initialization failed: ${message}`);
    renderAll();
  } finally {
    initializationInFlight = false;
    renderAll();
    void maybeStartPrefetch();
  }
}

elements.generateButton.addEventListener("click", () => {
  void startManualGeneration();
});

elements.introGenerateButton.addEventListener("click", () => {
  void startManualGeneration();
});

elements.prefetchRetryButton.addEventListener("click", () => {
  void retryPrefetch();
});

elements.disagreeButton.addEventListener("click", () => {
  void handleVote("disagree");
});

elements.agreeButton.addEventListener("click", () => {
  void handleVote("agree");
});

elements.prevButton.addEventListener("click", () => {
  void moveCard(-1);
});

elements.nextButton.addEventListener("click", () => {
  void moveCard(1);
});

elements.toggleChatButton.addEventListener("click", () => {
  activePage = "chat";
  renderAll();
});

elements.backToCardsButton.addEventListener("click", () => {
  activePage = "assumptions";
  renderAll();
});

elements.chatForm.addEventListener("submit", (event) => {
  void handleChatSubmit(event);
});

renderChatMessages();
renderAll();
initializePopup();
