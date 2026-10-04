import React, { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import {
  ProseEditor,
  TagChipList,
  TagSuggestInput,
  TagTranslationToggle,
} from '../components'
import { splitTags } from '../utils/tags'
import type { ZenItem } from './types'

interface ZenCaptionEditorProps {
  item: ZenItem | null
  onSave: (tags: string[], prose: string) => Promise<void>
  isSaving: boolean
  tagInputRef: React.Ref<HTMLInputElement>
  width?: number
}

export const ZenCaptionEditor: React.FC<ZenCaptionEditorProps> = ({
  item,
  onSave,
  isSaving,
  tagInputRef,
  width = 380,
}) => {
  const [tags, setTags] = useState<string[]>([])
  const [prose, setProse] = useState<string>('')
  const [newTagInput, setNewTagInput] = useState('')
  const [isRawMode, setIsRawMode] = useState(false)
  const [rawTagsText, setRawTagsText] = useState('')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const lastItemRelRef = useRef<string | null>(null)

  // 添加单个或逗号分隔的 tag
  const handleAddTag = (specificTag?: string) => {
    const raw = (specificTag ?? newTagInput).trim()
    if (!raw) return
    const incoming = splitTags(raw)
    if (incoming.length === 0) return

    const next = [...tags]
    for (const t of incoming) {
      if (!next.includes(t)) {
        next.push(t)
      }
    }
    setTags(next)
    setRawTagsText(next.join(', '))
    setNewTagInput('')
    void onSave(next, prose)
  }

  // 当当前图片切换时，同步最新数据
  useEffect(() => {
    if (!item) {
      setTags([])
      setProse('')
      setRawTagsText('')
      return
    }
    setTags([...item.tags])
    setProse(item.prose || '')
    setRawTagsText(item.tags.join(', '))
    setNewTagInput('')
    lastItemRelRef.current = item.rel
  }, [item?.rel, item?.tags, item?.prose])

  // 检查是否有脏数据未保存
  const isDirty = () => {
    if (!item) return false
    const tagsChanged = JSON.stringify(tags) !== JSON.stringify(item.tags)
    const proseChanged = (item.prose || '') !== prose
    return tagsChanged || proseChanged
  }

  const triggerAutoSave = async () => {
    if (isDirty()) {
      await onSave(tags, prose)
    }
  }

  const handleRemoveTag = (index: number) => {
    const next = tags.filter((_, i) => i !== index)
    setTags(next)
    setRawTagsText(next.join(', '))
    void onSave(next, prose)
  }

  const handleRawTagsBlur = () => {
    const parsed = splitTags(rawTagsText)
    setTags(parsed)
    void onSave(parsed, prose)
  }

  // 快捷自动重新切分 Tags 与 Prose
  const handleAutoSplit = async () => {
    const fullText = [tags.join(', '), prose].filter(Boolean).join(', ')
    if (!fullText) return
    try {
      const res = await api.splitCaption(fullText)
      setTags(res.tags)
      setProse(res.prose)
      setRawTagsText(res.tags.join(', '))
      await onSave(res.tags, res.prose)
    } catch (err) {
      console.error('Auto split error in Zen mode:', err)
    }
  }

  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        title="展开 Caption 编辑器"
        style={{
          position: 'absolute',
          right: '12px',
          top: '56px',
          padding: '6px 12px',
          backgroundColor: '#27272a',
          color: '#e4e4e7',
          border: '1px solid #3f3f46',
          borderRadius: '8px',
          fontSize: '12px',
          cursor: 'pointer',
          zIndex: 6,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        }}
      >
        📝 展开标注面板
      </button>
    )
  }

  return (
    <div
      className="zen-scrollable"
      style={{
        width: `${width}px`,
        maxWidth: '55vw',
        height: '100%',
        backgroundColor: '#18181b',
        borderLeft: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '13px',
        color: '#f4f4f5',
        flexShrink: 0,
        zIndex: 6,
      }}
    >
      {/* 头部标题与控制按钮 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid #27272a',
          backgroundColor: '#202024',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <strong style={{ fontSize: '14px' }}>标注与描述</strong>
          {isSaving && <span style={{ color: '#60a5fa', fontSize: '11px' }}>正在写盘...</span>}
          {!isSaving && !isDirty() && (
            <span style={{ color: '#4ade80', fontSize: '11px' }}>✓ 已保存</span>
          )}
          {isDirty() && (
            <span style={{ color: '#facc15', fontSize: '11px' }}>• 未保存修改</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <TagTranslationToggle variant="zen" />
          <button
            onClick={() => setIsRawMode(!isRawMode)}
            style={{
              padding: '2px 8px',
              backgroundColor: '#27272a',
              border: '1px solid #3f3f46',
              color: '#a1a1aa',
              borderRadius: '4px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            {isRawMode ? 'Chips 视图' : '原始文本'}
          </button>
          <button
            onClick={() => setIsCollapsed(true)}
            style={{
              padding: '2px 8px',
              backgroundColor: 'transparent',
              border: 'none',
              color: '#71717a',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            ❯
          </button>
        </div>
      </div>

      {/* 内容滚动区 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* 1. Tags 编辑区域 */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <label style={{ fontWeight: 600, color: '#d4d4d8' }}>
              Tags 标签 ({tags.length})
            </label>
          </div>

          {isRawMode ? (
            <textarea
              value={rawTagsText}
              onChange={(e) => setRawTagsText(e.target.value)}
              onBlur={handleRawTagsBlur}
              placeholder="输入标签，用逗号分隔..."
              rows={6}
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#09090b',
                color: '#fafafa',
                border: '1px solid #3f3f46',
                borderRadius: '6px',
                fontSize: '12px',
                lineHeight: 1.5,
                resize: 'vertical',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          ) : (
            <div>
              <TagChipList
                tags={tags}
                onRemoveTag={handleRemoveTag}
                variant="zen"
              />
              <TagSuggestInput
                value={newTagInput}
                onChange={setNewTagInput}
                onAdd={handleAddTag}
                inputRef={tagInputRef}
                variant="zen"
              />
            </div>
          )}
        </div>

        {/* 2. Prose 自然语言双通道编辑区域 */}
        <ProseEditor
          prose={prose}
          onChangeProse={(newProse) => {
            setProse(newProse)
          }}
          tags={tags}
          onChangeTags={(nextTags) => {
            setTags(nextTags)
            setRawTagsText(nextTags.join(', '))
            void onSave(nextTags, prose)
          }}
          onAutoSplit={handleAutoSplit}
          onBlur={() => void triggerAutoSave()}
          variant="zen"
          autoSaveHint="失焦或切图时自动写盘"
        />
      </div>
    </div>
  )
}
