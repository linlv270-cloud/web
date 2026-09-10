(() => {
  const button = document.querySelector("[data-install-app]");
  if (!button) return;

  const ua = navigator.userAgent || "";
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isMacSafari = /Macintosh/i.test(ua) && /Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg/i.test(ua);
  let deferredPrompt = null;

  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  const style = document.createElement("style");
  style.textContent = `
    [data-install-app][hidden],.pwa-install-modal[hidden]{display:none!important}
    .install-app-btn{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:6px 12px;border:2px solid #222;border-radius:18px;background:#FFE600;color:#222;font-family:inherit;font-size:12px;font-weight:700;line-height:1.2;white-space:nowrap}
    .install-app-btn:hover{background:#F5D000}
    .pwa-install-modal{position:fixed;inset:0;z-index:2400;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.55)}
    .pwa-install-dialog{position:relative;width:min(360px,100%);padding:24px 22px 20px;border:2px solid #222;border-radius:10px;background:#fff;box-shadow:4px 4px 0 #222;color:#222}
    .pwa-install-dialog h2{margin:0 28px 8px 0;font-size:19px;line-height:1.35}
    .pwa-install-dialog p{margin:0;font-size:13px;line-height:1.7}
    .pwa-install-dialog .pwa-install-hint{margin-top:12px;padding-top:12px;border-top:1px dashed #e8e5de;color:#666}
    .pwa-install-close{position:absolute;top:8px;right:10px;width:32px;height:32px;border:0;background:transparent;color:#222;font-size:24px;line-height:1;cursor:pointer}
    .pwa-install-ok{width:100%;margin-top:18px;padding:10px 14px;border:2px solid #222;border-radius:8px;background:#FFE600;color:#222;font-family:inherit;font-size:13px;font-weight:800;line-height:1.2;cursor:pointer}
    @media(max-width:760px){.install-app-btn{min-height:34px;padding:5px 9px;font-size:11px}.pwa-install-dialog{padding:22px 18px 18px}}
  `;
  document.head.appendChild(style);

  const modal = document.createElement("div");
  modal.className = "pwa-install-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="pwa-install-dialog" role="dialog" aria-modal="true" aria-labelledby="pwaInstallTitle">
      <button class="pwa-install-close" type="button" aria-label="关闭">×</button>
      <h2 id="pwaInstallTitle">添加到桌面</h2>
      <p>把 TDE 放到桌面，以后一点就能打开，不影响账号和资料。</p>
      <p class="pwa-install-hint" id="pwaInstallHint"></p>
      <button class="pwa-install-ok" type="button">知道了</button>
    </div>
  `;
  document.body.appendChild(modal);

  const hint = modal.querySelector("#pwaInstallHint");
  const closeModal = () => {
    modal.hidden = true;
    document.body.style.overflow = "";
  };
  const openHelp = () => {
    hint.textContent = isIOS
      ? "请在 Safari 中点“分享”，再选“添加到主屏幕”。"
      : isMacSafari
        ? "请在 Safari 菜单中选择“添加到程序坞”。"
        : "请在浏览器菜单中选择“添加到桌面”或“创建快捷方式”。";
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  };

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest(".pwa-install-close,.pwa-install-ok")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeModal();
  });

  const hideButtonIfInstalled = () => {
    button.hidden = isStandalone();
  };
  hideButtonIfInstalled();
  if (!isStandalone()) button.hidden = false;

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    button.hidden = true;
  });

  button.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (result.outcome === "accepted") button.hidden = true;
      return;
    }
    openHelp();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => undefined);
  }
})();
