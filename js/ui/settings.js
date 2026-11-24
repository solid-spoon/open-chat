"use strict";

/* ================= Settings ================= */
const getKey = (provider = getActiveProvider()) => {
  const own =
    provider && typeof provider.apiKey === "string"
      ? provider.apiKey.trim()
      : "";
  if (own) return own;
  return (
    store.get(localStorage, LS.key) ||
    store.get(sessionStorage, LS.key) ||
    ""
  ).trim();
};

function saveKey() {
  const provider = getActiveProvider();
  if (!provider) return;
  provider.apiKey = apiKeyInput.value.trim();
  saveProviderState();
}
function initKey() {
  const provider = getActiveProvider();
  apiKeyInput.value = provider ? provider.apiKey || "" : "";
  rememberKey.checked = isProviderKeyRemembered();
}
function ensureKey() {
  const provider = getActiveProvider();
  const key = getKey();
  if (!key) {
    showError(
      "Add an API key for the active provider in Settings to get started.",
      false,
    );
    openSettings();
    apiKeyInput.focus();
    return null;
  }
  if (!provider || !provider.models.length) {
    showError(
      "Add at least one model ID for the active provider in Settings.",
      false,
    );
    openSettings();
    providerModels.focus();
    return null;
  }
  return key;
}

function renderProviderSettings() {
  providerSelect.innerHTML = "";
  providers.forEach((provider) => {
    const option = el("option");
    option.value = provider.id;
    option.textContent = provider.name || "Untitled provider";
    providerSelect.appendChild(option);
  });
  if (!providers.length) return;
  providerSelect.value = activeProviderId;
  const provider = getActiveProvider();
  providerName.value = provider.name || "";
  providerBaseUrl.value = provider.baseUrl || "";
  providerProtocol.value = provider.protocol || "chat/completions";
  providerReasoning.checked = !!provider.supportsReasoning;
  providerModels.value = (provider.models || []).join("\n");
  apiKeyInput.value = provider.apiKey || "";
  providerDelete.disabled = providers.length <= 1;
}
function parseModelIds(value) {
  const list = String(value || "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(list)];
}
function refreshProviderOptionName() {
  const provider = getActiveProvider();
  if (!provider) return;
  const option = Array.from(providerSelect.options).find(
    (item) => item.value === provider.id,
  );
  if (option) option.textContent = provider.name || "Untitled provider";
}
function updateActiveProvider() {
  const provider = getActiveProvider();
  if (!provider) return;
  provider.name = providerName.value.trim() || "Untitled provider";
  provider.baseUrl = providerBaseUrl.value.trim();
  provider.protocol =
    providerProtocol.value === "responses" ? "responses" : "chat/completions";
  provider.supportsReasoning = providerReasoning.checked;
  provider.models = parseModelIds(providerModels.value);
  provider.apiKey = apiKeyInput.value.trim();
  saveProviderState();
  refreshModels();
  ensureModelAvailable();
  buildModelMenu();
  refreshProviderOptionName();
}
function addProviderProfile() {
  const provider = normalizeProviderProfile({
    id:
      "provider-" +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8),
    name: "New provider",
    baseUrl: "",
    protocol: "chat/completions",
    supportsReasoning: false,
    models: [],
  });
  providers.push(provider);
  activeProviderId = provider.id;
  saveProviderState();
  refreshModels();
  ensureModelAvailable();
  buildModelMenu();
  renderProviderSettings();
  providerName.focus();
  providerName.select();
}
function deleteProviderProfile() {
  if (providers.length <= 1) return;
  const provider = getActiveProvider();
  if (!provider) return;
  openConfirmDialog({
    title: "Delete provider?",
    text: `The provider “${provider.name}” and its API key will be removed from this browser. Chats are not affected.`,
    confirmLabel: "Delete provider",
    onConfirm: () => {
      providers = providers.filter((item) => item.id !== provider.id);
      activeProviderId = providers[0].id;
      saveProviderState();
      refreshModels();
      ensureModelAvailable();
      buildModelMenu();
      renderProviderSettings();
    },
  });
}

const getSystemPrompt = () => (store.get(localStorage, LS.system) || "").trim();
function saveSystemPrompt() {
  const value = systemPromptInput.value;
  if (value.trim()) store.set(localStorage, LS.system, value);
  else store.del(localStorage, LS.system);
  updatePresetState();
}
function updatePresetState() {
  const value = systemPromptInput.value.trim();
  document.querySelectorAll(".preset-btn").forEach((btn) => {
    const on =
      !!value && (SYSTEM_PRESETS[btn.dataset.preset] || "").trim() === value;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

const TOOL_PREFERENCES = [
  { input: runJsEnabled, key: LS.toolRunJs, legacy: LS.runJs },
  { input: createFilesEnabled, key: LS.toolCreateFiles, legacy: LS.runJs },
  { input: wikipediaSearchEnabled, key: LS.toolWikipediaSearch, legacy: LS.wikipedia },
  { input: wikipediaReadEnabled, key: LS.toolWikipediaRead, legacy: LS.wikipedia },
  { input: storageSearchEnabled, key: LS.toolStorageSearch, legacy: LS.storage },
  { input: storageReadEnabled, key: LS.toolStorageRead, legacy: LS.storage },
];

function toolPreferenceEnabled(key) {
  const value = store.get(localStorage, key);
  if (value != null) return value !== "0";
  const preference = TOOL_PREFERENCES.find((item) => item.key === key);
  return !preference || store.get(localStorage, preference.legacy) !== "0";
}
function readPreference(key, fallback = "") {
  const value = store.get(localStorage, key);
  return value == null ? fallback : value;
}
function setPreference(key, value) {
  if (value == null || value === "") store.del(localStorage, key);
  else store.set(localStorage, key, String(value));
}
function loadSettingsControls() {
  TOOL_PREFERENCES.forEach(({ input, key }) => {
    input.checked = toolPreferenceEnabled(key);
  });
  temperatureSetting.value = readPreference(LS.temperature);
  maxOutputTokensSetting.value = readPreference(LS.maxOutputTokens);
  contextHistoryLimitSetting.value = readPreference(LS.contextHistoryLimit);
  workerTimeoutSetting.value = readPreference(LS.workerTimeout, "5000");
  maxToolRoundsSetting.value = readPreference(LS.maxToolRounds, "6");
}
function bindNumericPreference(input, key, { min, max, integer = false } = {}) {
  const save = () => {
    const raw = input.value.trim();
    if (!raw) {
      setPreference(key, "");
      return;
    }
    const value = Number(raw);
    if (
      !Number.isFinite(value) ||
      (integer && !Number.isInteger(value)) ||
      (min != null && value < min) ||
      (max != null && value > max)
    ) {
      setSettingsStatus("Enter a valid number for this setting.", true);
      input.value = readPreference(key);
      return;
    }
    setPreference(key, value);
    setSettingsStatus("");
  };
  input.addEventListener("change", save);
  input.addEventListener("blur", save);
}
function activateSettingsTab(name, focusTab = false) {
  const tabs = Array.from(document.querySelectorAll("[data-settings-tab]"));
  const selected = tabs.find((tab) => tab.dataset.settingsTab === name);
  if (!selected) return;
  tabs.forEach((tab) => {
    const active = tab === selected;
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll("[data-settings-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.settingsPanel !== name;
  });
  if (focusTab) selected.focus();
}

function setSettingsStatus(text, isError = false) {
  settingsStatus.textContent = text;
  settingsStatus.hidden = !text;
  settingsStatus.classList.toggle("error", !!isError);
}
function openSettings() {
  settingsModal.hidden = false;
  renderProviderSettings();
  initKey();
  systemPromptInput.value = store.get(localStorage, LS.system) || "";
  loadSettingsControls();
  updatePresetState();
  setSettingsStatus("");
  if (isMobile()) setNav(false, false);
  const panel = settingsModal.querySelector(".settings-modal");
  if (panel) panel.focus({ preventScroll: true });
}
function closeSettings() {
  settingsModal.hidden = true;
  apiKeyInput.type = "password";
  keyEye.innerHTML = icon("eye", 16);
  keyEye.title = "Show API key";
  keyEye.setAttribute("aria-label", "Show API key");
}
function initSettings() {
  initKey();
  systemPromptInput.value = store.get(localStorage, LS.system) || "";
  loadSettingsControls();
  updatePresetState();
}

settingsBtn.addEventListener("click", openSettings);
settingsClose.addEventListener("click", closeSettings);
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettings();
});
apiKeyInput.addEventListener("input", saveKey);
rememberKey.addEventListener("change", saveKey);
keyEye.addEventListener("click", () => {
  const show = apiKeyInput.type === "password";
  apiKeyInput.type = show ? "text" : "password";
  keyEye.innerHTML = icon(show ? "eye-off" : "eye", 16);
  keyEye.title = show ? "Hide API key" : "Show API key";
  keyEye.setAttribute("aria-label", keyEye.title);
});
systemPromptInput.addEventListener("input", saveSystemPrompt);
TOOL_PREFERENCES.forEach(({ input, key }) =>
  input.addEventListener("change", () =>
    setPreference(key, input.checked ? "1" : "0"),
  ),
);
bindNumericPreference(temperatureSetting, LS.temperature, { min: 0, max: 2 });
bindNumericPreference(maxOutputTokensSetting, LS.maxOutputTokens, {
  min: 1,
  integer: true,
});
bindNumericPreference(contextHistoryLimitSetting, LS.contextHistoryLimit, {
  min: 0,
  integer: true,
});
bindNumericPreference(workerTimeoutSetting, LS.workerTimeout, {
  min: 100,
  max: 120000,
  integer: true,
});
bindNumericPreference(maxToolRoundsSetting, LS.maxToolRounds, {
  min: 1,
  max: 50,
  integer: true,
});
document.querySelectorAll("[data-settings-tab]").forEach((tab) => {
  tab.addEventListener("click", () =>
    activateSettingsTab(tab.dataset.settingsTab),
  );
  tab.addEventListener("keydown", (event) => {
    const tabs = Array.from(document.querySelectorAll("[data-settings-tab]"));
    const index = tabs.indexOf(tab);
    let next = null;
    if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
    else if (event.key === "ArrowLeft")
      next = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (event.key === "Home") next = tabs[0];
    else if (event.key === "End") next = tabs[tabs.length - 1];
    if (next) {
      event.preventDefault();
      activateSettingsTab(next.dataset.settingsTab, true);
    }
  });
});
providerSelect.addEventListener("change", () => {
  activeProviderId = providerSelect.value;
  saveProviderState();
  refreshModels();
  ensureModelAvailable();
  buildModelMenu();
  renderProviderSettings();
  initKey();
});
providerAdd.addEventListener("click", addProviderProfile);
providerDelete.addEventListener("click", deleteProviderProfile);
providerName.addEventListener("input", updateActiveProvider);
providerBaseUrl.addEventListener("input", updateActiveProvider);
providerProtocol.addEventListener("change", updateActiveProvider);
providerReasoning.addEventListener("change", updateActiveProvider);
providerModels.addEventListener("input", updateActiveProvider);
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    systemPromptInput.value = SYSTEM_PRESETS[btn.dataset.preset] || "";
    saveSystemPrompt();
    systemPromptInput.focus();
  });
});

function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function currentSettingsExport() {
  const numberOrNull = (key) => {
    const raw = store.get(localStorage, key);
    return raw == null || raw.trim() === "" ? null : Number(raw);
  };
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    activeProviderId,
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      protocol: provider.protocol,
      supportsReasoning: !!provider.supportsReasoning,
      models: (provider.models || []).slice(),
    })),
    systemPrompt: store.get(localStorage, LS.system) || "",
    generation: {
      temperature: numberOrNull(LS.temperature),
      maxOutputTokens: numberOrNull(LS.maxOutputTokens),
      contextHistoryLimit: numberOrNull(LS.contextHistoryLimit) || 0,
    },
    tools: {
      run_js: toolPreferenceEnabled(LS.toolRunJs),
      create_files: toolPreferenceEnabled(LS.toolCreateFiles),
      wikipedia_search: toolPreferenceEnabled(LS.toolWikipediaSearch),
      wikipedia_read: toolPreferenceEnabled(LS.toolWikipediaRead),
      storage_search: toolPreferenceEnabled(LS.toolStorageSearch),
      storage_read: toolPreferenceEnabled(LS.toolStorageRead),
      workerTimeout: Number(readPreference(LS.workerTimeout, "5000")) || 5000,
      maxToolRounds: Number(readPreference(LS.maxToolRounds, "6")) || 6,
    },
  };
}

function exportSettingsFile() {
  downloadJson("open-chat-settings.json", currentSettingsExport());
  setSettingsStatus("Settings exported without API keys.");
}

function validateSettingsImport(data) {
  const isRecord = (value) =>
    !!value && typeof value === "object" && !Array.isArray(value);
  const inRange = (value, min, max, integer = false) =>
    value == null ||
    (typeof value === "number" &&
      Number.isFinite(value) &&
      value >= min &&
      (max == null || value <= max) &&
      (!integer || Number.isInteger(value)));
  if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.providers))
    throw new Error("Unsupported settings file format");
  if (!data.providers.length) throw new Error("At least one provider is required");
  const ids = new Set();
  data.providers.forEach((provider, index) => {
    if (
      !isRecord(provider) ||
      typeof provider.id !== "string" ||
      !provider.id.trim() ||
      ids.has(provider.id.trim()) ||
      typeof provider.name !== "string" ||
      typeof provider.baseUrl !== "string" ||
      !["responses", "chat/completions"].includes(provider.protocol) ||
      typeof provider.supportsReasoning !== "boolean" ||
      !Array.isArray(provider.models) ||
      !provider.models.every((modelId) => typeof modelId === "string")
    ) {
      throw new Error(`Provider ${index + 1} has an invalid structure`);
    }
    ids.add(provider.id.trim());
  });
  if (data.activeProviderId != null &&
      (typeof data.activeProviderId !== "string" || !ids.has(data.activeProviderId.trim())))
    throw new Error("The active provider is not in the provider list");
  if (typeof data.systemPrompt !== "string")
    throw new Error("The system prompt must be text");
  if (!isRecord(data.generation) ||
      !inRange(data.generation.temperature, 0, 2) ||
      !inRange(data.generation.maxOutputTokens, 1, null, true) ||
      !inRange(data.generation.contextHistoryLimit, 0, null, true))
    throw new Error("Generation settings are invalid");
  if (!isRecord(data.tools) ||
      !["run_js", "create_files", "wikipedia_search", "wikipedia_read", "storage_search", "storage_read"].every((key) => typeof data.tools[key] === "boolean") ||
      !inRange(data.tools.workerTimeout, 100, 120000, true) ||
      !inRange(data.tools.maxToolRounds, 1, 50, true))
    throw new Error("Tool settings are invalid");
}

function refreshProviderUI() {
  saveProviderState();
  refreshModels();
  ensureModelAvailable();
  buildModelMenu();
  renderProviderSettings();
  initKey();
}

function applySettingsImport(data) {
  validateSettingsImport(data);
  const currentKeys = new Map(providers.map((provider) => [provider.id, provider.apiKey || ""]));
  providers = data.providers.map((provider) =>
    normalizeProviderProfile({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      protocol: provider.protocol,
      supportsReasoning: provider.supportsReasoning,
      models: provider.models,
      apiKey: currentKeys.get(provider.id) || "",
    }),
  );
  activeProviderId = (data.activeProviderId || "").trim() || providers[0].id;
  setPreference(LS.system, data.systemPrompt);
  setPreference(LS.temperature, data.generation.temperature);
  setPreference(LS.maxOutputTokens, data.generation.maxOutputTokens);
  setPreference(LS.contextHistoryLimit, data.generation.contextHistoryLimit);
  [
    ["run_js", LS.toolRunJs],
    ["create_files", LS.toolCreateFiles],
    ["wikipedia_search", LS.toolWikipediaSearch],
    ["wikipedia_read", LS.toolWikipediaRead],
    ["storage_search", LS.toolStorageSearch],
    ["storage_read", LS.toolStorageRead],
  ].forEach(([name, key]) => setPreference(key, data.tools[name] ? "1" : "0"));
  setPreference(LS.workerTimeout, data.tools.workerTimeout);
  setPreference(LS.maxToolRounds, data.tools.maxToolRounds);
  refreshProviderUI();
  systemPromptInput.value = data.systemPrompt;
  loadSettingsControls();
  updatePresetState();
}

async function readSettingsFile(file) {
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    applySettingsImport(data);
    setSettingsStatus("Settings imported. Existing API keys were preserved for matching providers.");
  } catch (error) {
    setSettingsStatus(`Settings import failed: ${error.message || "invalid file"}.`, true);
  }
}

function resetSettingsToDefaults() {
  if (!confirm("Reset settings to factory defaults? API keys for matching default providers will be kept."))
    return;
  const currentKeys = new Map(providers.map((provider) => [provider.id, provider.apiKey || ""]));
  providers = defaultProviderProfiles().map((provider) => ({
    ...provider,
    apiKey: currentKeys.get(provider.id) || "",
  }));
  activeProviderId = providers[0].id;
  setPreference(LS.system, "");
  [LS.temperature, LS.maxOutputTokens, LS.contextHistoryLimit].forEach((key) =>
    setPreference(key, ""),
  );
  TOOL_PREFERENCES.forEach(({ key }) => setPreference(key, "1"));
  setPreference(LS.workerTimeout, "5000");
  setPreference(LS.maxToolRounds, "6");
  refreshProviderUI();
  systemPromptInput.value = "";
  loadSettingsControls();
  updatePresetState();
  setSettingsStatus("Settings reset to defaults. Matching API keys were kept.");
}

$("#exportSettings").addEventListener("click", exportSettingsFile);
$("#importSettings").addEventListener("click", () => importSettingsInput.click());
$("#resetSettings").addEventListener("click", resetSettingsToDefaults);
importSettingsInput.addEventListener("change", () => {
  const file = importSettingsInput.files && importSettingsInput.files[0];
  importSettingsInput.value = "";
  if (file) readSettingsFile(file);
});

/* ================= Data management ================= */
function exportChats() {
  if (!chats.length) {
    setSettingsStatus(
      "Chat history is empty; there is nothing to export.",
      true,
    );
    return;
  }
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    chats,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `aichat-history-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setSettingsStatus(
    `Exported ${chats.length} ${plural(chats.length, "chat", "chats")}.`,
  );
}

async function importChatsFile(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (
      !Array.isArray(parsed) &&
      parsed &&
      parsed.version != null &&
      parsed.version !== 1
    ) {
      throw new Error("Unsupported file version");
    }
    const list = Array.isArray(parsed) ? parsed : parsed && parsed.chats;
    if (!Array.isArray(list)) throw new Error("Invalid file format");
    validateChatImport(list);
    const imported = normalizeChats(list);
    if (!imported.length) {
      setSettingsStatus("No chats found in the file.", true);
      return;
    }
    const existing = new Set(chats.map((c) => c.id));
    const seen = new Set(existing);
    const fresh = imported.filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    if (!fresh.length) {
      setSettingsStatus(
        "All chats in the file are already in your history.",
        true,
      );
      return;
    }
    fresh.sort((a, b) => b.updatedAt - a.updatedAt);
    chats = [...fresh, ...chats];
    activeId = fresh[0].id;
    persist();
    renderSidebar();
    renderThread();
    updateLayout();
    stick = true;
    scrollToBottom(false);
    const skipped = imported.length - fresh.length;
    setSettingsStatus(
      `Imported ${fresh.length} ${plural(fresh.length, "chat", "chats")}` +
        (skipped
          ? `, skipped ${skipped} duplicate${skipped === 1 ? "" : "s"}`
          : "") +
        ".",
    );
  } catch (err) {
    setSettingsStatus(
      "Import failed: " + ((err && err.message) || "invalid file") + ".",
      true,
    );
  }
}

function validateChatImport(list) {
  const validString = (value) => typeof value === "string";
  const validSize = (value) =>
    value == null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0);
  const validImageData = (value) =>
    value == null ||
    value === "" ||
    /^data:image\/[\w.+-]+;base64,/i.test(value);

  for (const [chatIndex, chat] of list.entries()) {
    if (!chat || typeof chat !== "object" || Array.isArray(chat))
      throw new Error(`Chat ${chatIndex + 1} has an invalid format`);
    if (
      (chat.id != null && !validString(chat.id)) ||
      (chat.title != null && !validString(chat.title)) ||
      (chat.createdAt != null && !validSize(chat.createdAt)) ||
      (chat.updatedAt != null && !validSize(chat.updatedAt)) ||
      !Array.isArray(chat.messages)
    ) {
      throw new Error(`Chat ${chatIndex + 1} has an invalid structure`);
    }
    for (const [messageIndex, message] of chat.messages.entries()) {
      const location = `message ${messageIndex + 1} in chat ${chatIndex + 1}`;
      if (
        !message ||
        typeof message !== "object" ||
        (message.role !== "user" && message.role !== "assistant") ||
        !validString(message.content) ||
        (message.id != null && !validString(message.id)) ||
        (message.meta != null &&
          (typeof message.meta !== "object" || Array.isArray(message.meta))) ||
        (message.attachments != null && !Array.isArray(message.attachments))
      ) {
        throw new Error(`${location} has an invalid format`);
      }
      if (
        message.meta &&
        ((message.meta.tokens != null && !validSize(message.meta.tokens)) ||
          (message.meta.ms != null && !validSize(message.meta.ms)) ||
          (message.meta.model != null && !validString(message.meta.model)))
      ) {
        throw new Error(`Metadata for ${location} is invalid`);
      }
      for (const attachment of message.attachments || []) {
        if (
          !attachment ||
          typeof attachment !== "object" ||
          (attachment.kind !== "image" && attachment.kind !== "file") ||
          (attachment.name != null && !validString(attachment.name)) ||
          !validSize(attachment.size)
        ) {
          throw new Error(`Attachment in ${location} has an invalid format`);
        }
        if (attachment.kind === "image") {
          if (
            !validImageData(attachment.dataUrl) ||
            !validImageData(attachment.thumb) ||
            (!attachment.dataUrl && !attachment.thumb && !attachment.truncated)
          ) {
            throw new Error(`Image in ${location} is corrupted`);
          }
        } else if (
          (attachment.text != null && !validString(attachment.text)) ||
          (attachment.lang != null && !validString(attachment.lang))
        ) {
          throw new Error(
            `Text attachment in ${location} has an invalid format`,
          );
        }
      }
    }
  }
}

function clearAllChats() {
  if (generating) stop();
  chats = [];
  activeId = null;
  hideError();
  persist();
  renderSidebar();
  renderThread();
  updateLayout();
  stick = true;
  scrollToBottom(false);
  setSettingsStatus("Chat history has been cleared.");
}
function confirmClearChats() {
  openConfirmDialog({
    title: "Clear chat history?",
    text: "All chats and attachments will be permanently deleted. Your API key and system prompt will be kept.",
    confirmLabel: "Clear history",
    onConfirm: clearAllChats,
  });
}

$("#exportChats").addEventListener("click", exportChats);
$("#importChats").addEventListener("click", () => importFile.click());
$("#clearChats").addEventListener("click", confirmClearChats);
importFile.addEventListener("change", () => {
  const file = importFile.files && importFile.files[0];
  importFile.value = "";
  if (file) importChatsFile(file);
});
