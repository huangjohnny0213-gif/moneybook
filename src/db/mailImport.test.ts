import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import { db, type MailImport } from './schema'
import { syncMailImports } from './mailSync'
import {
  clearMailBridge,
  confirmMailImport,
  dismissMailImport,
  getSettings,
  ingestMailImports,
  listImportCategoryHints,
  listPendingImports,
  saveMailBridge,
} from './repo'

const DAY = 86_400_000
const EXEC_URL = 'https://script.google.com/macros/s/AKfake/exec'

function row(
  id: string,
  overrides: Partial<Omit<MailImport, 'status'>> = {},
): Omit<MailImport, 'status'> {
  return {
    id,
    receivedAt: 1000,
    kind: 'wallet',
    amountMinor: 10000,
    date: '2026-09-10',
    label: 'LINE Pay',
    ...overrides,
  }
}

beforeEach(async () => {
  await Promise.all([
    db.transactions.clear(),
    db.settings.clear(),
    db.mailImports.clear(),
  ])
})

describe('ingestMailImports', () => {
  test('新的付款存成待確認，並記下同步時間', async () => {
    const added = await ingestMailImports([row('a'), row('b')], 5000, ['登入通知'])
    expect(added).toBe(2)
    expect((await listPendingImports()).map((r) => r.id).sort()).toEqual(['a', 'b'])

    const settings = await getSettings()
    expect(settings.mailSyncedAt).toBe(5000)
    expect(settings.mailUnreadable).toEqual(['登入通知'])
  })

  test('已經存在的不論狀態都不覆寫，略過的不會跑回來', async () => {
    await ingestMailImports([row('a')], 1, [])
    await dismissMailImport('a')

    const added = await ingestMailImports([row('a', { amountMinor: 1 })], 2, [])
    expect(added).toBe(0)
    const stored = await db.mailImports.get('a')
    expect(stored?.status).toBe('dismissed')
    expect(stored?.amountMinor).toBe(10000)
  })

  test('同一批裡重複的 id 只存一次', async () => {
    expect(await ingestMailImports([row('a'), row('a')], 1, [])).toBe(1)
  })

  test('同步成功會清掉上次的錯誤訊息', async () => {
    await db.settings.put({
      id: 'app',
      lastBackupAt: null,
      txCountSinceBackup: 0,
      mailSyncError: '連不上',
    })
    await ingestMailImports([], 1, [])
    expect((await getSettings()).mailSyncError).toBe('')
  })
})

describe('listPendingImports', () => {
  test('新到舊，同一天看收信時間；確認過與略過的不列', async () => {
    await ingestMailImports(
      [
        row('old', { date: '2026-09-01' }),
        row('late', { date: '2026-09-10', receivedAt: 20 }),
        row('early', { date: '2026-09-10', receivedAt: 10 }),
        row('done'),
        row('skip'),
      ],
      1,
      [],
    )
    await confirmMailImport('done', 'food')
    await dismissMailImport('skip')

    expect((await listPendingImports()).map((r) => r.id)).toEqual([
      'late',
      'early',
      'old',
    ])
  })
})

describe('confirmMailImport', () => {
  test('寫成一筆支出，備註是 label，並累加未備份筆數', async () => {
    await ingestMailImports([row('a', { label: '轉帳：便當' })], 1, [])
    await confirmMailImport('a', 'food')

    const [tx] = await db.transactions.toArray()
    expect(tx).toMatchObject({
      type: 'expense',
      amountMinor: 10000,
      date: '2026-09-10',
      categoryId: 'food',
      note: '轉帳：便當',
    })
    expect((await getSettings()).txCountSinceBackup).toBe(1)

    const stored = await db.mailImports.get('a')
    expect(stored).toMatchObject({ status: 'confirmed', categoryId: 'food' })
  })

  test('連點兩下只記一筆', async () => {
    await ingestMailImports([row('a')], 1, [])
    await Promise.all([confirmMailImport('a', 'food'), confirmMailImport('a', 'food')])
    expect(await db.transactions.count()).toBe(1)
  })

  test('已略過的不能再確認', async () => {
    await ingestMailImports([row('a')], 1, [])
    await dismissMailImport('a')
    await confirmMailImport('a', 'food')
    expect(await db.transactions.count()).toBe(0)
  })
})

describe('dismissMailImport', () => {
  test('已確認的不會被改成略過，帳還在', async () => {
    await ingestMailImports([row('a')], 1, [])
    await confirmMailImport('a', 'food')
    await dismissMailImport('a')
    expect((await db.mailImports.get('a'))?.status).toBe('confirmed')
  })
})

describe('listImportCategoryHints', () => {
  test('每個 label 取最近一次確認時選的分類', async () => {
    await ingestMailImports(
      [
        row('a', { receivedAt: 1 }),
        row('b', { receivedAt: 2 }),
        row('c', { label: '繳費：範例銀行', receivedAt: 3 }),
      ],
      1,
      [],
    )
    // 確認順序刻意和收信順序相反，預設要跟著收信時間走。
    await confirmMailImport('b', 'transport')
    await confirmMailImport('a', 'food')
    await confirmMailImport('c', 'fixed')

    const hints = await listImportCategoryHints()
    expect(hints.get('LINE Pay')).toBe('transport')
    expect(hints.get('繳費：範例銀行')).toBe('fixed')
  })
})

describe('saveMailBridge / clearMailBridge', () => {
  test('重新設定不會重置同步進度', async () => {
    await ingestMailImports([], 777, [])
    await saveMailBridge(` ${EXEC_URL} `, ' secret ')

    const settings = await getSettings()
    expect(settings.mailBridgeUrl).toBe(EXEC_URL)
    expect(settings.mailBridgeToken).toBe('secret')
    expect(settings.mailSyncedAt).toBe(777)
  })

  test('中斷連線保留還沒處理的待確認', async () => {
    await saveMailBridge(EXEC_URL, 'secret')
    await ingestMailImports([row('a')], 1, [])
    await clearMailBridge()

    expect((await getSettings()).mailBridgeUrl).toBe('')
    expect(await listPendingImports()).toHaveLength(1)
  })
})

describe('syncMailImports', () => {
  const NOW = Date.UTC(2026, 8, 25)

  const walletMail = {
    id: 'g1',
    receivedAt: NOW - DAY,
    subject: '連結帳戶付款服務扣款通知 - 扣款通知',
    body: '您使用連結帳戶付款服務交易成功， 交易日期：2026年09月24日12:00:00 交易平台：連加電子支付 交易金額：80元',
  }
  const loginMail = {
    id: 'g2',
    receivedAt: NOW - DAY,
    subject: '行動郵局交易通知',
    body: '看不懂的內容',
  }

  function fakeFetch(body: unknown, status = 200) {
    const calls: string[] = []
    const impl = (async (input: RequestInfo | URL) => {
      calls.push(String(input))
      return new Response(JSON.stringify(body), { status })
    }) as typeof fetch
    return { impl, calls }
  }

  test('沒設定網址時不發請求', async () => {
    const { impl, calls } = fakeFetch({})
    expect(await syncMailImports({ fetchImpl: impl, now: NOW })).toEqual({
      status: 'off',
    })
    expect(calls).toHaveLength(0)
  })

  test('第一次同步從七天前開始，解析後存成待確認', async () => {
    await saveMailBridge(EXEC_URL, 'secret')
    const { impl, calls } = fakeFetch({
      ok: true,
      now: NOW,
      mails: [walletMail, loginMail],
    })

    const result = await syncMailImports({ fetchImpl: impl, now: NOW })
    expect(result).toEqual({ status: 'ok', added: 1, unreadable: 1 })

    const url = new URL(calls[0])
    expect(url.searchParams.get('token')).toBe('secret')
    expect(url.searchParams.get('since')).toBe(String(NOW - 7 * DAY))

    const [pending] = await listPendingImports()
    expect(pending).toMatchObject({
      id: 'g1',
      amountMinor: 8000,
      date: '2026-09-24',
      label: 'LINE Pay',
    })
    const settings = await getSettings()
    expect(settings.mailSyncedAt).toBe(NOW)
    expect(settings.mailUnreadable).toEqual(['行動郵局交易通知'])
  })

  test('之後從上次同步時間再往回兩天，重複的信不會重複存', async () => {
    await saveMailBridge(EXEC_URL, 'secret')
    const first = fakeFetch({ ok: true, now: NOW, mails: [walletMail] })
    await syncMailImports({ fetchImpl: first.impl, now: NOW })

    const second = fakeFetch({ ok: true, now: NOW + DAY, mails: [walletMail] })
    const result = await syncMailImports({ fetchImpl: second.impl, now: NOW + DAY })

    expect(result).toEqual({ status: 'ok', added: 0, unreadable: 0 })
    expect(new URL(second.calls[0]).searchParams.get('since')).toBe(
      String(NOW - 2 * DAY),
    )
  })

  test('連不上時記下好懂的原因，不推進同步時間', async () => {
    await saveMailBridge(EXEC_URL, 'secret')
    const impl = (async () => {
      throw new TypeError('Load failed')
    }) as typeof fetch

    const result = await syncMailImports({ fetchImpl: impl, now: NOW })
    expect(result.status).toBe('error')

    const settings = await getSettings()
    expect(settings.mailSyncError).toMatch(/連不上/)
    expect(settings.mailSyncedAt).toBeUndefined()
  })

  test('密碼錯誤', async () => {
    await saveMailBridge(EXEC_URL, 'wrong')
    const { impl } = fakeFetch({ ok: false, error: 'unauthorized' })
    await syncMailImports({ fetchImpl: impl, now: NOW })
    expect((await getSettings()).mailSyncError).toMatch(/密碼不對/)
  })

  test('HTTP 錯誤', async () => {
    await saveMailBridge(EXEC_URL, 'secret')
    const { impl } = fakeFetch({}, 500)
    await syncMailImports({ fetchImpl: impl, now: NOW })
    expect((await getSettings()).mailSyncError).toMatch(/500/)
  })
})
