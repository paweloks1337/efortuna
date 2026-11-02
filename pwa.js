/* Mistrzostwa Typerów: instalacja jako aplikacja (PWA)
   Wstaw na każdej stronie przed </body>:  <script src="/pwa.js" defer></script> */
(function () {
  'use strict';

  // --- Service worker (tryb aplikacji + działanie offline)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function () {});
    });
  }

  // --- Statystyki w Google Analytics (zdarzenia widać w GA4)
  function track(name, params) {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {}
  }

  // --- Już zainstalowana? Wtedy nic nie pokazujemy.
  var isStandalone =
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    window.navigator.standalone === true;
  if (isStandalone) {
    // Strona otwarta z ikony na ekranie głównym = osoba, która ma aplikację
    window.addEventListener('load', function () { track('pwa_otwarcie_aplikacji'); });
    return;
  }

  var ua = navigator.userAgent || '';
  var isIOS = /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /android/i.test(ua);
  var isMobile = isIOS || isAndroid;

  var KEY = 'pwa-banner-dismissed';
  var HIDE_DAYS = 7;

  function wasDismissed() {
    try {
      var t = parseInt(localStorage.getItem(KEY) || '0', 10);
      return t && (Date.now() - t) < HIDE_DAYS * 86400000;
    } catch (e) { return false; }
  }
  function rememberDismiss() {
    try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {}
  }

  var deferredPrompt = null;
  var banner = null, overlay = null, shownTracked = false;

  // --- Style
  var css = '\
.pwa-banner{position:fixed;right:12px;bottom:12px;z-index:9000;display:flex;align-items:stretch;\
width:min(320px,calc(100vw - 24px));background:var(--surface2,#1C1C2E);color:var(--text,#E8E8F0);\
border:1px solid rgba(255,214,10,.35);border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.55);\
font-family:"Inter",system-ui,sans-serif;overflow:hidden;animation:pwaIn .35s ease both}\
@keyframes pwaIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}\
@media (prefers-reduced-motion:reduce){.pwa-banner{animation:none}}\
.pwa-banner[hidden]{display:none}\
.pwa-open{flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:10px 4px 10px 12px;\
background:none;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer}\
.pwa-open img{width:40px;height:40px;border-radius:10px;flex-shrink:0}\
.pwa-open b{display:block;font-size:.88rem;font-weight:700;color:#fff;line-height:1.25}\
.pwa-open small{display:block;font-size:.74rem;color:var(--muted,#8b8ba0);line-height:1.3;margin-top:2px}\
.pwa-x{flex-shrink:0;width:40px;background:none;border:0;color:var(--muted,#8b8ba0);font-size:1.3rem;\
line-height:1;cursor:pointer;align-self:flex-start;height:40px}\
.pwa-x:hover{color:#fff}\
.pwa-overlay{position:fixed;inset:0;z-index:100001;display:flex;align-items:flex-end;justify-content:center;\
background:rgba(0,0,0,.65);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);\
font-family:"Inter",system-ui,sans-serif}\
.pwa-overlay[hidden]{display:none}\
.pwa-sheet{width:100%;max-width:440px;max-height:88vh;max-height:88dvh;overflow-y:auto;overscroll-behavior:contain;\
background:var(--surface,#13131D);color:var(--text,#E8E8F0);border:1px solid rgba(255,214,10,.25);\
border-radius:20px 20px 0 0;padding:20px 18px calc(22px + env(safe-area-inset-bottom,0px))}\
@media (min-width:560px){.pwa-overlay{align-items:center}.pwa-sheet{border-radius:20px}}\
.pwa-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}\
.pwa-head h2{font-size:1.15rem;font-weight:700;color:#fff;min-width:0}\
.pwa-close{width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,214,10,.25);background:var(--surface2,#1C1C2E);\
color:var(--text,#E8E8F0);font-size:1.1rem;cursor:pointer;flex-shrink:0}\
.pwa-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}\
.pwa-tab{padding:12px 8px;border-radius:12px;border:1px solid rgba(255,214,10,.2);background:var(--surface2,#1C1C2E);\
color:var(--muted,#8b8ba0);font:inherit;font-size:.9rem;font-weight:700;cursor:pointer}\
.pwa-tab[aria-selected="true"]{background:rgba(255,214,10,.15);border-color:rgba(255,214,10,.6);color:#FFD60A}\
.pwa-panel[hidden]{display:none}\
.pwa-panel p{font-size:.9rem;line-height:1.5;margin-bottom:14px}\
.pwa-dl{width:100%;padding:14px;border:0;border-radius:12px;background:#FFD60A;color:#000;font:inherit;\
font-size:1rem;font-weight:800;cursor:pointer}\
.pwa-dl:active{transform:scale(.98)}\
.pwa-hint{margin-top:14px;padding:12px;border-radius:12px;background:var(--surface2,#1C1C2E);\
border:1px solid rgba(255,214,10,.15);font-size:.84rem;line-height:1.5;color:var(--muted,#8b8ba0)}\
.pwa-hint[hidden]{display:none}\
.pwa-hint b{color:var(--text,#E8E8F0)}\
.pwa-steps{list-style:none;counter-reset:s;display:flex;flex-direction:column;gap:10px}\
.pwa-steps li{counter-increment:s;position:relative;padding:10px 12px 10px 46px;border-radius:12px;\
background:var(--surface2,#1C1C2E);font-size:.88rem;line-height:1.45}\
.pwa-steps li::before{content:counter(s);position:absolute;left:12px;top:50%;transform:translateY(-50%);\
width:24px;height:24px;border-radius:50%;background:#FFD60A;color:#000;font-weight:800;font-size:.8rem;\
display:flex;align-items:center;justify-content:center}\
.pwa-steps svg{vertical-align:-4px;margin:0 2px}\
.pwa-steps b{color:#fff}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  var shareIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFD60A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

  function build() {
    if (banner) return;

    banner = document.createElement('div');
    banner.className = 'pwa-banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Instalacja aplikacji');
    banner.innerHTML =
      '<button type="button" class="pwa-open" aria-haspopup="dialog">' +
        '<img src="/icon-192.png" alt="" width="40" height="40">' +
        '<span><b>Pobierz aplikację</b><small>Szybki dostęp z ekranu głównego</small></span>' +
      '</button>' +
      '<button type="button" class="pwa-x" aria-label="Zamknij">×</button>';

    overlay = document.createElement('div');
    overlay.className = 'pwa-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="pwa-sheet" role="dialog" aria-modal="true" aria-labelledby="pwa-title">' +
        '<div class="pwa-head"><h2 id="pwa-title">📲 Pobierz aplikację</h2>' +
        '<button type="button" class="pwa-close" aria-label="Zamknij">✕</button></div>' +
        '<div class="pwa-tabs" role="tablist">' +
          '<button type="button" class="pwa-tab" role="tab" data-os="android">🤖 Android</button>' +
          '<button type="button" class="pwa-tab" role="tab" data-os="ios">🍎 iOS</button>' +
        '</div>' +
        '<div class="pwa-panel" data-panel="android" role="tabpanel">' +
          '<p>Kliknij przycisk poniżej, a aplikacja zainstaluje się na Twoim telefonie.</p>' +
          '<button type="button" class="pwa-dl">⬇️ Pobierz</button>' +
          '<div class="pwa-hint" hidden>Jeśli nic się nie pojawiło: otwórz stronę w <b>Chrome</b>, kliknij menu <b>⋮</b> (trzy kropki) i wybierz <b>„Zainstaluj aplikację”</b> albo <b>„Dodaj do ekranu głównego”</b>.</div>' +
        '</div>' +
        '<div class="pwa-panel" data-panel="ios" role="tabpanel" hidden>' +
          '<ol class="pwa-steps">' +
            '<li>Otwórz tę stronę w przeglądarce <b>Safari</b> (nie w Messengerze ani Facebooku).</li>' +
            '<li>Kliknij przycisk <b>Udostępnij</b> ' + shareIcon + ' (kwadrat ze strzałką w górę) na dole ekranu.</li>' +
            '<li>Przewiń listę w dół i wybierz <b>„Dodaj do ekranu początkowego”</b>.</li>' +
            '<li>Kliknij <b>„Dodaj”</b> w prawym górnym rogu. Ikona pojawi się na ekranie głównym.</li>' +
          '</ol>' +
        '</div>' +
      '</div>';

    document.body.appendChild(banner);
    document.body.appendChild(overlay);

    banner.querySelector('.pwa-open').addEventListener('click', openModal);
    banner.querySelector('.pwa-x').addEventListener('click', function () {
      banner.hidden = true;
      rememberDismiss();
    });

    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    overlay.querySelector('.pwa-close').addEventListener('click', closeModal);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });

    var tabs = overlay.querySelectorAll('.pwa-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () { selectOS(this.getAttribute('data-os')); });
    }
    overlay.querySelector('.pwa-dl').addEventListener('click', doInstall);
  }

  function selectOS(os) {
    var tabs = overlay.querySelectorAll('.pwa-tab');
    var panels = overlay.querySelectorAll('.pwa-panel');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-selected', tabs[i].getAttribute('data-os') === os ? 'true' : 'false');
    }
    for (var j = 0; j < panels.length; j++) {
      panels[j].hidden = panels[j].getAttribute('data-panel') !== os;
    }
  }

  function updateHint() {
    var hint = overlay.querySelector('.pwa-hint');
    hint.hidden = !!deferredPrompt;
  }

  function openModal() {
    selectOS(isIOS ? 'ios' : 'android');
    updateHint();
    overlay.hidden = false;
    track('pwa_okno_otwarte', { system: isIOS ? 'ios' : 'android' });
    document.documentElement.style.overflow = 'hidden';
    overlay.querySelector('.pwa-close').focus();
  }

  function closeModal() {
    overlay.hidden = true;
    document.documentElement.style.overflow = '';
  }

  function doInstall() {
    var hint = overlay.querySelector('.pwa-hint');
    track('pwa_klik_pobierz');
    if (!deferredPrompt) { hint.hidden = false; return; }
    var p = deferredPrompt;
    deferredPrompt = null;
    p.prompt();
    p.userChoice.then(function (choice) {
      if (choice && choice.outcome === 'accepted') {
        closeModal();
        banner.hidden = true;
      } else {
        hint.hidden = false;
      }
    }).catch(function () { hint.hidden = false; });
  }

  function showBanner(delay) {
    if (wasDismissed()) return;
    setTimeout(function () {
      if (!document.body) return;
      build();
      var firstShow = banner.hidden !== false;
      banner.hidden = false;
      if (firstShow && !shownTracked) { shownTracked = true; track('pwa_baner_pokazany'); }
    }, delay);
  }

  // Android / Chrome / Edge: przeglądarka sama zgłasza, że można zainstalować
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (overlay && !overlay.hidden) updateHint();
    showBanner(1500);
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    track('pwa_zainstalowano');
    rememberDismiss();
    if (overlay) closeModal();
    if (banner) banner.hidden = true;
  });

  // Telefony: iOS nie wysyła zdarzenia, a niektóre przeglądarki Androida też nie
  if (isMobile) showBanner(2500);
})();
