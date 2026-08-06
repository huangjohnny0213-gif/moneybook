import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { db } from './schema'
import {
  addTransaction,
  deleteTransaction,
  getSettings,
  listRecentTransactions,
  listTransactionsByMonth,
  updateTransaction,
} from './repo'

const draft = {
  type: 'expense' as const,
  amountMinor: 12000,
  date: '2026-08-06',
  categoryId: 'food',
  note: '午餐',
}

beforeEach(async () => {
  await Promise.all([
    db.transactions.clear(),
    db.categories.clear(),
    db.recurringRules.clear(),
    db.settings.clear(),
  ])
})

describe('getSettings', () => {
  test('第一次呼叫時建立預設設定', async () => {
    const settings = await getSettings()
    expect(settings).toEqual({
      id: 'app',
      lastBackupAt: null,
      txCountSinceBackup: 0,
    })
  })

  test('重複呼叫不會覆蓋既有設定', async () => {
    await getSettings()
    await addTransaction(draft)
    const settings = await getSettings()
    expect(settings.txCountSinceBackup).toBe(1)
  })
})

describe('addTransaction', () => {
  test('產生 id 與建立時間', async () => {
    const tx = await addTransaction(draft)
    expect(tx.id).toBeTruthy()
    expect(tx.createdAt).toBeGreaterThan(0)
    expect(tx.updatedAt).toBe(tx.createdAt)
  })

  test('寫入資料庫且欄位完整', async () => {
    const tx = await addTransaction(draft)
    const stored = await db.transactions.get(tx.id)
    expect(stored).toMatchObject(draft)
  })

  test('每筆都有不同的 id', async () => {
    const a = await addTransaction(draft)
    const b = await addTransaction(draft)
    expect(a.id).not.toBe(b.id)
  })

  test('累加未備份筆數，作為提醒備份的依據', async () => {
    await addTransaction(draft)
    await addTransaction(draft)
    expect((await getSettings()).txCountSinceBackup).toBe(2)
  })

  test('同一毫秒內連續新增，createdAt 仍嚴格遞增', async () => {
    // 列表排序在同一天時靠 createdAt 決勝，平手就會退回 Dexie 的主鍵順序，
    // 也就是隨機 UUID 的順序，列表會在每次重新整理時亂跳。
    // 定期支出確認與備份匯入都是一次寫入多筆，這個碰撞是真的會發生的。
    // 凍住時鐘就能穩定重現，不必靠運氣。
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 7, 6, 12, 0))

    const first = await addTransaction(draft)
    const second = await addTransaction(draft)
    const third = await addTransaction(draft)

    expect(second.createdAt).toBeGreaterThan(first.createdAt)
    expect(third.createdAt).toBeGreaterThan(second.createdAt)
    vi.useRealTimers()
  })
})

describe('updateTransaction', () => {
  test('更新欄位', async () => {
    const tx = await addTransaction(draft)
    await updateTransaction(tx.id, { amountMinor: 9900, note: '晚餐' })
    const stored = await db.transactions.get(tx.id)
    expect(stored?.amountMinor).toBe(9900)
    expect(stored?.note).toBe('晚餐')
  })

  test('更新時間往前推，建立時間不變', async () => {
    // 只假造 Date，不能連 setTimeout 一起凍住：
    // fake-indexeddb 靠計時器推進交易，全部假造會讓資料庫操作永遠不完成。
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 7, 6, 12, 0))
    const tx = await addTransaction(draft)

    vi.setSystemTime(new Date(2026, 7, 7, 9, 30))
    await updateTransaction(tx.id, { note: '改過' })

    const stored = await db.transactions.get(tx.id)
    expect(stored?.createdAt).toBe(tx.createdAt)
    expect(stored?.updatedAt).toBeGreaterThan(tx.createdAt)
    vi.useRealTimers()
  })

  test('編輯不算新增，不影響未備份筆數', async () => {
    const tx = await addTransaction(draft)
    await updateTransaction(tx.id, { note: '改過' })
    expect((await getSettings()).txCountSinceBackup).toBe(1)
  })
})

describe('deleteTransaction', () => {
  test('刪除後查不到', async () => {
    const tx = await addTransaction(draft)
    await deleteTransaction(tx.id)
    expect(await db.transactions.get(tx.id)).toBeUndefined()
  })
})

describe('listTransactionsByMonth', () => {
  test('只回傳指定月份', async () => {
    await addTransaction({ ...draft, date: '2026-07-31' })
    await addTransaction({ ...draft, date: '2026-08-01' })
    await addTransaction({ ...draft, date: '2026-08-31' })
    await addTransaction({ ...draft, date: '2026-09-01' })

    const result = await listTransactionsByMonth('2026-08')
    expect(result.map((t) => t.date)).toEqual(['2026-08-31', '2026-08-01'])
  })

  test('依日期新到舊排序', async () => {
    await addTransaction({ ...draft, date: '2026-08-05' })
    await addTransaction({ ...draft, date: '2026-08-20' })
    await addTransaction({ ...draft, date: '2026-08-12' })

    const result = await listTransactionsByMonth('2026-08')
    expect(result.map((t) => t.date)).toEqual([
      '2026-08-20',
      '2026-08-12',
      '2026-08-05',
    ])
  })

  test('同一天的多筆帳以後記錄的排前面', async () => {
    const first = await addTransaction({ ...draft, note: '早餐' })
    const second = await addTransaction({ ...draft, note: '午餐' })

    const result = await listTransactionsByMonth('2026-08')
    expect(result.map((t) => t.id)).toEqual([second.id, first.id])
  })

  test('沒有資料時回傳空陣列', async () => {
    expect(await listTransactionsByMonth('2026-08')).toEqual([])
  })
})

describe('listRecentTransactions', () => {
  test('取最近幾筆，跨月份', async () => {
    await addTransaction({ ...draft, date: '2026-07-01' })
    await addTransaction({ ...draft, date: '2026-08-06' })
    await addTransaction({ ...draft, date: '2026-08-02' })

    const result = await listRecentTransactions(2)
    expect(result.map((t) => t.date)).toEqual(['2026-08-06', '2026-08-02'])
  })
})
