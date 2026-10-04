import React, { useEffect, useState } from 'react'
import { api } from '../api'
import type { ZenItem } from './types'

interface ZenImageViewerProps {
  root: string
  rejectDir: string
  item: ZenItem | null
  onDimensionsLoaded: (w: number, h: number) => void
  onPrev: () => void
  onNext: () => void
}

export const ZenImageViewer: React.FC<ZenImageViewerProps> = ({
  root,
  rejectDir,
  item,
  onDimensionsLoaded,
  onPrev,
  onNext,
}) => {
  const [loaded, setLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

  const imageUrl = item ? api.rawImageUrl(root, item.rel, rejectDir) : ''

  useEffect(() => {
    setLoaded(false)
    setHasError(false)
  }, [imageUrl])

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#0f0f11',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* 左右侧翻页热区 / 浮动箭头按钮 */}
      <button
        onClick={onPrev}
        title="上一张 (← / ↑)"
        style={{
          position: 'absolute',
          left: '16px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          backgroundColor: 'rgba(30, 30, 35, 0.65)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '20px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          transition: 'all 0.2s',
          zIndex: 5,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(50, 50, 60, 0.9)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(30, 30, 35, 0.65)'
        }}
      >
        ❮
      </button>

      <button
        onClick={onNext}
        title="下一张 (→ / ↓)"
        style={{
          position: 'absolute',
          right: '16px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '44px',
          height: '44px',
          borderRadius: '50%',
          backgroundColor: 'rgba(30, 30, 35, 0.65)',
          color: '#ffffff',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          fontSize: '20px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          transition: 'all 0.2s',
          zIndex: 5,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(50, 50, 60, 0.9)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(30, 30, 35, 0.65)'
        }}
      >
        ❯
      </button>

      {/* 图片核心渲染区 */}
      {item && (
        <img
          key={imageUrl}
          src={imageUrl}
          alt={item.name}
          onLoad={(e) => {
            const img = e.currentTarget
            setLoaded(true)
            onDimensionsLoaded(img.naturalWidth, img.naturalHeight)
          }}
          onError={() => {
            setHasError(true)
            setLoaded(true)
          }}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
            opacity: loaded ? 1 : 0.2,
            transition: 'opacity 0.15s ease-in',
          }}
        />
      )}

      {hasError && (
        <div style={{ color: '#ef4444', fontSize: '14px', zIndex: 2 }}>
          图片加载失败或文件已被移走
        </div>
      )}

      {/* 底部快捷键指南胶囊 */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '4px 14px',
          borderRadius: '9999px',
          backgroundColor: 'rgba(20, 20, 24, 0.75)',
          color: '#a1a1aa',
          fontSize: '11px',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          pointerEvents: 'none',
          zIndex: 4,
        }}
      >
        <span>
          <kbd style={kbdStyle}>←</kbd> / <kbd style={kbdStyle}>→</kbd> 翻页
        </span>
        <span>•</span>
        <span>
          <kbd style={kbdStyle}>Space</kbd> / <kbd style={kbdStyle}>X</kbd> 淘汰/保留
        </span>
        <span>•</span>
        <span>
          <kbd style={kbdStyle}>Tab</kbd> 编辑描述
        </span>
        <span>•</span>
        <span>
          <kbd style={kbdStyle}>Esc</kbd> 退出
        </span>
      </div>
    </div>
  )
}

const kbdStyle: React.CSSProperties = {
  backgroundColor: '#27272a',
  padding: '1px 5px',
  borderRadius: '3px',
  color: '#e4e4e7',
  border: '1px solid #3f3f46',
  fontSize: '10px',
  fontFamily: 'monospace',
}
