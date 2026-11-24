"use strict";

/* ================= Artifact panel ================= */
let activeArtifact = null;
let artifactZoom = 1;
let artifactPan = { x: 0, y: 0 };

const artifactMermaidView = $("#artifactMermaidView");
const artifactZoomControls = $("#artifactZoomControls");
const artifactDownloadButton = $("#artifactDownload");

function showArtifact(source, kind, renderedSvg = "") {
  const artifactKind = ["svg", "mermaid"].includes(kind) ? kind : "html";
  activeArtifact = { source, kind: artifactKind, renderedSvg };
  artifactCode.textContent = source;
  artifactDownloadButton.textContent = artifactKind === "mermaid" ? "Download SVG" : "Download file";
  artifactPanel.hidden = false;
  main.classList.add("artifact-open");
  renderArtifactPreview();
  selectArtifactTab("preview");
}

function renderArtifactPreview() {
  if (!activeArtifact) return;
  const { source, kind, renderedSvg } = activeArtifact;
  const mermaidPreview = kind === "mermaid" && !!renderedSvg;
  artifactMermaidView.hidden = !mermaidPreview;
  artifactFrame.hidden = mermaidPreview;
  artifactZoomControls.hidden = !mermaidPreview;
  if (mermaidPreview) {
    artifactFrame.srcdoc = "";
    artifactMermaidView.innerHTML = "";
    const canvas = el("div", "artifact-mermaid-canvas");
    canvas.innerHTML = renderedSvg;
    artifactMermaidView.appendChild(canvas);
    resetArtifactZoom();
    return;
  }
  artifactMermaidView.replaceChildren();
  artifactFrame.srcdoc =
    kind === "svg"
      ? `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;min-height:100%;background:#fff;display:grid;place-items:center}svg{max-width:100%;max-height:100vh}</style></head><body>${source}</body></html>`
      : source;
}

function updateArtifactZoom() {
  const canvas = artifactMermaidView.querySelector(".artifact-mermaid-canvas");
  if (!canvas) return;
  canvas.style.transform = `translate(${artifactPan.x}px, ${artifactPan.y}px) scale(${artifactZoom})`;
  artifactZoomControls.querySelector("#artifactZoomOut").disabled = artifactZoom <= 0.5;
  artifactZoomControls.querySelector("#artifactZoomIn").disabled = artifactZoom >= 4;
}

function resetArtifactZoom() {
  artifactZoom = 1;
  artifactPan = { x: 0, y: 0 };
  updateArtifactZoom();
}

function changeArtifactZoom(amount) {
  artifactZoom = Math.max(0.5, Math.min(4, artifactZoom * amount));
  updateArtifactZoom();
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
  artifactMermaidView.replaceChildren();
}

$("#artifactRefresh").addEventListener("click", renderArtifactPreview);
$("#artifactClose").addEventListener("click", closeArtifact);
artifactPreviewTab.addEventListener("click", () =>
  selectArtifactTab("preview"),
);
artifactCodeTab.addEventListener("click", () => selectArtifactTab("code"));
$("#artifactZoomOut").addEventListener("click", () => changeArtifactZoom(1 / 1.2));
$("#artifactZoomIn").addEventListener("click", () => changeArtifactZoom(1.2));
$("#artifactZoomReset").addEventListener("click", resetArtifactZoom);

artifactMermaidView.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  artifactMermaidView.setPointerCapture(event.pointerId);
  artifactMermaidView.dataset.panX = String(event.clientX - artifactPan.x);
  artifactMermaidView.dataset.panY = String(event.clientY - artifactPan.y);
  artifactMermaidView.classList.add("is-panning");
});
artifactMermaidView.addEventListener("pointermove", (event) => {
  if (!artifactMermaidView.hasPointerCapture(event.pointerId)) return;
  artifactPan = {
    x: event.clientX - Number(artifactMermaidView.dataset.panX),
    y: event.clientY - Number(artifactMermaidView.dataset.panY),
  };
  updateArtifactZoom();
});
const stopArtifactPan = (event) => {
  if (artifactMermaidView.hasPointerCapture(event.pointerId))
    artifactMermaidView.releasePointerCapture(event.pointerId);
  artifactMermaidView.classList.remove("is-panning");
};
artifactMermaidView.addEventListener("pointerup", stopArtifactPan);
artifactMermaidView.addEventListener("pointercancel", stopArtifactPan);

$("#artifactDownload").addEventListener("click", () => {
  if (!activeArtifact) return;
  const isSvg = activeArtifact.kind === "svg" || activeArtifact.kind === "mermaid";
  const blob = new Blob(
    [activeArtifact.kind === "mermaid" ? activeArtifact.renderedSvg : activeArtifact.source],
    {
      type: isSvg ? "image/svg+xml" : "text/html",
    },
  );
  const extension = isSvg ? "svg" : "html";
  const url = URL.createObjectURL(blob);
  const link = el("a");
  link.href = url;
  link.download = `artifact.${extension}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
