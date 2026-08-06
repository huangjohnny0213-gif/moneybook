import { useLiveQuery } from 'dexie-react-hooks'
import { todayISO } from '../lib/dates'
import { expandDueRules, type DueItem } from '../lib/recurring'
import { listRecurringRules } from '../db/repo'

/**
 * 目前待確認的定期帳。
 *
 * 抽成共用 hook 而不是各自算一次：設定頁的清單與底部分頁的紅點必須看到
 * 同一份結果，各算各的會在確認到一半時對不起來（清單少一筆但紅點還在）。
 *
 * 日期在每次渲染時取，不放進 state：App 掛在背景跨過午夜再回來時，
 * 快取住的「今天」會讓昨天該補的帳直到重開才出現。
 */
export function useDueItems(): DueItem[] {
  const rules = useLiveQuery(listRecurringRules, [], [])
  return expandDueRules(rules, todayISO())
}
