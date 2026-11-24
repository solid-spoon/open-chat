"use strict";

/* ================= Конфигурация ================= */
const API_URL = "https://api.timeweb.ai/v1/chat/completions";
const RESPONSES_API_URL = "https://api.timeweb.ai/v1/responses";
const MODELS = [
  {
    id: "openai/gpt-6-luna",
    label: "GPT-6 Luna",
    desc: "Флагманская модель OpenAI",
    logo: "openai",
  },
  {
    id: "anthropic/claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    desc: "Быстрая модель Anthropic",
    logo: "anthropic",
  },
];
const SYSTEM_PRESETS = {
  standard:
    "Ты — полезный ассистент. Отвечай понятно, точно и по существу. Если информации недостаточно, уточни детали.",
  developer:
    "Ты — опытный разработчик. Предлагай конкретные решения, приводи примеры кода и объясняй ключевые шаги. Учитывай существующую архитектуру проекта.",
  concise:
    "Отвечай кратко и по делу, без вступлений и лишних пояснений. Используй списки и примеры только там, где это действительно помогает.",
};
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const IMAGE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024;
const IMAGE_MAX_SIDE = 1600;
const IMAGE_QUALITY = 0.85;
const THUMB_MAX_SIDE = 360;
const THUMB_QUALITY = 0.7;
const LS = {
  chats: "llmchat.chats.v1",
  active: "llmchat.active.v1",
  model: "llmchat.model.v1",
  reasoningEffort: "llmchat.reasoning-effort.v1",
  nav: "llmchat.nav.v1",
  key: "llmchat.key.v1",
  system: "llmchat.system.v1",
  runJs: "llmchat.run-js.v1",
};
