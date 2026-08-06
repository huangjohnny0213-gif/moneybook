/**
 * 分類要顯示的符號需要的兩個純函式。
 *
 * 刻意不從 db/schema 匯入 Category，改用結構型別：lib 不該反向依賴 db。
 */

/** categoryGlyph 需要的欄位，只要形狀對得上就能傳進來。 */
interface Nameable {
  emoji: string
  name: string
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/**
 * 取字串的第一個「字位群集」，也就是使用者眼中的一個字。
 *
 * 不能用 text[0]（切出半個代理對變亂碼）也不能用 Array.from(text)[0]
 * （只取到第一個碼點，會把 👨‍👩‍👧 切成 👨、把 🇹🇼 切成一個字母方框）。
 * 一個 emoji 動輒由好幾個碼點以零寬連接符組成，只有 Intl.Segmenter 切得對。
 */
export function firstGrapheme(text: string): string {
  return segmenter.segment(text)[Symbol.iterator]().next().value?.segment ?? ''
}

/**
 * 分類要顯示的符號：有 emoji 就用 emoji，沒有就退回名稱首字。
 *
 * 預設分類的 emoji 是空的，由使用者之後在分類設定裡自己挑。
 * 退回首字讓 App 在那之前就完全可用（「飲食」顯示「飲」），
 * 而不是先看到一排無意義的佔位符號。
 */
export function categoryGlyph(category: Nameable): string {
  const emoji = category.emoji.trim()
  return emoji === '' ? firstGrapheme(category.name) : firstGrapheme(emoji)
}
