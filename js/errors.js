"use strict";

/* ================= Ошибки ================= */
function showError(text, canRetry) {
  errorText.textContent = text;
  retryBtn.hidden = !canRetry;
  errorBanner.hidden = false;
}
function hideError() {
  errorBanner.hidden = true;
}
$("#errorClose").addEventListener("click", hideError);
retryBtn.addEventListener("click", () => {
  hideError();
  const chat = getActive();
  const last = chat && chat.messages[chat.messages.length - 1];
  if (chat && !generating && last && last.role === "user") generate(chat);
});
function apiError(status, raw) {
  let msg = "";
  try {
    const j = JSON.parse(raw);
    msg = (j.error && j.error.message) || j.message || "";
  } catch {}
  if (!msg) msg = (raw || "").slice(0, 200);
  if (status === 401 || status === 403)
    return `Ошибка ${status}: доступ запрещён. Проверьте API-ключ в настройках.`;
  if (status === 429)
    return "Ошибка 429: лимит запросов или баланс исчерпан. Попробуйте позже.";
  return `Ошибка ${status}${msg ? ": " + msg : ""}`;
}
function humanError(err) {
  if (err instanceof TypeError)
    return "Не удалось соединиться с api.timeweb.ai. Проверьте сеть. Если запрос блокирует CORS, понадобится прокси-сервер.";
  return (err && err.message) || "Неизвестная ошибка";
}
