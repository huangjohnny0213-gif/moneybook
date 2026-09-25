/**
 * 記帳本的郵局通知信橋接。
 *
 * 部署在使用者自己的 Google 帳號裡，App 打開時來問「某個時間之後有哪些郵局
 * 扣款通知」。設定步驟見 docs/mail-import.md。
 *
 * 這支程式刻意只做一件事：找信、原封不動交出去。看懂信的邏輯全部在 App 的
 * src/lib/postalMail.ts —— 郵局改格式時只要更新 App，不必請使用者回來重新部署。
 */

const SENDER = 'mail.post.gov.tw'

// 只放行跟錢有關的信。登入通知帶著身分證字號的片段、對帳單帶著 PDF，
// 這些沒有理由離開 Gmail。
const SUBJECT_KEYWORDS = ['扣款通知', '交易通知', '繳費通知']

// 最多往回找多久。App 很久沒開的時候，一次也只抓這段，免得逾時。
const MAX_LOOKBACK_MS = 60 * 24 * 60 * 60 * 1000
const MAX_THREADS = 200

function doGet(e) {
  const expected = PropertiesService.getScriptProperties().getProperty('TOKEN')
  const given = (e && e.parameter && e.parameter.token) || ''
  if (!expected || given !== expected) {
    return reply({ ok: false, error: 'unauthorized' })
  }

  const requested = Number(e.parameter.since)
  if (!(requested > 0)) return reply({ ok: false, error: 'bad-since' })

  const now = Date.now()
  const since = Math.max(requested, now - MAX_LOOKBACK_MS)
  return reply({ ok: true, now: now, mails: findMails(since) })
}

function findMails(since) {
  // Gmail 搜尋的 after: 吃的是秒數。
  const query = 'from:' + SENDER + ' after:' + Math.floor(since / 1000)
  const mails = []

  GmailApp.search(query, 0, MAX_THREADS).forEach(function (thread) {
    // 同一個對話串裡可能有好幾封通知，舊的那幾封可能早於 since。
    thread.getMessages().forEach(function (message) {
      const receivedAt = message.getDate().getTime()
      if (receivedAt < since) return

      const subject = message.getSubject()
      const wanted = SUBJECT_KEYWORDS.some(function (keyword) {
        return subject.indexOf(keyword) !== -1
      })
      if (!wanted) return

      mails.push({
        id: message.getId(),
        receivedAt: receivedAt,
        subject: subject,
        body: message.getPlainBody(),
      })
    })
  })

  return mails
}

function reply(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  )
}

/**
 * 第一次設定時在編輯器裡手動執行一次。
 *
 * 做三件事：產生密碼（已經有就沿用）、觸發 Gmail 的授權畫面、
 * 順便找找最近七天的通知信，確認搜得到東西。結果印在「執行記錄」裡。
 */
function setup() {
  const props = PropertiesService.getScriptProperties()
  let token = props.getProperty('TOKEN')
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '')
    props.setProperty('TOKEN', token)
  }

  const recent = findMails(Date.now() - 7 * 24 * 60 * 60 * 1000)
  Logger.log('密碼（貼到 App 裡）：' + token)
  Logger.log('最近七天找到 ' + recent.length + ' 封郵局扣款／交易通知。')
}
