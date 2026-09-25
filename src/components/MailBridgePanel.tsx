import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { checkBridgeUrl } from '../lib/mailBridge'
import { syncMailImports, type SyncResult } from '../db/mailSync'
import { clearMailBridge, saveMailBridge } from '../db/repo'
import { db } from '../db/schema'

const GUIDE_URL =
  'https://github.com/huangjohnny0213-gif/moneybook/blob/main/docs/mail-import.md'

/** 郵局通知的連線設定：Apps Script 的網址與密碼、同步狀態。 */
export function MailBridgePanel() {
  // 直接讀而不用 getSettings，理由同 BackupPanel：查詢裡不能寫入。
  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)
  const connected = Boolean(settings?.mailBridgeUrl && settings?.mailBridgeToken)

  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState('')

  function report(result: SyncResult) {
    // 失敗原因由 settings.mailSyncError 顯示，這裡只說成功的結果。
    if (result.status === 'ok') {
      setDone(
        result.added > 0
          ? `抓到 ${result.added} 筆新的付款，在上面的待確認清單裡。`
          : '已同步，沒有新的付款。',
      )
    } else {
      setDone('')
    }
  }

  async function saveAndSync() {
    const problem = checkBridgeUrl(url)
    if (problem) return setFormError(problem)
    if (token.trim() === '') return setFormError('請貼上密碼。')

    setFormError('')
    setBusy(true)
    try {
      await saveMailBridge(url, token)
      setEditing(false)
      report(await syncMailImports())
    } finally {
      setBusy(false)
    }
  }

  async function syncNow() {
    setBusy(true)
    setDone('')
    try {
      report(await syncMailImports())
    } finally {
      setBusy(false)
    }
  }

  function startEditing() {
    setUrl(settings?.mailBridgeUrl ?? '')
    setToken(settings?.mailBridgeToken ?? '')
    setFormError('')
    setDone('')
    setEditing(true)
  }

  return (
    <section>
      <h2 className="bg-key px-4 py-1.5 text-xs font-medium text-ink-2">
        郵局通知
      </h2>

      {editing ? (
        <div className="flex flex-col gap-2 px-4 py-3">
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            Apps Script 網址
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://script.google.com/macros/s/…/exec"
              className="rounded-lg bg-key px-3 py-2 text-ink placeholder:text-ink-3"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-3">
            密碼
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              // 不用 password 型別：這串是從執行記錄複製來的，看得到才能確認沒貼錯。
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="rounded-lg bg-key px-3 py-2 font-mono text-ink"
            />
          </label>
          {formError && (
            <p className="text-xs leading-relaxed text-[#d03b3b]">{formError}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-lg bg-key px-4 py-2 text-sm font-medium text-ink-2"
            >
              取消
            </button>
            <button
              type="button"
              onClick={saveAndSync}
              disabled={busy}
              className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-surface disabled:opacity-40"
            >
              儲存並同步
            </button>
          </div>
        </div>
      ) : connected ? (
        <div className="flex flex-col gap-2 px-4 py-3">
          <p className="text-xs leading-relaxed text-ink-3">
            {syncedLabel(settings?.mailSyncedAt)}每次打開 App 會自動同步。
          </p>
          {settings?.mailSyncError && (
            <p className="text-xs leading-relaxed text-[#d03b3b]">
              {settings.mailSyncError}
            </p>
          )}
          {!!settings?.mailUnreadable?.length && (
            <p className="text-xs leading-relaxed text-ink-3">
              上次有 {settings.mailUnreadable.length} 封信看不懂，沒有匯入：
              {[...new Set(settings.mailUnreadable)].join('、')}
            </p>
          )}
          {done && <p className="text-xs text-ink-2">{done}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={syncNow}
              disabled={busy}
              className="flex-1 rounded-lg bg-key py-2 text-sm text-ink disabled:opacity-40"
            >
              {busy ? '同步中…' : '立即同步'}
            </button>
            <button
              type="button"
              onClick={startEditing}
              disabled={busy}
              className="flex-1 rounded-lg bg-key py-2 text-sm text-ink disabled:opacity-40"
            >
              修改設定
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setDone('')
              void clearMailBridge()
            }}
            disabled={busy}
            className="self-start py-1 text-xs text-ink-3 underline underline-offset-2 disabled:opacity-40"
          >
            中斷連線
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 px-4 py-3">
          <p className="text-xs leading-relaxed text-ink-3">
            連上你自己 Gmail 裡的 Apps Script，打開 App 時會自動抓郵局的扣款與轉帳通知，
            選好分類就能入帳。沒有第三方伺服器。
            <a
              href={GUIDE_URL}
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-ink-2 underline underline-offset-2"
            >
              設定方式
            </a>
          </p>
          <button
            type="button"
            onClick={startEditing}
            className="rounded-lg bg-key py-2 text-sm text-ink"
          >
            設定連線
          </button>
        </div>
      )}
    </section>
  )
}

function syncedLabel(at: number | undefined): string {
  if (!at) return '還沒同步過。'
  const when = new Date(at).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return `上次同步：${when}。`
}
