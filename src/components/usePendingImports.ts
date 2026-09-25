import { useLiveQuery } from 'dexie-react-hooks'
import { listPendingImports } from '../db/repo'
import type { MailImport } from '../db/schema'

/**
 * 待確認的郵局通知付款。
 *
 * 和 useDueItems 一樣抽成共用 hook：設定頁的清單與底部分頁的紅點要看到同一份。
 */
export function usePendingImports(): MailImport[] {
  return useLiveQuery(listPendingImports, [], [] as MailImport[])
}
