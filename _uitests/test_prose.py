import re

text = '1boy, muscular male, tan skin, Digital photograph of a muscular man with tan skin, wearing a black backward cap and a gray graphic t-shirt with a colorful design, reclining on a green couch'

STARTERS = [
    'A', 'An', 'The', 'Digital', 'Artwork', 'Photograph', 'Photo',
    'Illustration', 'Painting', 'Anime', 'Close-up', 'Depicting',
    'This image', 'In this', 'Scene of', 'Portrait of', 'Shot of', 'View of'
]

CONNECTIVES = {
    'is', 'are', 'was', 'were', 'with', 'wearing', 'standing',
    'sitting', 'holding', 'reclining', 'background', 'foreground', 'scene',
    'depicts', 'depicting', 'features', 'featuring', 'surrounded',
    'against', 'dressed', 'view', 'look', 'looking', 'atmosphere',
    'and', 'on', 'in', 'at', 'by', 'of', 'a', 'an', 'the'
}

def is_prose_piece(piece: str) -> bool:
    words = piece.split()
    if len(words) >= 5:
        return True
    if any(piece.lower().startswith(s.lower() + ' ') for s in STARTERS) and len(words) >= 2:
        return True
    lowered = [w.lower().strip(".,!?:;\"'") for w in words]
    conn_count = sum(1 for w in lowered if w in CONNECTIVES or w.endswith('ing'))
    if len(words) >= 4 and conn_count >= 2:
        return True
    return False

raw_pieces = [p.strip() for p in text.split(',') if p.strip()]
split_idx = None
for i, p in enumerate(raw_pieces):
    if is_prose_piece(p):
        split_idx = i
        break

print('split_idx:', split_idx)
if split_idx is not None:
    tags = raw_pieces[:split_idx]
    # 正确截取原串中的 prose，不能只用 find
    # 找到第 split_idx 个片段在原串中的位置
    target = raw_pieces[split_idx]
    # 使用正则在单词边界匹配该片段，避免前面同名词误匹配
    pattern = re.compile(re.escape(target))
    m = pattern.search(text)
    prose = text[m.start():] if m else ', '.join(raw_pieces[split_idx:])
    print('tags:', tags)
    print('prose:', prose)
