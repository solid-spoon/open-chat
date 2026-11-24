"use strict";

/* ================= Sidebar: chat list ================= */
function renderSidebar() {
  chatList.innerHTML = "";
  if (!chats.length) {
    const hint = el("div", "list-hint");
    hint.textContent = "Your chats will appear here";
    chatList.appendChild(hint);
    return;
  }
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const today = +dayStart,
    yesterday = today - 864e5;
  const groups = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Older", items: [] },
  ];
  [...chats]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((c) => {
      const g = c.updatedAt >= today ? 0 : c.updatedAt >= yesterday ? 1 : 2;
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
      title.textContent = c.title || "New chat";
      const download = el("button", "icon-btn chat-download");
      download.type = "button";
      download.title = "Download (.md)";
      download.setAttribute("aria-label", "Download chat as Markdown");
      download.innerHTML = icon("download", 14);
      const edit = el("button", "icon-btn chat-edit");
      edit.type = "button";
      edit.title = "Rename chat";
      edit.setAttribute("aria-label", "Rename chat");
      edit.innerHTML = icon("pencil", 14);
      const del = el("button", "icon-btn chat-del");
      del.type = "button";
      del.title = "Delete chat";
      del.setAttribute("aria-label", "Delete chat");
      del.innerHTML = icon("trash", 15);
      item.append(title, download, edit, del);
      chatList.appendChild(item);
    });
  });
}

chatList.addEventListener("click", (e) => {
  const item = e.target.closest(".chat-item");
  if (!item) return;
  if (e.target.closest(".chat-rename")) return;
  if (e.target.closest(".chat-download")) {
    const chat = chats.find((c) => c.id === item.dataset.id);
    downloadChatMarkdown(chat);
    return;
  }
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
  field.value = chat.title || "New chat";
  field.maxLength = 120;
  field.setAttribute("aria-label", "Chat title");
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

/* ================= Chat navigation ================= */
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
  activeId = null; // Draft; it appears in the list after the first message
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
  confirmLabel = "Delete",
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
    title: "Delete chat?",
    text: `The chat “${chat.title || "New chat"}” will be permanently deleted.`,
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
