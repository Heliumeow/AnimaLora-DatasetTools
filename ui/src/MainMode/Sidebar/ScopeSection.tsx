import React from 'react'
import Button from '@repo/components/Button'
import { Input, Select } from '@repo/components/FormControl'
import type { Scan } from '../../api'

interface ScopeSectionProps {
  root: string
  defaultRoot?: string
  recentRoots: string[]
  scan: Scan | null
  onSetRoot: (path: string) => void
  onClearRecentRoots: () => void
  onOpenPicker: () => void
}

export const ScopeSection: React.FC<ScopeSectionProps> = ({
  root,
  defaultRoot,
  recentRoots,
  scan,
  onSetRoot,
  onClearRecentRoots,
  onOpenPicker,
}) => {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-fg-secondary m-0">范围</h3>
      <Input
        value={root}
        onChange={(e) => onSetRoot(e.target.value)}
        mono
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSetRoot(root)
        }}
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onOpenPicker}>
          浏览…
        </Button>
        {defaultRoot && (
          <Button size="sm" variant="ghost" onClick={() => onSetRoot(defaultRoot)}>
            示例目录
          </Button>
        )}
      </div>

      {recentRoots.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-subtle/50">
          <div className="flex items-center justify-between">
            <span className="text-2xs text-fg-tertiary">历史目录 ({recentRoots.length})</span>
            <button
              type="button"
              className="text-2xs text-fg-tertiary hover:text-fg-secondary cursor-pointer bg-transparent border-none p-0"
              onClick={onClearRecentRoots}
              title="清空历史浏览记录"
            >
              清空历史
            </button>
          </div>
          <Select
            value={root}
            onChange={(e) => {
              if (e.target.value) {
                onSetRoot(e.target.value)
              }
            }}
            className="text-xs"
          >
            {recentRoots.map((p) => {
              const baseName = p.split(/[\\/]/).filter(Boolean).pop() || p
              return (
                <option key={p} value={p} title={p}>
                  {baseName === p ? p : `${baseName} (${p})`}
                </option>
              )
            })}
          </Select>
        </div>
      )}

      {scan && (
        <p className="text-xs text-fg-tertiary m-0">
          共 {scan.total_images} 张 · 加权步数 {scan.weighted_steps_per_epoch} ·{' '}
          {scan.folders.length} 个子文件夹
        </p>
      )}
    </section>
  )
}
