import type { ReactNode } from 'react'
import type { AmountKey } from '../lib/amountInput'

interface Props {
  onKey: (key: AmountKey) => void
  onSubmit: () => void
  submitLabel: string
  submitDisabled: boolean
}

/** 左邊三欄的按鍵，依實際排列由上到下、由左到右。 */
const PAD: AmountKey[] = [
  '7', '8', '9',
  '4', '5', '6',
  '1', '2', '3',
  '0', '00', '.',
]

/**
 * 自製數字鍵盤。
 *
 * 不用 <input type="number"> 是因為 iOS 的系統鍵盤會從畫面下方推上來，
 * 把版面整個頂高再彈回去，每記一筆都要跳兩次。自己畫的鍵盤永遠在原地。
 *
 * 左三欄是數字，右邊一欄上方是退格、下方是送出 —— 送出鍵拉高三列，
 * 因為那是這個畫面唯一的目標動作，拇指不必瞄準。
 */
export function NumericKeypad({
  onKey,
  onSubmit,
  submitLabel,
  submitDisabled,
}: Props) {
  return (
    <div className="grid grid-cols-4 grid-rows-4 gap-px bg-hairline select-none">
      {PAD.map((key) => (
        <Key key={key} onPress={() => onKey(key)}>
          {key}
        </Key>
      ))}

      <Key onPress={() => onKey('back')} className="col-start-4 row-start-1">
        <span aria-hidden="true">⌫</span>
        <span className="sr-only">刪除一位</span>
      </Key>

      <button
        type="button"
        onClick={onSubmit}
        disabled={submitDisabled}
        className="col-start-4 row-start-2 row-span-3 bg-ink text-base font-semibold text-surface active:opacity-80 disabled:bg-key disabled:text-ink-3"
      >
        {submitLabel}
      </button>
    </div>
  )
}

function Key({
  children,
  onPress,
  className = '',
}: {
  children: ReactNode
  onPress: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      // 高度用 vh 而非固定 px：iPhone SE 與 Pro Max 的螢幕差了快 200px，
      // 固定高度會讓其中一邊不是被擠掉就是留一大片空白。
      className={`h-[8.5vh] min-h-14 bg-key text-2xl font-medium text-ink active:bg-key-press ${className}`}
    >
      {children}
    </button>
  )
}
