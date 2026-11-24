"use strict";

/* ================= IndexedDB persistence ================= */
const DB_NAME = "open-chat-db";
const DB_VERSION = 1;
let databasePromise = null;
let legacySessionProviderKeys = {};
const chatSaveQueues = new Map();

function openChatDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("chats"))
        database.createObjectStore("chats", { keyPath: "id" });
      if (!database.objectStoreNames.contains("attachments"))
        database.createObjectStore("attachments", { keyPath: "id" });
      if (!database.objectStoreNames.contains("meta"))
        database.createObjectStore("meta", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error || new Error("Could not open local database."));
    request.onblocked = () => reject(new Error("Close other Open Chat tabs to update local storage."));
  });
  return databasePromise;
}

async function dbRequest(storeName, mode, operation) {
  const database = await openChatDatabase();
  return new Promise((resolve, reject) => {
    let result;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error || new Error("Local database transaction failed."));
    };
    try {
      const transaction = database.transaction(storeName, mode);
      const request = operation(transaction.objectStore(storeName));
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => fail(request.error || new Error("Local database request failed."));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error);
    } catch (error) {
      fail(error);
    }
  });
}

const dbGet = (storeName, key) => dbRequest(storeName, "readonly", (store) => store.get(key));
const dbGetAll = (storeName) => dbRequest(storeName, "readonly", (store) => store.getAll());
const dbPut = (storeName, value) => dbRequest(storeName, "readwrite", (store) => store.put(value));
const dbDelete = (storeName, key) => dbRequest(storeName, "readwrite", (store) => store.delete(key));
const dbClear = (storeName) => dbRequest(storeName, "readwrite", (store) => store.clear());

async function dbGetMeta(key) {
  const record = await dbGet("meta", key);
  return record ? record.value : null;
}

async function dbSetMeta(key, value) {
  await dbPut("meta", { key, value });
}

async function readProviderKeys() {
  const record = await dbGet("meta", "provider-keys");
  return record && record.value && typeof record.value === "object" && !Array.isArray(record.value)
    ? record.value
    : {};
}

async function writeProviderKeys(keys) {
  await dbPut("meta", { key: "provider-keys", value: keys || {} });
}

async function readSessionProviderKeys() {
  const raw = typeof store !== "undefined" && store.get
    ? store.get(sessionStorage, "llmchat.provider-keys.v1")
    : null;
  if (!raw) return { ...legacySessionProviderKeys };
  try {
    const value = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {}
  return {};
}

async function writeSessionProviderKeys(keys) {
  if (!store || !sessionStorage) return;
  const value = keys && Object.keys(keys).length ? JSON.stringify(keys) : null;
  if (value) {
    store.set(sessionStorage, "llmchat.provider-keys.v1", value);
  } else {
    store.del(sessionStorage, "llmchat.provider-keys.v1");
  }
}

function saveStorageJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readStorageJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readStorageText(storage, key) {
  try {
    return storage.getItem(key) || "";
  } catch {
    return "";
  }
}

async function migrateLegacyLocalStorage() {
  if (await dbGetMeta("legacy-migration-v1")) return false;

  // Migrate legacy chats from localStorage
  const legacyChats = readStorageJson(localStorage, "llmchat.chats.v1");
  const existingChats = await dbGetAll("chats");
  const existingIds = new Set(existingChats.map((chat) => chat.id));
  
  if (Array.isArray(legacyChats)) {
    function normalizeChat(c) {
      if (!c || typeof c !== "object") return null;
      if (!Array.isArray(c.messages)) return null;
      return {
        ...c,
        id: typeof c.id === "string" && c.id ? c.id : uid(),
        title: typeof c.title === "string" && c.title ? c.title : "New chat",
        createdAt: +c.createdAt || Date.now(),
        updatedAt: +c.updatedAt || Date.now(),
        messages: c.messages.filter((message) => message && typeof message === "object"),
      };
    }
    const normalized = legacyChats.map(normalizeChat).filter(Boolean);
    for (const chat of normalized) {
      if (!existingIds.has(chat.id)) {
        await saveChat(chat);
      }
    }
  }

  // Migrate legacy provider keys from localStorage
  const oldProviders = readStorageJson(localStorage, "llmchat.providers.v1") || [];
  const localKeys = readStorageJson(localStorage, "llmchat.provider-keys.v1") || {};
  const sessionKeys = readStorageJson(sessionStorage, "llmchat.provider-keys.v1") || {};
  const validKeyMap = (value) =>
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const persistentKeys = {
    ...(await readProviderKeys()),
    ...validKeyMap(localKeys),
  };
  legacySessionProviderKeys = { ...validKeyMap(sessionKeys) };

  if (Array.isArray(oldProviders)) {
    oldProviders.forEach((provider) => {
      if (!provider || typeof provider.id !== "string" || typeof provider.apiKey !== "string") return;
      if (provider.apiKey.trim() && !persistentKeys[provider.id])
        persistentKeys[provider.id] = provider.apiKey.trim();
    });
    const sanitizedProviders = oldProviders.map(({ apiKey, ...provider }) => provider);
    saveStorageJson(localStorage, "llmchat.providers.v1", sanitizedProviders);
  }

  const legacyKey = readStorageText(localStorage, "llmchat.key.v1").trim();
  const sessionLegacyKey = readStorageText(sessionStorage, "llmchat.key.v1").trim();
  if (legacyKey || sessionLegacyKey) {
    const storedActive = readStorageText(localStorage, "llmchat.provider.v1");
    const oldModel = readStorageText(localStorage, "llmchat.model.v1");
    const inferredId = !oldModel || /^openai\//i.test(oldModel)
      ? "timeweb-responses"
      : "timeweb-chat";
    const providerId =
      (Array.isArray(oldProviders) && oldProviders.some((provider) => provider && provider.id === storedActive)
        ? storedActive
        : null) || inferredId;
    const providerIds = Array.isArray(oldProviders) && oldProviders.length
      ? [providerId]
      : ["timeweb-responses", "timeweb-chat"];
    providerIds.forEach((id) => {
      if (legacyKey) persistentKeys[id] = legacyKey;
      if (sessionLegacyKey && !legacyKey) legacySessionProviderKeys[id] = sessionLegacyKey;
    });
  }
  await writeProviderKeys(persistentKeys);
  if (Object.keys(legacySessionProviderKeys).length)
    await writeSessionProviderKeys(legacySessionProviderKeys);

  // Remove legacy plaintext data from localStorage
  try {
    localStorage.removeItem("llmchat.chats.v1");
    localStorage.removeItem("llmchat.provider-keys.v1");
    localStorage.removeItem("llmchat.key.v1");
    sessionStorage.removeItem("llmchat.key.v1");
  } catch {}

  await dbSetMeta("legacy-migration-v1", new Date().toISOString());
  return true;
}

async function saveChat(chat) {
  if (!chat || !chat.id) return Promise.resolve();
  const previous = chatSaveQueues.get(chat.id) || Promise.resolve();
  const current = previous.catch(() => {}).then(() => saveChatNow(chat));
  chatSaveQueues.set(chat.id, current);
  return current.finally(() => {
    if (chatSaveQueues.get(chat.id) === current) chatSaveQueues.delete(chat.id);
  });
}

async function saveChatNow(chat) {
  if (!chat || !chat.id) return;
  const data = JSON.parse(JSON.stringify(chat));
  const existingAttachments = await dbGetAll("attachments");
  const retainedAttachmentIds = new Set();
  for (const message of data.messages || []) {
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    const sourceMessage = (chat.messages || []).find((item) => item.id === message.id);
    message.attachmentIds = [];
    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index];
      const sourceAttachment = sourceMessage && sourceMessage.attachments && sourceMessage.attachments[index];
      const attachmentId = attachment.id || uid();
      const id = `att:${encodeURIComponent(chat.id)}:${encodeURIComponent(message.id)}:${encodeURIComponent(attachmentId)}`;
      if (sourceAttachment) sourceAttachment.storageId = id;
      attachment.storageId = id;
      retainedAttachmentIds.add(id);
      message.attachmentIds.push(id);
      await dbPut("attachments", {
        id,
        chatId: chat.id,
        messageId: message.id,
        payload: attachment,
      });
    }
    delete message.attachments;
  }
  await dbPut("chats", {
    id: chat.id,
    updatedAt: Number(chat.updatedAt) || Date.now(),
    payload: data,
  });
  await Promise.all(
    existingAttachments
      .filter((record) => record.chatId === chat.id && !retainedAttachmentIds.has(record.id))
      .map((record) => dbDelete("attachments", record.id)),
  );
}

async function loadChatsFromDatabase() {
  const records = await dbGetAll("chats");
  const attachmentRecords = await dbGetAll("attachments");
  const attachmentMap = new Map();
  for (const record of attachmentRecords) {
    // Attachments stored plain now
    attachmentMap.set(record.id, record.payload || record);
  }
  const chats = [];
  for (const record of records) {
    const chat = record.payload || record;
    // Ensure chat has required structure
    if (!chat.messages) chat.messages = [];
    for (const message of chat.messages || []) {
      const ids = Array.isArray(message.attachmentIds) ? message.attachmentIds : [];
      if (ids.length) {
        message.attachments = ids.map((id) => attachmentMap.get(id)).filter(Boolean);
      } else if (!Array.isArray(message.attachments)) {
        message.attachments = [];
      }
    }
    chats.push(chat);
  }
  return chats.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function deleteChatFromDatabase(chatId) {
  const pendingSave = chatSaveQueues.get(chatId);
  if (pendingSave) await pendingSave.catch(() => {});
  const records = await dbGetAll("attachments");
  const matching = [];
  for (const record of records) {
    const payload = record.payload || record;
    if (record.chatId === chatId || payload.chatId === chatId || payload.id === chatId)
      matching.push(record.id);
  }
  await Promise.all(matching.map((id) => dbDelete("attachments", id)));
  await dbDelete("chats", chatId);
}

async function clearChatsFromDatabase() {
  await Promise.all([...chatSaveQueues.values()].map((pending) => pending.catch(() => {})));
  await Promise.all([dbClear("chats"), dbClear("attachments")]);
}
