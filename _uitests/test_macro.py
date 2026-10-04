import re

DEFAULT_STARTERS = [
    "A", "An", "The", "Digital", "Artwork", "Photograph",
    "Illustration", "Painting", "Anime", "Close-up",
    "Depicting", "This image", "In this", "Scene of", "Portrait of",
    "CGI", "3D", "Rendered", "Concept art", "Fantasy", "Sci-fi",
]

_PROSE_CONNECTIVES = {
    "is", "are", "was", "were", "with", "wearing", "standing",
    "sitting", "holding", "background", "foreground", "scene",
    "depicts", "depicting", "features", "featuring", "surrounded",
    "against", "dressed", "view", "look", "looking", "atmosphere",
    "reclining", "squatting", "walking", "running", "lying",
    "and", "which", "that", "there", "has", "have", "between"
}

MACRO_PROSE_PATTERN = re.compile(
    r"""(?ix)
    (?:
        # 1. 介质开头: (Digital/3D...)? (illustration/photograph...) of/depicting/showing/featuring/with/in...
        (?:(?:Digital|CGI|3D|Anime|Realistic|Photorealistic|High-resolution)\s+)?
        (?:illustration|photograph|photo|painting|artwork|drawing|sketch|image|render|rendering|depiction|portrait|close-up|view|shot)\s+(?:of|depicting|showing|featuring|with|in)\b
        |
        # 2. 冠词修饰介质: A/An/The (...) photograph/illustration... of/depicting...
        (?:A|An|The)\s+(?:[\w-]+\s+){0,3}(?:illustration|photograph|photo|painting|artwork|image|portrait|shot|view|scene|close-up|depiction)\s+(?:of|depicting|showing|featuring|with|in)\b
        |
        # 3. 冠词主体加动作/状态: A/An/The (...) man/woman/figure/character wearing/standing/sitting/holding/squatting/reclining/with...
        (?:A|An|The)\s+(?:[\w-]+\s+){0,2}(?:man|woman|girl|boy|person|figure|character|creature|animal|cat|dog|landscape)\s+(?:wearing|standing|sitting|holding|looking|squatting|reclining|dressed|with)\b
        |
        # 4. 指代/场景: (This/In this) (image/scene...) shows/depicts/features/presents...
        (?:In\s+this|This)\s+(?:image|photo|photograph|illustration|picture|scene|artwork)\s+(?:shows|depicts|features|presents|contains|is)\b
    )
    """
)


def find_prose_start(
    raw: str,
    *,
    use_macro_patterns: bool = True,
    use_syntax_density: bool = True,
    use_sentence_starters: bool = True,
    starters: list[str] | None = None,
    word_count_threshold: int = 5,
) -> int | None:
    """在原始文本中寻找自然语言的字符起始偏移量。找不到返回 None。"""
    if not raw.strip():
        return None

    # 分界标点：行首、换行后、逗号后、分号后、或句号+空格后
    # 使用正则匹配每个边界后面的候选段落
    boundary_re = re.compile(r"(?:\A|(?<=[\n,;])\s*|(?<=\.\s))\s*")

    candidates: list[tuple[int, str]] = []
    # 拆分所有候选位置与后续子串
    for m in re.finditer(r"(?:^|[\n,;]|\.\s+)(?=[^\n,;])", raw):
        idx = m.end()
        # idx 是该片段的起始字符索引
        sub = raw[idx:].strip()
        if sub:
            candidates.append((idx, sub))

    # 1. 方案 2：宏观整句正则优先匹配
    if use_macro_patterns:
        for idx, sub in candidates:
            # 检查 sub 开头是否匹配宏观模式
            if MACRO_PROSE_PATTERN.match(sub):
                return idx

    # 2. 方案 1：语法连词/动名词短语/词数密度与引导词检测
    if use_syntax_density or use_sentence_starters:
        starters_list = starters if starters is not None else DEFAULT_STARTERS
        starters_pattern = (
            re.compile(r"^(?:" + "|".join(re.escape(s) for s in starters_list) + r")\b", re.IGNORECASE)
            if (use_sentence_starters and starters_list) else None
        )

        for idx, sub in candidates:
            # 取到下一个逗号或句号前的第一个片段
            first_clause = re.split(r"[,;\n]|\.\s+", sub, maxsplit=1)[0].strip()
            words = first_clause.split()
            word_count = len(words)

            if starters_pattern and starters_pattern.match(first_clause):
                if word_count >= 3 or any(c in first_clause for c in ".!:?"):
                    return idx

            if use_syntax_density and word_count >= word_count_threshold:
                lowered_words = {w.lower().strip(".,!?:;\"'") for w in words}
                has_connective = bool(lowered_words & _PROSE_CONNECTIVES)
                has_punct = any(c in first_clause for c in ".!:?")
                has_ing = any(w.endswith("ing") and len(w) > 4 for w in lowered_words)
                if has_connective or has_punct or has_ing:
                    return idx

    return None


def split_caption_text(
    text: str,
    *,
    enabled: bool = True,
    split_on_newlines: bool = True,
    split_on_period: bool = True,
    use_macro_patterns: bool = True,
    use_syntax_density: bool = True,
    use_sentence_starters: bool = True,
    starters: list[str] | None = None,
    word_count_threshold: int = 5,
) -> tuple[list[str], str]:
    raw = text.strip() if text else ""
    if not raw:
        return [], ""

    if not enabled:
        tags = [t.strip().rstrip(".,") for t in raw.split(",") if t.strip()]
        return [t for t in tags if t], ""

    pos = find_prose_start(
        raw,
        use_macro_patterns=use_macro_patterns,
        use_syntax_density=use_syntax_density,
        use_sentence_starters=use_sentence_starters,
        starters=starters,
        word_count_threshold=word_count_threshold,
    )

    if pos is not None:
        tag_str = raw[:pos].strip()
        prose_str = raw[pos:].strip()
        raw_tags = [t.strip().rstrip(".,") for t in re.split(r"[,;\n]+", tag_str) if t.strip()]
        tags = [t for t in raw_tags if t]
        return tags, prose_str

    # 备选：换行切分
    if split_on_newlines and "\n" in raw:
        lines = raw.splitlines()
        if len(lines) > 1:
            first = lines[0].strip()
            rest = "\n".join(lines[1:]).strip()
            if first and rest:
                tags = [t.strip().rstrip(".,") for t in first.split(",") if t.strip()]
                return [t for t in tags if t], rest

    # 备选：句号切分
    if split_on_period and "." in raw:
        dot_idx = raw.find(".")
        before = raw[:dot_idx].strip()
        after = raw[dot_idx + 1:].strip()
        if after and len(after.split()) >= 3 and after[0].isupper():
            tags = [t.strip().rstrip(".,") for t in before.split(",") if t.strip()]
            return [t for t in tags if t], after

    raw_tags = [t.strip().rstrip(".,") for t in re.split(r"[,;\n]+", raw) if t.strip()]
    return [t for t in raw_tags if t], ""


# 测试用例 A: 逗号连接
user_comma = "tag1, tag2, artist name, Digital illustration of a male figure in a blue mask.\nHe wears a blue mask."
tc, pc = split_caption_text(user_comma)
print("Comma test - Tags:", tc)
assert tc == ["tag1", "tag2", "artist name"]
assert pc.startswith("Digital illustration")

# 测试用例 B: 句号连接
user_dot = "tag1, tag2, artist name. Digital illustration of a male figure in a blue mask.\nHe wears a blue mask."
td, pd = split_caption_text(user_dot)
print("Dot test - Tags:", td)
assert td == ["tag1", "tag2", "artist name"]
assert pd.startswith("Digital illustration")

# 测试用例 C: 换行连接
user_newline = "tag1, tag2, artist name\nDigital illustration of a male figure in a blue mask.\nHe wears a blue mask."
tn, pn = split_caption_text(user_newline)
print("Newline test - Tags:", tn)
assert tn == ["tag1", "tag2", "artist name"]
assert pn.startswith("Digital illustration")

print("\nALL 3 CONNECTION FORMATS WORKED FLAWLESSLY!")
