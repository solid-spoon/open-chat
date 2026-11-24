# Open Chat

A lightweight, browser-based chat client for large language models. Open Chat is a static, bring-your-own-key (BYOK) app: it has no application backend, and chat history and settings stay in your browser.

> An API key is required. The default provider profiles use Timeweb AI, but you can configure other API gateways that support the selected OpenAI-compatible protocol. Requests go directly from your browser to the configured provider. Review its pricing, usage limits, CORS support, and data-retention policy before use.

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

## Features

- **Configurable providers and protocols:** add provider profiles with a base URL, model IDs, and either OpenAI Responses (`/v1/responses`) or Chat Completions (`/v1/chat/completions`). Default profiles are provided for Timeweb AI. Reasoning controls are available for profiles configured to support them.
- **Generation controls:** set a system prompt, temperature, maximum output tokens, and the number of recent messages sent as context.
- **Tools:** independently enable `run_js` (runs in a Web Worker with a configurable timeout), `create_files` (text, code, DOCX, PPTX, and ZIP downloads), Wikipedia search/read, and local knowledge-base search/read. Tool rounds can be limited in Settings.
- **Markdown and artifacts:** sanitized Markdown, syntax highlighting, KaTeX math, collapsible reasoning, and HTML/SVG previews in a sandboxed `iframe`.
- **Attachments:** images are compressed in the browser; text, code, DOCX, and PPTX files are read client-side. Attach files by picker, drag-and-drop, or clipboard paste. Each file can be up to 10 MB.
- **Chat management:** search chats with `Ctrl+/` or `⌘/`, rename or delete chats, download individual conversations as Markdown, and import/export chat history as JSON.
- **Settings and privacy:** API keys are kept in `sessionStorage` by default, or can be remembered in `localStorage`. Export/import settings without API keys, and import/export chat history.

## Getting started

### Run locally

No build step or application server is required. Serve the project over HTTP (rather than opening `index.html` directly):

```bash
git clone https://github.com/solid-spoon/open-chat.git
cd open-chat
python3 -m http.server 8000
```

Open <http://localhost:8000>, select **Settings**, choose or add a provider, enter its API key, and configure at least one model ID. The browser must be able to connect directly to that provider (CORS).

The app uses vendored Markdown and syntax-highlighting libraries. KaTeX, JSZip, and the DOCX/PPTX generation libraries are loaded from CDNs when needed, so those features require an internet connection.

### Deploy to GitHub Pages

1. In the repository, open **Settings → Pages**.
2. Under **Build and deployment**, select **Deploy from a branch**.
3. Choose the `main` branch and the `/(root)` folder, then save.

The site will be available at <https://solid-spoon.github.io/open-chat/>. GitHub Pages serves the app as static files; it does not proxy API requests or protect API keys.

### Optional: build the local knowledge base

The local knowledge tools read `storage/index.json` and `storage/chunks.json`. To create them:

1. Put source documents in `storage/raw/`. Supported formats are Markdown, text, JSON, Python, JavaScript, HTML, CSS, CSV, DOCX, and PPTX.
2. Install dependencies for the formats and mode you plan to use. For DOCX/PPTX input, install `python-docx` and `python-pptx`. The default metadata-generation mode additionally needs `huggingface-hub` and `llama-cpp-python`, and downloads the configured Qwen GGUF model on first use; it is intended for a machine with a compatible local setup. For example:

   ```bash
   python3 -m pip install python-docx python-pptx huggingface-hub llama-cpp-python
   ```
3. Run the indexer:

   ```bash
   python3 scripts/build_kb.py
   ```

   To skip the model download and use simple frequency-based metadata instead:

   ```bash
   python3 scripts/build_kb.py --no-llm
   ```

The generated `index.json` and `chunks.json` are read by the browser and should be deployed with the app. Raw input files and the build manifest are ignored by Git. **The generated knowledge base is public to anyone who can access the deployed site; do not index secrets or private data.** Enable `storage_search` and `storage_read` in **Settings → Tools** to use it.

## Security and privacy

- Never commit an API key or include one in public source files. Enter it in Settings; the app sends it directly from your browser to the configured API. Browser storage is not encrypted. Avoid remembering keys on shared or untrusted devices.
- Chat history, provider configuration, prompts, and preferences are stored in browser storage. Chat exports may contain personal information. Settings exports deliberately omit API keys.
- Wikipedia searches are sent directly to the selected language's public Wikipedia API. Local knowledge index and chunk files are fetched from the same static site and are publicly readable when deployed.
- A provider that blocks browser requests with CORS, or a shared API key that must remain secret, requires a separate server-side proxy. No proxy is included.
- `run_js` executes model-supplied JavaScript in a Web Worker, isolated from the page and API key, and applies a timeout. Review tool output as you would other model-generated content.

## Project structure

```text
.
├── index.html                 # App markup and script loading order
├── css/
│   └── styles.css             # Theme, components, and responsive layout
├── js/
│   ├── core/                  # Configuration, DOM references, state, utilities
│   ├── services/              # API/protocol handling, models, reasoning, export
│   ├── tools/                 # File creation, Wikipedia, local knowledge search
│   └── ui/                    # Settings, chat UI, rendering, navigation
├── scripts/
│   └── build_kb.py            # Build the optional local knowledge base
├── storage/
│   └── raw/                   # Source documents for the knowledge-base indexer
├── vendor/                    # Vendored Markdown and syntax-highlighting libraries
├── LICENSE
└── README.md
```

## Contributing

Contributions are welcome. Please [open an issue](https://github.com/solid-spoon/open-chat/issues) to discuss substantial changes before submitting a pull request. This repository has no build step or automated test suite; test changes in a browser and check JavaScript and Python syntax before opening a PR.

## License

Open Chat is licensed under the [Apache License 2.0](LICENSE).

## Author

Created and maintained by [solid-spoon](https://github.com/solid-spoon).
