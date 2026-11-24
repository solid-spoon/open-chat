"use strict";

/* ================= Wikipedia client tools ================= */
const WIKIPEDIA_TIMEOUT_MS = 9000;
const WIKIPEDIA_MAX_RESULTS = 3;
const WIKIPEDIA_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "wikipedia_search",
    description:
      "Searches Wikipedia and returns article introductions with source links. Choose the language that best matches the user's context (for example ru or en); defaults to ru.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The topic or keywords to search for (plain words only-never use URLs or site: operators)",
        },
        lang: {
          type: "string",
          description: "Wikipedia language subdomain, for example ru or en",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};
const WIKIPEDIA_READ_TOOL = {
  type: "function",
  function: {
    name: "wikipedia_read",
    description:
      "Reads a specific Wikipedia article by its exact title and returns a longer plain-text extract with a source link. Use after searching when more detail is needed. Choose the same language as the article; defaults to ru.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "The exact Wikipedia article title (plain title, not a URL)",
        },
        lang: {
          type: "string",
          description: "Wikipedia language subdomain, for example ru or en",
        },
        max_chars: {
          type: "integer",
          description:
            "Maximum text length to return (1000–20000, default 12000)",
        },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
};
const WIKIPEDIA_TOOLS = [WIKIPEDIA_SEARCH_TOOL, WIKIPEDIA_READ_TOOL];

function wikipediaLanguage(value) {
  const lang = typeof value === "string" && value.trim() ? value.trim() : "ru";
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i.test(lang))
    throw new Error("Use a valid Wikipedia language code, such as ru or en.");
  return lang.toLowerCase();
}

async function fetchWikipediaApi(lang, params, signal) {
  if (signal && signal.aborted)
    throw new Error("Wikipedia request was cancelled.");
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  if (signal) signal.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, WIKIPEDIA_TIMEOUT_MS);

  try {
    const query = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      origin: "*",
      redirects: "1",
      ...params,
    });
    const response = await fetch(
      `https://${lang}.wikipedia.org/w/api.php?${query}`,
      { signal: controller.signal },
    );
    if (!response.ok)
      throw new Error(`Wikipedia returned HTTP ${response.status}.`);
    const data = await response.json();
    if (data.error)
      throw new Error(data.error.info || "Wikipedia API returned an error.");
    return data;
  } catch (error) {
    if (signal && signal.aborted)
      throw new Error("Wikipedia request was cancelled.");
    if (timedOut)
      throw new Error("Wikipedia did not respond within 9 seconds. Try again.");
    throw new Error(
      `Could not reach Wikipedia: ${error.message || "network error"}`,
    );
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", abortFromCaller);
  }
}

function wikipediaPageUrl(page, lang) {
  if (page && typeof page.fullurl === "string") {
    try {
      const url = new URL(page.fullurl);
      if (url.protocol === "https:" && url.hostname === `${lang}.wikipedia.org`)
        return url.href;
    } catch {}
  }
  const title = (page && page.title) || "";
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title).replace(/%20/g, "_")}`;
}

function wikipediaPages(data) {
  const pages = data && data.query && data.query.pages;
  if (Array.isArray(pages)) return pages;
  return pages && typeof pages === "object" ? Object.values(pages) : [];
}

function plainWikipediaSnippet(value) {
  if (typeof value !== "string" || !value) return "";
  return new DOMParser()
    .parseFromString(value, "text/html")
    .body.textContent.replace(/\s+/g, " ")
    .trim();
}

async function readWikipediaExtract(
  title,
  lang,
  maxChars,
  signal,
  intro = true,
) {
  const data = await fetchWikipediaApi(
    lang,
    {
      prop: "extracts|info",
      inprop: "url",
      ...(intro ? { exintro: "1" } : {}),
      explaintext: "1",
      exchars: String(maxChars),
      titles: title,
    },
    signal,
  );
  const page = wikipediaPages(data)[0];
  if (!page || page.missing)
    return { error: `No Wikipedia article found with the title “${title}”.` };
  return {
    title: page.title || title,
    extract: typeof page.extract === "string" ? page.extract.trim() : "",
    url: wikipediaPageUrl(page, lang),
  };
}

async function wikipediaSearch(args, signal) {
  if (typeof args.query !== "string" || !args.query.trim())
    return { error: "Provide a non-empty Wikipedia search query." };
  const query = args.query.trim().slice(0, 300);
  const lang = wikipediaLanguage(args.lang);
  const data = await fetchWikipediaApi(
    lang,
    {
      list: "search",
      srsearch: query,
      srlimit: String(WIKIPEDIA_MAX_RESULTS),
    },
    signal,
  );
  const candidates =
    data.query && data.query.search
      ? data.query.search.slice(0, WIKIPEDIA_MAX_RESULTS)
      : [];
  if (!candidates.length) {
    return {
      query,
      lang,
      results: [],
      message: `No Wikipedia articles matched “${query}” in ${lang}.`,
    };
  }

  const results = await Promise.all(
    candidates.map(async (candidate) => {
      const snippet = plainWikipediaSnippet(candidate.snippet);
      try {
        const article = await readWikipediaExtract(
          candidate.title,
          lang,
          3000,
          signal,
        );
        if (article.error) {
          return {
            title: candidate.title,
            extract: "",
            snippet,
            url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(candidate.title).replace(/%20/g, "_")}`,
            error: article.error,
          };
        }
        return { ...article, snippet };
      } catch (error) {
        return {
          title: candidate.title,
          extract: "",
          snippet,
          url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(candidate.title).replace(/%20/g, "_")}`,
          error: error.message || "Could not read this article.",
        };
      }
    }),
  );
  return { query, lang, results };
}

async function wikipediaRead(args, signal) {
  if (typeof args.title !== "string" || !args.title.trim())
    return { error: "Provide an exact Wikipedia article title to read." };
  const title = args.title.trim().slice(0, 300);
  const lang = wikipediaLanguage(args.lang);
  const maxChars = Number.isFinite(args.max_chars)
    ? Math.min(20000, Math.max(1000, Math.floor(args.max_chars)))
    : 12000;
  const article = await readWikipediaExtract(
    title,
    lang,
    maxChars,
    signal,
    false,
  );
  return article.error
    ? { title, lang, error: article.error }
    : { ...article, lang };
}

async function executeWikipediaTool(name, args, signal) {
  try {
    if (name === "wikipedia_search") return await wikipediaSearch(args, signal);
    if (name === "wikipedia_read") return await wikipediaRead(args, signal);
    return { error: `Unknown Wikipedia tool: ${name}` };
  } catch (error) {
    return { error: error.message || "Wikipedia request failed. Try again." };
  }
}
