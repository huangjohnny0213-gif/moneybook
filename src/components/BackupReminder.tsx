import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { needsBackup } from '../lib/backup'
import { db } from '../db/schema'

/**
 * 備份提醒。
 *
 * 純本機儲存沒有第二道防線，這個提醒是唯一的保險，所以用橫幅而不是紅點 ——
 * 定期支出漏了頂多少記一筆，備份漏了是整本帳消失。
 */
export function BackupReminder({ onGoToBackup }: { onGoToBackup: () => void }) {
  // 只關這一次開啟期間，不寫進資料庫。永久關掉等於把唯一的保險絲拔了，
  // 而下次開 App 再提醒一次的成本很低。
  const [dismissed, setDismissed] = useState(false)
  const settings = useLiveQuery(() => db.settings.get('app'), [], undefined)

  if (dismissed || !settings || !needsBackup(settings, Date.now())) return null

  return (
    <div className="flex items-center gap-2 border-b border-hairline bg-key px-4 py-2.5">
      <p className="flex-1 text-xs leading-relaxed text-ink-2">
        {settings.lastBackupAt === null
          ? '還沒備份過。手機掉了或重置 Safari 資料，這本帳就沒了。'
          : '距離上次備份有一段時間了，建議匯出一份。'}
      </p>
      <button
        type="button"
        onClick={onGoToBackup}
        className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-surface"
      >
        去備份
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="這次先不要"
        className="shrink-0 px-1 text-lg leading-none text-ink-3"
      >
        ×
      </button>
    </div>
  )
}
