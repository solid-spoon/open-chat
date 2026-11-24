"use strict";

/* ================= Generation: SSE + function calling ================= */
function post(payload, signal, provider) {
  const endpoint = providerEndpoint(provider || getActiveProvider());
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + getKey(provider),
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal,
  });
}

function markThinking(g) {
  if (g.answerStarted) return;
  if (!g.thinkingStartedAt) g.thinkingStartedAt = performance.now();
  g.thinkingActive = true;
}

function appendReasoning(g, text) {
  if (!text) return;
  if (!g.answerStarted) markThinking(g);
  g.reasoning += text;
  g.msg.reasoning = g.reasoning;
  scheduleRender();
}

function appendAnswer(g, text) {
  if (!text) return;
  finishThinking(g);
  g.answerStarted = true;
  g.msg.content += text;
  scheduleRender();
}

function finishThinking(g) {
  if (!g.thinkingActive) return;
  g.reasoningMs = Math.round(performance.now() - g.thinkingStartedAt);
  g.thinkingActive = false;
  g.msg.reasoningMs = g.reasoningMs;
}

function consumeText(g, text, flush = false) {
  g.tagBuffer += text;
  while (g.tagBuffer) {
    const open = g.tagBuffer.toLowerCase().indexOf("<think>");
    const close = g.tagBuffer.toLowerCase().indexOf("</think>");
    const at = open < 0 ? close : close < 0 ? open : Math.min(open, close);
    if (at >= 0) {
      const isOpen = at === open;
      const marker = isOpen ? "<think>" : "</think>";
      const before = g.tagBuffer.slice(0, at);
      if (g.inThink) appendReasoning(g, before);
      else appendAnswer(g, before);
      g.tagBuffer = g.tagBuffer.slice(at + marker.length);
      if (isOpen) {
        g.inThink = true;
        markThinking(g);
      } else {
        g.inThink = false;
      }
      continue;
    }
    if (flush) {
      if (g.inThink) appendReasoning(g, g.tagBuffer);
      else appendAnswer(g, g.tagBuffer);
      g.tagBuffer = "";
      break;
    }
    const lower = g.tagBuffer.toLowerCase();
    const possible = ["<think>", "</think>"].reduce((max, marker) => {
      for (let n = 1; n <= marker.length && n <= lower.length; n++) {
        if (lower.endsWith(marker.slice(0, n))) max = Math.max(max, n);
      }
      return max;
    }, 0);
    const safeLength = g.tagBuffer.length - possible;
    if (safeLength > 0) {
      const safe = g.tagBuffer.slice(0, safeLength);
      if (g.inThink) appendReasoning(g, safe);
      else appendAnswer(g, safe);
      g.tagBuffer = g.tagBuffer.slice(safeLength);
    }
    break;
  }
}

function appendToolDelta(g, deltas) {
  if (!Array.isArray(deltas)) return;
  deltas.forEach((delta) => {
    const index = Number.isInteger(delta.index)
      ? delta.index
      : g.turnCalls.length;
    const call = (g.turnCalls[index] ||= {
      id: "",
      type: "function",
      function: { name: "", arguments: "" },
    });
    if (delta.id) call.id += delta.id;
    if (delta.type) call.type = delta.type;
    if (delta.function) {
      if (delta.function.name) call.function.name += delta.function.name;
      if (delta.function.arguments)
        call.function.arguments += delta.function.arguments;
    }
  });
}

async function readSSE(res, g) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const handle = (line) => {
    line = line.trim();
    if (!line.startsWith("data:")) return false;
    const data = line.slice(5).trim();
    if (data === "[DONE]") return true;
    let j;
    try {
      j = JSON.parse(data);
    } catch {
      return false;
    }
    if (j.error) throw new Error(j.error.message || "API error");
    if (j.usage) g.usage = j.usage;
    const delta = j.choices && j.choices[0] && j.choices[0].delta;
    if (delta) {
      if (typeof delta.reasoning_content === "string")
        appendReasoning(g, delta.reasoning_content);
      if (typeof delta.reasoning === "string")
        appendReasoning(g, delta.reasoning);
      if (typeof delta.content === "string" && delta.content)
        consumeText(g, delta.content);
      appendToolDelta(g, delta.tool_calls);
    }
    return false;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (handle(line)) {
          consumeText(g, "", true);
          return;
        }
      }
    }
    if (buf) handle(buf);
    consumeText(g, "", true);
  } finally {
    try {
      reader.cancel();
    } catch {}
  }
}

function scheduleRender() {
  if (renderTimer || !generating) return;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    const g = generating;
    if (!g) return;
    if (g.reasoning && !streamThinking && g.chat.id === activeId)
      renderThread();
    if (streamBody) renderMarkdown(streamBody, g.msg.content, false);
    if (streamThinking) {
      streamThinking.thought.textContent = g.reasoning;
      const seconds = (
        g.thinkingActive
          ? (performance.now() - g.thinkingStartedAt) / 1000
          : (g.reasoningMs || 0) / 1000
      ).toFixed(1);
      streamThinking.label.textContent = `Reasoning · ${seconds} s`;
      if (g.thinkingActive) {
        streamThinking.details.open = true;
      } else {
        streamThinking.details.open = false;
        if (streamThinking.spinner) streamThinking.spinner.remove();
      }
    }
    if (stick) scrollToBottom(false);
    updateScrollBtn();
    throttledPersist();
  }, 80);
}

async function readResponsesSSE(res, g) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let eventName = "";
  let dataLines = [];

  const handle = () => {
    if (!dataLines.length) {
      eventName = "";
      return;
    }
    const raw = dataLines.join("\n");
    dataLines = [];
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      eventName = "";
      return;
    }
    const type = data.type || eventName;
    eventName = "";
    if (data.error || type === "response.failed") {
      const error = data.error || (data.response && data.response.error);
      throw new Error((error && (error.message || error.code)) || "API error");
    }
    if (type === "response.output_text.delta" && typeof data.delta === "string")
      consumeText(g, data.delta);
    else if (
      (type === "response.reasoning_summary_text.delta" ||
        type === "response.reasoning_text.delta") &&
      typeof data.delta === "string"
    )
      appendReasoning(g, data.delta);
    else if (
      type === "response.output_item.added" ||
      type === "response.output_item.done"
    ) {
      const item = data.item;
      if (item && item.type === "function_call") {
        let call = g.turnCalls.find(
          (entry) => entry._itemId === item.id || entry.id === item.call_id,
        );
        if (!call) {
          call = {
            id: item.call_id || "",
            function: { name: item.name || "", arguments: "" },
            _itemId: item.id || "",
          };
          g.turnCalls.push(call);
        }
        if (item.call_id) call.id = item.call_id;
        if (item.id) call._itemId = item.id;
        if (item.name) call.function.name = item.name;
        if (typeof item.arguments === "string")
          call.function.arguments = item.arguments;
      }
    } else if (type === "response.function_call_arguments.delta") {
      const call =
        g.turnCalls.find((entry) => entry._itemId === data.item_id) ||
        (Number.isInteger(data.output_index)
          ? g.turnCalls[data.output_index]
          : null) ||
        g.turnCalls[g.turnCalls.length - 1];
      if (call && typeof data.delta === "string")
        call.function.arguments += data.delta;
    } else if (type === "response.function_call_arguments.done") {
      const call =
        g.turnCalls.find((entry) => entry._itemId === data.item_id) ||
        (Number.isInteger(data.output_index)
          ? g.turnCalls[data.output_index]
          : null) ||
        g.turnCalls[g.turnCalls.length - 1];
      if (call && typeof data.arguments === "string")
        call.function.arguments = data.arguments;
    }
    if (type === "response.completed") {
      const response = data.response || {};
      if (response.usage) g.usage = response.usage;
      addResponsesOutputCalls(response.output, g);
    }
  };

  const line = (value) => {
    value = value.replace(/\r$/, "");
    if (!value) {
      handle();
    } else if (value.startsWith("event:")) {
      eventName = value.slice(6).trim();
    } else if (value.startsWith("data:")) {
      dataLines.push(value.slice(5).trimStart());
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        line(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    }
    if (buf) line(buf);
    handle();
    consumeText(g, "", true);
  } finally {
    try {
      reader.cancel();
    } catch {}
  }
}

function addResponsesOutputCalls(output, g) {
  if (!Array.isArray(output)) return;
  output
    .filter((item) => item && item.type === "function_call")
    .forEach((item) => {
      let call = g.turnCalls.find(
        (entry) => entry.id === item.call_id || entry._itemId === item.id,
      );
      if (!call) {
        call = {
          id: item.call_id || "",
          function: { name: item.name || "", arguments: "" },
          _itemId: item.id || "",
        };
        g.turnCalls.push(call);
      }
      if (item.call_id) call.id = item.call_id;
      if (item.id) call._itemId = item.id;
      if (item.name) call.function.name = item.name;
      if (typeof item.arguments === "string")
        call.function.arguments = item.arguments;
    });
}

function responsesMessagesForApi(message) {
  if (message.role === "user") {
    const apiMessage = buildApiMessage(message);
    const content = Array.isArray(apiMessage.content)
      ? apiMessage.content
      : [{ type: "text", text: apiMessage.content || "" }];
    const inputContent = content
      .map((part) =>
        part.type === "image_url"
          ? { type: "input_image", image_url: part.image_url.url }
          : { type: "input_text", text: part.text || "" },
      )
      .filter((part) => part.type !== "input_text" || part.text);
    if (!inputContent.length)
      inputContent.push({ type: "input_text", text: "" });
    return [
      {
        role: "user",
        content: inputContent,
      },
    ];
  }

  const output = [];
  if (message.content)
    output.push({
      role: "assistant",
      content: [{ type: "output_text", text: message.content }],
    });
  (message.toolCalls || []).forEach((call) =>
    output.push({
      type: "function_call",
      call_id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    }),
  );
  (message.toolResults || []).forEach((result) =>
    output.push({
      type: "function_call_output",
      call_id: result.tool_call_id,
      output: result.content,
    }),
  );
  return output;
}

const RUN_JS_TOOL = {
  type: "function",
  function: {
    name: "run_js",
    description:
      "Runs JavaScript in an isolated sandbox without access to the page or API key. Use it for calculations and data processing.",
    parameters: {
      type: "object",
      properties: {
        code: { type: "string", description: "JavaScript code to execute" },
      },
      required: ["code"],
      additionalProperties: false,
    },
  },
};

function enabledTools(g) {
  if (g.disableTools) return [];
  const tools = [];
  if (toolPreferenceEnabled(LS.toolRunJs)) tools.push(RUN_JS_TOOL);
  if (toolPreferenceEnabled(LS.toolCreateFiles)) tools.push(CREATE_FILES_TOOL);
  if (toolPreferenceEnabled(LS.toolWikipediaSearch))
    tools.push(WIKIPEDIA_SEARCH_TOOL);
  if (toolPreferenceEnabled(LS.toolWikipediaRead))
    tools.push(WIKIPEDIA_READ_TOOL);
  if (toolPreferenceEnabled(LS.toolStorageSearch))
    tools.push(STORAGE_TOOLS.find((tool) => tool.function.name === "storage_search"));
  if (toolPreferenceEnabled(LS.toolStorageRead))
    tools.push(STORAGE_TOOLS.find((tool) => tool.function.name === "storage_read"));
  return tools;
}

function responsesTool(tool) {
  return {
    type: "function",
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  };
}

function executeInWorker(code, signal) {
  const timeoutMs = Math.max(
    100,
    Math.min(120000, Number(readPreference(LS.workerTimeout, "5000")) || 5000),
  );
  return new Promise((resolve) => {
    const source = `
      "use strict";
      self.fetch = self.XMLHttpRequest = self.WebSocket = self.EventSource = undefined;
      self.Worker = self.SharedWorker = self.importScripts = undefined;
      self.WebTransport = self.RTCPeerConnection = self.BroadcastChannel = undefined;
      try { self.navigator.sendBeacon = undefined; } catch {}
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const logs = [];
      const safeString = (value) => {
        if (typeof value === "string") return value;
        try { return JSON.stringify(value); } catch { return String(value); }
      };
      const consoleProxy = {};
      ["log", "warn", "error"].forEach((level) => {
        consoleProxy[level] = (...args) => logs.push({ level, text: args.map(safeString).join(" ") });
      });
      self.console = consoleProxy;
      self.onmessage = async ({ data }) => {
        try {
          let value;
          try {
            value = await (new AsyncFunction("console", "return await (async () => (" + data.code + "\\n))()"))(consoleProxy);
          } catch (expressionError) {
            value = await (new AsyncFunction("console", "return await (async () => {\\n" + data.code + "\\n})()"))(consoleProxy);
          }
          let result;
          try { result = value === undefined ? "undefined" : JSON.parse(JSON.stringify(value)); }
          catch { result = safeString(value); }
          self.postMessage({ result, logs });
        } catch (error) { self.postMessage({ error: error && error.message || String(error), logs }); }
      };
    `;
    const url = URL.createObjectURL(
      new Blob([source], { type: "text/javascript" }),
    );
    let worker;
    try {
      worker = new Worker(url);
    } catch (error) {
      URL.revokeObjectURL(url);
      resolve({
        error: error.message || "Could not start the worker",
        logs: [],
      });
      return;
    }
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const abort = () => finish({ error: "Execution stopped", logs: [] });
    const timer = setTimeout(
      () => finish({ error: `Execution timed out (${timeoutMs} ms)`, logs: [] }),
      timeoutMs,
    );
    signal.addEventListener("abort", abort, { once: true });
    worker.onmessage = (event) => finish(event.data);
    worker.onerror = (event) =>
      finish({ error: event.message || "Worker error", logs: [] });
    worker.postMessage({ code });
  });
}

async function executeTool(call, signal, message) {
  if (signal.aborted) return { error: "Execution stopped", logs: [] };
  const name = call.function && call.function.name;
  if (
    name !== "run_js" &&
    name !== "create_files" &&
    name !== "wikipedia_search" &&
    name !== "wikipedia_read" &&
    name !== "storage_search" &&
    name !== "storage_read"
  )
    return { error: `Unknown tool: ${name}`, logs: [] };
  const toolPreferenceByName = {
    run_js: LS.toolRunJs,
    create_files: LS.toolCreateFiles,
    wikipedia_search: LS.toolWikipediaSearch,
    wikipedia_read: LS.toolWikipediaRead,
    storage_search: LS.toolStorageSearch,
    storage_read: LS.toolStorageRead,
  };
  if (!toolPreferenceEnabled(toolPreferenceByName[name]))
    return { error: `The ${name} tool is disabled in Settings.`, logs: [] };
  let args;
  try {
    args = JSON.parse(call.function.arguments || "{}");
  } catch {
    return { error: "Could not parse tool arguments", logs: [] };
  }
  if (name === "wikipedia_search" || name === "wikipedia_read")
    return executeWikipediaTool(name, args, signal);
  if (name === "storage_search" || name === "storage_read")
    return executeStorageTool(name, args, signal);
  if (name === "create_files") {
    try {
      const artifact = await createFilesArtifact(args, call.id);
      if (signal.aborted) return { error: "File creation stopped" };
      if (!Array.isArray(message.createdFiles)) message.createdFiles = [];
      message.createdFiles.push(artifact);
      const description =
        artifact.type === "zip"
          ? `${artifact.name} (${artifact.count} ${plural(artifact.count, "file", "files")})`
          : artifact.name;
      return {
        result: `Files created successfully and made available for download: ${description}.`,
      };
    } catch (error) {
      return { error: error.message || "Could not create files" };
    }
  }
  if (typeof args.code !== "string")
    return { error: "The code parameter must be a string", logs: [] };
  return executeInWorker(args.code, signal);
}

function messagesForApi(message) {
  if (
    message.role !== "assistant" ||
    !message.toolCalls ||
    !message.toolCalls.length
  )
    return [buildApiMessage(message)];
  const calls = message.toolCalls.map((call) => ({
    id: call.id,
    type: "function",
    function: call.function,
  }));
  const output = [
    { role: "assistant", content: message.content || null, tool_calls: calls },
  ];
  (message.toolResults || []).forEach((result) =>
    output.push({
      role: "tool",
      tool_call_id: result.tool_call_id,
      content: result.content,
    }),
  );
  return output;
}

function makePayload(g, chat) {
  const responses = g.protocol === "responses";
  const historyLimit = Math.max(
    0,
    Math.floor(Number(readPreference(LS.contextHistoryLimit, "0")) || 0),
  );
  const history = chat.messages.filter((message) => message !== g.msg);
  const limitedHistory = historyLimit ? history.slice(-historyLimit) : history;
  const temperatureRaw = readPreference(LS.temperature);
  const temperature =
    temperatureRaw.trim() === "" ? null : Number(temperatureRaw);
  const maxOutputTokensRaw = readPreference(LS.maxOutputTokens);
  const maxOutputTokens =
    maxOutputTokensRaw.trim() === "" ? null : Number(maxOutputTokensRaw);
  if (responses) {
    const input = [];
    limitedHistory.forEach((message) => {
      input.push(...responsesMessagesForApi(message));
    });
    const payload = { model: g.model, stream: true, input };
    const systemPrompt = getSystemPrompt();
    if (systemPrompt) payload.instructions = systemPrompt;
    if (Number.isFinite(temperature)) payload.temperature = temperature;
    if (Number.isInteger(maxOutputTokens) && maxOutputTokens > 0)
      payload.max_output_tokens = maxOutputTokens;
    if (g.supportsReasoning) {
      payload.reasoning =
        g.reasoningEffort === "none"
          ? { effort: "none" }
          : { effort: g.reasoningEffort, summary: "auto" };
    }
    const tools = enabledTools(g);
    if (tools.length) {
      payload.tools = tools.map(responsesTool);
      payload.tool_choice = "auto";
    }
    return payload;
  }

  const messages = [];
  const systemPrompt = getSystemPrompt();
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  limitedHistory.forEach((message) => {
    messages.push(...messagesForApi(message));
  });
  const payload = {
    model: g.model,
    stream: true,
    stream_options: { include_usage: true },
    messages,
  };
  if (Number.isFinite(temperature)) payload.temperature = temperature;
  if (Number.isInteger(maxOutputTokens) && maxOutputTokens > 0)
    payload.max_tokens = maxOutputTokens;
  if (
    g.supportsReasoning &&
    g.reasoningEffort &&
    g.reasoningEffort !== "none"
  ) {
    payload.reasoning_effort = g.reasoningEffort;
  }
  const tools = enabledTools(g);
  if (tools.length) {
    payload.tools = tools;
    payload.tool_choice = "auto";
  }
  return payload;
}

async function requestTurn(g) {
  g.turnCalls = [];
  const payload = makePayload(g, g.chat);
  let res = await post(payload, g.ctl.signal, g.provider);
  if (res.status === 400) {
    const raw = await res.text();
    if (/stream_options|include_usage|reasoning_effort|reasoning/i.test(raw)) {
      delete payload.stream_options;
      delete payload.reasoning_effort;
      delete payload.reasoning;
      res = await post(payload, g.ctl.signal, g.provider);
    } else throw new Error(apiError(res.status, raw));
  }
  if (!res.ok) throw new Error(apiError(res.status, await res.text()));
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/event-stream")) {
    if (g.protocol === "responses") await readResponsesSSE(res, g);
    else await readSSE(res, g);
  } else {
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "API error");
    g.usage = data.usage || (data.response && data.response.usage) || g.usage;
    if (g.protocol === "responses") {
      const output =
        data.output || (data.response && data.response.output) || [];
      addResponsesOutputCalls(output, g);
      output.forEach((item) => {
        if (item.type === "reasoning")
          (item.summary || []).forEach((part) => {
            if (part.type === "summary_text" && part.text)
              appendReasoning(g, part.text);
          });
        if (item.type === "message")
          (item.content || []).forEach((part) => {
            if (part.type === "output_text" && part.text)
              consumeText(g, part.text);
          });
      });
      if (!output.length && typeof data.output_text === "string")
        consumeText(g, data.output_text);
      consumeText(g, "", true);
      return g.turnCalls
        .filter((call) => call && call.function)
        .map(({ _itemId, ...call }) => call);
    }
    const message = data.choices && data.choices[0] && data.choices[0].message;
    if (message) {
      if (typeof message.reasoning_content === "string")
        appendReasoning(g, message.reasoning_content);
      if (typeof message.reasoning === "string")
        appendReasoning(g, message.reasoning);
      if (typeof message.content === "string")
        consumeText(g, message.content, true);
      if (Array.isArray(message.tool_calls)) g.turnCalls = message.tool_calls;
    }
  }
  return g.turnCalls
    .filter((call) => call && call.function)
    .map(({ _itemId, ...call }) => call);
}

async function generate(chat) {
  if (generating || !ensureKey()) return;
  const msg = { id: uid(), role: "assistant", content: "", meta: null };
  chat.messages.push(msg);
  const provider = getActiveProvider();
  const g = {
    ctl: new AbortController(),
    chat,
    chatId: chat.id,
    msg,
    t0: performance.now(),
    usage: null,
    model,
    provider,
    protocol: provider ? provider.protocol : "chat/completions",
    supportsReasoning: !!(provider && provider.supportsReasoning),
    reasoningEffort,
    reasoning: "",
    reasoningMs: 0,
    reasoningStartedAt: 0,
    thinkingStartedAt: 0,
    thinkingActive: false,
    inThink: false,
    tagBuffer: "",
    turnCalls: [],
    maxToolRounds: Math.max(
      1,
      Math.min(50, Math.floor(Number(readPreference(LS.maxToolRounds, "6")) || 6)),
    ),
  };
  msg.reasoningEffort = g.reasoningEffort;
  generating = g;
  setSendState(true);
  renderThread();
  updateLayout();
  stick = true;
  scrollToBottom(false);

  try {
    let rounds = 0;
    while (true) {
      const calls = await requestTurn(g);
      if (!calls.length) break;
      if (g.disableTools)
        throw new Error(
          "The tool-call limit for a single response has been reached.",
        );
      finishThinking(g);
      g.msg.toolCalls = calls;
      g.msg.toolResults = [];
      persist(chat);
      if (chat.id === activeId) renderThread();
      for (const call of calls) {
        const result = await executeTool(call, g.ctl.signal, g.msg);
        g.msg.toolResults.push({
          tool_call_id: call.id,
          content: JSON.stringify(result),
        });
      }
      persist(chat);
      if (chat.id === activeId) renderThread();
      rounds += 1;
      const next = { id: uid(), role: "assistant", content: "", meta: null };
      chat.messages.push(next);
      g.msg = next;
      g.reasoning = "";
      g.reasoningMs = 0;
      g.thinkingStartedAt = 0;
      g.thinkingActive = false;
      g.inThink = false;
      g.answerStarted = false;
      g.tagBuffer = "";
      g.disableTools = rounds >= g.maxToolRounds;
      if (chat.id === activeId) renderThread();
    }
    if (!g.msg.content.trim() && g.msg.reasoning && g.thinkingActive) {
      g.reasoningMs = Math.round(performance.now() - g.thinkingStartedAt);
      g.msg.reasoningMs = g.reasoningMs;
    }
    if (!g.msg.content.trim())
      throw new Error("The model returned an empty response.");
    finalize();
  } catch (err) {
    if ((err && err.name === "AbortError") || g.ctl.signal.aborted) {
      finalize({ stopped: true });
      return;
    }
    finalize({ failed: true });
    showError(humanError(err), true);
  }
}

function finalize(opts = {}) {
  const g = generating;
  if (!g) return;
  if (renderTimer) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
  if (g.thinkingActive && g.reasoning) {
    g.reasoningMs = Math.round(performance.now() - g.thinkingStartedAt);
    g.msg.reasoningMs = g.reasoningMs;
  }
  g.msg.reasoning = g.reasoning || g.msg.reasoning || "";
  generating = null;
  const ms = performance.now() - g.t0;
  const { chat, msg } = g;
  if (!msg.content.trim() && !msg.toolCalls) {
    const i = chat.messages.indexOf(msg);
    if (i > -1) chat.messages.splice(i, 1);
  } else if (msg.content.trim()) {
    const u = g.usage;
    const tokens = u
      ? u.total_tokens ||
        (u.prompt_tokens || u.input_tokens || 0) +
          (u.completion_tokens || u.output_tokens || 0)
      : Math.max(1, Math.round(msg.content.length / 3));
    msg.meta = {
      model: g.model,
      tokens,
      exact: !!u,
      ms: Math.round(ms),
      reasoningEffort: g.reasoningEffort,
      stopped: !!opts.stopped,
      failed: !!opts.failed,
    };
  }
  chat.updatedAt = Date.now();
  persist(chat);
  renderSidebar();
  setSendState(false);
  if (chat.id === activeId) {
    renderThread();
    updateLayout();
    if (stick) scrollToBottom(false);
    if (!isMobile()) input.focus();
  }
}

function stop() {
  const g = generating;
  if (!g) return;
  g.ctl.abort();
  finalize({ stopped: true });
}

async function send() {
  const text = input.value.trim();
  if ((!text && !hasPendingAttachments()) || generating || !ensureKey()) return;
  hideError();
  const attachments = takePendingAttachments();
  let chat = getActive();
  if (!chat) {
    chat = {
      id: uid(),
      title: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    chats.unshift(chat);
    activeId = chat.id;
  }
  if (chat.messages.length === 0)
    chat.title = makeTitle(
      text || (attachments[0] && attachments[0].name) || "New chat",
    );
  const userMsg = { id: uid(), role: "user", content: text, meta: null };
  if (attachments.length) userMsg.attachments = attachments;
  chat.messages.push(userMsg);
  chat.updatedAt = Date.now();
  input.value = "";
  autosize();
  updateSendState();
  persist(chat);
  renderSidebar();
  renderThread();
  updateLayout();
  stick = true;
  scrollToBottom(false);
  await generate(chat);
}

function regenerate() {
  if (generating || !ensureKey()) return;
  const chat = getActive();
  const last = chat && chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "assistant") return;
  chat.messages.pop();
  while (chat.messages.length) {
    const previous = chat.messages[chat.messages.length - 1];
    if (previous.role !== "assistant" || !previous.toolCalls) break;
    chat.messages.pop();
  }
  hideError();
  persist(chat);
  renderThread();
  generate(chat);
}
