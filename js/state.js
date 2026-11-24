"use strict";

/* ================= Состояние ================= */
let chats = loadChats();
let activeId = (() => {
  const v = store.get(localStorage, LS.active);
  return v && chats.some((c) => c.id === v) ? v : null;
})();
let model = (() => {
  const v = store.get(localStorage, LS.model);
  return MODELS.some((m) => m.id === v) ? v : MODELS[0].id;
})();
let reasoningEffort = (() => {
  const value = store.get(localStorage, LS.reasoningEffort);
  return ["none", "low", "medium", "high"].includes(value) ? value : "medium";
})();
let generating = null; // { ctl, chat, chatId, msg, t0, usage, model }
let streamBody = null; // .md-узел стримящегося сообщения
let streamThinking = null;
let renderTimer = null;
let stick = true; // автоскролл прилеплен к низу
let sidebarOpen = true;
let lastSave = 0,
  storageWarned = false;

const getActive = () => chats.find((c) => c.id === activeId) || null;

function loadChats() {
  try {
    const raw = store.get(localStorage, LS.chats);
    if (!raw) return [];
    return normalizeChats(JSON.parse(raw));
  } catch {
    return [];
  }
}
function normalizeAttachment(a) {
  if (!a || typeof a !== "object") return null;
  const kind = a.kind === "image" ? "image" : "file";
  const name = typeof a.name === "string" && a.name ? a.name : "файл";
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
    .map((c) => ({
      id: typeof c.id === "string" && c.id ? c.id : uid(),
      title: typeof c.title === "string" ? c.title : "",
      createdAt: +c.createdAt || Date.now(),
      updatedAt: +c.updatedAt || Date.now(),
      messages: c.messages
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
          return {
            id: m.id || uid(),
            role: m.role,
            content: m.content,
            meta: m.meta && typeof m.meta === "object" ? m.meta : null,
            ...(typeof m.reasoning === "string" ? { reasoning: m.reasoning } : {}),
            ...(Number.isFinite(+m.reasoningMs) ? { reasoningMs: +m.reasoningMs } : {}),
            ...(["none", "low", "medium", "high"].includes(m.reasoningEffort)
              ? { reasoningEffort: m.reasoningEffort }
              : {}),
            ...(createdFiles.length
              ? { createdFiles }
              : {}),
            ...(Array.isArray(m.toolCalls) ? {
              toolCalls: m.toolCalls.filter((call) => call && typeof call.id === "string" && call.function && typeof call.function.name === "string" && typeof call.function.arguments === "string").map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.function.name, arguments: call.function.arguments },
              })),
            } : {}),
            ...(Array.isArray(m.toolResults) ? {
              toolResults: m.toolResults.filter((result) => result && typeof result.tool_call_id === "string" && typeof result.content === "string").map((result) => ({
                tool_call_id: result.tool_call_id,
                content: result.content,
              })),
            } : {}),
            ...(attachments.length ? { attachments } : {}),
          };
        }),
    }));
}
function slimChatsForStorage() {
  return chats.map((c) => ({
    ...c,
    messages: c.messages.map((m) => {
      if (!m.attachments || !m.attachments.length) return slimCreatedFiles(m);
      return {
        ...slimCreatedFiles(m),
        attachments: m.attachments.map((a) => {
          if (a.kind === "image")
            return { ...a, dataUrl: a.thumb || "", truncated: true };
          return { ...a, text: "", truncated: true };
        }),
      };
    }),
  }));
}
function slimCreatedFiles(message) {
  if (!Array.isArray(message.createdFiles) || !message.createdFiles.length) return message;
  return {
    ...message,
    createdFiles: message.createdFiles.map(({ files, ...artifact }) => artifact),
  };
}
function chatsForStorage() {
  return chats.map((chat) => ({
    ...chat,
    messages: chat.messages.map(slimCreatedFiles),
  }));
}
function persist() {
  lastSave = Date.now();
  let ok = store.set(localStorage, LS.chats, JSON.stringify(chatsForStorage()));
  if (!ok) {
    ok = store.set(
      localStorage,
      LS.chats,
      JSON.stringify(slimChatsForStorage()),
    );
  }
  store.set(localStorage, LS.active, activeId || "");
  if (!ok && !storageWarned) {
    storageWarned = true;
    showError(
      "Не удалось сохранить историю: хранилище браузера недоступно или переполнено.",
      false,
    );
  }
}
function throttledPersist() {
  if (Date.now() - lastSave > 800) persist();
}

function makeTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  const words = clean.split(" ").slice(0, 7).join(" ");
  const cut = words.length > 48 ? words.slice(0, 48).trimEnd() : words;
  return cut + (cut.length < clean.length ? "…" : "");
}
