import Dexie, { type EntityTable } from 'dexie'
import type { TxType } from '../types'

/** 一筆帳。金額為整數分，日期為本地 'YYYY-MM-DD'。 */
export interface Transaction {
  id: string
  type: TxType
  amountMinor: number
  date: string
  categoryId: string
  note: string
  /** 由哪條定期規則產生，手動記帳則沒有。 */
  recurringId?: string
  createdAt: number
  updatedAt: number
}

/** 分類。用 archived 淘汰而非刪除，否則歷史交易會變成孤兒。 */
export interface Category {
  id: string
  name: string
  type: TxType
  emoji: string
  color: string
  sortOrder: number
  archived: boolean
}

/** 定期支出/收入規則。lastGeneratedMonth 是防止重複產生的鎖。 */
export interface RecurringRule {
  id: string
  type: TxType
  amountMinor: number
  categoryId: string
  note: string
  /** 1-31，超過當月天數時夾到月底。 */
  dayOfMonth: number
  startDate: string
  endDate?: string
  active: boolean
  /** 'YYYY-MM'，已經處理到哪個月。空字串代表還沒開始。 */
  lastGeneratedMonth: string
}

/** 全域設定，永遠只有 id 為 'app' 的單一列。 */
export interface Settings {
  id: 'app'
  lastBackupAt: number | null
  txCountSinceBackup: number
}

export class MoneybookDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  categories!: EntityTable<Category, 'id'>
  recurringRules!: EntityTable<RecurringRule, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'moneybook') {
    super(name)
    // 刻意不索引 archived / active：IndexedDB 不接受布林值當索引鍵，
    // 寫進去的記錄不會報錯但會查不到。這兩張表都很小，在 JS 端過濾即可。
    this.version(1).stores({
      transactions: 'id, date, categoryId, type',
      categories: 'id, type, sortOrder',
      recurringRules: 'id',
      settings: 'id',
    })
  }
}

export const db = new MoneybookDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  lastBackupAt: null,
  txCountSinceBackup: 0,
}
