import React, { useMemo } from 'react'
import { analyzeDimensions } from '../utils/dimensions'
import type { ZenFilterMode, ZenItem } from './types'

export { analyzeDimensions } from '../utils/dimensions'
export type { AspectRatioInfo } from '../utils/dimensions'

interface ZenTopBarProps {
  item: ZenItem | null
  currentIndex: number
  totalInFilter: number
  totalGlobal: number
  filterMode: ZenFilterMode
  onFilterModeChange: (mode: ZenFilterMode) => void
  onToggleReject: () => void
  onCleanEmpty: () => void
  onClose: () => void
  rejectDir: string
  onEditRejectDir: () => void
  loadingReject?: boolean
  isFolderTreeOpen?: boolean
  onToggleFolderTree?: () => void
}

export const ZenTopBar: React.FC<ZenTopBarProps> = ({
  item,
  currentIndex,
  totalInFilter,
  totalGlobal,
  filterMode,
  onFilterModeChange,
  onToggleReject,
  onCleanEmpty,
  onClose,
  rejectDir,
  onEditRejectDir,
  loadingReject = false,
  isFolderTreeOpen = false,
  onToggleFolderTree,
}) => {
  const isReject = item?.status === 'reject'

  const dimInfo = useMemo(() => {
    if (!item?.naturalWidth || !item?.naturalHeight) return null
    return analyzeDimensions(item.naturalWidth, item.naturalHeight, 1024)
  }, [item?.naturalWidth, item?.naturalHeight])

  const nextFilter = () => {
    const cycle: ZenFilterMode[] = ['all', 'accept', 'reject']
    const nextIdx = (cycle.indexOf(filterMode) + 1) % cycle.length
    onFilterModeChange(cycle[nextIdx])
  }

  const filterLabel = {
    all: '👁 视图: 全部',
    accept: '✔ 视图: 仅保留',
    reject: '✘ 视图: 仅淘汰',
  }[filterMode]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        backgroundColor: '#1f1f23',
        borderBottom: '1px solid #333338',
        color: '#f4f4f5',
        fontSize: '13px',
        userSelect: 'none',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* 左侧：目录树切换、状态徽章与数量 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {onToggleFolderTree && (
          <button
            onClick={onToggleFolderTree}
            title={isFolderTreeOpen ? '收起目录树' : '展开目录树'}
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              backgroundColor: isFolderTreeOpen ? '#2563eb' : '#27272a',
              border: `1px solid ${isFolderTreeOpen ? '#3b82f6' : '#3f3f46'}`,
              color: '#ffffff',
              fontSize: '12px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <span>📁</span>
            <span>目录</span>
          </button>
        )}

        <button
          onClick={onToggleReject}
          disabled={!item || loadingReject}
          title="按空格键(Space)或 X 键原位切换"
          style={{
            padding: '4px 12px',
            borderRadius: '9999px',
            border: 'none',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '12px',
            backgroundColor: isReject ? '#dc2626' : '#16a34a',
            color: '#ffffff',
            boxShadow: isReject ? '0 0 10px rgba(220, 38, 38, 0.4)' : '0 0 10px rgba(22, 163, 74, 0.3)',
            transition: 'all 0.15s ease',
          }}
        >
          {loadingReject ? '处理中...' : isReject ? '● 淘汰目录 [REJECTED]' : '● 训练集 [SOURCE]'}
          <span style={{ opacity: 0.8, marginLeft: '6px', fontSize: '11px', fontWeight: 400 }}>
            (Space / X)
          </span>
        </button>

        <span style={{ color: '#a1a1aa', fontWeight: 500 }}>
          <strong style={{ color: '#fafafa' }}>#{currentIndex + 1}</strong> / {totalInFilter}
          {totalInFilter !== totalGlobal && (
            <span style={{ fontSize: '11px', opacity: 0.7, marginLeft: '4px' }}>
              (全局 {totalGlobal})
            </span>
          )}
        </span>

        {/* 相对路径 */}
        {item && (
          <span
            style={{
              color: '#71717a',
              maxWidth: '300px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={item.rel}
          >
            {item.rel}
          </span>
        )}
      </div>

      {/* 中间：尺寸与分桶胶囊 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {dimInfo && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              borderRadius: '6px',
              backgroundColor: dimInfo.isLowRes ? '#451a1a' : '#27272a',
              border: `1px solid ${dimInfo.isLowRes ? '#991b1b' : '#3f3f46'}`,
              color: dimInfo.isLowRes ? '#f87171' : '#e4e4e7',
              fontSize: '12px',
            }}
          >
            {dimInfo.isLowRes && <span title="短边低于 1024px">⚠</span>}
            <span>
              {item?.naturalWidth} × {item?.naturalHeight} px
            </span>
            <span
              style={{
                padding: '1px 5px',
                borderRadius: '4px',
                backgroundColor: dimInfo.isExtreme ? '#854d0e' : '#3f3f46',
                color: dimInfo.isExtreme ? '#fef08a' : '#d4d4d8',
                fontSize: '11px',
              }}
            >
              {dimInfo.desc}
            </span>
          </div>
        )}
      </div>

      {/* 右侧：过滤视图、淘汰路径、清理与退出 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          onClick={nextFilter}
          title="点击切换过滤模式"
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            color: '#f4f4f5',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {filterLabel}
        </button>

        <button
          onClick={onEditRejectDir}
          title={`当前淘汰目标: ${rejectDir}`}
          style={{
            padding: '4px 8px',
            borderRadius: '6px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            color: '#a1a1aa',
            fontSize: '11px',
            cursor: 'pointer',
            maxWidth: '180px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          📁 {rejectDir.split(/[\\/]/).pop() || '淘汰目录'}
        </button>

        <button
          onClick={onCleanEmpty}
          title="递归清理源目录与淘汰目录下的空文件夹"
          style={{
            padding: '4px 8px',
            borderRadius: '6px',
            backgroundColor: '#27272a',
            border: '1px solid #3f3f46',
            color: '#a1a1aa',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          🧹 清空目录
        </button>

        <button
          onClick={onClose}
          title="退出禅模式 (Esc / Z)"
          style={{
            padding: '4px 10px',
            borderRadius: '6px',
            backgroundColor: '#3f3f46',
            border: 'none',
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          ✕ 退出
        </button>
      </div>
    </div>
  )
}
