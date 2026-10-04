import React from 'react'
import Button from '@repo/components/Button'
import { Input } from '@repo/components/FormControl'
import type { Scan } from '../../api'
import { getDefaultRejectDir } from '../../utils/rejectDir'

interface RejectSectionProps {
  root: string
  rejectDir: string
  scan: Scan | null
  onSetRejectDir: (dir: string) => void
  onOpenRejectPicker: () => void
  onCleanEmptyDirs: () => void
}

export const RejectSection: React.FC<RejectSectionProps> = ({
  root,
  rejectDir,
  scan,
  onSetRejectDir,
  onOpenRejectPicker,
  onCleanEmptyDirs,
}) => {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-fg-secondary m-0">淘汰目录</h3>
        {scan != null && (
          <span className="text-2xs text-fg-tertiary">
            {scan.reject_images} 张已淘汰
          </span>
        )}
      </div>
      <Input
        value={rejectDir}
        onChange={(e) => onSetRejectDir(e.target.value)}
        mono
        placeholder="默认父级平行 _rejected 目录"
        className="text-xs"
      />
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" onClick={onOpenRejectPicker}>
          选择…
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            const def = getDefaultRejectDir(root)
            onSetRejectDir(def)
          }}
          title="恢复为默认父级平行 _rejected 目录"
        >
          恢复默认
        </Button>
        <Button
          size="xs"
          variant="ghost"
          onClick={onCleanEmptyDirs}
          title="清理淘汰目录和主目录中的空文件夹"
        >
          清理空目录
        </Button>
      </div>
      {scan?.is_reject_inside_root && (
        <div className="p-1.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-2xs flex items-center gap-1">
          <span>⚠️</span>
          <span>淘汰目录位于主目录内部，已启用递归隔离防重复</span>
        </div>
      )}
    </section>
  )
}
