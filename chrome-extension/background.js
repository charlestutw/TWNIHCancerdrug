/* 點一下工具列圖示就開啟側邊欄（Chrome 114+）。
   openPanelOnActionClick 讓圖示直接切換側邊欄，不需另外處理 onClicked。 */
function enableSidePanel() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((e) => console.warn("[第九節速查] 側邊欄設定失敗:", e));
  }
}
enableSidePanel();
chrome.runtime.onInstalled.addListener(enableSidePanel);
chrome.runtime.onStartup.addListener(enableSidePanel);
