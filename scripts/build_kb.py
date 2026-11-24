#!/usr/bin/env python3
import hashlib
import json
import argparse
import re
from collections import Counter
from pathlib import Path

# === SETTINGS ===
ROOT_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = ROOT_DIR / "storage"
RAW_DIR = STORAGE_DIR / "raw"
OUT_INDEX = STORAGE_DIR / "index.json"
OUT_CHUNKS = STORAGE_DIR / "chunks.json"
MANIFEST_PATH = STORAGE_DIR / "manifest.json"

MODEL_REPO = "Qwen/Qwen2.5-1.5B-Instruct-GGUF"
MODEL_FILE = "qwen2.5-1.5b-instruct-q4_k_m.gguf"

CHUNK_SIZE = 1000
CHUNK_OVERLAP = 120
SUPPORTED_EXT = {
    ".md", ".txt", ".json", ".py", ".js", ".html", ".css", ".csv",
    ".docx", ".pptx",
}
STOP_WORDS = set("""
a about after again all am an and any are as at be been before between both
but by can could did do does down during each few for from further had has
have he her here hers him his how i if in into is it its itself just me more
most my no nor not of off on once only or other our ours out over own same she
should so some such than that the their theirs them themselves then there
these they this those through to too under until up very was we were what when
where which while who whom why will with would you your yours
а без более был была были быть в вам вас весь во вот все всего вы где да даже
для до его ее если есть еще же за и из или им их как ко когда кто ли либо мне
может мы на над надо наш не него нее нет ни них но ну о об один она они оно
от по под при с со так такой также там те тем то того тоже той только том ты
у уже что чтобы эта эти это я
""".split())


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def extract_text(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".docx":
        from docx import Document
        doc = Document(str(path))
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    if ext == ".pptx":
        from pptx import Presentation
        prs = Presentation(str(path))
        slides = []
        for idx, slide in enumerate(prs.slides, 1):
            parts = []
            for shape in slide.shapes:
                if hasattr(shape, "text") and shape.text.strip():
                    parts.append(shape.text.strip())
            if parts:
                slides.append(f"[Slide {idx}]\n" + "\n".join(parts))
        return "\n\n".join(slides)
    return path.read_text(encoding="utf-8", errors="ignore")


def split_chunks(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    text = re.sub(r"\n{3,}", "\n\n", text.strip())
    if not text:
        return []
    paragraphs = re.split(r"\n\n+", text)
    chunks = []
    current = ""
    for para in paragraphs:
        if len(para) > size:
            if current:
                chunks.append(current.strip())
                current = ""
            for i in range(0, len(para), size - overlap):
                chunks.append(para[i : i + size].strip())
            continue
        if len(current) + len(para) + 2 <= size:
            current = f"{current}\n\n{para}" if current else para
        else:
            chunks.append(current.strip())
            tail = current[-overlap:] if overlap > 0 else ""
            current = f"{tail}\n\n{para}".strip()
    if current:
        chunks.append(current.strip())
    return [c for c in chunks if c.strip()]


def load_llm():
    from huggingface_hub import hf_hub_download
    from llama_cpp import Llama

    print(f"Downloading model {MODEL_FILE}...")
    model_path = hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILE)
    return Llama(
        model_path=model_path,
        n_ctx=2048,
        n_gpu_layers=-1,  # Offload all layers to your 6 GB of VRAM
        verbose=False,
    )


def fallback_metadata(source: str, chunk_text: str) -> dict:
    words = re.findall(r"[\w-]{3,}", chunk_text.lower(), flags=re.UNICODE)
    counts = Counter(
        word for word in words
        if word not in STOP_WORDS and not word.isdigit()
    )
    tags = [word for word, _ in counts.most_common(25)]
    lines = [re.sub(r"^#+\s*", "", line.strip()) for line in chunk_text.splitlines()]
    first_line = next((line for line in lines if line), "")
    title = first_line[:120] or Path(source).stem
    summary_text = re.sub(r"\s+", " ", chunk_text).strip()
    sentences = re.split(r"(?<=[.!?])\s+", summary_text)
    summary = " ".join(sentences[:2])[:300]
    return {"title": title, "summary": summary, "tags": tags}


def enrich_chunk(llm, source: str, chunk_text: str) -> dict:
    fb = fallback_metadata(source, chunk_text)
    prompt = (
        "Extract metadata from the text below. Respond strictly in English only. Never use Chinese or Russian characters.\n"
        "Return valid JSON:\n"
        '{"t":"short descriptive title (3-7 words)","s":"1-sentence summary of the fragment","g":["15-25 lowercase English keywords, technical terms, entities, and synonyms"]}\n\n'
        "Example output:\n"
        '{"t":"Local RAG Indexing Pipeline in Python","s":"Instructions for indexing raw files from storage/raw into a static JSON database.","g":["rag","indexing","python","knowledge-base","search","json","chunks","tags","storage","embeddings","local-search","script","documentation","notes","cache"]}\n\n'
        f"Source: {source}\nText:\n{chunk_text[:1300]}"
    )
    res = llm.create_chat_completion(
        messages=[
            {
                "role": "system",
                "content": "You are a strict JSON metadata extractor. Output language: English only.",
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.15,
        repeat_penalty=1.1,
        max_tokens=750,
    )
    raw = res["choices"][0]["message"]["content"]
    try:
        data = json.loads(raw)
    except Exception:
        data = {}

    tags = data.get("g") or data.get("tags") or []
    if isinstance(tags, str):
        tags = [tags]
    clean_tags = []
    for t in tags:
        tag = re.sub(r"[^\x00-\x7f]+", "", str(t)).strip().lower()
        if len(tag) >= 2 and tag not in clean_tags:
            clean_tags.append(tag)

    if len(clean_tags) < 6:
        for ft in fb["tags"]:
            ascii_ft = re.sub(r"[^\x00-\x7f]+", "", ft).strip().lower()
            if len(ascii_ft) >= 2 and ascii_ft not in clean_tags:
                clean_tags.append(ascii_ft)

    title = re.sub(r"[^\x00-\x7f]+", "", str(data.get("t") or "")).strip() or fb["title"]
    summary = re.sub(r"[^\x00-\x7f]+", "", str(data.get("s") or "")).strip() or fb["summary"]

    return {
        "title": title[:120],
        "summary": summary[:300],
        "tags": clean_tags[:25],
    }



def main():
    parser = argparse.ArgumentParser(description="Build a local knowledge index in storage/")
    parser.add_argument(
        "--no-llm",
        action="store_true",
        help="Generate metadata using local regex and frequency-based heuristics without downloading a model",
    )
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    try:
        manifest = json.loads(MANIFEST_PATH.read_text("utf-8")) if MANIFEST_PATH.exists() else {}
    except (OSError, json.JSONDecodeError):
        print(f"Warning: could not read {MANIFEST_PATH}; creating a new manifest.")
        manifest = {}
    new_manifest = {}
    all_index = []
    all_chunks = {}
    llm = None

    files = sorted(p for p in RAW_DIR.rglob("*") if p.is_file() and p.suffix.lower() in SUPPORTED_EXT)
    print(f"Files found in {RAW_DIR}: {len(files)}")

    for path in files:
        rel_path = path.relative_to(RAW_DIR).as_posix()
        digest = file_sha256(path)
        cached = manifest.get(rel_path)

        if (
            isinstance(cached, dict)
            and cached.get("sha256") == digest
            and isinstance(cached.get("index"), list)
            and isinstance(cached.get("chunks"), dict)
        ):
            new_manifest[rel_path] = cached
            all_index.extend(cached["index"])
            all_chunks.update(cached["chunks"])
            continue

        print(f"Indexing: {rel_path}")
        try:
            text = extract_text(path)
        except Exception as exc:
            print(f"Skipping {rel_path}: {exc}")
            continue
        pieces = split_chunks(text)
        doc_index = []
        doc_chunks = {}

        for i, piece in enumerate(pieces):
            cid = f"{hashlib.md5(rel_path.encode()).hexdigest()[:8]}_{i:03d}"
            if args.no_llm:
                meta = fallback_metadata(rel_path, piece)
            else:
                if llm is None:
                    llm = load_llm()
                meta = enrich_chunk(llm, rel_path, piece)
            doc_index.append({
                "id": cid,
                "source": rel_path,
                "title": meta["title"],
                "summary": meta["summary"],
                "tags": meta["tags"],
            })
            doc_chunks[cid] = piece

        new_manifest[rel_path] = {"sha256": digest, "index": doc_index, "chunks": doc_chunks}
        all_index.extend(doc_index)
        all_chunks.update(doc_chunks)

    OUT_INDEX.write_text(json.dumps(all_index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    OUT_CHUNKS.write_text(json.dumps(all_chunks, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    MANIFEST_PATH.write_text(json.dumps(new_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Done! Chunks in the database: {len(all_index)} -> {OUT_INDEX} & {OUT_CHUNKS}")


if __name__ == "__main__":
    main()