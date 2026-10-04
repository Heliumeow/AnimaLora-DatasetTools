/**
 * 标签文本处理与切分工具函数
 */

/**
 * 将逗号、全角逗号、换行符分隔的文本切分为干净的 Tag 数组
 */
export function splitTags(text: string): string[] {
  return text
    .split(/[,，\n]/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * 标签数组去重（保持原有相对顺序）
 */
export function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const t of tags) {
    const trimmed = t.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      result.push(trimmed)
    }
  }
  return result
}
