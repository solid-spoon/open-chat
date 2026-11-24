"use strict";

/* ================= Создание, хранение и скачивание файлов ================= */
const CREATE_FILES_TOOL = {
  type: "function",
  function: {
    name: "create_files",
    description: "Создаёт файлы и передаёт их пользователю для скачивания. Несколько файлов упаковываются в ZIP-архив.",
    parameters: {
      type: "object",
      properties: {
        archive_name: { type: "string", description: "Имя создаваемого ZIP-архива без расширения (необязательно)" },
        files: {
          type: "array",
          description: "Список файлов с относительным путём и текстовым содержимым",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "Относительный путь, например src/index.js" },
              content: { type: "string", description: "Полное содержимое файла" },
            },
            required: ["path", "content"],
            additionalProperties: false,
          },
        },
      },
      required: ["files"],
      additionalProperties: false,
    },
  },
};

function normalizeCreatedFiles(value, toolCalls = []) {
  if (!Array.isArray(value)) return [];
  return value.map((artifact) => {
    if (!artifact || !["file", "zip"].includes(artifact.type) ||
      (!Array.isArray(artifact.files) && !artifact.callId)) return null;
    let files = (Array.isArray(artifact.files) ? artifact.files : [])
      .filter((file) => file && typeof file.path === "string" && typeof file.content === "string")
      .map((file) => ({ path: file.path, content: file.content }));
    if (!files.length && artifact.callId) {
      const call = toolCalls.find((item) => item.id === artifact.callId);
      try {
        const args = JSON.parse(call && call.function && call.function.arguments || "{}");
        files = Array.isArray(args.files)
          ? args.files.map((file) => ({ path: normalizeCreatedPath(file.path), content: file.content }))
          : [];
      } catch {
        files = [];
      }
    }
    files = files.filter((file) => typeof file.content === "string").map((file) => {
      try { return { path: normalizeCreatedPath(file.path), content: file.content }; }
      catch { return null; }
    }).filter(Boolean);
    if (!files.length || (artifact.type === "file" && files.length !== 1)) return null;
    return {
      callId: typeof artifact.callId === "string" ? artifact.callId : "",
      type: artifact.type,
      name: typeof artifact.name === "string" ? artifact.name : files[0].path.split("/").pop(),
      count: files.length,
      size: Number.isFinite(+artifact.size) && +artifact.size >= 0 ? +artifact.size : 0,
      files,
    };
  }).filter(Boolean);
}

function normalizeCreatedPath(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("У каждого файла должен быть указан непустой path.");
  const path = value.trim().replace(/\\/g, "/");
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) throw new Error(`Путь «${value}» должен быть относительным.`);
  const parts = path.split("/").filter((part) => part && part !== ".");
  if (!parts.length || parts.some((part) => part === ".." || /[\u0000-\u001f]/.test(part))) {
    throw new Error(`Недопустимый путь файла: ${value}`);
  }
  return parts.join("/");
}

function normalizeArchiveName(value) {
  const base = (typeof value === "string" ? value : "")
    .trim()
    .replace(/\.zip$/i, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .replace(/\.+$/g, "")
    .slice(0, 120);
  return `${base || "project"}.zip`;
}

async function createFilesArtifact(args, callId) {
  if (!args || !Array.isArray(args.files) || !args.files.length) {
    throw new Error("Параметр files должен содержать хотя бы один файл.");
  }
  if (args.files.length > 500) throw new Error("За один вызов можно создать не более 500 файлов.");
  const seen = new Set();
  const files = args.files.map((file) => {
    if (!file || typeof file.content !== "string") throw new Error("Содержимое каждого файла должно быть строкой.");
    const path = normalizeCreatedPath(file.path);
    if (seen.has(path)) throw new Error(`Путь указан более одного раза: ${path}`);
    seen.add(path);
    return { path, content: file.content };
  });

  if (files.length === 1) {
    const file = files[0];
    return {
      callId,
      type: "file",
      name: file.path.split("/").pop(),
      size: new Blob([file.content]).size,
      count: 1,
      files,
    };
  }

  if (!window.JSZip) throw new Error("Не удалось загрузить JSZip. Проверьте подключение к интернету и повторите запрос.");
  const zip = new JSZip();
  files.forEach((file) => zip.file(file.path, file.content));
  const blob = await zip.generateAsync({ type: "blob" });
  return {
    callId,
    type: "zip",
    name: normalizeArchiveName(args.archive_name),
    size: blob.size,
    count: files.length,
    files,
  };
}

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0).replace(".", ",")} ${units[unit]}`;
}

async function downloadCreatedArtifact(artifact, button) {
  if (button) button.disabled = true;
  try {
    let blob;
    if (artifact.type === "file") {
      blob = new Blob([artifact.files[0].content], { type: "text/plain;charset=utf-8" });
    } else {
      if (!window.JSZip) throw new Error("Библиотека JSZip недоступна.");
      const zip = new JSZip();
      artifact.files.forEach((file) => zip.file(file.path, file.content));
      blob = await zip.generateAsync({ type: "blob" });
    }
    const url = URL.createObjectURL(blob);
    const link = el("a");
    link.href = url;
    link.download = artifact.name;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    showError(`Не удалось скачать файл: ${error.message || error}`, false);
  } finally {
    if (button) button.disabled = false;
  }
}

function buildCreatedFilesCard(artifact) {
  const card = el("div", "created-file-card");
  const iconNode = el("span", "created-file-icon");
  iconNode.innerHTML = icon(artifact.type === "zip" ? "archive" : "file", 20);
  const info = el("div", "created-file-info");
  const name = el("span", "created-file-name");
  name.textContent = artifact.name;
  const detail = el("span", "created-file-detail");
  if (artifact.type === "zip") {
    const paths = artifact.files.slice(0, 3).map((file) => file.path);
    const more = artifact.count > paths.length ? ` · +${artifact.count - paths.length}` : "";
    detail.textContent = `${artifact.count} файлов${paths.length ? ` · ${paths.join(", ")}${more}` : ""} · ${formatFileSize(artifact.size)}`;
  } else {
    detail.textContent = `${artifact.files[0].path} · ${formatFileSize(artifact.size)}`;
  }
  info.append(name, detail);
  const download = el("button", "created-file-download");
  download.type = "button";
  download.innerHTML = `${icon("download", 15)}<span>${artifact.type === "zip" ? "Скачать ZIP" : "Скачать"}</span>`;
  download.addEventListener("click", () => downloadCreatedArtifact(artifact, download));
  card.append(iconNode, info, download);
  return card;
}
