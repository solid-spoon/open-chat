"use strict";

/* ================= Initialization ================= */
document.querySelectorAll("[data-icon]").forEach((n) => {
  n.innerHTML = icon(n.dataset.icon, +(n.dataset.size || 18));
});
if (window.marked) marked.setOptions({ gfm: true, breaks: true });

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);
if ($("#newChatBtn"))
  $("#newChatBtn").title = `New chat (${isMac ? "⌘K" : "Ctrl+K"})`;
if (typeof searchBtn !== "undefined" && searchBtn) {
  searchBtn.title = `Search chats (${isMac ? "⌘/" : "Ctrl+/"})`;
}

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
