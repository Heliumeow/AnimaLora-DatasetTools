import React, { useState } from 'react'
import Button from '@repo/components/Button'
import { Input, Select } from '@repo/components/FormControl'
import { splitTags } from '../types'

interface BatchEditorPanelProps {
  selectedList: string[]
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

  // 共享的自然语言切分选项状态，供单图和批量共用
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
}

export const BatchEditorPanel: React.FC<BatchEditorPanelProps> = ({
  selectedList,
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
}) => {
  // 批量操作内部表单状态
  const [batchAddTags, setBatchAddTags] = useState('')
  const [batchPosType, setBatchPosType] = useState<'front' | 'back' | 'custom'>('back')
  const [batchPosIndex, setBatchPosIndex] = useState('0')
  const [batchMoveExisting, setBatchMoveExisting] = useState(false)
  const [batchRemoveTags, setBatchRemoveTags] = useState('')
  const [batchOldTag, setBatchOldTag] = useState('')
  const [batchNewTag, setBatchNewTag] = useState('')

  // 清洗与格式规范化配置状态
  const [cleanBom, setCleanBom] = useState(true)
  const [cleanHalfwidth, setCleanHalfwidth] = useState(false)
  const [cleanQuotes, setCleanQuotes] = useState(false)
  const [cleanCustomChars, setCleanCustomChars] = useState('')
  const [cleanCase, setCleanCase] = useState<'keep' | 'lowercase' | 'uppercase'>('keep')
  const [cleanSpacing, setCleanSpacing] = useState<
    'keep' | 'underscore_to_space' | 'space_to_underscore'
  >('keep')
  const [showSplitAdvanced, setShowSplitAdvanced] = useState(false)

  return (
    <div className="space-y-3">
      {/* 1. 添加 Tag */}
      <div className="space-y-1.5 p-2 rounded bg-sunken border border-subtle">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-fg-secondary">添加 Tag</span>
          <span className="text-2xs text-fg-tertiary">逗号分隔</span>
        </div>
        <Input
          controlSize="sm"
          value={batchAddTags}
          onChange={(e) => setBatchAddTags(e.target.value)}
          placeholder="例如: masterpiece, best quality"
          className="text-xs"
        />
        <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
          <div className="flex items-center gap-1.5 text-2xs text-fg-tertiary">
            <span>插入位置:</span>
            <Select
              controlSize="sm"
              value={batchPosType}
              onChange={(e) =>
                setBatchPosType(e.target.value as 'front' | 'back' | 'custom')
              }
              className="text-2xs"
            >
              <option value="front">最前 (开头)</option>
              <option value="back">最后 (末尾)</option>
              <option value="custom">指定索引位置</option>
            </Select>
            {batchPosType === 'custom' && (
              <Input
                controlSize="sm"
                mono
                className="w-12 text-center text-xs"
                value={batchPosIndex}
                onChange={(e) => setBatchPosIndex(e.target.value)}
                placeholder="0"
              />
            )}
            <label className="flex items-center gap-1 cursor-pointer select-none ml-1">
              <input
                type="checkbox"
                className="accent-primary rounded"
                checked={batchMoveExisting}
                onChange={(e) => setBatchMoveExisting(e.target.checked)}
              />
              <span title="若图片已含有此标签，是否移动它到新位置">重新排序已有</span>
            </label>
          </div>
          <Button
            size="xs"
            variant="primary"
            disabled={selectedList.length === 0 || !batchAddTags.trim()}
            onClick={() => {
              const pos =
                batchPosType === 'front'
                  ? 'front'
                  : batchPosType === 'custom'
                    ? parseInt(batchPosIndex, 10) || 0
                    : 'back'
              void onApplyEdit(
                'add',
                {
                  tags: splitTags(batchAddTags),
                  position: pos,
                  move_existing: batchMoveExisting,
                },
                selectedList,
              )
            }}
          >
            添加
          </Button>
        </div>
      </div>

      {/* 2. 移除 Tag */}
      <div className="space-y-1.5 p-2 rounded bg-sunken border border-subtle">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-fg-secondary">移除 Tag</span>
          <span className="text-2xs text-fg-tertiary">逗号分隔</span>
        </div>
        <div className="flex gap-1.5">
          <Input
            controlSize="sm"
            value={batchRemoveTags}
            onChange={(e) => setBatchRemoveTags(e.target.value)}
            placeholder="例如: bad hands, blurry"
            className="flex-1 text-xs"
          />
          <Button
            size="xs"
            variant="danger"
            disabled={selectedList.length === 0 || !batchRemoveTags.trim()}
            onClick={() =>
              void onApplyEdit(
                'remove',
                { tags: splitTags(batchRemoveTags) },
                selectedList,
              )
            }
          >
            移除
          </Button>
        </div>
      </div>

      {/* 3. 替换 Tag */}
      <div className="space-y-1.5 p-2 rounded bg-sunken border border-subtle">
        <span className="text-xs font-medium text-fg-secondary">替换 Tag</span>
        <div className="flex items-center gap-1.5">
          <Input
            controlSize="sm"
            value={batchOldTag}
            onChange={(e) => setBatchOldTag(e.target.value)}
            placeholder="旧标签"
            className="flex-1 text-xs"
          />
          <span className="text-xs text-fg-tertiary">→</span>
          <Input
            controlSize="sm"
            value={batchNewTag}
            onChange={(e) => setBatchNewTag(e.target.value)}
            placeholder="新标签"
            className="flex-1 text-xs"
          />
          <Button
            size="xs"
            disabled={
              selectedList.length === 0 ||
              !batchOldTag.trim() ||
              !batchNewTag.trim()
            }
            onClick={() =>
              void onApplyEdit(
                'replace',
                { old: batchOldTag.trim(), new: batchNewTag.trim() },
                selectedList,
              )
            }
          >
            替换
          </Button>
        </div>
      </div>

      {/* 4. 深度规范化清洗与格式标准化 */}
      <div className="space-y-2 p-2.5 rounded bg-sunken border border-subtle">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-fg-secondary">
            清洗规范化
          </span>
          <span className="text-2xs text-fg-tertiary">
            已选 {selectedList.length} 张
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 text-2xs text-fg-secondary">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-primary rounded"
              checked={cleanBom}
              onChange={(e) => setCleanBom(e.target.checked)}
            />
            <span>清理 BOM / 不可见字符</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-primary rounded"
              checked={cleanHalfwidth}
              onChange={(e) => setCleanHalfwidth(e.target.checked)}
            />
            <span>全角标点转半角 (如 ，（）)</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-primary rounded"
              checked={cleanQuotes}
              onChange={(e) => setCleanQuotes(e.target.checked)}
            />
            <span>剥离外层引号 (' " `)</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-2xs text-fg-tertiary shrink-0">
            剥离指定特殊字符:
          </label>
          <Input
            controlSize="sm"
            value={cleanCustomChars}
            onChange={(e) => setCleanCustomChars(e.target.value)}
            placeholder="留空不删特殊字符 (安全保留 @, #)"
            className="flex-1 text-xs"
          />
        </div>

        <div className="flex gap-2">
          <label className="flex-1 text-2xs text-fg-tertiary">
            大小写转换
            <Select
              controlSize="sm"
              value={cleanCase}
              onChange={(e) =>
                setCleanCase(
                  e.target.value as 'keep' | 'lowercase' | 'uppercase',
                )
              }
              className="w-full text-xs mt-0.5"
            >
              <option value="keep">保持原大小写</option>
              <option value="lowercase">全部小写 (lowercase)</option>
              <option value="uppercase">全部大写 (UPPERCASE)</option>
            </Select>
          </label>

          <label className="flex-1 text-2xs text-fg-tertiary">
            空格与下划线
            <Select
              controlSize="sm"
              value={cleanSpacing}
              onChange={(e) =>
                setCleanSpacing(
                  e.target.value as
                    | 'keep'
                    | 'underscore_to_space'
                    | 'space_to_underscore',
                )
              }
              className="w-full text-xs mt-0.5"
            >
              <option value="keep">保持原格式</option>
              <option value="underscore_to_space">
                下划线转空格 (_ → 空格)
              </option>
              <option value="space_to_underscore">
                空格转下划线 (空格 → _)
              </option>
            </Select>
          </label>
        </div>

        {/* 自然语言切分与识别规则多选 (方案 1 + 方案 2) */}
        <div className="pt-1 border-t border-subtle space-y-1.5">
          <div
            className="flex items-center justify-between cursor-pointer select-none"
            onClick={() => setShowSplitAdvanced((v) => !v)}
          >
            <span className="text-2xs font-semibold text-fg-secondary">
              自然语言识别规则（方案 1 + 方案 2 多选配置）
            </span>
            <span className="text-2xs text-fg-tertiary">
              {showSplitAdvanced ? '收起 ▲' : '展开自定义 ▼'}
            </span>
          </div>

          {showSplitAdvanced && (
            <div className="space-y-1.5 p-1.5 rounded bg-canvas border border-subtle">
              <label className="flex items-center gap-1.5 text-2xs font-medium text-fg-primary cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-primary rounded"
                  checked={splitEnabled}
                  onChange={(e) => setSplitEnabled(e.target.checked)}
                />
                <span>启用自然语言自动分离 (若关闭则整段作为纯 Tag 列表)</span>
              </label>
              <label className="flex items-center gap-1.5 text-2xs text-fg-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-primary rounded"
                  checked={splitMacroPatterns}
                  onChange={(e) => setSplitMacroPatterns(e.target.checked)}
                />
                <span>
                  方案 2: 宏观整句描述模式正则匹配 (Digital illustration of...)
                </span>
              </label>
              <label className="flex items-center gap-1.5 text-2xs text-fg-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-primary rounded"
                  checked={splitSyntaxDensity}
                  onChange={(e) => setSplitSyntaxDensity(e.target.checked)}
                />
                <span>
                  方案 1: 语法连词与动名词密度检测 (-ing 伴随结构/虚词)
                </span>
              </label>
              <label className="flex items-center gap-1.5 text-2xs text-fg-secondary cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-primary rounded"
                  checked={splitStarters}
                  onChange={(e) => setSplitStarters(e.target.checked)}
                />
                <span>
                  引导词开头判定 (Sentence Starters: Digital, A, Artwork...)
                </span>
              </label>
              <div className="grid grid-cols-2 gap-1.5 text-2xs text-fg-secondary">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="accent-primary rounded"
                    checked={splitNewlines}
                    onChange={(e) => setSplitNewlines(e.target.checked)}
                  />
                  <span>换行切分</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="accent-primary rounded"
                    checked={splitPeriod}
                    onChange={(e) => setSplitPeriod(e.target.checked)}
                  />
                  <span>句号独立切分</span>
                </label>
              </div>
              <div className="flex items-center gap-2 pt-0.5">
                <label className="text-2xs text-fg-tertiary shrink-0">
                  单词数阈值:
                </label>
                <Input
                  controlSize="sm"
                  mono
                  className="w-16 text-center text-xs"
                  value={splitWordThreshold}
                  onChange={(e) => setSplitWordThreshold(e.target.value)}
                  placeholder="5"
                />
                <span className="text-2xs text-fg-tertiary">
                  单片段词数达到该值时检测语法
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-2xs text-fg-tertiary shrink-0">
                  自定义引导词:
                </label>
                <Input
                  controlSize="sm"
                  className="flex-1 text-xs"
                  value={splitCustomStarters}
                  onChange={(e) => setSplitCustomStarters(e.target.value)}
                  placeholder="留空使用默认引导词库"
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-subtle">
          <span className="text-2xs text-fg-tertiary">
            不误伤 @ 和 #，仅作用于纯 Tag
          </span>
          <Button
            size="xs"
            variant="primary"
            disabled={selectedList.length === 0}
            onClick={() => {
              void onApplyEdit(
                'sanitize',
                {
                  sanitize_opts: {
                    clean_bom_and_invisible: cleanBom,
                    fullwidth_to_halfwidth: cleanHalfwidth,
                    strip_quotes: cleanQuotes,
                    strip_custom_chars: cleanCustomChars,
                    case_mode: cleanCase,
                    spacing_mode: cleanSpacing,
                    strip_whitespace: true,
                    remove_empty: true,
                  },
                },
                selectedList,
              )
            }}
          >
            批量执行清洗规范化
          </Button>
        </div>
      </div>

      {/* 5. 快捷清理 */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <Button
          size="xs"
          variant="ghost"
          disabled={selectedList.length === 0}
          onClick={() => void onApplyEdit('dedupe', {}, selectedList)}
        >
          去重（保持原顺序）
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={selectedList.length === 0}
          onClick={() =>
            void onApplyEdit(
              'sanitize',
              { sanitize_opts: { spacing_mode: 'underscore_to_space' } },
              selectedList,
            )
          }
          title="快速将选中的所有图片标签中的下划线替换为空格"
        >
          下划线转空格
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={selectedList.length === 0}
          onClick={() =>
            void onApplyEdit(
              'sanitize',
              { sanitize_opts: { spacing_mode: 'space_to_underscore' } },
              selectedList,
            )
          }
          title="快速将选中的所有图片标签中的空格替换为下划线"
        >
          空格转下划线
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={selectedList.length === 0}
          onClick={() =>
            void onApplyEdit(
              'sanitize',
              { sanitize_opts: { case_mode: 'lowercase' } },
              selectedList,
            )
          }
          title="快速将选中的所有图片标签全部转为小写"
        >
          全转小写
        </Button>
      </div>

      {/* 6. 淘汰与放回 */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-subtle">
        <span className="text-2xs text-fg-tertiary shrink-0">淘汰操作:</span>
        <Button
          size="xs"
          variant="danger"
          disabled={selectedList.length === 0}
          onClick={() => void onBatchToggleReject('reject')}
          title="将选中的图片及伴生文件批量移动到淘汰目录"
        >
          🗑️ 批量淘汰 ({selectedList.length})
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={selectedList.length === 0}
          onClick={() => void onBatchToggleReject('accept')}
          title="将选中的图片及伴生文件批量移回主训练目录"
        >
          ♻️ 批量放回 ({selectedList.length})
        </Button>
      </div>
    </div>
  )
}
