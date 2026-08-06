import { useLiveQuery } from 'dexie-react-hooks'
import { swapCategoryColor } from '../lib/categoryColors'
import { categoryGlyph, firstGrapheme } from '../lib/glyph'
import { CATEGORICAL_LIGHT } from '../lib/palette'
import { listAllCategories, updateCategoryStyle } from '../db/repo'
import type { Category } from '../db/schema'

/**
 * 分類外觀設定。
 *
 * 只開放改 emoji 與顏色。名稱與 id 不能改：歷史交易只存 categoryId，
 * 把「飲食」改成「房租」會讓過去半年的午餐全部變成房租。
 */
export function CategoryStyle() {
  const categories = useLiveQuery(listAllCategories, [], [] as Category[])

  async function pickColor(target: Category, color: string) {
    // 八色八類，換色幾乎必然撞色。撞到就兩邊對調，維持每類一色。
    const changes = swapCategoryColor(categories, target.id, color)
    await Promise.all(
      changes.map((change) => updateCategoryStyle(change.id, { color: change.color })),
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <p className="px-4 pt-4 pb-3 text-xs leading-relaxed text-ink-3">
        還沒設 emoji 的分類會顯示名稱首字。顏色只能在這八色之間對調，
        它們經過色盲檢測，換過去圖表仍然分得出來。
      </p>

      {['expense', 'income'].map((type) => (
        <section key={type}>
          <h2 className="bg-key px-4 py-1.5 text-xs font-medium text-ink-2">
            {type === 'expense' ? '支出' : '收入'}
          </h2>
          {categories
            .filter((category) => category.type === type)
            .map((category) => (
              <div
                key={category.id}
                className="border-b border-hairline px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base text-white"
                    style={{ background: category.color }}
                  >
                    {categoryGlyph(category)}
                  </span>
                  <span className="flex-1 text-sm">{category.name}</span>
                  <input
                    value={category.emoji}
                    onChange={(e) =>
                      updateCategoryStyle(category.id, {
                        // 只留第一個字位群集，貼一整串進來也不會壞。
                        emoji: firstGrapheme(e.target.value),
                      })
                    }
                    placeholder="emoji"
                    aria-label={`${category.name}的 emoji`}
                    className="w-20 rounded-lg bg-key px-2 py-1.5 text-center placeholder:text-xs placeholder:text-ink-3"
                  />
                </div>

                <div className="mt-2.5 flex gap-2 pl-13">
                  {CATEGORICAL_LIGHT.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => pickColor(category, color)}
                      aria-label={`把${category.name}換成這個顏色`}
                      aria-pressed={category.color === color}
                      className="h-7 w-7 rounded-full"
                      style={{
                        background: color,
                        // 選中的色票用外環標示，不靠亮度差 ——
                        // 八個色階本來就刻意亮度相近，靠亮度看不出來。
                        boxShadow:
                          category.color === color
                            ? '0 0 0 2px var(--surface), 0 0 0 4px var(--ink)'
                            : undefined,
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
        </section>
      ))}
    </div>
  )
}
