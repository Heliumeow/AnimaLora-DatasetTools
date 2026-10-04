/** dskit 的本地 Web UI。
 *
 * 这一层刻意做得很薄：**界面组件全部从仓库前端 import**（别名 `@repo` →
 * `studio/web/src`），主题、Tailwind token、i18n 词条也沿用仓库那份。
 *
 * 业务拆分为独立子模块：
 *   - `MainMode/`：主浏览模式（侧边栏、网格墙、编辑面板、数据状态 Hook）
 *   - `ZenMode/`：全屏极速复审与单图标注禅模式
 *   - `api.ts`：与后端 webapp.py 的 HTTP 交互
 */
import '@repo/index.css'
import '@repo/i18n'
import './dskit.css'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'

import AppShell from '@repo/components/AppShell'
import Badge from '@repo/components/Badge'
import Button from '@repo/components/Button'
import PageHeader from '@repo/components/PageHeader'
import PathPicker from '@repo/components/PathPicker'
import { ToastProvider, useToast } from '@repo/components/Toast'

import { api } from './api'
import {
  DEFAULT_EDITOR_HEIGHT,
  DEFAULT_LOG_HEIGHT,
  DEFAULT_RIGHT_WIDTH,
  EDITOR_HEIGHT_KEY,
  LOG_HEIGHT_KEY,
  MainEditorContainer,
  MainGridPanel,
  MainSidebar,
  RIGHT_PANEL_KEY,
  splitTags,
  useMainDataset,
} from './MainMode'
import { ResizeDivider } from './components'
import { ZenModeModal } from './ZenMode'

function App() {
  const { toast } = useToast()
  const dataset = useMainDataset({ toast })

  // 弹窗状态
  const [pickerOpen, setPickerOpen] = useState(false)
  const [rejectPickerOpen, setRejectPickerOpen] = useState(false)
  const [zenOpen, setZenOpen] = useState(false)
  const [zenIndex, setZenIndex] = useState(0)

  // 窗格尺寸自适应状态（支持拖动与本地持久记忆）
  const [rightWidth, setRightWidth] = useState<number>(() => {
    try {
      const v = localStorage.getItem(RIGHT_PANEL_KEY)
      if (v) {
        const num = parseInt(v, 10)
        if (num >= 260 && num <= 900) return num
      }
    } catch {}
    return DEFAULT_RIGHT_WIDTH
  })

  const [logHeight, setLogHeight] = useState<number>(() => {
    try {
      const v = localStorage.getItem(LOG_HEIGHT_KEY)
      if (v) {
        const num = parseInt(v, 10)
        if (num >= 80 && num <= 500) return num
      }
    } catch {}
    return DEFAULT_LOG_HEIGHT
  })

  const [editorHeight, setEditorHeight] = useState<number>(() => {
    try {
      const v = localStorage.getItem(EDITOR_HEIGHT_KEY)
      if (v) {
        const num = parseInt(v, 10)
        if (num >= 150 && num <= 700) return num
      }
    } catch {}
    return DEFAULT_EDITOR_HEIGHT
  })

  // 自然语言识别与切分规则（单图与批量共享）
  const [splitEnabled, setSplitEnabled] = useState(true)
  const [splitMacroPatterns, setSplitMacroPatterns] = useState(true)
  const [splitSyntaxDensity, setSplitSyntaxDensity] = useState(true)
  const [splitStarters, setSplitStarters] = useState(true)
  const [splitNewlines, setSplitNewlines] = useState(true)
  const [splitPeriod, setSplitPeriod] = useState(true)
  const [splitWordThreshold, setSplitWordThreshold] = useState('5')
  const [splitCustomStarters, setSplitCustomStarters] = useState('')

  // 全局按键 Z 快速切入禅模式
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if ((e.key === 'z' || e.key === 'Z') && !zenOpen && dataset.rows.length > 0) {
        e.preventDefault()
        const idx = dataset.active
          ? dataset.rows.findIndex((r) => r.rel === dataset.active)
          : 0
        setZenIndex(idx >= 0 ? idx : 0)
        setZenOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zenOpen, dataset.rows, dataset.active])

  // 单图自动切分处理
  const handleAutoSplit = useCallback(async () => {
    const fullText = [
      dataset.activeTags.join(', '),
      dataset.activeProse,
    ]
      .filter(Boolean)
      .join(', ')
    if (!fullText) return
    try {
      const res = await api.splitCaption(fullText, {
        enabled: splitEnabled,
        use_macro_patterns: splitMacroPatterns,
        use_syntax_density: splitSyntaxDensity,
        use_sentence_starters: splitStarters,
        split_on_newlines: splitNewlines,
        split_on_period: splitPeriod,
        word_count_threshold: parseInt(splitWordThreshold, 10) || 5,
        starters: splitCustomStarters ? splitTags(splitCustomStarters) : undefined,
      })
      dataset.setActiveTags(res.tags)
      dataset.setActiveProse(res.prose)
      toast('已重新应用方案 1+2 自动切分', 'info')
    } catch (e) {
      dataset.fail(e)
    }
  }, [
    dataset,
    splitEnabled,
    splitMacroPatterns,
    splitSyntaxDensity,
    splitStarters,
    splitNewlines,
    splitPeriod,
    splitWordThreshold,
    splitCustomStarters,
    toast,
  ])

  // 三态视图数量计算
  const totalCount = useMemo(() => {
    if (dataset.filterMode === 'all') return dataset.rows.length
    return (dataset.scan?.total_images ?? 0) + (dataset.scan?.reject_images ?? 0)
  }, [dataset.rows, dataset.filterMode, dataset.scan])

  const acceptCount = useMemo(() => {
    if (dataset.filterMode === 'all') {
      return dataset.rows.filter((r) => r.status !== 'reject').length
    }
    if (dataset.filterMode === 'accept') return dataset.rows.length
    return dataset.scan?.total_images ?? 0
  }, [dataset.rows, dataset.filterMode, dataset.scan])

  const rejectCount = useMemo(() => {
    if (dataset.filterMode === 'all') {
      return dataset.rows.filter((r) => r.status === 'reject').length
    }
    if (dataset.filterMode === 'reject') return dataset.rows.length
    return dataset.scan?.reject_images ?? 0
  }, [dataset.rows, dataset.filterMode, dataset.scan])

  const rootLabel =
    dataset.root.split(/[\\/]/).filter(Boolean).pop() ?? dataset.root
  const writeBadge = dataset.live ? (
    <Badge tone="warning">⚠ 真写盘已开启</Badge>
  ) : (
    <Badge tone="neutral">dry-run（不会改文件）</Badge>
  )

  return (
    <AppShell
      mainId="dskit-main"
      skipLabel="跳到主内容"
      overlay={
        pickerOpen ? (
          <PathPicker
            dirOnly
            initialPath={dataset.root}
            onClose={() => setPickerOpen(false)}
            onPick={(p) => {
              setPickerOpen(false)
              dataset.handleSetRoot(p)
            }}
          />
        ) : rejectPickerOpen ? (
          <PathPicker
            dirOnly
            initialPath={dataset.rejectDir || dataset.root}
            onClose={() => setRejectPickerOpen(false)}
            onPick={(p) => {
              setRejectPickerOpen(false)
              dataset.handleSetRejectDir(p)
            }}
          />
        ) : null
      }
      navigation={
        <MainSidebar
          root={dataset.root}
          defaultRoot={dataset.info?.default_root}
          recentRoots={dataset.recentRoots}
          scan={dataset.scan}
          onSetRoot={dataset.handleSetRoot}
          onClearRecentRoots={dataset.handleClearRecentRoots}
          onOpenPicker={() => setPickerOpen(true)}
          rejectDir={dataset.rejectDir}
          onSetRejectDir={dataset.handleSetRejectDir}
          onOpenRejectPicker={() => setRejectPickerOpen(true)}
          onCleanEmptyDirs={dataset.cleanEmptyDirs}
          filterDesc={dataset.filterDesc}
          onApplyFilter={(f) => dataset.setFilter(f)}
          selectedCount={dataset.selected.size}
          group={dataset.group}
          destDir={dataset.destDir}
          onSetGroup={dataset.setGroup}
          onSetDestDir={dataset.setDestDir}
          onSelectAll={dataset.selectAll}
          onClearSelection={dataset.clearSelection}
          onInvertSelection={dataset.invertSelection}
          onDoSelect={() => void dataset.doSelect()}
          onDoUnselect={() => void dataset.doUnselect()}
          backups={dataset.backups}
          onRefreshBackups={() => void dataset.loadBackups()}
          onRestore={(dir) => void dataset.doRestore(dir)}
        />
      }
      topbar={
        <header className="ui-app-shell-topbar flex shrink-0 items-center border-b border-subtle bg-canvas">
          <nav className="ui-app-shell-breadcrumbs" aria-label="位置">
            <span className="ui-app-shell-breadcrumb-item">
              <span className="ui-app-shell-breadcrumb-label">dskit</span>
            </span>
            <span className="ui-app-shell-breadcrumb-item">
              <span className="ui-app-shell-breadcrumb-label" title={dataset.root}>
                {rootLabel || '（未选择目录）'}
              </span>
            </span>
          </nav>
          <div className="ui-app-shell-topbar-stats">{writeBadge}</div>
        </header>
      }
    >
      <div
        className="fade-in h-full min-h-0 flex flex-col overflow-hidden"
        data-app-shell-scroll="contained"
      >
        <PageHeader
          title="数据集工具"
          subtitle={
            dataset.info
              ? `复用仓库 ${dataset.info.repo_root} 的组件与数据集逻辑`
              : '建立仓库绑定中…'
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  const idx = dataset.active
                    ? dataset.rows.findIndex((r) => r.rel === dataset.active)
                    : 0
                  setZenIndex(idx >= 0 ? idx : 0)
                  setZenOpen(true)
                }}
                title="进入全屏极速浏览、淘汰与标注禅模式 (按 Z 亦可切入)"
              >
                🧘 禅模式 (Z)
              </Button>
              <Button
                size="sm"
                variant={dataset.live ? 'danger' : 'secondary'}
                onClick={() => dataset.setLive((v) => !v)}
              >
                {dataset.live ? '关闭写入' : '开启写入'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void dataset.load(
                    dataset.root,
                    dataset.filter,
                    dataset.rejectDir,
                    dataset.filterMode,
                  )
                }
              >
                刷新
              </Button>
            </div>
          }
        />

        <div className="flex flex-1 min-h-0 p-2.5 overflow-x-auto overflow-y-hidden">
          <MainGridPanel
            loading={dataset.loading}
            totalRows={dataset.rows.length}
            filterMode={dataset.filterMode}
            onSetFilterMode={dataset.setFilterMode}
            totalCount={totalCount}
            acceptCount={acceptCount}
            rejectCount={rejectCount}
            items={dataset.items}
            selected={dataset.selected}
            active={dataset.active}
            onSelect={dataset.onSelect}
            onActivate={(name) => {
              dataset.onActivate(name)
            }}
            onPreview={(name) => {
              const idx = dataset.rows.findIndex((r) => r.rel === name)
              setZenIndex(idx >= 0 ? idx : 0)
              setZenOpen(true)
            }}
            log={dataset.log}
            logHeight={logHeight}
            onDeltaLogHeight={(d) =>
              setLogHeight((h) => {
                const next = Math.min(500, Math.max(80, h - d))
                try {
                  localStorage.setItem(LOG_HEIGHT_KEY, String(next))
                } catch {}
                return next
              })
            }
            onResetLogHeight={() => {
              setLogHeight(DEFAULT_LOG_HEIGHT)
              try {
                localStorage.removeItem(LOG_HEIGHT_KEY)
              } catch {}
            }}
          />

          <ResizeDivider
            direction="vertical"
            title="拖动调整编辑窗格宽度，双击恢复默认"
            onDelta={(d) =>
              setRightWidth((w) => {
                const next = Math.min(900, Math.max(260, w - d))
                try {
                  localStorage.setItem(RIGHT_PANEL_KEY, String(next))
                } catch {}
                return next
              })
            }
            onReset={() => {
              setRightWidth(DEFAULT_RIGHT_WIDTH)
              try {
                localStorage.removeItem(RIGHT_PANEL_KEY)
              } catch {}
            }}
          />

          <MainEditorContainer
            rightWidth={rightWidth}
            editorHeight={editorHeight}
            onDeltaEditorHeight={(d) =>
              setEditorHeight((h) => {
                const next = Math.min(700, Math.max(150, h + d))
                try {
                  localStorage.setItem(EDITOR_HEIGHT_KEY, String(next))
                } catch {}
                return next
              })
            }
            onResetEditorHeight={() => {
              setEditorHeight(DEFAULT_EDITOR_HEIGHT)
              try {
                localStorage.removeItem(EDITOR_HEIGHT_KEY)
              } catch {}
            }}
            editTab={dataset.editTab}
            onTabChange={dataset.setEditTab}
            selectedList={dataset.selectedList}
            active={dataset.active}
            activeRow={dataset.activeRow}
            activeTags={dataset.activeTags}
            activeProse={dataset.activeProse}
            dirty={dataset.dirty}
            saving={dataset.saving}
            onChangeTags={dataset.setActiveTags}
            onChangeProse={dataset.setActiveProse}
            onSaveActive={async () => {
              if (!dataset.active) return
              dataset.setSaving(true)
              try {
                await dataset.applyEdit(
                  'set',
                  {
                    tags: dataset.activeTags,
                    prose: dataset.activeProse,
                  },
                  [dataset.active],
                )
              } finally {
                dataset.setSaving(false)
              }
            }}
            onRevertActive={() => {
              if (!dataset.activeRow) return
              dataset.setActiveTags([...dataset.activeRow.tags])
              dataset.setActiveProse(dataset.activeRow.prose || '')
            }}
            onDedupeActive={() => {
              if (!dataset.active) return
              void dataset.applyEdit('dedupe', {}, [dataset.active])
            }}
            onToggleReject={(rel) => void dataset.handleToggleReject(rel)}
            onAutoSplit={handleAutoSplit}
            onApplyEdit={dataset.applyEdit}
            onBatchToggleReject={dataset.handleBatchToggleReject}
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
            cache={dataset.cache}
            onPickTag={dataset.pickTag}
          />
        </div>
      </div>

      {zenOpen && (
        <ZenModeModal
          root={dataset.root}
          rejectDir={dataset.rejectDir}
          initialFilterMode={dataset.filterMode}
          rows={dataset.rows}
          initialIndex={zenIndex}
          onClose={() => {
            setZenOpen(false)
            void dataset.load(
              dataset.root,
              dataset.filter,
              dataset.rejectDir,
              dataset.filterMode,
            )
          }}
          onNotify={(msg, tone) => dataset.say(msg, tone)}
          onRejectDirChanged={(newDir) => {
            dataset.handleSetRejectDir(newDir)
          }}
          onItemUpdated={(rel, newTags, newProse) => {
            dataset.setRows((prev) =>
              prev.map((r) =>
                r.rel === rel ? { ...r, tags: newTags, prose: newProse } : r,
              )
            )
          }}
          onItemStatusChanged={(rel, status) => {
            dataset.setRows((prev) =>
              prev.map((r) => (r.rel === rel ? { ...r, status } : r)),
            )
            if (status === 'reject') {
              dataset.say(`${rel} 已淘汰`, 'info')
            } else {
              dataset.say(`${rel} 已放回训练集`, 'ok')
            }
          }}
        />
      )}
    </AppShell>
  )
}

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <App />
  </ToastProvider>,
)
