import re

# 测试样本 1：用户给出的完整真实用例
sample1 = (
    '@appa5ar7, realistic face, photorealistic rendering, year 2026, male focus, '
    '1boy, weapon, balaclava, solo, mask, indoors, looking at viewer, knife, '
    'english text, border, artist name, Digital illustration of a male figure in a blue mask '
    'and black leather outfit, squatting with legs apart. He wears a blue mask covering his head '
    'and upper face, a black leather long-sleeve shirt, and black leather pants. A black knife '
    'with the word "WELCOME" in white letters hangs from his right hip. The background features '
    'a blurred interior with arched windows and soft lighting. The image has watermarks in the '
    'top left corner. The artist\'s name "Arya" is in the top left corner, along with text in '
    'Japanese. The image has REC icons in the corner.'
)

# 测试样本 2：没有显式 Digital illustration 前缀，而是分词与句法从句
sample2 = (
    '@appa5ar7, 1boy, solo, weapon, mask, '
    'a male figure in a blue mask and black leather outfit, squatting with legs apart, '
    'wearing a blue mask covering his head'
)

# 方案 2：整句级宏观正则模板匹配（Macro Regex）
MACRO_PROSE_RE = re.compile(
    r'(?:^|,\s*|\.\s*|\n\s*)'
    r'('
    r'(?:(?:Digital\s+|A\s+|The\s+|An\s+)?(?:photograph|photo|artwork|illustration|painting|depiction|portrait|image|close-up|view|shot)|[A-Z][a-z]+)\s+of\b'
    r'.*)',
    re.IGNORECASE | re.DOTALL
)

# 方案 1：句法连接词与分词短语探测（Syntax & Participle Density）
CONNECTIVES = {
    'is', 'are', 'was', 'were', 'with', 'wearing', 'standing',
    'sitting', 'holding', 'squatting', 'reclining', 'background', 'foreground', 'scene',
    'depicts', 'depicting', 'features', 'featuring', 'surrounded',
    'against', 'dressed', 'view', 'look', 'looking', 'atmosphere',
    'and', 'on', 'in', 'at', 'by', 'of', 'a', 'an', 'the'
}

def detect_prose_by_syntax(text: str, word_threshold: int = 5):
    raw_pieces = [p.strip() for p in text.split(',') if p.strip()]
    for i, piece in enumerate(raw_pieces):
        words = piece.split()
        if len(words) >= word_threshold:
            # 检查分词与句法词密度
            lowered = [w.lower().strip('.,!?:;"\'') for w in words]
            ing_words = [w for w in lowered if w.endswith('ing')]
            conn_count = sum(1 for w in lowered if w in CONNECTIVES)
            # 如果有分词或者多个连接词，或包含标点
            if ing_words or conn_count >= 2 or any(c in piece for c in '.!:;'):
                # 命中自然语言
                target = piece
                m = re.search(r'(?:^|,\s*)' + re.escape(target), text)
                start_pos = m.start() if m else text.find(target)
                if text[start_pos] == ',':
                    start_pos += 1
                return raw_pieces[:i], text[start_pos:].strip()
    return raw_pieces, ''

# 验证样本 1 走方案 2
m = MACRO_PROSE_RE.search(sample1)
assert m is not None
prose1 = sample1[m.start(1):].strip()
tags1 = [t.strip() for t in sample1[:m.start(1)].strip().rstrip(',').split(',') if t.strip()]
assert tags1[-1] == 'artist name'
assert prose1.startswith('Digital illustration of')
print('Sample 1 with Method 2: OK')

# 验证样本 2 走方案 1
tags2, prose2 = detect_prose_by_syntax(sample2, word_threshold=5)
assert tags2 == ['@appa5ar7', '1boy', 'solo', 'weapon', 'mask'], f'Bad tags: {tags2}'
assert prose2.startswith('a male figure in a blue mask'), f'Bad prose: {prose2}'
print('Sample 2 with Method 1: OK')

print('ALL TESTS PASSED!')
