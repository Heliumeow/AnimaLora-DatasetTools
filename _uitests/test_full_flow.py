import os
import sys
import shutil
import tempfile
from pathlib import Path

tools_dir = Path(__file__).resolve().parents[1]
repo_root = Path(__file__).resolve().parents[3]
if str(tools_dir) not in sys.path:
    sys.path.insert(0, str(tools_dir))
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from dskit import bootstrap
from studio.services.tagging.caption_format import split_caption_text, combine_caption_text, find_prose_start
from studio.services.dataset import tagedit
from studio_data.dataset_tools.dskit.cleaner import SplitOptions, SanitizeOptions, sanitize_tags
from studio_data.dataset_tools.dskit.editops import EditOp, run_edit
from studio_data.dataset_tools.dskit.scope import ImageRef
from studio_data.dataset_tools.dskit.selector import ImageRow

# 1. 验证用户具体测试例
user_raw = (
    '@appa5ar7, realistic face, photorealistic rendering, year 2026, male focus, 1boy, weapon, '
    'balaclava, solo, mask, indoors, looking at viewer, knife, pectorals, no pants, black male underwear, '
    'large pectorals, english text, border, artist name, Digital illustration of a male figure in a blue '
    'mask and black leather outfit, squatting with legs apart. He wears a blue mask covering his head and '
    'upper face, a black leather long-sleeve shirt, and black leather pants. A black knife with the word '
    '"WELCOME" in white letters hangs from his right hip. The background features a blurred interior with '
    'arched windows and soft lighting. The image has watermarks in the top left corner. The artist\'s name '
    '"Arya" is in the top left corner, along with text in Japanese. The image has REC icons in the corner.'
)

debug_pos = find_prose_start(user_raw)
print(f"DEBUG - find_prose_start offset: {debug_pos}")
if debug_pos is not None:
    print(f"DEBUG - sub at offset: {user_raw[debug_pos:debug_pos+60]!r}")

tags, prose = split_caption_text(user_raw)
print(f"Test 1 - Tags count: {len(tags)}")
print(f"Test 1 - First tag: {tags[0]!r}, Last tag: {tags[-1]!r}")
print(f"Test 1 - Prose starts with: {prose[:45]!r}")

assert tags[0] == '@appa5ar7', f"First tag should be '@appa5ar7', got {tags[0]}"
assert tags[-1] == 'artist name', f"Last tag should be 'artist name', got {tags[-1]}"
assert prose.startswith('Digital illustration of a male figure in a blue mask'), "Prose start mismatch"
assert 'squatting with legs apart.' in prose, "Prose missing clause"

# 2. 验证多选切分方案
# Case A: 关闭方案 2 (宏观正则)，使用方案 1 (动名词/连词密度)
opts_scheme1 = SplitOptions(use_macro_patterns=False, use_syntax_density=True, word_count_threshold=5)
s_scheme1 = "photo, realistic, 1man, Digital photograph of a muscular man with tan skin, wearing a black backward cap, reclining on a green couch."
tags_s1, prose_s1 = split_caption_text(s_scheme1, use_macro_patterns=False, use_syntax_density=True, word_count_threshold=5)
assert tags_s1 == ["photo", "realistic", "1man"], f"Scheme 1 tags mismatch: {tags_s1}"
assert prose_s1.startswith("Digital photograph of a muscular man"), f"Scheme 1 prose mismatch: {prose_s1}"

# Case B: 关闭自然语言分离 (全部作为 tags)
tags_disabled, prose_disabled = split_caption_text(user_raw, enabled=False)
assert len(tags_disabled) > len(tags), "Disabled should have split everything by comma"
assert prose_disabled == "", "Disabled should have empty prose"

# 3. 验证保留 @ 和 # 的清洗功能
dirty_tags = ["\ufeff@appa5ar7", "#anime", "  solo  ", "‘digital artwork’", "realistic，face"]
clean_opts = SanitizeOptions(
    clean_bom_and_invisible=True,
    fullwidth_to_halfwidth=True,
    strip_quotes=True,
    strip_custom_chars="", # 留空不剥离
)
cleaned = sanitize_tags(dirty_tags, clean_opts)
print(f"Cleaned tags: {cleaned}")
assert cleaned[0] == "@appa5ar7", f"BOM removed but @ preserved: got {cleaned[0]}"
assert cleaned[1] == "#anime", f"# preserved: got {cleaned[1]}"
assert cleaned[2] == "solo"
assert cleaned[3] == "digital artwork", f"Quotes removed: got {cleaned[3]}"
assert cleaned[4] == "realistic,face", f"Fullwidth comma converted: got {cleaned[4]}"

# 4. 验证 tagedit 读写闭环（write_caption_parts & read_caption_parts）
tmp_dir = Path(tempfile.mkdtemp(prefix="animatest_"))
try:
    img_path = tmp_dir / "test01.png"
    img_path.write_bytes(b"dummy image data")
    txt_path = img_path.with_suffix(".txt")
    txt_path.write_text(user_raw, encoding="utf-8")

    # 读
    r_tags, r_prose = tagedit.read_caption_parts(img_path)
    assert r_tags[-1] == "artist name"
    assert r_prose.startswith("Digital illustration")

    # 改写 prose
    new_prose = r_prose + "\nEdited by user."
    tagedit.write_caption_parts(img_path, r_tags, new_prose)

    # 再读
    r2_tags, r2_prose = tagedit.read_caption_parts(img_path)
    print("r_tags count:", len(r_tags), "r2_tags count:", len(r2_tags))
    print("r_tags:", r_tags)
    print("r2_tags:", r2_tags)
    assert r2_tags == r_tags
    assert r2_prose == new_prose

    # 5. 验证 editops.run_edit 支持 set prose
    ref = ImageRef(root=tmp_dir, folder="", name="test01.png")
    row = ImageRow(ref=ref, tags=r2_tags, prose=r2_prose)
    op = EditOp(kind="set", tags=["@appa5ar7", "1boy", "solo"], prose="Single image updated prose.")
    res = run_edit([row], tmp_dir, op, apply=True, backup=True)
    assert res.applied is True
    assert res.affected == 1

    r3_tags, r3_prose = tagedit.read_caption_parts(img_path)
    assert r3_tags == ["@appa5ar7", "1boy", "solo"]
    assert r3_prose == "Single image updated prose."

    print("ALL END-TO-END TESTS PASSED SUCCESSFULLY!")
finally:
    shutil.rmtree(tmp_dir, ignore_errors=True)
