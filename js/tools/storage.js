"use strict";

/* ================= Local Storage RAG (storage/index.json + chunks.json) ================= */
const STORAGE_INDEX_URL = "./storage/index.json";
const STORAGE_CHUNKS_URL = "./storage/chunks.json";
const STORAGE_TIMEOUT_MS = 8000;
const STORAGE_MAX_SEARCH_RESULTS = 5;
const STORAGE_DEFAULT_READ_CHARS = 8000;

let storageIndexCache = null;
let storageChunksCache = null;

const STORAGE_TOOLS = [
  {
    type: "function",
    function: {
      name: "storage_search",
      description:
        "Searches the local curated knowledge base (storage/) for user notes, documentation, and reference data. Returns matching chunk IDs, titles, summaries, and tags. If no relevant results are found, answer using your own knowledge.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Search keywords or topic in English (index tags and summaries are in English; translate non-English queries to English keywords for best results).",
          },
          mode: {
            type: "string",
            enum: ["lazy", "deep"],
            description:
              "lazy searches tags, titles, and summaries (fast, default); deep also searches full chunk text.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "storage_read",
      description:
        "Reads the full text of specific chunks found via storage_search.",
      parameters: {
        type: "object",
        properties: {
          ids: {
            type: "array",
            items: { type: "string" },
            description: "List of 1 to 4 chunk IDs from storage_search",
          },
        },
        required: ["ids"],
        additionalProperties: false,
      },
    },
  },
];

function tokenizeStorageQuery(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

async function fetchStorageJson(url, signal) {
  if (signal && signal.aborted) {
    const error = new Error("Storage request stopped");
    error.name = "AbortError";
    throw error;
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), STORAGE_TIMEOUT_MS);
  const onAbort = () => ctl.abort();
  if (signal) signal.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: "no-cache" });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Storage HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

async function loadStorageIndex(signal) {
  if (Array.isArray(storageIndexCache)) return storageIndexCache;
  const data = await fetchStorageJson(STORAGE_INDEX_URL, signal);
  storageIndexCache = Array.isArray(data) ? data : [];
  return storageIndexCache;
}

async function loadStorageChunks(signal) {
  if (storageChunksCache && typeof storageChunksCache === "object")
    return storageChunksCache;
  const data = await fetchStorageJson(STORAGE_CHUNKS_URL, signal);
  storageChunksCache = data && typeof data === "object" ? data : {};
  return storageChunksCache;
}

async function executeStorageTool(name, args, signal) {
  try {
    if (name === "storage_search") {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) return { error: "The query parameter must be non-empty." };
      const mode = args.mode === "deep" ? "deep" : "lazy";
      const index = await loadStorageIndex(signal);
      if (!index.length) {
        return {
          query,
          mode,
          results: [],
          note: "Local storage knowledge base is empty.",
        };
      }
      const tokens = tokenizeStorageQuery(query);
      if (!tokens.length) return { query, mode, results: [] };

      const chunks = mode === "deep" ? await loadStorageChunks(signal) : null;
      const scored = [];

      for (const item of index) {
        let score = 0;
        const tags = Array.isArray(item.tags)
          ? item.tags.map((tag) => String(tag).toLowerCase())
          : [];
        const title = String(item.title || "").toLowerCase();
        const summary = String(item.summary || "").toLowerCase();
        const source = String(item.source || "").toLowerCase();
        const fullText =
          chunks && typeof chunks[item.id] === "string"
            ? chunks[item.id].toLowerCase()
            : "";

        for (const tok of tokens) {
          if (tags.some((t) => t === tok)) score += 4;
          else if (tags.some((t) => t.includes(tok))) score += 2;
          if (title.includes(tok)) score += 3;
          if (summary.includes(tok)) score += 1.5;
          if (source.includes(tok)) score += 1;
          if (fullText && fullText.includes(tok)) score += 1;
        }
        if (score > 0) scored.push({ score, item });
      }

      scored.sort((a, b) => b.score - a.score);
      const results = scored
        .slice(0, STORAGE_MAX_SEARCH_RESULTS)
        .map(({ score, item }) => ({
          id: item.id,
          source: item.source,
          title: item.title,
          summary: item.summary,
          tags: (item.tags || []).slice(0, 12),
          score,
        }));

      return { query, mode, results };
    }

    if (name === "storage_read") {
      const ids = Array.isArray(args.ids)
        ? args.ids.map((x) => String(x).trim()).filter(Boolean)
        : [];
      if (ids.length < 1 || ids.length > 4)
        return { error: "Provide between 1 and 4 chunk IDs." };
      const [index, chunks] = await Promise.all([
        loadStorageIndex(signal),
        loadStorageChunks(signal),
      ]);
      const metaById = new Map(index.map((item) => [item.id, item]));
      let budget = STORAGE_DEFAULT_READ_CHARS;
      const entries = [];

      for (const id of ids) {
        const raw = chunks[id];
        if (typeof raw !== "string") continue;
        const meta = metaById.get(id) || {};
        const slice = raw.slice(0, budget);
        budget -= slice.length;
        entries.push({
          id,
          source: meta.source || "",
          title: meta.title || "",
          text: slice,
          truncated: slice.length < raw.length,
        });
        if (budget <= 0) break;
      }
      return { entries };
    }

    return { error: `Unknown storage tool: ${name}` };
  } catch (err) {
    if (err && err.name === "AbortError")
      return { error: "Storage request stopped" };
    return { error: err && err.message ? err.message : String(err) };
  }
}
