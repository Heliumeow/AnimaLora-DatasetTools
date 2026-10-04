import React from 'react'
import { TranslatedTag } from '@repo/components/tagDisplay/TranslatedTag'

export interface TagChipListProps {
  tags: string[]
  onRemoveTag?: (index: number) => void
  variant?: 'default' | 'zen'
  emptyText?: string
  maxHeight?: string | number
  className?: string
  style?: React.CSSProperties
}

/**
 * 标签 Chips 列表展示组件，支持中文词典翻译附着与删除按钮
 */
export const TagChipList: React.FC<TagChipListProps> = ({
  tags,
  onRemoveTag,
  variant = 'default',
  emptyText = '无 Tag，可在此直接添加',
  maxHeight = '220px',
  className = '',
  style,
}) => {
  const isZen = variant === 'zen'

  if (isZen) {
    return (
      <div
        className={`zen-scrollable ${className}`}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          marginBottom: '10px',
          maxHeight,
          overflowY: 'auto',
          padding: '4px',
          backgroundColor: '#121214',
          borderRadius: '6px',
          border: '1px solid #27272a',
          ...style,
        }}
      >
        {tags.length === 0 && (
          <span style={{ color: '#71717a', fontSize: '12px', padding: '4px' }}>
            {emptyText}
          </span>
        )}
        {tags.map((t, idx) => (
          <span
            key={`${t}-${idx}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              backgroundColor: '#27272a',
              color: '#e4e4e7',
              borderRadius: '4px',
              fontSize: '12px',
            }}
          >
            <TranslatedTag tag={t} />
            {onRemoveTag && (
              <button
                type="button"
                onClick={() => onRemoveTag(idx)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#a1a1aa',
                  cursor: 'pointer',
                  padding: '0 2px',
                  fontSize: '12px',
                  lineHeight: 1,
                }}
                title={`删除 ${t}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
    )
  }

  return (
    <div
      className={`flex flex-wrap gap-1.5 p-1.5 rounded bg-sunken border border-subtle overflow-y-auto ${className}`}
      style={{ maxHeight, ...style }}
    >
      {tags.length === 0 && (
        <span className="text-xs text-fg-tertiary p-1">{emptyText}</span>
      )}
      {tags.map((t, idx) => (
        <span
          key={`${t}-${idx}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-overlay border border-subtle text-xs font-mono text-fg-primary"
        >
          <TranslatedTag tag={t} />
          {onRemoveTag && (
            <button
              type="button"
              onClick={() => onRemoveTag(idx)}
              className="bg-transparent border-none text-fg-tertiary hover:text-err cursor-pointer p-0 text-xs leading-none"
              title={`删除 ${t}`}
            >
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  )
}
