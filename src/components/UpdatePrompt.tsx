import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * 新版本提示。
 *
 * 這個元件同時肩負一件不顯眼但更重要的事：**它是全 App 唯一註冊 service worker
 * 的地方**。沒有它，manifest 與 sw.js 都會被產出來卻沒人載入，裝到主畫面後
 * 一進飛航模式就是一片白。
 *
 * 更新採 prompt 而非 autoUpdate：自動更新會在使用者正在打金額的時候整頁換掉，
 * 記到一半的帳直接消失。寧可讓他自己挑時間按。
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="flex items-center gap-2 border-t border-hairline bg-key px-4 py-2.5">
      <p className="flex-1 text-xs text-ink-2">有新版本可以更新</p>
      <button
        type="button"
        // 傳 true 會在新的 service worker 接管後自動 reload，
        // 不然使用者按了會以為沒反應，得自己下拉重新整理。
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-surface"
      >
        更新
      </button>
    </div>
  )
}
