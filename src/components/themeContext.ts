import { createContext, useContext } from 'react'
import type { ResolvedTheme, ThemePref } from '../lib/theme'

export interface ThemeValue {
  pref: ThemePref
  resolved: ResolvedTheme
  setPref: (pref: ThemePref) => void
  /** 把資料庫裡的分類色換成當前主題該用的那一階。 */
  seriesColor: (lightHex: string) => string
}

/**
 * 與 ThemeProvider 分開放。
 * 同一個檔案同時匯出元件與非元件會讓 Vite 的 Fast Refresh 失效，
 * 改一行樣式就整頁重載、輸入到一半的內容全沒了。
 */
export const ThemeContext = createContext<ThemeValue | null>(null)

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme 必須用在 ThemeProvider 之內')
  return value
}
