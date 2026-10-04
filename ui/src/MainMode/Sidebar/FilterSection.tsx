import React, { useState } from 'react'
import Button from '@repo/components/Button'
import { Input, Select } from '@repo/components/FormControl'
import type { Filter } from '../../api'
import { EMPTY_FILTER, splitTags } from '../types'

interface FilterSectionProps {
  filterDesc: string
  onApplyFilter: (f: Filter) => void
}

export const FilterSection: React.FC<FilterSectionProps> = ({
  filterDesc,
  onApplyFilter,
}) => {
  const [anyTags, setAnyTags] = useState('')
  const [notTags, setNotTags] = useState('')
  const [folderGlob, setFolderGlob] = useState('')
  const [caption, setCaption] = useState<'any' | 'has' | 'none'>('any')
  const [minTags, setMinTags] = useState('')
  const [maxTags, setMaxTags] = useState('')
  const [sort, setSort] = useState<Filter['sort']>('path')

  const handleApply = () => {
    onApplyFilter({
      any_tags: splitTags(anyTags),
      all_tags: [],
      not_tags: splitTags(notTags),
      tag_regex: '',
      folder: folderGlob.trim(),
      name: '',
      caption,
      min_tags: minTags === '' ? null : Number(minTags),
      max_tags: maxTags === '' ? null : Number(maxTags),
      limit: 0,
      sort,
      reverse: false,
    })
  }

  const handleClear = () => {
    setAnyTags('')
    setNotTags('')
    setFolderGlob('')
    setCaption('any')
    setMinTags('')
    setMaxTags('')
    setSort('path')
    onApplyFilter({ ...EMPTY_FILTER })
  }

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-fg-secondary m-0">筛选</h3>
      <label className="block text-xs text-fg-tertiary">
        必须包含（逗号分隔 = 任选其一）
        <Input
          value={anyTags}
          onChange={(e) => setAnyTags(e.target.value)}
          placeholder="1girl, solo"
        />
      </label>
      <label className="block text-xs text-fg-tertiary">
        排除
        <Input
          value={notTags}
          onChange={(e) => setNotTags(e.target.value)}
          placeholder="nsfw"
        />
      </label>
      <label className="block text-xs text-fg-tertiary">
        子文件夹（glob，** 跨层）
        <Input
          value={folderGlob}
          onChange={(e) => setFolderGlob(e.target.value)}
          placeholder="人物/**"
        />
      </label>
      <div className="flex gap-2">
        <label className="flex-1 text-xs text-fg-tertiary">
          caption
          <Select
            value={caption}
            onChange={(e) => setCaption(e.target.value as 'any')}
          >
            <option value="any">全部</option>
            <option value="has">有 caption</option>
            <option value="none">无 caption</option>
          </Select>
        </label>
        <label className="flex-1 text-xs text-fg-tertiary">
          排序
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as Filter['sort'])}
          >
            <option value="path">路径</option>
            <option value="name">文件名</option>
            <option value="folder">文件夹</option>
            <option value="mtime">修改时间</option>
            <option value="tags">tag 数</option>
          </Select>
        </label>
      </div>
      <div className="flex gap-2">
        <label className="flex-1 text-xs text-fg-tertiary">
          tag 数 ≥
          <Input value={minTags} onChange={(e) => setMinTags(e.target.value)} />
        </label>
        <label className="flex-1 text-xs text-fg-tertiary">
          ≤
          <Input value={maxTags} onChange={(e) => setMaxTags(e.target.value)} />
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" onClick={handleApply}>
          应用筛选
        </Button>
        <Button size="sm" variant="ghost" onClick={handleClear}>
          清空
        </Button>
      </div>
      {filterDesc && (
        <p className="text-xs text-fg-tertiary m-0 font-mono">{filterDesc}</p>
      )}
    </section>
  )
}
