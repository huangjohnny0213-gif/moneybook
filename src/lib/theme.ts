/**
 * 主題偏好。
 *
 * 這是全專案唯一不走 db/repo.ts 的資料，存在 localStorage：
 * IndexedDB 是非同步的，等它讀完再套用時第一幀已經畫出去了，每次開 App 都會
 * 閃一下錯的顏色。localStorage 是同步的，index.html 的行內腳本可以在首次繪製前
 * 就把 data-theme 掛上去。
 */

export type ThemePref = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/** localStorage 的鍵名。index.html 的行內腳本也寫死了同一個字串。 */
export const THEME_KEY = 'moneybook.theme'

const PREFS: ThemePref[] = ['system', 'light', 'dark']

/** 把讀到的字串轉成偏好值。不認得的一律回到跟隨系統。 */
export function parseThemePref(raw: string | null): ThemePref {
  return PREFS.includes(raw as ThemePref) ? (raw as ThemePref) : 'system'
}

/** 把偏好與系統設定合成實際要套用的主題。 */
export function resolveTheme(
  pref: ThemePref,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (pref !== 'system') return pref
  return systemPrefersDark ? 'dark' : 'light'
}

/** 讀出已儲存的偏好。localStorage 在 Safari 的無痕模式會丟例外。 */
export function readThemePref(): ThemePref {
  try {
    return parseThemePref(localStorage.getItem(THEME_KEY))
  } catch {
    return 'system'
  }
}

/** 存下偏好。存不進去就算了，主題不值得為它中斷操作。 */
export function saveThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(THEME_KEY, pref)
  } catch {
    // 無痕模式寫不進去，這一次的選擇就只在本次開啟期間有效。
  }
}

/**
 * 把解析後的主題掛到 <html> 上。
 *
 * 掛的是「解析後」的結果而不是偏好本身，CSS 才只需要處理 light 與 dark 兩種狀態，
 * 不必在 media query 裡再重複一份深色變數。
 */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme

  // 全螢幕模式下這個顏色是狀態列的底色，不跟著改會露出一條反差色的橫帶。
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', theme === 'dark' ? '#121211' : '#fcfcfb')
}
