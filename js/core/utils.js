"use strict";

/* ================= Utilities ================= */
const $ = (s) => document.querySelector(s);
const el = (tag, cls) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  return n;
};
const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
const store = {
  get(s, k) {
    try {
      return s.getItem(k);
    } catch {
      return null;
    }
  },
  set(s, k, v) {
    try {
      s.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
  del(s, k) {
    try {
      s.removeItem(k);
    } catch {}
  },
};
const plural = (n, singular, pluralForm) => (n === 1 ? singular : pluralForm);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = () => matchMedia("(max-width: 767px)").matches;
const formatBytes = (n) => {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(n) / Math.log(1024)),
  );
  const v = n / Math.pow(1024, i);
  return `${i === 0 || v >= 10 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = el("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {}
    ta.remove();
  }
}
function flash(btn) {
  if (btn._flash) return;
  btn._flash = true;
  const orig = btn.innerHTML;
  btn.innerHTML = icon("check", 16);
  setTimeout(() => {
    btn.innerHTML = orig;
    btn._flash = false;
  }, 1500);
}
