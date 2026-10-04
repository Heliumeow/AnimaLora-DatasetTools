import React from 'react'
import Button from '@repo/components/Button'
import { Input } from '@repo/components/FormControl'

interface GroupExportSectionProps {
  selectedCount: number
  group: string
  destDir: string
  onSetGroup: (g: string) => void
  onSetDestDir: (d: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onInvertSelection: () => void
  onDoSelect: () => void
  onDoUnselect: () => void
}

export const GroupExportSection: React.FC<GroupExportSectionProps> = ({
  selectedCount,
  group,
  destDir,
  onSetGroup,
  onSetDestDir,
  onSelectAll,
  onClearSelection,
  onInvertSelection,
  onDoSelect,
  onDoUnselect,
}) => {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-fg-secondary m-0">
        选择（已选 {selectedCount}）
      </h3>
      <div className="flex flex-wrap gap-2">
        <Button size="xs" onClick={onSelectAll}>
          全选
        </Button>
        <Button size="xs" onClick={onClearSelection}>
          清空
        </Button>
        <Button size="xs" onClick={onInvertSelection}>
          反选
        </Button>
      </div>
      <label className="block text-xs text-fg-tertiary">
        分组名（复制进这个子文件夹）
        <Input
          value={group}
          onChange={(e) => onSetGroup(e.target.value)}
          placeholder="selected"
          invalid={!!group && !/^([0-9]+_)?[A-Za-z][A-Za-z0-9_-]*$/.test(group)}
        />
      </label>
      <label className="block text-xs text-fg-tertiary">
        目标根目录
        <Input
          value={destDir}
          onChange={(e) => onSetDestDir(e.target.value)}
          mono
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={onDoSelect}>
          复制到分组
        </Button>
        <Button size="sm" onClick={onDoUnselect}>
          从本目录移出
        </Button>
      </div>
      <p className="text-2xs text-fg-tertiary m-0">
        复制 = 原图不动，图片连同同名 .txt/.json 一起带走；目标已存在则跳过不覆盖。
      </p>
    </section>
  )
}
