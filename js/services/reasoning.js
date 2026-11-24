"use strict";

/* ================= Reasoning effort selector ================= */
const REASONING_EFFORTS = [
  { id: "none", label: "Off" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
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
  const available = activeProviderSupportsReasoning();
  reasoningPicker.hidden = !available;
  reasoningBtn.disabled = !available;
  if (!available) closeReasoningMenu();
}

function updateReasoningUI() {
  const current =
    REASONING_EFFORTS.find((item) => item.id === reasoningEffort) ||
    REASONING_EFFORTS[2];
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
  if (!reasoningMenu.hidden && !reasoningPicker.contains(event.target))
    closeReasoningMenu();
});

buildReasoningMenu();
