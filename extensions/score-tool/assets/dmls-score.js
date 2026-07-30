/* Doomlings Score Tool — storefront app block script.
   State machine ported from the concept demo; talks to the app proxy at /apps/score. */
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
  var SCREEN_HASH = ["", "players", "we", "fv", "bp", "mp", "winner", "stats"];
  function hashFor(screen) { return SCREEN_HASH[screen] || ""; }
  function screenForHash(h) {
    var i = SCREEN_HASH.indexOf(h);
    return i > 0 ? i : null; // "" (screen 0) is never an explicit restore target
  }

  var app = document.getElementById("dmls-app");
  var productsEl = document.getElementById("dmls-products");
  var heading = root.getAttribute("data-heading") || "Ready to see who won the game?";
  var signupUrl = root.getAttribute("data-signup-url") || "/account/register";
  var homeTip = ""; // populated from /config; empty = tip bar hidden
  var logoWidth = 220; // px; populated from /config, matches the DB default until it loads
  function logoHTML(cls) {
    // Width is merchant-set but centering is structural (margin:auto in CSS),
    // so any width the admin picks stays centered — never make this fill-width.
    return ICONS.logo ? '<img class="' + cls + '" src="' + ICONS.logo + '" alt="" style="width:' + logoWidth + 'px" loading="lazy">' : "";
  }

  var state = {
    screen: 0,
    players: [], // {name, we, fv, bp, mp, isCustomer}
  };
  var serverConfig = null; // {pointsPerGame, loggedIn}
  var lastResult = null;   // response from POST /game
  var guessResult = null;  // {correct, pointsAwarded} from POST /guess
  var saveFailed = false;  // true once /game has definitively failed (not just still in flight)

  var saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null"); } catch (e) { /* ignore */ }
  var hasResume = !!(saved && saved.players && saved.players.length >= 2 && saved.screen > 0 && saved.screen < 6);

  // A refresh (or a bookmarked/shared link) carries the screen in the URL hash.
  // When it agrees with what's actually saved, jump straight back there —
  // including the winner screen — instead of dropping to Welcome and making
  // the player click "Resume" for something that wasn't a deliberate restart.
  var hashScreen = screenForHash(location.hash.slice(1));
  if (saved && hashScreen !== null && saved.screen === hashScreen) {
    state.screen = saved.screen;
    state.players = saved.players || [];
    lastResult = saved.lastResult || null;
    guessResult = saved.guessResult || null;
    saveFailed = !!saved.saveFailed;
    hasResume = false;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        screen: state.screen,
        players: state.players,
        lastResult: lastResult,
        guessResult: guessResult,
        saveFailed: saveFailed,
      }));
    } catch (e) { /* ignore */ }
    syncHash(true);
  }
  function syncHash(push) {
    var h = hashFor(state.screen);
    if (location.hash.slice(1) === h) return;
    var url = location.pathname + location.search + (h ? "#" + h : "");
    try {
      if (push) history.pushState({ dmlsScreen: state.screen }, "", url);
      else history.replaceState({ dmlsScreen: state.screen }, "", url);
    } catch (e) { /* ignore */ }
  }
  window.addEventListener("popstate", function () {
    var s = screenForHash(location.hash.slice(1));
    state.screen = s === null ? 0 : s;
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

  /* steps meta */
  function sym(name, alt) {
    return ICONS[name] ? '<img class="dmls-sym" src="' + ICONS[name] + '" alt="' + alt + '">' : "";
  }
  var STEPS = [
    null, null,
    { key: "we", title: "Enter your World's End points. <span class=\"dmls-title-note\">(symbol, etc.)</span>", sub: "Negative score? No minus key needed — just tap <b>−</b>.", min: -99 },
    { key: "fv", title: "Enter your Face Value totals.", sub: "Ignore " + sym("compass", "compass star") + " symbols for now.", min: 0 },
    { key: "bp", title: "Enter your Bonus points.", sub: "Drops of life " + sym("drop", "drop of life") + " and suppressed traits " + sym("suppress", "suppress") + ".", min: 0 },
    { key: "mp", title: "Enter Meaning of Life, Magical Merchants, and/or Class Bonus Points!", sub: "Or skip if you played the base game.", min: 0, exp: true },
  ];

  function dots(n) {
    var h = '<div class="dmls-dots" aria-hidden="true">';
    for (var i = 0; i < 5; i++) h += "<i" + (i <= n ? ' class="dmls-on"' : "") + "></i>";
    return h + "</div>";
  }

  function render() {
    var run = function () {
      root.classList.toggle("dmls-wide", state.screen === 6 || state.screen === 7);
      if (productsEl && state.screen !== 6) productsEl.hidden = true;
      if (state.screen === 0) renderWelcome();
      else if (state.screen === 1) renderPlayers();
      else if (state.screen >= 2 && state.screen <= 5) renderStep(state.screen);
      else if (state.screen === 7) renderStats();
      else renderWinner();
      root.scrollIntoView({ block: "start", behavior: "auto" });
    };
    // Screen-to-screen navigation only (in-place updates like adding a player
    // or nudging a score call renderX() directly and skip this) — gives a
    // soft crossfade between steps instead of an abrupt swap, when supported.
    if (!reduceMotion && document.startViewTransition) document.startViewTransition(run);
    else run();
  }

  /* --- welcome --- */
  function renderWelcome() {
    app.innerHTML =
      '<div class="dmls-card dmls-anim-in">' +
      '<div class="dmls-card-body">' +
      logoHTML("dmls-logo") +
      (ICONS.characters ? '<img class="dmls-hero" src="' + ICONS.characters + '" alt="" width="360" loading="lazy">' : "") +
      '<h2 class="dmls-title">' + esc(heading) + "</h2>" +
      '<p class="dmls-sub">Tally World’s End, face value, and bonus points — we’ll crown the winner.</p>' +
      (hasResume ? '<div class="dmls-resume">You have a game in progress. <button type="button" id="dmls-resume">Resume it</button></div>' : "") +
      (CUSTOMER ? '<div class="dmls-welcome-links"><button type="button" class="dmls-btn-link" id="dmls-mystats">My Stats</button></div>' : "") +
      "</div>" +
      '<div class="dmls-nav"><span class="dmls-spacer"></span><button type="button" class="dmls-btn dmls-btn-go" id="dmls-start">Start scoring</button><span class="dmls-spacer"></span></div>' +
      "</div>" +
      (homeTip ? '<div class="dmls-tip"><span class="dmls-tip-icon" aria-hidden="true">i</span><p>' + esc(homeTip) + "</p></div>" : "");
    document.getElementById("dmls-start").addEventListener("click", function () {
      state.players = [];
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
      hasResume = false;
      save();
      render();
      toast("Game restored");
    });
    var ms = document.getElementById("dmls-mystats");
    if (ms) ms.addEventListener("click", function () {
      state.screen = 7;
      save();
      render();
    });
  }

  /* --- players --- */
  var justAddedIndex = -1; // marks the newest chip so only it plays the pop-in animation
  function renderPlayers(quiet) {
    if (CUSTOMER && !state.players.some(function (p) { return p.isCustomer; })) {
      state.players.unshift({ name: cap(CUSTOMER.firstName || "Me").slice(0, 30), we: 0, fv: 0, bp: 0, mp: 0, isCustomer: true });
    }

    var chips = state.players.map(function (p, i) {
      return '<li class="' + (p.isCustomer ? "dmls-me" : "") + (i === justAddedIndex ? " dmls-chip-pop" : "") + '">' + esc(p.name) +
        (p.isCustomer ? ' <span class="dmls-tag">You</span>' : "") +
        '<button type="button" data-rm="' + i + '" aria-label="Remove ' + esc(p.name) + '">×</button></li>';
    }).join("");
    justAddedIndex = -1; // consumed for this render pass

    var enough = state.players.length >= 2;
    var pct = Math.min(100, Math.round((state.players.length / 8) * 100));

    app.innerHTML =
      '<div class="dmls-card' + (quiet ? "" : " dmls-anim-in") + '">' +
      '<div class="dmls-card-body">' +
      dots(0) +
      '<h2 class="dmls-title">Enter everyone’s names!</h2>' +
      (CUSTOMER
        ? '<p class="dmls-sub">Playing as <strong style="color:var(--dmls-green)">' + esc(cap(CUSTOMER.firstName) || "you") + "</strong> — this game will save to your account.</p>"
        : '<p class="dmls-sub">Add 2–8 players. Sign in to keep your game history and earn points.</p>') +
      '<div class="dmls-addrow"><input id="dmls-name" maxlength="30" placeholder="Enter name here…" autocomplete="off"><button type="button" id="dmls-add">ADD</button></div>' +
      '<ul class="dmls-chips" id="dmls-chips">' + chips + "</ul>" +
      '<div class="dmls-player-progress">' +
      '<span class="dmls-player-progress-track"><span class="dmls-player-progress-fill" style="width:' + pct + '%"></span></span>' +
      '<span class="dmls-hint">' + state.players.length + " of 8 players" + (enough ? "" : " · add at least 2") + "</span>" +
      "</div>" +
      "</div>" +
      '<div class="dmls-nav">' +
      '<button type="button" class="dmls-btn dmls-btn-ghost" id="dmls-back">Back</button>' +
      '<button type="button" class="dmls-btn dmls-btn-go" id="dmls-next"' + (enough ? "" : " disabled") + ">Next</button>" +
      "</div></div>";

    var input = document.getElementById("dmls-name");
    function add() {
      var v = input.value.trim();
      if (!v) { toast("Type a name first"); return; }
      if (state.players.length >= 8) { toast("Max 8 players at a time"); return; }
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
      state.players.splice(+b.getAttribute("data-rm"), 1);
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
      '<div class="dmls-card-body">' +
      dots(stepNo) +
      '<p class="dmls-eyebrow">Step ' + stepNo + " of 4" + (n === 5 ? " · optional" : "") + "</p>" +
      '<h2 class="dmls-title">' + st.title + "</h2>" +
      '<p class="dmls-sub">' + st.sub + "</p>" +
      '<ul class="dmls-scores" id="dmls-rows">' + rows + "</ul>" +
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

    apiPost("/game", { players: state.players })
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
    var pts = (serverConfig && serverConfig.guessPoints) || 10;
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
      '<p class="dmls-sub">Get it right and score <b>+' + pts + " points</b>.</p>" +
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

  /* --- my stats --- */
  function goHome() { state.screen = 0; save(); render(); }

  function renderStats() {
    app.innerHTML =
      '<div class="dmls-card dmls-anim-in dmls-stats">' +
      '<div class="dmls-card-body">' +
      '<p class="dmls-eyebrow">Your Doomlings career</p>' +
      '<h2 class="dmls-title">My Stats</h2>' +
      '<p class="dmls-sub">Loading your history…</p>' +
      "</div>" +
      '<div class="dmls-nav"><span class="dmls-spacer"></span><button type="button" class="dmls-btn dmls-btn-ghost" id="dmls-stats-back">Back</button><span class="dmls-spacer"></span></div>' +
      "</div>";
    document.getElementById("dmls-stats-back").addEventListener("click", goHome);

    apiGet("/stats")
      .then(function (s) {
        if (state.screen !== 7) return; // navigated away before this resolved
        if (!s || s.error || s.authenticated === false) { renderStatsError(); return; }
        renderStatsData(s);
      })
      .catch(function () {
        if (state.screen !== 7) return;
        renderStatsError();
      });
  }

  function renderStatsError() {
    app.innerHTML =
      '<div class="dmls-card dmls-anim-in dmls-stats">' +
      '<div class="dmls-card-body">' +
      '<p class="dmls-eyebrow">Your Doomlings career</p>' +
      '<h2 class="dmls-title">My Stats</h2>' +
      '<p class="dmls-sub">Couldn’t load your stats right now — check your connection and try again.</p>' +
      "</div>" +
      '<div class="dmls-nav"><span class="dmls-spacer"></span><button type="button" class="dmls-btn dmls-btn-ghost" id="dmls-stats-back">Back</button><span class="dmls-spacer"></span></div>' +
      "</div>";
    document.getElementById("dmls-stats-back").addEventListener("click", goHome);
  }

  function renderStatsData(s) {
    var games = s.recentGames || [];
    var pageSize = 5;
    var totalPages = Math.max(1, Math.ceil(games.length / pageSize));
    var page = 0;

    var tiles =
      '<div class="dmls-stat-grid">' +
      '<div class="dmls-stat-tile"><span class="dmls-stat-n">' + (s.gamesLogged || 0) + '</span><span class="dmls-stat-l">Games</span></div>' +
      '<div class="dmls-stat-tile"><span class="dmls-stat-n">' + (s.wins || 0) + '</span><span class="dmls-stat-l">Wins</span></div>' +
      '<div class="dmls-stat-tile"><span class="dmls-stat-n">' + (s.bestScore || 0) + '</span><span class="dmls-stat-l">Best score</span></div>' +
      '<div class="dmls-stat-tile"><span class="dmls-stat-n">' + (s.points || 0) + '</span><span class="dmls-stat-l">Points</span></div>' +
      "</div>";

    function historyBody() {
      if (!games.length) {
        return '<p class="dmls-sub" style="margin-top:16px">No games logged yet — play one to get started!</p>';
      }
      var start = page * pageSize;
      var pageGames = games.slice(start, start + pageSize);
      var list = '<ul class="dmls-history">' + pageGames.map(function (g) {
        var d = new Date(g.playedAt);
        var when = isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
        return '<li class="' + (g.customerWon ? "dmls-won" : "") + '">' +
          '<div class="dmls-hist-top">' +
          '<span class="dmls-hist-date">' + when + "</span>" +
          (g.customerWon ? '<span class="dmls-hist-badge">WIN</span>' : "") +
          "</div>" +
          '<span class="dmls-hist-info">' + esc((g.winnerNames || []).join(" & ")) + " won · " + g.topScore + " pts · " + g.playerCount + " players</span>" +
          "</li>";
      }).join("") + "</ul>";
      var pager = totalPages > 1
        ? '<div class="dmls-hist-pager">' +
          '<button type="button" class="dmls-hist-pbtn" id="dmls-hist-prev"' + (page === 0 ? " disabled" : "") + '>&larr; Prev</button>' +
          '<span class="dmls-hist-pageinfo">' + (page + 1) + " / " + totalPages + "</span>" +
          '<button type="button" class="dmls-hist-pbtn" id="dmls-hist-next"' + (page >= totalPages - 1 ? " disabled" : "") + '>Next &rarr;</button>' +
          "</div>"
        : "";
      return list + pager;
    }

    function draw() {
      var history =
        '<div class="dmls-hist-wrap">' +
        (games.length ? '<p class="dmls-hist-title">Recent games</p>' : "") +
        historyBody() +
        "</div>";

      app.innerHTML =
        '<div class="dmls-card dmls-anim-in dmls-stats">' +
        '<div class="dmls-card-body">' +
        '<p class="dmls-eyebrow">Your Doomlings career</p>' +
        '<h2 class="dmls-title">My Stats</h2>' +
        tiles +
        history +
        "</div>" +
        '<div class="dmls-nav"><span class="dmls-spacer"></span><button type="button" class="dmls-btn dmls-btn-go" id="dmls-stats-back">Back</button><span class="dmls-spacer"></span></div>' +
        "</div>";
      document.getElementById("dmls-stats-back").addEventListener("click", goHome);

      var prevBtn = document.getElementById("dmls-hist-prev");
      var nextBtn = document.getElementById("dmls-hist-next");
      if (prevBtn) prevBtn.addEventListener("click", function () { if (page > 0) { page--; draw(); } });
      if (nextBtn) nextBtn.addEventListener("click", function () { if (page < totalPages - 1) { page++; draw(); } });
    }

    draw();
  }

  /* --- winner --- */
  function renderWinner() {
    // Reached directly from finishGame()/renderGuess(), bypassing render()'s
    // dispatcher — so the wide-layout class has to be set here, not there.
    root.classList.add("dmls-wide");
    var ranked = state.players.slice().sort(function (a, b) { return total(b) - total(a); });
    var top = ranked.length ? total(ranked[0]) : 0;
    var winners = ranked.filter(function (p) { return total(p) === top; });
    var winNames = winners.map(function (p) { return esc(p.name); }).join(' <span class="dmls-amp">&amp;</span> ');
    var meWon = winners.some(function (p) { return p.isCustomer; });

    var loyaltyHTML;
    if (CUSTOMER) {
      var basePts = lastResult && lastResult.pointsAwarded ? lastResult.pointsAwarded : 0;
      var guessPts = guessResult && guessResult.pointsAwarded ? guessResult.pointsAwarded : 0;
      var pts = basePts + guessPts;
      var stats = lastResult && lastResult.stats ? lastResult.stats : null;
      var bonusLines = "";
      if (lastResult && lastResult.milestones) {
        lastResult.milestones.forEach(function (m) {
          bonusLines += '<li><b>+' + m.points + "</b> " + esc(m.label) + "</li>";
        });
      }
      if (guessResult) {
        bonusLines += guessResult.correct
          ? '<li><b>+' + guessPts + "</b> Guessed the winner!</li>"
          : "<li>Nice try — wrong guess this time.</li>";
      }
      if (lastResult) {
        loyaltyHTML =
          '<div class="dmls-widget"><h3 class="dmls-widget-title">Your stats</h3>' +
          '<div class="dmls-pointsline">' +
          (pts ? '<div class="dmls-coin">+' + pts + "</div>" : "") +
          "<p>" +
          (pts ? "<strong>+" + pts + " points</strong> earned this game.<br>" : "Game saved to your account.<br>") +
          (stats ? "Games: <strong>" + stats.gamesLogged + "</strong> · Wins: <strong>" + stats.wins + "</strong> · Points: <strong>" + (stats.points + guessPts) + "</strong>" : "") +
          "</p></div>" +
          (bonusLines ? '<ul class="dmls-bonuses">' + bonusLines + "</ul>" : "") +
          "</div>";
      } else if (saveFailed) {
        loyaltyHTML =
          '<div class="dmls-widget"><h3 class="dmls-widget-title">Your stats</h3>' +
          "<p>We couldn’t save this game to your account — check your connection. This game won’t count toward your stats or points.</p></div>";
      } else {
        loyaltyHTML =
          '<div class="dmls-widget"><h3 class="dmls-widget-title">Your stats</h3>' +
          "<p>Saving your game…</p></div>";
      }
    } else {
      loyaltyHTML =
        '<div class="dmls-widget"><h3 class="dmls-widget-title">Save this victory</h3>' +
        "<p>Create a free account to keep your game history, track wins, and earn points for every game you log.</p>" +
        '<a class="dmls-btn dmls-btn-go" href="' + esc(signupUrl) + '">Create account</a></div>';
    }

    app.innerHTML =
      '<div class="dmls-card dmls-anim-in dmls-winner">' +
      '<div class="dmls-card-body">' +
      '<div class="dmls-win-main">' +
      logoHTML("dmls-win-logo") +
      '<div class="dmls-win-badges">' +
      '<span class="dmls-win-badge dmls-win-badge-name">' + winNames + "</span>" +
      '<span class="dmls-win-badge dmls-win-badge-msg">WON THE END OF THE WORLD!!!!!!</span>' +
      "</div>" +
      (meWon ? '<p class="dmls-sub">Hi ' + esc(cap(CUSTOMER.firstName) || "there") + ", that’s you!</p>" : "") +
      (ICONS.winner ? '<img class="dmls-win-art" src="' + ICONS.winner + '" alt="" loading="lazy">' : "") +
      '<button type="button" class="dmls-btn dmls-btn-go dmls-win-cta" id="dmls-cta"></button>' +
      '<div class="dmls-win-arrows">' +
      '<button type="button" class="dmls-arrow" id="dmls-arrow-prev" aria-label="Previous option">&lsaquo;</button>' +
      '<button type="button" class="dmls-arrow dmls-arrow-next" id="dmls-arrow-next" aria-label="Next option">&rsaquo;</button>' +
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

    app.addEventListener("click", winnerClicks);

    // Rematch / New players share one CTA button; the arrows cycle between
    // the two so the screen reads as a single clean action instead of a
    // crowded two-button row.
    function doRematch() {
      state.players.forEach(function (p) { p.we = 0; p.fv = 0; p.bp = 0; p.mp = 0; });
      lastResult = null;
      guessResult = null;
      state.screen = 2;
      save();
      render();
    }
    function doNewPlayers() {
      state.players = [];
      lastResult = null;
      guessResult = null;
      state.screen = 1;
      save();
      render();
    }
    var ctaActions = [
      { label: "Rematch!", run: doRematch },
      { label: "New players", run: doNewPlayers },
    ];
    var ctaIndex = 0;
    var ctaBtn = document.getElementById("dmls-cta");
    function bindCta() {
      ctaBtn.textContent = ctaActions[ctaIndex].label;
      ctaBtn.onclick = ctaActions[ctaIndex].run;
    }
    bindCta();
    document.getElementById("dmls-arrow-prev").addEventListener("click", function () {
      ctaIndex = (ctaIndex + ctaActions.length - 1) % ctaActions.length;
      bindCta();
    });
    document.getElementById("dmls-arrow-next").addEventListener("click", function () {
      ctaIndex = (ctaIndex + 1) % ctaActions.length;
      bindCta();
    });

    confettiBurst();
  }

  function winnerClicks(e) {
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
          buy.textContent = "Added ✓";
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
  syncHash(false); // normalize the URL to match the restored/default screen, no extra history entry

  apiGet("/config")
    .then(function (c) {
      if (!c || c.error) return;
      serverConfig = c;
      var images = c.images || {};
      // Backgrounds are pure CSS (custom properties) — safe to apply any time,
      // no re-render needed, the browser repaints whatever's on screen.
      if (images.bg) root.style.setProperty("--dmls-bg-url", 'url("' + images.bg + '")');
      if (images.bgExp) root.style.setProperty("--dmls-bg-exp-url", 'url("' + images.bgExp + '")');
      if (images.bgWinner) root.style.setProperty("--dmls-bg-winner-url", 'url("' + images.bgWinner + '")');
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
      if (typeof c.logoWidth === "number" && c.logoWidth !== logoWidth) {
        logoWidth = c.logoWidth;
        needsRerender = true;
      }
      if (needsRerender && state.screen === 0) render();
    })
    .catch(function () { /* tool works without config */ });

  render();
})();
