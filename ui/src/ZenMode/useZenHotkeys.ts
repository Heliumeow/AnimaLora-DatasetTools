import { useEffect, useRef } from 'react'

interface HotkeyOptions {
  enabled: boolean
  onNext: () => void
  onPrev: () => void
  onToggleReject: () => void
  onFocusEditor: () => void
  onClose: () => void
  editorRef?: React.RefObject<HTMLElement | null>
}

export function useZenHotkeys({
  enabled,
  onNext,
  onPrev,
  onToggleReject,
  onFocusEditor,
  onClose,
}: HotkeyOptions) {
  const wheelLockRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const isInputFocused = () => {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const inInput = isInputFocused()

      if (inInput) {
        // 编辑模式下：Tab 或 Esc 退出编辑模式回到浏览态
        if (e.key === 'Tab') {
          e.preventDefault()
          ;(document.activeElement as HTMLElement)?.blur()
        } else if (e.key === 'Escape') {
          ;(document.activeElement as HTMLElement)?.blur()
        }
        return
      }

      // 浏览模式下的键盘流
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        onNext()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        onPrev()
      } else if (e.key === ' ' || e.code === 'Space' || e.key === 'x' || e.key === 'X') {
        e.preventDefault()
        onToggleReject()
      } else if (e.key === 'Tab') {
        e.preventDefault()
        onFocusEditor()
      } else if (e.key === 'Escape' || e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        onClose()
      }
    }

    const handleWheel = (e: WheelEvent) => {
      if (isInputFocused()) return
      // 如果目标在具有独立滚动的面板内部，不劫持
      const target = e.target as HTMLElement | null
      if (target?.closest('.zen-scrollable')) return

      if (wheelLockRef.current) return
      wheelLockRef.current = true
      setTimeout(() => {
        wheelLockRef.current = false
      }, 160)

      if (e.deltaY > 10) {
        onNext()
      } else if (e.deltaY < -10) {
        onPrev()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('wheel', handleWheel)
    }
  }, [enabled, onNext, onPrev, onToggleReject, onFocusEditor, onClose])
}
