"use strict";

/* ================= Сайдбар: список чатов ================= */
function renderSidebar() {
  chatList.innerHTML = "";
  if (!chats.length) {
    const hint = el("div", "list-hint");
    hint.textContent = "Здесь появятся ваши чаты";
    chatList.appendChild(hint);
    return;
  }
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const today = +dayStart,
    yesterday = today - 864e5;
  const groups = [
    { label: "Сегодня", items: [] },
    { label: "Вчера", items: [] },
    { label: "Ранее", items: [] },
  ];
  [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((c) => {
      const g =
        c.updatedAt >= today ? 0 : c.updatedAt >= yesterday ? 1 : 2;
      groups[g].items.push(c);
    });
  groups.forEach((g) => {
    if (!g.items.length) return;
    const label = el("div", "group-label");
    label.textContent = g.label;
    chatList.appendChild(label);
    g.items.forEach((c) => {
      const item = el(
        "div",
        "chat-item" + (c.id === activeId ? " active" : ""),
      );
      item.dataset.id = c.id;
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      const title = el("span", "chat-title");
      title.textContent = c.title || "Новый чат";
      const edit = el("button", "icon-btn chat-edit");
      edit.type = "button";
      edit.title = "Переименовать чат";
      edit.setAttribute("aria-label", "Переименовать чат");
      edit.innerHTML = icon("pencil", 14);
      const del = el("button", "icon-btn chat-del");
      del.type = "button";
      del.title = "Удалить чат";
      del.setAttribute("aria-label", "Удалить чат");
      del.innerHTML = icon("trash", 15);
      item.append(title, edit, del);
      chatList.appendChild(item);
    });
  });
}

chatList.addEventListener("click", (e) => {
  const item = e.target.closest(".chat-item");
  if (!item) return;
  if (e.target.closest(".chat-rename")) return;
  if (e.target.closest(".chat-edit")) {
    startRename(item.dataset.id);
    return;
  }
  if (e.target.closest(".chat-del")) {
    openConfirm(item.dataset.id);
    return;
  }
  switchChat(item.dataset.id);
});
chatList.addEventListener("dblclick", (e) => {
  const item = e.target.closest(".chat-item");
  if (!item || e.target.closest("button") || e.target.closest(".chat-rename"))
    return;
  startRename(item.dataset.id);
});
chatList.addEventListener("keydown", (e) => {
  if (
    (e.key === "Enter" || e.key === " ") &&
    e.target.classList.contains("chat-item")
  ) {
    e.preventDefault();
    switchChat(e.target.dataset.id);
  }
});

function startRename(id) {
  const chat = chats.find((c) => c.id === id);
  const item = chatList.querySelector(
    `.chat-item[data-id="${CSS.escape(id)}"]`,
  );
  if (!chat || !item) return;
  const title = item.querySelector(".chat-title");
  if (!title) return;
  const field = el("input", "chat-rename");
  field.type = "text";
  field.value = chat.title || "Новый чат";
  field.maxLength = 120;
  field.setAttribute("aria-label", "Название чата");
  title.replaceWith(field);
  field.focus();
  field.select();
  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const value = field.value.trim();
    if (save && value && value !== chat.title) {
      chat.title = value;
      persist();
    }
    renderSidebar();
  };
  field.addEventListener("click", (e) => e.stopPropagation());
  field.addEventListener("dblclick", (e) => e.stopPropagation());
  field.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      finish(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      finish(false);
    }
  });
  field.addEventListener("blur", () => finish(true));
}

/* ================= Навигация по чатам ================= */
function switchChat(id) {
  if (id === activeId) {
    if (isMobile()) setNav(false, false);
    return;
  }
  if (generating && generating.chatId !== id) stop();
  activeId = id;
  hideError();
  persist();
  renderSidebar();
  renderThread();
  updateLayout();
  stick = true;
  scrollToBottom(false);
  if (isMobile()) setNav(false, false);
}

function newChat() {
  if (generating) stop();
  hideError();
  const cur = getActive();
  if (cur && cur.messages.length === 0) {
    input.focus();
    if (isMobile()) setNav(false, false);
    return;
  }
  activeId = null; // черновик: попадёт в список только после первого сообщения
  persist();
  renderSidebar();
  renderThread();
  updateLayout();
  stick = true;
  input.focus();
  if (isMobile()) setNav(false, false);
}

let confirmAction = null;
function openConfirmDialog({
  title,
  text,
  confirmLabel = "Удалить",
  onConfirm,
}) {
  modalTitle.textContent = title;
  modalText.textContent = text;
  modalConfirm.textContent = confirmLabel;
  confirmAction = onConfirm;
  modal.hidden = false;
  modalConfirm.focus();
}
function openConfirm(id) {
  const chat = chats.find((c) => c.id === id);
  if (!chat) return;
  openConfirmDialog({
    title: "Удалить чат?",
    text: `Чат «${chat.title || "Новый чат"}» будет удалён без возможности восстановления.`,
    onConfirm: () => deleteChat(id),
  });
}
function deleteChat(id) {
  if (generating && generating.chatId === id) stop();
  chats = chats.filter((c) => c.id !== id);
  if (activeId === id) {
    const next = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    activeId = next ? next.id : null;
  }
  persist();
  renderSidebar();
  renderThread();
  updateLayout();
  stick = true;
  scrollToBottom(false);
}
function closeModal() {
  modal.hidden = true;
  confirmAction = null;
}
function confirmDelete() {
  const action = confirmAction;
  closeModal();
  if (action) action();
}
$("#modalCancel").addEventListener("click", closeModal);
$("#modalDelete").addEventListener("click", confirmDelete);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
