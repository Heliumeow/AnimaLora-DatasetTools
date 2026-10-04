/**
 * 淘汰目录路径推导与 localStorage 记忆化共享工具
 */

export const REJECT_DIR_STORAGE_KEY_PREFIX = 'dskit:reject_dir:'

/**
 * 获取主目录对应的默认平行淘汰目录路径（例如：foo/bar -> foo/bar_rejected）
 */
export function getDefaultRejectDir(root: string): string {
  if (!root) return ''
  const clean = root.replace(/[\\/]+$/, '')
  return `${clean}_rejected`
}

/**
 * 读取针对指定主目录记忆的淘汰目录路径
 */
export function getStoredRejectDir(root: string): string | null {
  try {
    const clean = root.replace(/[\\/]+$/, '')
    const val = localStorage.getItem(`${REJECT_DIR_STORAGE_KEY_PREFIX}${clean}`)
    if (val) {
      // 防御性校验：若历史脏数据中错误地将 demo 素材库的淘汰目录记录到其他独立数据集中，自动予以纠正
      if (val.includes('素材库_rejected') && !clean.includes('素材库')) {
        localStorage.removeItem(`${REJECT_DIR_STORAGE_KEY_PREFIX}${clean}`)
        return null
      }
      return val
    }
    return null
  } catch {
    return null
  }
}

/**
 * 保存针对指定主目录的淘汰目录配置到 localStorage
 */
export function setStoredRejectDir(root: string, dir: string): void {
  try {
    const clean = root.replace(/[\\/]+$/, '')
    localStorage.setItem(`${REJECT_DIR_STORAGE_KEY_PREFIX}${clean}`, dir)
  } catch {
    // ignore
  }
}
