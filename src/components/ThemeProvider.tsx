import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { darkStepOf } from '../lib/palette'
import {
  applyTheme,
  readThemePref,
  resolveTheme,
  saveThemePref,
  type ThemePref,
} from '../lib/theme'
import { ThemeContext, type ThemeValue } from './themeContext'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readThemePref)
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia(DARK_QUERY).matches,
  )

  // 使用者在 App 開著的時候改了 iOS 的外觀設定，這裡要跟著變。
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved = resolveTheme(pref, systemDark)

  useEffect(() => {
    applyTheme(resolved)
  }, [resolved])

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next)
    saveThemePref(next)
  }, [])

  const value = useMemo<ThemeValue>(
    () => ({
      pref,
      resolved,
      setPref,
      // 深色那組不是淺色的自動反轉，是為深色底另外選過的同八個色相。
      seriesColor: (lightHex) =>
        resolved === 'dark' ? darkStepOf(lightHex) : lightHex,
    }),
    [pref, resolved, setPref],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}
