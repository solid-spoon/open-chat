"use strict";

/* ================= Message rendering ================= */
if (window.marked && typeof marked.setOptions === "function") {
  marked.setOptions({
    gfm: true, // Tables, strikethrough, task lists, and autolinks
    breaks: true, // Treat a single line break as <br>, as in chat apps
  });
}

function renderMarkdown(node, text, final) {
  node.classList.remove("md-plain");
  if (!window.marked || !window.DOMPurify) {
    node.classList.add("md-plain");
    node.textContent = text;
    return;
  }
  let html;
  const protectedContent = protectMarkdown(text);
  try {
    html = marked.parse(protectedContent.text);
  } catch {
    node.classList.add("md-plain");
    node.textContent = text;
    return;
  }
  node.innerHTML = DOMPurify.sanitize(html);
  restoreMarkdownTokens(node, protectedContent.tokens);
  node.querySelectorAll("a").forEach((a) => {
    a.target = "_blank";
    a.rel = "noopener noreferrer";
  });
  node.querySelectorAll("pre").forEach((pre) => enhanceCode(pre, final));
}

function protectFencedCode(text, token) {
  const lines = text.split("\n");
  const out = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].replace(/\r$/, "");
    const open = line.match(/^( {0,3})(`{3,}|~{3,})([^\n]*)$/);
    const isBacktick = !!open && open[2].charAt(0) === "`";
    if (!open || (isBacktick && open[3].includes("`"))) {
      out.push(lines[index]);
      index += 1;
      continue;
    }
    const indent = open[1];
    const marker = open[2];
    const markerChar = marker.charAt(0);
    const body = [];
    let cursor = index + 1;
    let closed = false;
    while (cursor < lines.length) {
      const candidate = lines[cursor].replace(/\r$/, "");
      const close = candidate.match(/^( {0,3})(`{3,}|~{3,})[ \t\f\v\r]*$/);
      if (
        close &&
        close[2].charAt(0) === markerChar &&
        close[2].length >= marker.length
      ) {
        closed = true;
        break;
      }
      body.push(stripFenceIndent(candidate, indent.length));
      cursor += 1;
    }
    const language = open[3].trim().split(/\s+/)[0];
    out.push(
      indent +
        token(() => {
          const pre = el("pre");
          const code = el("code");
          if (language && /^[\w+-]+$/.test(language))
            code.className = `language-${language}`;
          code.textContent = body.join("\n");
          pre.appendChild(code);
          return pre;
        }),
    );
    index = closed ? cursor + 1 : cursor;
  }
  return out.join("\n");
}

function stripFenceIndent(line, count) {
  let remove = 0;
  while (remove < count && line.charAt(remove) === " ") remove += 1;
  return line.slice(remove);
}

function protectMarkdown(text) {
  const tokens = new Map();
  let index = 0;
  const token = (restore) => {
    const key = `MATHPROTECT${index++}TOKEN`;
    tokens.set(key, restore);
    return key;
  };
  // Protect fenced blocks before matching literal HTML so tags inside source
  // code are never interpreted as standalone <pre>/<code> elements.
  text = protectFencedCode(text, token);

  // Preserve literal HTML blocks and inline Markdown code before math scanning.
  text = text.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (whole, inner) =>
    token(() => makeLiteralCode(inner, true)),
  );
  text = text.replace(/<code\b[^>]*>([\s\S]*?)<\/code\s*>/gi, (whole, inner) =>
    token(() => makeLiteralCode(inner, false)),
  );
  text = text.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (whole) =>
    token(() => {
      const ticks = whole.match(/^`+/)[0].length;
      const code = el("code");
      code.textContent = whole.slice(ticks, -ticks).replace(/\n/g, " ");
      return code;
    }),
  );

  const math =
    /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$((?:\\.|[^$\\\n])+?)\$/g;
  text = text.replace(
    math,
    (whole, displayDollar, displayBracket, inlineParen, inlineDollar) => {
      const source =
        displayDollar ?? displayBracket ?? inlineParen ?? inlineDollar;
      const display = displayDollar != null || displayBracket != null;
      return token(() => {
        if (!window.katex) return document.createTextNode(whole);
        try {
          const holder = el("span", display ? "math-display" : "math-inline");
          holder.innerHTML = window.katex.renderToString(source, {
            displayMode: display,
            throwOnError: false,
            trust: false,
            strict: "ignore",
          });
          return holder;
        } catch {
          return document.createTextNode(whole);
        }
      });
    },
  );
  return { text, tokens };
}

function makeLiteralCode(source, block) {
  const parsed = new DOMParser().parseFromString(source, "text/html");
  const text = parsed.body.textContent || "";
  if (!block) {
    const code = el("code");
    code.textContent = text;
    return code;
  }
  const pre = el("pre");
  const code = el("code");
  const language = source.match(/class\s*=\s*["'][^"']*\blanguage-([\w+-]+)/i);
  if (language) code.className = `language-${language[1]}`;
  code.textContent = text;
  pre.appendChild(code);
  return pre;
}

function restoreMarkdownTokens(root, tokens) {
  if (!tokens.size) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const pattern = new RegExp(`(${[...tokens.keys()].join("|")})`, "g");
  nodes.forEach((node) => {
    if (!pattern.test(node.nodeValue)) return;
    pattern.lastIndex = 0;
    const fragment = document.createDocumentFragment();
    let start = 0;
    let match;
    while ((match = pattern.exec(node.nodeValue))) {
      fragment.append(node.nodeValue.slice(start, match.index));
      const restored = tokens.get(match[0])();
      fragment.append(restored);
      start = match.index + match[0].length;
    }
    fragment.append(node.nodeValue.slice(start));
    node.replaceWith(fragment);
  });
}

function enhanceCode(pre, final) {
  const code = pre.querySelector("code");
  if (!code) return;
  const m = code.className.match(/language-([\w+-]+)/);
  const lang = m ? m[1] : "";
  if (window.hljs) {
    if (lang && hljs.getLanguage(lang)) hljs.highlightElement(code);
    else if (final && !lang) hljs.highlightElement(code); // Auto-detection is expensive; run it only when complete
  }
  const block = el("div", "code-block");
  const header = el("div", "code-header");
  const label = el("span");
  label.textContent = lang || "code";
  const btn = el("button", "code-copy");
  btn.type = "button";
  const idle = icon("copy", 14) + "<span>Copy</span>";
  btn.innerHTML = idle;
  btn.addEventListener("click", () => {
    copyText(code.textContent);
    btn.innerHTML = icon("check", 14) + "<span>Copied</span>";
    setTimeout(() => {
      btn.innerHTML = idle;
    }, 1600);
  });
  const controls = el("div", "code-controls");
  controls.appendChild(btn);
  if (final && ["html", "svg"].includes(lang.toLowerCase())) {
    const preview = el("button", "code-copy code-preview");
    preview.type = "button";
    preview.innerHTML = "<span>Open preview</span>";
    preview.addEventListener("click", () =>
      showArtifact(code.textContent, lang.toLowerCase()),
    );
    controls.appendChild(preview);
  }
  header.append(label, controls);
  pre.replaceWith(block);
  block.append(header, pre);
}

function iconBtn(name, title) {
  const b = el("button", "icon-btn");
  b.type = "button";
  b.title = title;
  b.setAttribute("aria-label", title);
  b.innerHTML = icon(name, 16);
  return b;
}

function fmtMeta(meta) {
  const t = meta.tokens;
  const sec = (meta.ms / 1000).toFixed(1);
  let s = `${meta.exact ? "" : "≈ "}${t.toLocaleString("en-US")} ${plural(t, "token", "tokens")} · ${sec} s`;
  if (meta.stopped) s += " · stopped";
  if (meta.failed) s += " · interrupted by an error";
  return s;
}

function buildUser(msg) {
  const row = el("div", "msg-user-row");
  const bubble = el("div", "msg-user");
  const atts = msg.attachments || [];
  const images = atts.filter((a) => a.kind === "image");
  const files = atts.filter((a) => a.kind === "file");

  if (images.length) {
    const grid = el(
      "div",
      "msg-user-images" + (images.length === 1 ? " single" : ""),
    );
    images.forEach((a) => {
      const src = a.thumb || a.dataUrl;
      if (src) {
        const img = el("img", "msg-user-image");
        img.src = src;
        img.alt = a.name || "Image";
        img.loading = "lazy";
        img.title = a.name || "";
        grid.appendChild(img);
      } else {
        const badge = el("span", "msg-file-badge");
        const ico = el("span", "msg-file-icon");
        ico.innerHTML = icon("image", 14);
        const nm = el("span", "msg-file-name");
        nm.textContent = `${a.name || "Image"} — unavailable`;
        badge.append(ico, nm);
        grid.appendChild(badge);
      }
    });
    bubble.appendChild(grid);
  }

  if (msg.content) {
    const text = el("div", "msg-user-text");
    text.textContent = msg.content;
    bubble.appendChild(text);
  }

  if (files.length) {
    const list = el("div", "msg-user-files");
    files.forEach((a) => {
      const badge = el("span", "msg-file-badge");
      badge.title = a.name || "";
      const ico = el("span", "msg-file-icon");
      ico.innerHTML = icon("file", 14);
      const nm = el("span", "msg-file-name");
      nm.textContent = a.name || "file";
      const sz = el("span", "msg-file-size");
      sz.textContent =
        a.truncated && !a.text ? "not saved" : formatBytes(a.size);
      badge.append(ico, nm, sz);
      list.appendChild(badge);
    });
    bubble.appendChild(list);
  }

  const actions = el("div", "user-actions");
  const edit = iconBtn("pencil", "Edit message");
  edit.addEventListener("click", () => startEditMessage(msg));
  actions.appendChild(edit);

  row.append(actions, bubble);
  return row;
}

function toolCallArguments(call) {
  try {
    const args = JSON.parse((call.function && call.function.arguments) || "{}");
    return args && typeof args === "object" && !Array.isArray(args) ? args : {};
  } catch {
    return {};
  }
}

function toolCallData(result) {
  if (!result) return null;
  try {
    const data = JSON.parse(result.content || "{}");
    return data && typeof data === "object" ? data : { result: data };
  } catch {
    return { error: result.content || "The tool returned an invalid response." };
  }
}

function appendToolOutput(card, text) {
  if (!text) return;
  const output = el("pre", "tool-output");
  output.textContent = text;
  card.appendChild(output);
}

function renderWikipediaToolCall(card, call, result, data) {
  const name = call.function && call.function.name;
  const args = toolCallArguments(call);
  const isSearch = name === "wikipedia_search";
  const query = isSearch ? args.query || "" : args.title || "";
  const action = isSearch ? "Search" : "Article";
  const summary = el("summary");
  summary.textContent = result
    ? data && data.error
      ? `Wikipedia ${action.toLowerCase()} lookup failed`
      : `Wikipedia ${isSearch ? "search" : "article"}: ${query || "Wikipedia"}`
    : `Wikipedia ${isSearch ? "searching" : "reading"}: ${query || "…"}`;
  card.appendChild(summary);

  const content = el("div", "wikipedia-tool-content");
  const request = el("div", "wikipedia-tool-query");
  request.textContent = `${action}: ${query || "—"} · ${args.lang || "ru"}`;
  content.appendChild(request);

  if (!result) {
    const pending = el("p", "wikipedia-tool-note");
    pending.textContent = "Contacting Wikipedia…";
    content.appendChild(pending);
  } else if (data && data.error) {
    const error = el("p", "wikipedia-tool-error");
    error.textContent = data.error;
    content.appendChild(error);
  } else if (data) {
    const articles = Array.isArray(data.results)
      ? data.results
      : data.title
        ? [data]
        : [];
    const count = el("p", "wikipedia-tool-note");
    count.textContent = isSearch
      ? `${articles.length} ${articles.length === 1 ? "article" : "articles"} found.`
      : data.extract
        ? `${data.extract.length.toLocaleString()} characters read.`
        : "The article has no readable extract.";
    content.appendChild(count);
    if (!articles.length && isSearch) {
      const note = el("p", "wikipedia-tool-note");
      note.textContent = data.message || "No Wikipedia articles were found.";
      content.appendChild(note);
    }
    articles.forEach((article) => {
      const row = el("div", "wikipedia-article");
      const link = el("a", "wikipedia-article-title");
      link.textContent = article.title || "Untitled article";
      link.href = safeWikipediaArticleUrl(
        article,
        data.lang || args.lang || "ru",
      );
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      row.appendChild(link);
      if (article.error) {
        const articleError = el("p", "wikipedia-tool-note");
        articleError.textContent = article.error;
        row.appendChild(articleError);
      } else {
        if (article.snippet) {
          const snippet = el("p", "wikipedia-article-snippet");
          snippet.textContent = article.snippet;
          row.appendChild(snippet);
        }
        if (article.extract) {
          const extract = el("p", "wikipedia-article-extract");
          const text = article.extract.replace(/\s+/g, " ").trim();
          extract.textContent =
            text.length > 480 ? `${text.slice(0, 480).trimEnd()}…` : text;
          row.appendChild(extract);
        }
      }
      content.appendChild(row);
    });
  }

  card.appendChild(content);
}

function renderStorageToolCall(card, call, result, data) {
  const name = call.function && call.function.name;
  const args = toolCallArguments(call);
  const isSearch = name === "storage_search";
  const request = isSearch
    ? args.query || ""
    : Array.isArray(args.ids)
      ? args.ids.join(", ")
      : "";
  const summary = el("summary");
  summary.textContent = result
    ? data && data.error
      ? `Local knowledge ${isSearch ? "search" : "read"} failed`
      : `Local knowledge ${isSearch ? "search" : "read"}: ${request || "completed"}`
    : `Local knowledge ${isSearch ? "searching" : "reading"}: ${request || "…"}`;
  card.appendChild(summary);

  const content = el("div", "wikipedia-tool-content");
  const requestLine = el("div", "wikipedia-tool-query");
  requestLine.textContent = `${isSearch ? "Search" : "Chunk IDs"}: ${request || "—"}`;
  content.appendChild(requestLine);
  if (!result) {
    const pending = el("p", "wikipedia-tool-note");
    pending.textContent = "Searching the local knowledge base…";
    content.appendChild(pending);
  } else if (data && data.error) {
    const error = el("p", "wikipedia-tool-error");
    error.textContent = data.error;
    content.appendChild(error);
  } else if (data) {
    if (isSearch) {
      const matches = Array.isArray(data.results) ? data.results : [];
      const count = el("p", "wikipedia-tool-note");
      count.textContent = `${matches.length} ${matches.length === 1 ? "chunk" : "chunks"} found${data.mode ? ` (${data.mode} search)` : ""}.`;
      content.appendChild(count);
      if (!matches.length && data.note) {
        const note = el("p", "wikipedia-tool-note");
        note.textContent = data.note;
        content.appendChild(note);
      }
      matches.forEach((match) => {
        const row = el("div", "wikipedia-article");
        const title = el("div", "wikipedia-article-title");
        title.textContent = `${match.title || match.id || "Untitled chunk"}${
          match.id ? ` · ${match.id}` : ""
        }`;
        row.appendChild(title);
        if (match.source) {
          const source = el("p", "wikipedia-article-snippet");
          source.textContent = match.source;
          row.appendChild(source);
        }
        if (match.summary) {
          const detail = el("p", "wikipedia-article-extract");
          detail.textContent = match.summary;
          row.appendChild(detail);
        }
        content.appendChild(row);
      });
    } else {
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const chars = entries.reduce(
        (total, entry) =>
          total + (typeof entry.text === "string" ? entry.text.length : 0),
        0,
      );
      const count = el("p", "wikipedia-tool-note");
      count.textContent = `${entries.length} ${
        entries.length === 1 ? "chunk" : "chunks"
      } read · ${chars.toLocaleString()} characters.`;
      content.appendChild(count);
      entries.forEach((entry) => {
        const row = el("div", "wikipedia-article");
        const title = el("div", "wikipedia-article-title");
        title.textContent = `${entry.title || entry.id || "Knowledge chunk"}${
          entry.id ? ` · ${entry.id}` : ""
        }`;
        row.appendChild(title);
        if (entry.source) {
          const source = el("p", "wikipedia-article-snippet");
          source.textContent = entry.source;
          row.appendChild(source);
        }
        if (typeof entry.text === "string") {
          const text = el("p", "wikipedia-article-extract");
          text.textContent = entry.text;
          row.appendChild(text);
        }
      });
      if (!entries.length) {
        const note = el("p", "wikipedia-tool-note");
        note.textContent = "No matching chunks were available to read.";
        content.appendChild(note);
      }
    }
  }
  card.appendChild(content);
}

function renderToolCallCard(card, call, result, msg) {
  const name = call.function && call.function.name;
  const data = toolCallData(result);
  if (name === "wikipedia_search" || name === "wikipedia_read") {
    renderWikipediaToolCall(card, call, result, data);
    return;
  }
  if (name === "storage_search" || name === "storage_read") {
    renderStorageToolCall(card, call, result, data);
    return;
  }

  const args = toolCallArguments(call);
  const isCreateFiles = name === "create_files";
  const summary = el("summary");
  if (isCreateFiles) {
    summary.textContent = !result
      ? "Creating files…"
      : data && data.error
        ? "File creation failed"
        : "Files created";
  } else if (name === "run_js") {
    summary.textContent = !result
      ? "Running JavaScript…"
      : data && data.error
        ? "JavaScript execution failed"
        : "JavaScript executed";
  } else {
    summary.textContent = name ? `Tool: ${name}` : "Tool call";
  }
  card.appendChild(summary);

  if (name === "run_js") {
    const code = el("pre", "tool-code");
    code.textContent = typeof args.code === "string" ? args.code : "";
    card.appendChild(code);
  }

  if (!result) return;
  if (data && Array.isArray(data.logs) && data.logs.length) {
    appendToolOutput(
      card,
      data.logs.map((line) => `[${line.level}] ${line.text}`).join("\n"),
    );
  }
  if (data && data.error) {
    appendToolOutput(card, `Error: ${data.error}`);
    return;
  }

  if (isCreateFiles) {
    const artifacts = (msg.createdFiles || []).filter(
      (artifact) => artifact.callId === call.id,
    );
    const files = artifacts.flatMap((artifact) => artifact.files || []);
    const fileNames = files.map((file) => file.path).filter(Boolean);
    if (fileNames.length) {
      appendToolOutput(
        card,
        `Created ${fileNames.length} ${
          fileNames.length === 1 ? "file" : "files"
        }:\n${fileNames.map((path) => `• ${path}`).join("\n")}`,
      );
    } else if (
      data &&
      typeof data.result === "string" &&
      data.result !== "undefined"
    ) {
      appendToolOutput(card, data.result);
    } else {
      appendToolOutput(card, "File creation completed.");
    }
    return;
  }

  if (data && Object.prototype.hasOwnProperty.call(data, "result")) {
    const value = data.result;
    appendToolOutput(
      card,
      value === "undefined"
        ? "Executed successfully (no value returned)."
        : typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2),
    );
  } else {
    appendToolOutput(card, "Executed successfully (no value returned).");
  }
}

function safeWikipediaArticleUrl(article, lang) {
  const expectedHost = `${lang}.wikipedia.org`;
  if (typeof article.url === "string") {
    try {
      const url = new URL(article.url);
      if (url.protocol === "https:" && url.hostname === expectedHost)
        return url.href;
    } catch {}
  }
  return `https://${expectedHost}/wiki/${encodeURIComponent(article.title || "").replace(/%20/g, "_")}`;
}

function buildAssistant(msg, isLast) {
  const wrap = el("div", "msg-assistant");
  const av = el("div", "avatar");
  const msgModelId =
    generating && generating.msg === msg
      ? generating.model
      : msg.meta && msg.meta.model;
  const msgModel = modelDescriptor(msgModelId);
  av.innerHTML =
    msgModel && msgModel.logo
      ? modelLogo(msgModel.logo, 18)
      : icon("sparkle", 16);
  if (msgModel) av.title = msgModel.label;
  const body = el("div", "assistant-body");
  const active = generating && generating.msg === msg ? generating : null;
  if (msg.reasoning || (active && active.reasoning)) {
    const details = el("details", "thinking-block");
    details.open = !!(active && active.thinkingActive);
    const summary = el("summary");
    const label = el("span", "thinking-label");
    const elapsed =
      active && active.thinkingActive
        ? (performance.now() - active.thinkingStartedAt) / 1000
        : (msg.reasoningMs || 0) / 1000;
    const effort = active ? active.reasoningEffort : msg.reasoningEffort;
    const effortLabel =
      effort && effort !== "none"
        ? ` (${{ low: "Low", medium: "Medium", high: "High" }[effort]})`
        : "";
    label.textContent = `Reasoning${effortLabel} · ${elapsed.toFixed(1)} s`;
    if (active && active.thinkingActive) {
      const spinner = el("span", "thinking-spinner");
      spinner.setAttribute("aria-label", "Reasoning in progress");
      summary.append(spinner);
    }
    summary.append(label);
    const thought = el("div", "thinking-content");
    thought.textContent = active ? active.reasoning : msg.reasoning;
    details.append(summary, thought);
    body.appendChild(details);
    if (active)
      streamThinking = {
        label,
        thought,
        details,
        spinner: details.querySelector(".thinking-spinner"),
      };
  }

  if (Array.isArray(msg.toolCalls) && msg.toolCalls.length) {
    msg.toolCalls.forEach((call) => {
      const result = (msg.toolResults || []).find(
        (item) => item.tool_call_id === call.id,
      );
      const card = el("details", "tool-call");
      const isCreateFiles =
        call.function && call.function.name === "create_files";
      renderToolCallCard(card, call, result, msg);
      body.appendChild(card);
      if (isCreateFiles) {
        (msg.createdFiles || [])
          .filter((artifact) => artifact.callId === call.id)
          .forEach((artifact) =>
            body.appendChild(buildCreatedFilesCard(artifact)),
          );
      }
    });
  }
  const md = el("div", "md");
  body.appendChild(md);

  if (active) {
    md.innerHTML = '<span class="pending-dot"></span>';
    streamBody = md;
  } else {
    renderMarkdown(md, msg.content, true);
    const actions = el("div", "msg-actions");
    const copy = iconBtn("copy", "Copy response");
    copy.addEventListener("click", () => {
      copyText(msg.content);
      flash(copy);
    });
    actions.appendChild(copy);
    if (isLast && !generating) {
      const re = iconBtn("rotate", "Regenerate response");
      re.addEventListener("click", regenerate);
      actions.appendChild(re);
    }
    if (msg.meta) {
      const meta = el("span", "msg-meta");
      meta.textContent = fmtMeta(msg.meta);
      actions.appendChild(meta);
    }
    body.appendChild(actions);
  }
  wrap.append(av, body);
  return wrap;
}

function renderThread() {
  thread.innerHTML = "";
  streamBody = null;
  streamThinking = null;
  const chat = getActive();
  if (!chat) return;
  chat.messages.forEach((m, i) => {
    thread.appendChild(
      m.role === "user"
        ? buildUser(m)
        : buildAssistant(m, i === chat.messages.length - 1),
    );
  });
  updateScrollBtn();
}
