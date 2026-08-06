import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  planImport,
} from '../lib/backup'
import { expandDueRules } from '../lib/recurring'
import { db, type Category } from './schema'
import {
  addRecurringRule,
  addTransaction,
  applyImport,
  buildBackup,
  confirmDueItem,
  markBackedUp,
  deleteRecurringRule,
  deleteTransaction,
  getSettings,
  listRecurringRules,
  skipDueItem,
  updateRecurringRule,
  listAllCategories,
  listCategories,
  listRecentTransactions,
  listTransactionsBetween,
  listTransactionsByMonth,
  updateCategoryStyle,
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

describe('listTransactionsBetween', () => {
  test('含頭尾兩天', async () => {
    await addTransaction({ ...draft, date: '2026-06-30' })
    await addTransaction({ ...draft, date: '2026-07-01' })
    await addTransaction({ ...draft, date: '2026-08-31' })
    await addTransaction({ ...draft, date: '2026-09-01' })

    const result = await listTransactionsBetween('2026-07-01', '2026-08-31')
    expect(result.map((t) => t.date)).toEqual(['2026-08-31', '2026-07-01'])
  })

  test('跨年的區間', async () => {
    await addTransaction({ ...draft, date: '2025-12-15' })
    await addTransaction({ ...draft, date: '2026-01-15' })

    expect(
      await listTransactionsBetween('2025-12-01', '2026-01-31'),
    ).toHaveLength(2)
  })

  test('區間內沒有帳時回傳空陣列', async () => {
    expect(await listTransactionsBetween('2020-01-01', '2020-12-31')).toEqual([])
  })
})

/** 建一筆分類，只指定關心的欄位，其餘給合理預設。 */
function category(patch: Partial<Category> & Pick<Category, 'id'>): Category {
  return {
    name: patch.id,
    type: 'expense',
    emoji: '',
    color: '#2a78d6',
    sortOrder: 1,
    archived: false,
    ...patch,
  }
}

describe('listCategories', () => {
  beforeEach(async () => {
    await db.categories.bulkAdd([
      category({ id: 'c', sortOrder: 3 }),
      category({ id: 'a', sortOrder: 1 }),
      category({ id: 'b', sortOrder: 2 }),
      category({ id: 'gone', sortOrder: 4, archived: true }),
      category({ id: 'salary', type: 'income', sortOrder: 1 }),
    ])
  })

  test('依 sortOrder 排序', async () => {
    const result = await listCategories('expense')
    expect(result.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  test('只回傳指定類型', async () => {
    expect((await listCategories('income')).map((c) => c.id)).toEqual(['salary'])
  })

  test('不回傳已封存的分類', async () => {
    // 封存的分類不該出現在記帳畫面，但舊帳仍要能顯示它的名稱與顏色。
    const ids = (await listCategories('expense')).map((c) => c.id)
    expect(ids).not.toContain('gone')
  })
})

describe('listAllCategories', () => {
  test('含已封存的，支出在前收入在後，各自依 sortOrder', async () => {
    await db.categories.bulkAdd([
      category({ id: 'salary', type: 'income', sortOrder: 1 }),
      category({ id: 'b', sortOrder: 2 }),
      category({ id: 'gone', sortOrder: 3, archived: true }),
      category({ id: 'a', sortOrder: 1 }),
    ])

    const result = await listAllCategories()
    expect(result.map((c) => c.id)).toEqual(['a', 'b', 'gone', 'salary'])
  })

  test('沒有分類時回傳空陣列', async () => {
    expect(await listAllCategories()).toEqual([])
  })
})

describe('updateCategoryStyle', () => {
  beforeEach(async () => {
    await db.categories.add(
      category({ id: 'food', name: '飲食', emoji: '', color: '#2a78d6' }),
    )
  })

  test('改 emoji', async () => {
    await updateCategoryStyle('food', { emoji: '🍜' })
    expect((await db.categories.get('food'))?.emoji).toBe('🍜')
  })

  test('改顏色', async () => {
    await updateCategoryStyle('food', { color: '#e34948' })
    expect((await db.categories.get('food'))?.color).toBe('#e34948')
  })

  test('只給一個欄位時另一個不動', async () => {
    await updateCategoryStyle('food', { emoji: '🍜' })
    await updateCategoryStyle('food', { color: '#e34948' })

    const stored = await db.categories.get('food')
    expect(stored?.emoji).toBe('🍜')
    expect(stored?.color).toBe('#e34948')
  })

  test('不會動到名稱、類型與排序', async () => {
    // 分類管理只開放改樣式，名稱與 id 改了會讓歷史交易對不上。
    await updateCategoryStyle('food', { emoji: '🍜', color: '#e34948' })

    const stored = await db.categories.get('food')
    expect(stored?.name).toBe('飲食')
    expect(stored?.type).toBe('expense')
    expect(stored?.sortOrder).toBe(1)
  })
})

const ruleDraft = {
  type: 'expense' as const,
  amountMinor: 1800000,
  categoryId: 'fixed',
  note: '房租',
  dayOfMonth: 31,
  startDate: '2026-01-01',
  active: true,
}

describe('定期規則的增刪改查', () => {
  test('新增時產生 id，鎖為空代表還沒開始', () => {
    return addRecurringRule(ruleDraft).then((created) => {
      expect(created.id).toBeTruthy()
      expect(created.lastGeneratedMonth).toBe('')
    })
  })

  test('列出全部，含已停用的', async () => {
    await addRecurringRule(ruleDraft)
    await addRecurringRule({ ...ruleDraft, note: '電信費', active: false })
    expect(await listRecurringRules()).toHaveLength(2)
  })

  test('修改欄位', async () => {
    const created = await addRecurringRule(ruleDraft)
    await updateRecurringRule(created.id, { amountMinor: 1900000, active: false })

    const stored = await db.recurringRules.get(created.id)
    expect(stored?.amountMinor).toBe(1900000)
    expect(stored?.active).toBe(false)
  })

  test('刪除規則不會動到已經產生的交易', async () => {
    // 那些是真實發生過的帳，規則只是產生它們的模板。
    const created = await addRecurringRule(ruleDraft)
    await confirmDueItem(
      {
        ruleId: created.id,
        month: '2026-01',
        date: '2026-01-31',
        type: 'expense',
        amountMinor: 1800000,
        categoryId: 'fixed',
        note: '房租',
      },
      1800000,
    )

    await deleteRecurringRule(created.id)

    expect(await db.recurringRules.get(created.id)).toBeUndefined()
    expect(await db.transactions.count()).toBe(1)
  })
})

describe('confirmDueItem', () => {
  async function setup() {
    const created = await addRecurringRule(ruleDraft)
    const [due] = expandDueRules([created], '2026-01-31')
    return { created, due }
  }

  test('寫入交易並帶上 recurringId', async () => {
    const { created, due } = await setup()
    await confirmDueItem(due, due.amountMinor)

    const [stored] = await db.transactions.toArray()
    expect(stored).toMatchObject({
      date: '2026-01-31',
      categoryId: 'fixed',
      note: '房租',
      recurringId: created.id,
    })
  })

  test('同時推進鎖，讓下次展開不再出現同一筆', async () => {
    // 這兩件事必須一起發生。只寫交易沒推鎖的話下次開 App 又跳出來，
    // 就變成重複記帳 —— 那正是 lastGeneratedMonth 要防的事。
    const { created, due } = await setup()
    await confirmDueItem(due, due.amountMinor)

    const updated = await db.recurringRules.get(created.id)
    expect(updated?.lastGeneratedMonth).toBe('2026-01')
    expect(expandDueRules([updated!], '2026-01-31')).toEqual([])
  })

  test('可以當場改金額', async () => {
    // 水電費每個月的數字都不一樣。
    const { due } = await setup()
    await confirmDueItem(due, 2100000)

    const [stored] = await db.transactions.toArray()
    expect(stored.amountMinor).toBe(2100000)
  })

  test('算進未備份筆數', async () => {
    const { due } = await setup()
    await confirmDueItem(due, due.amountMinor)
    expect((await getSettings()).txCountSinceBackup).toBe(1)
  })

  test('確認三筆之後交易剛好三筆，且不再有待確認', async () => {
    const created = await addRecurringRule(ruleDraft)
    for (const due of expandDueRules([created], '2026-03-31')) {
      await confirmDueItem(due, due.amountMinor)
    }

    expect(await db.transactions.count()).toBe(3)
    const updated = await db.recurringRules.get(created.id)
    expect(expandDueRules([updated!], '2026-03-31')).toEqual([])
  })
})

describe('備份的匯出與匯入', () => {
  /** 造一批跨月份的帳與一條定期規則。 */
  async function seedData() {
    await db.categories.bulkAdd([
      category({ id: 'food', name: '飲食' }),
      category({ id: 'fixed', name: '固定支出', sortOrder: 2 }),
    ])
    await addTransaction({ ...draft, categoryId: 'food', amountMinor: 12050 })
    await addTransaction({ ...draft, categoryId: 'food', amountMinor: 8300, date: '2026-07-15' })
    await addTransaction({
      ...draft,
      categoryId: 'fixed',
      amountMinor: 1800000,
      type: 'income',
    })
    await addRecurringRule(ruleDraft)
  }

  /** 全部交易的總額，用來驗證還原後金額沒有跑掉。 */
  async function total() {
    const rows = await db.transactions.toArray()
    return rows.reduce((sum, r) => sum + r.amountMinor, 0)
  }

  test('匯出包含交易、分類與定期規則', async () => {
    await seedData()
    const backup = await buildBackup()

    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(BACKUP_VERSION)
    expect(backup.exportedAt).toBeGreaterThan(0)
    expect(backup.transactions).toHaveLength(3)
    expect(backup.categories).toHaveLength(2)
    expect(backup.recurringRules).toHaveLength(1)
  })

  test('往返：清空後還原，筆數與總額完全一致', async () => {
    await seedData()
    const before = { count: await db.transactions.count(), sum: await total() }
    const backup = await buildBackup()

    // 模擬換手機：資料庫全空
    await db.transactions.clear()
    await db.recurringRules.clear()

    const plan = planImport(backup, new Set(), new Set())
    await applyImport(plan, backup.exportedAt)

    expect(await db.transactions.count()).toBe(before.count)
    expect(await total()).toBe(before.sum)
    expect(await db.recurringRules.count()).toBe(1)
  })

  test('連續匯入兩次不會變兩倍', async () => {
    await seedData()
    const backup = await buildBackup()
    const before = await db.transactions.count()

    for (let round = 0; round < 2; round += 1) {
      const existing = new Set((await db.transactions.toArray()).map((t) => t.id))
      const rules = new Set((await db.recurringRules.toArray()).map((r) => r.id))
      await applyImport(planImport(backup, existing, rules), backup.exportedAt)
    }

    expect(await db.transactions.count()).toBe(before)
  })

  test('還原的定期規則帶著鎖，不會重新補出已還原的月份', async () => {
    // 少了 lastGeneratedMonth，新裝置會以為規則從沒跑過，
    // 把備份裡已還原的月份再補一次待確認 —— 還原完立刻重複記帳。
    const created = await addRecurringRule(ruleDraft)
    await updateRecurringRule(created.id, {})
    await db.recurringRules.update(created.id, { lastGeneratedMonth: '2026-03' })

    const backup = await buildBackup()
    await db.recurringRules.clear()
    await applyImport(planImport(backup, new Set(), new Set()), backup.exportedAt)

    const [restored] = await db.recurringRules.toArray()
    expect(restored.lastGeneratedMonth).toBe('2026-03')
    expect(expandDueRules([restored], '2026-03-31')).toEqual([])
  })

  test('匯入不會動到現有分類', async () => {
    // 使用者的決定：分類樣式維持這台裝置目前的設定。
    await db.categories.add(category({ id: 'food', name: '飲食', emoji: '🍜' }))
    const backup = await buildBackup()
    await db.categories.update('food', { emoji: '🍕' })

    await applyImport(planImport(backup, new Set(), new Set()), backup.exportedAt)

    expect((await db.categories.get('food'))?.emoji).toBe('🍕')
  })

  test('匯入後把備份檔的時間當成上次備份，計數歸零', async () => {
    // 剛還原的資料本來就在備份檔裡，不該立刻又跳出「該備份了」。
    await seedData()
    const backup = await buildBackup()
    await db.transactions.clear()

    // 規則沒清掉，所以要照實把既有 id 算進來 —— 傳空集合會讓計畫過期，
    // bulkAdd 撞上主鍵直接整批回滾（那是對的行為，但不是這個測試要測的）。
    const rules = new Set((await db.recurringRules.toArray()).map((r) => r.id))
    await applyImport(planImport(backup, new Set(), rules), backup.exportedAt)

    const settings = await getSettings()
    expect(settings.lastBackupAt).toBe(backup.exportedAt)
    expect(settings.txCountSinceBackup).toBe(0)
  })
})

describe('markBackedUp', () => {
  test('記下時間並把未備份筆數歸零', async () => {
    await addTransaction(draft)
    await markBackedUp(1786000000000)

    const settings = await getSettings()
    expect(settings.lastBackupAt).toBe(1786000000000)
    expect(settings.txCountSinceBackup).toBe(0)
  })
})

describe('skipDueItem', () => {
  test('不寫交易但仍推進鎖', async () => {
    // 不推鎖的話下次開 App 又會跳出來，「跳過」就等於沒有作用。
    const created = await addRecurringRule(ruleDraft)
    const [due] = expandDueRules([created], '2026-01-31')

    await skipDueItem(due)

    expect(await db.transactions.count()).toBe(0)
    const updated = await db.recurringRules.get(created.id)
    expect(updated?.lastGeneratedMonth).toBe('2026-01')
    expect(expandDueRules([updated!], '2026-01-31')).toEqual([])
  })
})
