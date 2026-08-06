/**
 * 分類用的類別色盤。
 *
 * 這個順序是色盲模擬下的驗證結果，不是挑好看排的：相鄰色階在紅綠色盲與藍黃色盲
 * 模擬下的色差都在安全範圍內。**不可重排、不可循環套用、不可自行增補第 9 色。**
 *
 * 深色那組不是淺色的自動反轉，而是同樣八個色相為深色底另外選過的階，
 * 各自對深色背景都有足夠對比。
 */
export const CATEGORICAL_LIGHT = [
  '#2a78d6', // 1 藍
  '#eb6834', // 2 橘
  '#1baf7a', // 3 青
  '#eda100', // 4 黃
  '#e87ba4', // 5 洋紅
  '#008300', // 6 綠
  '#4a3aa7', // 7 紫
  '#e34948', // 8 紅
] as const

export const CATEGORICAL_DARK = [
  '#3987e5',
  '#d95926',
  '#199e70',
  '#c98500',
  '#d55181',
  '#008300',
  '#9085e9',
  '#e66767',
] as const

/**
 * 取第 index 個色階（淺色）。
 *
 * 索引超出範圍時丟例外而非取模循環：分類超過 8 個時正確的做法是把尾巴收成
 * 「其他」或改用小倍數圖，而不是生一個新顏色出來。讓它在這裡爆掉，
 * 好過默默畫出一張兩塊顏色分不出來的圓餅圖。
 */
export function categoryColorAt(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= CATEGORICAL_LIGHT.length) {
    throw new RangeError(
      `色盤只有 ${CATEGORICAL_LIGHT.length} 個色階，取不到第 ${index} 個`,
    )
  }
  return CATEGORICAL_LIGHT[index]
}

// 明確標成 Map<string, string>：as const 會讓推斷出來的鍵型別變成八個字面量的聯集，
// 那樣就只能用色盤裡的常數去查，傳一般字串進來會編譯不過。
const LIGHT_TO_DARK = new Map<string, string>(
  CATEGORICAL_LIGHT.map((light, i) => [light, CATEGORICAL_DARK[i]]),
)

/**
 * 把淺色色階換成深色模式該用的那一階。
 *
 * 資料庫存的一律是淺色 hex，深色模式在渲染時才換。不在色盤裡的顏色原樣回傳 ——
 * 匯入舊備份時可能帶進手改過的顏色，原樣顯示好過丟例外讓整頁掛掉。
 */
export function darkStepOf(lightHex: string): string {
  return LIGHT_TO_DARK.get(lightHex.toLowerCase()) ?? lightHex
}
