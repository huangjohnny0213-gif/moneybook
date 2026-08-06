import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { todayISO } from '../lib/dates'
import { parseBackup, planImport, toCsv, type ImportPlan } from '../lib/backup'
import { shareFile } from '../lib/share'
import { applyImport, buildBackup, markBackedUp } from '../db/repo'
import { db } from '../db/schema'

interface Pending {
  plan: ImportPlan
  exportedAt: number
}

/** 備份區塊：匯出、匯出 CSV、匯入。 */
export function BackupPanel() {
  // 直接讀而不用 getSettings：後者在沒有紀錄時會寫入預設值，
  // 放進 useLiveQuery 等於在查詢裡做寫入，會多觸發一次自己。
  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Pending | null>(null)
  const [done, setDone] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  async function exportJson() {
    setBusy(true)
    setError('')
    try {
      const backup = await buildBackup()
      const file = new File(
        [JSON.stringify(backup)],
        `moneybook-${todayISO()}.json`,
        { type: 'application/json' },
      )
      await shareFile(file)
      // 只有 JSON 算備份。CSV 還原不了，把它當備份會給人錯誤的安全感。
      await markBackedUp(backup.exportedAt)
      setDone('已匯出備份')
    } catch {
      setError('匯出失敗，請再試一次。')
    } finally {
      setBusy(false)
    }
  }

  async function exportCsv() {
    setBusy(true)
    setError('')
    try {
      const backup = await buildBackup()
      const file = new File(
        [toCsv(backup.transactions, backup.categories)],
        `moneybook-${todayISO()}.csv`,
        { type: 'text/csv' },
      )
      await shareFile(file)
      setDone('已匯出 CSV')
    } catch {
      setError('匯出失敗，請再試一次。')
    } finally {
      setBusy(false)
    }
  }

  async function pickFile(file: File | undefined) {
    if (!file) return
    setError('')
    setDone('')
    try {
      const backup = parseBackup(await file.text())
      const [txIds, ruleIds] = await Promise.all([
        db.transactions.toCollection().primaryKeys(),
        db.recurringRules.toCollection().primaryKeys(),
      ])
      setPending({
        plan: planImport(backup, new Set(txIds), new Set(ruleIds)),
        exportedAt: backup.exportedAt,
      })
    } catch (e) {
      // parseBackup 的訊息本來就是寫給使用者看的，直接顯示比「匯入失敗」有用。
      setError(e instanceof Error ? e.message : '無法讀取這個檔案。')
    }
  }

  async function confirmImport() {
    if (!pending) return
    setBusy(true)
    try {
      await applyImport(pending.plan, pending.exportedAt)
      setDone(`已匯入 ${pending.plan.addTransactions.length} 筆帳`)
      setPending(null)
    } catch {
      setError('匯入失敗，資料庫沒有被修改。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="bg-key px-4 py-1.5 text-xs font-medium text-ink-2">備份</h2>

      <p className="px-4 pt-3 text-xs leading-relaxed text-ink-3">
        資料只存在這支手機裡。{lastBackupLabel(settings?.lastBackupAt ?? null)}
      </p>

      <div className="flex flex-col gap-2 px-4 py-3">
        <button
          type="button"
          onClick={exportJson}
          disabled={busy}
          className="rounded-lg bg-ink py-2.5 text-sm font-semibold text-surface disabled:opacity-40"
        >
          匯出備份
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={busy}
            className="flex-1 rounded-lg bg-key py-2 text-sm text-ink disabled:opacity-40"
          >
            匯出 CSV
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            className="flex-1 rounded-lg bg-key py-2 text-sm text-ink disabled:opacity-40"
          >
            匯入備份
          </button>
        </div>
        <p className="text-xs leading-relaxed text-ink-3">
          CSV 是給試算表分析用的，<b className="font-semibold">還原不了</b>
          ，備份請用上面那顆。
        </p>

        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            pickFile(e.target.files?.[0])
            // 清掉 value，否則連續選同一個檔案不會觸發 change。
            e.target.value = ''
          }}
        />

        {error && <p className="text-xs leading-relaxed text-[#d03b3b]">{error}</p>}
        {done && <p className="text-xs text-ink-2">{done}</p>}
      </div>

      {pending && (
        <ImportPreview
          plan={pending.plan}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={confirmImport}
        />
      )}
    </section>
  )
}

function lastBackupLabel(lastBackupAt: number | null): string {
  if (lastBackupAt === null) return '還沒有備份過。'
  const days = Math.floor((Date.now() - lastBackupAt) / (24 * 60 * 60 * 1000))
  if (days === 0) return '今天已經備份過。'
  return `上次備份是 ${days} 天前。`
}

function ImportPreview({
  plan,
  busy,
  onCancel,
  onConfirm,
}: {
  plan: ImportPlan
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const nothingToDo =
    plan.addTransactions.length === 0 && plan.addRules.length === 0

  return (
    <div className="fixed inset-0 z-10 flex flex-col justify-end bg-black/40">
      <button
        type="button"
        aria-label="關閉"
        onClick={onCancel}
        className="flex-1"
        tabIndex={-1}
      />
      <div className="rounded-t-2xl bg-raised px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <h2 className="mb-3 text-sm font-medium text-ink-2">確認匯入</h2>

        <ul className="flex flex-col gap-1 text-sm">
          <li>
            將新增 <b className="tabular-nums">{plan.addTransactions.length}</b> 筆帳
            {plan.skipTransactions > 0 && (
              <span className="text-ink-3">
                ，略過已存在的 {plan.skipTransactions} 筆
              </span>
            )}
          </li>
          <li>
            將新增 <b className="tabular-nums">{plan.addRules.length}</b> 條定期規則
            {plan.skipRules > 0 && (
              <span className="text-ink-3">，略過 {plan.skipRules} 條</span>
            )}
          </li>
        </ul>

        <p className="mt-2 text-xs leading-relaxed text-ink-3">
          {nothingToDo
            ? '這份備份裡的資料都已經在這台裝置上了。'
            : '已存在的帳不會被覆蓋，分類的 emoji 與顏色也維持目前的設定。'}
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg bg-key px-4 py-2.5 text-sm font-medium text-ink-2"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || nothingToDo}
            className="rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-surface disabled:opacity-40"
          >
            匯入
          </button>
        </div>
      </div>
    </div>
  )
}
