import {
  DEFAULT_SETTINGS,
  db,
  type Settings,
  type Transaction,
} from './schema'

/**
 * 資料存取層：所有讀寫 IndexedDB 的動作都走這裡。
 * 畫面不直接碰 db，日後要加雲端同步時只需要包住這一層。
 */

/** 新增一筆帳時由呼叫端提供的欄位，其餘由這一層補上。 */
export type TransactionDraft = Omit<
  Transaction,
  'id' | 'createdAt' | 'updatedAt'
>

/** 讀取設定，不存在時建立預設值。 */
export async function getSettings(): Promise<Settings> {
  const existing = await db.settings.get('app')
  if (existing) return existing
  await db.settings.put(DEFAULT_SETTINGS)
  return { ...DEFAULT_SETTINGS }
}

/** 新增一筆帳，同時累加未備份筆數。 */
export async function addTransaction(
  draft: TransactionDraft,
): Promise<Transaction> {
  const now = Date.now()
  const tx: Transaction = {
    ...draft,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  }

  await db.transaction('rw', db.transactions, db.settings, async () => {
    await db.transactions.add(tx)
    const settings = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
    await db.settings.put({
      ...settings,
      txCountSinceBackup: settings.txCountSinceBackup + 1,
    })
  })

  return tx
}

/** 修改一筆帳。編輯不算新增，不影響未備份筆數。 */
export async function updateTransaction(
  id: string,
  patch: Partial<TransactionDraft>,
): Promise<void> {
  await db.transactions.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id)
}

/**
 * 依日期新到舊排序，同一天則以後記錄的排前面。
 * 日期是等寬字串，可以直接做字典序比較。
 */
function byNewestFirst(a: Transaction, b: Transaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return b.createdAt - a.createdAt
}

/** 取某個月份（'YYYY-MM'）的所有帳。 */
export async function listTransactionsByMonth(
  monthKey: string,
): Promise<Transaction[]> {
  // 字串範圍查詢：'2026-08-01' <= date <= '2026-08-31' 用前綴上下界表達，
  // 不需要知道當月有幾天。'-' 之後的字元都比數字大，所以用 '.' 當下界、'/' 當上界。
  const rows = await db.transactions
    .where('date')
    .between(`${monthKey}-`, `${monthKey}.`, true, false)
    .toArray()
  return rows.sort(byNewestFirst)
}

/** 取最近幾筆，不限月份。 */
export async function listRecentTransactions(
  limit: number,
): Promise<Transaction[]> {
  const rows = await db.transactions.orderBy('date').reverse().toArray()
  return rows.sort(byNewestFirst).slice(0, limit)
}
