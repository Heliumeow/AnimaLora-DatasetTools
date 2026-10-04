import type { Filter } from '../api'

export type LogTone = 'info' | 'ok' | 'err'

export interface LogLine {
  id: number
  tone: LogTone
  text: string
}

export type MainEditTab = 'single' | 'batch'

export const LAST_ROOT_KEY = 'dskit:last_root'
export const RECENT_ROOTS_KEY = 'dskit:recent_roots'
export const RIGHT_PANEL_KEY = 'dskit:layout:right_width'
export const DEFAULT_RIGHT_WIDTH = 380
export const LOG_HEIGHT_KEY = 'dskit:layout:log_height'
export const DEFAULT_LOG_HEIGHT = 160
export const EDITOR_HEIGHT_KEY = 'dskit:layout:editor_height'
export const DEFAULT_EDITOR_HEIGHT = 380

export const EMPTY_FILTER: Filter = {
  any_tags: [],
  all_tags: [],
  not_tags: [],
  tag_regex: '',
  folder: '',
  name: '',
  caption: 'any',
  min_tags: null,
  max_tags: null,
  limit: 0,
  sort: 'path',
  reverse: false,
}

export { splitTags, dedupeTags } from '../utils/tags'

export const compactFilter = (f: Filter): Filter => {
  const out: Filter = { ...f }
  for (const k of ['any_tags', 'all_tags', 'not_tags'] as const) {
    if (!out[k] || out[k]!.length === 0) delete out[k]
  }
  if (!out.tag_regex) delete out.tag_regex
  if (!out.folder) delete out.folder
  if (!out.name) delete out.name
  if (!out.caption || out.caption === 'any') delete out.caption
  if (out.min_tags == null) delete out.min_tags
  if (out.max_tags == null) delete out.max_tags
  if (!out.limit) delete out.limit
  return out
}
