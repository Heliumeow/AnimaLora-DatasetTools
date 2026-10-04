import React from 'react'
import Button from '@repo/components/Button'
import TagEditor from '@repo/components/TagEditor'
import type { ImageRow } from '../../api'
import { ProseEditor, TagTranslationToggle } from '../../components'

interface SingleEditorPanelProps {
  active: string | null
  activeRow: ImageRow | null
  activeTags: string[]
  activeProse: string
  dirty: boolean
  saving: boolean
  onChangeTags: (tags: string[]) => void
  onChangeProse: (prose: string) => void
  onSave: () => Promise<void>
  onRevert: () => void
  onDedupe: () => void
  onToggleReject: (rel: string) => void
  onAutoSplit: () => Promise<void>
}

export const SingleEditorPanel: React.FC<SingleEditorPanelProps> = ({
  active,
  activeRow,
  activeTags,
  activeProse,
  dirty,
  saving,
  onChangeTags,
  onChangeProse,
  onSave,
  onRevert,
  onDedupe,
  onToggleReject,
  onAutoSplit,
}) => {
  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-semibold text-fg-secondary m-0">
            单图编辑{active ? `：${active}` : '（先点一张图）'}
          </h3>
          {activeRow && (
            <span
              className={`text-2xs px-1.5 py-0.5 rounded font-mono ${
                activeRow.status === 'reject'
                  ? 'bg-amber-500/15 text-amber-500 font-semibold'
                  : 'bg-emerald-500/15 text-emerald-500'
              }`}
            >
              {activeRow.status === 'reject' ? '已淘汰' : '保留'}
            </span>
          )}
        </div>
        {active && activeRow && (
          <div className="flex items-center gap-1.5">
            <TagTranslationToggle />
            <Button
              size="xs"
              variant={activeRow.status === 'reject' ? 'secondary' : 'danger'}
              onClick={() => onToggleReject(active)}
              title={
                activeRow.status === 'reject'
                  ? '将该图片及伴生文件移回主训练目录'
                  : '将该图片及伴生文件移至淘汰目录'
              }
            >
              {activeRow.status === 'reject' ? '♻️ 放回训练集' : '🗑️ 淘汰此图'}
            </Button>
            <span className="text-2xs text-fg-tertiary">
              {activeTags.length} tags ·{' '}
              {activeProse ? `${activeProse.length} 字 NL` : '纯 tag'}
            </span>
          </div>
        )}
      </div>

      {active && activeRow ? (
        <>
          <div className="space-y-1">
            <label className="text-2xs font-medium text-fg-secondary block">
              纯 Tag 列表（逗号分隔）：
            </label>
            <TagEditor
              tags={activeTags}
              resetKey={active}
              dirty={dirty}
              saving={saving}
              onChange={onChangeTags}
              onSave={onSave}
            />
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="flex gap-1.5">
              <Button size="xs" onClick={onRevert} disabled={!dirty}>
                还原改动
              </Button>
              <Button size="xs" variant="ghost" onClick={onDedupe}>
                去重
              </Button>
            </div>
            <Button
              size="xs"
              variant="primary"
              disabled={!dirty || saving}
              onClick={onSave}
            >
              {saving ? '保存中…' : '保存当前图片 (Tags + Prose)'}
            </Button>
          </div>

          {/* 自然语言交互切分与双通道编辑 */}
          <ProseEditor
            prose={activeProse}
            onChangeProse={onChangeProse}
            tags={activeTags}
            onChangeTags={onChangeTags}
            onAutoSplit={onAutoSplit}
            variant="default"
          />
        </>
      ) : (
        <p className="text-xs text-fg-tertiary m-0">
          点击左侧缩略图进入单图编辑，或切换到「批量编辑」对多张图批处理。
        </p>
      )}
    </>
  )
}
