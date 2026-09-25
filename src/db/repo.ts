import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  type BackupFile,
  type ImportPlan,
} from '../lib/backup'
import type { DueItem } from '../lib/recurring'
import type { TxType } from '../types'
import {
  DEFAULT_SETTINGS,
  db,
  type Category,
  type MailImport,
  type RecurringRule,
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

let lastTimestamp = 0

/**
 * 嚴格遞增的時間戳。同一毫秒內連續呼叫時往後推 1ms，不會回傳相同值。
 *
 * Date.now() 的解析度只到毫秒，而定期支出確認與備份匯入都會一次寫入多筆。
 * 時間戳一旦相同，列表排序就會平手並退回 Dexie 的主鍵（隨機 UUID）順序，
 * 使用者每次重新整理都會看到順序亂跳。代價是尖峰時的時間戳與壁鐘差幾毫秒，
 * 這個 App 沒有任何地方在意這種等級的誤差。
 */
function nextTimestamp(): number {
  const now = Date.now()
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1
  return lastTimestamp
}

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
  const now = nextTimestamp()
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
  await db.transactions.update(id, { ...patch, updatedAt: nextTimestamp() })
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

/**
 * 取一段日期區間內的所有帳，含頭尾。近六月趨勢用。
 *
 * 日期是等寬字串所以可以直接做字典序比較，走 date 索引不必全表掃描。
 */
export async function listTransactionsBetween(
  startDate: string,
  endDate: string,
): Promise<Transaction[]> {
  const rows = await db.transactions
    .where('date')
    .between(startDate, endDate, true, true)
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

/**
 * 取某類型可用的分類，已封存的不回傳，依 sortOrder 排序。
 *
 * archived 刻意沒有索引（見 schema.ts），所以在 JS 端過濾。
 * 分類只有個位數筆，全部撈出來再篩不會有效能問題。
 */
export async function listCategories(type: TxType): Promise<Category[]> {
  const rows = await db.categories.where('type').equals(type).toArray()
  return rows
    .filter((c) => !c.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** 取全部分類（含已封存），支出在前收入在後，各自依 sortOrder。分類設定畫面用。 */
export async function listAllCategories(): Promise<Category[]> {
  const rows = await db.categories.toArray()
  return rows.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'expense' ? -1 : 1
    return a.sortOrder - b.sortOrder
  })
}

/** 讀出全部資料組成備份檔。 */
export async function buildBackup(): Promise<BackupFile> {
  const [transactions, categories, recurringRules] = await Promise.all([
    db.transactions.toArray(),
    db.categories.toArray(),
    db.recurringRules.toArray(),
  ])

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    transactions,
    categories,
    recurringRules,
  }
}

/**
 * 套用匯入計畫。
 *
 * 全部寫入包在同一個交易裡，中途失敗整批回滾 ——
 * 匯入到一半的資料庫比沒匯入更糟，而且使用者不會知道缺了哪些。
 *
 * 刻意不寫入分類：依使用者的決定，分類樣式維持這台裝置目前的設定。
 * 交易的 categoryId 仍然對得上，因為分類 id 是固定 slug，
 * 每台裝置 seed 出來的都一樣。
 */
export async function applyImport(
  plan: ImportPlan,
  exportedAt: number,
): Promise<void> {
  await db.transaction(
    'rw',
    db.transactions,
    db.recurringRules,
    db.settings,
    async () => {
      if (plan.addTransactions.length > 0) {
        await db.transactions.bulkAdd(plan.addTransactions)
      }
      if (plan.addRules.length > 0) {
        await db.recurringRules.bulkAdd(plan.addRules)
      }

      // 用備份檔的時間而非現在的時間：還原一個兩個月前的舊備份時，
      // 提醒應該要正確地立刻出現。
      const settings = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
      await db.settings.put({
        ...settings,
        lastBackupAt: exportedAt,
        txCountSinceBackup: 0,
      })
    },
  )
}

/**
 * 記下這次備份，重置提醒的計數。
 *
 * 讀取與寫回包在交易裡：中間若有新的一筆帳寫入，分開做會把那次的
 * txCountSinceBackup 增量吃掉。
 */
export async function markBackedUp(at: number): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const settings = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
    await db.settings.put({
      ...settings,
      lastBackupAt: at,
      txCountSinceBackup: 0,
    })
  })
}

/** 新增規則時由呼叫端提供的欄位，其餘由這一層補上。 */
export type RecurringDraft = Omit<RecurringRule, 'id' | 'lastGeneratedMonth'>

/**
 * 列出所有定期規則，含已停用的。
 *
 * active 是布林欄位所以沒有索引（IndexedDB 不接受布林鍵），
 * 要篩選在 JS 端做即可，這張表只有個位數筆。
 */
export async function listRecurringRules(): Promise<RecurringRule[]> {
  return db.recurringRules.toArray()
}

/** 新增一條規則。lastGeneratedMonth 起始為空字串，代表還沒產生過任何一筆。 */
export async function addRecurringRule(
  draft: RecurringDraft,
): Promise<RecurringRule> {
  const rule: RecurringRule = {
    ...draft,
    id: crypto.randomUUID(),
    lastGeneratedMonth: '',
  }
  await db.recurringRules.add(rule)
  return rule
}

export async function updateRecurringRule(
  id: string,
  patch: Partial<RecurringDraft>,
): Promise<void> {
  await db.recurringRules.update(id, patch)
}

/**
 * 刪除規則。
 *
 * 刻意不連帶刪除它產生過的交易：那些是真實發生過的帳，
 * 規則只是產生它們的模板，模板沒了不代表房租沒繳過。
 */
export async function deleteRecurringRule(id: string): Promise<void> {
  await db.recurringRules.delete(id)
}

/**
 * 確認一筆待確認的定期帳：寫入交易並推進鎖。
 *
 * **這兩件事必須在同一個交易裡完成。** 分兩步做的話，中間當掉會留下
 * 「交易已寫入但鎖沒推進」的狀態，下次開 App 又跳出同一筆，變成重複記帳 ——
 * 那正是 lastGeneratedMonth 這個鎖要防的事，分兩步等於自己把鎖拆了。
 *
 * amountMinor 獨立傳入而不直接用 item 裡的值，因為水電費這類帳每個月的
 * 數字都不一樣，確認時要能當場改。
 */
export async function confirmDueItem(
  item: DueItem,
  amountMinor: number,
): Promise<void> {
  const now = nextTimestamp()
  const tx: Transaction = {
    id: crypto.randomUUID(),
    type: item.type,
    amountMinor,
    date: item.date,
    categoryId: item.categoryId,
    note: item.note,
    // 記下來源，日後才分得出哪些帳是自動產生的。
    recurringId: item.ruleId,
    createdAt: now,
    updatedAt: now,
  }

  await db.transaction(
    'rw',
    db.transactions,
    db.settings,
    db.recurringRules,
    async () => {
      await db.transactions.add(tx)

      const settings = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
      await db.settings.put({
        ...settings,
        txCountSinceBackup: settings.txCountSinceBackup + 1,
      })

      await db.recurringRules.update(item.ruleId, {
        lastGeneratedMonth: item.month,
      })
    },
  )
}

/**
 * 跳過一筆待確認的定期帳：只推進鎖，不寫交易。
 *
 * 跳過也必須推進鎖，否則下次開 App 又會跳出來，「跳過」就等於沒有作用。
 */
export async function skipDueItem(item: DueItem): Promise<void> {
  await db.recurringRules.update(item.ruleId, {
    lastGeneratedMonth: item.month,
  })
}

/**
 * 只改分類的顯示樣式。
 *
 * 刻意不開放改 name 與 type：歷史交易只存 categoryId，改名稱會讓舊帳的意義
 * 悄悄變掉（把「飲食」改成「房租」，過去半年的午餐就全變成房租了）。
 */
export async function updateCategoryStyle(
  id: string,
  style: { emoji?: string; color?: string },
): Promise<void> {
  await db.categories.update(id, style)
}

/** 待確認的郵件匯入，新到舊。 */
export async function listPendingImports(): Promise<MailImport[]> {
  const rows = await db.mailImports.where('status').equals('pending').toArray()
  return rows.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.receivedAt - a.receivedAt,
  )
}

/**
 * 每個 label 上次確認時選的分類，當作下一筆的預設。
 *
 * 從確認過的匯入紀錄推回來，不另開一張表：那份資訊本來就在這裡，
 * 另存一份就多一份要同步的東西。
 */
export async function listImportCategoryHints(): Promise<Map<string, string>> {
  const rows = await db.mailImports.where('status').equals('confirmed').toArray()
  const hints = new Map<string, string>()
  // 舊的先寫、新的後寫，同一個 label 最後留下的是最近一次的選擇。
  for (const row of rows.sort((a, b) => a.receivedAt - b.receivedAt)) {
    if (row.categoryId) hints.set(row.label, row.categoryId)
  }
  return hints
}

/**
 * 把這次同步抓到的付款存起來，回傳真正新增的筆數。
 *
 * 已經存在的 id 一律跳過，不論它現在是待確認、已確認還是已略過 ——
 * 同步刻意有重疊，覆寫的話略過的付款會一直跑回來。
 */
export async function ingestMailImports(
  rows: Omit<MailImport, 'status'>[],
  syncedAt: number,
  unreadable: string[],
): Promise<number> {
  return db.transaction('rw', db.mailImports, db.settings, async () => {
    const existing = await db.mailImports.bulkGet(rows.map((row) => row.id))
    const fresh = rows.filter((_, index) => !existing[index])
    // 同一批裡也可能有重複的 id（同一封信出現在兩個對話串裡）。
    const unique = [...new Map(fresh.map((row) => [row.id, row])).values()]

    await db.mailImports.bulkAdd(
      unique.map((row) => ({ ...row, status: 'pending' as const })),
    )

    const settings = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
    await db.settings.put({
      ...settings,
      mailSyncedAt: syncedAt,
      mailSyncError: '',
      mailUnreadable: unreadable,
    })
    return unique.length
  })
}

/** 記下同步失敗的原因。不動 mailSyncedAt，下次從同一個時間點重抓。 */
export async function recordMailSyncError(message: string): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const settings = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
    await db.settings.put({ ...settings, mailSyncError: message })
  })
}

/**
 * 確認一筆匯入：寫成支出，並把匯入標成已確認。
 *
 * 兩件事在同一個交易裡，理由同 confirmDueItem：中間斷掉的話會留下
 * 「帳記了但匯入還是待確認」，下次再按一次就重複記帳。
 * 已經不是待確認的直接忽略，連點兩下確認不會記兩筆。
 */
export async function confirmMailImport(
  id: string,
  categoryId: string,
): Promise<void> {
  await db.transaction(
    'rw',
    db.mailImports,
    db.transactions,
    db.settings,
    async () => {
      const item = await db.mailImports.get(id)
      if (!item || item.status !== 'pending') return

      const now = nextTimestamp()
      await db.transactions.add({
        id: crypto.randomUUID(),
        type: 'expense',
        amountMinor: item.amountMinor,
        date: item.date,
        categoryId,
        note: item.label,
        createdAt: now,
        updatedAt: now,
      })

      const settings = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
      await db.settings.put({
        ...settings,
        txCountSinceBackup: settings.txCountSinceBackup + 1,
      })

      await db.mailImports.update(id, { status: 'confirmed', categoryId })
    },
  )
}

/** 略過一筆匯入，例如轉帳給自己的另一個帳戶、或繳已經記過的卡費。 */
export async function dismissMailImport(id: string): Promise<void> {
  await db.transaction('rw', db.mailImports, async () => {
    const item = await db.mailImports.get(id)
    if (item?.status === 'pending') {
      await db.mailImports.update(id, { status: 'dismissed' })
    }
  })
}

/**
 * 存 Apps Script 的網址與密碼。
 *
 * 不重設 mailSyncedAt：重新連線時接著上次的進度抓，而不是又從七天前開始，
 * 讓一堆已經處理過的付款重新出現。
 */
export async function saveMailBridge(url: string, token: string): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const settings = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
    await db.settings.put({
      ...settings,
      mailBridgeUrl: url.trim(),
      mailBridgeToken: token.trim(),
      mailSyncError: '',
    })
  })
}

/** 中斷連線。已經抓回來的待確認付款保留，使用者仍然可以處理完。 */
export async function clearMailBridge(): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const settings = (await db.settings.get('app')) ?? DEFAULT_SETTINGS
    await db.settings.put({
      ...settings,
      mailBridgeUrl: '',
      mailBridgeToken: '',
      mailSyncError: '',
    })
  })
}
