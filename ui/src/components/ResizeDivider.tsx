import React, { useRef, useState } from 'react'

export interface ResizeDividerProps {
  /** 'vertical' 表示垂直分割线（左右窗格间），用户水平拖拽；'horizontal' 表示水平分割线（上下窗格间），用户垂直拖拽 */
  direction?: 'horizontal' | 'vertical'
  /** 视觉主题风格：'default' 适合主界面（跟随主题变量）；'zen' 适合禅模式纯暗黑风格 */
  variant?: 'default' | 'zen'
  /** 拖拽位移回调（像素单位） */
  onDelta: (delta: number) => void
  /** 双击分割线重置为默认大小 */
  onReset?: () => void
  className?: string
  style?: React.CSSProperties
  title?: string
}

export const ResizeDivider: React.FC<ResizeDividerProps> = ({
  direction = 'vertical',
  variant = 'default',
  onDelta,
  onReset,
  className = '',
  style,
  title = '拖动调整窗格空间，双击恢复默认',
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const startPosRef = useRef(0)

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
    setIsDragging(true)
    startPosRef.current = direction === 'vertical' ? e.clientX : e.clientY
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return
    const currentPos = direction === 'vertical' ? e.clientX : e.clientY
    const delta = currentPos - startPosRef.current
    if (delta !== 0) {
      onDelta(delta)
      startPosRef.current = currentPos
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
      setIsDragging(false)
    }
  }

  const isVert = direction === 'vertical'
  const isZen = variant === 'zen'

  return (
    <div
      role="separator"
      tabIndex={0}
      title={title}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onReset}
      className={`group relative flex items-center justify-center select-none ${
        isVert
          ? 'w-2.5 -mx-1 shrink-0 h-full cursor-col-resize'
          : 'h-2.5 -my-1 shrink-0 w-full cursor-row-resize'
      } ${isDragging ? 'z-50' : 'z-20'} ${className}`}
      style={{
        cursor: isVert ? 'col-resize' : 'row-resize',
        touchAction: 'none',
        ...style,
      }}
    >
      <div
        className={`rounded-full transition-all duration-150 ${
          isVert
            ? 'w-[2px] h-full group-hover:w-[4px]'
            : 'h-[2px] w-full group-hover:h-[4px]'
        }`}
        style={{
          backgroundColor: isDragging
            ? isZen
              ? '#3b82f6'
              : 'var(--color-primary, #6366f1)'
            : isZen
            ? '#27272a'
            : 'var(--border-subtle, #3f3f46)',
          boxShadow: isDragging
            ? isZen
              ? '0 0 8px rgba(59, 130, 246, 0.6)'
              : '0 0 8px rgba(99, 102, 241, 0.5)'
            : undefined,
        }}
      />
    </div>
  )
}
