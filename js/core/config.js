"use strict";

/* ================= Configuration ================= */
const LS = {
  chats: "llmchat.chats.v1",
  active: "llmchat.active.v1",
  model: "llmchat.model.v1",
  reasoningEffort: "llmchat.reasoning-effort.v1",
  nav: "llmchat.nav.v1",
  key: "llmchat.key.v1",
  system: "llmchat.system.v1",
  runJs: "llmchat.run-js.v1",
  wikipedia: "llmchat.wikipedia.v1",
  storage: "llmchat.storage.v1",
  toolRunJs: "llmchat.tool.run-js.v1",
  toolCreateFiles: "llmchat.tool.create-files.v1",
  toolWikipediaSearch: "llmchat.tool.wikipedia-search.v1",
  toolWikipediaRead: "llmchat.tool.wikipedia-read.v1",
  toolStorageSearch: "llmchat.tool.storage-search.v1",
  toolStorageRead: "llmchat.tool.storage-read.v1",
  temperature: "llmchat.generation.temperature.v1",
  maxOutputTokens: "llmchat.generation.max-output-tokens.v1",
  contextHistoryLimit: "llmchat.generation.context-history-limit.v1",
  workerTimeout: "llmchat.tool.worker-timeout.v1",
  maxToolRounds: "llmchat.tool.max-rounds.v1",
  providers: "llmchat.providers.v1",
  provider: "llmchat.provider.v1",
  providerKeys: "llmchat.provider-keys.v1",
};
const PROVIDER_PROTOCOLS = [
  { id: "chat/completions", label: "Chat Completions" },
  { id: "responses", label: "Responses" },
];
const DEFAULT_MODEL_META = {
  "openai/gpt-6-luna": {
    label: "GPT-6 Luna",
    desc: "OpenAI flagship model",
    logo: "openai",
  },
  "anthropic/claude-haiku-5-5": {
    label: "Claude Haiku 5.5",
    desc: "Fast Anthropic model",
    logo: "anthropic",
  },
};
const SYSTEM_PRESETS = {
  standard:
    "You are a helpful assistant. Answer clearly, accurately, and directly. If you do not have enough information, ask for clarification.",
  developer:
    "You are an experienced software developer. Suggest concrete solutions, provide code examples, and explain key steps. Take the project's existing architecture into account.",
  concise:
    "Be concise and direct. Avoid introductions and unnecessary explanations. Use lists and examples only when they are genuinely helpful.",
};
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const IMAGE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024;
const IMAGE_MAX_SIDE = 1600;
const IMAGE_QUALITY = 0.85;
const THUMB_MAX_SIDE = 360;
const THUMB_QUALITY = 0.7;

/* ================= Provider profiles ================= */
function defaultProviderProfiles() {
  return [
    {
      id: "timeweb-responses",
      name: "Timeweb (Responses)",
      baseUrl: "https://api.timeweb.ai/v1",
      apiKey: "",
      protocol: "responses",
      supportsReasoning: true,
      models: ["openai/gpt-6-luna"],
    },
    {
      id: "timeweb-chat",
      name: "Timeweb (Chat Completions)",
      baseUrl: "https://api.timeweb.ai/v1",
      apiKey: "",
      protocol: "chat/completions",
      supportsReasoning: false,
      models: ["anthropic/claude-haiku-5-5"],
    },
  ];
}

function readStorageJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeStorageJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function readStorageText(storage, key) {
  try {
    return storage.getItem(key) || "";
  } catch {
    return "";
  }
}
function normalizeProviderProfile(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id =
    typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : "provider-" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 8);
  const models = Array.isArray(raw.models)
    ? [
        ...new Set(
          raw.models
            .filter((item) => typeof item === "string" && item.trim())
            .map((item) => item.trim()),
        ),
      ]
    : [];
  return {
    id,
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : "Untitled provider",
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "",
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    protocol: PROVIDER_PROTOCOLS.some((item) => item.id === raw.protocol)
      ? raw.protocol
      : "chat/completions",
    supportsReasoning: raw.supportsReasoning === true,
    models,
  };
}

let providers = [];
let activeProviderId = "";

function initProviderState() {
  const stored = readStorageJson(localStorage, LS.providers);
  if (Array.isArray(stored) && stored.length) {
    providers = stored.map(normalizeProviderProfile).filter(Boolean);
  }

  if (!providers.length) {
    const legacyKey = (
      readStorageText(localStorage, LS.key) ||
      readStorageText(sessionStorage, LS.key) ||
      ""
    ).trim();
    const legacyModel = readStorageText(localStorage, LS.model);
    const legacyRemembered = !!readStorageText(localStorage, LS.key);
    providers = defaultProviderProfiles();
    providers.forEach((provider) => {
      provider.apiKey = legacyKey;
    });
    activeProviderId = /^openai\//i.test(legacyModel)
      ? "timeweb-responses"
      : legacyModel
        ? "timeweb-chat"
        : "timeweb-responses";
    saveProviderState(legacyRemembered);
    try {
      localStorage.removeItem(LS.key);
      sessionStorage.removeItem(LS.key);
    } catch {}
    if (legacyModel) storeSelectedModel(legacyModel);
  } else {
    const localKeys = readStorageJson(localStorage, LS.providerKeys) || {};
    const sessionKeys = readStorageJson(sessionStorage, LS.providerKeys) || {};
    providers.forEach((provider) => {
      const storedKey =
        sessionKeys[provider.id] || localKeys[provider.id] || provider.apiKey;
      provider.apiKey = typeof storedKey === "string" ? storedKey : "";
    });
    const storedActive = readStorageText(localStorage, LS.provider);
    activeProviderId = providers.some(
      (provider) => provider.id === storedActive,
    )
      ? storedActive
      : providers[0].id;
  }
}

function saveProviderState(rememberOverride) {
  const keys = {};
  providers.forEach((provider) => {
    const key = (provider.apiKey || "").trim();
    if (key) keys[provider.id] = key;
  });
  const rememberInput =
    typeof document !== "undefined"
      ? document.getElementById("rememberKey")
      : null;
  const remember =
    typeof rememberOverride === "boolean"
      ? rememberOverride
      : !!(rememberInput && rememberInput.checked);
  writeStorageJson(
    localStorage,
    LS.providers,
    providers.map((provider) => ({
      ...provider,
      apiKey: remember ? provider.apiKey : "",
      models: provider.models.slice(),
    })),
  );
  try {
    localStorage.setItem(LS.provider, activeProviderId);
  } catch {}
  writeStorageJson(
    remember ? localStorage : sessionStorage,
    LS.providerKeys,
    keys,
  );
  try {
    (remember ? sessionStorage : localStorage).removeItem(LS.providerKeys);
  } catch {}
}

function isProviderKeyRemembered() {
  try {
    if (localStorage.getItem(LS.providerKeys) != null) return true;
    const stored = readStorageJson(localStorage, LS.providers);
    return (
      Array.isArray(stored) &&
      stored.some(
        (provider) =>
          provider &&
          typeof provider.apiKey === "string" &&
          !!provider.apiKey.trim(),
      )
    );
  } catch {
    return false;
  }
}
function getActiveProvider() {
  return (
    providers.find((provider) => provider.id === activeProviderId) ||
    providers[0] ||
    null
  );
}
function activeProviderSupportsReasoning() {
  const provider = getActiveProvider();
  return !!(provider && provider.supportsReasoning);
}
function providerEndpoint(provider) {
  let base = ((provider && provider.baseUrl) || "").trim().replace(/\/+$/, "");
  if (base && !/^https?:\/\//i.test(base))
    base = "https://" + base.replace(/^\/+/, "");
  const safeBase = base || "https://api.timeweb.ai/v1";
  const path =
    provider && provider.protocol === "responses"
      ? "responses"
      : "chat/completions";
  if (/\/(?:chat\/completions|responses)$/i.test(safeBase)) return safeBase;
  if (/\/v\d+$/i.test(safeBase)) return `${safeBase}/${path}`;
  return `${safeBase}/v1/${path}`;
}

function modelDescriptor(id) {
  if (typeof id !== "string" || !id.trim()) return null;
  const clean = id.trim();
  const known = DEFAULT_MODEL_META[clean];
  if (known) return { id: clean, ...known };
  const lower = clean.toLowerCase();
  const logo =
    lower.startsWith("openai/") || lower.includes("gpt")
      ? "openai"
      : lower.includes("claude") || lower.includes("anthropic")
        ? "anthropic"
        : "";
  const short = clean.split("/").pop();
  const label = short
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
  return { id: clean, label, desc: clean, logo };
}

let MODELS = [];
function refreshModels() {
  const provider = getActiveProvider();
  const ids = provider && Array.isArray(provider.models) ? provider.models : [];
  MODELS = ids.map(modelDescriptor).filter(Boolean);
  return MODELS;
}
function storeSelectedModel(value) {
  try {
    localStorage.setItem(LS.model, value);
  } catch {}
}

initProviderState();
refreshModels();
