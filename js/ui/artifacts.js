"use strict";

/* ================= Artifact panel ================= */
let activeArtifact = null;

function showArtifact(source, kind) {
  activeArtifact = { source, kind: kind === "svg" ? "svg" : "html" };
  artifactCode.textContent = source;
  artifactPanel.hidden = false;
  main.classList.add("artifact-open");
  renderArtifactPreview();
  selectArtifactTab("preview");
}

function renderArtifactPreview() {
  if (!activeArtifact) return;
  const { source, kind } = activeArtifact;
  artifactFrame.srcdoc =
    kind === "svg"
      ? `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;min-height:100%;background:#fff;display:grid;place-items:center}svg{max-width:100%;max-height:100vh}</style></head><body>${source}</body></html>`
      : source;
}

function selectArtifactTab(tab) {
  const preview = tab === "preview";
  $("#artifactPreviewView").hidden = !preview;
  $("#artifactCodeView").hidden = preview;
  artifactPreviewTab.classList.toggle("active", preview);
  artifactCodeTab.classList.toggle("active", !preview);
  artifactPreviewTab.setAttribute("aria-selected", String(preview));
  artifactCodeTab.setAttribute("aria-selected", String(!preview));
}

function closeArtifact() {
  artifactPanel.hidden = true;
  main.classList.remove("artifact-open");
  artifactFrame.srcdoc = "";
}

$("#artifactRefresh").addEventListener("click", renderArtifactPreview);
$("#artifactClose").addEventListener("click", closeArtifact);
artifactPreviewTab.addEventListener("click", () =>
  selectArtifactTab("preview"),
);
artifactCodeTab.addEventListener("click", () => selectArtifactTab("code"));
$("#artifactDownload").addEventListener("click", () => {
  if (!activeArtifact) return;
  const blob = new Blob([activeArtifact.source], {
    type: activeArtifact.kind === "svg" ? "image/svg+xml" : "text/html",
  });
  const url = URL.createObjectURL(blob);
  const link = el("a");
  link.href = url;
  link.download = `artifact.${activeArtifact.kind}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
