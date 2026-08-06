/**
 * 把檔案交給使用者。
 *
 * iOS Safari 對 <a download> 的支援很差，常常直接開一個新分頁把 JSON 印出來，
 * 使用者根本存不進「檔案」App。所以要先試 Web Share，讓系統的分享面板接手，
 * 那條路才能存進 iCloud 雲碟或傳給自己。
 */
export async function shareFile(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (error) {
      // 使用者在分享面板按取消會丟 AbortError。那不是失敗，
      // 不可以接著 fallback 去觸發下載 ——
      // 會變成「我按了取消，結果它還是存檔了」。
      if (error instanceof DOMException && error.name === 'AbortError') return
      // 其他錯誤（例如系統擋下這個檔案類型）才退回下載。
    }
  }

  download(file)
}

function download(file: File): void {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  // 立刻釋放會讓某些瀏覽器來不及開始下載，等一拍再收。
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
