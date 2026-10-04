import React from 'react'
import { useShowTagTranslation } from '@repo/tagDict/prefs'

export interface TagTranslationToggleProps {
  /** 'default' 适合主界面（跟随主题变量）；'zen' 适合禅模式纯暗黑风格 */
  variant?: 'default' | 'zen'
  className?: string
  style?: React.CSSProperties
}

/**
 * 标签中文/英文翻译快速切换胶囊按钮
 */
export const TagTranslationToggle: React.FC<TagTranslationToggleProps> = ({
  variant = 'default',
  className = '',
  style,
}) => {
  const [showTranslation, setShowTranslation] = useShowTagTranslation()

  if (variant === 'zen') {
    return (
      <button
        type="button"
        onClick={() => void setShowTranslation(!showTranslation)}
        title={showTranslation ? '已开启中文翻译，点击关闭' : '已关闭中文翻译，点击开启'}
        className={className}
        style={{
          padding: '2px 8px',
          backgroundColor: showTranslation ? '#1e3a8a' : '#27272a',
          border: `1px solid ${showTranslation ? '#3b82f6' : '#3f3f46'}`,
          color: showTranslation ? '#93c5fd' : '#a1a1aa',
          borderRadius: '4px',
          fontSize: '11px',
          cursor: 'pointer',
          fontWeight: showTranslation ? 600 : 400,
          userSelect: 'none',
          ...style,
        }}
      >
        {showTranslation ? '文/A 译' : 'A 英文'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => void setShowTranslation(!showTranslation)}
      title={showTranslation ? '已开启中文翻译，点击关闭' : '已关闭中文翻译，点击开启'}
      className={`px-2 py-0.5 rounded text-2xs font-medium border transition-colors select-none cursor-pointer ${
        showTranslation
          ? 'bg-primary/15 text-primary border-primary/30 font-semibold'
          : 'bg-sunken text-fg-tertiary border-subtle hover:text-fg-secondary hover:border-fg-tertiary'
      } ${className}`}
      style={style}
    >
      {showTranslation ? '文/A 译' : 'A 英文'}
    </button>
  )
}
