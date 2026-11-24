"use strict";

/* ================= Сайдбар: сворачивание ================= */
function setNav(open, save = true) {
  sidebarOpen = open;
  app.classList.toggle("nav-collapsed", !open);
  app.classList.toggle("nav-open", open);
  if (save) store.set(localStorage, LS.nav, open ? "1" : "0");
}
$("#collapseBtn").addEventListener("click", () => setNav(false));
$("#expandBtn").addEventListener("click", () => setNav(true));
$("#backdrop").addEventListener("click", () => setNav(false, false));
matchMedia("(max-width: 767px)").addEventListener("change", (e) =>
  setNav(!e.matches, false),
);

$("#newChatBtn").addEventListener("click", newChat);
$("#headerNewChat").addEventListener("click", newChat);

/* ================= Глобальные горячие клавиши ================= */
document.addEventListener("keydown", (e) => {
  if (e.code === "KeyK" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    newChat();
  } else if (e.key === "Escape") {
    if (!modal.hidden) closeModal();
    else if (!settingsModal.hidden) closeSettings();
    else if (!modelMenu.hidden) closeModelMenu();
    else if (!reasoningMenu.hidden) closeReasoningMenu();
    else if (isMobile() && sidebarOpen) setNav(false, false);
  }
});
window.addEventListener("pagehide", persist);
