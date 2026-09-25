import { daysInMonth, toISODate } from './dates'
import { formatAmount, toMinor } from './money'

/**
 * 郵局通知信的解析。
 *
 * 純函式，不碰網路也不碰資料庫：Apps Script 那端只負責把信原封不動交過來，
 * 看懂信的邏輯全部放在這裡。這樣郵局改了信件格式時只要改這個檔案、跑測試、
 * 重新部署 App；Apps Script 部署在使用者自己的 Google 帳號裡，改一次要他
 * 自己動手，越少碰越好。
 *
 * 認得三種信，都是從郵局帳戶扣錢的：
 * - 連結帳戶付款：LINE Pay 這類電子支付綁郵局帳戶扣款。信裡**沒有店名**，
 *   只有支付平台，所以分類只能由使用者自己選。
 * - 行動郵局轉帳：Taiwan Pay 掃碼轉帳也是這一種。附言是唯一的線索。
 * - 全國性繳費：繳信用卡費、帳單。繳卡費本身可能不算花費（刷卡時已經記過），
 *   這由使用者在待確認清單裡自己決定要不要略過。
 */

/** Apps Script 交過來的一封信。 */
export interface MailMessage {
  /** Gmail 的訊息 id，重複同步時靠它去重。 */
  id: string
  receivedAt: number
  subject: string
  body: string
}

export type PaymentKind = 'wallet' | 'transfer' | 'bill'

export interface ParsedPayment {
  kind: PaymentKind
  amountMinor: number
  /** 'YYYY-MM-DD'，取信件內文的交易日，不是收信日。 */
  date: string
  /** 顯示用的一句話，確認後會成為那筆帳的備註。 */
  label: string
}

/** 郵局信裡寫的是支付公司的公司名，換成使用者在手機上看到的品牌名。 */
const WALLET_NAMES: [keyword: string, name: string][] = [
  ['連加', 'LINE Pay'],
  ['街口', '街口支付'],
  ['全支付', '全支付'],
]

// 同一封信裡冒號有全形也有半形，前後的空白也不固定。
const SEP = String.raw`\s*[：:]\s*`
const NUM = String.raw`([\d,]+(?:\.\d+)?)`

/** 解析一封郵局通知信。看不懂或找不到金額時回傳 null，不猜。 */
export function parsePostalMail(mail: MailMessage): ParsedPayment | null {
  const text = toPlainText(mail.body)
  const fallbackDate = toISODate(new Date(mail.receivedAt))

  if (text.includes('繳費交易結果') || mail.subject.includes('繳費通知')) {
    return parseBill(text, fallbackDate)
  }
  if (text.includes('連結帳戶付款')) return parseWallet(text, fallbackDate)
  if (text.includes('轉帳金額')) return parseTransfer(text, fallbackDate)
  return null
}

function parseWallet(text: string, fallbackDate: string): ParsedPayment | null {
  const amountMinor = amountOf(text, `交易金額${SEP}${NUM}\\s*元`)
  if (amountMinor <= 0) return null

  const date = text.match(
    /交易日期\s*[：:]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
  )
  const platform = text.match(/交易平台\s*[：:]\s*([^\s(（]+)/)?.[1] ?? ''
  const label =
    WALLET_NAMES.find(([keyword]) => platform.includes(keyword))?.[1] ??
    (platform || '電子支付')

  return {
    kind: 'wallet',
    amountMinor,
    date: (date && toDate(date[1], date[2], date[3])) || fallbackDate,
    label,
  }
}

function parseTransfer(
  text: string,
  fallbackDate: string,
): ParsedPayment | null {
  const amountMinor = amountOf(text, `轉帳金額${SEP}${NUM}`)
  if (amountMinor <= 0) return null
  const feeMinor = amountOf(text, `手續費${SEP}${NUM}`)

  const date = text.match(
    /完成時間\s*[：:]\s*(\d{2,4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
  )
  // 給自己的附言優先：那是使用者為了記帳寫的，給對方的常常只是一句客套。
  const memo = memoOf(text, '給自己') || memoOf(text, '給對方')

  return {
    kind: 'transfer',
    amountMinor: amountMinor + feeMinor,
    date: (date && toDate(date[1], date[2], date[3])) || fallbackDate,
    label: withFee(memo ? `轉帳：${memo}` : '轉帳', feeMinor),
  }
}

function parseBill(text: string, fallbackDate: string): ParsedPayment | null {
  const amountMinor = amountOf(text, `交易金額${SEP}${NUM}\\s*元`)
  if (amountMinor <= 0) return null
  const feeMinor = amountOf(text, `手續費${SEP}${NUM}`)

  const date = text.match(
    /完成時間\s*[：:]\s*(\d{2,4})\/(\d{1,2})\/(\d{1,2})/,
  )
  // 「812 / 台新銀行」只取名稱，銀行代碼對使用者沒有意義。
  const payee = text.match(/轉入行庫\s*[：:]\s*(?:\d+\s*\/\s*)?([^\s\d/]+)/)?.[1]

  return {
    kind: 'bill',
    amountMinor: amountMinor + feeMinor,
    date: (date && toDate(date[1], date[2], date[3])) || fallbackDate,
    label: withFee(payee ? `繳費：${payee}` : '繳費', feeMinor),
  }
}

/**
 * 去掉 HTML 標籤，保留換行。
 *
 * Apps Script 的 getPlainBody() 通常已經是純文字，這裡是保險：郵局的信是
 * HTML 表格，萬一哪天拿到的是原始 HTML，儲存格之間也要斷得開。
 */
function toPlainText(body: string): string {
  return body
    .replace(/<br\s*\/?>|<\/(?:p|div|tr|td|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t　]+/g, ' ')
}

/** 找不到時回傳 0。金額換算一律交給 money.ts。 */
function amountOf(text: string, pattern: string): number {
  const found = text.match(new RegExp(pattern))?.[1]
  return found ? toMinor(found) : 0
}

/**
 * 取某一欄附言。
 *
 * 冒號後面只吃同一行的空白：附言是空的時候，吃到換行就會把下一行的內容
 * 當成附言。結尾停在下一個欄位名稱或換行 —— 有的信所有欄位擠在同一行，
 * 有的一欄一行，兩種都要能切開。
 */
function memoOf(text: string, whom: '給自己' | '給對方'): string {
  const pattern = new RegExp(
    `附言[(（]${whom}[)）][ \\t]*[：:][ \\t]*([^\\n]*?)` +
      String.raw`(?=\s*(?:完成時間|附言|交易序號|如有任何疑問)|[ \t]*\n|[ \t]*$)`,
  )
  return text.match(pattern)?.[1].trim() ?? ''
}

function withFee(label: string, feeMinor: number): string {
  return feeMinor > 0 ? `${label}（含手續費 ${formatAmount(feeMinor)}）` : label
}

/** 民國年換成西元，不存在的日期回傳 null。 */
function toDate(y: string, m: string, d: string): string | null {
  const rawYear = Number(y)
  const year = rawYear < 1911 ? rawYear + 1911 : rawYear
  const month = Number(m)
  const day = Number(d)
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
