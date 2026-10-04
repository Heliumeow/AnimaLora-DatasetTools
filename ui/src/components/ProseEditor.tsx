import React from 'react'
import Button from '@repo/components/Button'
import { splitTags } from '../utils/tags'

export interface ProseEditorProps {
  prose: string
  onChangeProse: (prose: string) => void
  tags?: string[]
  onChangeTags?: (tags: string[]) => void
  onAutoSplit?: () => void | Promise<void>
  onBlur?: () => void
  variant?: 'default' | 'zen'
  rows?: number
  label?: string
  placeholder?: string
  autoSaveHint?: string
  extraActions?: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

/**
 * 自然语言描述（Prose / NL）双通道编辑器
 * 内置词数统计及 3 大核心快捷交互：
 * 1. ✂️ 末尾 Tag 转入自然语言
 * 2. ⬅️ 自然语言并入 Tags
 * 3. ⚡ 自动重新切分 (方案 1+2)
 */
export const ProseEditor: React.FC<ProseEditorProps> = ({
  prose,
  onChangeProse,
  tags,
  onChangeTags,
  onAutoSplit,
  onBlur,
  variant = 'default',
  rows = 3,
  label = '自然语言描述 (Prose / NL)',
  placeholder = '例如：Digital illustration of a male figure...（在此处编辑完整的自然语言，不会被误当成 Tag 切碎）',
  autoSaveHint,
  extraActions,
  className = '',
  style,
}) => {
  const isZen = variant === 'zen'

  const trimmed = prose.trim()
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0
  const charCount = prose.length
  const hasTags = tags && tags.length > 0

  const handleLastTagToProse = () => {
    if (!tags || tags.length === 0 || !onChangeTags) return
    const lastTag = tags[tags.length - 1]
    const nextTags = tags.slice(0, -1)
    const nextProse = trimmed ? `${lastTag}, ${trimmed}` : lastTag
    onChangeTags(nextTags)
    onChangeProse(nextProse)
  }

  const handleProseToTags = () => {
    if (!trimmed || !onChangeTags) return
    const added = splitTags(prose)
    onChangeTags([...(tags || []), ...added])
    onChangeProse('')
  }

  // --- Zen Mode 纯暗黑风格渲染 ---
  if (isZen) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          gap: '8px',
          ...style,
        }}
      >
        {/* 头部标题与统计 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <label style={{ fontWeight: 600, color: '#d4d4d8', fontSize: '13px' }}>
            {label}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#71717a', fontSize: '11px' }}>
              {trimmed ? `${wordCount} 词 · ${charCount} 字符` : '暂无自然语言'}
            </span>
            {autoSaveHint && (
              <span style={{ color: '#52525b', fontSize: '11px' }}>
                ({autoSaveHint})
              </span>
            )}
          </div>
        </div>

        {/* 快捷交互按钮条 */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {onChangeTags && (
            <>
              <button
                type="button"
                disabled={!hasTags}
                onClick={handleLastTagToProse}
                title="将 Tags 列表最后一个 Tag 移入自然语言描述开头"
                style={{
                  padding: '3px 8px',
                  backgroundColor: '#27272a',
                  border: '1px solid #3f3f46',
                  color: hasTags ? '#e4e4e7' : '#71717a',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: hasTags ? 'pointer' : 'not-allowed',
                  opacity: hasTags ? 1 : 0.6,
                }}
              >
                ✂️ 末尾 Tag 转入自然语言
              </button>
              <button
                type="button"
                disabled={!trimmed}
                onClick={handleProseToTags}
                title="把自然语言描述按逗号/句号全部拆回并追加到 Tags 列表中"
                style={{
                  padding: '3px 8px',
                  backgroundColor: '#27272a',
                  border: '1px solid #3f3f46',
                  color: trimmed ? '#e4e4e7' : '#71717a',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: trimmed ? 'pointer' : 'not-allowed',
                  opacity: trimmed ? 1 : 0.6,
                }}
              >
                ⬅️ 自然语言并入 Tags
              </button>
            </>
          )}

          {onAutoSplit && (
            <button
              type="button"
              onClick={() => void onAutoSplit()}
              title="根据当前规则自动重新切分 Tags 与 Prose"
              style={{
                padding: '3px 8px',
                backgroundColor: '#27272a',
                border: '1px solid #3f3f46',
                color: '#e4e4e7',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              ⚡ 自动重新切分 (方案 1+2)
            </button>
          )}

          {extraActions}
        </div>

        {/* 文本输入框 */}
        <textarea
          value={prose}
          onChange={(e) => onChangeProse(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          style={{
            flex: 1,
            minHeight: '140px',
            width: '100%',
            padding: '10px',
            backgroundColor: '#09090b',
            color: '#fafafa',
            border: '1px solid #3f3f46',
            borderRadius: '6px',
            fontSize: '12px',
            lineHeight: 1.6,
            resize: 'vertical',
            boxSizing: 'border-box',
            outline: 'none',
            fontFamily: 'monospace',
          }}
        />
      </div>
    )
  }

  // --- 主模式标准风格渲染 ---
  return (
    <div
      className={`space-y-1.5 p-2 rounded bg-sunken border border-subtle ${className}`}
      style={style}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-fg-secondary">{label}</span>
        <div className="flex items-center gap-1.5 text-2xs text-fg-tertiary">
          <span>
            {trimmed ? `${wordCount} 词 · ${charCount} 字符` : '暂无自然语言'}
          </span>
          {autoSaveHint && <span>({autoSaveHint})</span>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {onChangeTags && (
          <>
            <Button
              size="xs"
              variant="ghost"
              disabled={!hasTags}
              title="将 Tags 列表最后一个 Tag 移入自然语言描述开头"
              onClick={handleLastTagToProse}
            >
              ✂️ 末尾 Tag 转入自然语言
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={!trimmed}
              title="把自然语言描述按逗号/句号全部拆回并追加到 Tags 列表中"
              onClick={handleProseToTags}
            >
              ⬅️ 自然语言并入 Tags
            </Button>
          </>
        )}

        {onAutoSplit && (
          <Button
            size="xs"
            variant="ghost"
            title="根据当前规则自动重新切分 Tags 与 Prose"
            onClick={() => void onAutoSplit()}
          >
            ⚡ 自动重新切分 (方案 1+2)
          </Button>
        )}

        {extraActions}
      </div>

      <textarea
        value={prose}
        onChange={(e) => onChangeProse(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        rows={rows}
        className="w-full text-xs font-mono p-1.5 rounded border border-subtle bg-canvas text-fg resize-y focus:outline-none focus:border-primary"
      />
    </div>
  )
}
