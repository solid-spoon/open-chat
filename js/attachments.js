"use strict";

/* ================= Вложения ================= */
const TEXT_FILE_EXTENSIONS = {
  txt: "",
  md: "markdown",
  py: "python",
  js: "javascript",
  ts: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  json: "json",
  html: "html",
  css: "css",
  csv: "csv",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  log: "",
  sql: "sql",
  sh: "bash",
  go: "go",
  rs: "rust",
  c: "c",
  cpp: "cpp",
  java: "java",
  env: "ini",
};
const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif",
];
let pendingAttachments = [];

const hasPendingAttachments = () => pendingAttachments.length > 0;

function takePendingAttachments() {
  const items = pendingAttachments;
  pendingAttachments = [];
  renderAttachments();
  return items;
}
function setPendingAttachments(items) {
  pendingAttachments = (items || []).map((a) => ({ ...a }));
  renderAttachments();
  updateSendState();
}
function fileExtension(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}
function isImageFile(file) {
  return (
    (file.type && file.type.startsWith("image/")) ||
    IMAGE_EXTENSIONS.includes(fileExtension(file.name))
  );
}
function isTextFile(file) {
  return (
    Object.prototype.hasOwnProperty.call(
      TEXT_FILE_EXTENSIONS,
      fileExtension(file.name),
    ) || (file.type && file.type.startsWith("text/"))
  );
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("Не удалось прочитать файл"));
    reader.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не удалось открыть изображение"));
    img.src = src;
  });
}
function resizeToJpeg(img, maxSide, quality) {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas недоступен");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", quality);
}
async function prepareImage(file) {
  const original = await readFileAsDataURL(file);
  const img = await loadImage(original);
  let dataUrl = original;
  if (file.size > IMAGE_COMPRESS_THRESHOLD) {
    try {
      dataUrl = resizeToJpeg(img, IMAGE_MAX_SIDE, IMAGE_QUALITY);
    } catch {
      dataUrl = original;
    }
  }
  let thumb = "";
  try {
    thumb = resizeToJpeg(img, THUMB_MAX_SIDE, THUMB_QUALITY);
  } catch {}
  return {
    id: uid(),
    kind: "image",
    name: file.name || "изображение",
    size: file.size,
    mime: file.type || "image/*",
    dataUrl,
    thumb,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
  };
}
async function prepareTextFile(file) {
  const ext = fileExtension(file.name);
  return {
    id: uid(),
    kind: "file",
    name: file.name || "файл",
    size: file.size,
    mime: file.type || "",
    text: await file.text(),
    lang: TEXT_FILE_EXTENSIONS[ext] || "",
  };
}

async function addFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  const errors = [];
  for (const file of list) {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      errors.push(
        `«${file.name}» больше 10 МБ (${formatBytes(file.size)}). Максимум — 10 МБ.`,
      );
      continue;
    }
    if (isImageFile(file)) {
      try {
        pendingAttachments.push(await prepareImage(file));
        renderAttachments();
        updateSendState();
      } catch {
        errors.push(`Не удалось обработать изображение «${file.name}».`);
      }
    } else if (isTextFile(file)) {
      try {
        pendingAttachments.push(await prepareTextFile(file));
        renderAttachments();
        updateSendState();
      } catch {
        errors.push(`Не удалось прочитать файл «${file.name}».`);
      }
    } else {
      errors.push(
        `Файл «${file.name}» не поддерживается. Прикрепите изображение или текстовый/кодовый файл.`,
      );
    }
  }
  if (errors.length) showError(errors.join(" "), false);
}

function renderAttachments() {
  attachmentsBar.innerHTML = "";
  attachmentsBar.hidden = !pendingAttachments.length;
  pendingAttachments.forEach((a) => {
    const chip = el("div", "attachment-chip");
    const src = a.kind === "image" && (a.thumb || a.dataUrl);
    if (src) {
      const img = el("img", "attachment-thumb");
      img.src = a.thumb || a.dataUrl;
      img.alt = a.name || "";
      chip.appendChild(img);
    } else {
      const ico = el("span", "attachment-icon");
      ico.innerHTML = icon(a.kind === "image" ? "image" : "file", 18);
      chip.appendChild(ico);
    }
    const info = el("div", "attachment-info");
    const name = el("span", "attachment-name");
    name.textContent = a.name || "файл";
    const size = el("span", "attachment-size");
    size.textContent = formatBytes(a.size);
    info.append(name, size);
    const remove = el("button", "attachment-remove");
    remove.type = "button";
    remove.dataset.id = a.id;
    remove.title = "Удалить вложение";
    remove.setAttribute("aria-label", `Удалить вложение ${a.name || ""}`);
    remove.innerHTML = icon("x", 13);
    chip.append(info, remove);
    attachmentsBar.appendChild(chip);
  });
}

attachmentsBar.addEventListener("click", (e) => {
  const btn = e.target.closest(".attachment-remove");
  if (!btn) return;
  pendingAttachments = pendingAttachments.filter(
    (a) => a.id !== btn.dataset.id,
  );
  renderAttachments();
  updateSendState();
});
attachBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});
input.addEventListener("paste", (e) => {
  const cd = e.clipboardData;
  if (!cd) return;
  const files = [];
  if (cd.items && cd.items.length) {
    for (const item of cd.items) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (!files.length && cd.files && cd.files.length)
    files.push(...cd.files);
  if (!files.length) return;
  e.preventDefault();
  addFiles(files);
});

/* ---------- Перетаскивание файлов ---------- */
const hasFileDrag = (e) =>
  !!e.dataTransfer &&
  Array.from(e.dataTransfer.types || []).includes("Files");
let dragDepth = 0;
function resetDrop() {
  dragDepth = 0;
  dropOverlay.hidden = true;
}
app.addEventListener("dragenter", (e) => {
  if (!hasFileDrag(e)) return;
  e.preventDefault();
  dragDepth++;
  if (settingsModal.hidden && modal.hidden) dropOverlay.hidden = false;
});
app.addEventListener("dragover", (e) => {
  if (!hasFileDrag(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
});
app.addEventListener("dragleave", () => {
  if (!dragDepth) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropOverlay.hidden = true;
});
app.addEventListener("drop", (e) => {
  if (!hasFileDrag(e)) return;
  e.preventDefault();
  resetDrop();
  if (!settingsModal.hidden || !modal.hidden) return;
  addFiles(e.dataTransfer.files);
});
window.addEventListener("dragover", (e) => {
  if (hasFileDrag(e)) e.preventDefault();
});
window.addEventListener("drop", (e) => {
  if (hasFileDrag(e)) e.preventDefault();
  resetDrop();
});
window.addEventListener("dragend", resetDrop);

/* ---------- Преобразование в формат OpenAI ---------- */
function fileBlock(a) {
  if (!a.text) return "";
  const runs = a.text.match(/`+/g);
  const longest = runs ? Math.max(...runs.map((s) => s.length)) : 0;
  const fence = "`".repeat(Math.max(3, longest + 1));
  const body = a.text.endsWith("\n") ? a.text.slice(0, -1) : a.text;
  return `**Файл: ${a.name}**\n\n${fence}${a.lang || ""}\n${body}\n${fence}`;
}
function buildApiMessage(m) {
  const attachments = m.attachments || [];
  const files = attachments.filter((a) => a.kind === "file");
  const images = attachments.filter((a) => a.kind === "image" && a.dataUrl);
  let text = m.content || "";
  const blocks = files.map(fileBlock).filter(Boolean);
  if (blocks.length) text += (text ? "\n\n" : "") + blocks.join("\n\n");
  if (!images.length) return { role: m.role, content: text };
  const content = [{ type: "text", text }];
  images.forEach((a) =>
    content.push({ type: "image_url", image_url: { url: a.dataUrl } }),
  );
  return { role: m.role, content };
}
function toApiMessage(m) {
  if (m.role !== "user") return { role: m.role, content: m.content };
  return buildApiMessage(m);
}

function initAttachments() {
  renderAttachments();
}
