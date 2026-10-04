/** dskit Web UI 的 HTTP 适配层。
 *
 * 这一层**只做形状转换**：把 `webapp.py` 的 JSON 端点接到仓库组件需要的
 * props 上（ImageGrid 的 thumbUrl、TagStatsPanel 的 cache Map …）。
 * 所有真正的数据集逻辑都在 webapp.py → dskit → 仓库 studio/services 里，
 * 前端不复制任何规则。
 */

export interface Info {
  repo_root: string
  studio_data: string
  tools_dir: string
  default_root: string
  repo_modules: Record<string, string>
  image_exts: string[]
  meta_exts: string[]
}

export interface ScanFolder {
  name: string
  label: string
  repeat: number
  images: number
  txt: number
  json: number
  none: number
}

export interface Scan {
  root: string
  reject_dir?: string
  exists: boolean
  total_images: number
  reject_images?: number
  is_reject_inside_root?: boolean
  weighted_steps_per_epoch: number
  folders: ScanFolder[]
}

export interface ImageRow {
  rel: string
  name: string
  folder: string
  tags: string[]
  tag_count: number
  prose?: string
  status?: 'accept' | 'reject'
  caption: 'txt' | 'json' | 'none'
}

export interface ImagesResult {
  root: string
  reject_dir?: string
  view?: 'all' | 'accept' | 'reject'
  filter: string
  enumerated: number
  rows: ImageRow[]
}

export interface TagCount {
  tag: string
  count: number
  ratio: number
}

export interface TagsResult {
  total_images: number
  tags: TagCount[]
}

export interface Filter {
  any_tags?: string[]
  all_tags?: string[]
  not_tags?: string[]
  tag_regex?: string
  folder?: string
  name?: string
  caption?: 'any' | 'has' | 'none'
  min_tags?: number | null
  max_tags?: number | null
  limit?: number
  sort?: 'path' | 'name' | 'folder' | 'mtime' | 'tags'
  reverse?: boolean
}

export interface EditResult {
  scope_desc: string
  hit: number
  affected: number
  unchanged: number
  applied: boolean
  backup: string | null
  changes: {
    rel: string
    added: string[]
    removed: string[]
    before_count: number
    after_count: number
  }[]
}

export interface SelectResult {
  dest: string
  group: string
  hit: number
  copied: string[]
  skipped: string[]
  missing: string[]
  applied: boolean
  moved: boolean
  backup: string | null
}

export interface GroupInfo {
  name: string
  path: string
  image_count: number
  caption_types: Record<string, number>
}

export interface BackupInfo {
  dir: string
  created: string
  op: string
  filter: string
  count: number
}

export interface RestoreResult {
  backup_dir: string
  root: string
  op: string
  applied: boolean
  actions: { kind: string; rel: string; ok: boolean; detail: string }[]
}

export const enc = encodeURIComponent

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, init)
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`
    try {
      const body = await resp.json()
      if (body?.detail) detail = String(body.detail)
    } catch {
      /* 非 JSON 错误体 —— 保留状态码文案 */
    }
    throw new Error(detail)
  }
  return (await resp.json()) as T
}

const post = <T,>(url: string, body: unknown): Promise<T> =>
  req<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const filterQs = (f: Filter): string => `f=${enc(JSON.stringify(f))}`

export interface SplitOptions {
  enabled?: boolean
  split_on_newlines?: boolean
  split_on_period?: boolean
  use_macro_patterns?: boolean
  use_syntax_density?: boolean
  use_sentence_starters?: boolean
  starters?: string[]
  word_count_threshold?: number
}

export interface EditRequest {
  root: string
  filter?: Filter
  picked?: string[]
  reject_dir?: string
  view?: 'all' | 'accept' | 'reject'
  kind: 'add' | 'remove' | 'replace' | 'dedupe' | 'set' | 'sanitize'
  tags?: string[]
  old?: string
  new?: string
  position?: string | number
  move_existing?: boolean
  sanitize_opts?: Record<string, unknown>
  prose?: string
  apply?: boolean
  backup?: boolean
}

export interface RejectToggleResult {
  rel: string
  status: 'reject' | 'accept'
  src_base: string
  dest_base: string
  moved_files: string[]
  applied: boolean
}

export const api = {
  info: () => req<Info>('/api/info'),
  scan: (root: string, rejectDir?: string) =>
    req<Scan>(`/api/scan?root=${enc(root)}${rejectDir ? `&reject_dir=${enc(rejectDir)}` : ''}`),
  images: (root: string, f: Filter, rejectDir?: string, view?: 'all' | 'accept' | 'reject') =>
    req<ImagesResult>(
      `/api/images?root=${enc(root)}&${filterQs(f)}${rejectDir ? `&reject_dir=${enc(rejectDir)}` : ''}${view ? `&view=${enc(view)}` : ''}`
    ),
  tags: (root: string, f: Filter, top = 80, rejectDir?: string, view?: 'all' | 'accept' | 'reject') =>
    req<TagsResult>(
      `/api/tags?root=${enc(root)}&${filterQs(f)}&top=${top}${rejectDir ? `&reject_dir=${enc(rejectDir)}` : ''}${view ? `&view=${enc(view)}` : ''}`
    ),
  thumbUrl: (root: string, rel: string, size: number, rejectDir?: string) =>
    `/api/thumb?root=${enc(root)}&rel=${enc(rel)}&size=${size}${rejectDir ? `&reject_dir=${enc(rejectDir)}` : ''}`,
  rawImageUrl: (root: string, rel: string, rejectDir?: string) =>
    `/api/image/raw?root=${enc(root)}&rel=${enc(rel)}${rejectDir ? `&reject_dir=${enc(rejectDir)}` : ''}`,
  edit: (body: EditRequest) => post<EditResult>('/api/edit', body),
  splitCaption: (text: string, options?: SplitOptions) =>
    post<{ tags: string[]; prose: string }>('/api/caption/split', { text, options }),
  toggleReject: (root: string, rel: string, rejectDir?: string, apply = true) =>
    post<RejectToggleResult>('/api/reject/toggle', { root, rel, reject_dir: rejectDir, apply }),
  cleanEmptyDirs: (dirs: string[]) =>
    post<{ cleaned: number }>('/api/reject/clean-empty', { dirs }),
  select: (body: unknown) => post<SelectResult>('/api/select', body),
  unselect: (body: unknown) =>
    post<{ group_dir: string; hit: number; removed: string[]; missing: string[]; applied: boolean; backup: string | null }>(
      '/api/unselect', body,
    ),
  groups: (destDir: string) => req<{ dest_dir: string; groups: GroupInfo[] }>(`/api/groups?dest_dir=${enc(destDir)}`),
  backups: (limit = 30) => req<{ backups: BackupInfo[] }>(`/api/backups?limit=${limit}`),
  restore: (backupDir: string, apply: boolean) => post<RestoreResult>('/api/restore', { backup_dir: backupDir, apply }),
}
