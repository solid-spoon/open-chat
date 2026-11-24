"use strict";

/* ================= Рендер сообщений ================= */
if (window.marked && typeof marked.setOptions === "function") {
  marked.setOptions({
    gfm: true, // таблицы, зачёркивание, списки задач, автолинки
    breaks: true, // одиночный перенос строки = <br>, как в чатах
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

function protectMarkdown(text) {
  const tokens = new Map();
  let index = 0;
  const token = (restore) => {
    const key = `MATHPROTECT${index++}TOKEN`;
    tokens.set(key, restore);
    return key;
  };
  // Preserve literal HTML code blocks and Markdown code before math scanning.
  text = text.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre\s*>/gi, (whole, inner) =>
    token(() => makeLiteralCode(inner, true)),
  );
  text = text.replace(/<code\b[^>]*>([\s\S]*?)<\/code\s*>/gi, (whole, inner) =>
    token(() => makeLiteralCode(inner, false)),
  );
  text = text.replace(/(```+|~~~+)[^\n]*\n[\s\S]*?(?:\n\1[ \t]*(?=\n|$)|$)/g, (block) =>
    token(() => {
      const match = block.match(/^(```+|~~~+)([^\n]*)\n([\s\S]*?)(?:\n\1[ \t]*(?:\n|$)|$)/);
      const pre = el("pre");
      const code = el("code");
      const language = match && match[2].trim().split(/\s+/)[0];
      if (language && /^[\w+-]+$/.test(language)) code.className = `language-${language}`;
      code.textContent = match ? match[3] : block;
      pre.appendChild(code);
      return pre;
    }),
  );
  text = text.replace(/(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g, (whole) =>
    token(() => {
      const ticks = whole.match(/^`+/)[0].length;
      const code = el("code");
      code.textContent = whole.slice(ticks, -ticks).replace(/\n/g, " ");
      return code;
    }),
  );

  const math = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$((?:\\.|[^$\\\n])+?)\$/g;
  text = text.replace(math, (whole, displayDollar, displayBracket, inlineParen, inlineDollar) => {
    const source = displayDollar ?? displayBracket ?? inlineParen ?? inlineDollar;
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
  });
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
    else if (final && !lang) hljs.highlightElement(code); // автодетект только на финале, дорого
  }
  const block = el("div", "code-block");
  const header = el("div", "code-header");
  const label = el("span");
  label.textContent = lang || "код";
  const btn = el("button", "code-copy");
  btn.type = "button";
  const idle = icon("copy", 14) + "<span>Копировать</span>";
  btn.innerHTML = idle;
  btn.addEventListener("click", () => {
    copyText(code.textContent);
    btn.innerHTML = icon("check", 14) + "<span>Скопировано</span>";
    setTimeout(() => {
      btn.innerHTML = idle;
    }, 1600);
  });
  const controls = el("div", "code-controls");
  controls.appendChild(btn);
  if (final && ["html", "svg"].includes(lang.toLowerCase())) {
    const preview = el("button", "code-copy code-preview");
    preview.type = "button";
    preview.innerHTML = '<span>Открыть превью</span>';
    preview.addEventListener("click", () => showArtifact(code.textContent, lang.toLowerCase()));
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
  const sec = (meta.ms / 1000).toFixed(1).replace(".", ",");
  let s = `${meta.exact ? "" : "≈ "}${t.toLocaleString("ru-RU")} ${plural(t, "токен", "токена", "токенов")} · ${sec} с`;
  if (meta.stopped) s += " · остановлено";
  if (meta.failed) s += " · прервано ошибкой";
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
        img.alt = a.name || "Изображение";
        img.loading = "lazy";
        img.title = a.name || "";
        grid.appendChild(img);
      } else {
        const badge = el("span", "msg-file-badge");
        const ico = el("span", "msg-file-icon");
        ico.innerHTML = icon("image", 14);
        const nm = el("span", "msg-file-name");
        nm.textContent = `${a.name || "Изображение"} — недоступно`;
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
      nm.textContent = a.name || "файл";
      const sz = el("span", "msg-file-size");
      sz.textContent =
        a.truncated && !a.text ? "не сохранено" : formatBytes(a.size);
      badge.append(ico, nm, sz);
      list.appendChild(badge);
    });
    bubble.appendChild(list);
  }

  const actions = el("div", "user-actions");
  const edit = iconBtn("pencil", "Редактировать сообщение");
  edit.addEventListener("click", () => startEditMessage(msg));
  actions.appendChild(edit);

  row.append(actions, bubble);
  return row;
}

function buildAssistant(msg, isLast) {
  const wrap = el("div", "msg-assistant");
  const av = el("div", "avatar");
  const msgModelId =
    generating && generating.msg === msg
      ? generating.model
      : msg.meta && msg.meta.model;
  const msgModel = MODELS.find((m) => m.id === msgModelId);
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
    const elapsed = active && active.thinkingActive
      ? (performance.now() - active.thinkingStartedAt) / 1000
      : (msg.reasoningMs || 0) / 1000;
    const effort = active ? active.reasoningEffort : msg.reasoningEffort;
    const effortLabel = effort && effort !== "none"
      ? ` (${({ low: "Низкий", medium: "Средний", high: "Высокий" })[effort]})`
      : "";
    label.textContent = `Размышления${effortLabel} · ${elapsed.toFixed(1).replace(".", ",")} с`;
    if (active && active.thinkingActive) {
      const spinner = el("span", "thinking-spinner");
      spinner.setAttribute("aria-label", "Идёт процесс размышления");
      summary.append(spinner);
    }
    summary.append(label);
    const thought = el("div", "thinking-content");
    thought.textContent = active ? active.reasoning : msg.reasoning;
    details.append(summary, thought);
    body.appendChild(details);
    if (active) streamThinking = { label, thought, details, spinner: details.querySelector(".thinking-spinner") };
  }

  if (Array.isArray(msg.toolCalls) && msg.toolCalls.length) {
    msg.toolCalls.forEach((call) => {
      const result = (msg.toolResults || []).find((item) => item.tool_call_id === call.id);
      const card = el("details", "tool-call");
      const summary = el("summary");
      const isCreateFiles = call.function && call.function.name === "create_files";
      let failed = false;
      if (result) {
        try { failed = !!JSON.parse(result.content).error; } catch {}
      }
      summary.textContent = isCreateFiles
        ? result ? failed ? "Ошибка создания файлов" : "Файлы созданы" : "Создание файлов…"
        : result ? failed ? "Ошибка выполнения JS-кода" : "Выполнен JS-код" : "Выполняется JS-код…";
      card.appendChild(summary);
      if (!isCreateFiles) {
        const code = el("pre", "tool-code");
        code.textContent = call.function && call.function.arguments
          ? (() => { try { return JSON.parse(call.function.arguments).code || call.function.arguments; } catch { return call.function.arguments; } })()
          : "";
        card.appendChild(code);
      }
      if (result) {
        let output = result.content || "";
        try {
          const parsed = JSON.parse(output);
          if (Array.isArray(parsed.logs) && parsed.logs.length) {
            const logs = el("pre", "tool-output");
            logs.textContent = parsed.logs.map((line) => `[${line.level}] ${line.text}`).join("\n");
            card.appendChild(logs);
          }
          output = parsed.error ? `Ошибка: ${parsed.error}` : JSON.stringify(parsed.result, null, 2);
        } catch {}
        const response = el("pre", "tool-output");
        response.textContent = output || "undefined";
        card.appendChild(response);
      }
      body.appendChild(card);
      if (isCreateFiles) {
        (msg.createdFiles || []).filter((artifact) => artifact.callId === call.id)
          .forEach((artifact) => body.appendChild(buildCreatedFilesCard(artifact)));
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
    const copy = iconBtn("copy", "Копировать ответ");
    copy.addEventListener("click", () => {
      copyText(msg.content);
      flash(copy);
    });
    actions.appendChild(copy);
    if (isLast && !generating) {
      const re = iconBtn("rotate", "Перегенерировать");
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
