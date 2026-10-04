import React, { useRef } from 'react'
import { TagSuggestList } from '@repo/components/tagSuggest/TagSuggestList'
import { useTagSuggest } from '@repo/components/tagSuggest/useTagSuggest'

export interface TagSuggestInputProps {
  value: string
  onChange: (val: string) => void
  onAdd: (tag?: string) => void
  inputRef?: React.Ref<HTMLInputElement>
  placeholder?: string
  variant?: 'default' | 'zen'
  buttonText?: string
  className?: string
}

/**
 * 集成了智能标签补全、中英文候选及键盘操作的快速输入框
 */
export const TagSuggestInput: React.FC<TagSuggestInputProps> = ({
  value,
  onChange,
  onAdd,
  inputRef,
  placeholder = '按 Tab 切入，回车添加 tag (支持中文搜英文)...',
  variant = 'default',
  buttonText = '添加',
  className = '',
}) => {
  const internalInputRef = useRef<HTMLInputElement | null>(null)

  const setCombinedRef = (el: HTMLInputElement | null) => {
    internalInputRef.current = el
    if (typeof inputRef === 'function') {
      inputRef(el)
    } else if (inputRef && 'current' in inputRef) {
      (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
    }
  }

  const draftSuggest = useTagSuggest({
    value,
    inputRef: internalInputRef,
    wholeAsToken: true,
    onPick: ({ suggestion }) => {
      onAdd(suggestion.tag)
    },
  })

  const isZen = variant === 'zen'

  return (
    <div
      className={`flex items-center gap-1.5 relative ${className}`}
      style={{ display: 'flex', gap: '6px', position: 'relative' }}
    >
      <div style={{ flex: 1, position: 'relative' }} className="flex-1 relative">
        <input
          ref={setCombinedRef}
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            draftSuggest.notifyChange()
          }}
          onKeyDown={(e) => {
            if (draftSuggest.handleKeyDown(e)) return
            if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
              e.preventDefault()
              onAdd()
            }
          }}
          onClick={() => draftSuggest.notifyClick()}
          onFocus={() => draftSuggest.notifyFocus()}
          onBlur={() => draftSuggest.notifyBlur()}
          placeholder={placeholder}
          style={
            isZen
              ? {
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '6px 10px',
                  backgroundColor: '#09090b',
                  color: '#fafafa',
                  border: '1px solid #3f3f46',
                  borderRadius: '6px',
                  fontSize: '12px',
                  outline: 'none',
                }
              : undefined
          }
          className={
            isZen
              ? ''
              : 'w-full box-border px-2.5 py-1.5 rounded border border-subtle bg-canvas text-fg text-xs focus:outline-none focus:border-primary font-mono'
          }
        />
        <TagSuggestList
          open={draftSuggest.open}
          suggestions={draftSuggest.suggestions}
          activeIdx={draftSuggest.activeIdx}
          onPick={(s) => draftSuggest.pickAt(draftSuggest.suggestions.indexOf(s))}
          onHover={draftSuggest.setActiveIdx}
          inputRef={internalInputRef}
          cursor={draftSuggest.cursor}
        />
      </div>

      <button
        type="button"
        onClick={() => onAdd()}
        style={
          isZen
            ? {
                padding: '6px 12px',
                backgroundColor: '#3b82f6',
                border: 'none',
                borderRadius: '6px',
                color: '#ffffff',
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: '12px',
                flexShrink: 0,
              }
            : undefined
        }
        className={
          isZen
            ? ''
            : 'px-3 py-1.5 rounded bg-primary text-primary-fg text-xs font-medium cursor-pointer shrink-0 hover:brightness-110 active:brightness-95 transition-all'
        }
      >
        {buttonText}
      </button>
    </div>
  )
}
