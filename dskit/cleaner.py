"""Tag 清洗、格式规范化与自然语言 (Prose / NL) 分离器。

提供两大能力：
1. CaptionSplitter: 将混合标注中的「真实 Tag 列表」与「后半部分自然语言描述」
   精准分离，防止自然语言句子被当成 tag 切碎或污染；
2. Sanitizer: 支持多选、解耦的清洗与规范化（BOM/不可见字符清除、全半角转换、
   大小写转换、空格/下划线互转、自定义剥离字符等，默认不误伤 @ 和 #）。
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any

__all__ = [
    "SplitOptions",
    "SanitizeOptions",
    "split_caption_text",
    "combine_caption_text",
    "sanitize_single_tag",
    "sanitize_tags",
    "DEFAULT_STARTERS",
]

DEFAULT_STARTERS = [
    "A", "An", "The", "Digital", "Artwork", "Photograph",
    "Illustration", "Painting", "Anime", "Close-up",
    "Depicting", "This image", "In this", "Scene of", "Portrait of"
]

_PROSE_CONNECTIVES = {
    "is", "are", "was", "were", "with", "wearing", "standing",
    "sitting", "holding", "background", "foreground", "scene",
    "depicts", "depicting", "features", "featuring", "surrounded",
    "against", "dressed", "view", "look", "looking", "atmosphere",
    "reclining", "squatting", "walking", "running", "lying",
    "and", "which", "that", "there", "has", "have", "between",
}

# 宏观长句描述正则模式（方案 2）
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

# 不可见控制字符、零宽字符、BOM
INVISIBLE_CHARS = {
    "\ufeff", "\u200b", "\u200c", "\u200d", "\u200e", "\u200f",
    "\u00a0", "\u202f", "\u205f", "\x00", "\x01", "\x02"
}


@dataclass
class SplitOptions:
    """自然语言分离判定规则选项。各选项完全解耦，用户可自主多选。"""
    enabled: bool = True
    split_on_newlines: bool = True
    split_on_period: bool = True
    use_macro_patterns: bool = True
    use_syntax_density: bool = True
    use_sentence_starters: bool = True
    starters: list[str] = field(default_factory=lambda: list(DEFAULT_STARTERS))
    word_count_threshold: int = 5


@dataclass
class SanitizeOptions:
    """清洗与格式规范化选项。各选项完全解耦，用户可自主多选。"""
    # 1. 幽灵/不可见控制字符清洗（解决 BOM 和零宽字符导致的匹配与编码失常）
    clean_bom_and_invisible: bool = True
    # 2. 空白整理
    strip_whitespace: bool = True
    remove_empty: bool = True
    # 3. 标点全半角化
    fullwidth_to_halfwidth: bool = False
    # 4. 引号剥离
    strip_quotes: bool = False
    # 5. 自定义剥离特殊字符（留空则不移除任何常规符号，安全保留 @ 和 #）
    strip_custom_chars: str = ""
    # 6. 命名风格与格式
    case_mode: str = "keep"               # keep | lowercase | uppercase
    spacing_mode: str = "keep"            # keep | underscore_to_space | space_to_underscore
    unescape_brackets: bool = False       # \(tag\) -> (tag)
    escape_brackets: bool = False         # (tag) -> \(tag\)


def find_prose_start(
    raw: str,
    opts: SplitOptions | None = None,
) -> int | None:
    """在原始文本中寻找自然语言的字符起始偏移量。找不到返回 None。"""
    opts = opts or SplitOptions()
    if not raw.strip():
        return None

    candidates: list[tuple[int, str]] = []
    # 拆分所有候选边界位置（行首、换行后、逗号/分号后、或句号+空格后）
    for m in re.finditer(r"(?:^|[\n,;]\s*|\.\s+)", raw):
        idx = m.end()
        sub = raw[idx:].strip()
        if sub:
            candidates.append((idx, sub))

    # 1. 方案 2：宏观整句正则优先匹配
    if opts.use_macro_patterns:
        for idx, sub in candidates:
            if MACRO_PROSE_PATTERN.match(sub):
                return idx

    # 2. 方案 1：语法连词/动名词短语/词数密度与引导词检测
    if opts.use_syntax_density or opts.use_sentence_starters:
        starters_list = opts.starters if (opts.use_sentence_starters and opts.starters) else []
        starters_pattern = (
            re.compile(r"^(?:" + "|".join(re.escape(s) for s in starters_list) + r")\b", re.IGNORECASE)
            if (opts.use_sentence_starters and starters_list) else None
        )

        for idx, sub in candidates:
            # 取到下一个标点前的第一个子句
            first_clause = re.split(r"[,;\n]|\.\s+", sub, maxsplit=1)[0].strip()
            words = first_clause.split()
            word_count = len(words)

            if starters_pattern and starters_pattern.match(first_clause):
                if word_count >= 3 or any(c in first_clause for c in ".!:?"):
                    return idx

            if opts.use_syntax_density and word_count >= opts.word_count_threshold:
                lowered_words = {w.lower().strip(".,!?:;\"'") for w in words}
                has_connective = bool(lowered_words & _PROSE_CONNECTIVES)
                has_punct = any(c in first_clause for c in ".!:?")
                has_ing = any(w.endswith("ing") and len(w) > 4 for w in lowered_words)
                if has_connective or has_punct or has_ing:
                    return idx

    return None


def split_caption_text(
    text: str,
    opts: SplitOptions | None = None,
) -> tuple[list[str], str]:
    """把一段 caption 拆分成 (tags: list[str], prose: str)。

    支持方案 1 (句法密度) 与方案 2 (宏观长句模式)，完美保留自然语言原始格式。
    """
    opts = opts or SplitOptions()
    raw = text.strip() if text else ""
    if not raw:
        return [], ""

    if not opts.enabled:
        tags = [t.strip().rstrip(".,") for t in raw.split(",") if t.strip()]
        return [t for t in tags if t], ""

    pos = find_prose_start(raw, opts)
    if pos is not None:
        tag_str = raw[:pos].strip()
        prose_str = raw[pos:].strip()
        raw_tags = [t.strip().rstrip(".,") for t in re.split(r"[,;\n]+", tag_str) if t.strip()]
        tags = [t for t in raw_tags if t]
        return tags, prose_str

    # 备选：换行切分
    if opts.split_on_newlines and "\n" in raw:
        lines = raw.splitlines()
        if len(lines) > 1:
            first = lines[0].strip()
            rest = "\n".join(lines[1:]).strip()
            if first and rest:
                tags = [t.strip().rstrip(".,") for t in first.split(",") if t.strip()]
                return [t for t in tags if t], rest

    # 备选：句号切分
    if opts.split_on_period and "." in raw:
        dot_idx = raw.find(".")
        before = raw[:dot_idx].strip()
        after = raw[dot_idx + 1:].strip()
        if after and len(after.split()) >= 3 and after[0].isupper():
            tags = [t.strip().rstrip(".,") for t in before.split(",") if t.strip()]
            return [t for t in tags if t], after

    raw_tags = [t.strip().rstrip(".,") for t in re.split(r"[,;\n]+", raw) if t.strip()]
    return [t for t in raw_tags if t], ""


def combine_caption_text(tags: list[str], prose: str = "") -> str:
    """将 tags 列表与自然语言 prose 重新拼合为标准 caption 文本。"""
    tag_part = ", ".join(t.strip() for t in tags if t.strip())
    prose_clean = prose.strip()
    if not prose_clean:
        return tag_part
    if not tag_part:
        return prose_clean
    # 如果 prose 本身不以句号/换行开头，且 tag_part 不以句号结尾，加句号衔接
    if prose_clean.startswith((".", "!", "?", "\n")):
        return f"{tag_part}{prose_clean}"
    return f"{tag_part}. {prose_clean}"


def sanitize_single_tag(tag: str, opts: SanitizeOptions) -> str:
    """对单个 tag 执行根据选项配置的清洗与规范化。"""
    s = str(tag or "")

    # 1. 清理 BOM 与不可见控制字符
    if opts.clean_bom_and_invisible:
        for ch in INVISIBLE_CHARS:
            if ch in s:
                s = s.replace(ch, " " if ch in ("\u00a0", "\u3000") else "")

    # 2. 全角转半角
    if opts.fullwidth_to_halfwidth:
        s = unicodedata.normalize("NFKC", s)
        # 针对常见标点特化
        s = (s.replace("，", ",")
              .replace("（", "(")
              .replace("）", ")")
              .replace("：", ":")
              .replace("！", "!")
              .replace("？", "?"))

    # 3. 剥离外层引号（直引号与弯引号）
    if opts.strip_quotes:
        s = s.strip("'\"`\u2018\u2019\u201c\u201d")

    # 4. 剥离自定义指定特殊字符（若未指定则保留 @、# 等）
    if opts.strip_custom_chars:
        for ch in set(opts.strip_custom_chars):
            s = s.replace(ch, "")

    # 5. 空格与下划线风格转换
    if opts.spacing_mode == "underscore_to_space":
        s = s.replace("_", " ")
    elif opts.spacing_mode == "space_to_underscore":
        s = "_".join(s.split())

    # 6. 大小写模式
    if opts.case_mode == "lowercase":
        s = s.lower()
    elif opts.case_mode == "uppercase":
        s = s.upper()

    # 7. 括号转义与反转义
    if opts.unescape_brackets:
        s = s.replace(r"\(", "(").replace(r"\)", ")")
    elif opts.escape_brackets:
        s = s.replace(r"\(", "(").replace(r"\)", ")")
        s = s.replace("(", r"\(").replace(")", r"\)")

    # 8. 首尾空白与连续内部空格压缩
    if opts.strip_whitespace:
        s = " ".join(s.split())

    return s


def sanitize_tags(tags: list[str], opts: SanitizeOptions) -> list[str]:
    """批量清洗 tag 列表，支持去重（保持顺序）与清除空项。"""
    out: list[str] = []
    seen: set[str] = set()
    for t in tags:
        cleaned = sanitize_single_tag(t, opts)
        if opts.remove_empty and not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
    return out

