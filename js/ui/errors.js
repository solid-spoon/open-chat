"use strict";

/* ================= Errors ================= */
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
    return `Error ${status}: access denied. Check your API key in Settings.`;
  if (status === 429)
    return "Error 429: rate limit reached or account balance exhausted. Try again later.";
  return `Error ${status}${msg ? ": " + msg : ""}`;
}
function humanError(err) {
  if (err instanceof TypeError)
    return "Could not connect to api.timeweb.ai. Check your internet connection. If the request is blocked by CORS, you may need a proxy server.";
  return (err && err.message) || "Unknown error";
}
