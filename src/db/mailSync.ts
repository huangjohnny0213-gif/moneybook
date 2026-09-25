import {
  bridgeRequestUrl,
  isTransientStatus,
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
  /** 兩次嘗試之間等多久。測試時設成 0。 */
  retryDelayMs?: number
}

/** 一次同步最多打幾次。Google 那端的失敗多半幾秒後就好，見 isTransientStatus。 */
const MAX_ATTEMPTS = 3

/** 單次請求最多等多久。正常時一到十秒；卡住的請求不會自己失敗，會一直掛著。 */
const TIMEOUT_MS = 20_000

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
  const { fetchImpl = fetch, now = Date.now(), retryDelayMs = 2_000 } = options
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
    response = parseBridgeResponse(
      await fetchWithRetry(fetchImpl, url, retryDelayMs),
    )
  } catch (error) {
    const message =
      // fetch 本身失敗（沒網路、網址不存在、被擋）丟的是 TypeError，
      // 瀏覽器給的訊息像 "Load failed"，對使用者沒有意義。
      error instanceof TypeError
        ? '連不上 Apps Script。手機有網路的話，檢查網址有沒有貼錯。'
        : isTimeout(error)
          ? 'Apps Script 太久沒回應，試了三次都一樣。下次打開 App 會再試。'
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

/**
 * 打 Apps Script 並回傳回應內文，暫時性的失敗自動重試。
 *
 * 只重試「再打一次可能就好」的失敗：連線錯誤、逾時、isTransientStatus 認定的狀態碼。
 * 密碼錯誤是 200 回來的 JSON，不會走到這裡的重試；再試幾次答案也一樣。
 * 重試是安全的：Apps Script 只讀信，打幾次都不會改到任何東西。
 */
async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  retryDelayMs: number,
): Promise<string> {
  let lastError: unknown
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await wait(retryDelayMs)

    let res: Response
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (error) {
      lastError = error
      continue
    }
    if (res.ok) return res.text()

    if (!isTransientStatus(res.status)) {
      throw new Error(`Apps Script 回應錯誤（HTTP ${res.status}）。`)
    }
    lastError = new Error(
      `Google 那端暫時出錯（HTTP ${res.status}），試了三次都沒成功。` +
        '稍後按「立即同步」，或下次打開 App 會再試。',
    )
  }
  throw lastError
}

function isTimeout(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'TimeoutError'
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
