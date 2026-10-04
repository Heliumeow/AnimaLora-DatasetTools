import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { ZenFilterMode, ZenItem } from './types'

export interface TreeNode {
  key: string
  title: string
  isFolder: boolean
  folderPath: string
  fileRel?: string
  itemIndex?: number
  children: TreeNode[]
  totalCount: number
  acceptCount: number
  rejectCount: number
  status?: 'accept' | 'reject'
}

// 递归构建树结构
export function buildFolderTree(
  items: ZenItem[]
): TreeNode[] {
  // 顶层根节点聚合
  const rootNode: TreeNode = {
    key: '__root__',
    title: '全部图片',
    isFolder: true,
    folderPath: '',
    children: [],
    totalCount: 0,
    acceptCount: 0,
    rejectCount: 0,
  }

  // 文件夹路径到节点的映射表
  const folderMap = new Map<string, TreeNode>()
  folderMap.set('', rootNode)

  const getOrCreateFolderNode = (folderPath: string): TreeNode => {
    if (folderMap.has(folderPath)) {
      return folderMap.get(folderPath)!
    }

    const parts = folderPath.replace(/\\/g, '/').split('/')
    let currentPath = ''
    let parentNode = rootNode

    for (const part of parts) {
      const nextPath = currentPath ? `${currentPath}/${part}` : part
      if (!folderMap.has(nextPath)) {
        const newNode: TreeNode = {
          key: `dir:${nextPath}`,
          title: part,
          isFolder: true,
          folderPath: nextPath,
          children: [],
          totalCount: 0,
          acceptCount: 0,
          rejectCount: 0,
        }
        folderMap.set(nextPath, newNode)
        parentNode.children.push(newNode)
      }
      parentNode = folderMap.get(nextPath)!
      currentPath = nextPath
    }

    return parentNode
  }

  // 遍历所有 items 并填充文件节点
  items.forEach((item, index) => {
    // 统计计数全局累计
    const folderPath = (item.folder || '').replace(/\\/g, '/')
    const folderNode = getOrCreateFolderNode(folderPath)

    // 创建文件节点
    const fileNode: TreeNode = {
      key: `file:${item.rel}`,
      title: item.name,
      isFolder: false,
      folderPath,
      fileRel: item.rel,
      itemIndex: index,
      children: [],
      totalCount: 1,
      acceptCount: item.status === 'accept' ? 1 : 0,
      rejectCount: item.status === 'reject' ? 1 : 0,
      status: item.status,
    }

    folderNode.children.push(fileNode)
  })

  // 递归计算文件夹节点包含的数量并按名称排序
  const computeCountsAndSort = (node: TreeNode) => {
    let total = 0
    let accept = 0
    let reject = 0

    // 分离文件夹与文件，并排序
    const dirs: TreeNode[] = []
    const files: TreeNode[] = []

    for (const child of node.children) {
      if (child.isFolder) {
        computeCountsAndSort(child)
        total += child.totalCount
        accept += child.acceptCount
        reject += child.rejectCount
        dirs.push(child)
      } else {
        total += child.totalCount
        accept += child.acceptCount
        reject += child.rejectCount
        files.push(child)
      }
    }

    node.totalCount = total
    node.acceptCount = accept
    node.rejectCount = reject

    // 文件夹在前，文件在后
    dirs.sort((a, b) => a.title.localeCompare(b.title))
    files.sort((a, b) => a.title.localeCompare(b.title))
    node.children = [...dirs, ...files]
  }

  computeCountsAndSort(rootNode)

  // 如果根节点下有其他文件夹，则直接返回其子项；若全在根目录下，返回根目录自身
  if (rootNode.children.some((c) => c.isFolder)) {
    return rootNode.children
  }
  return [rootNode]
}

interface ZenFolderTreeProps {
  items: ZenItem[]
  currentItem: ZenItem | null
  filterMode: ZenFilterMode
  onSelectIndex: (index: number) => void
  isOpen: boolean
  onToggleOpen: () => void
  width?: number
}

export const ZenFolderTree: React.FC<ZenFolderTreeProps> = ({
  items,
  currentItem,
  filterMode,
  onSelectIndex,
  isOpen,
  onToggleOpen,
  width = 260,
}) => {
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(['__root__']))
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const activeNodeRef = useRef<HTMLDivElement | null>(null)

  // 构建树节点
  const treeData = useMemo(() => {
    return buildFolderTree(items)
  }, [items])

  // 当当前图片改变时，自动展开其所在的各级父文件夹
  useEffect(() => {
    if (!currentItem) return
    const folder = (currentItem.folder || '').replace(/\\/g, '/')
    if (!folder) return

    setExpandedKeys((prev) => {
      const next = new Set(prev)
      const parts = folder.split('/')
      let cur = ''
      for (const p of parts) {
        cur = cur ? `${cur}/${p}` : p
        next.add(`dir:${cur}`)
      }
      return next
    })
  }, [currentItem?.folder])

  // 当当前图片节点切换时，自动滚动至视口内部
  useEffect(() => {
    if (activeNodeRef.current && isOpen) {
      activeNodeRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      })
    }
  }, [currentItem?.rel, isOpen])

  const toggleFolder = (key: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  // 点击文件夹定位到首张有效图片
  const handleFolderClick = (node: TreeNode) => {
    const findFirstImageIndex = (n: TreeNode): number | null => {
      for (const child of n.children) {
        if (!child.isFolder && child.itemIndex !== undefined) {
          if (filterMode === 'all' || child.status === filterMode) {
            return child.itemIndex
          }
        }
        if (child.isFolder) {
          const res = findFirstImageIndex(child)
          if (res !== null) return res
        }
      }
      return null
    }

    const firstIdx = findFirstImageIndex(node)
    if (firstIdx !== null) {
      onSelectIndex(firstIdx)
    }
  }

  // 递归渲染树节点
  const renderNode = (node: TreeNode, depth = 0): React.ReactNode => {
    if (node.isFolder) {
      const isExpanded = expandedKeys.has(node.key)
      // 若当前过滤模式下该目录有效数量为 0，且设置了非 all 过滤，可选择置灰或显示
      const displayCount =
        filterMode === 'accept'
          ? node.acceptCount
          : filterMode === 'reject'
          ? node.rejectCount
          : `${node.acceptCount}/${node.totalCount}`

      return (
        <div key={node.key} style={{ userSelect: 'none' }}>
          <div
            onClick={() => handleFolderClick(node)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: `4px 8px 4px ${depth * 14 + 6}px`,
              cursor: 'pointer',
              color: '#d4d4d8',
              fontSize: '12px',
              borderRadius: '4px',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#27272a')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            {/* 折叠/展开三角按钮 */}
            <span
              onClick={(e) => toggleFolder(node.key, e)}
              style={{
                width: '18px',
                height: '18px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#a1a1aa',
                marginRight: '2px',
                fontSize: '10px',
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </span>

            <span style={{ marginRight: '6px' }}>📁</span>
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontWeight: 500,
              }}
              title={node.title}
            >
              {node.title}
            </span>

            {/* 数量统计胶囊 */}
            <span
              style={{
                fontSize: '11px',
                color: '#71717a',
                marginLeft: '6px',
                padding: '0 4px',
                borderRadius: '3px',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
              }}
            >
              ({displayCount})
            </span>
          </div>

          {/* 子节点 */}
          {isExpanded && (
            <div>
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      )
    }

    // 文件节点
    const isCurrent = currentItem?.rel === node.fileRel
    // 过滤模式隐藏
    if (filterMode !== 'all' && node.status !== filterMode) {
      return null
    }

    return (
      <div
        key={node.key}
        ref={isCurrent ? activeNodeRef : null}
        onClick={() => {
          if (node.itemIndex !== undefined) {
            onSelectIndex(node.itemIndex)
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: `4px 8px 4px ${depth * 14 + 18}px`,
          cursor: 'pointer',
          backgroundColor: isCurrent ? '#2563eb' : 'transparent',
          color: isCurrent ? '#ffffff' : '#a1a1aa',
          fontSize: '12px',
          borderRadius: '4px',
          margin: '1px 4px',
          transition: 'background 0.1s',
        }}
        onMouseEnter={(e) => {
          if (!isCurrent) e.currentTarget.style.backgroundColor = '#27272a'
        }}
        onMouseLeave={(e) => {
          if (!isCurrent) e.currentTarget.style.backgroundColor = 'transparent'
        }}
        title={node.title}
      >
        {/* 保留/淘汰小圆点指示 */}
        <span
          style={{
            display: 'inline-block',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: node.status === 'reject' ? '#ef4444' : '#22c55e',
            marginRight: '6px',
            flexShrink: 0,
          }}
        />

        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.title}
        </span>
      </div>
    )
  }

  if (!isOpen) {
    return (
      <button
        onClick={onToggleOpen}
        title="展开左侧目录树"
        style={{
          position: 'absolute',
          left: '12px',
          top: '56px',
          padding: '6px 12px',
          backgroundColor: '#27272a',
          color: '#e4e4e7',
          border: '1px solid #3f3f46',
          borderRadius: '8px',
          fontSize: '12px',
          cursor: 'pointer',
          zIndex: 6,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span>📁</span>
        <span>目录树</span>
      </button>
    )
  }

  return (
    <div
      className="zen-scrollable"
      style={{
        width: `${width}px`,
        minWidth: '160px',
        maxWidth: '50vw',
        height: '100%',
        backgroundColor: '#141416',
        borderRight: '1px solid #27272a',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '13px',
        color: '#f4f4f5',
        flexShrink: 0,
        zIndex: 6,
      }}
    >
      {/* 顶部标题栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          borderBottom: '1px solid #27272a',
          backgroundColor: '#1b1b1e',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>📁</span>
          <strong style={{ fontSize: '13px' }}>文件目录</strong>
        </div>

        <button
          onClick={onToggleOpen}
          title="收起目录树"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#71717a',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '2px 6px',
          }}
        >
          ❮
        </button>
      </div>

      {/* 滚动内容区 */}
      <div
        ref={treeContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '8px 4px',
        }}
      >
        {treeData.map((node) => renderNode(node, 0))}
      </div>
    </div>
  )
}
