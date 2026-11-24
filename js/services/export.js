"use strict";

/* ================= Markdown chat export ================= */
const CYRILLIC_FILENAME = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

function chatFilename(title) {
  const transliterated = [...(title || "New chat")]
    .map((char) => CYRILLIC_FILENAME[char.toLowerCase()] ?? char)
    .join("");
  const slug = transliterated
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return `${slug || "chat"}.md`;
}

function chatMarkdown(chat) {
  const title = (chat.title || "New chat")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .replace(/[\\`*_{}\[\]<>()#+.!|~-]/g, "\\$&");
  const modelIds = [
    ...new Set(
      chat.messages
        .filter((message) => message.role === "assistant")
        .map((message) => message.meta && message.meta.model)
        .filter((id) => typeof id === "string" && id),
    ),
  ];
  const modelNames = modelIds.map(
    (id) => (modelDescriptor(id) || { label: id }).label,
  );
  const exportedAt = new Date().toISOString().slice(0, 10);
  const header = [`# ${title}`, `Exported: ${exportedAt}`];
  if (modelNames.length) header.push(`Model: ${modelNames.join(", ")}`);

  const messages = chat.messages
    .filter(
      (message) => message.role === "user" || message.role === "assistant",
    )
    .map((message) => {
      const content = message.content || "";
      const attachments = Array.isArray(message.attachments)
        ? message.attachments
            .map((attachment) => attachment.name)
            .filter(Boolean)
        : [];
      const attachmentNote = attachments.length
        ? `\n\n_Attachments: ${attachments.join(", ")}_`
        : "";
      return `## ${message.role === "user" ? "User" : "Assistant"}\n\n${content}${attachmentNote}`;
    });

  return `${header.join("\n")}\n\n---\n\n${messages.join("\n\n---\n\n")}\n`;
}

function downloadChatMarkdown(chat) {
  if (!chat || !chat.messages.length) return;
  const blob = new Blob([chatMarkdown(chat)], {
    type: "text/markdown;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = el("a");
  link.href = url;
  link.download = chatFilename(chat.title);
  link.hidden = true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
