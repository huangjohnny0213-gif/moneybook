import { useTheme } from './themeContext'
import { categoryGlyph } from '../lib/glyph'
import { formatAmount } from '../lib/money'
import type { CategorySlice } from '../lib/stats'
import type { Category } from '../db/schema'

interface Props {
  slices: CategorySlice[]
  categories: Map<string, Category>
}

/**
 * 分類排行條。
 *
 * 用排行條而不是圓餅圖：讀者要回答的是「哪一類最大」與「差多少」，
 * 長度可以直接比較，圓餅的相鄰扇形大小很難目測，中文標籤也要外接引線才放得下。
 *
 * 條長按**最大值**等比例而非按 100%。房租佔 88% 時，按 100% 會讓其餘五類的條
 * 全部短到看不出差別，而那五類之間誰多誰少正是使用者想知道的。
 *
 * 只排支出：這個 App 的目的是事後分析錢花到哪，收入只有兩類、排行沒有資訊量，
 * 收入總額在上方的合計已經看得到。
 */
export function CategoryRank({ slices, categories }: Props) {
  const { seriesColor } = useTheme()
  if (slices.length === 0) return null

  const max = slices[0].amountMinor

  return (
    <section className="border-b border-hairline px-4 py-3">
      <h2 className="mb-2 text-xs text-ink-3">支出佔比</h2>
      <ul className="flex flex-col gap-2.5">
        {slices.map((slice) => {
          const category = categories.get(slice.categoryId)
          const color = seriesColor(category?.color ?? '#898781')
          return (
            <li key={slice.categoryId}>
              <div className="flex items-baseline gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="flex h-5 w-5 shrink-0 translate-y-1 items-center justify-center rounded-full text-[10px] text-white"
                  style={{ background: color }}
                >
                  {category ? categoryGlyph(category) : '?'}
                </span>
                {/* 文字一律用文字色，不塗成該類的顏色 —— 顏色的工作是標示身分，
                    由左邊的色點負責，數字要保持可讀。 */}
                <span className="min-w-0 flex-1 truncate text-ink">
                  {category?.name ?? '未知分類'}
                </span>
                <span className="tabular-nums text-ink">
                  {formatAmount(slice.amountMinor)}
                </span>
                <span className="w-9 text-right tabular-nums text-ink-3">
                  {slice.sharePercent}%
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-key">
                <div
                  className="h-full rounded-full"
                  style={{
                    // 留最小寬度：單一分類佔到八成以上時，其餘各類相對它不到 5%，
                    // 條會細到完全看不見，看起來像那幾類是 0。
                    width: `${Math.max((slice.amountMinor / max) * 100, 2)}%`,
                    background: color,
                  }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
