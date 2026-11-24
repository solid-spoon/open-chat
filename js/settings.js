"use strict";

/* ================= Настройки ================= */
const getKey = () =>
  (
    store.get(localStorage, LS.key) ||
    store.get(sessionStorage, LS.key) ||
    ""
  ).trim();

function saveKey() {
  const v = apiKeyInput.value.trim();
  store.del(localStorage, LS.key);
  store.del(sessionStorage, LS.key);
  if (v)
    store.set(
      rememberKey.checked ? localStorage : sessionStorage,
      LS.key,
      v,
    );
}
function initKey() {
  const ls = store.get(localStorage, LS.key);
  rememberKey.checked = !!ls;
  apiKeyInput.value = ls || store.get(sessionStorage, LS.key) || "";
}
function ensureKey() {
  const key = getKey();
  if (!key) {
    showError("Добавьте API-ключ в настройках, чтобы начать.", false);
    openSettings();
    apiKeyInput.focus();
    return null;
  }
  return key;
}

const getSystemPrompt = () =>
  (store.get(localStorage, LS.system) || "").trim();
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
      !!value &&
      (SYSTEM_PRESETS[btn.dataset.preset] || "").trim() === value;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-pressed", String(on));
  });
}

function setSettingsStatus(text, isError = false) {
  settingsStatus.textContent = text;
  settingsStatus.hidden = !text;
  settingsStatus.classList.toggle("error", !!isError);
}
function openSettings() {
  settingsModal.hidden = false;
  initKey();
  systemPromptInput.value = store.get(localStorage, LS.system) || "";
  runJsEnabled.checked = store.get(localStorage, LS.runJs) !== "0";
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
  keyEye.title = "Показать ключ";
  keyEye.setAttribute("aria-label", "Показать ключ");
}
function initSettings() {
  initKey();
  systemPromptInput.value = store.get(localStorage, LS.system) || "";
  runJsEnabled.checked = store.get(localStorage, LS.runJs) !== "0";
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
  keyEye.title = show ? "Скрыть ключ" : "Показать ключ";
  keyEye.setAttribute("aria-label", keyEye.title);
});
systemPromptInput.addEventListener("input", saveSystemPrompt);
runJsEnabled.addEventListener("change", () =>
  store.set(localStorage, LS.runJs, runJsEnabled.checked ? "1" : "0"),
);
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    systemPromptInput.value = SYSTEM_PRESETS[btn.dataset.preset] || "";
    saveSystemPrompt();
    systemPromptInput.focus();
  });
});

/* ================= Управление данными ================= */
function exportChats() {
  if (!chats.length) {
    setSettingsStatus("История пуста — нечего экспортировать.", true);
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
  setSettingsStatus(`Экспортировано чатов: ${chats.length}.`);
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
      throw new Error("неподдерживаемая версия файла");
    }
    const list = Array.isArray(parsed) ? parsed : parsed && parsed.chats;
    if (!Array.isArray(list)) throw new Error("неверный формат файла");
    validateChatImport(list);
    const imported = normalizeChats(list);
    if (!imported.length) {
      setSettingsStatus("В файле не найдено чатов.", true);
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
      setSettingsStatus("Все чаты из файла уже есть в истории.", true);
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
      `Импортировано чатов: ${fresh.length}` +
        (skipped ? `, пропущено дублей: ${skipped}` : "") +
        ".",
    );
  } catch (err) {
    setSettingsStatus(
      "Не удалось импортировать: " +
        ((err && err.message) || "неверный файл") +
        ".",
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
    value == null || value === "" || /^data:image\/[\w.+-]+;base64,/i.test(value);

  for (const [chatIndex, chat] of list.entries()) {
    if (!chat || typeof chat !== "object" || Array.isArray(chat))
      throw new Error(`чат №${chatIndex + 1} имеет неверный формат`);
    if (
      (chat.id != null && !validString(chat.id)) ||
      (chat.title != null && !validString(chat.title)) ||
      (chat.createdAt != null && !validSize(chat.createdAt)) ||
      (chat.updatedAt != null && !validSize(chat.updatedAt)) ||
      !Array.isArray(chat.messages)
    ) {
      throw new Error(`чат №${chatIndex + 1} имеет неверную структуру`);
    }
    for (const [messageIndex, message] of chat.messages.entries()) {
      const location = `сообщение №${messageIndex + 1} в чате №${chatIndex + 1}`;
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
        throw new Error(`${location} имеет неверный формат`);
      }
      if (
        message.meta &&
        ((message.meta.tokens != null && !validSize(message.meta.tokens)) ||
          (message.meta.ms != null && !validSize(message.meta.ms)) ||
          (message.meta.model != null && !validString(message.meta.model)))
      ) {
        throw new Error(`метаданные ${location} повреждены`);
      }
      for (const attachment of message.attachments || []) {
        if (
          !attachment ||
          typeof attachment !== "object" ||
          (attachment.kind !== "image" && attachment.kind !== "file") ||
          (attachment.name != null && !validString(attachment.name)) ||
          !validSize(attachment.size)
        ) {
          throw new Error(`вложение в ${location} имеет неверный формат`);
        }
        if (attachment.kind === "image") {
          if (
            !validImageData(attachment.dataUrl) ||
            !validImageData(attachment.thumb) ||
            (!attachment.dataUrl &&
              !attachment.thumb &&
              !attachment.truncated)
          ) {
            throw new Error(`изображение в ${location} повреждено`);
          }
        } else if (
          (attachment.text != null && !validString(attachment.text)) ||
          (attachment.lang != null && !validString(attachment.lang))
        ) {
          throw new Error(`текстовый файл в ${location} имеет неверный формат`);
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
  setSettingsStatus("История диалогов очищена.");
}
function confirmClearChats() {
  openConfirmDialog({
    title: "Очистить историю?",
    text: "Все диалоги и вложения будут удалены без возможности восстановления. API-ключ и системный промпт останутся.",
    confirmLabel: "Очистить",
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
