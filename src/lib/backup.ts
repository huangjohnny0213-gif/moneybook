import { fromMinor } from './money'
import type { TxType } from '../types'

/**
 * 備份檔的格式、解析與匯入計算。
 *
 * 純函式，不碰資料庫。型別自行宣告結構型別而不從 db/schema 匯入 ——
 * lib 不可反向依賴 db，與 stats.ts、recurring.ts 一致。
 */

export const BACKUP_FORMAT = 'moneybook-backup'
export const BACKUP_VERSION = 1

export interface BackupTransaction {
  id: string
  type: TxType
  amountMinor: number
  date: string
  categoryId: string
  note: string
  recurringId?: string
  createdAt: number
  updatedAt: number
}

export interface BackupCategory {
  id: string
  name: string
  type: TxType
  emoji: string
  color: string
  sortOrder: number
  archived: boolean
}

export interface BackupRule {
  id: string
  type: TxType
  amountMinor: number
  categoryId: string
  note: string
  dayOfMonth: number
  startDate: string
  endDate?: string
  active: boolean
  lastGeneratedMonth: string
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: number
  transactions: BackupTransaction[]
  categories: BackupCategory[]
  recurringRules: BackupRule[]
}

export interface ImportPlan {
  addTransactions: BackupTransaction[]
  skipTransactions: number
  addRules: BackupRule[]
  skipRules: number
}

/**
 * 解析並驗證備份檔。
 *
 * 檢查得比較嚴格是刻意的：使用者在「檔案」App 裡選錯一個 JSON 很常見，
 * 而把別的東西灌進資料庫會直接毀掉現有的帳。錯誤訊息寫成可以直接顯示給
 * 使用者看的句子。
 */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('這個檔案不是有效的 JSON，請確認選到的是備份檔。')
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('備份檔的內容不是一個物件。')
  }

  const file = raw as Record<string, unknown>

  if (file.format !== BACKUP_FORMAT) {
    throw new Error('這不是 moneybook 的備份檔。')
  }

  if (typeof file.version !== 'number') {
    throw new Error('備份檔沒有版本資訊，可能已經損壞。')
  }

  if (file.version > BACKUP_VERSION) {
    // 舊版 App 硬讀新格式會讀出殘缺的資料，寧可明確拒絕。
    throw new Error(
      `這個備份檔的版本（${file.version}）比目前的 App 還新，請先更新 App。`,
    )
  }

  for (const key of ['transactions', 'categories', 'recurringRules'] as const) {
    if (!Array.isArray(file[key])) {
      throw new Error(`備份檔缺少 ${key} 資料，可能已經損壞。`)
    }
  }

  const transactions = file.transactions as unknown[]
  transactions.forEach((row, index) => {
    // 只驗會影響金錢正確性的欄位。整份逐欄檢查的成本不划算，
    // 但金額或 id 壞掉的話，寫進去就是一筆對不起來的爛帳。
    const tx = row as Record<string, unknown>
    if (
      typeof tx?.id !== 'string' ||
      typeof tx?.amountMinor !== 'number' ||
      !Number.isFinite(tx.amountMinor) ||
      typeof tx?.date !== 'string'
    ) {
      throw new Error(`備份檔的第 ${index + 1} 筆交易格式不正確。`)
    }
  })

  return file as unknown as BackupFile
}

/**
 * 算出要匯入什麼，但不寫入。
 *
 * 以 id 比對，已存在就跳過而不覆蓋：覆蓋會讓「匯入半年前的備份」把這半年
 * 編輯過的帳改回舊值。跳過最多是沒更新，不會弄丟東西。
 *
 * 分開計算是為了讓畫面先顯示「將新增 N 筆 / 略過 M 筆」讓使用者確認。
 */
export function planImport(
  file: BackupFile,
  existingTransactionIds: ReadonlySet<string>,
  existingRuleIds: ReadonlySet<string>,
): ImportPlan {
  const addTransactions = file.transactions.filter(
    (tx) => !existingTransactionIds.has(tx.id),
  )
  const addRules = file.recurringRules.filter(
    (rule) => !existingRuleIds.has(rule.id),
  )

  return {
    addTransactions,
    skipTransactions: file.transactions.length - addTransactions.length,
    addRules,
    skipRules: file.recurringRules.length - addRules.length,
  }
}

const CSV_HEADER = ['日期', '類型', '分類', '金額', '備註']

/**
 * 匯出成試算表用的 CSV。
 *
 * 這是單向的分析格式，還原不了 —— 它沒有 id、沒有定期規則，也沒有建立時間。
 * 要備份請用 JSON。
 */
export function toCsv(
  transactions: readonly BackupTransaction[],
  categories: readonly BackupCategory[],
): string {
  const nameById = new Map(categories.map((c) => [c.id, c.name]))

  const lines = [...transactions]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((tx) =>
      [
        tx.date,
        tx.type === 'expense' ? '支出' : '收入',
        nameById.get(tx.categoryId) ?? '未知分類',
        // 只有 money.ts 能做 100 倍換算，這裡不自己除。
        // 也不能用 formatAmount：它會加千分位逗號，直接把欄位切成兩半。
        fromMinor(tx.amountMinor).toFixed(2),
        tx.note,
      ]
        .map(escapeField)
        .join(','),
    )

  // 開頭的 BOM 是給 Excel 看的，沒有它中文會開成亂碼。
  return `﻿${[CSV_HEADER.join(','), ...lines].join('\r\n')}\r\n`
}

/** 含有逗號、雙引號或換行的欄位要用雙引號包起來，內部的雙引號寫成兩個。 */
function escapeField(value: string): string {
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

/** 距上次備份多久就該提醒。 */
const BACKUP_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/** 累積幾筆未備份就該提醒。 */
const BACKUP_MAX_ENTRIES = 50

/**
 * 該不該提醒備份。
 *
 * 純本機儲存沒有第二道防線，這個提醒是唯一的保險。但剛裝好的 App 立刻叫人
 * 備份空資料庫沒有意義，所以從沒備份過時還要看有沒有帳。
 */
export function needsBackup(
  settings: { lastBackupAt: number | null; txCountSinceBackup: number },
  now: number,
): boolean {
  if (settings.txCountSinceBackup > BACKUP_MAX_ENTRIES) return true
  if (settings.lastBackupAt === null) return settings.txCountSinceBackup > 0
  return now - settings.lastBackupAt > BACKUP_MAX_AGE_MS
}
