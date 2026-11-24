"use strict";

/* ================= Chat history search ================= */
const searchModal = $("#searchModal");
const chatSearchInput = $("#chatSearchInput");
const searchResults = $("#searchResults");
const searchBtn = $("#searchBtn");
let searchItems = [];
let searchActiveIndex = -1;
let searchReturnFocus = null;

function searchableMessage(message) {
  const attachmentText = (message.attachments || [])
    .map((attachment) => `${attachment.name || ""} ${attachment.text || ""}`)
    .join(" ");
  return `${message.content || ""} ${attachmentText}`
    .replace(/\s+/g, " ")
    .trim();
}

function findChatMatches(query) {
  const normalizedQuery = query.toLocaleLowerCase();
  return [...chats]
    .map((chat) => {
      const title = chat.title || "New chat";
      const titleMatches = title.toLocaleLowerCase().includes(normalizedQuery);
      let snippet = "";

      if (normalizedQuery) {
        for (const message of [...chat.messages].reverse()) {
          const text = searchableMessage(message);
          if (text.toLocaleLowerCase().includes(normalizedQuery)) {
            snippet = text;
            break;
          }
        }
      }

      return { chat, title, titleMatches, snippet };
    })
    .filter((item) => !normalizedQuery || item.titleMatches || item.snippet)
    .sort((a, b) => b.chat.updatedAt - a.chat.updatedAt)
    .slice(0, normalizedQuery ? undefined : 6);
}

function appendSnippet(container, text, query) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const matchAt = normalized
    .toLocaleLowerCase()
    .indexOf(query.toLocaleLowerCase());
  if (matchAt < 0) return;

  const start = Math.max(0, matchAt - 44);
  const end = Math.min(normalized.length, matchAt + query.length + 72);
  const excerpt = normalized.slice(start, end);
  if (start) container.append(document.createTextNode("…"));
  container.append(document.createTextNode(excerpt.slice(0, matchAt - start)));
  const highlight = document.createElement("mark");
  highlight.textContent = excerpt.slice(
    matchAt - start,
    matchAt - start + query.length,
  );
  container.append(highlight);
  container.append(
    document.createTextNode(excerpt.slice(matchAt - start + query.length)),
  );
  if (end < normalized.length) container.append(document.createTextNode("…"));
}

function renderSearchResults(query = chatSearchInput.value.trim()) {
  searchItems = findChatMatches(query);
  searchActiveIndex = searchItems.length ? 0 : -1;
  searchResults.replaceChildren();

  if (!searchItems.length) {
    const empty = document.createElement("p");
    empty.className = "search-empty";
    empty.textContent = query ? "No chats found" : "No chats yet";
    searchResults.appendChild(empty);
    chatSearchInput.removeAttribute("aria-activedescendant");
    return;
  }

  const heading = document.createElement("div");
  heading.className = "search-section-label";
  heading.textContent = query ? "Results" : "Recent chats";
  searchResults.appendChild(heading);

  searchItems.forEach(({ chat, title, snippet }, index) => {
    const result = document.createElement("button");
    result.type = "button";
    result.id = `chat-search-result-${index}`;
    result.className = "search-result";
    result.dataset.index = index;
    result.setAttribute("role", "option");
    result.setAttribute(
      "aria-selected",
      index === searchActiveIndex ? "true" : "false",
    );

    const resultTitle = document.createElement("span");
    resultTitle.className = "search-result-title";
    resultTitle.textContent = title;
    result.appendChild(resultTitle);

    if (query && snippet) {
      const excerpt = document.createElement("span");
      excerpt.className = "search-result-snippet";
      appendSnippet(excerpt, snippet, query);
      result.appendChild(excerpt);
    }

    result.addEventListener("click", () => openSearchResult(index));
    searchResults.appendChild(result);
  });
  updateSearchSelection();
}

function updateSearchSelection() {
  const results = searchResults.querySelectorAll(".search-result");
  results.forEach((result, index) => {
    const selected = index === searchActiveIndex;
    result.setAttribute("aria-selected", selected ? "true" : "false");
    if (selected) {
      chatSearchInput.setAttribute("aria-activedescendant", result.id);
      result.scrollIntoView({ block: "nearest" });
    }
  });
}

function openSearchResult(index = searchActiveIndex) {
  const item = searchItems[index];
  if (!item) return;
  closeSearch();
  switchChat(item.chat.id);
}

function openSearch() {
  if (searchModal.hidden) searchReturnFocus = document.activeElement;
  searchModal.hidden = false;
  chatSearchInput.value = "";
  renderSearchResults("");
  chatSearchInput.focus();
}

function closeSearch(restoreFocus = true) {
  if (searchModal.hidden) return;
  searchModal.hidden = true;
  if (restoreFocus && searchReturnFocus && searchReturnFocus.isConnected)
    searchReturnFocus.focus();
  searchReturnFocus = null;
}

searchBtn.addEventListener("click", openSearch);
chatSearchInput.addEventListener("input", () => renderSearchResults());
chatSearchInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (!searchItems.length) return;
    const step = event.key === "ArrowDown" ? 1 : -1;
    searchActiveIndex =
      (searchActiveIndex + step + searchItems.length) % searchItems.length;
    updateSearchSelection();
  } else if (event.key === "Enter") {
    event.preventDefault();
    openSearchResult();
  }
});
searchModal.addEventListener("click", (event) => {
  if (event.target === searchModal) closeSearch();
});
