"use strict";

/* ================= State ================= */
let chats = [];
let activeId = null;
let model = (() => {
  const v = store.get(localStorage, LS.model);
  return MODELS.some((m) => m.id === v) ? v : MODELS[0] ? MODELS[0].id : "";
})();
let reasoningEffort = (() => {
  const value = store.get(localStorage, LS.reasoningEffort);
  return ["none", "low", "medium", "high"].includes(value) ? value : "medium";
})();
let generating = null; // { ctl, chat, chatId, msg, t0, usage, model }
let streamBody = null; // .md element for the streaming message
let streamThinking = null;
let renderTimer = null;
let stick = true; // Keep auto-scroll pinned to the bottom
let sidebarOpen = true;
let lastSave = 0,
  storageWarned = false;

const getActive = () => chats.find((c) => c.id === activeId) || null;

async function initializeChatState() {
  chats = normalizeChats(await loadChatsFromDatabase());
  const storedActive = store.get(localStorage, LS.active);
  activeId = chats.some((chat) => chat.id === storedActive) ? storedActive : null;
  if (!activeId && chats.length) activeId = chats[0].id;
}
function normalizeAttachment(a) {
  if (!a || typeof a !== "object") return null;
  const kind = a.kind === "image" ? "image" : "file";
  const name = typeof a.name === "string" && a.name ? a.name : "file";
  const size = +a.size || 0;
  const mime = typeof a.mime === "string" ? a.mime : "";
  if (kind === "image") {
    const dataUrl =
      typeof a.dataUrl === "string" && a.dataUrl.startsWith("data:image/")
        ? a.dataUrl
        : "";
    const thumb =
      typeof a.thumb === "string" && a.thumb.startsWith("data:image/")
        ? a.thumb
        : "";
    return {
      id: typeof a.id === "string" && a.id ? a.id : uid(),
      ...(typeof a.storageId === "string" ? { storageId: a.storageId } : {}),
      kind,
      name,
      size,
      mime,
      dataUrl,
      thumb,
      width: +a.width || 0,
      height: +a.height || 0,
      truncated: !!a.truncated || (!dataUrl && !thumb),
    };
  }
  const text = typeof a.text === "string" ? a.text : "";
  return {
    id: typeof a.id === "string" && a.id ? a.id : uid(),
    ...(typeof a.storageId === "string" ? { storageId: a.storageId } : {}),
    kind,
    name,
    size,
    mime,
    text,
    lang: typeof a.lang === "string" ? a.lang : "",
    truncated: !!a.truncated || !text,
  };
}
function normalizeChats(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((c) => c && Array.isArray(c.messages))
    .map((c) => {
      const messages = (c.messages || [])
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string",
        )
        .map((m) => {
          const attachments = Array.isArray(m.attachments)
            ? m.attachments.map(normalizeAttachment).filter(Boolean)
            : [];
          const createdFiles = normalizeCreatedFiles(m.createdFiles, m.toolCalls);
          const result = {
            id: m.id || uid(),
            role: m.role,
            content: m.content,
            meta: m.meta && typeof m.meta === "object" ? m.meta : null,
          };
          if (typeof m.reasoning === "string") result.reasoning = m.reasoning;
          if (Number.isFinite(+m.reasoningMs)) result.reasoningMs = +m.reasoningMs;
          if (["none", "low", "medium", "high"].includes(m.reasoningEffort))
            result.reasoningEffort = m.reasoningEffort;
          if (createdFiles.length) result.createdFiles = createdFiles;
          if (Array.isArray(m.toolCalls)) {
            result.toolCalls = m.toolCalls
              .filter(
                (call) =>
                  call &&
                  typeof call.id === "string" &&
                  call.function &&
                  typeof call.function.name === "string" &&
                  typeof call.function.arguments === "string",
              )
              .map((call) => ({
                id: call.id,
                type: "function",
                function: {
                  name: call.function.name,
                  arguments: call.function.arguments,
                },
              }));
          }
          if (Array.isArray(m.toolResults)) {
            result.toolResults = m.toolResults
              .filter(
                (result) =>
                  result &&
                  typeof result.tool_call_id === "string" &&
                  typeof result.content === "string",
              )
              .map((result) => ({
                tool_call_id: result.tool_call_id,
                content: result.content,
              }));
          }
          if (attachments.length) result.attachments = attachments;
          return result;
        });
      return {
        id: typeof c.id === "string" && c.id ? c.id : uid(),
        title: typeof c.title === "string" && c.title ? c.title : "New chat",
        createdAt: +c.createdAt || Date.now(),
        updatedAt: +c.updatedAt || Date.now(),
        messages,
      };
    });
}
function persist(chat = null) {
  lastSave = Date.now();
  try {
    localStorage.setItem("llmchat.active.v1", activeId || "");
  } catch {}
  const target = chat || (generating && generating.chat) || getActive();
  if (!target) return;
  saveChat(target).catch((error) => {
    if (storageWarned) return;
    storageWarned = true;
    showError(`Could not save chat history: ${error.message || error}`, false);
  });
}
function throttledPersist() {
  if (Date.now() - lastSave > 800) persist(generating && generating.chat);
}

function makeTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  const words = clean.split(" ").slice(0, 7).join(" ");
  const cut = words.length > 48 ? words.slice(0, 48).trimEnd() : words;
  return cut + (cut.length < clean.length ? "…" : "");
}
