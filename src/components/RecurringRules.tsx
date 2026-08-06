import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { RuleEditor } from './RuleEditor'
import { useTheme } from './themeContext'
import { categoryGlyph } from '../lib/glyph'
import { formatAmount } from '../lib/money'
import {
  deleteRecurringRule,
  listAllCategories,
  listRecurringRules,
  updateRecurringRule,
} from '../db/repo'
import type { Category, RecurringRule } from '../db/schema'

/** 定期支出的規則管理。 */
export function RecurringRules() {
  const rules = useLiveQuery(listRecurringRules, [], [] as RecurringRule[])
  const categories = useLiveQuery(listAllCategories, [], [] as Category[])
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null)
  const { seriesColor } = useTheme()

  const byId = new Map(categories.map((c) => [c.id, c]))

  return (
    <section>
      <h2 className="bg-key px-4 py-1.5 text-xs font-medium text-ink-2">
        定期支出
      </h2>

      {rules.length === 0 && (
        <p className="px-4 pt-3 text-xs leading-relaxed text-ink-3">
          房租、電信費這類每月固定的帳可以設成規則。每次開 App
          會把到期但還沒記的列出來讓你確認，不會自動記進去。
        </p>
      )}

      {rules.map((rule) => {
        const category = byId.get(rule.categoryId)
        return (
          <div
            key={rule.id}
            className="flex items-center gap-3 border-b border-hairline px-4 py-2.5"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm text-white"
              style={{
                background: category
                  ? seriesColor(category.color)
                  : 'var(--ink-3)',
                // 停用的規則整個調淡，但不隱藏 —— 藏起來會讓人以為被刪掉了。
                opacity: rule.active ? 1 : 0.4,
              }}
            >
              {category ? categoryGlyph(category) : '?'}
            </span>

            <button
              type="button"
              onClick={() => setEditing(rule)}
              className="min-w-0 flex-1 text-left"
            >
              <span
                className={`block truncate text-sm ${
                  rule.active ? 'text-ink' : 'text-ink-3'
                }`}
              >
                {rule.note || category?.name || '定期支出'}
                {!rule.active && '（已停用）'}
              </span>
              <span className="block text-xs text-ink-3">
                每月 {rule.dayOfMonth} 號 ·{' '}
                <span className="tabular-nums">
                  {formatAmount(rule.amountMinor)}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                updateRecurringRule(rule.id, { active: !rule.active })
              }
              className="shrink-0 rounded-lg bg-key px-3 py-1.5 text-xs text-ink-2"
            >
              {rule.active ? '停用' : '啟用'}
            </button>
          </div>
        )
      })}

      <div className="px-4 py-3">
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="w-full rounded-lg bg-key py-2 text-sm font-medium text-ink"
        >
          新增定期支出
        </button>
      </div>

      {editing && (
        <RuleEditor
          rule={editing === 'new' ? null : editing}
          categories={categories.filter((c) => !c.archived)}
          onClose={() => setEditing(null)}
          onDelete={
            editing === 'new'
              ? undefined
              : async () => {
                  await deleteRecurringRule(editing.id)
                  setEditing(null)
                }
          }
        />
      )}
    </section>
  )
}
