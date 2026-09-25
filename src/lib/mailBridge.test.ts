import { describe, expect, test } from 'vitest'
import {
  bridgeRequestUrl,
  checkBridgeUrl,
  parseBridgeResponse,
  syncSince,
} from './mailBridge'

const EXEC_URL = 'https://script.google.com/macros/s/AKfake123/exec'
const DAY = 86_400_000

describe('syncSince', () => {
  const now = Date.UTC(2026, 8, 25)

  test('第一次同步往回抓七天', () => {
    expect(syncSince(undefined, now)).toBe(now - 7 * DAY)
  })

  test('之後從上次同步的時間再往回兩天，信晚到也不會漏', () => {
    const syncedAt = now - DAY
    expect(syncSince(syncedAt, now)).toBe(syncedAt - 2 * DAY)
  })
})

describe('checkBridgeUrl', () => {
  test('部署後的 /exec 網址通過', () => {
    expect(checkBridgeUrl(EXEC_URL)).toBeNull()
    expect(checkBridgeUrl(`  ${EXEC_URL}  `)).toBeNull()
  })

  test('不是網址', () => {
    expect(checkBridgeUrl('abc')).toMatch(/不是一個網址/)
  })

  test('別的網站不收：密碼會跟著請求送出去', () => {
    expect(checkBridgeUrl('https://example.com/macros/s/x/exec')).toMatch(
      /script\.google\.com/,
    )
    expect(checkBridgeUrl('http://script.google.com/macros/s/x/exec')).toMatch(
      /script\.google\.com/,
    )
  })

  test('編輯器網址與 /dev 網址擋下來', () => {
    expect(
      checkBridgeUrl('https://script.google.com/home/projects/x/edit'),
    ).toMatch(/exec/)
    expect(checkBridgeUrl('https://script.google.com/macros/s/x/dev')).toMatch(
      /exec/,
    )
  })
})

describe('bridgeRequestUrl', () => {
  test('帶上密碼與起始時間', () => {
    const url = new URL(bridgeRequestUrl(EXEC_URL, ' secret ', 1234.9))
    expect(url.origin + url.pathname).toBe(EXEC_URL)
    expect(url.searchParams.get('token')).toBe('secret')
    expect(url.searchParams.get('since')).toBe('1234')
  })

  test('密碼裡的特殊字元會被編碼', () => {
    const url = bridgeRequestUrl(EXEC_URL, 'a&b=c', 0)
    expect(new URL(url).searchParams.get('token')).toBe('a&b=c')
  })
})

describe('parseBridgeResponse', () => {
  const mail = { id: 'm1', receivedAt: 1, subject: '扣款通知', body: '內文' }

  test('正常的回應', () => {
    const text = JSON.stringify({ ok: true, now: 99, mails: [mail] })
    expect(parseBridgeResponse(text)).toEqual({ now: 99, mails: [mail] })
  })

  test('格式不對的信丟掉，其餘照收', () => {
    const text = JSON.stringify({
      ok: true,
      now: 99,
      mails: [mail, { id: '', receivedAt: 1, subject: '', body: '' }, null, 'x'],
    })
    expect(parseBridgeResponse(text).mails).toEqual([mail])
  })

  test('密碼錯誤給看得懂的訊息', () => {
    const text = JSON.stringify({ ok: false, error: 'unauthorized' })
    expect(() => parseBridgeResponse(text)).toThrow(/密碼不對/)
  })

  test('回來的是 HTML 登入頁時，提示部署權限', () => {
    expect(() => parseBridgeResponse('<!DOCTYPE html><html>')).toThrow(/所有人/)
  })

  test('缺欄位', () => {
    expect(() => parseBridgeResponse(JSON.stringify({ ok: true }))).toThrow(
      /格式不對/,
    )
    expect(() => parseBridgeResponse('[]')).toThrow(/格式不對/)
  })
})
