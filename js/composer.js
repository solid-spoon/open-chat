"use strict";

/* ================= Композер ================= */
function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 200) + "px";
  input.style.overflowY = input.scrollHeight > 200 ? "auto" : "hidden";
}
function updateSendState() {
  sendBtn.disabled = generating
    ? false
    : !input.value.trim() && !hasPendingAttachments();
}
function setSendState(gen) {
  sendBtn.innerHTML = icon(gen ? "stop" : "arrow-up", 18);
  const label = gen ? "Остановить генерацию" : "Отправить";
  sendBtn.title = label;
  sendBtn.setAttribute("aria-label", label);
  updateSendState();
}
input.addEventListener("input", () => {
  autosize();
  updateSendState();
});
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
});
$("#composer").addEventListener("submit", (e) => {
  e.preventDefault();
  send();
});
sendBtn.addEventListener("click", () => {
  generating ? stop() : send();
});

/* ================= Редактирование сообщения ================= */
function startEditMessage(msg) {
  if (generating) stop();
  const chat = getActive();
  if (!chat) return;
  const index = chat.messages.indexOf(msg);
  if (index < 0) return;
  const [target] = chat.messages.splice(index);
  setPendingAttachments(target.attachments || []);
  input.value = target.content || "";
  autosize();
  updateSendState();
  hideError();
  chat.updatedAt = Date.now();
  persist();
  renderSidebar();
  renderThread();
  updateLayout();
  stick = true;
  scrollToBottom(false);
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}
