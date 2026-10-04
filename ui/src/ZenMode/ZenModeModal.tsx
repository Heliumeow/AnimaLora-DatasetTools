import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PathPicker from '@repo/components/PathPicker'
import { api } from '../api'
import { ResizeDivider } from '../components'
import {
  getDefaultRejectDir,
  getStoredRejectDir,
  setStoredRejectDir,
  REJECT_DIR_STORAGE_KEY_PREFIX,
} from '../utils/rejectDir'
import type { ZenFilterMode, ZenItem, ZenModeProps } from './types'
import { useZenHotkeys } from './useZenHotkeys'
import { ZenCaptionEditor } from './ZenCaptionEditor'
import { ZenFolderTree } from './ZenFolderTree'
import { ZenImageViewer } from './ZenImageViewer'
import { ZenTopBar } from './ZenTopBar'

export {
  getDefaultRejectDir,
  getStoredRejectDir,
  setStoredRejectDir,
  REJECT_DIR_STORAGE_KEY_PREFIX,
}

const ZEN_TREE_WIDTH_KEY = 'dskit:zen:tree_width'
const DEFAULT_ZEN_TREE_WIDTH = 260
const ZEN_EDITOR_WIDTH_KEY = 'dskit:zen:editor_width'
const DEFAULT_ZEN_EDITOR_WIDTH = 380

export const ZenModeModal: React.FC<ZenModeProps> = ({
  root,
  rejectDir: defaultRejectDir,
  rows,
  initialIndex = 0,
  initialFilterMode = 'all',
  onClose,
  onItemUpdated,
  onItemStatusChanged,
  onRejectDirChanged,
  onNotify,
}) => {
  const [items, setItems] = useState<ZenItem[]>(() =>
    rows.map((r) => ({
      ...r,
      status: r.status || 'accept',
    }))
  )

  const [currentIndex, setCurrentIndex] = useState(
    Math.min(Math.max(0, initialIndex), Math.max(0, rows.length - 1))
  )
  const [filterMode, setFilterMode] = useState<ZenFilterMode>(initialFilterMode)

  // 淘汰目录：优先读取针对当前 root 记忆的路径，其次默认父级平行 _rejected
  const [rejectDir, setRejectDir] = useState<string>(() => {
    const stored = getStoredRejectDir(root)
    if (stored && stored.trim()) return stored.trim()
    if (defaultRejectDir && defaultRejectDir.trim()) return defaultRejectDir.trim()
    return getDefaultRejectDir(root)
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loadingReject, setLoadingReject] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isFolderTreeOpen, setIsFolderTreeOpen] = useState(true)

  const [folderTreeWidth, setFolderTreeWidth] = useState<number>(() => {
    try {
      const v = localStorage.getItem(ZEN_TREE_WIDTH_KEY)
      if (v) {
        const num = parseInt(v, 10)
        if (num >= 180 && num <= 500) return num
      }
    } catch {}
    return DEFAULT_ZEN_TREE_WIDTH
  })

  const [editorWidth, setEditorWidth] = useState<number>(() => {
    try {
      const v = localStorage.getItem(ZEN_EDITOR_WIDTH_KEY)
      if (v) {
        const num = parseInt(v, 10)
        if (num >= 260 && num <= 650) return num
      }
    } catch {}
    return DEFAULT_ZEN_EDITOR_WIDTH
  })

  // 当 root 改变时同步记忆
  useEffect(() => {
    const stored = getStoredRejectDir(root)
    if (stored && stored.trim()) {
      setRejectDir(stored.trim())
    } else {
      setRejectDir(
        defaultRejectDir && defaultRejectDir.trim()
          ? defaultRejectDir.trim()
          : getDefaultRejectDir(root)
      )
    }
  }, [root, defaultRejectDir])

  const tagInputRef = useRef<HTMLInputElement | null>(null)

  // 过滤后的列表
  const filteredItems = useMemo(() => {
    if (filterMode === 'all') return items
    return items.filter((item) => item.status === filterMode)
  }, [items, filterMode])

  const currentItem = items[currentIndex] ?? null

  const currentFilteredIndex = useMemo(() => {
    if (!currentItem) return 0
    const idx = filteredItems.findIndex((it) => it.rel === currentItem.rel)
    return idx >= 0 ? idx : 0
  }, [filteredItems, currentItem])

  // 翻页导航逻辑
  const navigate = useCallback(
    (step: number) => {
      if (items.length === 0) return
      let target = currentIndex + step

      // 寻路跳过不符合当前 filterMode 的图片
      while (target >= 0 && target < items.length) {
        if (filterMode === 'all' || items[target].status === filterMode) {
          break
        }
        target += step
      }

      if (target >= 0 && target < items.length) {
        setCurrentIndex(target)
      }
    },
    [currentIndex, items, filterMode]
  )

  const handleNext = useCallback(() => navigate(1), [navigate])
  const handlePrev = useCallback(() => navigate(-1), [navigate])

  // 原地切换淘汰 / 保留 (Toggle Reject)
  const handleToggleReject = useCallback(async () => {
    if (!currentItem || loadingReject) return
    setLoadingReject(true)
    try {
      const res = await api.toggleReject(root, currentItem.rel, rejectDir, true)
      const nextStatus = res.status

      setItems((prev) =>
        prev.map((it) => (it.rel === currentItem.rel ? { ...it, status: nextStatus } : it))
      )
      onItemStatusChanged?.(currentItem.rel, nextStatus)
      onNotify?.(
        `${currentItem.rel} 已${nextStatus === 'reject' ? '淘汰至备用目录' : '移回训练集'}`
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onNotify?.(`移动失败: ${msg}`, 'err')
    } finally {
      setLoadingReject(false)
    }
  }, [currentItem, loadingReject, root, rejectDir, onItemStatusChanged, onNotify])

  // 保存 Tag 与 Prose 修改
  const handleSaveCaption = useCallback(
    async (tags: string[], prose: string) => {
      if (!currentItem) return
      setIsSaving(true)
      try {
        await api.edit({
          root,
          kind: 'set',
          tags,
          prose,
          picked: [currentItem.rel],
          apply: true,
          backup: true,
        })
        setItems((prev) =>
          prev.map((it) =>
            it.rel === currentItem.rel ? { ...it, tags: [...tags], prose } : it
          )
        )
        onItemUpdated?.(currentItem.rel, tags, prose)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        onNotify?.(`保存 Caption 失败: ${msg}`, 'err')
      } finally {
        setIsSaving(false)
      }
    },
    [currentItem, root, onItemUpdated, onNotify]
  )

  // 空目录清理
  const handleCleanEmpty = useCallback(async () => {
    try {
      const res = await api.cleanEmptyDirs([root, rejectDir])
      onNotify?.(`已成功清理 ${res.cleaned} 个空文件夹`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      onNotify?.(`清理空文件夹失败: ${msg}`, 'err')
    }
  }, [root, rejectDir, onNotify])

  // 打开文件夹选择器
  const handleEditRejectDir = useCallback(() => {
    setPickerOpen(true)
  }, [])

  // 选中淘汰目录并持久化记忆
  const handlePickRejectDir = useCallback(
    (newDir: string) => {
      const clean = newDir.trim()
      if (!clean) return
      setRejectDir(clean)
      setStoredRejectDir(root, clean)
      onRejectDirChanged?.(clean)
      onNotify?.(`已选择并记忆淘汰目录：${clean}`)
    },
    [root, onRejectDirChanged, onNotify],
  )

  // 更新图片自然分辨率
  const handleDimensionsLoaded = useCallback(
    (w: number, h: number) => {
      if (!currentItem) return
      if (currentItem.naturalWidth !== w || currentItem.naturalHeight !== h) {
        setItems((prev) =>
          prev.map((it) =>
            it.rel === currentItem.rel ? { ...it, naturalWidth: w, naturalHeight: h } : it
          )
        )
      }
    },
    [currentItem]
  )

  const handleFocusEditor = useCallback(() => {
    tagInputRef.current?.focus()
  }, [])

  // 键盘与滚轮流绑定
  useZenHotkeys({
    enabled: true,
    onNext: handleNext,
    onPrev: handlePrev,
    onToggleReject: handleToggleReject,
    onFocusEditor: handleFocusEditor,
    onClose,
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#09090b',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        outline: 'none',
        overflow: 'hidden',
      }}
    >
      {/* 顶部状态栏 */}
      <ZenTopBar
        item={currentItem}
        currentIndex={currentFilteredIndex}
        totalInFilter={filteredItems.length}
        totalGlobal={items.length}
        filterMode={filterMode}
        onFilterModeChange={setFilterMode}
        onToggleReject={handleToggleReject}
        onCleanEmpty={handleCleanEmpty}
        onClose={onClose}
        rejectDir={rejectDir}
        onEditRejectDir={handleEditRejectDir}
        loadingReject={loadingReject}
        isFolderTreeOpen={isFolderTreeOpen}
        onToggleFolderTree={() => setIsFolderTreeOpen((v) => !v)}
      />

      {/* 主体视口：左侧树状目录 + 中间居中大图 + 右侧标注面板 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <ZenFolderTree
          items={items}
          currentItem={currentItem}
          filterMode={filterMode}
          onSelectIndex={(idx) => setCurrentIndex(idx)}
          isOpen={isFolderTreeOpen}
          onToggleOpen={() => setIsFolderTreeOpen((v) => !v)}
          width={folderTreeWidth}
        />

        {isFolderTreeOpen && (
          <ResizeDivider
            direction="vertical"
            variant="zen"
            title="拖动调整左侧目录树宽度，双击恢复默认"
            onDelta={(d) =>
              setFolderTreeWidth((w) => {
                const next = Math.min(500, Math.max(180, w + d))
                try {
                  localStorage.setItem(ZEN_TREE_WIDTH_KEY, String(next))
                } catch {}
                return next
              })
            }
            onReset={() => {
              setFolderTreeWidth(DEFAULT_ZEN_TREE_WIDTH)
              try {
                localStorage.removeItem(ZEN_TREE_WIDTH_KEY)
              } catch {}
            }}
          />
        )}

        <ZenImageViewer
          root={root}
          rejectDir={rejectDir}
          item={currentItem}
          onDimensionsLoaded={handleDimensionsLoaded}
          onPrev={handlePrev}
          onNext={handleNext}
        />

        <ResizeDivider
          direction="vertical"
          variant="zen"
          title="拖动调整右侧标注面板宽度，双击恢复默认"
          onDelta={(d) =>
            setEditorWidth((w) => {
              const next = Math.min(650, Math.max(260, w - d))
              try {
                localStorage.setItem(ZEN_EDITOR_WIDTH_KEY, String(next))
              } catch {}
              return next
            })
          }
          onReset={() => {
            setEditorWidth(DEFAULT_ZEN_EDITOR_WIDTH)
            try {
              localStorage.removeItem(ZEN_EDITOR_WIDTH_KEY)
            } catch {}
          }}
        />

        <ZenCaptionEditor
          item={currentItem}
          onSave={handleSaveCaption}
          isSaving={isSaving}
          tagInputRef={tagInputRef}
          width={editorWidth}
        />
      </div>

      {/* 淘汰目录文件夹选择器 */}
      {pickerOpen && (
        <div style={{ position: 'relative', zIndex: 10000 }}>
          <PathPicker
            dirOnly
            initialPath={rejectDir || getDefaultRejectDir(root)}
            onClose={() => setPickerOpen(false)}
            onPick={(p) => {
              setPickerOpen(false)
              handlePickRejectDir(p)
            }}
          />
        </div>
      )}
    </div>
  )
}
