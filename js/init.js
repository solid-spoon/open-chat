"use strict";

/* ================= Инициализация ================= */
document.querySelectorAll("[data-icon]").forEach((n) => {
  n.innerHTML = icon(n.dataset.icon, +(n.dataset.size || 18));
});
if (window.marked) marked.setOptions({ gfm: true, breaks: true });
$("#kbdHint").textContent = /Mac|iPhone|iPad/.test(navigator.userAgent)
  ? "⌘K"
  : "Ctrl K";

setNav(
  isMobile() ? false : store.get(localStorage, LS.nav) !== "0",
  false,
);
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
