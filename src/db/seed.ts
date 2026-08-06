import { categoryColorAt } from '../lib/palette'
import { db, type Category } from './schema'

/**
 * 首次啟動時寫入的預設分類。
 *
 * id 刻意使用固定的英文 slug 而非 crypto.randomUUID()：
 * 換手機時要靠匯出的備份檔還原，新裝置會先 seed 出自己的一份分類。
 * id 若是隨機產生的，備份裡每一筆交易的 categoryId 都會對不上新裝置的分類，
 * 還原後整份報表會變成「未知分類」。固定 slug 才能讓兩邊接得起來。
 *
 * emoji 與 color 一律留空，由 seed 與畫面層補：
 * - color 在寫入資料庫時從色盤依序取（見 seedCategoriesIfEmpty）
 * - emoji 沒設定時顯示名稱首字（見 lib/glyph.ts 的 categoryGlyph）
 * 兩者都能在 App 的分類設定裡自己改。
 *
 * 支出 6 類加收入 2 類剛好用滿色盤的 8 個色階，每一類都有自己的顏色。
 * 「其他」在支出與收入各有一個，名稱相同但 id 必須不同，否則後寫入的會覆蓋前一個。
 */
export const DEFAULT_CATEGORIES: readonly Category[] = [
  { id: 'food', name: '飲食', type: 'expense', emoji: '', color: '', sortOrder: 1, archived: false },
  { id: 'transport', name: '交通', type: 'expense', emoji: '', color: '', sortOrder: 2, archived: false },
  { id: 'clothing', name: '衣著', type: 'expense', emoji: '', color: '', sortOrder: 3, archived: false },
  { id: 'entertainment', name: '娛樂', type: 'expense', emoji: '', color: '', sortOrder: 4, archived: false },
  // 分類，不是機制。日後的定期支出規則多半會把 categoryId 指向這一類。
  { id: 'fixed', name: '固定支出', type: 'expense', emoji: '', color: '', sortOrder: 5, archived: false },
  { id: 'other-expense', name: '其他', type: 'expense', emoji: '', color: '', sortOrder: 6, archived: false },
  { id: 'salary', name: '薪水', type: 'income', emoji: '', color: '', sortOrder: 1, archived: false },
  { id: 'other-income', name: '其他', type: 'income', emoji: '', color: '', sortOrder: 2, archived: false },
]

/**
 * 資料庫還沒有任何分類時才寫入預設值，已經有就原封不動。
 *
 * 判斷條件刻意是「categories 表為空」，而不是逐筆檢查每個預設分類存不存在。
 * 逐筆檢查會在每次開 App 時把使用者刪掉或封存的分類硬塞回來，
 * 變成一個怎麼趕都趕不走的 bug。
 *
 * 顏色在這裡就定死成具體 hex 存進資料庫，而不是每次渲染依當下的清單位置即時計算。
 * 顏色必須跟著分類本身走，不能跟著它在清單裡的名次走 —— 否則使用者封存一類之後，
 * 後面每一類的顏色都會往前遞補、整片重新著色，看起來就像壞掉。
 *
 * 整段包在同一個 rw 交易裡，避免兩處同時呼叫時各寫入一份。
 *
 * @returns 這次是否真的有寫入
 */
export async function seedCategoriesIfEmpty(): Promise<boolean> {
  return db.transaction('rw', db.categories, async () => {
    if ((await db.categories.count()) > 0) return false

    const colored = DEFAULT_CATEGORIES.map((category, index) => ({
      ...category,
      color: category.color || categoryColorAt(index),
    }))
    await db.categories.bulkAdd(colored)
    return true
  })
}
