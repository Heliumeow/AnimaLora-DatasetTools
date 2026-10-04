import type { ImageRow } from '../api'

export interface ZenItem extends ImageRow {
  status: 'accept' | 'reject'
  naturalWidth?: number
  naturalHeight?: number
}

export type ZenFilterMode = 'all' | 'accept' | 'reject'

export interface AspectRatioInfo {
  desc: string
  ratio: number
  isExtreme: boolean
  isLowRes: boolean
  shortEdge: number
}

export interface ZenModeProps {
  root: string
  rejectDir?: string
  rows: ImageRow[]
  initialIndex?: number
  initialFilterMode?: ZenFilterMode
  tagDict?: any
  onClose: () => void
  onItemUpdated?: (rel: string, tags: string[], prose: string) => void
  onItemStatusChanged?: (rel: string, status: 'accept' | 'reject') => void
  onRejectDirChanged?: (dir: string) => void
  onNotify?: (msg: string, tone?: 'info' | 'ok' | 'err') => void
}
