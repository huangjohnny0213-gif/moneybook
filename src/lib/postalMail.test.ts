import { describe, expect, test } from 'vitest'
import { parsePostalMail, type MailMessage } from './postalMail'

/*
 * 這些信件內容都是照郵局通知信的格式捏造的，帳號、交易編號、附言都是假的。
 * 這個 repo 是公開的，不要貼真的信進來。
 */

// 2026-09-19 12:00（台灣時間）。只有信件內文找不到日期時才會用到。
const RECEIVED_AT = new Date(2026, 8, 19, 12, 0).getTime()

function mail(subject: string, body: string): MailMessage {
  return { id: 'm1', receivedAt: RECEIVED_AT, subject, body }
}

const WALLET_BODY = `親愛的客戶您好：
您使用連結帳戶付款服務交易成功，
郵局帳號：0000*****00000
交易日期：2026年09月10日12:00:00
交易平台：連加電子支付(帳號：00*****00000)
交易編號：12345678901234
交易金額：100元
詳細內容請至交易明細查詢。`

const TRANSFER_BODY = `行動郵局交易通知
親愛的客戶您好： 您的存簿轉存簿(非約定)即時轉帳結果如下：
轉出帳號 ：0000*****00000 轉入行庫 ：中華郵政股份有限公司
轉入帳號 ：0000*****11111 轉帳金額 ：1,234 手續費 ：0 交易序號 ：00000001
附言(給自己) ： 附言(給對方) ：便當 完成時間 ：115年09月05日18時00分00秒
如有任何疑問，請撥打本公司24小時顧客服務專線。`

const BILL_BODY = `親愛的客戶您好： 您使用本公司存簿儲金帳戶繳費交易結果如下：
交易存簿儲金帳號：0000*****00000 轉入行庫：000 / 範例銀行
轉入帳號：000000000****000 完成時間：115/08/20 10:00:00
交易金額：990 元 手續費：10.0 元`

describe('連結帳戶付款（LINE Pay 等電子支付）', () => {
  test('取出金額、日期，平台名稱換成大家認得的名字', () => {
    expect(parsePostalMail(mail('連結帳戶付款服務扣款通知 - 扣款通知', WALLET_BODY))).toEqual({
      kind: 'wallet',
      amountMinor: 10000,
      date: '2026-09-10',
      label: 'LINE Pay',
    })
  })

  test('不認得的平台保留原名', () => {
    const body = WALLET_BODY.replace('連加電子支付', '某某電子支付')
    expect(parsePostalMail(mail('扣款通知', body))?.label).toBe('某某電子支付')
  })
})

describe('行動郵局轉帳', () => {
  test('民國年換成西元，千分位去掉', () => {
    const result = parsePostalMail(mail('行動郵局交易通知', TRANSFER_BODY))
    expect(result).toMatchObject({
      kind: 'transfer',
      amountMinor: 123400,
      date: '2026-09-05',
    })
  })

  test('沒有給自己的附言時，用給對方的附言', () => {
    expect(parsePostalMail(mail('行動郵局交易通知', TRANSFER_BODY))?.label).toBe(
      '轉帳：便當',
    )
  })

  test('給自己的附言優先：那是使用者自己寫給自己看的', () => {
    const body = TRANSFER_BODY.replace('附言(給自己) ：', '附言(給自己) ：午餐分帳')
    expect(parsePostalMail(mail('行動郵局交易通知', body))?.label).toBe(
      '轉帳：午餐分帳',
    )
  })

  test('兩個附言都空的時候只寫轉帳', () => {
    const body = TRANSFER_BODY.replace('：便當', '：')
    expect(parsePostalMail(mail('行動郵局交易通知', body))?.label).toBe('轉帳')
  })

  test('附言各自一行時也抓得到，不會吃到下一行', () => {
    const body = `轉帳金額 ：300
手續費 ：0
附言(給自己) ：
附言(給對方) ：房租
完成時間 ：115年09月01日08時00分00秒`
    expect(parsePostalMail(mail('行動郵局交易通知', body))).toEqual({
      kind: 'transfer',
      amountMinor: 30000,
      date: '2026-09-01',
      label: '轉帳：房租',
    })
  })

  test('手續費算進金額：那也是從帳戶出去的錢', () => {
    const body = TRANSFER_BODY.replace('手續費 ：0', '手續費 ：15')
    const result = parsePostalMail(mail('行動郵局交易通知', body))
    expect(result?.amountMinor).toBe(124900)
    expect(result?.label).toBe('轉帳：便當（含手續費 15）')
  })
})

describe('全國性繳費', () => {
  test('取出收款銀行，手續費算進金額', () => {
    expect(parsePostalMail(mail('全國性繳費通知(No.1)', BILL_BODY))).toEqual({
      kind: 'bill',
      amountMinor: 100000,
      date: '2026-08-20',
      label: '繳費：範例銀行（含手續費 10）',
    })
  })
})

describe('看不懂的信', () => {
  test('登入通知這類沒有金額的信回傳 null', () => {
    const body = '您於115 年 09 月 01 日 09 時 00 分 00 秒在本公司行動郵局登入成功。'
    expect(parsePostalMail(mail('行動郵局登入通知', body))).toBeNull()
  })

  test('認得格式但找不到金額也回傳 null，不猜一個 0 出來', () => {
    const body = WALLET_BODY.replace('交易金額：100元', '')
    expect(parsePostalMail(mail('扣款通知', body))).toBeNull()
  })

  test('內文沒有日期時退回收信日', () => {
    const body = WALLET_BODY.replace('交易日期：2026年09月10日12:00:00', '')
    expect(parsePostalMail(mail('扣款通知', body))?.date).toBe('2026-09-19')
  })

  test('不存在的日期當作沒有日期，退回收信日', () => {
    const body = WALLET_BODY.replace('09月10日', '13月40日')
    expect(parsePostalMail(mail('扣款通知', body))?.date).toBe('2026-09-19')
  })
})

describe('信件格式的容錯', () => {
  test('HTML 內文先去標籤再解析', () => {
    const html = `<table><tr><td>您使用連結帳戶付款服務交易成功，</td></tr>
<tr><td>交易日期：2026年09月10日12:00:00</td></tr>
<tr><td>交易平台：連加電子支付(帳號：00*****00000)</td></tr>
<tr><td>交易金額：1,100&nbsp;元</td></tr></table>`
    expect(parsePostalMail(mail('扣款通知', html))).toEqual({
      kind: 'wallet',
      amountMinor: 110000,
      date: '2026-09-10',
      label: 'LINE Pay',
    })
  })

  test('全形括號與半形冒號也認得', () => {
    const body = TRANSFER_BODY.replace('附言(給對方) ：', '附言（給對方）:')
    expect(parsePostalMail(mail('行動郵局交易通知', body))?.label).toBe(
      '轉帳：便當',
    )
  })
})
