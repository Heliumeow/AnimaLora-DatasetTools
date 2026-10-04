import React from 'react'
import Button from '@repo/components/Button'
import Card from '@repo/components/Card'
import TagStatsPanel from '@repo/components/TagStatsPanel'
import type { ImageRow } from '../../api'
import { ResizeDivider } from '../../components'
import type { MainEditTab } from '../types'
import { BatchEditorPanel } from './BatchEditorPanel'
import { SingleEditorPanel } from './SingleEditorPanel'

export interface MainEditorContainerProps {
  rightWidth: number
  editorHeight: number
  onDeltaEditorHeight: (delta: number) => void
  onResetEditorHeight: () => void

  editTab: MainEditTab
  onTabChange: (tab: MainEditTab) => void

  selectedList: string[]
  active: string | null
  activeRow: ImageRow | null
  activeTags: string[]
  activeProse: string
  dirty: boolean
  saving: boolean
  onChangeTags: (tags: string[]) => void
  onChangeProse: (prose: string) => void
  onSaveActive: () => Promise<void>
  onRevertActive: () => void
  onDedupeActive: () => void
  onToggleReject: (rel: string) => void
  onAutoSplit: () => Promise<void>

  onApplyEdit: (
    kind: 'add' | 'remove' | 'replace' | 'dedupe' | 'set' | 'sanitize',
    payload: {
      tags?: string[]
      position?: string | number
      move_existing?: boolean
      old?: string
      new?: string
      sanitize_opts?: Record<string, unknown>
      prose?: string
    },
    picked: string[],
  ) => Promise<void>
  onBatchToggleReject: (targetStatus: 'reject' | 'accept') => Promise<void>

  splitEnabled: boolean
  setSplitEnabled: (v: boolean) => void
  splitMacroPatterns: boolean
  setSplitMacroPatterns: (v: boolean) => void
  splitSyntaxDensity: boolean
  setSplitSyntaxDensity: (v: boolean) => void
  splitStarters: boolean
  setSplitStarters: (v: boolean) => void
  splitNewlines: boolean
  setSplitNewlines: (v: boolean) => void
  splitPeriod: boolean
  setSplitPeriod: (v: boolean) => void
  splitWordThreshold: string
  setSplitWordThreshold: (v: string) => void
  splitCustomStarters: string
  setSplitCustomStarters: (v: string) => void

  cache: Map<string, string[]>
  onPickTag: (tag: string) => void
}

export const MainEditorContainer: React.FC<MainEditorContainerProps> = ({
  rightWidth,
  editorHeight,
  onDeltaEditorHeight,
  onResetEditorHeight,
  editTab,
  onTabChange,
  selectedList,
  active,
  activeRow,
  activeTags,
  activeProse,
  dirty,
  saving,
  onChangeTags,
  onChangeProse,
  onSaveActive,
  onRevertActive,
  onDedupeActive,
  onToggleReject,
  onAutoSplit,
  onApplyEdit,
  onBatchToggleReject,
  splitEnabled,
  setSplitEnabled,
  splitMacroPatterns,
  setSplitMacroPatterns,
  splitSyntaxDensity,
  setSplitSyntaxDensity,
  splitStarters,
  setSplitStarters,
  splitNewlines,
  setSplitNewlines,
  splitPeriod,
  setSplitPeriod,
  splitWordThreshold,
  setSplitWordThreshold,
  splitCustomStarters,
  setSplitCustomStarters,
  cache,
  onPickTag,
}) => {
  return (
    <Card
      as="section"
      radius="compact"
      style={{ width: `${rightWidth}px` }}
      className="shrink-0 min-h-0 flex flex-col overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-subtle px-2.5 py-1.5 shrink-0 bg-canvas">
        <div className="flex gap-1">
          <Button
            size="xs"
            variant={editTab === 'batch' ? 'primary' : 'ghost'}
            onClick={() => onTabChange('batch')}
          >
            批量编辑{selectedList.length > 0 ? ` (${selectedList.length})` : ''}
          </Button>
          <Button
            size="xs"
            variant={editTab === 'single' ? 'primary' : 'ghost'}
            onClick={() => onTabChange('single')}
          >
            单图编辑{active ? ` (${active.split('/').pop()})` : ''}
          </Button>
        </div>
      </div>

      <section
        style={{ height: `${editorHeight}px` }}
        className="p-3 border-b border-subtle space-y-3 shrink-0 overflow-y-auto"
      >
        {editTab === 'single' ? (
          <SingleEditorPanel
            active={active}
            activeRow={activeRow}
            activeTags={activeTags}
            activeProse={activeProse}
            dirty={dirty}
            saving={saving}
            onChangeTags={onChangeTags}
            onChangeProse={onChangeProse}
            onSave={onSaveActive}
            onRevert={onRevertActive}
            onDedupe={onDedupeActive}
            onToggleReject={onToggleReject}
            onAutoSplit={onAutoSplit}
          />
        ) : (
          <BatchEditorPanel
            selectedList={selectedList}
            onApplyEdit={onApplyEdit}
            onBatchToggleReject={onBatchToggleReject}
            splitEnabled={splitEnabled}
            setSplitEnabled={setSplitEnabled}
            splitMacroPatterns={splitMacroPatterns}
            setSplitMacroPatterns={setSplitMacroPatterns}
            splitSyntaxDensity={splitSyntaxDensity}
            setSplitSyntaxDensity={setSplitSyntaxDensity}
            splitStarters={splitStarters}
            setSplitStarters={setSplitStarters}
            splitNewlines={splitNewlines}
            setSplitNewlines={setSplitNewlines}
            splitPeriod={splitPeriod}
            setSplitPeriod={setSplitPeriod}
            splitWordThreshold={splitWordThreshold}
            setSplitWordThreshold={setSplitWordThreshold}
            splitCustomStarters={splitCustomStarters}
            setSplitCustomStarters={setSplitCustomStarters}
          />
        )}
      </section>

      {/* 水平分割线：调整编辑表单与 Tag 统计面板高度 */}
      <ResizeDivider
        direction="horizontal"
        title="拖动调整编辑表单与 Tag 统计面板高度，双击恢复默认"
        onDelta={onDeltaEditorHeight}
        onReset={onResetEditorHeight}
      />

      <TagStatsPanel
        cache={cache}
        selectedKeys={selectedList}
        onPickTag={(tag) => {
          onPickTag(tag)
          onTabChange('batch')
        }}
        onRemoveTag={(tag) => void onApplyEdit('remove', { tags: [tag] }, selectedList)}
        onReplaceTag={(oldTag, newTag) =>
          void onApplyEdit('replace', { old: oldTag, new: newTag }, selectedList)
        }
      />
    </Card>
  )
}
