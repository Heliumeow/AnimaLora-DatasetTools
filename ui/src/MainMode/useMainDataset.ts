import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applySelection, type ImageGridItem } from '@repo/components/ImageGrid'
import {
  api,
  type BackupInfo,
  type Filter,
  type ImageRow,
  type Info,
  type Scan,
} from '../api'
import {
  getDefaultRejectDir,
  getStoredRejectDir,
  setStoredRejectDir,
} from '../utils/rejectDir'
import type { ZenFilterMode } from '../ZenMode'
import {
  compactFilter,
  EMPTY_FILTER,
  LAST_ROOT_KEY,
  type LogLine,
  type LogTone,
  type MainEditTab,
  RECENT_ROOTS_KEY,
} from './types'

interface UseMainDatasetOptions {
  toast: (msg: string, kind?: 'info' | 'success' | 'error') => void
}

export function useMainDataset({ toast }: UseMainDatasetOptions) {
  const [info, setInfo] = useState<Info | null>(null)
  const [root, setRoot] = useState('')
  const [rejectDir, setRejectDir] = useState('')
  const [filterMode, setFilterMode] = useState<ZenFilterMode>('all')

  // 浏览历史记录状态
  const [recentRoots, setRecentRoots] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(RECENT_ROOTS_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })

  const [scan, setScan] = useState<Scan | null>(null)
  const [rows, setRows] = useState<ImageRow[]>([])
  const [filterDesc, setFilterDesc] = useState('')
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER)

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchorRef = useRef<string | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [activeTags, setActiveTags] = useState<string[]>([])
  const [activeProse, setActiveProse] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const [live, setLive] = useState(false)
  const [group, setGroup] = useState('')
  const [destDir, setDestDir] = useState('')
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [log, setLog] = useState<LogLine[]>([])
  const logId = useRef(0)

  const say = useCallback((text: string, tone: LogTone = 'info') => {
    setLog((lines) => [{ id: (logId.current += 1), tone, text }, ...lines].slice(0, 200))
  }, [])

  const fail = useCallback(
    (e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e)
      say(msg, 'err')
      toast(msg, 'error')
    },
    [say, toast],
  )

  const handleSetRoot = useCallback((nextRoot: string) => {
    setRoot(nextRoot)
    const stored = getStoredRejectDir(nextRoot)
    setRejectDir(stored && stored.trim() ? stored.trim() : getDefaultRejectDir(nextRoot))
  }, [])

  const handleSetRejectDir = useCallback(
    (nextReject: string) => {
      setRejectDir(nextReject)
      if (root) {
        setStoredRejectDir(root, nextReject)
      }
    },
    [root],
  )

  const handleClearRecentRoots = useCallback(() => {
    try {
      localStorage.removeItem(RECENT_ROOTS_KEY)
      setRecentRoots([])
    } catch {
      // ignore
    }
  }, [])

  const loadBackups = useCallback(async () => {
    try {
      setBackups((await api.backups(20)).backups)
    } catch {
      // ignore
    }
  }, [])

  // ── 载入当前目录 ────────────────────────────────────────────────
  const load = useCallback(
    async (r: string, f: Filter, rj?: string, mode?: ZenFilterMode) => {
      if (!r) return
      const curReject =
        rj !== undefined ? rj : rejectDir || getStoredRejectDir(r) || getDefaultRejectDir(r)
      const curMode = mode !== undefined ? mode : filterMode
      setLoading(true)
      try {
        const [s, images] = await Promise.all([
          api.scan(r, curReject),
          api.images(r, compactFilter(f), curReject, curMode),
        ])
        setScan(s)
        setRows(images.rows)
        setFilterDesc(images.filter)
        setSelected(new Set())
        setActive(null)
        setActiveTags([])
        setActiveProse('')
        anchorRef.current = null
        setDestDir(`${r.replace(/[\\/]+$/, '')}__selected`)

        try {
          localStorage.setItem(LAST_ROOT_KEY, r)
          const rawRecents = localStorage.getItem(RECENT_ROOTS_KEY)
          let recents: string[] = rawRecents ? JSON.parse(rawRecents) : []
          recents = [r, ...recents.filter((p) => p !== r)].slice(0, 10)
          localStorage.setItem(RECENT_ROOTS_KEY, JSON.stringify(recents))
          setRecentRoots(recents)
        } catch {
          // ignore
        }
      } catch (e) {
        fail(e)
      } finally {
        setLoading(false)
      }
    },
    [fail, rejectDir, filterMode],
  )

  // ── 启动：获取仓库信息与恢复上次根目录 ───────────────────────────
  useEffect(() => {
    void (async () => {
      try {
        const i = await api.info()
        setInfo(i)
        let initialRoot = i.default_root
        try {
          const savedLast = localStorage.getItem(LAST_ROOT_KEY)
          if (savedLast && savedLast.trim()) {
            initialRoot = savedLast.trim()
          }
        } catch {}
        handleSetRoot(initialRoot)
      } catch (e) {
        fail(e)
      }
    })()
  }, [handleSetRoot, fail])

  useEffect(() => {
    if (root) void load(root, filter, rejectDir, filterMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, filter, rejectDir, filterMode])

  useEffect(() => {
    void loadBackups()
  }, [loadBackups])

  // ── 派生计算 ────────────────────────────────────────────────────
  const cache = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const r of rows) m.set(r.rel, r.tags)
    return m
  }, [rows])

  const items: ImageGridItem[] = useMemo(
    () =>
      rows.map((r) => {
        const isRejected = r.status === 'reject'
        const captionBadge = r.caption === 'none' ? undefined : r.caption
        return {
          name: r.rel,
          thumbUrl: api.thumbUrl(root, r.rel, 256, rejectDir),
          meta: `${isRejected ? '[已淘汰] ' : ''}${r.tags.join(', ') || '(无 caption)'}`,
          badge: isRejected ? '已淘汰' : captionBadge,
          badgeTone: isRejected ? 'warning' : 'accent',
        }
      }),
    [rows, root, rejectDir],
  )

  const rels = useMemo(() => rows.map((r) => r.rel), [rows])
  const selectedList = useMemo(() => rels.filter((r) => selected.has(r)), [rels, selected])
  const activeRow = useMemo(() => rows.find((r) => r.rel === active) ?? null, [rows, active])

  const dirty = useMemo(
    () =>
      !!activeRow &&
      (JSON.stringify(activeRow.tags) !== JSON.stringify(activeTags) ||
        (activeRow.prose || '') !== activeProse),
    [activeRow, activeTags, activeProse],
  )

  const [editTab, setEditTab] = useState<MainEditTab>('single')

  const onSelect = useCallback(
    (name: string, e: React.MouseEvent) => {
      const out = applySelection(selected, name, e, rels, anchorRef.current)
      anchorRef.current = out.anchor
      setSelected(out.next)

      const row = rows.find((r) => r.rel === name)
      if (row) {
        setActive(name)
        setActiveTags([...row.tags])
        setActiveProse(row.prose || '')
      }
    },
    [selected, rels, rows],
  )

  const onActivate = useCallback(
    (name: string) => {
      const row = rows.find((r) => r.rel === name)
      if (!row) return
      setActive(name)
      setActiveTags([...row.tags])
      setActiveProse(row.prose || '')
      setEditTab('single')
    },
    [rows],
  )

  const pickTag = useCallback(
    (tag: string) => {
      const hits = rows.filter((r) => r.tags.includes(tag)).map((r) => r.rel)
      setSelected(new Set(hits))
      anchorRef.current = hits[0] ?? null
      setEditTab('batch')
      say(`已选中含「${tag}」的 ${hits.length} 张`)
    },
    [rows, say],
  )

  const selectAll = useCallback(() => setSelected(new Set(rels)), [rels])
  const clearSelection = useCallback(() => setSelected(new Set()), [])
  const invertSelection = useCallback(
    () => setSelected(new Set(rels.filter((r) => !selected.has(r)))),
    [rels, selected],
  )

  // ── 淘汰 / 放回操作 ─────────────────────────────────────────────
  const handleToggleReject = useCallback(
    async (rel: string) => {
      try {
        const res = await api.toggleReject(root, rel, rejectDir, true)
        setRows((prev) =>
          prev.map((r) => (r.rel === rel ? { ...r, status: res.status } : r)),
        )
        const msg = res.status === 'reject' ? `${rel} 已淘汰` : `${rel} 已放回训练集`
        say(msg, res.status === 'reject' ? 'info' : 'ok')
        toast(msg, 'success')
        if (filterMode !== 'all') {
          void load(root, filter, rejectDir, filterMode)
        } else {
          void api.scan(root, rejectDir).then(setScan).catch(() => {})
        }
      } catch (e) {
        fail(e)
      }
    },
    [root, rejectDir, filterMode, load, filter, say, toast, fail],
  )

  const handleBatchToggleReject = useCallback(
    async (targetStatus: 'reject' | 'accept') => {
      if (selectedList.length === 0) return
      const targets = rows.filter(
        (r) => selectedList.includes(r.rel) && r.status !== targetStatus,
      )
      if (targets.length === 0) {
        toast(
          targetStatus === 'reject'
            ? '选中的图片均已是淘汰状态'
            : '选中的图片均已在训练集中',
          'info',
        )
        return
      }
      try {
        let done = 0
        for (const t of targets) {
          await api.toggleReject(root, t.rel, rejectDir, true)
          done++
        }
        const label = targetStatus === 'reject' ? '淘汰' : '放回'
        say(`已批量${label} ${done} 张图片`, 'ok')
        toast(`已批量${label} ${done} 张图片`, 'success')
        await load(root, filter, rejectDir, filterMode)
      } catch (e) {
        fail(e)
      }
    },
    [selectedList, rows, root, rejectDir, filterMode, load, filter, say, toast, fail],
  )

  // ── 标注与元数据编辑 ─────────────────────────────────────────────
  const applyEdit = useCallback(
    async (
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
    ) => {
      if (picked.length === 0) {
        say('没有选中任何图片', 'err')
        return
      }
      try {
        const res = await api.edit({
          root,
          filter: compactFilter(filter),
          picked,
          reject_dir: rejectDir,
          view: filterMode,
          kind,
          tags: payload.tags ?? [],
          position: payload.position ?? 'back',
          move_existing: payload.move_existing ?? false,
          old: payload.old ?? '',
          new: payload.new ?? '',
          sanitize_opts: payload.sanitize_opts,
          prose: payload.prose,
          apply: live,
        })
        const head = `${live ? '已写入' : 'DRY-RUN'} · ${res.scope_desc} · 命中 ${res.hit} · 会变 ${res.affected}`
        const lines = res.changes.map(
          (c) =>
            `  ${c.rel}  ${c.before_count}→${c.after_count}` +
            (c.added.length ? `  +${c.added.join(' +')}` : '') +
            (c.removed.length ? `  -${c.removed.join(' -')}` : ''),
        )
        say(
          [head, ...lines, res.backup ? `还原点：${res.backup}` : '']
            .filter(Boolean)
            .join('\n'),
          res.affected ? 'ok' : 'info',
        )
        toast(
          live ? `已写入 ${res.affected} 张` : `预览：将改动 ${res.affected} 张`,
          res.affected ? 'success' : 'info',
        )
        await load(root, filter, rejectDir, filterMode)
        if (live) await loadBackups()
      } catch (e) {
        fail(e)
      }
    },
    [root, filter, rejectDir, filterMode, live, say, toast, load, loadBackups, fail],
  )

  // ── 分组复制与移出 ───────────────────────────────────────────────
  const doSelect = useCallback(async () => {
    if (selectedList.length === 0) {
      say('没有选中任何图片', 'err')
      return
    }
    if (!group.trim()) {
      say('先填目标分组名（字母/数字/下划线）', 'err')
      return
    }
    try {
      const res = await api.select({
        root,
        filter: compactFilter(filter),
        picked: selectedList,
        dest_dir: destDir || null,
        group: group.trim(),
        move: false,
        apply: live,
      })
      say(
        [
          `${live ? '已复制' : 'DRY-RUN'} · 命中 ${res.hit} · 复制 ${res.copied.length} · 跳过 ${res.skipped.length}`,
          `目标：${res.dest}`,
          res.copied.length ? `  ${res.copied.join('\n  ')}` : '',
          res.skipped.length
            ? `  跳过（目标已存在，不覆盖）：${res.skipped.join(', ')}`
            : '',
          res.backup ? `还原点：${res.backup}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        'ok',
      )
      toast(
        live ? `已复制 ${res.copied.length} 张到 ${res.group}` : `预览：将复制 ${res.copied.length} 张`,
        'success',
      )
      if (live) await loadBackups()
    } catch (e) {
      fail(e)
    }
  }, [selectedList, group, root, filter, destDir, live, say, toast, loadBackups, fail])

  const doUnselect = useCallback(async () => {
    if (selectedList.length === 0) {
      say('没有选中任何图片', 'err')
      return
    }
    try {
      const res = await api.unselect({
        group_dir: root,
        filter: compactFilter(filter),
        picked: selectedList,
        apply: live,
      })
      say(
        [
          `${live ? '已移出' : 'DRY-RUN'} · ${res.group_dir} · 命中 ${res.hit} · 移出 ${res.removed.length}`,
          res.removed.length ? `  ${res.removed.join('\n  ')}` : '',
          res.backup ? `还原点：${res.backup}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        'ok',
      )
      await load(root, filter, rejectDir, filterMode)
      if (live) await loadBackups()
    } catch (e) {
      fail(e)
    }
  }, [selectedList, root, filter, rejectDir, filterMode, live, say, load, loadBackups, fail])

  const doRestore = useCallback(
    async (dir: string) => {
      try {
        const preview = await api.restore(dir, false)
        const ok = window.confirm(
          `回滚还原点？\n\n${preview.op} · ${preview.actions.length} 个动作\n` +
            preview.actions
              .slice(0, 12)
              .map((a) => `  ${a.kind}  ${a.rel}`)
              .join('\n'),
        )
        if (!ok) return
        const res = await api.restore(dir, true)
        say(
          `回滚完成：${res.actions.filter((a) => a.ok).length}/${res.actions.length} 项成功`,
          'ok',
        )
        await load(root, filter, rejectDir, filterMode)
        await loadBackups()
      } catch (e) {
        fail(e)
      }
    },
    [root, filter, rejectDir, filterMode, say, load, loadBackups, fail],
  )

  const cleanEmptyDirs = useCallback(async () => {
    try {
      const res = await api.cleanEmptyDirs([rejectDir, root].filter(Boolean))
      say(`已清理 ${res.cleaned} 个空文件夹`, 'ok')
      toast(`已清理 ${res.cleaned} 个空文件夹`, 'success')
    } catch (e) {
      fail(e)
    }
  }, [rejectDir, root, say, toast, fail])

  return {
    info,
    root,
    rejectDir,
    filterMode,
    recentRoots,
    handleSetRoot,
    handleSetRejectDir,
    handleClearRecentRoots,
    setFilterMode,
    scan,
    rows,
    setRows,
    filterDesc,
    loading,
    filter,
    setFilter,
    load,
    selected,
    setSelected,
    rels,
    selectedList,
    selectAll,
    clearSelection,
    invertSelection,
    active,
    setActive,
    activeRow,
    activeTags,
    setActiveTags,
    activeProse,
    setActiveProse,
    dirty,
    saving,
    setSaving,
    onSelect,
    onActivate,
    pickTag,
    handleToggleReject,
    handleBatchToggleReject,
    applyEdit,
    live,
    setLive,
    group,
    setGroup,
    destDir,
    setDestDir,
    doSelect,
    doUnselect,
    backups,
    loadBackups,
    doRestore,
    cleanEmptyDirs,
    log,
    say,
    fail,
    editTab,
    setEditTab,
    items,
    cache,
  }
}
