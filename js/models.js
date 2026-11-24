"use strict";

/* ================= Селектор моделей ================= */
function buildModelMenu() {
  modelMenu.innerHTML = "";
  MODELS.forEach((m) => {
    const item = el("button", "model-item");
    item.type = "button";
    item.dataset.id = m.id;
    item.setAttribute("role", "menuitemradio");
    const av = el("span", "model-avatar");
    av.innerHTML = modelLogo(m.logo, 18);
    const text = el("span");
    const name = el("span", "model-item-name");
    name.textContent = m.label;
    const desc = el("span", "model-item-desc");
    desc.textContent = m.desc;
    text.append(name, desc);
    const check = el("span", "model-check");
    check.innerHTML = icon("check", 16);
    item.append(av, text, check);
    item.addEventListener("click", () => {
      model = m.id;
      store.set(localStorage, LS.model, model);
      updateModelUI();
      closeModelMenu();
    });
    modelMenu.appendChild(item);
  });
  updateModelUI();
}
function updateModelUI() {
  const cur = MODELS.find((m) => m.id === model);
  modelLabel.textContent = cur.label;
  modelAvatar.innerHTML = modelLogo(cur.logo, 18);
  updateReasoningAvailability();
  modelMenu.querySelectorAll(".model-item").forEach((i) => {
    const on = i.dataset.id === model;
    i.classList.toggle("selected", on);
    i.setAttribute("aria-checked", on);
  });
}
function closeModelMenu() {
  modelMenu.hidden = true;
  modelBtn.setAttribute("aria-expanded", "false");
}
modelBtn.addEventListener("click", () => {
  const open = modelMenu.hidden;
  modelMenu.hidden = !open;
  modelBtn.setAttribute("aria-expanded", String(open));
});
document.addEventListener("click", (e) => {
  if (!modelMenu.hidden && !modelPicker.contains(e.target))
    closeModelMenu();
});
