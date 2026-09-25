import type { MailMessage } from './postalMail'

/**
 * 和 Apps Script 之間的約定：要怎麼問、回來的東西長怎樣。
 *
 * 純函式，不發請求。真正呼叫 fetch 的是 db/mailSync.ts，這裡只負責
 * 組網址與把回應驗過一遍 —— 回應來自網路，格式不對時要給一句看得懂的話，
 * 而不是讓 undefined 一路流進資料庫。
 */

export interface BridgeResponse {
  /** Apps Script 那端的現在時間，下次同步從這裡往回算。 */
  now: number
  mails: MailMessage[]
}

const DAY = 86_400_000

/** 第一次同步往回抓幾天。更早的帳多半已經手記過了，抓回來只是多一堆要略過的。 */
export const FIRST_SYNC_DAYS = 7

/**
 * 之後每次同步都比上次多往回抓幾天。
 *
 * 信偶爾會晚到，只從上次的時間點接著抓會漏掉那幾封。重疊抓到的信
 * 靠 Gmail 的訊息 id 去重，多抓不會變成重複記帳。
 */
export const OVERLAP_DAYS = 2

/** 這次同步要從哪個時間點開始抓。 */
export function syncSince(syncedAt: number | undefined, now: number): number {
  return syncedAt ? syncedAt - OVERLAP_DAYS * DAY : now - FIRST_SYNC_DAYS * DAY
}

/**
 * 檢查使用者貼進來的網址，回傳錯誤訊息，沒問題時回傳 null。
 *
 * 要求結尾是 /exec：Apps Script 編輯器的網址與測試用的 /dev 網址都長得很像，
 * 但只有部署後的 /exec 能讓沒登入 Google 的請求進來。貼錯的話回來的是
 * 一頁登入畫面，錯誤訊息會很難懂，所以在存檔前就擋下來。
 */
export function checkBridgeUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return '這不是一個網址。'
  }
  if (url.protocol !== 'https:' || url.hostname !== 'script.google.com') {
    return '網址要是 https://script.google.com/ 開頭。'
  }
  if (!url.pathname.endsWith('/exec')) {
    return '要貼部署後拿到、結尾是 /exec 的那個網址。'
  }
  return null
}

/**
 * 組出請求網址。
 *
 * 密碼放在網址參數而不是 header：自訂 header 會觸發 CORS 預檢，
 * 而 Apps Script 不回應預檢請求，放 header 的話請求根本送不出去。
 */
export function bridgeRequestUrl(
  base: string,
  token: string,
  since: number,
): string {
  const url = new URL(base.trim())
  url.searchParams.set('token', token.trim())
  url.searchParams.set('since', String(Math.floor(since)))
  return url.toString()
}

/**
 * 這個 HTTP 狀態值不值得隔幾秒再試一次。
 *
 * Apps Script 的回應要經 script.googleusercontent.com 轉一手，那一站會隨機回 404
 * 或整個卡住，同一個網址過幾秒再打就好了（2026-09 實測連打十次只成功四次）。
 * 網址真的貼錯時 Google 回的 404 不帶 CORS 標頭，瀏覽器根本讀不到狀態碼、
 * 只會丟 TypeError，所以 App 讀得到的 404 幾乎都是那種暫時性的。
 */
export function isTransientStatus(status: number): boolean {
  return status === 404 || status === 408 || status === 429 || status >= 500
}

/** 解析 Apps Script 的回應。錯誤訊息寫成可以直接顯示給使用者的句子。 */
export function parseBridgeResponse(text: string): BridgeResponse {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    // 最常見的原因：部署時「誰可以存取」沒選「所有人」，回來的是 Google 登入頁。
    throw new Error(
      'Apps Script 回傳的不是資料。請確認部署時「誰可以存取」選的是「所有人」。',
    )
  }

  if (!isRecord(raw)) throw new Error('Apps Script 的回應格式不對。')

  if (raw.ok !== true) {
    if (raw.error === 'unauthorized') {
      throw new Error('密碼不對。App 裡的密碼要和 Apps Script 的 TOKEN 一模一樣。')
    }
    throw new Error(`Apps Script 回報錯誤：${String(raw.error ?? '未知')}`)
  }

  if (typeof raw.now !== 'number' || !Array.isArray(raw.mails)) {
    throw new Error('Apps Script 的回應格式不對。')
  }

  return {
    now: raw.now,
    mails: raw.mails.filter(isMail),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMail(value: unknown): value is MailMessage {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id !== '' &&
    typeof value.receivedAt === 'number' &&
    typeof value.subject === 'string' &&
    typeof value.body === 'string'
  )
}
