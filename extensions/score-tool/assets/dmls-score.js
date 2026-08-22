/* Doomlings Score Tool — storefront app block script.
   State machine ported from the concept demo; talks to the app proxy at /apps/score.

   Structural note (Phase 5 rebuild): the whole tool now lives inside a single
   #dmls-modal overlay appended to document.body (same pattern as the
   pre-existing #dmls-toast/#dmls-confetti nodes), not inline in the page.
   #dmls-root on the page is now just a launcher trigger. */
(function () {
  "use strict";

  var cfg = window.DMLS_CONFIG || {};
  var root = document.getElementById("dmls-root");
  if (!root) return;

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
  var loginUrl = root.getAttribute("data-login-url") || "/account/login";
  var accountUrl = root.getAttribute("data-account-url") || "/account";
  var homeTip = ""; // populated from /config; empty = tip bar hidden
  var discordUrl = ""; // populated from /config; empty = winner-screen Discord banner hidden
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

  // Mirrors GENCON_DATES in lib/score/achievements.ts — kept in sync there;
  // this copy only gates *whether we bother asking for a location permission
  // prompt at all*, so a stale/missing year here just means we skip asking
  // (the server is the actual source of truth for whether the achievement
  // unlocks). Update alongside the server-side table.
  var GENCON_DATES = {
    2026: ["2026-07-30", "2026-08-02"],
    2027: ["2027-08-05", "2027-08-08"],
    2028: ["2028-08-03", "2028-08-06"],
    2029: ["2029-08-02", "2029-08-05"],
    2030: ["2030-08-01", "2030-08-04"],
  };
  function inGenconWindow(dateStr) {
    var w = GENCON_DATES[dateStr.slice(0, 4)];
    return !!w && dateStr >= w[0] && dateStr <= w[1];
  }
  // Only ever prompts for location during the ~4 days/year Gen Con actually
  // runs — outside that window this resolves to null with no permission
  // prompt at all. Capped at 2.5s so a stalled/ignored permission dialog
  // can't hold up saving the game; declining or timing out just means the
  // Gen Con achievement doesn't unlock this time, no error shown.
  function getGenconLocation() {
    if (!navigator.geolocation || !inGenconWindow(localDateStr())) return Promise.resolve(null);
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () { if (!settled) { settled = true; resolve(null); } }, 2500);
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          if (settled) return;
          settled = true; clearTimeout(timer);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        function () { if (settled) return; settled = true; clearTimeout(timer); resolve(null); },
        { timeout: 2500, maximumAge: 300000 }
      );
    });
  }

  var state = {
    screen: 0,
    players: [], // {name, we, fv, bp, mp, isCustomer}
    customerOptedOut: false, // true once the customer removes their own chip — see renderPlayers()
  };
  var serverConfig = null; // {loggedIn, images, ...} from /config
  var lastResult = null;   // response from POST /game
  var guessResult = null;  // {correct, winnerNames, topScore} from POST /guess
  var saveFailed = false;  // true once /game has definitively failed (not just still in flight)

  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { /* ignore */ }
  var hasResume = !!(saved && saved.players && saved.players.length >= 2 && saved.screen > 0 && saved.screen < 6);

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        screen: state.screen,
        players: state.players,
        customerOptedOut: state.customerOptedOut,
        lastResult: lastResult,
        guessResult: guessResult,
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
  function apiPost(path, body) {
    return fetch(PROXY + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  /* ---------------------------------------------------------------------
     #dmls-modal shell — created once at boot, same body-level append
     pattern as #dmls-toast/#dmls-confetti so it escapes #dmls-root's
     stacking context entirely. */
  var modalEl = document.createElement("div");
  modalEl.id = "dmls-modal";
  modalEl.setAttribute("aria-hidden", "true");
  modalEl.innerHTML =
    '<div class="dmls-modal-backdrop" id="dmls-modal-backdrop"></div>' +
    '<div class="dmls-modal-card" id="dmls-modal-card" role="dialog" aria-modal="true" aria-label="Doomlings Score Tool">' +
    '<button type="button" class="dmls-modal-close" id="dmls-modal-close" aria-label="Close">&times;</button>' +
    '<div class="dmls-modal-body" id="dmls-modal-body">' +
    '<div id="dmls-app" aria-live="polite"></div>' +
    '<div id="dmls-achv" hidden></div>' +
    "</div></div>";
  document.body.appendChild(modalEl);
  var app = document.getElementById("dmls-app");
  var achvEl = document.getElementById("dmls-achv");
  var modalCardEl = document.getElementById("dmls-modal-card");
  var productsEl = document.getElementById("dmls-products");

  var view = "game"; // "game" | "achv"
  var modalOpen = false;
  var modalDeepLinked = false; // true only for a fresh page load that landed directly on a hash, no prior in-app navigation

  function showModal() {
    if (modalOpen) return;
    modalOpen = true;
    modalEl.classList.add("dmls-modal-open");
    modalEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("dmls-modal-lock");
    var closeBtn = document.getElementById("dmls-modal-close");
    if (closeBtn) closeBtn.focus();
  }
  function hideModal() {
    modalOpen = false;
    modalEl.classList.remove("dmls-modal-open");
    modalEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("dmls-modal-lock");
    var launchBtn = document.getElementById("dmls-launch");
    if (launchBtn) launchBtn.focus();
  }
  // X button / Escape: if this modal instance was opened by landing directly
  // on a URL hash (no prior in-app click), there's no sensible "resume where
  // you were" state to fall back to visually, so reset to the welcome screen
  // and clear the hash. Otherwise just hide — state.players/localStorage are
  // untouched, so the resume banner still offers to pick this game back up.
  function closeModal() {
    if (modalDeepLinked) {
      state.screen = 0;
      view = "game";
    }
    modalDeepLinked = false;
    hideModal();
    try { history.replaceState({}, "", location.pathname + location.search); } catch (e) { /* ignore */ }
  }
  document.getElementById("dmls-modal-close").addEventListener("click", closeModal);
  document.getElementById("dmls-modal-backdrop").addEventListener("click", closeModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modalOpen) closeModal();
  });

  function openGameModal() {
    view = "game";
    achvEl.hidden = true;
    app.hidden = false;
    modalDeepLinked = false;
    showModal();
    render();
    syncHash(true);
  }

  /* steps meta */
  var STEPS = [
    null, null,
    {
      key: "we", min: -99,
      title: "RESOLVE WORLD'S END EFFECTS",
      sub: "First, play World's End ➹ effects on traits in turn order. <i>Then</i> follow ONLY the gold text on the 3rd catastrophe, and enter any +/- points below.",
    },
    {
      key: "fv", min: 0,
      title: "TALLY FACE VALUE TOTALS",
      sub: "Add up the face value points for each player. Ignore bonus points with ⊕ &amp; 💧 symbols for now.",
    },
    {
      key: "bp", min: 0,
      title: "ENTER ALL BONUS POINTS",
      sub: "Tally up all bonus points. Look for the Drop of Life 💧 symbol on the bottom right of each card.",
    },
    {
      key: "mp", min: 0, exp: true,
      title: "(OPTIONAL) EXPANSION POINTS",
      sub: "Add all extra points for Suppressed Traits, Trinkets, Meaning of Life, and Class Bonuses.",
    },
  ];

  function dots(n) {
    var h = '<div class="dmls-dots" aria-hidden="true">';
    for (var i = 0; i < 5; i++) h += "<i" + (i <= n ? ' class="dmls-on"' : "") + "></i>";
    return h + "</div>";
  }

  // Placeholder flanking-character slots for the 4 scoring steps — no real
  // art/admin upload slot yet (future work); scaffolding only. Real images
  // can be wired in later by setting background-image on the element whose
  // data-char-slot matches "<stepKey>-left" / "<stepKey>-right".
  function stepChars(key) {
    return '<div class="dmls-step-chars">' +
      '<div class="dmls-step-char dmls-step-char-left" data-char-slot="' + key + '-left"></div>' +
      '<div class="dmls-step-char dmls-step-char-right" data-char-slot="' + key + '-right"></div>' +
      "</div>";
  }

  function render() {
    var run = function () {
      if (productsEl && state.screen !== 6) productsEl.hidden = true;
      if (state.screen === 0) renderWelcome();
      else if (state.screen === 1) renderPlayers();
      else if (state.screen >= 2 && state.screen <= 5) renderStep(state.screen);
      else renderWinner();
    };
    // Screen-to-screen navigation only (in-place updates like adding a player
    // or nudging a score call renderX() directly and skip this) — gives a
    // soft crossfade between steps instead of an abrupt swap, when supported.
    if (!reduceMotion && document.startViewTransition) document.startViewTransition(run);
    else run();
  }

  /* --- welcome --- */
  function charStyle(normalUrl, hoverUrl) {
    var s = "";
    if (normalUrl) s += "--dmls-char-normal:url('" + normalUrl.replace(/'/g, "%27") + "');";
    if (hoverUrl) s += "--dmls-char-hover:url('" + hoverUrl.replace(/'/g, "%27") + "');";
    return s ? ' style="' + s + '"' : "";
  }
  function renderWelcome() {
    var images = (serverConfig && serverConfig.images) || {};
    var hasBee = !!images.beeNormal;
    var hasFish = !!images.fishNormal;
    app.innerHTML =
      '<div class="dmls-card dmls-anim-in">' +
      '<div class="dmls-card-body">' +
      logoHTML("dmls-logo") +
      (ICONS.characters ? '<img class="dmls-welcome-characters" src="' + ICONS.characters + '" alt="" loading="lazy">' : "") +
      ((hasBee || hasFish)
        ? '<div class="dmls-welcome-chars" aria-hidden="true">' +
          (hasBee ? '<div class="dmls-char dmls-char-bee" id="dmls-char-bee"' + charStyle(images.beeNormal, images.beeHover) + '></div>' : "") +
          (hasFish ? '<div class="dmls-char dmls-char-fish" id="dmls-char-fish"' + charStyle(images.fishNormal, images.fishHover) + '></div>' : "") +
          "</div>"
        : "") +
      '<h2 class="dmls-title" style="max-width:' + headingWidth + 'px;font-size:' + headingFontSize + 'px">' + esc(heading) + "</h2>" +
      '<p class="dmls-sub">Tally World’s End, face value, and bonus points — we’ll crown the winner.</p>' +
      (hasResume ? '<div class="dmls-resume">You have a game in progress. <button type="button" id="dmls-resume">Resume it</button></div>' : "") +
      (CUSTOMER ? '<div class="dmls-welcome-links"><button type="button" class="dmls-btn-link" id="dmls-achv-link">Achievements</button></div>' : "") +
      "</div>" +
      '<div class="dmls-nav"><span class="dmls-spacer"></span><button type="button" class="dmls-btn dmls-btn-go" id="dmls-start">Start scoring</button><span class="dmls-spacer"></span></div>' +
      "</div>" +
      (homeTip ? '<div class="dmls-tip"><span class="dmls-tip-icon" aria-hidden="true">i</span><p>' + esc(homeTip) + "</p></div>" : "");
    document.getElementById("dmls-start").addEventListener("click", function () {
      state.players = [];
      state.customerOptedOut = false;
      lastResult = null;
      guessResult = null;
      state.screen = 1;
      hasResume = false;
      save();
      render();
    });
    var r = document.getElementById("dmls-resume");
    if (r) r.addEventListener("click", function () {
      state.screen = saved.screen;
      state.players = saved.players || [];
      state.customerOptedOut = !!saved.customerOptedOut;
      hasResume = false;
      save();
      render();
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
  function renderPlayers(quiet) {
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
      '<div class="dmls-card' + (quiet ? "" : " dmls-anim-in") + '">' +
      '<div class="dmls-card-body dmls-split">' +
      '<div class="dmls-card-head">' +
      dots(0) +
      '<h2 class="dmls-title">Add Names</h2>' +
      (CUSTOMER
        ? '<p class="dmls-sub">Playing as <strong style="color:var(--dmls-green)">' + esc(cap(CUSTOMER.firstName) || "you") + "</strong> — this game will save to your account.</p>"
        : '<p class="dmls-sub"><a class="dmls-inline-link" href="' + esc(loginUrl) + '">Sign in</a> to keep your game history and earn achievements.</p>') +
      '<div class="dmls-addrow"><input id="dmls-name" maxlength="30" placeholder="Enter name here…" autocomplete="off"><button type="button" id="dmls-add" class="dmls-addrow-plus" aria-label="Add player">+</button></div>' +
      "</div>" +
      '<div class="dmls-scroll-mid"><ul class="dmls-chips" id="dmls-chips">' + chips + "</ul></div>" +
      '<p class="dmls-hint">' + (enough ? "" : "Add at least 2 players") + "</p>" +
      "</div>" +
      '<div class="dmls-nav">' +
      '<button type="button" class="dmls-btn dmls-btn-ghost" id="dmls-back">Back</button>' +
      '<button type="button" class="dmls-btn dmls-btn-go" id="dmls-next"' + (enough ? "" : " disabled") + ">Next</button>" +
      "</div></div>";

    var input = document.getElementById("dmls-name");
    function add() {
      var v = input.value.trim();
      if (!v) { toast("Type a name first"); return; }
      if (state.players.length >= 12) { toast("Max players reached for one game"); return; }
      state.players.push({ name: v.slice(0, 30), we: 0, fv: 0, bp: 0, mp: 0, isCustomer: false });
      justAddedIndex = state.players.length - 1;
      save();
      renderPlayers(true);
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
      renderPlayers(true);
    });
    document.getElementById("dmls-back").addEventListener("click", function () { state.screen = 0; save(); render(); });
    document.getElementById("dmls-next").addEventListener("click", function () {
      if (state.players.length < 2) { toast("Add at least 2 players"); return; }
      state.screen = 2;
      save();
      render();
    });
  }

  /* --- score steps --- */
  function renderStep(n) {
    var st = STEPS[n];
    var stepNo = n - 1;
    var rows = state.players.map(function (p, i) {
      var v = p[st.key] | 0;
      return "<li>" +
        '<span class="dmls-nm">' + esc(p.name) + "</span>" +
        '<span class="dmls-step">' +
        '<button type="button" data-d="-1" data-i="' + i + '" aria-label="Decrease ' + esc(p.name) + '">−</button>' +
        '<input data-i="' + i + '" inputmode="numeric" value="' + v + '" class="' + (v < 0 ? "dmls-neg" : "") + '" aria-label="' + esc(p.name) + ' points">' +
        '<button type="button" data-d="1" data-i="' + i + '" aria-label="Increase ' + esc(p.name) + '">+</button>' +
        "</span></li>";
    }).join("");

    app.innerHTML =
      '<div class="dmls-card dmls-anim-in' + (st.exp ? " dmls-card-exp" : "") + '">' +
      '<div class="dmls-card-body dmls-split">' +
      '<div class="dmls-card-head">' +
      stepChars(st.key) +
      dots(stepNo) +
      '<h2 class="dmls-title">' + st.title + "</h2>" +
      '<p class="dmls-sub">' + st.sub + "</p>" +
      "</div>" +
      '<div class="dmls-scroll-mid"><ul class="dmls-scores" id="dmls-rows">' + rows + "</ul></div>" +
      "</div>" +
      '<div class="dmls-nav">' +
      '<button type="button" class="dmls-btn dmls-btn-ghost" id="dmls-back">Back</button>' +
      (n === 5 ? '<button type="button" class="dmls-btn-link" id="dmls-skip">Skip</button>' : '<span class="dmls-spacer"></span>') +
      '<button type="button" class="dmls-btn dmls-btn-go" id="dmls-next">' + (n === 5 ? "Reveal winner" : "Next") + "</button>" +
      "</div></div>";

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
    // n === 5 (Meaning of Life / expansion) keeps its two extra footer
    // actions exactly as before — only the header copy changed this pass.
    document.getElementById("dmls-back").addEventListener("click", function () { state.screen = n - 1; save(); render(); });
    document.getElementById("dmls-next").addEventListener("click", function () {
      if (n === 5) { finishGame(); return; }
      state.screen = n + 1;
      save();
      render();
    });
    var sk = document.getElementById("dmls-skip");
    if (sk) sk.addEventListener("click", function () {
      state.players.forEach(function (p) { p.mp = 0; });
      finishGame();
    });
  }

  function finishGame() {
    state.screen = 6;
    save();

    // Brief suspense beat while the game saves; if the server offers the
    // "Guess Who Won?" mini-game we detour there before the reveal. Offline or
    // slow (>3s) falls back to the local reveal exactly as before.
    var revealed = false;
    app.innerHTML =
      '<div class="dmls-card dmls-anim-in dmls-counting">' +
      '<h2 class="dmls-title">Adding up the doom…</h2>' +
      '<div class="dmls-count-dots" aria-hidden="true"><i></i><i></i><i></i></div>' +
      "</div>";

    var fallback = setTimeout(function () {
      revealed = true;
      renderWinner();
    }, 3000);

    getGenconLocation().then(function (loc) {
      return apiPost("/game", {
        players: state.players,
        deviceType: DEVICE_TYPE,
        playedAtLocalDate: localDateStr(),
        lat: loc ? loc.lat : undefined,
        lng: loc ? loc.lng : undefined,
      });
    })
      .then(function (res) {
        if (!res || !res.saved) {
          saveFailed = true;
          if (revealed) { renderWinner(); return; } // late failure: correct the message on screen
          clearTimeout(fallback); revealed = true; renderWinner();
          return;
        }
        lastResult = res;
        if (revealed) { renderWinner(); return; } // arrived after fallback: refresh stats only
        clearTimeout(fallback);
        revealed = true;
        if (res.guessOffered && CUSTOMER) renderGuess(res);
        else renderWinner();
      })
      .catch(function () {
        saveFailed = true;
        if (revealed) { renderWinner(); return; } // late failure: correct the message on screen
        clearTimeout(fallback); revealed = true; renderWinner();
      });
  }

  /* --- Guess Who Won? mini-game --- */
  function renderGuess(res) {
    var names = state.players.map(function (p) { return p.name; });
    for (var i = names.length - 1; i > 0; i--) { // shuffle so order leaks nothing
      var j = Math.floor(Math.random() * (i + 1));
      var t = names[i]; names[i] = names[j]; names[j] = t;
    }
    var buttons = names.map(function (n) {
      return '<button type="button" class="dmls-btn dmls-guess-opt" data-guess="' + esc(n) + '">' + esc(n) + "</button>";
    }).join("");

    app.innerHTML =
      '<div class="dmls-card dmls-anim-in dmls-guess">' +
      '<div class="dmls-card-body">' +
      '<p class="dmls-eyebrow">Mini-game · too close to call!</p>' +
      '<h2 class="dmls-title">GUESS WHO WON?</h2>' +
      '<p class="dmls-sub">Think you know? Take a shot before the reveal.</p>' +
      '<div class="dmls-guess-grid" id="dmls-guess-grid">' + buttons + "</div>" +
      "</div>" +
      '<div class="dmls-nav"><span class="dmls-spacer"></span><button type="button" class="dmls-btn-link" id="dmls-guess-skip">Skip — just show the winner</button><span class="dmls-spacer"></span></div>' +
      "</div>";

    var picked = false;
    var grid = document.getElementById("dmls-guess-grid");
    grid.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-guess]");
      if (!b || picked) return;
      picked = true;
      Array.prototype.forEach.call(grid.querySelectorAll("button[data-guess]"), function (x) { x.disabled = true; });
      b.classList.add("dmls-guess-picked");
      apiPost("/guess", { gameId: res.gameId, guess: b.getAttribute("data-guess") })
        .then(function (g) {
          if (g && typeof g.correct === "boolean") {
            guessResult = g;
            if (g.correct) confettiBurst();
          }
          renderWinner();
        })
        .catch(function () { renderWinner(); });
    });
    document.getElementById("dmls-guess-skip").addEventListener("click", function () {
      if (!picked) { picked = true; renderWinner(); }
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

  function achvChrome(bodyHTML) {
    achvEl.innerHTML =
      '<div class="dmls-card dmls-anim-in">' +
      '<div class="dmls-card-body">' + bodyHTML + "</div>" +
      "</div>";
  }
  // Same fixed-header/fixed-footer/scrolling-middle pattern as the Add Names
  // and scoring-step screens — the "Play Doomlings" CTA is bottom-pinned via
  // .dmls-nav (a flex:none sibling of .dmls-card-body, outside its scroll
  // region) so it stays visible regardless of how long the achievement grid
  // or history list gets.
  function achvChromeSplit(headHTML, midHTML) {
    achvEl.innerHTML =
      '<div class="dmls-card dmls-anim-in">' +
      '<div class="dmls-card-body dmls-split">' +
      '<div class="dmls-card-head">' + headHTML + "</div>" +
      '<div class="dmls-scroll-mid">' + midHTML + "</div>" +
      "</div>" +
      '<div class="dmls-nav"><span class="dmls-spacer"></span><button type="button" class="dmls-btn dmls-btn-go" id="dmls-achv-play">Play Doomlings</button><span class="dmls-spacer"></span></div>' +
      "</div>";
  }

  function renderAchvLoading() {
    achvChrome(
      '<p class="dmls-eyebrow">Your Doomlings career</p>' +
      '<h2 class="dmls-title">Achievements</h2>' +
      '<p class="dmls-sub">Loading…</p>'
    );
  }
  function renderAchvError() {
    achvChrome(
      '<p class="dmls-eyebrow">Your Doomlings career</p>' +
      '<h2 class="dmls-title">Achievements</h2>' +
      '<p class="dmls-sub">Couldn’t load your achievements right now — check your connection and try again.</p>' +
      '<button type="button" class="dmls-btn dmls-btn-ghost" id="dmls-achv-retry">Retry</button>'
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
      return '<div class="dmls-achv-tile dmls-achv-locked">' +
        '<div class="dmls-achv-icon dmls-achv-icon-locked" aria-hidden="true"></div>' +
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
    var when = isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    var expanded = !!achvExpanded[idx];
    var detail = (g.players || []).map(function (p) {
      return '<div class="dmls-hist-detail-row"><span>' + esc(p.name) + '</span><b>' + (p.total | 0) + ' pts</b></div>';
    }).join("");
    // No win badge/border here per client request — the old .dmls-won /
    // .dmls-hist-badge markup is intentionally not carried over.
    return '<li class="dmls-hist-row">' +
      '<p class="dmls-hist-title">' + esc((g.winnerNames || []).join(" & ")) + " Won with " + g.topScore + " pts.</p>" +
      '<div class="dmls-hist-meta">' +
      '<span class="dmls-hist-date">' + when + "</span>" +
      "<span>" + g.playerCount + " Players</span>" +
      '<button type="button" class="dmls-hist-more" data-more="' + idx + '">' + (expanded ? "View Less" : "View More") + "</button>" +
      "</div>" +
      '<div class="dmls-hist-detail" id="dmls-hist-detail-' + idx + '"' + (expanded ? "" : " hidden") + ">" + detail + "</div>" +
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
      '<p class="dmls-eyebrow">Your Doomlings career</p>' +
      '<h2 class="dmls-title">Achievements</h2>' +
      '<div class="dmls-achv-tabs" role="tablist">' +
      '<button type="button" class="dmls-achv-tab" data-tab="achv" role="tab">ACHV.</button>' +
      '<button type="button" class="dmls-achv-tab" data-tab="history" role="tab">HISTORY</button>' +
      "</div>",
      '<div id="dmls-achv-panel-achv">' + achvGrid + "</div>" +
      '<div id="dmls-achv-panel-history" hidden>' + histList + "</div>"
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
      guessResult = null;
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
    var winners = ranked.filter(function (p) { return total(p) === top; });
    var winNames = winners.map(function (p) { return esc(p.name); }).join(' <span class="dmls-amp">&amp;</span> ');
    var meWon = winners.some(function (p) { return p.isCustomer; });
    // The hero name display is sized for the common case (1, occasionally 2
    // tied players) — a big multi-way tie would otherwise wrap into an
    // unreadable wall of giant text, so it steps down instead.
    var winNameSizeClass = winners.length > 4 ? " dmls-win-name-xs" : winners.length > 1 ? " dmls-win-name-sm" : "";

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
        var guessLine = guessResult
          ? '<p class="dmls-win-guess-note">' +
            (guessResult.correct ? "You guessed the winner right!" : "Nice try — wrong guess this time.") +
            "</p>"
          : "";
        if (unlocked.length) {
          var achvItems = unlocked.map(function (a) {
            return '<div class="dmls-win-achv-item">' +
              '<div class="dmls-achv-icon"' +
              (a.iconUrl ? ' style="background-image:url(\'' + a.iconUrl.replace(/'/g, "%27") + '\')"' : "") +
              '></div><p class="dmls-achv-name">' + esc(a.name) + "</p></div>";
          }).join("");
          loyaltyHTML =
            '<div class="dmls-widget dmls-widget-center">' +
            '<h3 class="dmls-widget-title">' + (unlocked.length > 1 ? "New Achievements!" : "New Achievement!") + "</h3>" +
            achvItems + guessLine +
            '<button type="button" class="dmls-btn dmls-btn-ghost" data-achv-link>Achievements</button></div>';
        } else {
          loyaltyHTML =
            '<div class="dmls-widget dmls-widget-center">' +
            '<p class="dmls-win-stat-num">' + (lastResult.gamesPlayed != null ? lastResult.gamesPlayed : "—") + "</p>" +
            '<h3 class="dmls-widget-title">Games Played</h3>' +
            guessLine +
            '<button type="button" class="dmls-btn dmls-btn-ghost" data-achv-link>Achievements</button></div>';
        }
      } else if (saveFailed) {
        loyaltyHTML =
          '<div class="dmls-widget"><h3 class="dmls-widget-title">Your Game</h3>' +
          "<p>We couldn’t save this game to your account — check your connection. This game won’t count toward your achievements.</p></div>";
      } else {
        loyaltyHTML =
          '<div class="dmls-widget"><h3 class="dmls-widget-title">Your Game</h3>' +
          "<p>Saving your game…</p></div>";
      }
    } else {
      // Single "My Account" CTA per the mock — routes.account_url already
      // sends an unauthenticated visitor to login (which itself links to
      // registration), so one button covers both "never signed up" and
      // "has an account, just isn't signed in right now" without us having
      // to tell those two apart (we can't — both look like "no session").
      loyaltyHTML =
        '<div class="dmls-widget dmls-widget-center"><h3 class="dmls-widget-title">Save this victory</h3>' +
        "<p>Create or Sign In to your free Doomlings account to track your game history and earn achievements.</p>" +
        '<a class="dmls-btn dmls-btn-ghost" href="' + esc(accountUrl) + '">My Account</a>' +
        "</div>";
    }

    app.innerHTML =
      '<div class="dmls-card dmls-anim-in dmls-winner">' +
      '<div class="dmls-card-body">' +
      '<div class="dmls-win-main">' +
      logoHTML("dmls-win-logo") +
      '<p class="dmls-win-eyebrow">The winner is&hellip;</p>' +
      '<h1 class="dmls-win-name' + winNameSizeClass + '">' + winNames + "</h1>" +
      '<p class="dmls-win-points">' + top + " points</p>" +
      (meWon ? '<p class="dmls-sub">Hi ' + esc(cap(CUSTOMER.firstName) || "there") + ", that’s you!</p>" : "") +
      (ICONS.winner ? '<img class="dmls-win-art" src="' + ICONS.winner + '" alt="" loading="lazy">' : "") +
      '<ul class="dmls-win-scores">' +
      ranked.map(function (p) {
        return '<li class="dmls-win-score-row' + (total(p) === top ? " dmls-win-score-row-top" : "") + '">' +
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

    app.addEventListener("click", winnerClicks);

    document.querySelector("[data-rematch]").addEventListener("click", function () {
      state.players.forEach(function (p) { p.we = 0; p.fv = 0; p.bp = 0; p.mp = 0; });
      lastResult = null;
      guessResult = null;
      state.screen = 2;
      save();
      render();
    });
    document.querySelector("[data-new-players]").addEventListener("click", function () {
      state.players = [];
      state.customerOptedOut = false;
      lastResult = null;
      guessResult = null;
      state.screen = 1;
      save();
      render();
    });
    // Trophy image/download isn't built yet — this just tells the player so,
    // rather than leaving the button looking broken.
    document.querySelector("[data-trophy]").addEventListener("click", function () {
      toast("Trophy generator coming soon!");
    });

    confettiBurst();
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

  /* --- launcher --- */
  var launchBtn = document.getElementById("dmls-launch");
  if (launchBtn) launchBtn.addEventListener("click", openGameModal);

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
      guessResult = saved.guessResult || null;
      saveFailed = !!saved.saveFailed;
      hasResume = false;
      modalDeepLinked = true;
    }
  }

  syncHash(false); // normalize the URL to match the restored/default state, no extra history entry

  if (modalDeepLinked) {
    if (bootHash === "achievements") openAchievementsModal(true);
    else { showModal(); render(); }
  }

  apiGet("/config")
    .then(function (c) {
      if (!c || c.error) return;
      serverConfig = c;
      var images = c.images || {};
      // Backgrounds are pure CSS (custom properties) — safe to apply any time,
      // no re-render needed, the browser repaints whatever's on screen.
      if (images.bg) modalEl.style.setProperty("--dmls-bg-url", 'url("' + images.bg + '")');
      if (images.bgExp) modalEl.style.setProperty("--dmls-bg-exp-url", 'url("' + images.bgExp + '")');
      if (images.bgWinner) modalEl.style.setProperty("--dmls-bg-winner-url", 'url("' + images.bgWinner + '")');
      if (images.bg) root.style.setProperty("--dmls-bg-url", 'url("' + images.bg + '")'); // launcher card reuses the same bg
      if (typeof c.cardMinHeight === "number") modalEl.style.setProperty("--dmls-card-min-height", c.cardMinHeight + "px");
      if (typeof c.winnerImageSize === "number") modalEl.style.setProperty("--dmls-win-art-size", c.winnerImageSize + "px");
      // Everything else is baked into already-rendered HTML strings — merge
      // into ICONS so any future render() picks up the override, and only
      // force an immediate re-render if we're still on the one screen
      // (welcome) that already painted with the old default.
      var needsRerender = false;
      for (var key in images) {
        if (key !== "bg" && key !== "bgExp" && key !== "bgWinner" && images[key] && ICONS[key] !== images[key]) {
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
      // finishGame()/renderGuess() rather than through render()'s dispatcher,
      // so there's nothing here to usefully re-render anyway. By the time a
      // game finishes, /config has long since resolved at boot.
      if (typeof c.discordUrl === "string") discordUrl = c.discordUrl;
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
      if (needsRerender && view === "game" && state.screen === 0) render();
    })
    .catch(function () { /* tool works without config */ });
})();
