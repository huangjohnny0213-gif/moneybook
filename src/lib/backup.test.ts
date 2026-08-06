import { describe, expect, test } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  needsBackup,
  parseBackup,
  planImport,
  toCsv,
  type BackupCategory,
  type BackupFile,
  type BackupTransaction,
} from './backup'

function tx(patch: Partial<BackupTransaction> = {}): BackupTransaction {
  return {
    id: 't1',
    type: 'expense',
    amountMinor: 12050,
    date: '2026-08-06',
    categoryId: 'food',
    note: '',
    createdAt: 1,
    updatedAt: 1,
    ...patch,
  }
}

function cat(id: string, name: string): BackupCategory {
  return {
    id,
    name,
    type: 'expense',
    emoji: '',
    color: '#2a78d6',
    sortOrder: 1,
    archived: false,
  }
}

function file(patch: Partial<BackupFile> = {}): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: 1786000000000,
    transactions: [],
    categories: [],
    recurringRules: [],
    ...patch,
  }
}

describe('parseBackup 擋下不是備份檔的東西', () => {
  // 使用者在「檔案」App 裡選錯一個 JSON 很常見，
  // 而把別的東西灌進資料庫會直接毀掉現有的帳。

  test('不是 JSON', () => {
    expect(() => parseBackup('這不是 JSON')).toThrow(/JSON/)
  })

  test('是 JSON 但不是物件', () => {
    expect(() => parseBackup('[1,2,3]')).toThrow()
    expect(() => parseBackup('null')).toThrow()
    expect(() => parseBackup('"字串"')).toThrow()
  })

  test('別的 App 的 JSON', () => {
    expect(() => parseBackup('{"foo":"bar"}')).toThrow(/moneybook/)
  })

  test('format 不對', () => {
    const wrong = JSON.stringify({ ...file(), format: 'other-app' })
    expect(() => parseBackup(wrong)).toThrow(/moneybook/)
  })

  test('版本比目前支援的還新', () => {
    // 舊版 App 硬讀新格式會讀出殘缺的資料，寧可明確拒絕。
    const future = JSON.stringify({ ...file(), version: BACKUP_VERSION + 1 })
    expect(() => parseBackup(future)).toThrow(/版本/)
  })

  test('缺少資料陣列', () => {
    const broken = JSON.stringify({ ...file(), transactions: undefined })
    expect(() => parseBackup(broken)).toThrow(/transactions/)
  })

  test('資料欄位不是陣列', () => {
    const broken = JSON.stringify({ ...file(), recurringRules: 'nope' })
    expect(() => parseBackup(broken)).toThrow(/recurringRules/)
  })

  test('交易的金額不是數字', () => {
    const broken = JSON.stringify(
      file({ transactions: [{ ...tx(), amountMinor: '一百' } as never] }),
    )
    expect(() => parseBackup(broken)).toThrow(/第 1 筆/)
  })

  test('交易缺少 id', () => {
    const broken = JSON.stringify(
      file({ transactions: [{ ...tx(), id: undefined } as never] }),
    )
    expect(() => parseBackup(broken)).toThrow(/第 1 筆/)
  })

  test('合法的備份檔原樣回傳', () => {
    const good = file({ transactions: [tx()], categories: [cat('food', '飲食')] })
    expect(parseBackup(JSON.stringify(good))).toEqual(good)
  })

  test('空的備份檔也合法', () => {
    expect(parseBackup(JSON.stringify(file()))).toEqual(file())
  })
})

describe('planImport 以 id 合併', () => {
  const source = file({
    transactions: [tx({ id: 'a' }), tx({ id: 'b' }), tx({ id: 'c' })],
    recurringRules: [
      {
        id: 'r1',
        type: 'expense',
        amountMinor: 1800000,
        categoryId: 'fixed',
        note: '房租',
        dayOfMonth: 1,
        startDate: '2026-01-01',
        active: true,
        lastGeneratedMonth: '2026-08',
      },
    ],
  })

  test('全新的資料庫全部都要新增', () => {
    const plan = planImport(source, new Set(), new Set())
    expect(plan.addTransactions).toHaveLength(3)
    expect(plan.skipTransactions).toBe(0)
    expect(plan.addRules).toHaveLength(1)
  })

  test('已存在的 id 一律略過，不覆蓋', () => {
    // 覆蓋會讓「匯入半年前的備份」把這半年編輯過的帳改回舊值。
    const plan = planImport(source, new Set(['a', 'c']), new Set())
    expect(plan.addTransactions.map((t) => t.id)).toEqual(['b'])
    expect(plan.skipTransactions).toBe(2)
  })

  test('連續匯入同一份檔案，第二次沒有東西可加', () => {
    // 這就是驗收條件「不會變兩倍」的證明。
    const first = planImport(source, new Set(), new Set())
    const idsAfter = new Set(first.addTransactions.map((t) => t.id))

    const second = planImport(source, idsAfter, new Set(['r1']))
    expect(second.addTransactions).toHaveLength(0)
    expect(second.addRules).toHaveLength(0)
    expect(second.skipTransactions).toBe(3)
  })

  test('規則帶著 lastGeneratedMonth 一起匯入', () => {
    // 少了它，新裝置會以為規則從沒跑過，把備份裡已還原的月份再補一次，
    // 還原完立刻重複記帳。
    const plan = planImport(source, new Set(), new Set())
    expect(plan.addRules[0].lastGeneratedMonth).toBe('2026-08')
  })

  test('不修改傳入的備份檔', () => {
    const snapshot = structuredClone(source)
    planImport(source, new Set(['a']), new Set())
    expect(source).toEqual(snapshot)
  })
})

describe('toCsv', () => {
  const categories = [cat('food', '飲食'), cat('salary', '薪水')]

  function rows(csv: string): string[] {
    return csv.replace(/^﻿/, '').trim().split('\r\n')
  }

  test('開頭有 UTF-8 BOM', () => {
    // 沒有 BOM 的話 Excel 開起來中文全是亂碼。
    expect(toCsv([tx()], categories).startsWith('﻿')).toBe(true)
  })

  test('第一列是標題', () => {
    expect(rows(toCsv([], categories))[0]).toBe('日期,類型,分類,金額,備註')
  })

  test('金額不帶千分位逗號', () => {
    // formatAmount 會加逗號，丟進 CSV 會直接把欄位切成兩半。
    const csv = rows(toCsv([tx({ amountMinor: 1234567 })], categories))
    expect(csv[1]).toContain('12345.67')
    expect(csv[1]).not.toContain('12,345')
  })

  test('金額固定兩位小數', () => {
    const csv = rows(toCsv([tx({ amountMinor: 10000 })], categories))
    expect(csv[1]).toContain('100.00')
  })

  test('類型寫成中文', () => {
    const csv = rows(
      toCsv([tx({ type: 'income', categoryId: 'salary' })], categories),
    )
    expect(csv[1]).toContain('收入')
  })

  test('分類寫名稱，找不到時寫未知分類', () => {
    const csv = rows(toCsv([tx({ categoryId: 'gone' })], categories))
    expect(csv[1]).toContain('未知分類')
  })

  test('依日期由舊到新排序', () => {
    const csv = rows(
      toCsv(
        [
          tx({ id: 'a', date: '2026-08-20' }),
          tx({ id: 'b', date: '2026-08-01' }),
        ],
        categories,
      ),
    )
    expect(csv[1]).toContain('2026-08-01')
    expect(csv[2]).toContain('2026-08-20')
  })

  test('不修改傳入的陣列', () => {
    const input = [tx({ id: 'a', date: '2026-08-20' }), tx({ id: 'b', date: '2026-08-01' })]
    toCsv(input, categories)
    expect(input.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('toCsv 的跳脫', () => {
  const categories = [cat('food', '飲食')]
  function lastField(note: string): string {
    const csv = toCsv([tx({ note })], categories).replace(/^﻿/, '')
    return csv.trim().split('\r\n')[1].split(',').slice(4).join(',')
  }

  test('備註含逗號時用雙引號包起來', () => {
    expect(lastField('午餐,飲料')).toBe('"午餐,飲料"')
  })

  test('備註含雙引號時寫成兩個雙引號', () => {
    expect(lastField('他說「便宜"很多"」')).toBe('"他說「便宜""很多""」"')
  })

  test('備註含換行時也要包起來', () => {
    const csv = toCsv([tx({ note: '第一行\n第二行' })], categories)
    expect(csv).toContain('"第一行\n第二行"')
  })

  test('沒有特殊字元時不加引號', () => {
    expect(lastField('午餐')).toBe('午餐')
  })

  test('空備註不加引號', () => {
    expect(lastField('')).toBe('')
  })
})

describe('needsBackup', () => {
  const day = 24 * 60 * 60 * 1000
  const now = 1786000000000

  test('從沒備份過而且已經有帳就要提醒', () => {
    expect(needsBackup({ lastBackupAt: null, txCountSinceBackup: 1 }, now)).toBe(
      true,
    )
  })

  test('從沒備份過但也還沒記帳就不吵', () => {
    // 剛裝好的 App 立刻叫人備份空資料庫沒有意義。
    expect(needsBackup({ lastBackupAt: null, txCountSinceBackup: 0 }, now)).toBe(
      false,
    )
  })

  test('超過 30 天就要提醒', () => {
    const old = now - 31 * day
    expect(needsBackup({ lastBackupAt: old, txCountSinceBackup: 0 }, now)).toBe(
      true,
    )
  })

  test('剛好 30 天還不用', () => {
    const old = now - 30 * day
    expect(needsBackup({ lastBackupAt: old, txCountSinceBackup: 0 }, now)).toBe(
      false,
    )
  })

  test('超過 50 筆就要提醒，即使昨天才備份過', () => {
    expect(
      needsBackup({ lastBackupAt: now - day, txCountSinceBackup: 51 }, now),
    ).toBe(true)
  })

  test('剛好 50 筆還不用', () => {
    expect(
      needsBackup({ lastBackupAt: now - day, txCountSinceBackup: 50 }, now),
    ).toBe(false)
  })

  test('剛備份完且沒有新帳就不吵', () => {
    expect(needsBackup({ lastBackupAt: now, txCountSinceBackup: 0 }, now)).toBe(
      false,
    )
  })
})
