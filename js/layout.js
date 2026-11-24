"use strict";

/* ================= Раскладка: пустой экран / лента ================= */
function updateLayout() {
  const chat = getActive();
  const empty = !chat || chat.messages.length === 0;
  main.classList.toggle("state-empty", empty);
  const slot = empty ? centerSlot : bottomSlot;
  if (composerBox.parentElement !== slot) slot.appendChild(composerBox);
  if (!empty)
    feed.style.paddingBottom = composerBox.offsetHeight + 64 + "px";
  updateScrollBtn();
}
new ResizeObserver(() => {
  if (!main.classList.contains("state-empty")) {
    feed.style.paddingBottom = composerBox.offsetHeight + 64 + "px";
  }
}).observe(composerBox);

/* ================= Умный автоскролл ================= */
const bottomDist = () =>
  feed.scrollHeight - feed.scrollTop - feed.clientHeight;
function scrollToBottom(smooth) {
  feed.scrollTo({
    top: feed.scrollHeight,
    behavior: smooth && !reducedMotion ? "smooth" : "auto",
  });
}
function updateScrollBtn() {
  scrollBtn.hidden =
    main.classList.contains("state-empty") || bottomDist() < 240;
}
feed.addEventListener(
  "scroll",
  () => {
    stick = bottomDist() < 40;
    updateScrollBtn();
  },
  { passive: true },
);
scrollBtn.addEventListener("click", () => scrollToBottom(true));
