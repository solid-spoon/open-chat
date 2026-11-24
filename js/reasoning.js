"use strict";

/* ================= Селектор уровня размышлений ================= */
const REASONING_EFFORTS = [
  { id: "none", label: "Выкл" },
  { id: "low", label: "Низкий" },
  { id: "medium", label: "Средний" },
  { id: "high", label: "Высокий" },
];

function buildReasoningMenu() {
  reasoningMenu.innerHTML = "";
  REASONING_EFFORTS.forEach((effort) => {
    const item = el("button", "reasoning-item");
    item.type = "button";
    item.dataset.effort = effort.id;
    item.setAttribute("role", "menuitemradio");
    item.textContent = effort.label;
    item.addEventListener("click", () => {
      reasoningEffort = effort.id;
      store.set(localStorage, LS.reasoningEffort, reasoningEffort);
      updateReasoningUI();
      closeReasoningMenu();
    });
    reasoningMenu.appendChild(item);
  });
  updateReasoningUI();
  updateReasoningAvailability();
}

function updateReasoningAvailability() {
  const available = model.startsWith("openai/");
  reasoningPicker.hidden = !available;
  reasoningBtn.disabled = !available;
  if (!available) closeReasoningMenu();
}

function updateReasoningUI() {
  const current = REASONING_EFFORTS.find((item) => item.id === reasoningEffort) || REASONING_EFFORTS[2];
  reasoningLabel.textContent = current.label;
  reasoningMenu.querySelectorAll(".reasoning-item").forEach((item) => {
    const selected = item.dataset.effort === current.id;
    item.classList.toggle("selected", selected);
    item.setAttribute("aria-checked", String(selected));
  });
}

function closeReasoningMenu() {
  reasoningMenu.hidden = true;
  reasoningBtn.setAttribute("aria-expanded", "false");
}

reasoningBtn.addEventListener("click", () => {
  const open = reasoningMenu.hidden;
  reasoningMenu.hidden = !open;
  reasoningBtn.setAttribute("aria-expanded", String(open));
});

document.addEventListener("click", (event) => {
  if (!reasoningMenu.hidden && !reasoningPicker.contains(event.target)) closeReasoningMenu();
});

buildReasoningMenu();
