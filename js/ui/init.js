"use strict";

/* ================= Initialization ================= */
let inactivityTimer = null;

function armInactivityLock() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = null;
}

function startInactivityLock() {
  // Inactivity lock disabled for simplified security
}

async function startOpenChat() {
  let startupError = null;
  try {
    await openChatDatabase();
    await migrateLegacyLocalStorage();
  } catch (error) {
    console.error("Open Chat could not open its local database:", error);
    startupError = error;
  }

  initProviderState();
  if (!startupError) {
    try {
      await loadProviderKeysIntoMemory();
      await initializeChatState();
    } catch (error) {
      console.error("Open Chat could not load local data:", error);
      startupError = error;
      chats = [];
      activeId = null;
    }
  }

  const app = $("#app");
  if (app) app.hidden = false;
  initializeVisibleApplication();
  if (startupError)
    showError(`Local data could not be loaded: ${startupError.message || startupError}`, false);
}

function initializeVisibleApplication() {
  document.querySelectorAll("[data-icon]").forEach((node) => {
    node.innerHTML = icon(node.dataset.icon, +(node.dataset.size || 18));
  });
  if (window.marked) marked.setOptions({ gfm: true, breaks: true });

  const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
  if ($("#newChatBtn")) $("#newChatBtn").title = `New chat (${isMac ? "⌘K" : "Ctrl+K"})`;
  if (typeof searchBtn !== "undefined" && searchBtn)
    searchBtn.title = `Search chats (${isMac ? "⌘/" : "Ctrl+\/"})`;

  setNav(isMobile() ? false : store.get(localStorage, LS.nav) !== "0", false);
  buildModelMenu();
  initSettings();
  initAttachments();
  renderSidebar();
  renderThread();
  updateLayout();
  setSendState(false);
  autosize();
  stick = true;
  scrollToBottom(false);
  if (main.classList.contains("state-empty") && !isMobile()) input.focus();
}

startOpenChat();
