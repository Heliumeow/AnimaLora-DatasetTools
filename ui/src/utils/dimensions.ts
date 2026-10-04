/**
 * 图片宽高与比例解析工具
 */

export interface AspectRatioInfo {
  desc: string
  ratio: number
  isExtreme: boolean
  isLowRes: boolean
  shortEdge: number
}

/**
 * 分析给定的像素宽高，匹配常用宽高比，检测是否过窄过宽或低分辨率
 */
export function analyzeDimensions(
  w: number,
  h: number,
  minShortEdge = 1024
): AspectRatioInfo {
  if (!w || !h) {
    return { desc: '', ratio: 1, isExtreme: false, isLowRes: false, shortEdge: 0 }
  }
  const ratio = w / h
  const common = [
    [1, 1],
    [4, 3],
    [3, 4],
    [16, 9],
    [9, 16],
    [3, 2],
    [2, 3],
    [21, 9],
    [9, 21],
    [5, 4],
    [4, 5],
  ]
  let closest = common[0]
  let minDiff = Infinity
  for (const p of common) {
    const diff = Math.abs(p[0] / p[1] - ratio)
    if (diff < minDiff) {
      minDiff = diff
      closest = p
    }
  }
  const desc = minDiff < 0.04 ? `${closest[0]}:${closest[1]}` : `${ratio.toFixed(2)}:1`
  const isExtreme = ratio > 2.3 || ratio < 0.43
  const shortEdge = Math.min(w, h)
  const isLowRes = shortEdge < minShortEdge
  return { desc, ratio, isExtreme, isLowRes, shortEdge }
}
