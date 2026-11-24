"use strict";

/* ================= File creation, storage, and downloads ================= */
const DOCX_LIBRARY_URL =
  "https://cdn.jsdelivr.net/npm/docx@9.16.0/dist/index.iife.js";
const PPTX_LIBRARY_URL =
  "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js";
const externalScriptLoads = new Map();

const CREATE_FILES_TOOL = {
  type: "function",
  function: {
    name: "create_files",
    description:
      "Creates files and makes them available for download. Plain-text and code files use the content field. Word documents (.docx) use structured blocks (headings, paragraphs, lists, tables). PowerPoint presentations (.pptx) use a slides array. Multiple files are bundled into a ZIP archive.",
    parameters: {
      type: "object",
      properties: {
        archive_name: {
          type: "string",
          description: "Optional ZIP archive name without the file extension",
        },
        files: {
          type: "array",
          description:
            "List of files. Use path ending in .docx with blocks for Word, path ending in .pptx with slides for PowerPoint, and path with content for other files.",
          items: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Relative file path, for example src/index.js",
              },
              content: {
                type: "string",
                description:
                  "Full text contents. Not required for .docx and .pptx files.",
              },
              blocks: {
                type: "array",
                description: "Structured Word document content (.docx only)",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["heading", "paragraph", "list", "table"],
                      description: "Block type",
                    },
                    text: {
                      type: "string",
                      description: "Text for a heading or paragraph block",
                    },
                    level: {
                      type: "integer",
                      description: "Heading level from 1 to 6",
                    },
                    ordered: {
                      type: "boolean",
                      description: "Use numbered items for a list block",
                    },
                    items: {
                      type: "array",
                      items: { type: "string" },
                      description: "List items for a list block",
                    },
                    headers: {
                      type: "array",
                      items: { type: "string" },
                      description: "Header cells for a table block",
                    },
                    rows: {
                      type: "array",
                      description: "Rows of table cell strings",
                      items: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                  },
                  required: ["type"],
                  additionalProperties: false,
                },
              },
              slides: {
                type: "array",
                description:
                  "Slides for a PowerPoint presentation (.pptx only)",
                items: {
                  type: "object",
                  properties: {
                    title: {
                      type: "string",
                      description: "Slide title",
                    },
                    text: {
                      type: "string",
                      description: "Optional paragraph text",
                    },
                    bullets: {
                      type: "array",
                      items: { type: "string" },
                      description: "Bullet points",
                    },
                    notes: {
                      type: "string",
                      description: "Optional speaker notes",
                    },
                  },
                  additionalProperties: false,
                },
              },
            },
            required: ["path"],
            additionalProperties: false,
          },
        },
      },
      required: ["files"],
      additionalProperties: false,
    },
  },
};

function loadExternalScript(src, label) {
  if (externalScriptLoads.has(src)) return externalScriptLoads.get(src);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      externalScriptLoads.delete(src);
      reject(
        new Error(
          `Could not load ${label}. Check your internet connection and try again.`,
        ),
      );
    };
    document.head.appendChild(script);
  });
  externalScriptLoads.set(src, promise);
  return promise;
}
async function loadDocxLibrary() {
  if (!window.docx) {
    await loadExternalScript(DOCX_LIBRARY_URL, "the Word generator");
    if (!window.docx) {
      externalScriptLoads.delete(DOCX_LIBRARY_URL);
      throw new Error("The Word generator is unavailable.");
    }
  }
  return window.docx;
}
async function loadPptxLibrary() {
  if (!window.PptxGenJS) {
    await loadExternalScript(PPTX_LIBRARY_URL, "the PowerPoint generator");
    if (!window.PptxGenJS) {
      externalScriptLoads.delete(PPTX_LIBRARY_URL);
      throw new Error("The PowerPoint generator is unavailable.");
    }
  }
  return window.PptxGenJS;
}

function createdFileExtension(path) {
  const index = path.lastIndexOf(".");
  return index >= 0 ? path.slice(index + 1).toLowerCase() : "";
}
function createdFileFormat(path) {
  const ext = createdFileExtension(path);
  return ext === "docx" || ext === "pptx" ? ext : "";
}
function cleanCreatedText(value) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeCreatedFileEntry(file) {
  if (!file || typeof file !== "object") return null;
  let path;
  try {
    path = normalizeCreatedPath(file.path);
  } catch {
    return null;
  }
  const entry = { path };
  if (typeof file.content === "string") entry.content = file.content;
  if (Array.isArray(file.blocks)) entry.blocks = file.blocks;
  if (Array.isArray(file.slides)) entry.slides = file.slides;
  const format = createdFileFormat(path);
  if (!format) {
    if (typeof entry.content !== "string") return null;
  } else if (format === "docx") {
    if (typeof entry.content !== "string" && !entry.blocks) return null;
  } else if (typeof entry.content !== "string" && !entry.slides) {
    return null;
  }
  return entry;
}

function normalizeCreatedFiles(value, toolCalls = []) {
  if (!Array.isArray(value)) return [];
  return value
    .map((artifact) => {
      if (
        !artifact ||
        !["file", "zip"].includes(artifact.type) ||
        (!Array.isArray(artifact.files) && !artifact.callId)
      )
        return null;
      let files = (Array.isArray(artifact.files) ? artifact.files : [])
        .map(normalizeCreatedFileEntry)
        .filter(Boolean);
      if (!files.length && artifact.callId) {
        const call = toolCalls.find((item) => item.id === artifact.callId);
        try {
          const args = JSON.parse(
            (call && call.function && call.function.arguments) || "{}",
          );
          files = Array.isArray(args.files)
            ? args.files.map(normalizeCreatedFileEntry).filter(Boolean)
            : [];
        } catch {
          files = [];
        }
      }
      if (!files.length || (artifact.type === "file" && files.length !== 1))
        return null;
      return {
        callId: typeof artifact.callId === "string" ? artifact.callId : "",
        type: artifact.type,
        name:
          typeof artifact.name === "string"
            ? artifact.name
            : files[0].path.split("/").pop(),
        count: files.length,
        size:
          Number.isFinite(+artifact.size) && +artifact.size >= 0
            ? +artifact.size
            : 0,
        files,
      };
    })
    .filter(Boolean);
}

function normalizeCreatedPath(value) {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Each file must have a non-empty path.");
  const path = value.trim().replace(/\\/g, "/");
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path))
    throw new Error(`Path “${value}” must be relative.`);
  const parts = path.split("/").filter((part) => part && part !== ".");
  if (
    !parts.length ||
    parts.some((part) => part === ".." || /[\u0000-\u001f]/.test(part))
  ) {
    throw new Error(`Invalid file path: ${value}`);
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

/* ---------- Word (.docx) ---------- */
function docxBlocksForFile(file) {
  if (Array.isArray(file.blocks) && file.blocks.length) return file.blocks;
  return cleanCreatedText(file.content)
    .split(/\r?\n/)
    .map((line) => ({ type: "paragraph", text: line }));
}
async function buildDocxBlob(file) {
  const lib = await loadDocxLibrary();
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    Table,
    TableRow,
    TableCell,
    WidthType,
  } = lib;
  const children = [];
  const addTextParagraph = (text, options = {}) => {
    children.push(
      new Paragraph({
        ...options,
        children: [new TextRun({ text: cleanCreatedText(text) })],
      }),
    );
  };
  const addTableRow = (cells, header) =>
    new TableRow({
      children: cells.map(
        (cell) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: cleanCreatedText(cell),
                    bold: header,
                  }),
                ],
              }),
            ],
          }),
      ),
    });

  docxBlocksForFile(file).forEach((block) => {
    if (!block || typeof block !== "object") return;
    const type = block.type;
    if (type === "heading" || type === "title") {
      const level = Math.min(6, Math.max(1, parseInt(block.level, 10) || 1));
      addTextParagraph(block.text, {
        heading: HeadingLevel[`HEADING_${level}`] || HeadingLevel.HEADING_1,
      });
    } else if (type === "list") {
      const items = Array.isArray(block.items) ? block.items : [];
      items.forEach((item, itemIndex) => {
        const text = cleanCreatedText(item);
        if (block.ordered) addTextParagraph(`${itemIndex + 1}. ${text}`);
        else addTextParagraph(text, { bullet: { level: 0 } });
      });
    } else if (type === "table") {
      const headers = Array.isArray(block.headers)
        ? block.headers.map(cleanCreatedText)
        : [];
      const rows = Array.isArray(block.rows)
        ? block.rows.filter(Array.isArray)
        : [];
      const tableRows = [];
      if (headers.length) tableRows.push(addTableRow(headers, true));
      rows.forEach((row) => tableRows.push(addTableRow(row, false)));
      if (tableRows.length) {
        children.push(
          new Table({
            width: WidthType
              ? { size: 100, type: WidthType.PERCENTAGE }
              : undefined,
            rows: tableRows,
          }),
        );
      }
    } else {
      cleanCreatedText(block.text)
        .split(/\r?\n/)
        .forEach((line) => addTextParagraph(line));
    }
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children.length ? children : [new Paragraph("")],
      },
    ],
  });
  return Packer.toBlob(doc);
}

/* ---------- PowerPoint (.pptx) ---------- */
function pptxSlidesForFile(file) {
  if (Array.isArray(file.slides) && file.slides.length) return file.slides;
  return cleanCreatedText(file.content)
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const lines = chunk
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      return { title: lines.shift() || "", bullets: lines };
    });
}
async function buildPptxBlob(file) {
  const PptxGenJS = await loadPptxLibrary();
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  let slides = pptxSlidesForFile(file);
  if (!slides.length)
    slides = [{ title: file.path.split("/").pop() || "Slide" }];
  slides.forEach((data) => {
    const slide = pptx.addSlide();
    const title = cleanCreatedText(data.title).trim();
    if (title)
      slide.addText(title, {
        x: 0.5,
        y: 0.35,
        w: 9,
        h: 0.9,
        fontSize: 28,
        bold: true,
        color: "1F1F1F",
      });
    const body = cleanCreatedText(data.text).trim();
    if (body)
      slide.addText(body, {
        x: 0.5,
        y: title ? 1.35 : 0.65,
        w: 9,
        h: 1.1,
        fontSize: 16,
        color: "333333",
        valign: "top",
      });
    const bullets = Array.isArray(data.bullets)
      ? data.bullets.map(cleanCreatedText).filter((line) => line.trim())
      : [];
    if (bullets.length) {
      slide.addText(
        bullets.map((line) => ({
          text: line,
          options: { bullet: true, breakLine: true },
        })),
        {
          x: 0.5,
          y: title ? 2.05 : 1.35,
          w: 9,
          h: 3,
          fontSize: 16,
          color: "333333",
          valign: "top",
        },
      );
    }
    const notes = cleanCreatedText(data.notes).trim();
    if (notes && typeof slide.addNotes === "function") slide.addNotes(notes);
  });
  const output = await pptx.write({ outputType: "blob" });
  return output instanceof Blob
    ? output
    : new Blob([output], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
}

async function createdFileBlob(file) {
  const format = createdFileFormat(file.path);
  if (format === "docx") return buildDocxBlob(file);
  if (format === "pptx") return buildPptxBlob(file);
  return new Blob([typeof file.content === "string" ? file.content : ""], {
    type: "text/plain;charset=utf-8",
  });
}

async function createFilesArtifact(args, callId) {
  if (!args || !Array.isArray(args.files) || !args.files.length) {
    throw new Error("The files parameter must contain at least one file.");
  }
  if (args.files.length > 500)
    throw new Error("A maximum of 500 files can be created per call.");
  const seen = new Set();
  const files = args.files.map((file) => {
    if (!file || typeof file !== "object")
      throw new Error("Each file must be an object.");
    const path = normalizeCreatedPath(file.path);
    if (seen.has(path)) throw new Error(`Duplicate file path: ${path}`);
    seen.add(path);
    const format = createdFileFormat(path);
    const entry = { path };
    if (typeof file.content === "string") entry.content = file.content;
    if (format === "docx" && Array.isArray(file.blocks))
      entry.blocks = file.blocks;
    if (format === "pptx" && Array.isArray(file.slides))
      entry.slides = file.slides;
    if (!format && typeof entry.content !== "string")
      throw new Error(`File “${path}” must have string content.`);
    if (format === "docx" && typeof entry.content !== "string" && !entry.blocks)
      throw new Error(`Word file “${path}” requires blocks or content.`);
    if (format === "pptx" && typeof entry.content !== "string" && !entry.slides)
      throw new Error(`PowerPoint file “${path}” requires slides or content.`);
    return entry;
  });

  const prepared = [];
  for (const file of files) {
    prepared.push({
      file,
      blob: createdFileFormat(file.path) ? await createdFileBlob(file) : null,
    });
  }

  if (files.length === 1) {
    const { file, blob } = prepared[0];
    return {
      callId,
      type: "file",
      name: file.path.split("/").pop(),
      size: blob ? blob.size : new Blob([file.content]).size,
      count: 1,
      files,
    };
  }

  if (!window.JSZip)
    throw new Error(
      "Could not load JSZip. Check your internet connection and try again.",
    );
  const zip = new JSZip();
  prepared.forEach(({ file, blob }) => {
    if (blob) zip.file(file.path, blob);
    else zip.file(file.path, file.content);
  });
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
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size < 10 ? 1 : 0)} ${units[unit]}`;
}

async function downloadCreatedArtifact(artifact, button) {
  if (button) button.disabled = true;
  try {
    let blob;
    if (artifact.type === "file") {
      const file = artifact.files[0];
      blob = createdFileFormat(file.path)
        ? await createdFileBlob(file)
        : new Blob([file.content || ""], {
            type: "text/plain;charset=utf-8",
          });
    } else {
      if (!window.JSZip) throw new Error("JSZip is unavailable.");
      const zip = new JSZip();
      for (const file of artifact.files) {
        if (createdFileFormat(file.path)) {
          zip.file(file.path, await createdFileBlob(file));
        } else {
          zip.file(file.path, file.content || "");
        }
      }
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
    showError(`Could not download file: ${error.message || error}`, false);
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
    const more =
      artifact.count > paths.length
        ? ` · +${artifact.count - paths.length}`
        : "";
    detail.textContent = `${artifact.count} ${plural(artifact.count, "file", "files")}${paths.length ? ` · ${paths.join(", ")}${more}` : ""} · ${formatFileSize(artifact.size)}`;
  } else {
    detail.textContent = `${artifact.files[0].path} · ${formatFileSize(artifact.size)}`;
  }
  info.append(name, detail);
  const download = el("button", "created-file-download");
  download.type = "button";
  download.innerHTML = `${icon("download", 15)}<span>${artifact.type === "zip" ? "Download ZIP" : "Download"}</span>`;
  download.addEventListener("click", () =>
    downloadCreatedArtifact(artifact, download),
  );
  card.append(iconNode, info, download);
  return card;
}
