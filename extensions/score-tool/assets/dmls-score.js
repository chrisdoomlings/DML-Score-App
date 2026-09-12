/* Doomlings Score Tool — storefront app block script.
   State machine ported from the concept demo; talks to the app proxy at /apps/score.

   Structural note: every screen renders inline inside #dmls-root, in the
   theme's own page flow — no fixed-position overlay, backdrop, or
   body-scroll-lock. #dmls-welcome-page renders the welcome screen (see
   renderPageWelcome()); #dmls-modal is a plain content panel right after it
   that renders everything else (Add Names through the winner reveal, plus
   Achievements/History) — "#modal" is a legacy id/name only, kept because
   the panel still needs its own show/hide toggle (showModal()/hideModal()
   below) to swap places with the welcome screen; it no longer overlays
   anything. */
(function () {
  "use strict";

  var cfg = window.DMLS_CONFIG || {};
  var root = document.getElementById("dmls-root");
  if (!root) return;
  var welcomeEl = document.getElementById("dmls-welcome-page");

  var PROXY = cfg.proxyBase || "/apps/score";
  var CUSTOMER = cfg.customer || null;
  var ICONS = cfg.assets || {};
  var STORE_KEY = "dmls_state_v1";

  // Screen number <-> URL hash, so each step is a real, refreshable, shareable
  // URL (e.g. .../score-tool#winner) instead of one opaque in-memory state.
  // "achievements" is a separate pseudo-screen handled by `view`, not part of
  // this array (see openAchievementsModal()/syncHash()).
  var SCREEN_HASH = ["", "players", "we", "fv", "bp", "mp", "winner"];
  function hashFor(screen) { return SCREEN_HASH[screen] || ""; }
  function screenForHash(h) {
    var i = SCREEN_HASH.indexOf(h);
    return i > 0 ? i : null; // "" (screen 0) is never an explicit restore target
  }

  var heading = root.getAttribute("data-heading") || "Ready to see who won the game?";
  // Deliberately NOT routes.account_login_url (typically /account/login) —
  // confirmed by testing that on Shopify's New Customer Accounts (the
  // system this shop is on; Legacy accounts were retired store-wide in Feb
  // 2026), that route's own hosted redirect drops any return_url/return_to
  // query param and always lands the customer on /account regardless. This
  // literal path is New Customer Accounts' documented redirect-aware login
  // entry point instead (shopify.dev/docs/storefronts/themes/sign-in).
  var loginUrl = "/customer_authentication/login";
  // New Customer Accounts' return_to only supports a relative path (no
  // scheme/host) — pathname+search+hash already satisfies that. Read at
  // render time (not cached) so it always reflects the current #hash screen.
  function withReturnUrl(url) {
    try {
      var ret = location.pathname + location.search + location.hash;
      var sep = url.indexOf("?") === -1 ? "?" : "&";
      return url + sep + "return_to=" + encodeURIComponent(ret);
    } catch (e) {
      return url;
    }
  }
  var homeTip = ""; // populated from /config; empty = tip bar hidden
  var homeSub = ""; // populated from /config; empty = hidden (no hardcoded fallback text)
  var discordUrl = ""; // populated from /config; empty = winner-screen Discord banner hidden
  var winnerFooterUrl = ""; // populated from /config; empty = bottom banner image (ICONS.winnerFooter) renders non-clickable
  var trophyBgUrl = ""; // populated from /config: trophyBg || bgWinner || bg — passed to the shared trophy image so it matches the on-screen background
  var trophyHeading = "Won The End Of The World!"; // populated from /config, matches the DB default until it loads
  var trophySubheading = "Did Not."; // populated from /config, matches the DB default until it loads
  var trophyTagline = ""; // populated from /config; optional second line, hidden when empty
  var trophyTopImages = []; // populated from /config; pool of trophy graphics, one picked at random per renderTrophy()
  var logoWidth = 220; // px; populated from /config, matches the DB default until it loads
  // Welcome screen character illustration + heading layout — all populated
  // from /config, matching the score_settings DB defaults until it loads.
  // charactersWidth is still synced from /config and kept editable in
  // Settings, but no longer drives the illustration's rendered size — that's
  // now a fixed responsive width+bleed in dmls-score.css (.dmls-welcome-characters).
  var charactersWidth = 320; // px; unused for rendering, see note above
  var headingWidth = 320; // px; max-width, controls line wrapping
  var headingFontSize = 32; // px
  function logoHTML(cls) {
    // Width is merchant-set but centering is structural (margin:auto in CSS),
    // so any width the admin picks stays centered — never make this fill-width.
    return ICONS.logo ? '<img class="' + cls + '" src="' + ICONS.logo + '" alt="" style="width:' + logoWidth + 'px" loading="lazy">' : "";
  }

  // Computed once at boot per spec — included on every POST /game.
  var DEVICE_TYPE = (window.matchMedia && window.matchMedia("(max-width: 767px)").matches) ? "mobile" : "desktop";
  function localDateStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1); if (m.length < 2) m = "0" + m;
    var day = String(d.getDate()); if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }


  var state = {
    screen: 0,
    players: [], // {name, we, fv, bp, mp, isCustomer}
    customerOptedOut: false, // true once the customer removes their own chip — see renderPlayers()
  };
  var serverConfig = null; // {loggedIn, images, ...} from /config
  var configFailed = false; // true once loadConfig() has exhausted its retry — see renderStepPending()
  var lastResult = null;   // response from POST /game
  var saveFailed = false;  // true once /game has definitively failed (not just still in flight)
  var gamesPlayedRefreshing = false; // guards the "guest-saved game, now logged in" re-fetch in renderWinner() — see there

  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { /* ignore */ }
  // >= 1, not >= 2 — a single name typed on the Add Names screen is already
  // meaningful entered data; requiring 2 meant refreshing right after adding
  // just one name silently dropped it with no "Resume it" banner to get it back.
  var hasResume = !!(saved && saved.players && saved.players.length >= 1 && saved.screen > 0 && saved.screen < 6);

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        screen: state.screen,
        players: state.players,
        customerOptedOut: state.customerOptedOut,
        lastResult: lastResult,
        saveFailed: saveFailed,
      }));
    } catch (e) { /* ignore */ }
    syncHash(true);
  }
  function syncHash(push) {
    var h = view === "achv" ? "achievements" : hashFor(state.screen);
    if (location.hash.slice(1) === h) return;
    var url = location.pathname + location.search + (h ? "#" + h : "");
    try {
      if (push) history.pushState({ dmlsScreen: state.screen, dmlsView: view }, "", url);
      else history.replaceState({ dmlsScreen: state.screen, dmlsView: view }, "", url);
    } catch (e) { /* ignore */ }
  }
  window.addEventListener("popstate", function () {
    var h = location.hash.slice(1);
    if (h === "achievements") {
      openAchievementsModal(false);
      return;
    }
    var s = screenForHash(h);
    if (s === null) { closeModal(); return; }
    // Browser back/forward (or a mobile swipe-back gesture) between two step
    // screens — same left/right treatment as the in-app Back/Next buttons.
    if (s >= 2 && s <= 5 && state.screen >= 2 && state.screen <= 5) {
      stepNavDirection = s > state.screen ? "next" : "back";
    }
    state.screen = s;
    view = "game";
    showModal();
    render();
  });
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function total(p) { return (p.we | 0) + (p.fv | 0) + (p.bp | 0) + (p.mp | 0); }
  // .dmls-scroll-mid reserves right-side padding for its scrollbar (see CSS)
  // — collapse it back to 0 when the list is short enough that nothing
  // actually scrolls, so a few names/rows aren't left with dead space on
  // the right. Call once right after the list's real content is in the DOM.
  function fitScrollMid(el) {
    if (!el) return;
    el.classList.toggle("dmls-scroll-fit", el.scrollHeight <= el.clientHeight + 1);
  }
  // The display font renders lowercase letters as caps-shaped glyphs, so a
  // name typed lowercase looks fine in the big winner headline but reads
  // inconsistently wherever we show it in the regular UI font — capitalize
  // it there so "azam" doesn't sit next to "AZAM" on the same screen.
  function cap(s) {
    s = String(s || "");
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* toast */
  var toastEl = document.createElement("div");
  toastEl.className = "dmls-toast";
  toastEl.setAttribute("role", "status");
  document.body.appendChild(toastEl);
  var toastT;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("dmls-show");
    clearTimeout(toastT);
    toastT = setTimeout(function () { toastEl.classList.remove("dmls-show"); }, 2400);
  }

  /* proxy helpers */
  function apiGet(path) {
    return fetch(PROXY + path, { headers: { Accept: "application/json" } }).then(function (r) { return r.json(); });
  }
  // Without this, a request that never resolves (server hang, cold-start
  // stall) leaves callers waiting on their promise forever — e.g. the winner
  // screen's "Saving your game…" placeholder (see renderWinner()), which only
  // gets corrected inside this call's own .then/.catch, has no other trigger
  // to fall back to "couldn't save" if the response just never arrives.
  function apiPost(path, body) {
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 10000) : null;
    return fetch(PROXY + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: ctrl ? ctrl.signal : undefined,
    }).then(
      function (r) { clearTimeout(timer); return r.json(); },
      function (err) { clearTimeout(timer); throw err; }
    );
  }

  /* ---------------------------------------------------------------------
     #dmls-modal panel — created once at boot and inserted right after the
     welcome section, inline in #dmls-root's own flow (not appended to
     document.body — there's no overlay to escape #dmls-root's stacking
     context for). showModal()/hideModal() just swap its visibility with
     welcomeEl's; no backdrop, no body-scroll-lock, no focus trap — it's
     ordinary page content, not a dialog.
     Settings → General → "Display mode" = "Full-screen modal (classic)"
     (layoutModeIsModal below) restores the pre-Sept-2026 overlay instead:
     loadConfig() moves this same node to be a direct child of <body>, and
     dmls-score.css keys its fixed/backdrop/centered-card rules off that
     DOM position (`body > #dmls-modal`) rather than a mode class — so the
     default inline mode is completely untouched by any of it. The backdrop
     div and dialog ARIA attributes below are always present either way:
     inert (zero-size, unpositioned) in inline mode, real in modal mode. */
  var modalEl = document.createElement("div");
  modalEl.id = "dmls-modal";
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.innerHTML =
    '<div class="dmls-modal-backdrop" id="dmls-modal-backdrop"></div>' +
    '<div class="dmls-modal-card" id="dmls-modal-card" role="dialog" aria-modal="true" aria-label="Doomlings Score Tool">' +
    '<button type="button" class="dmls-modal-close" id="dmls-modal-close" aria-label="Back to start">&times;</button>' +
    '<div class="dmls-modal-body" id="dmls-modal-body">' +
    '<div id="dmls-app" aria-live="polite"></div>' +
    '<div id="dmls-achv" hidden></div>' +
    '<div id="dmls-trophy" hidden></div>' +
    "</div></div>";
  if (welcomeEl && welcomeEl.parentNode) welcomeEl.parentNode.insertBefore(modalEl, welcomeEl.nextSibling);
  else root.appendChild(modalEl);
  var app = document.getElementById("dmls-app");
  var achvEl = document.getElementById("dmls-achv");
  var trophyEl = document.getElementById("dmls-trophy");
  var productsEl = document.getElementById("dmls-products");

  var view = "game"; // "game" | "achv"
  var modalOpen = false;
  var modalDeepLinked = false; // true only for a fresh page load that landed directly on a hash, no prior in-app navigation
  // Flipped by loadConfig() once /config resolves (default false = inline,
  // matching the sync-boot default below before that network round trip
  // lands — same accepted race as lockScrollEnabled just above).
  var layoutModeIsModal = false;
  // Moves the (already-created, already-listened-to) #dmls-modal node to
  // document.body so the `body > #dmls-modal` CSS takes over — safe to call
  // more than once, and safe even after the panel has already been opened.
  function moveModalToBody() {
    if (modalEl.parentNode !== document.body) document.body.appendChild(modalEl);
  }
  // Settings → General → "Lock page scroll" (default off) — loadConfig()
  // flips this once /config resolves. Opt-in re-add of body-scroll-lock,
  // which the Sept 2026 inline rebuild deliberately removed; see
  // lockPageScroll() below for why it's a simple overflow toggle rather
  // than the old fixed-position/scroll-restore approach.
  var lockScrollEnabled = false;

  // Simple overflow:hidden toggle on <html> — not the fixed-position +
  // saved-scrollY technique some scroll-locks use, since that reintroduces
  // exactly the "fixed positioning" behavior the Sept 2026 rebuild removed
  // on purpose. This only stops the page from scrolling while open; it
  // doesn't preserve/restore scroll position (nothing moves it in the
  // first place) and doesn't compensate for scrollbar-width layout shift,
  // which is a non-issue on the ~99% mobile traffic this tool targets.
  function lockPageScroll() {
    document.documentElement.classList.add("dmls-page-scroll-locked");
  }
  function unlockPageScroll() {
    document.documentElement.classList.remove("dmls-page-scroll-locked");
  }

  function showModal() {
    if (modalOpen) return;
    modalOpen = true;
    modalEl.classList.add("dmls-modal-open");
    modalEl.setAttribute("aria-hidden", "false");
    if (layoutModeIsModal) {
      // Classic overlay: page underneath stays exactly as it was (the
      // backdrop covers it), locked from scrolling for as long as the
      // modal's open — always, not gated by the separate "Lock page
      // scroll" setting, matching the pre-Sept-2026 behavior.
      document.documentElement.classList.add("dmls-modal-lock");
      document.body.classList.add("dmls-modal-lock");
      var closeBtn = document.getElementById("dmls-modal-close");
      if (closeBtn) closeBtn.focus();
    } else {
      if (welcomeEl) welcomeEl.hidden = true;
      if (lockScrollEnabled) lockPageScroll();
      // Inline content can open below the fold (e.g. the player scrolled
      // partway down a long welcome section) — bring it into view since
      // there's no viewport-centered overlay doing that automatically here.
      modalEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  function hideModal() {
    modalOpen = false;
    modalEl.classList.remove("dmls-modal-open");
    modalEl.setAttribute("aria-hidden", "true");
    if (layoutModeIsModal) {
      document.documentElement.classList.remove("dmls-modal-lock");
      document.body.classList.remove("dmls-modal-lock");
    } else {
      if (welcomeEl) welcomeEl.hidden = false;
      unlockPageScroll();
    }
  }
  // X button / Escape / backdrop click: just hide. Never discard
  // state.screen/state.players here — a deep-linked open (e.g. a refresh
  // mid-game re-landed on "#players") can carry just as much real
  // in-progress data as one opened from the page welcome, so resetting
  // state.screen to 0 on close used to silently strand that data behind a
  // "Resume it" banner the player could easily miss — and tapping "Start
  // scoring" from there wipes it for good. Leaving state/hash untouched
  // means close/reopen and close/refresh both land the player back exactly
  // where they left off. renderPageWelcome() re-renders the on-page welcome
  // (e.g. to show/hide the resume banner) now that the player is looking at
  // it again (inline mode) or is about to see it again once the overlay
  // that was covering it closes (modal mode).
  function closeModal() {
    modalDeepLinked = false;
    hideModal();
    renderPageWelcome();
    if (layoutModeIsModal) {
      var startBtn = document.getElementById("dmls-start");
      if (startBtn) startBtn.focus();
    } else if (welcomeEl) {
      welcomeEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  document.getElementById("dmls-modal-close").addEventListener("click", closeModal);
  document.getElementById("dmls-modal-backdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modalOpen) closeModal();
  });

  function openGameModal() {
    view = "game";
    achvEl.hidden = true;
    trophyEl.hidden = true;
    app.hidden = false;
    modalDeepLinked = false;
    showModal();
    render();
    syncHash(true);
  }

  /* steps meta */
  var STEPS = [
    null, null,
    { key: "we", min: -99 },
    { key: "fv", min: 0 },
    { key: "bp", min: 0 },
    { key: "mp", min: 0, exp: true },
  ];
  // Per-step character image lives at serverConfig.images[CHAR_IMAGE_KEY[key]]
  // — "mp" (Expansion Points) keeps its original "bgExp" slot name from
  // before the other 3 steps got their own (see 019_step_content.sql).
  var CHAR_IMAGE_KEY = { we: "bgWe", fv: "bgFv", bp: "bgBp", mp: "bgExp" };
  // Sole purpose: tell renderStep() which way to slide the character image
  // in — set right before render() by whichever Back/Next handler is
  // moving into a step screen, read once and cleared so an unrelated
  // re-render (e.g. a live config reload) never replays the animation.
  var stepNavDirection = null;
  // Admin-editable heading/description per step (Settings → Steps). No copy
  // is duplicated here — lib/score/steps.ts's DEFAULT_STEPS is the single
  // source of truth (both the DB default and what admin edits build on);
  // this just starts empty and is filled in by the c.steps merge below once
  // /config resolves, which happens at boot, well before a player can reach
  // a step screen (requires opening the modal, starting a game, and adding
  // players first). Escaped on render like every other admin text field.
  var stepContent = {
    we: { preHeading: "", heading: "", sub: "" },
    fv: { preHeading: "", heading: "", sub: "" },
    bp: { preHeading: "", heading: "", sub: "" },
    mp: { preHeading: "", heading: "", sub: "" },
  };

  function dots(n) {
    var h = '<div class="dmls-dots" aria-hidden="true">';
    for (var i = 0; i < 5; i++) h += "<i" + (i <= n ? ' class="dmls-on"' : "") + "></i>";
    return h + "</div>";
  }

  function render() {
    // Used to wrap this in document.startViewTransition() for a soft
    // crossfade between steps. Dropped it — the transition's before/after
    // snapshots didn't account for #dmls-app's own internal scroll state
    // (.dmls-scroll-mid/.dmls-card-body), so a scrollbar toggling on/off
    // between screens caused a visible flicker and, intermittently, a
    // stray scrollbar during the ~220ms animation. Plain instant swap.
    // renderPlayers()/renderStep() also skip .dmls-card's own pop-in
    // animation deliberately — Back/Next between Add Names and the 4 scoring
    // steps share the same background art, so animating the whole card on
    // every click made that shared background look like it was resetting
    // instead of staying put.
    if (productsEl && state.screen !== 6) productsEl.hidden = true;
    // screen 0 (welcome) is never rendered inside the modal — it lives
    // statically on the page (see renderPageWelcome()); the modal only ever
    // opens straight onto screen 1+ (openGameModal()/the deep-link restore
    // at boot both guarantee that).
    if (state.screen === 1) renderPlayers();
    else if (state.screen >= 2 && state.screen <= 5) {
      // stepContent (heading/preHeading/description) is only ever populated
      // by /config — nothing hardcoded to fall back to (see stepContent
      // above) — so on a slow connection this can be reached before it's
      // resolved. Show a loading placeholder instead of blank text; the
      // /config handler calls render() again once it lands.
      if (serverConfig) renderStep(state.screen);
      else renderStepPending();
    }
    else renderWinner();
  }
  function renderStepPending() {
    app.innerHTML =
      '<div class="dmls-card dmls-anim-in" id="dmls-screen-step-pending">' +
      '<div class="dmls-card-body">' +
      (configFailed
        ? '<p class="dmls-sub">Couldn’t load this screen — check your connection and try again.</p>' +
          '<button type="button" class="dmls-btn dmls-btn-ghost" id="dmls-step-retry">Retry</button>'
        : '<p class="dmls-sub">Loading…</p>') +
      "</div></div>";
    var retry = document.getElementById("dmls-step-retry");
    if (retry) retry.addEventListener("click", function () {
      configFailed = false;
      render();
      loadConfig(true);
    });
  }

  /* --- page welcome (static — not part of the modal's screen flow) ---
     Renders into #dmls-welcome-page on the page itself. "Start scoring"/
     "Resume it" open the modal directly onto Add Names (or a resumed
     screen) — there's no separate welcome step inside the modal. Called at
     boot, whenever /config resolves new copy/images (loadConfig() below),
     and every time the modal closes (so the resume banner reflects
     whatever the player just did). */
  function charStyle(normalUrl, hoverUrl) {
    var s = "";
    if (normalUrl) s += "--dmls-char-normal:url('" + normalUrl.replace(/'/g, "%27") + "');";
    if (hoverUrl) s += "--dmls-char-hover:url('" + hoverUrl.replace(/'/g, "%27") + "');";
    return s ? ' style="' + s + '"' : "";
  }
  function renderPageWelcome() {
    if (!welcomeEl) return;
    var images = (serverConfig && serverConfig.images) || {};
    var hasBee = !!images.beeNormal;
    var hasFish = !!images.fishNormal;
    welcomeEl.innerHTML =
      '<div class="dmls-card dmls-anim-in" id="dmls-screen-welcome">' +
      '<div class="dmls-card-body">' +
      logoHTML("dmls-logo") +
      // Bee/fish overlay the top corners of the hero image (like the
      // creatures already baked into that artwork) instead of sitting in
      // their own row below it — that row used to push the heading down
      // far enough to need a scroll on shorter screens.
      '<div class="dmls-welcome-hero">' +
      (ICONS.characters ? '<img class="dmls-welcome-characters" src="' + ICONS.characters + '" alt="" loading="lazy">' : "") +
      ((hasBee || hasFish)
        ? '<div class="dmls-welcome-chars" aria-hidden="true">' +
          (hasBee ? '<div class="dmls-char-bee" id="dmls-char-bee"' + charStyle(images.beeNormal, images.beeHover) + '></div>' : "") +
          (hasFish ? '<div class="dmls-char-fish" id="dmls-char-fish"' + charStyle(images.fishNormal, images.fishHover) + '></div>' : "") +
          "</div>"
        : "") +
      "</div>" +
      '<h2 class="dmls-title" style="max-width:' + headingWidth + 'px;font-size:' + headingFontSize + 'px">' + esc(heading) + "</h2>" +
      (homeSub ? '<p class="dmls-sub">' + esc(homeSub) + "</p>" : "") +
      (hasResume ? '<div class="dmls-resume">You have a game in progress. <button type="button" id="dmls-resume">Resume it</button></div>' : "") +
      (CUSTOMER ? '<div class="dmls-welcome-links"><button type="button" class="dmls-btn-link" id="dmls-achv-link">Achievements</button></div>' : "") +
      "</div>" +
      '<div class="dmls-nav"><span class="dmls-spacer"></span><button type="button" class="dmls-btn dmls-btn-go" id="dmls-start">Start scoring</button><span class="dmls-spacer"></span></div>' +
      "</div>" +
      (homeTip ? '<div class="dmls-tip"><span class="dmls-tip-icon" aria-hidden="true">i</span><p>' + esc(homeTip) + "</p></div>" : "");
    document.getElementById("dmls-start").addEventListener("click", function () {
      // Only reset to a fresh game if one hasn't already been started this
      // session (state.screen stays >0 after a mid-game modal close) — a
      // returning-within-session player should just be dropped back where
      // they left off, not have their in-progress players wiped.
      if (state.screen === 0) {
        state.players = [];
        state.customerOptedOut = false;
        lastResult = null;
        state.screen = 1;
        hasResume = false;
        save();
      }
      openGameModal();
    });
    var r = document.getElementById("dmls-resume");
    if (r) r.addEventListener("click", function () {
      state.screen = saved.screen;
      state.players = saved.players || [];
      state.customerOptedOut = !!saved.customerOptedOut;
      hasResume = false;
      save();
      openGameModal();
      toast("Game restored");
    });
    var al = document.getElementById("dmls-achv-link");
    if (al) al.addEventListener("click", function () { openAchievementsModal(false); });

    // Hover-equivalent for touch devices — CSS handles real :hover.
    ["dmls-char-bee", "dmls-char-fish"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("touchstart", function () { el.classList.add("dmls-char-touch"); }, { passive: true });
      el.addEventListener("touchend", function () { el.classList.remove("dmls-char-touch"); }, { passive: true });
    });
  }

  /* --- players --- */
  var justAddedIndex = -1; // marks the newest chip so only it plays the pop-in animation
  function renderPlayers() {
    if (CUSTOMER && !state.customerOptedOut && !state.players.some(function (p) { return p.isCustomer; })) {
      state.players.unshift({ name: cap(CUSTOMER.firstName || "Me").slice(0, 30), we: 0, fv: 0, bp: 0, mp: 0, isCustomer: true });
    }

    var chips = state.players.map(function (p, i) {
      return '<li class="dmls-pill' + (p.isCustomer ? " dmls-me" : "") + (i === justAddedIndex ? " dmls-chip-pop" : "") + '">' +
        '<span class="dmls-pill-name">' + esc(p.name) + (p.isCustomer ? ' <span class="dmls-tag">(you)</span>' : "") + "</span>" +
        '<button type="button" class="dmls-pill-rm" data-rm="' + i + '" aria-label="Remove ' + esc(p.name) + '">&times;</button></li>';
    }).join("");
    justAddedIndex = -1; // consumed for this render pass

    var enough = state.players.length >= 2;

    app.innerHTML =
      '<div class="dmls-card" id="dmls-screen-players">' +
      '<div class="dmls-card-body dmls-split">' +
      '<div class="dmls-card-head">' +
      dots(0) +
      '<h2 class="dmls-title">Add Names</h2>' +
      (CUSTOMER
        ? '<p class="dmls-sub">Playing as <strong style="color:var(--dmls-green)">' + esc(cap(CUSTOMER.firstName) || "you") + "</strong> — this game will save to your account.</p>"
        : '<p class="dmls-sub"><a class="dmls-inline-link" href="' + esc(withReturnUrl(loginUrl)) + '">Sign in</a> to keep your game history and earn achievements.</p>') +
      '<div class="dmls-addrow"><input id="dmls-name" maxlength="30" placeholder="Enter name here…" autocomplete="off"><button type="button" id="dmls-add" class="dmls-addrow-plus" aria-label="Add player"><span aria-hidden="true">+</span></button></div>' +
      "</div>" +
      '<div class="dmls-scroll-mid" id="dmls-chips-scroll"><ul class="dmls-chips" id="dmls-chips">' + chips + "</ul></div>" +
      '<p class="dmls-hint">' + (enough ? "" : "Add at least 2 players") + "</p>" +
      "</div>" +
      '<div class="dmls-nav">' +
      '<button type="button" class="dmls-btn dmls-btn-ghost" id="dmls-back">Back</button>' +
      '<button type="button" class="dmls-btn dmls-btn-go" id="dmls-next"' + (enough ? "" : " disabled") + ">Next</button>" +
      "</div></div>";
    fitScrollMid(document.getElementById("dmls-chips-scroll"));

    var input = document.getElementById("dmls-name");
    function add() {
      var v = input.value.trim();
      if (!v) { toast("Type a name first"); return; }
      if (state.players.length >= 12) { toast("Max players reached for one game"); return; }
      state.players.push({ name: v.slice(0, 30), we: 0, fv: 0, bp: 0, mp: 0, isCustomer: false });
      justAddedIndex = state.players.length - 1;
      save();
      renderPlayers();
      // renderPlayers() just replaced the whole card, so `input` above is a
      // detached node — grab the freshly-mounted one and refocus it, or the
      // on-screen keyboard drops after every single name on mobile.
      var freshInput = document.getElementById("dmls-name");
      if (freshInput) freshInput.focus();
    }
    document.getElementById("dmls-add").addEventListener("click", add);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); add(); } });
    document.getElementById("dmls-chips").addEventListener("click", function (e) {
      var b = e.target.closest("button[data-rm]");
      if (!b) return;
      var idx = +b.getAttribute("data-rm");
      var removed = state.players[idx];
      state.players.splice(idx, 1);
      // Bug fix: previously the guard above unconditionally re-inserted the
      // customer's own chip on the very next render, silently undoing this.
      // customerOptedOut persists that choice until the player list is reset.
      if (removed && removed.isCustomer) state.customerOptedOut = true;
      save();
      renderPlayers();
    });
    // Add Names is the modal's first screen now — Back exits to the page's
    // static welcome instead of rendering a welcome screen inside the modal.
    document.getElementById("dmls-back").addEventListener("click", function () { state.screen = 0; save(); closeModal(); });
    document.getElementById("dmls-next").addEventListener("click", function () {
      if (state.players.length < 2) { toast("Add at least 2 players"); return; }
      stepNavDirection = "next";
      state.screen = 2;
      save();
      render();
    });
  }

  /* --- score steps --- */
  // Admin-editable small tag (Settings → Steps → "Pre-heading") rendered
  // above the big display-font heading — e.g. "RESOLVE" over "WORLD'S END
  // EFFECTS", or "OPTIONAL" over "EXPANSION POINTS". Empty = no tag line.
  function stepHeadingHTML(content) {
    return (content.preHeading ? '<span class="dmls-title-tag">' + esc(content.preHeading) + "</span>" : "") + esc(content.heading);
  }

  function renderStep(n) {
    var st = STEPS[n];
    var stepNo = n - 1;
    var content = stepContent[st.key];
    var rows = state.players.map(function (p, i) {
      var v = p[st.key] | 0;
      return "<li>" +
        '<span class="dmls-nm">' + esc(p.name) + "</span>" +
        '<span class="dmls-step">' +
        '<button type="button" tabindex="-1" data-d="-1" data-i="' + i + '" aria-label="Decrease ' + esc(p.name) + '">−</button>' +
        '<input data-i="' + i + '" inputmode="numeric" value="' + v + '" class="' + (v < 0 ? "dmls-neg" : "") + '" aria-label="' + esc(p.name) + ' points">' +
        '<button type="button" tabindex="-1" data-d="1" data-i="' + i + '" aria-label="Increase ' + esc(p.name) + '">+</button>' +
        "</span></li>";
    }).join("");

    // Character image slides in from the right on Next, from the left on
    // Back — direction was set by whichever handler kicked off this
    // navigation (see stepNavDirection above); any other trigger (e.g. a
    // live config reload re-rendering the same step) leaves it null, so
    // the image just appears with no animation instead of replaying one.
    var charUrl = (serverConfig && serverConfig.images && serverConfig.images[CHAR_IMAGE_KEY[st.key]]) || "";
    var charAnimClass = stepNavDirection === "next" ? " dmls-char-in-right" : stepNavDirection === "back" ? " dmls-char-in-left" : "";
    stepNavDirection = null;
    var charHTML = charUrl
      ? '<img class="dmls-card-character' + charAnimClass + '" src="' + charUrl.replace(/"/g, "%22") + '" alt="" loading="lazy">'
      : "";

    app.innerHTML =
      '<div class="dmls-card' + (st.exp ? " dmls-card-exp" : " dmls-card-step-" + st.key) + '" id="dmls-screen-step-' + st.key + '">' +
      charHTML +
      '<div class="dmls-card-body dmls-split">' +
      '<div class="dmls-card-head">' +
      dots(stepNo) +
      '<h2 class="dmls-title">' + stepHeadingHTML(content) + "</h2>" +
      '<p class="dmls-sub">' + esc(content.sub) + "</p>" +
      "</div>" +
      '<div class="dmls-scroll-mid" id="dmls-rows-scroll"><ul class="dmls-scores" id="dmls-rows">' + rows + "</ul></div>" +
      "</div>" +
      '<div class="dmls-nav">' +
      '<button type="button" class="dmls-btn dmls-btn-ghost" id="dmls-back">Back</button>' +
      '<span class="dmls-spacer"></span>' +
      '<button type="button" class="dmls-btn dmls-btn-go" id="dmls-next">Next</button>' +
      "</div></div>";
    fitScrollMid(document.getElementById("dmls-rows-scroll"));

    var wrap = document.getElementById("dmls-rows");
    wrap.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-d]");
      if (!b) return;
      var i = +b.getAttribute("data-i");
      var nv = (state.players[i][st.key] | 0) + (+b.getAttribute("data-d"));
      if (nv < st.min) nv = st.min;
      state.players[i][st.key] = nv;
      var inp = wrap.querySelector('input[data-i="' + i + '"]');
      inp.value = nv;
      inp.classList.toggle("dmls-neg", nv < 0);
      save();
    });
    wrap.addEventListener("input", function (e) {
      var inp = e.target.closest("input[data-i]");
      if (!inp) return;
      var i = +inp.getAttribute("data-i");
      var v = parseInt(inp.value, 10);
      if (isNaN(v)) v = 0;
      if (v < st.min) v = st.min;
      state.players[i][st.key] = v;
      inp.classList.toggle("dmls-neg", v < 0);
      save();
    });
    document.getElementById("dmls-back").addEventListener("click", function () { stepNavDirection = "back"; state.screen = n - 1; save(); render(); });
    document.getElementById("dmls-next").addEventListener("click", function () {
      if (n === 5) { finishGame(); return; }
      stepNavDirection = "next";
      state.screen = n + 1;
      save();
      render();
    });
  }

  function finishGame() {
    state.screen = 6;
    save();

    // Brief suspense beat while the game saves. Offline or slow (>3s) falls
    // back to the local reveal exactly as before.
    var revealed = false;
    app.innerHTML =
      '<div class="dmls-card dmls-anim-in dmls-counting" id="dmls-screen-counting">' +
      '<h2 class="dmls-title">Adding up the doom…</h2>' +
      '<div class="dmls-count-dots" aria-hidden="true"><i></i><i></i><i></i></div>' +
      "</div>";

    var fallback = setTimeout(function () {
      revealed = true;
      renderWinner();
    }, 3000);

    apiPost("/game", {
      players: state.players,
      deviceType: DEVICE_TYPE,
      playedAtLocalDate: localDateStr(),
    })
      .then(function (res) {
        if (!res || !res.saved) {
          saveFailed = true;
          save(); // persist the real outcome — see note below
          if (revealed) { renderWinner(); return; } // late failure: correct the message on screen
          clearTimeout(fallback); revealed = true; renderWinner();
          return;
        }
        lastResult = res;
        save(); // persist the real outcome — see note below
        if (revealed) { renderWinner(); return; } // arrived after fallback: refresh stats only
        clearTimeout(fallback);
        revealed = true;
        renderWinner();
      })
      .catch(function () {
        saveFailed = true;
        // The save() at the top of finishGame() snapshots lastResult/saveFailed
        // as they were BEFORE this request settled (null/false) — that's the
        // only localStorage write on this path unless we save() again here.
        // Without it, reloading the page (or landing back on the winner
        // screen via the hash-restore below) reads that stale "still in
        // flight" snapshot forever and shows "Saving your game…" even though
        // the game actually saved (or definitively failed) long ago.
        save();
        if (revealed) { renderWinner(); return; } // late failure: correct the message on screen
        clearTimeout(fallback); revealed = true; renderWinner();
      });
  }

  /* --- Achievements + History modal content --- */
  var BIRTHDAY_KEY = "birthday"; // matches AchievementKey in lib/score/achievements.ts ("Birthdoom")
  var achvData = null;   // {achievements, recentGames, profile} — fetched fresh each time the modal opens
  var achvTab = "achv";  // "achv" | "history"
  var achvExpanded = {}; // history row index -> bool, "View More" state

  function openAchievementsModal(fromHash) {
    view = "achv";
    app.hidden = true;
    trophyEl.hidden = true;
    achvEl.hidden = false;
    modalDeepLinked = !!fromHash;
    achvTab = "achv";
    achvExpanded = {};
    showModal();
    syncHash(!fromHash);
    achvData = null;
    renderAchvLoading();
    apiGet("/achievements")
      .then(function (d) {
        if (view !== "achv") return; // navigated away before this resolved
        if (!d || d.error || d.authenticated === false) { renderAchvError(); return; }
        achvData = d;
        renderAchvShell();
      })
      .catch(function () {
        if (view === "achv") renderAchvError();
      });
  }

  function achvChrome(bodyHTML, screenId) {
    achvEl.innerHTML =
      '<div class="dmls-card dmls-anim-in" id="' + screenId + '">' +
      '<div class="dmls-card-body">' + bodyHTML + "</div>" +
      "</div>";
  }
  // Same fixed-header/fixed-footer/scrolling-middle pattern as the Add Names
  // and scoring-step screens — the "Play Doomlings" CTA is bottom-pinned via
  // .dmls-nav (a flex:none sibling of .dmls-card-body, outside its scroll
  // region) so it stays visible regardless of how long the achievement grid
  // or history list gets.
  function achvChromeSplit(headHTML, midHTML, screenId) {
    achvEl.innerHTML =
      '<div class="dmls-card dmls-anim-in" id="' + screenId + '">' +
      '<div class="dmls-card-body dmls-split">' +
      '<div class="dmls-card-head">' + headHTML + "</div>" +
      '<div class="dmls-scroll-mid" id="dmls-achv-scroll">' + midHTML + "</div>" +
      "</div>" +
      '<div class="dmls-nav"><span class="dmls-spacer"></span><button type="button" class="dmls-btn dmls-btn-go" id="dmls-achv-play">Play Doomlings</button><span class="dmls-spacer"></span></div>' +
      "</div>";
    fitScrollMid(document.getElementById("dmls-achv-scroll"));
  }

  function renderAchvLoading() {
    achvChrome(
      '<h2 class="dmls-title">Achievements</h2>' +
      '<p class="dmls-sub">Loading…</p>',
      "dmls-screen-achv-loading"
    );
  }
  function renderAchvError() {
    achvChrome(
      '<h2 class="dmls-title">Achievements</h2>' +
      '<p class="dmls-sub">Couldn’t load your achievements right now — check your connection and try again.</p>' +
      '<button type="button" class="dmls-btn dmls-btn-ghost" id="dmls-achv-retry">Retry</button>',
      "dmls-screen-achv-error"
    );
    var retry = document.getElementById("dmls-achv-retry");
    if (retry) retry.addEventListener("click", function () { openAchievementsModal(false); });
  }

  function achvTileHTML(a) {
    if (!a.unlocked) {
      var bday = a.key === BIRTHDAY_KEY && achvData.profile && !achvData.profile.hasBirthday
        ? '<form class="dmls-bday-form" data-bday-form>' +
          '<input type="date" class="dmls-bday-input" required aria-label="Your birthday">' +
          '<button type="submit" class="dmls-bday-submit">Save birthday</button>' +
          "</form>"
        : "";
      // A custom locked-state icon (admin-uploaded, e.g. a purple-recolored
      // version of the real icon) is shown as-is, full opacity, no
      // .dmls-achv-icon-locked override — that class only kicks in as a
      // fallback (flat purple fill, real icon hidden) when the admin hasn't
      // set one, so unlocking still has something to reveal.
      var hasCustomLocked = !!a.iconUrlLocked;
      var lockedUrl = a.iconUrlLocked || a.iconUrl;
      var lockedIconStyle = lockedUrl ? ' style="background-image:url(\'' + lockedUrl.replace(/'/g, "%27") + '\')"' : "";
      var lockedIconClass = "dmls-achv-icon" +
        (hasCustomLocked ? "" : " dmls-achv-icon-locked") +
        (lockedUrl ? "" : " dmls-achv-icon-empty");
      return '<div class="dmls-achv-tile dmls-achv-locked">' +
        '<div class="' + lockedIconClass + '"' + lockedIconStyle + ' aria-hidden="true"></div>' +
        '<p class="dmls-achv-name">' + esc(a.name) + "</p>" +
        '<p class="dmls-achv-desc">??????</p>' +
        bday +
        "</div>";
    }
    var when = "";
    if (a.unlockedAt) {
      var d = new Date(a.unlockedAt);
      if (!isNaN(d.getTime())) when = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }
    return '<div class="dmls-achv-tile dmls-achv-unlocked">' +
      '<div class="dmls-achv-icon"' + (a.iconUrl ? ' style="background-image:url(\'' + a.iconUrl.replace(/'/g, "%27") + '\')"' : "") + '></div>' +
      '<p class="dmls-achv-name">' + esc(a.name) + "</p>" +
      '<p class="dmls-achv-desc">' + esc(a.description) + "</p>" +
      (when ? '<p class="dmls-achv-date">' + esc(when) + "</p>" : "") +
      "</div>";
  }

  function historyRowHTML(g, idx) {
    var d = new Date(g.playedAt);
    var when = isNaN(d.getTime()) ? "" : (
      String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0") + "." + d.getFullYear()
    );
    var expanded = !!achvExpanded[idx];
    var players = g.players || [];
    var detail = players.map(function (p) {
      return '<div class="dmls-hist-detail-row"><span>' + esc(p.name) + '</span><b>' + (p.total | 0) + ' pts</b></div>';
    }).join("");
    // No win badge/border here per client request — the old .dmls-won /
    // .dmls-hist-badge markup is intentionally not carried over.
    return '<li class="dmls-hist-row">' +
      '<p class="dmls-hist-title">' + esc((g.winnerNames || []).join(" & ")) + " Won with " + g.topScore + " pts.</p>" +
      '<div class="dmls-hist-meta">' +
      '<span class="dmls-hist-date">' + when + "</span>" +
      "<span>" + g.playerCount + " Players</span>" +
      // Per-player breakdown is the only thing this reveals — no point
      // offering it when there's nothing stored to show (e.g. older rows
      // saved before the players column existed), or when there's only one
      // player, whose score the title line already states in full.
      (players.length > 1
        ? '<button type="button" class="dmls-hist-more" data-more="' + idx + '">' + (expanded ? "View Less" : "View More") + "</button>"
        : "") +
      "</div>" +
      (players.length > 1
        ? '<div class="dmls-hist-detail" id="dmls-hist-detail-' + idx + '"' + (expanded ? "" : " hidden") + ">" + detail + "</div>"
        : "") +
      "</li>";
  }

  function renderAchvShell() {
    var achievements = achvData.achievements || [];
    var games = achvData.recentGames || [];

    var achvGrid = '<div class="dmls-achv-grid">' + achievements.map(achvTileHTML).join("") + "</div>";
    var histList = games.length
      ? '<ul class="dmls-hist-list">' + games.map(historyRowHTML).join("") + "</ul>"
      : '<p class="dmls-hist-empty">No games logged yet — play one to get started!</p>';

    achvChromeSplit(
      '<div class="dmls-achv-tabs" role="tablist">' +
      '<button type="button" class="dmls-achv-tab" data-tab="achv" role="tab">ACHV.</button>' +
      '<button type="button" class="dmls-achv-tab" data-tab="history" role="tab">HISTORY</button>' +
      "</div>" +
      '<h2 class="dmls-title">Achievements</h2>',
      '<div id="dmls-achv-panel-achv">' + achvGrid + "</div>" +
      '<div id="dmls-achv-panel-history" hidden>' + histList + "</div>",
      "dmls-screen-achievements"
    );

    applyAchvTab();

    var tabs = achvEl.querySelectorAll(".dmls-achv-tab");
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener("click", function () {
        achvTab = t.getAttribute("data-tab");
        applyAchvTab();
      });
    });

    var histPanel = document.getElementById("dmls-achv-panel-history");
    if (histPanel) histPanel.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-more]");
      if (!b) return;
      var idx = b.getAttribute("data-more");
      achvExpanded[idx] = !achvExpanded[idx];
      var detail = document.getElementById("dmls-hist-detail-" + idx);
      if (detail) detail.hidden = !achvExpanded[idx];
      b.textContent = achvExpanded[idx] ? "View Less" : "View More";
    });

    var achvPanel = document.getElementById("dmls-achv-panel-achv");
    if (achvPanel) achvPanel.addEventListener("submit", function (e) {
      var form = e.target.closest("form[data-bday-form]");
      if (!form) return;
      e.preventDefault();
      var input = form.querySelector("input[type=date]");
      var val = input && input.value;
      if (!val) return;
      var btn = form.querySelector("button");
      if (btn) btn.disabled = true;
      apiPost("/profile", { birthday: val })
        .then(function (r) {
          if (r && r.saved) {
            achvData.profile.hasBirthday = true;
            toast("Birthday saved!");
            renderAchvShell();
          } else {
            toast("Couldn’t save — try again");
            if (btn) btn.disabled = false;
          }
        })
        .catch(function () {
          toast("Couldn’t save — try again");
          if (btn) btn.disabled = false;
        });
    });

    var playBtn = document.getElementById("dmls-achv-play");
    if (playBtn) playBtn.addEventListener("click", function () {
      state.players = [];
      state.customerOptedOut = false;
      lastResult = null;
      state.screen = 1;
      view = "game";
      achvEl.hidden = true;
      app.hidden = false;
      save();
      render();
    });
  }
  function applyAchvTab() {
    var tabs = achvEl.querySelectorAll(".dmls-achv-tab");
    Array.prototype.forEach.call(tabs, function (t) {
      t.classList.toggle("dmls-achv-tab-on", t.getAttribute("data-tab") === achvTab);
    });
    var pAchv = document.getElementById("dmls-achv-panel-achv");
    var pHist = document.getElementById("dmls-achv-panel-history");
    if (pAchv) pAchv.hidden = achvTab !== "achv";
    if (pHist) pHist.hidden = achvTab !== "history";
  }

  /* --- winner --- */
  function renderWinner() {
    var ranked = state.players.slice().sort(function (a, b) { return total(b) - total(a); });
    var top = ranked.length ? total(ranked[0]) : 0;
    // The hero spotlight always names exactly one winner, even on a tie —
    // showing every tied name turned into an unreadable wall of text with
    // more than a couple of players. ranked[0] is always a top scorer by
    // construction (stable sort keeps the players' original order among
    // ties), so it's a reasonable single pick. The full score list below
    // still shows and gold-highlights everyone who actually tied for first.
    var winner = ranked[0];
    var winnerName = winner ? esc(winner.name) : "";
    var meWon = !!(winner && winner.isCustomer);

    // Three states for the logged-in customer's widget, per the winner-screen
    // mock: still saving / failed to save (unchanged), then once lastResult
    // lands either "new achievement(s) unlocked this game" (featured, with
    // icon+name) or — the more common case — just a running games-played
    // count. Both link to the Achievements modal instead of listing details
    // inline. Guests still get the create-account pitch, now also offering
    // sign-in for existing accounts that aren't currently logged in.
    var loyaltyHTML;
    if (CUSTOMER) {
      if (lastResult) {
        var unlocked = lastResult.achievementsUnlocked || [];
        if (unlocked.length) {
          var achvItems = unlocked.map(function (a) {
            return '<div class="dmls-win-achv-item">' +
              '<div class="dmls-achv-icon"' +
              (a.iconUrl ? ' style="background-image:url(\'' + a.iconUrl.replace(/'/g, "%27") + '\')"' : "") +
              '></div><p class="dmls-achv-name">' + esc(a.name) + "</p></div>";
          }).join("");
          loyaltyHTML =
            '<div class="dmls-widget dmls-widget-center dmls-widget-new-achievement">' +
            '<h3 class="dmls-widget-title">' + (unlocked.length > 1 ? "New Achievements!" : "New Achievement!") + "</h3>" +
            achvItems +
            '<button type="button" class="dmls-btn dmls-btn-ghost" data-achv-link>Achievements</button></div>';
        } else {
          loyaltyHTML =
            '<div class="dmls-widget dmls-widget-center dmls-widget-games-played">' +
            '<p class="dmls-win-stat-num">' + (lastResult.gamesPlayed != null ? lastResult.gamesPlayed : "—") + "</p>" +
            '<h3 class="dmls-widget-title">Games Played</h3>' +
            '<button type="button" class="dmls-btn dmls-btn-ghost" data-achv-link>Achievements</button></div>';
          // gamesPlayed is only ever null here when this exact game was saved
          // as a guest (no customer_id) — e.g. the player finished the game,
          // THEN logged in via "My Account" and landed back on this screen.
          // saveGame() never computed a count for a customerId-less save, so
          // there's nothing to show but "—" until we go get the real number
          // from the account that's authenticated now. Guarded so a re-render
          // (e.g. the /config-driven one) can't fire a second overlapping
          // fetch, and mutating lastResult.gamesPlayed directly means once it
          // lands, this branch just renders the real number on its own.
          if (lastResult.gamesPlayed == null && !gamesPlayedRefreshing) {
            gamesPlayedRefreshing = true;
            apiGet("/achievements")
              .then(function (r) {
                if (r && r.authenticated && typeof r.gamesPlayed === "number" && lastResult) {
                  lastResult.gamesPlayed = r.gamesPlayed;
                  save();
                  renderWinner();
                }
              })
              .catch(function () {})
              .then(function () { gamesPlayedRefreshing = false; });
          }
        }
      } else if (saveFailed) {
        loyaltyHTML =
          '<div class="dmls-widget dmls-widget-save-failed"><h3 class="dmls-widget-title">Your Game</h3>' +
          "<p>We couldn’t save this game to your account — check your connection. This game won’t count toward your achievements.</p></div>";
      } else {
        loyaltyHTML =
          '<div class="dmls-widget dmls-widget-saving"><h3 class="dmls-widget-title">Your Game</h3>' +
          "<p>Saving your game…</p></div>";
      }
    } else {
      // Single "My Account" CTA per the mock, linking to the login route
      // (see loginUrl above) — it presents its own "Sign in / Create
      // account" choice, so one button still covers both "never signed up"
      // and "has an account, just isn't signed in right now" without us
      // having to tell those two apart (we can't — both look like "no
      // session").
      loyaltyHTML =
        '<div class="dmls-widget dmls-widget-center dmls-widget-guest-cta"><h3 class="dmls-widget-title">Save this victory</h3>' +
        "<p>Create or Sign In to your free Doomlings account to track your game history and earn achievements.</p>" +
        '<a class="dmls-btn dmls-btn-ghost" href="' + esc(withReturnUrl(loginUrl)) + '">My Account</a>' +
        "</div>";
    }

    app.innerHTML =
      '<div class="dmls-card dmls-anim-in dmls-winner" id="dmls-screen-winner">' +
      '<div class="dmls-card-body">' +
      '<div class="dmls-win-main">' +
      logoHTML("dmls-win-logo") +
      // Eyebrow + name + points are all burned onto the art itself (an
      // absolutely positioned caption over the image) when there's art to
      // put them on; falls back to plain stacked text when no winner image
      // is configured.
      (ICONS.winner
        ? '<div class="dmls-win-art-wrap">' +
          '<img class="dmls-win-art" src="' + ICONS.winner + '" alt="" loading="lazy">' +
          '<div class="dmls-win-art-caption">' +
          '<p class="dmls-win-eyebrow">The winner is&hellip;</p>' +
          '<h1 class="dmls-win-name">' + winnerName + "</h1>" +
          '<p class="dmls-win-points">' + top + " points</p>" +
          "</div></div>"
        : '<p class="dmls-win-eyebrow">The winner is&hellip;</p>' +
          '<h1 class="dmls-win-name">' + winnerName + "</h1>" +
          '<p class="dmls-win-points">' + top + " points</p>") +
      (meWon ? '<p class="dmls-sub">Hi ' + esc(cap(CUSTOMER.firstName) || "there") + ", that’s you!</p>" : "") +
      '<ul class="dmls-win-scores">' +
      ranked.map(function (p) {
        return '<li class="dmls-win-score-row">' +
          '<span class="dmls-win-score-name">' + esc(p.name) + "</span>" +
          '<span class="dmls-win-score-pts">' + total(p) + " points</span></li>";
      }).join("") +
      "</ul>" +
      '<button type="button" class="dmls-btn dmls-btn-outline-gold dmls-win-trophy" data-trophy>Generate Trophy</button>' +
      '<div class="dmls-win-cta-row">' +
      '<button type="button" class="dmls-btn dmls-btn-go dmls-win-cta" data-rematch>Rematch!</button>' +
      '<button type="button" class="dmls-btn dmls-btn-ghost dmls-win-cta-secondary" data-new-players>Or New Players</button>' +
      "</div></div>" +
      '<div class="dmls-widgets" id="dmls-widgets">' + loyaltyHTML + "</div>" +
      "</div></div>";

    // Move Liquid-rendered products into the widgets column and show them
    var widgets = document.getElementById("dmls-widgets");
    if (productsEl && widgets) {
      productsEl.hidden = false;
      productsEl.classList.add("dmls-widget");
      widgets.appendChild(productsEl);
    }
    // Discord banner goes last, below products — only when an admin has set
    // a link in Settings (empty = hidden, no dead/placeholder-URL banner).
    if (discordUrl && widgets) {
      widgets.insertAdjacentHTML(
        "beforeend",
        '<a class="dmls-widget dmls-discord-banner" href="' + esc(discordUrl) + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="dmls-discord-icon" aria-hidden="true">💬</span>' +
        '<span class="dmls-discord-text">Join us on Discord</span></a>'
      );
    }
    // Settings → Winner screen → "Bottom banner image" (+ optional click-through
    // link) — pinned to the very bottom of the widgets column, below everything
    // else (achievements/loyalty widget, product recs, Discord banner). Appended
    // last, inside #dmls-widgets, rather than baked into the initial innerHTML
    // string above, since products/Discord are also added to this div after the
    // fact — baking it in earlier would put it above them instead of below.
    // Empty image = hidden; empty link = plain non-clickable <img>.
    if (ICONS.winnerFooter && widgets) {
      var footerImgHTML = '<img class="dmls-win-footer-img" src="' + ICONS.winnerFooter + '" alt="" loading="lazy">';
      widgets.insertAdjacentHTML(
        "beforeend",
        winnerFooterUrl
          ? '<a href="' + esc(winnerFooterUrl) + '" target="_blank" rel="noopener noreferrer">' + footerImgHTML + "</a>"
          : footerImgHTML
      );
    }

    app.addEventListener("click", winnerClicks);

    document.querySelector("[data-rematch]").addEventListener("click", rematch);
    document.querySelector("[data-new-players]").addEventListener("click", newPlayers);
    document.querySelector("[data-trophy]").addEventListener("click", openTrophyModal);

    confettiBurst();
  }

  // Shared by the winner screen's CTA row and the trophy screen's action row
  // (both views can start a rematch/new-players/achievements flow) — resets
  // state.screen has to also flip trophyEl/app visibility, since called from
  // the trophy screen means #dmls-app is currently hidden underneath it.
  function rematch() {
    state.players.forEach(function (p) { p.we = 0; p.fv = 0; p.bp = 0; p.mp = 0; });
    lastResult = null;
    stepNavDirection = "next";
    state.screen = 2;
    save();
    view = "game";
    trophyEl.hidden = true;
    app.hidden = false;
    render();
  }
  function newPlayers() {
    state.players = [];
    state.customerOptedOut = false;
    lastResult = null;
    state.screen = 1;
    save();
    view = "game";
    trophyEl.hidden = true;
    app.hidden = false;
    render();
  }

  /* --- trophy screen — a separate view over the same open modal, same
     show/hide pattern as achievements (#dmls-app just hides, keeps its
     rendered winner-screen HTML underneath). No dedicated close/back action
     here — its three actions (rematch/newPlayers/openAchievementsModal) all
     already flip the view themselves, and the modal's own X handles a plain
     close. No hash/deep-link support here unlike achievements: this screen
     is derived from the current in-memory game result, not something
     meaningful to bookmark or resume after a reload. */
  function openTrophyModal() {
    view = "trophy";
    app.hidden = true;
    trophyEl.hidden = false;
    renderTrophy();
  }
  function renderTrophy() {
    var ranked = state.players.slice().sort(function (a, b) { return total(b) - total(a); });
    var winner = ranked[0];
    var winnerName = winner ? esc(winner.name) : "";
    var top = ranked.length ? total(ranked[0]) : 0;
    // Excludes everyone at the top score, not just ranked[0] — on a tie for
    // first, slice(1) would otherwise list a co-winner as one of "the other
    // people".
    var loserNamesRaw = ranked.filter(function (p) { return total(p) !== top; }).map(function (p) { return p.name; }).join(", ");
    var loserNames = esc(loserNamesRaw);
    // One of the admin's trophy-design pool, picked fresh on every visit to
    // this screen (client spec: random per generation, for variety — not a
    // single fixed graphic).
    var trophyTopUrl = trophyTopImages.length
      ? trophyTopImages[Math.floor(Math.random() * trophyTopImages.length)]
      : "";
    // Shared image mirrors exactly what's on screen — same trophy design,
    // same heading/tagline/loser names — rather than a separately-templated
    // "generic" card, so a screenshot and the shared PNG never look different.
    var shareImageUrl = PROXY + "/trophy?name=" + encodeURIComponent(winner ? winner.name : "") +
      "&score=" + encodeURIComponent(top) +
      "&date=" + encodeURIComponent(localDateStr()) +
      "&top=" + encodeURIComponent(trophyTopUrl) +
      "&bg=" + encodeURIComponent(trophyBgUrl) +
      "&heading=" + encodeURIComponent(trophyHeading) +
      "&sub=" + encodeURIComponent(trophySubheading) +
      "&tagline=" + encodeURIComponent(trophyTagline) +
      "&losers=" + encodeURIComponent(loserNamesRaw);

    // Kicked off immediately, as soon as this screen renders, rather than
    // waiting for a Share/Download click — the image is generated server-side
    // (next/og) and can take a visible beat, so starting it now means it's
    // usually already cached (route sets a 24h Cache-Control) by the time the
    // player actually taps one of the buttons below. Both handlers await this
    // same promise instead of firing their own fetch, so there's only ever
    // one request per visit to this screen.
    var trophyImageReady = false;
    var trophyImageBlob = fetch(shareImageUrl).then(function (r) {
      if (!r.ok) throw new Error("trophy image " + r.status);
      return r.blob();
    });
    trophyImageBlob.then(function () { trophyImageReady = true; }, function () {});

    // Anchored inside .dmls-trophy-top-wrap (the trophy art's own wrapper,
    // not the whole card) so top:50% in CSS centers the share/download
    // icons against the art's height specifically — that stays correct now
    // that the card sizes to its content instead of a fixed viewport-height
    // card (see #dmls-root .dmls-card in dmls-score.css).
    var floatActionsHTML =
      '<div class="dmls-trophy-float-actions">' +
      '<button type="button" class="dmls-trophy-share" id="dmls-trophy-share" aria-label="Share trophy image">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>' +
      "</button>" +
      '<button type="button" class="dmls-trophy-download" id="dmls-trophy-download" aria-label="Download trophy image">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>' +
      "</button>" +
      "</div>";
    trophyEl.innerHTML =
      '<div class="dmls-card dmls-anim-in dmls-trophy-scene" id="dmls-screen-trophy">' +
      '<div class="dmls-card-body">' +
      '<div class="dmls-trophy-fill">' +
      (trophyTopUrl
        ? '<div class="dmls-trophy-top-wrap">' +
          '<img class="dmls-trophy-top" src="' + trophyTopUrl + '" alt="" loading="lazy">' +
          '<p class="dmls-trophy-plate dmls-trophy-plate-overlay">' + winnerName + "</p>" +
          floatActionsHTML +
          "</div>"
        : '<div class="dmls-trophy-top-wrap dmls-trophy-top-wrap-plain">' +
          '<p class="dmls-trophy-plate">' + winnerName + "</p>" +
          floatActionsHTML +
          "</div>") +
      '<h2 class="dmls-trophy-heading">' + esc(trophyHeading) + "</h2>" +
      '<hr class="dmls-trophy-divider">' +
      (loserNames
        ? '<p class="dmls-trophy-losers">' + loserNames + "</p>" +
          (trophyTagline ? '<p class="dmls-trophy-tagline">' + esc(trophyTagline) + "</p>" : "") +
          '<p class="dmls-trophy-didnot">' + esc(trophySubheading) + "</p>"
        : "") +
      "</div>" +
      '<div class="dmls-trophy-actions-wrap">' +
      '<div class="dmls-trophy-actions">' +
      '<button type="button" class="dmls-btn dmls-btn-go dmls-trophy-action-btn" id="dmls-trophy-rematch">Rematch!</button>' +
      '<button type="button" class="dmls-btn dmls-btn-ghost dmls-trophy-action-btn" id="dmls-trophy-new-players">Or New Players</button>' +
      '<button type="button" class="dmls-btn dmls-btn-ghost dmls-trophy-action-btn" id="dmls-trophy-achv">Achievements</button>' +
      "</div></div>" +
      "</div></div>";

    document.getElementById("dmls-trophy-rematch").addEventListener("click", rematch);
    document.getElementById("dmls-trophy-new-players").addEventListener("click", newPlayers);
    document.getElementById("dmls-trophy-achv").addEventListener("click", function () { openAchievementsModal(false); });
    document.getElementById("dmls-trophy-share").addEventListener("click", function () {
      shareTrophyImage(shareImageUrl, trophyImageBlob, trophyImageReady);
    });
    document.getElementById("dmls-trophy-download").addEventListener("click", function () {
      downloadTrophyImage(trophyImageBlob, trophyImageReady);
    });
  }

  // Prefers the native share sheet with the actual PNG attached (works well
  // on mobile — can share straight to Messages/Instagram/etc); falls back to
  // sharing just the URL, then to opening it in a new tab (desktop, or any
  // browser without the Web Share API) where a long-press/right-click saves it.
  // blobPromise is the single fetch kicked off in renderTrophy() as soon as
  // this screen opened — reused here instead of fetching the image again —
  // and wasReady says whether it had already resolved by click time, so a toast
  // only appears for the (usually rare) case the generation is still running.
  function shareTrophyImage(url, blobPromise, wasReady) {
    if (!navigator.share) { window.open(url, "_blank", "noopener"); return; }
    var btn = document.getElementById("dmls-trophy-share");
    function setLoading(on) {
      if (!btn) return;
      btn.classList.toggle("dmls-trophy-share-loading", on);
      btn.disabled = on;
    }
    if (!wasReady) toast("Generating trophy image…");
    if (!navigator.canShare) {
      setLoading(true);
      navigator.share({ url: url, title: "Doomlings Trophy" })
        .catch(function () {})
        .then(function () { setLoading(false); });
      return;
    }
    setLoading(true);
    // Opened synchronously, inside the click's user-activation window — the
    // blobPromise below is awaited before navigator.share() runs, and by the
    // time that resolves the browser can consider the activation expired,
    // silently blocking a window.open() called from inside the .catch as a
    // non-gesture popup (and separately, navigator.share() itself can reject
    // with NotAllowedError for the same reason). Pre-opening this blank tab
    // now — then either closing it (share succeeded) or pointing it at the
    // image (fallback needed) — keeps the fallback from silently doing nothing.
    var fallbackWin = window.open("", "_blank", "noopener");
    blobPromise
      .then(function (blob) {
        var file = new File([blob], "doomlings-trophy.png", { type: "image/png" });
        if (navigator.canShare({ files: [file] })) {
          return navigator.share({ files: [file], title: "Doomlings Trophy" });
        }
        return navigator.share({ url: url, title: "Doomlings Trophy" });
      })
      .then(function () { if (fallbackWin) fallbackWin.close(); })
      .catch(function (err) {
        if (err && err.name === "AbortError") { if (fallbackWin) fallbackWin.close(); return; } // user dismissed the share sheet
        if (fallbackWin) fallbackWin.location = url;
        else window.open(url, "_blank", "noopener");
      })
      .then(function () { setLoading(false); });
  }

  // Explicit "save this file" action, separate from Share — a browser-triggered
  // download via a temporary <a download> always saves the PNG regardless of
  // whether the OS has any share targets configured (the gap the "export
  // button not working" reports on desktop kept running into).
  function downloadTrophyImage(blobPromise, wasReady) {
    var btn = document.getElementById("dmls-trophy-download");
    function setLoading(on) {
      if (!btn) return;
      btn.classList.toggle("dmls-trophy-download-loading", on);
      btn.disabled = on;
    }
    if (!wasReady) toast("Generating trophy image…");
    setLoading(true);
    blobPromise
      .then(function (blob) {
        var blobUrl = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = blobUrl;
        a.download = "doomlings-trophy.png";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 1000);
      })
      .catch(function () { toast("Couldn’t generate the image — check your connection."); })
      .then(function () { setLoading(false); });
  }

  function winnerClicks(e) {
    var achvBtn = e.target.closest("[data-achv-link]");
    if (achvBtn) { openAchievementsModal(false); return; }
    var buy = e.target.closest("button[data-variant-id]");
    if (buy) {
      buy.disabled = true;
      fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: Number(buy.getAttribute("data-variant-id")), quantity: 1 }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("cart");
          buy.textContent = "✓"; // circular icon button — no room for "Added ✓"; the toast says the rest
          toast(buy.getAttribute("data-title") + " added to cart");
          document.dispatchEvent(new CustomEvent("dmls:cart:added"));
        })
        .catch(function () {
          buy.disabled = false;
          toast("Couldn’t add to cart — try again");
        });
    }
  }

  /* --- confetti --- */
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var confettiCv = null;
  function confettiBurst() {
    if (reduceMotion) return;
    if (!confettiCv) {
      confettiCv = document.createElement("canvas");
      confettiCv.id = "dmls-confetti";
      document.body.appendChild(confettiCv);
    }
    var cv = confettiCv;
    var ctx = cv.getContext("2d");
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
    var COLORS = ["#ffd54a", "#80d235", "#ff6a5c", "#5cc8ff", "#dd7bff"];
    var pieces = [];
    for (var i = 0; i < 140; i++) {
      pieces.push({
        x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
        w: 6 + Math.random() * 7, h: 8 + Math.random() * 10,
        vy: 2 + Math.random() * 3, vx: -1 + Math.random() * 2,
        rot: Math.random() * Math.PI, vr: -0.1 + Math.random() * 0.2,
        c: COLORS[i % COLORS.length],
      });
    }
    var start = performance.now();
    (function tick(t) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      var alive = false;
      pieces.forEach(function (p) {
        p.y += p.vy; p.x += p.vx; p.rot += p.vr;
        if (p.y < cv.height + 30) alive = true;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
      });
      if (alive && t - start < 6000) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })(start);
  }

  /* --- boot --- */
  // A refresh (or a bookmarked/shared link) carries the screen in the URL
  // hash. Only trust it as a restore target when it agrees with what's
  // actually saved in localStorage — an arbitrary shared "#winner" link
  // shouldn't drop a fresh visitor with no data onto a blank winner screen.
  // "achievements" is always safe to honor directly since that screen fetches
  // its own data and needs no local game state.
  var bootHash = location.hash.slice(1);
  if (bootHash === "achievements") {
    modalDeepLinked = true;
  } else {
    var hashScreen = screenForHash(bootHash);
    if (saved && hashScreen !== null && saved.screen === hashScreen) {
      state.screen = saved.screen;
      state.players = saved.players || [];
      state.customerOptedOut = !!saved.customerOptedOut;
      lastResult = saved.lastResult || null;
      saveFailed = !!saved.saveFailed;
      hasResume = false;
      modalDeepLinked = true;
    }
  }

  renderPageWelcome(); // after hasResume/state are finalized above

  syncHash(false); // normalize the URL to match the restored/default state, no extra history entry

  if (modalDeepLinked) {
    if (bootHash === "achievements") openAchievementsModal(true);
    else { showModal(); render(); }
  }

  // Step headings/descriptions (stepContent) start empty and are only ever
  // filled in by this response (see stepContent above) — so unlike other
  // fields, a step screen has nothing sensible to show at all until this
  // resolves. loadConfig() is retried once on failure; either way, if a
  // step screen is waiting (render() showed renderStepPending() instead of
  // rendering blank), it calls render() again once this settles.
  function loadConfig(retryOnFail) {
    return apiGet("/config")
    .then(function (c) {
      if (!c || c.error) return;
      serverConfig = c;
      var images = c.images || {};
      // Backgrounds are pure CSS (custom properties) — safe to apply any time,
      // no re-render needed, the browser repaints whatever's on screen.
      if (images.bg) modalEl.style.setProperty("--dmls-bg-url", 'url("' + images.bg + '")');
      // bgExp/bgWe/bgFv/bgBp (the per-step CHARACTER image) are no longer
      // CSS custom properties — renderStep() reads them straight off
      // serverConfig.images and renders a real <img> so it can be animated
      // in; only the background layers stay pure-CSS here.
      if (images.bgWeCustom) modalEl.style.setProperty("--dmls-bg-we-custom-url", 'url("' + images.bgWeCustom + '")');
      if (images.bgFvCustom) modalEl.style.setProperty("--dmls-bg-fv-custom-url", 'url("' + images.bgFvCustom + '")');
      if (images.bgBpCustom) modalEl.style.setProperty("--dmls-bg-bp-custom-url", 'url("' + images.bgBpCustom + '")');
      if (images.bgExpCustom) modalEl.style.setProperty("--dmls-bg-exp-custom-url", 'url("' + images.bgExpCustom + '")');
      if (images.bgWinner) modalEl.style.setProperty("--dmls-bg-winner-url", 'url("' + images.bgWinner + '")');
      if (images.trophyBg) modalEl.style.setProperty("--dmls-bg-trophy-url", 'url("' + images.trophyBg + '")');
      if (images.bg) root.style.setProperty("--dmls-bg-url", 'url("' + images.bg + '")'); // launcher card reuses the same bg
      // Same fallback chain as .dmls-trophy-fill's CSS custom-property chain
      // above (trophyBg → bgWinner → bg) — kept as a plain var, not just CSS,
      // because renderTrophy() needs the actual resolved URL string to pass
      // through to the shared-image route (which can't read our CSS).
      trophyBgUrl = images.trophyBg || images.bgWinner || images.bg || "";
      // A CSS background-image isn't actually fetched until its class lands
      // on a DOM node — each step only renders when the player reaches it,
      // so without this the request for e.g. bgFv doesn't start until the
      // moment "Next" is clicked, and fast clicking through steps outruns
      // the download. Warm the browser's cache for all of them right away,
      // while the player is still on Welcome/Add Names.
      [images.bg, images.bgExp, images.bgWe, images.bgFv, images.bgBp, images.bgWeCustom, images.bgFvCustom, images.bgBpCustom, images.bgExpCustom, images.bgWinner, images.trophyBg].forEach(function (url) {
        if (url) new Image().src = url;
      });
      if (typeof c.cardMinHeight === "number") modalEl.style.setProperty("--dmls-card-min-height", c.cardMinHeight + "px");
      // Set on #dmls-root AND on #dmls-modal itself, not just #dmls-root —
      // in modal display mode (below) #dmls-modal is moved to be a direct
      // child of <body>, outside #dmls-root's subtree entirely, so it can no
      // longer inherit a custom property set only on #dmls-root. Setting it
      // in both places keeps the admin's configured size correct regardless
      // of which mode is active. #dmls-root's copy still also caps every
      // #dmls-root .dmls-card (welcome included) via max-height in
      // dmls-score.css.
      if (typeof c.modalWidth === "number") {
        root.style.setProperty("--dmls-modal-width", c.modalWidth + "px");
        modalEl.style.setProperty("--dmls-modal-width", c.modalWidth + "px");
      }
      if (typeof c.modalHeight === "number") {
        var modalHeightUnit = c.modalHeightUnit === "px" ? "px" : "vh";
        root.style.setProperty("--dmls-modal-height", c.modalHeight + modalHeightUnit);
        modalEl.style.setProperty("--dmls-modal-height", c.modalHeight + modalHeightUnit);
      }
      lockScrollEnabled = Boolean(c.lockPageScroll);
      layoutModeIsModal = c.layoutMode === "modal";
      if (layoutModeIsModal) moveModalToBody();
      // Config can resolve after the tool was already opened (e.g. deep-linked
      // straight onto a hash on first paint) — apply immediately if so.
      if (modalOpen && lockScrollEnabled && !layoutModeIsModal) lockPageScroll();
      if (modalOpen && layoutModeIsModal) {
        document.documentElement.classList.add("dmls-modal-lock");
        document.body.classList.add("dmls-modal-lock");
      }
      if (typeof c.winnerImageSize === "number") modalEl.style.setProperty("--dmls-win-art-size", c.winnerImageSize + "px");
      // Everything else is baked into already-rendered HTML strings — merge
      // into ICONS so any future render() picks up the override, and only
      // force an immediate re-render if we're still on the one screen
      // (welcome) that already painted with the old default.
      var needsRerender = false;
      for (var key in images) {
        if (key !== "bg" && key !== "bgExp" && key !== "bgWe" && key !== "bgFv" && key !== "bgBp" && key !== "bgWeCustom" && key !== "bgFvCustom" && key !== "bgBpCustom" && key !== "bgExpCustom" && key !== "bgWinner" && key !== "trophyBg" && images[key] && ICONS[key] !== images[key]) {
          ICONS[key] = images[key];
          needsRerender = true;
        }
      }
      if (typeof c.tipText === "string" && c.tipText !== homeTip) {
        homeTip = c.tipText;
        needsRerender = true;
      }
      // Not gated behind needsRerender/screen 0 like the rest of this block —
      // it only affects the winner screen, which is reached directly from
      // finishGame() rather than through render()'s dispatcher, so there's
      // nothing here to usefully re-render anyway. By the time a game
      // finishes, /config has long since resolved at boot.
      if (typeof c.discordUrl === "string") discordUrl = c.discordUrl;
      if (typeof c.winnerFooterUrl === "string") winnerFooterUrl = c.winnerFooterUrl;
      if (typeof c.trophyHeading === "string" && c.trophyHeading) trophyHeading = c.trophyHeading;
      if (typeof c.trophySubheading === "string" && c.trophySubheading) trophySubheading = c.trophySubheading;
      if (typeof c.trophyTagline === "string") trophyTagline = c.trophyTagline;
      if (Array.isArray(c.trophyTopImages)) {
        trophyTopImages = c.trophyTopImages.filter(function (u) { return typeof u === "string" && u; });
      }
      if (c.steps && typeof c.steps === "object") {
        for (var stepKey in stepContent) {
          var sc = c.steps[stepKey];
          if (!sc) continue;
          if (typeof sc.preHeading === "string") stepContent[stepKey].preHeading = sc.preHeading;
          if (typeof sc.heading === "string" && sc.heading) stepContent[stepKey].heading = sc.heading;
          if (typeof sc.sub === "string" && sc.sub) stepContent[stepKey].sub = sc.sub;
        }
      }
      if (typeof c.trophyActionsBg === "string" && c.trophyActionsBg) {
        modalEl.style.setProperty("--dmls-trophy-actions-bg", c.trophyActionsBg);
      }
      if (typeof c.logoWidth === "number" && c.logoWidth !== logoWidth) {
        logoWidth = c.logoWidth;
        needsRerender = true;
      }
      if (typeof c.charactersWidth === "number" && c.charactersWidth !== charactersWidth) {
        charactersWidth = c.charactersWidth;
        needsRerender = true;
      }
      if (typeof c.headingWidth === "number" && c.headingWidth !== headingWidth) {
        headingWidth = c.headingWidth;
        needsRerender = true;
      }
      if (typeof c.headingFontSize === "number" && c.headingFontSize !== headingFontSize) {
        headingFontSize = c.headingFontSize;
        needsRerender = true;
      }
      // Welcome screen (bee/fish images) reads serverConfig.images directly at
      // render time rather than merging into ICONS, since these are two
      // independently-styled elements, not a single <img src> — so the ICONS
      // diff loop above can't detect a bee/fish change. Force one re-render
      // pass on config load if either slot is configured at all.
      if (images.beeNormal || images.fishNormal) needsRerender = true;
      if (typeof c.homeHeading === "string" && c.homeHeading && c.homeHeading !== heading) {
        heading = c.homeHeading;
        needsRerender = true;
      }
      if (typeof c.homeSubheading === "string" && c.homeSubheading !== homeSub) {
        homeSub = c.homeSubheading;
        needsRerender = true;
      }
      // Also covers screen 6 (winner) — logoHTML() reads ICONS.logo, which (unlike
      // ICONS.winner, baked into the page at boot) only arrives via this /config
      // response; a fast click-through can reach the winner screen before it lands,
      // and unlike the step screens below, renderWinner() has no pending-state gate
      // to fall back on, so without this it would paint once with no logo and stay
      // that way even after config shows up.
      if (needsRerender) renderPageWelcome(); // welcome lives on the page, independent of the modal's view/screen
      if (needsRerender && view === "game" && state.screen === 6) render();
      // If a step screen is mid-render waiting on this (see render() below),
      // finish the job now that stepContent is actually populated.
      if (state.screen >= 2 && state.screen <= 5) render();
    })
    .catch(function () {
      if (retryOnFail) return loadConfig(false);
      // Both attempts failed — everything else on the tool works fine
      // without config, but a step screen has nothing to show, so flag it
      // so render() can offer a retry instead of leaving "Loading…" forever.
      configFailed = true;
      if (state.screen >= 2 && state.screen <= 5) render();
    });
  }
  loadConfig(true);
})();
