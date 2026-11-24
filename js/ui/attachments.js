"use strict";

/* ================= Attachments ================= */
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
const DOCUMENT_EXTENSIONS = ["docx", "pptx"];
const WORD_NAMESPACE =
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DRAWING_NAMESPACE =
  "http://schemas.openxmlformats.org/drawingml/2006/main";
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
    ) ||
    (file.type && file.type.startsWith("text/"))
  );
}
function isDocumentFile(file) {
  return DOCUMENT_EXTENSIONS.includes(fileExtension(file.name));
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not open image"));
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
  if (!ctx) throw new Error("Canvas is unavailable");
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
    name: file.name || "image",
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
    name: file.name || "file",
    size: file.size,
    mime: file.type || "",
    text: await file.text(),
    lang: TEXT_FILE_EXTENSIONS[ext] || "",
  };
}
function parseXmlDocument(source, label) {
  const doc = new DOMParser().parseFromString(source, "application/xml");
  if (doc.getElementsByTagName("parsererror").length)
    throw new Error(`Could not parse ${label}.`);
  return doc;
}
async function extractDocxText(zip) {
  const entry = zip.file("word/document.xml");
  if (!entry)
    throw new Error("The Word document does not contain word/document.xml.");
  const doc = parseXmlDocument(
    await entry.async("string"),
    "the Word document",
  );
  const paragraphs = [];
  Array.from(doc.getElementsByTagNameNS(WORD_NAMESPACE, "p")).forEach(
    (paragraph) => {
      let text = "";
      Array.from(paragraph.getElementsByTagNameNS(WORD_NAMESPACE, "*")).forEach(
        (node) => {
          if (node.localName === "t") text += node.textContent || "";
          else if (node.localName === "tab") text += "\t";
          else if (node.localName === "br" || node.localName === "cr")
            text += "\n";
        },
      );
      if (text.trim()) paragraphs.push(text.replace(/[ \t]+$/g, ""));
    },
  );
  return paragraphs.join("\n");
}
async function extractPptxText(zip) {
  const slides = Object.keys(zip.files)
    .map((name) => {
      const match = name.match(/^ppt\/slides\/slide(\d+)\.xml$/i);
      return match ? { name, index: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index);
  if (!slides.length)
    throw new Error("The PowerPoint presentation does not contain slides.");
  const sections = [];
  for (const slide of slides) {
    const doc = parseXmlDocument(
      await zip.file(slide.name).async("string"),
      `slide ${slide.index}`,
    );
    const paragraphs = [];
    Array.from(doc.getElementsByTagNameNS(DRAWING_NAMESPACE, "p")).forEach(
      (paragraph) => {
        let text = "";
        Array.from(
          paragraph.getElementsByTagNameNS(DRAWING_NAMESPACE, "t"),
        ).forEach((node) => {
          text += node.textContent || "";
        });
        if (text.trim()) paragraphs.push(text.trim());
      },
    );
    sections.push(
      `Slide ${slide.index}:${paragraphs.length ? "\n" + paragraphs.join("\n") : ""}`,
    );
  }
  return sections.join("\n\n");
}
async function prepareDocumentFile(file) {
  if (!window.JSZip)
    throw new Error("JSZip is unavailable. Check your internet connection.");
  const ext = fileExtension(file.name);
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const text =
    ext === "docx" ? await extractDocxText(zip) : await extractPptxText(zip);
  if (!text.trim())
    throw new Error("No text could be extracted from the document.");
  return {
    id: uid(),
    kind: "file",
    name: file.name || ext,
    size: file.size,
    mime: file.type || "",
    text,
    lang: "",
  };
}

async function addFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) return;
  const errors = [];
  for (const file of list) {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      errors.push(
        `“${file.name}” exceeds 10 MB (${formatBytes(file.size)}). Maximum size is 10 MB.`,
      );
      continue;
    }
    if (isImageFile(file)) {
      try {
        pendingAttachments.push(await prepareImage(file));
        renderAttachments();
        updateSendState();
      } catch {
        errors.push(`Could not process image “${file.name}”.`);
      }
    } else if (isDocumentFile(file)) {
      try {
        pendingAttachments.push(await prepareDocumentFile(file));
        renderAttachments();
        updateSendState();
      } catch (error) {
        errors.push(
          `Could not read document “${file.name}”: ${error.message || error}.`,
        );
      }
    } else if (isTextFile(file)) {
      try {
        pendingAttachments.push(await prepareTextFile(file));
        renderAttachments();
        updateSendState();
      } catch {
        errors.push(`Could not read file “${file.name}”.`);
      }
    } else {
      errors.push(
        `File “${file.name}” is not supported. Attach an image, text file, Word document, PowerPoint presentation, or code file.`,
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
    name.textContent = a.name || "file";
    const size = el("span", "attachment-size");
    size.textContent = formatBytes(a.size);
    info.append(name, size);
    const remove = el("button", "attachment-remove");
    remove.type = "button";
    remove.dataset.id = a.id;
    remove.title = "Remove attachment";
    remove.setAttribute("aria-label", `Remove attachment ${a.name || ""}`);
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
  if (!files.length && cd.files && cd.files.length) files.push(...cd.files);
  if (!files.length) return;
  e.preventDefault();
  addFiles(files);
});

/* ---------- Drag and drop ---------- */
const hasFileDrag = (e) =>
  !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
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

/* ---------- Convert attachments to OpenAI format ---------- */
function fileBlock(a) {
  if (!a.text) return "";
  const runs = a.text.match(/`+/g);
  const longest = runs ? Math.max(...runs.map((s) => s.length)) : 0;
  const fence = "`".repeat(Math.max(3, longest + 1));
  const body = a.text.endsWith("\n") ? a.text.slice(0, -1) : a.text;
  return `**File: ${a.name}**\n\n${fence}${a.lang || ""}\n${body}\n${fence}`;
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
