import React from 'react'
import Card from '@repo/components/Card'
import ImageGrid, { type ImageGridItem } from '@repo/components/ImageGrid'
import { ResizeDivider } from '../../components'
import type { ZenFilterMode } from '../../ZenMode'
import type { LogLine } from '../types'
import { LogConsole } from './LogConsole'

export interface MainGridPanelProps {
  loading: boolean
  totalRows: number
  filterMode: ZenFilterMode
  onSetFilterMode: (mode: ZenFilterMode) => void
  totalCount: number
  acceptCount: number
  rejectCount: number
  items: ImageGridItem[]
  selected: Set<string>
  active: string | null
  onSelect: (name: string, e: React.MouseEvent) => void
  onActivate: (name: string) => void
  onPreview: (name: string) => void

  log: LogLine[]
  logHeight: number
  onDeltaLogHeight: (delta: number) => void
  onResetLogHeight: () => void
}

export const MainGridPanel: React.FC<MainGridPanelProps> = ({
  loading,
  totalRows,
  filterMode,
  onSetFilterMode,
  totalCount,
  acceptCount,
  rejectCount,
  items,
  selected,
  active,
  onSelect,
  onActivate,
  onPreview,
  log,
  logHeight,
  onDeltaLogHeight,
  onResetLogHeight,
}) => {
  return (
    <Card
      as="section"
      radius="compact"
      className="flex-1 min-w-[240px] min-h-0 flex flex-col overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-subtle flex items-center justify-between gap-3 shrink-0 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="type-panel-title m-0">
            {loading ? '载入中…' : `${totalRows} 张`}
          </h2>

          {/* 三态视图切换：与禅模式共用状态 */}
          <div className="inline-flex rounded-md p-0.5 bg-sunken border border-subtle text-xs">
            <button
              type="button"
              onClick={() => onSetFilterMode('all')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer border-none ${
                filterMode === 'all'
                  ? 'bg-canvas text-fg-primary shadow-xs font-semibold'
                  : 'bg-transparent text-fg-tertiary hover:text-fg-secondary'
              }`}
              title="显示主目录与淘汰目录下的所有图片"
            >
              全部 ({totalCount})
            </button>
            <button
              type="button"
              onClick={() => onSetFilterMode('accept')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer border-none ${
                filterMode === 'accept'
                  ? 'bg-canvas text-fg-primary shadow-xs font-semibold'
                  : 'bg-transparent text-fg-tertiary hover:text-fg-secondary'
              }`}
              title="仅显示训练集保留图片（严格排除淘汰目录）"
            >
              仅保留 ({acceptCount})
            </button>
            <button
              type="button"
              onClick={() => onSetFilterMode('reject')}
              className={`px-2.5 py-1 rounded font-medium transition-colors cursor-pointer border-none ${
                filterMode === 'reject'
                  ? 'bg-canvas text-amber-500 shadow-xs font-semibold'
                  : 'bg-transparent text-fg-tertiary hover:text-fg-secondary'
              }`}
              title="仅显示淘汰目录中的图片"
            >
              仅淘汰 ({rejectCount})
            </button>
          </div>
        </div>

        <span className="text-2xs text-fg-tertiary">
          未选中时单击=进入单图编辑 · 已选中时单击=勾选 · shift 区间选
        </span>
      </div>

      <ImageGrid
        className="flex-1 min-h-0"
        contentClassName="p-2"
        items={items}
        selected={selected}
        activeName={active ?? undefined}
        clickMode={selected.size > 0 ? 'select' : 'activate'}
        onSelect={onSelect}
        onActivate={onActivate}
        onPreview={onPreview}
        emptyHint="这个筛选下没有图片"
      />

      <ResizeDivider
        direction="horizontal"
        title="拖动调整操作记录高度，双击恢复默认"
        onDelta={onDeltaLogHeight}
        onReset={onResetLogHeight}
      />

      <LogConsole log={log} height={logHeight} />
    </Card>
  )
}
