import {
  bridgeRequestUrl,
  parseBridgeResponse,
  syncSince,
} from '../lib/mailBridge'
import { parsePostalMail } from '../lib/postalMail'
import {
  getSettings,
  ingestMailImports,
  recordMailSyncError,
} from './repo'

export type SyncResult =
  | { status: 'off' }
  | { status: 'ok'; added: number; unreadable: number }
  | { status: 'error'; message: string }

interface SyncOptions {
  /** 測試時換成假的 fetch。 */
  fetchImpl?: typeof fetch
  now?: number
}

/**
 * 向 Apps Script 要新的郵局通知信，解析後存成待確認。
 *
 * 沒設定網址時什麼都不做：這是選配功能，App 的其餘部分不能依賴它。
 * 失敗時不丟例外，把原因存進設定讓設定頁顯示 —— 呼叫端多半是開 App 時
 * 在背景觸發的，沒有人在等這個 Promise。
 */
export async function syncMailImports(
  options: SyncOptions = {},
): Promise<SyncResult> {
  const { fetchImpl = fetch, now = Date.now() } = options
  const settings = await getSettings()
  if (!settings.mailBridgeUrl || !settings.mailBridgeToken) {
    return { status: 'off' }
  }

  let response
  try {
    const url = bridgeRequestUrl(
      settings.mailBridgeUrl,
      settings.mailBridgeToken,
      syncSince(settings.mailSyncedAt, now),
    )
    const res = await fetchImpl(url)
    if (!res.ok) throw new Error(`Apps Script 回應錯誤（HTTP ${res.status}）。`)
    response = parseBridgeResponse(await res.text())
  } catch (error) {
    const message =
      // fetch 本身失敗（沒網路、網址不存在、被擋）丟的是 TypeError，
      // 瀏覽器給的訊息像 "Load failed"，對使用者沒有意義。
      error instanceof TypeError
        ? '連不上 Apps Script。手機有網路的話，檢查網址有沒有貼錯。'
        : error instanceof Error
          ? error.message
          : String(error)
    await recordMailSyncError(message)
    return { status: 'error', message }
  }

  const rows = []
  const unreadable: string[] = []
  for (const mail of response.mails) {
    const parsed = parsePostalMail(mail)
    if (parsed) rows.push({ id: mail.id, receivedAt: mail.receivedAt, ...parsed })
    else unreadable.push(mail.subject)
  }

  const added = await ingestMailImports(rows, response.now, unreadable)
  return { status: 'ok', added, unreadable: unreadable.length }
}
