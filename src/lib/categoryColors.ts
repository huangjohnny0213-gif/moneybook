/** 一次顏色變更。 */
export interface ColorChange {
  id: string
  color: string
}

/** swapCategoryColor 需要的欄位，只要形狀對得上就能傳進來。 */
interface Colored {
  id: string
  color: string
}

/**
 * 把某個分類換成指定顏色，若該顏色已被別的分類佔用則兩邊對調。
 *
 * 色盤只有八個色階，而預設分類正好八類，所以任何一次換色幾乎必然撞色。
 * 對調可以維持「每類一色、互不重複」這個不變量，也省得使用者自己去把
 * 被佔走的那一類再改掉。
 *
 * @returns 需要寫回資料庫的變更，沒有變更時是空陣列
 */
export function swapCategoryColor(
  categories: readonly Colored[],
  targetId: string,
  newColor: string,
): ColorChange[] {
  const target = categories.find((c) => c.id === targetId)
  if (!target || target.color === newColor) return []

  const occupant = categories.find(
    (c) => c.color === newColor && c.id !== targetId,
  )

  const changes: ColorChange[] = [{ id: targetId, color: newColor }]
  if (occupant) changes.push({ id: occupant.id, color: target.color })

  return changes
}
