import Dexie, { type EntityTable } from 'dexie'
import type { PaymentKind } from '../lib/postalMail'
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

/**
 * 從郵局通知信抓到、等使用者確認的一筆付款。
 *
 * 確認或略過之後不刪除，只改 status：同步時會刻意往回多抓兩天，
 * 刪掉的話同一封信下次又會跑回待確認清單。
 */
export interface MailImport {
  /** Gmail 的訊息 id。 */
  id: string
  receivedAt: number
  kind: PaymentKind
  amountMinor: number
  date: string
  label: string
  /** 用字串而不用布林：這個欄位要建索引，IndexedDB 不接受布林鍵。 */
  status: 'pending' | 'confirmed' | 'dismissed'
  /** 確認時選的分類。下一筆同樣 label 的付款拿它當預設。 */
  categoryId?: string
}

/** 全域設定，永遠只有 id 為 'app' 的單一列。 */
export interface Settings {
  id: 'app'
  lastBackupAt: number | null
  txCountSinceBackup: number
  /**
   * 郵件匯入的 Apps Script 網址與密碼。沒設定時整個功能不啟動，
   * App 照樣完全離線可用。
   *
   * 這幾個欄位是可選的：舊版本存下來的設定列沒有它們，不必為此寫升級程式。
   */
  mailBridgeUrl?: string
  mailBridgeToken?: string
  /** 上次同步成功時 Apps Script 那端的時間。用對方的時鐘，手機時間不準也不會漏信。 */
  mailSyncedAt?: number
  /** 上次同步失敗的原因，成功後清空。 */
  mailSyncError?: string
  /** 上次同步時看不懂的信的主旨，給除錯用。 */
  mailUnreadable?: string[]
}

export class MoneybookDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>
  categories!: EntityTable<Category, 'id'>
  recurringRules!: EntityTable<RecurringRule, 'id'>
  settings!: EntityTable<Settings, 'id'>
  mailImports!: EntityTable<MailImport, 'id'>

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
    // 只列新增的表，其餘沿用上一版。Dexie 升級時既有的資料原封不動。
    this.version(2).stores({
      mailImports: 'id, status',
    })
  }
}

export const db = new MoneybookDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  lastBackupAt: null,
  txCountSinceBackup: 0,
}
