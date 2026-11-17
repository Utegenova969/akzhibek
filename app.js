/* Ақжібек Мұқашева: Үнсіз ерлік — сайт логикасы */
(function () {
  "use strict";
  const D = window.AKZ;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const chip = (st) => { const s = D.STATUS[st] || D.STATUS.mod; return `<span class="chip ${s.cls}">${s.label}</span>`; };
  const refs = (arr) => arr && arr.length ? "Дереккөз: " + arr.map((n) => `[${n}]`).join(" ") : "";
  const fmt = (s) => { s = Math.round(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- persistent state (only this device) ---------- */
  const KEY = "akz-state-v1";
  let S = {};
  try { S = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { S = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  S.cipher = S.cipher || { pts: {}, level: 1 };
  S.det = S.det || {};

  /* ---------- capabilities ---------- */
  const cap = (name) => {
    try { return window.claude && typeof window.claude.use === "function" ? window.claude.use(name).catch(() => null) : Promise.resolve(null); }
    catch (e) { return Promise.resolve(null); }
  };

  /* ---------- audio: tiny beeps ---------- */
  let actx = null;
  function beep(freq = 760, dur = 0.08, vol = 0.05) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = freq; o.type = "sine"; g.gain.value = vol;
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
    } catch (e) {}
  }

  /* ---------- speech (museum guide) ---------- */
  let ttsP = null, speaking = false;
  const Speech = {
    note: "",
    async speak(text, onEnd) {
      this.stop();
      speaking = true;
      ttsP = ttsP || cap("tts");
      const t = await ttsP;
      if (t) {
        try { await t.speak(text, { language: "kk" }); speaking = false; onEnd && onEnd(); return "tts"; }
        catch (e) {
          try { await t.speak(text); speaking = false; onEnd && onEnd(); return "tts"; } catch (e2) {}
        }
      }
      if (!("speechSynthesis" in window)) { speaking = false; this.note = "Бұл құрылғыда дыбыстау қолжетімсіз – гид мәтінін оқыңыз."; onEnd && onEnd(); return "none"; }
      const u = new SpeechSynthesisUtterance(text);
      const vs = speechSynthesis.getVoices();
      const v = vs.find((x) => /^kk/i.test(x.lang)) || vs.find((x) => /^ru/i.test(x.lang));
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "kk-KZ";
      this.note = v && /^kk/i.test(v.lang) ? "" : "Қазақша дауыс бұл құрылғыда жоқ болуы мүмкін – дыбыстау басқа тілдегі дауыспен оқылады.";
      u.rate = 0.95; u.onend = () => { speaking = false; onEnd && onEnd(); };
      speechSynthesis.speak(u);
      return "browser";
    },
    async stop() {
      speaking = false;
      try { speechSynthesis.cancel(); } catch (e) {}
      try { const t = await (ttsP || Promise.resolve(null)); t && t.stop(); } catch (e) {}
    },
    get on() { return speaking; }
  };

  /* ---------- overlay ---------- */
  const ov = $("#ov"), ovBody = $("#ovBody"), ovTitle = $("#ovTitle"), ovCap = $("#ovCap"), ovTools = $("#ovTools");
  let ovKeys = null, ovClose = null, lastFocus = null;
  function openOverlay({ title = "", body, cap: capt = "", tools = [], keys = null, onClose = null }) {
    closeOverlay(true);
    lastFocus = document.activeElement;
    ovTitle.textContent = title;
    ovBody.className = "ov-body";
    ovBody.innerHTML = "";
    if (typeof body === "string") ovBody.innerHTML = body; else if (body) ovBody.appendChild(body);
    ovCap.innerHTML = capt;
    ovTools.innerHTML = "";
    tools.forEach((t) => ovTools.appendChild(t));
    ovKeys = keys; ovClose = onClose;
    ov.hidden = false;
    document.body.style.overflow = "hidden";
    $("#ovClose").focus();
  }
  function closeOverlay(silent) {
    if (ov.hidden) return;
    $$("video", ovBody).forEach((v) => { try { v.pause(); } catch (e) {} });
    ov.hidden = true; ovBody.innerHTML = "";
    if (!($("#museumStage") && !$("#museumStage").hidden)) document.body.style.overflow = "";
    const c = ovClose; ovClose = null; ovKeys = null;
    c && c();
    if (!silent && lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $("#ovClose").addEventListener("click", () => closeOverlay());
  ov.addEventListener("click", (e) => { if (e.target === ovBody) closeOverlay(); });
  document.addEventListener("keydown", (e) => {
    if (ov.hidden) return;
    if (e.key === "Escape") { e.stopPropagation(); closeOverlay(); }
    else if (ovKeys && ovKeys[e.key]) ovKeys[e.key]();
  }, true);

  function card(html) { return h(`<div class="card glass">${html}</div>`); }

  /* ---------- video player ---------- */
  function openVideo(id, onClose) {
    const v = D.VIDEOS.find((x) => x.id === id) || D.VIDEOS[0];
    const wrap = h(`<div style="display:grid;gap:12px;justify-items:center;width:100%;align-content:start;padding-bottom:24px"></div>`);
    const video = h(`<video controls playsinline preload="metadata" poster="${v.poster}" style="max-height:60vh"></video>`);
    video.src = v.src; video.muted = true;
    wrap.appendChild(video);
    if (v.ai) wrap.appendChild(h(`<p class="src" style="text-align:center">${esc(D.AI_NOTE)}</p>`));
    if (v.more) {
      const info = h(`<div class="card glass article" style="margin:0;max-width:820px"><span class="eyebrow">${esc(v.cat)} · ${fmt(v.dur)}</span><h3>${esc(v.t)}</h3><p>${v.more}</p>
        ${v.id === "film" ? `<div class="qbox"><b>Көргеннен кейін ойланыңыз</b><ol><li>Бейнедегі қай мәлімет жарияланған дерекке, қайсысы көркем реконструкцияға жатады?</li><li>Ақжібектің ерлігін неге интеллектуалдық ерлік деп атауға болады?</li><li>Бұл тұлға туралы тағы не білгіңіз келеді?</li></ol></div><div class="cta"><button class="btn small" data-art="bio">Толық өмірбаянды оқу</button><button class="btn small" data-art="aimethod">Бейне қалай жасалды?</button></div>` : ""}
        ${v.id === "process" ? `<div class="cta"><button class="btn small" data-art="aimethod">Бейне қалай жасалды: қадам-қадаммен</button></div>` : ""}
        ${/^s\d/.test(v.id) ? `<div class="cta"><button class="btn small" data-art="lesson">Бейнені сабақта қолдану әдістемесі</button></div>` : ""}</div>`);
      wrap.appendChild(info);
    }
    const playB = h(`<button class="m-btn">⏸ Пауза</button>`);
    const muteB = h(`<button class="m-btn">🔇 Дыбысты қосу</button>`);
    const fsB = h(`<button class="m-btn">⛶ Толық экран</button>`);
    const sync = () => { playB.textContent = video.paused ? "▶ Ойнату" : "⏸ Пауза"; muteB.textContent = video.muted ? "🔇 Дыбысты қосу" : "🔊 Дыбысты өшіру"; };
    playB.onclick = () => { video.paused ? video.play().catch(() => {}) : video.pause(); };
    muteB.onclick = () => { video.muted = !video.muted; if (!video.muted && video.paused) video.play().catch(() => {}); sync(); };
    fsB.onclick = () => {
      const f = video.requestFullscreen || video.webkitRequestFullscreen;
      if (f) { try { const p = f.call(video); p && p.catch && p.catch(() => { video.webkitEnterFullscreen && video.webkitEnterFullscreen(); }); } catch (e) {} }
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    };
    ["play", "pause", "volumechange"].forEach((ev) => video.addEventListener(ev, sync));
    video.addEventListener("error", () => { wrap.appendChild(h(`<p class="fb no">Видео файлы жүктелмеді. Интернет байланысын тексеріп, қайта ашып көріңіз.</p>`)); });
    openOverlay({ title: v.t, body: wrap, cap: "", tools: [playB, muteB, fsB], keys: { " ": () => playB.click() }, onClose });
    video.play().then(sync).catch(sync);
  }

  /* ---------- lightbox ---------- */
  function openLightbox(list, idx) {
    let i = idx;
    const show = () => {
      const it = list[i];
      const body = h(`<div style="width:100%;height:100%;display:grid;place-items:center;position:relative"></div>`);
      const img = h(`<img class="lb" alt="">`); img.src = it.src; img.alt = it.alt || it.cap || "";
      body.appendChild(img);
      img.addEventListener("click", (e) => { e.stopPropagation(); ovBody.classList.toggle("zoomed"); });
      if (list.length > 1) {
        const p = h(`<button class="nav-arrow p" aria-label="Алдыңғы">‹</button>`), n = h(`<button class="nav-arrow n" aria-label="Келесі">›</button>`);
        p.onclick = (e) => { e.stopPropagation(); i = (i - 1 + list.length) % list.length; show(); };
        n.onclick = (e) => { e.stopPropagation(); i = (i + 1) % list.length; show(); };
        body.append(p, n);
      }
      const zb = h(`<button class="m-btn">🔍 Үлкейту</button>`);
      zb.onclick = () => ovBody.classList.toggle("zoomed");
      openOverlay({ title: (list.length > 1 ? `${i + 1} / ${list.length} · ` : "") + (it.title || "Сурет"), body, cap: esc(it.cap || "") + (it.ai ? `<br><span class="src">${esc(D.AI_NOTE)}</span>` : ""), tools: [zb],
        keys: list.length > 1 ? { ArrowLeft: () => { i = (i - 1 + list.length) % list.length; show(); }, ArrowRight: () => { i = (i + 1) % list.length; show(); } } : null });
      // swipe
      let sx = null;
      body.addEventListener("touchstart", (e) => { if (!ovBody.classList.contains("zoomed")) sx = e.touches[0].clientX; }, { passive: true });
      body.addEventListener("touchend", (e) => { if (sx == null || list.length < 2) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) { i = (i + (dx < 0 ? 1 : -1) + list.length) % list.length; show(); } });
    };
    show();
  }

  /* ---------- document viewer ---------- */
  function openDoc(key) {
    const f = D.FILES[key];
    const wrap = h(`<div class="docviewer"></div>`);
    const pages = f.list ? f.list.slice() : [];
    if (!f.list) for (let p = 1; p <= f.pages; p++) pages.push(`${f.dir}${String(p).padStart(f.pad, "0")}.jpg`);
    wrap.innerHTML = pages.map((src, k) => `<img loading="lazy" src="${src}" alt="${esc(f.name)}, ${k + 1}-бет">`).join("");
    const tools = [];
    if (f.pdf) tools.push(h(`<a class="m-btn" href="${f.pdf}" target="_blank" rel="noopener" style="text-decoration:none">PDF жаңа бетте</a>`));
    openOverlay({ title: pages.length > 1 ? `${f.name} · ${pages.length} бет` : f.name, body: wrap, tools });
    ovBody.style.placeItems = "start center";
  }

  /* ---------- full articles ---------- */
  const ART = (window.AKZ_ARTICLES || { A: {}, SRC: {} });
  function srcList(nums) {
    if (!nums || !nums.length) return "";
    return `<div class="srcbox"><b>Дереккөздер</b><ol>${nums.map((n) => { const s = D.SOURCES.find((x) => x.n === n); return s ? `<li value="${n}"><button class="linkish" data-src="${n}">${esc(s.author)} ${esc(s.title)} // ${esc(s.pub)}</button></li>` : ""; }).join("")}</ol></div>`;
  }
  function openArticle(key, extra) {
    const a = ART.A[key];
    if (!a) return;
    const rel = (a.related || []).filter((k) => ART.A[k]);
    const body = h(`<article class="card glass article"></article>`);
    body.innerHTML = `<span class="eyebrow">${esc(a.eyebrow)}</span><h3>${esc(a.title)}</h3><p class="lead">${esc(a.lead)}</p>
      <div class="meta-row">${chip(a.status)}<span class="src">${a.src && a.src.length ? "Дереккөз: " + a.src.map((n) => "[" + n + "]").join(" ") : ""}</span></div>
      ${extra || ""}${a.body}${srcList(a.src)}
      ${rel.length ? `<div class="relbox"><b>Тақырыпқа қатысты</b><div class="cta">${rel.map((k) => `<button class="btn small" data-art="${k}">${esc(ART.A[k].title)}</button>`).join("")}</div></div>` : ""}`;
    openOverlay({ title: a.eyebrow, body });
    ovBody.style.placeItems = "start center"; ovBody.scrollTop = 0;
  }
  function openSource(n) {
    const s = D.SOURCES.find((x) => x.n === n); const m = ART.SRC[n] || {};
    if (!s) return;
    openSourceCard({ t: s.title, a: s.author, y: s.year || "—", pub: s.pub, about: m.about, use: m.use, st: m.status || "mod", n });
  }
  function openSourceCard(o) {
    const body = h(`<article class="card glass article"></article>`);
    body.innerHTML = `<span class="eyebrow">Цифрлық архив · дереккөз${o.n ? " [" + o.n + "]" : ""}</span><h3>${esc(o.t)}</h3>
      <p class="lead">${esc(o.a)}${o.pub ? " // " + esc(o.pub) : ""}</p><div class="meta-row">${chip(o.st)}<span class="src">Жылы: ${esc(String(o.y))}</span></div>
      ${o.about ? `<h4>Дереккөзде не айтылады?</h4><p>${esc(o.about)}</p>` : ""}
      ${o.use ? `<h4>Зерттеуде қалай қолданылды?</h4><p>${esc(o.use)}</p>` : ""}
      <div class="notebox">Бұл жарияланымның түпнұсқа файлы жобаға жүктелмеген. Мұнда ғылыми жоба мен зерттеу күнделігіндегі талдау негізінде оның мазмұны мен зерттеудегі орны сипатталған. Түпнұсқаны кітапханадан немесе газет мұрағатынан табуға болады.</div>`;
    openOverlay({ title: "Цифрлық архив", body });
    ovBody.style.placeItems = "start center"; ovBody.scrollTop = 0;
  }
  document.addEventListener("click", (e) => {
    const ab = e.target.closest("[data-art]");
    if (ab) { e.preventDefault(); openArticle(ab.getAttribute("data-art")); return; }
    const sb = e.target.closest("[data-src]");
    if (sb) { e.preventDefault(); openSource(+sb.getAttribute("data-src")); }
  });

  /* ================= NAV ================= */
  const nav = $("#nav"), burger = $("#burger");
  burger.addEventListener("click", () => { const o = nav.classList.toggle("open"); burger.setAttribute("aria-expanded", o); });
  $$("#navList a").forEach((a) => a.addEventListener("click", () => { nav.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); }));
  const links = $$("#navList a.nl");
  const secMap = { bio: "#bio", context: "#context", home: "#home", dossier: "#home", museum: "#museum", timeline: "#timeline", archive: "#archive", cipher: "#cipher", detective: "#detective", ai: "#ai", diary: "#diary", videos: "#videos", achievements: "#achievements" };
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        const target = secMap[en.target.id];
        links.forEach((l) => l.classList.toggle("on", l.getAttribute("href") === target));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    $$("header.hero, section.sec").forEach((s) => io.observe(s));
  }
  const toTop = $("#toTop");
  window.addEventListener("scroll", () => { toTop.hidden = window.scrollY < 900; }, { passive: true });
  toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" }));

  /* ================= HERO ================= */
  (function cipherRain() {
    const c = $("#cipherCanvas"); if (!c) return;
    const ctx = c.getContext("2d");
    const glyphs = "ӘҒҚҢӨҰҮҺІАБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЫЭЮЯ0123456789".split("");
    let cols = [], w = 0, hh = 0, fs = 16, raf = 0, last = 0;
    function size() {
      const r = c.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
      w = r.width; hh = r.height; c.width = w * dpr; c.height = hh * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      fs = w < 600 ? 13 : 16;
      cols = Array.from({ length: Math.ceil(w / (fs * 1.6)) }, () => ({ y: Math.random() * hh, sp: 0.3 + Math.random() * 0.9, a: Math.random() }));
    }
    function draw(t) {
      raf = requestAnimationFrame(draw);
      if (t - last < 55) return; last = t;
      ctx.fillStyle = "rgba(7,17,31,0.16)"; ctx.fillRect(0, 0, w, hh);
      ctx.font = `${fs}px "PT Mono", monospace`;
      cols.forEach((col, i) => {
        const g = glyphs[(Math.random() * glyphs.length) | 0];
        const x = i * fs * 1.6;
        ctx.fillStyle = Math.random() < 0.04 ? "rgba(244,213,141,.9)" : `rgba(53,199,216,${0.18 + col.a * 0.35})`;
        ctx.fillText(g, x, col.y);
        col.y += fs * col.sp;
        if (col.y > hh + 20) { col.y = -20; col.sp = 0.3 + Math.random() * 0.9; }
      });
    }
    size(); addEventListener("resize", size);
    if (reduced) { draw(0); cancelAnimationFrame(raf); return; }
    raf = requestAnimationFrame(draw);
    document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else raf = requestAnimationFrame(draw); });
  })();

  (function whisper() {
    const el = $("#whisper"); if (!el || reduced) return;
    const txt = el.textContent; let i = 0;
    el.textContent = "";
    const cur = h(`<span class="cur"></span>`);
    const tick = () => { el.textContent = txt.slice(0, ++i); el.appendChild(cur); if (i < txt.length) setTimeout(tick, 42); };
    setTimeout(tick, 300);
  })();

  $("#openCase").addEventListener("click", () => {
    const fx = $("#folderFx");
    if (reduced) { $("#bio").scrollIntoView(); return; }
    fx.hidden = false; beep(440, 0.12, 0.03);
    setTimeout(() => { fx.hidden = true; $("#bio").scrollIntoView({ behavior: "smooth" }); }, 2100);
    fx.onclick = () => { fx.hidden = true; $("#bio").scrollIntoView(); };
  });

  document.addEventListener("click", (e) => {
    const vb = e.target.closest("[data-video]");
    if (vb) { e.preventDefault(); openVideo(vb.getAttribute("data-video")); return; }
    const mb = e.target.closest("[data-enter-museum]");
    if (mb) { e.preventDefault(); enterMuseum(mb.getAttribute("data-enter-museum")); }
  });

  /* ================= DOSSIER ================= */
  function tlDetail(i) {
    const t = D.TIMELINE[i];
    return card(`<span class="eyebrow">${esc(t.year)} · ${esc(t.short)}</span><h3>${esc(t.title)}</h3>
      <p>${esc(t.text)}</p><div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">${chip(t.status)}<span class="src">${refs(t.src)}</span></div>
      ${t.img ? `<figure style="margin:0;border-radius:10px;overflow:hidden;border:1px solid var(--line)"><img src="${t.img}" alt="" style="width:100%;display:block"><figcaption class="ai-note">${esc(D.AI_NOTE)}</figcaption></figure>` : ""}`);
  }
  const dg = $("#dossierGrid");
  D.DOSSIER.forEach((d) => {
    const b = h(`<button class="dcard"><span class="k">${esc(d.k)}</span><span class="v">${esc(d.v)}</span><span class="d">${esc(d.d)}</span></button>`);
    b.onclick = () => openArticle(d.art);
    dg.appendChild(b);
  });

  /* ================= BIOGRAPHY (inline) ================= */
  (function renderBio() {
    const a = ART.A.bio; if (!a) return;
    const text = $("#bioText"), toc = $("#bioToc");
    text.innerHTML = `<div class="article"><figure class="bio-portrait"><img src="ai-face.jpg" alt="Ақжібек Мұқашеваның ЖИ реконструкциясы" loading="lazy"><figcaption class="ai-note">${esc(D.AI_NOTE)}</figcaption></figure>
      <p class="lead">${esc(a.lead)}</p>${a.body}${srcList(a.src)}</div>`;
    $$("h4", text).forEach((hd, i) => { hd.id = "bio-" + (i + 1); const l = h(`<a href="#bio-${i + 1}">${esc(hd.textContent)}</a>`); toc.appendChild(l); });
    toc.appendChild(h(`<button class="btn small" data-art="sources" style="margin-top:10px">Дереккөздерді салыстыру</button>`));
  })();

  /* ================= CONTEXT + METHOD + GLOSSARY ================= */
  (function renderContext() {
    const card = (k, kicker) => { const a = ART.A[k]; if (!a) return ""; return `<button class="ctx-card" data-art="${k}"><span class="k">${kicker || a.eyebrow}</span><b>${esc(a.title)}</b><span class="d">${esc(a.lead)}</span>${chip(a.status)}<span class="go">Толық оқу →</span></button>`; };
    $("#ctxGrid").innerHTML = ["redchapel", "kent", "khasan", "cryptographer", "infofront", "repression", "sources", "women"].map((k) => card(k)).join("");
    $("#methodGrid").innerHTML = ["project", "akhtandak", "algo", "aimethod", "lesson", "results"].map((k) => card(k)).join("");
    const G = [
      ["Шифрлаушы", "Құпия хабарларды шифрлайтын және шифрланған хабарлардың кілтін пайдаланып шешетін маман."],
      ["Шифр, шифровка", "Кілтсіз оқуға болмайтындай етіп әріптер мен сандар тобына айналдырылған хабар."],
      ["Радиограмма", "Радиостанция арқылы, көбіне Морзе әліпбиімен берілген хабар."],
      ["Барлаушы, резидент", "Шет елде жасырын мәлімет жинайтын адам. Резидент – белгілі бір елдегі барлау тобының жетекшісі."],
      ["Бас барлау басқармасы (ГРУ)", "КСРО әскери барлауының орталық органы. Бұл атау 1942 жылғы ақпаннан бастап қолданылды."],
      ["«Қызыл капелла»", "Екінші дүниежүзілік соғыс кезінде Еуропада әрекет еткен кеңестік барлау желісінің атауы."],
      ["НКВД", "КСРО Ішкі істер халық комиссариаты. Саяси қуғын-сүргінді жүзеге асырған негізгі орган."],
      ["58-бап", "РСФСР Қылмыстық кодексінің (1926) «контрреволюциялық қылмыстар» туралы бабы; саяси қуғын-сүргіннің басты құралы."],
      ["Лагерь", "Сотталғандар жазасын өтеген еңбекпен түзеу лагерьлерінің жүйесі (ГУЛАГ)."],
      ["Ақталу (реабилитация)", "Негізсіз сотталған адамның айыптан ресми түрде босатылып, абыройының қалпына келтірілуі."],
      ["Ақтаңдақ", "Тарихтағы әлі толық зерттелмеген немесе ұзақ уақыт айтылмай келген оқиғалар мен тағдырлар."],
      ["Деректанулық сын", "Дереккөздің шынайылығын, авторын, уақытын және сенімділігін тексеру әдісі."],
      ["Тарихи-көркем реконструкция", "Тарихи деректерге сүйеніп жасалған шартты бейне. Ол түпнұсқа құжат немесе фотосурет емес."],
      ["Промпт, negative prompt", "ЖИ-ге берілетін мәтіндік нұсқаулық және бейнеде болмауы тиіс элементтердің тізімі."]
    ];
    $("#gloss").innerHTML = G.map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join("");
  })();

  /* ================= MUSEUM PREVIEW ================= */
  const dp = $("#doorPreview");
  D.ROOMS.forEach((r) => {
    const b = h(`<button class="door" data-n="${r.n}" data-enter-museum="${r.n}" aria-label="${r.n}-бөлме: ${esc(r.name)}">${esc(r.name)}</button>`);
    dp.appendChild(b);
  });
  let pendingMuseum = null;
  function enterMuseum(arg) {
    if (window.AKZMuseum && window.AKZMuseum.open) window.AKZMuseum.open(arg);
    else {
      pendingMuseum = arg;
      openOverlay({ title: "Виртуалды музей", body: card(`<h3>Музей жүктелуде…</h3><p class="muted">3D кітапхана жүктеліп жатыр. Бірнеше секундтан кейін музей өздігінен ашылады.</p>`) });
      let n = 0;
      const iv = setInterval(() => {
        n++;
        if (window.AKZMuseum && window.AKZMuseum.open) { clearInterval(iv); closeOverlay(true); window.AKZMuseum.open(pendingMuseum); }
        else if (n > 40) { clearInterval(iv); closeOverlay(true); museumFallback(); }
      }, 250);
    }
  }
  function museumFallback() {
    // 3D unavailable: text museum with all exhibits and tasks
    const body = h(`<div class="card glass" style="max-width:900px"></div>`);
    body.innerHTML = `<h3>Виртуалды музей (мәтіндік нұсқа)</h3><p class="fb info">3D кітапхана жүктелмеді (интернет байланысы жоқ немесе браузер WebGL-ді қолдамайды). Барлық экспонаттар мен тапсырмалар төменде қолжетімді.</p>`;
    D.ROOMS.forEach((r) => {
      const sec = h(`<div style="display:grid;gap:10px;border-top:1px solid var(--line);padding-top:14px"><span class="eyebrow">${r.n}-бөлме</span><h3>${esc(r.name)}</h3><p class="muted">${esc(r.guide)}</p></div>`);
      Object.values(r.exhibits).forEach((x) => sec.appendChild(h(`<div><b>${esc(x.t)}</b> ${chip(x.st)}<p class="muted" style="font-size:.92rem">${esc(x.d)}</p></div>`)));
      const host = h(`<div></div>`); sec.appendChild(host); roomTask(r.n, host);
      body.appendChild(sec);
    });
    openOverlay({ title: "Виртуалды музей", body });
  }

  /* ================= TIMELINE ================= */
  const tl = $("#tl"), tlCard = $("#tlCard");
  let tlI = 0;
  function renderTl(i) {
    tlI = i;
    $$("button", tl).forEach((b, k) => { b.classList.toggle("on", k === i); b.setAttribute("aria-selected", k === i); });
    const t = D.TIMELINE[i];
    const media = t.img ? `<img src="${t.img}" alt="${esc(t.title)} – ЖИ иллюстрациясы"><div class="ai-note">${esc(D.AI_NOTE)}</div>`
      : `<div class="paperdoc"><div><div class="q">${t.year === "?" ? "?" : "1945"}</div><div>${t.year === "?" ? "ІС АШЫҚ · АРХИВ ЖАБЫҚ" : "КУӘГЕР МӘЛІМЕТІ · РАСТАЛМАҒАН"}</div></div></div>`;
    const art = ART.A[t.art] || {};
    tlCard.innerHTML = `<div class="media">${media}</div><div class="body reveal"><div class="big">${esc(t.year)}</div><h3>${esc(art.title || t.title)}</h3>
      <div class="meta">${chip(t.status)}<span class="src">${refs(t.src)}</span></div>
      <div class="article tl-article"><p class="lead">${esc(art.lead || t.text)}</p>${art.body || ""}</div>
      <div class="cta"><button class="btn small" ${i === 0 ? "disabled" : ""} data-tl="${i - 1}">‹ Алдыңғы</button><button class="btn small" ${i === D.TIMELINE.length - 1 ? "disabled" : ""} data-tl="${i + 1}">Келесі ›</button></div></div>`;
    $$("[data-tl]", tlCard).forEach((b) => b.onclick = () => { renderTl(+b.dataset.tl); tl.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }); });
  }
  D.TIMELINE.forEach((t, i) => {
    const b = h(`<button role="tab"><span class="yr">${esc(t.year)}</span><span class="dot"></span><span class="lab">${esc(t.short)}</span></button>`);
    b.onclick = () => renderTl(i);
    tl.appendChild(b);
  });
  tl.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") renderTl(Math.min(tlI + 1, 5)); if (e.key === "ArrowLeft") renderTl(Math.max(tlI - 1, 0)); });
  renderTl(0);

  /* ================= MAP ================= */
  function renderMap(host, compact) {
    const W = 1000, H = 430;
    const px = (lon) => (lon <= 60 ? 0.04 + ((lon + 5) / 65) * 0.62 : 0.66 + ((lon - 60) / 85) * 0.3) * W, py = (lat) => (0.06 + ((61 - lat) / 27) * 0.84) * H;
    const LBL = { orenburg: [12, 22, 'start'], oral: [-12, 24, 'end'], moscow: [-10, -14, 'end'], berlin: [0, -16, 'middle'], brussels: [-6, 26, 'middle'], tokyo: [-12, -12, 'end'], khasan: [-12, -12, 'end'] };
    const P = {}; D.MAP.points.forEach((p) => P[p.id] = { x: px(p.lon), y: py(p.lat), ...p });
    const col = { pub: "#D4AF37", mod: "#35C7D8", unc: "#E8B04B" };
    const dash = { pub: "", mod: "10 8", unc: "3 7" };
    let grid = "";
    for (const lon of [0, 10, 20, 30, 40, 50, 60, 80, 100, 120, 140]) grid += `<line x1="${px(lon)}" y1="0" x2="${px(lon)}" y2="${H}" stroke="rgba(53,199,216,.08)"/><text x="${px(lon) + 3}" y="${H - 6}" font-size="10" fill="rgba(169,180,196,.5)" font-family="PT Mono,monospace">${lon}°</text>`;
    for (const lat of [40, 50, 60]) grid += `<line x1="0" y1="${py(lat)}" x2="${W}" y2="${py(lat)}" stroke="rgba(53,199,216,.08)"/><text x="4" y="${py(lat) - 4}" font-size="10" fill="rgba(169,180,196,.5)" font-family="PT Mono,monospace">${lat}°N</text>`;
    const links = D.MAP.links.map((l, k) => {
      const a = P[l.from], b = P[l.to]; const mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 40 - Math.abs(a.x - b.x) * 0.08;
      return `<path id="lk${k}" d="M${a.x} ${a.y} Q${mx} ${my} ${b.x} ${b.y}" fill="none" stroke="${col[l.kind]}" stroke-width="2.4" stroke-dasharray="${dash[l.kind]}" opacity=".85"><title>${esc(l.label)}</title></path>
        ${reduced ? "" : `<circle r="4" fill="${col[l.kind]}"><animateMotion dur="${3 + k * 0.7}s" repeatCount="indefinite"><mpath href="#lk${k}"/></animateMotion></circle>`}`;
    }).join("");
    const cities = Object.values(P).map((p) => `<g class="city" data-id="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}">
      <circle cx="${p.x}" cy="${p.y}" r="18" fill="${col[p.kind]}" opacity=".12">${reduced ? "" : `<animate attributeName="r" values="10;22;10" dur="3s" repeatCount="indefinite"/>`}</circle>
      <circle class="c" cx="${p.x}" cy="${p.y}" r="6" fill="${col[p.kind]}" stroke="#07111F" stroke-width="2"/>
      <text x="${p.x + (LBL[p.id] || [10])[0]}" y="${p.y + (LBL[p.id] || [0, -10])[1]}" text-anchor="${(LBL[p.id] || [0, 0, "start"])[2]}" font-size="15" fill="#F5F5F5" font-family="Oswald,Arial Narrow,sans-serif" letter-spacing=".5">${esc(p.name)}</text></g>`).join("");
    const wrap = h(`<div class="${compact ? "grid" : "mapwrap"}" style="gap:14px"></div>`);
    const box = h(`<div class="mapbox glass"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Схемалық тарихи карта"><rect width="${W}" height="${H}" fill="#081424"/>${grid}${links}${cities}
      <text x="${W - 10}" y="20" text-anchor="end" font-size="11" fill="rgba(244,213,141,.6)" font-family="PT Mono,monospace">СХЕМАЛЫҚ КАРТА · МАСШТАБСЫЗ</text></svg>
      <div class="legend"><span><i style="border-color:#D4AF37"></i>Жарияланған дерек</span><span><i style="border-color:#35C7D8;border-top-style:dashed"></i>Түсіндірмелік модель</span><span><i style="border-color:#E8B04B;border-top-style:dotted"></i>Толық расталмаған</span></div></div>`);
    const info = h(`<div class="mapinfo glass"><span class="eyebrow">Нүктені таңдаңыз</span><p class="muted">Картадағы қаланы басыңыз. Әр байланыстың мәртебесі сызық түрімен белгіленген.</p></div>`);
    wrap.append(box, info);
    const sel = (id) => {
      const p = P[id];
      $$(".city", box).forEach((g) => g.classList.toggle("on", g.dataset.id === id));
      const rel = D.MAP.links.filter((l) => l.from === id || l.to === id);
      info.innerHTML = `<span class="eyebrow">${esc(p.name)}</span><h3 style="font-size:1.5rem">${esc(p.name)}</h3>${chip(p.kind)}<p>${esc(p.text)}</p>
        ${rel.length ? `<div class="grid" style="gap:6px">${rel.map((l) => `<span class="src">— ${esc(l.label)}</span>`).join("")}</div>` : ""}
        ${p.art && ART.A[p.art] ? `<div class="article map-article"><h4>${esc(ART.A[p.art].title)}</h4>${ART.A[p.art].body}</div>` : ""}`;
      beep(880, 0.05, 0.03);
    };
    $$(".city", box).forEach((g) => { g.addEventListener("click", () => sel(g.dataset.id)); g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sel(g.dataset.id); } }); });
    host.appendChild(wrap);
    const tp = h(`<div class="topics"></div>`);
    D.MAP.topics.forEach((t) => { const b = h(`<button class="topic"><b>${esc(t.t)}</b><p>${esc(t.d)}${t.art ? `<span class="more-link" data-art="${t.art}">Толық мақаланы оқу →</span>` : ""}</p></button>`); b.onclick = (e) => { if (!e.target.closest("[data-art]")) b.classList.toggle("open"); }; tp.appendChild(b); });
    host.appendChild(tp);
    if (compact) tp.style.gridTemplateColumns = "1fr";
  }
  renderMap($("#mapHost"));

  /* ================= ARCHIVE ================= */
  const cab = $("#cabinet"), docsHost = $("#docs");
  function docCard(dc) {
    const has = dc.file || dc.img || dc.video || dc.prompt;
    const el = h(`<article class="doc"><span class="avail y">${dc.file && D.FILES[dc.file] ? (D.FILES[dc.file].list ? D.FILES[dc.file].list.length : D.FILES[dc.file].pages) + " бет · сайтта ашылады" : "Сайтта ашылады"}</span>
      <h4>${esc(dc.t)}</h4><div class="meta">${esc(dc.a)} · ${esc(dc.y)}</div><p>${esc(dc.d)}</p><div class="meta">Дереккөз: ${esc(dc.s)}</div>
      <div class="cta" style="gap:8px"></div></article>`);
    const row = $(".cta", el);
    const btn = (t, fn, primary) => { const b = h(`<button class="btn small ${primary ? "" : "ghost"}">${t}</button>`); b.onclick = fn; row.appendChild(b); };
    if (dc.file) btn("Құжатты ашу", () => openDoc(dc.file), true);
    if (dc.video) btn("Видеоны көру", () => openVideo(dc.video), true);
    if (dc.img) btn("Суретті ашу", () => { const list = [{ src: dc.img, title: dc.t, cap: dc.d, ai: dc.ai }]; if (dc.img2) list.push({ src: dc.img2, title: dc.t, cap: dc.d }); openLightbox(list, 0); }, true);
    if (dc.n) btn("Толық сипаттама", () => openSource(dc.n), true);
    if (!dc.n && !has && !dc.art) btn("Толық сипаттама", () => openSourceCard({ t: dc.t, a: dc.a, y: dc.y, about: dc.about || dc.d, use: dc.use, st: dc.st || "mod" }), true);
    if (dc.art) btn(dc.prompt ? "Промпт және әдістеме" : (has ? "Мақаланы оқу" : "Толық мақала"), () => openArticle(dc.art), !has);
    return el;
  }
  function openDrawer(i) {
    const c = D.ARCHIVE[i];
    $$(".drawer", cab).forEach((d, k) => d.classList.toggle("on", k === i));
    docsHost.innerHTML = "";
    beep(220, 0.1, 0.04);
    const head = h(`<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;margin-top:26px"><span class="eyebrow">${c.id}</span><h3 style="font-size:1.6rem">${esc(c.name)}</h3></div>`);
    docsHost.appendChild(head);
    if (c.sources) {
      const ol = h(`<ol class="srclist" style="margin-top:16px"></ol>`);
      D.SOURCES.forEach((s) => ol.appendChild(h(`<li><span class="n">[${s.n}]</span><button class="linkish" data-src="${s.n}">${esc(s.author)} ${esc(s.title)} // ${esc(s.pub)}</button></li>`)));
      docsHost.appendChild(ol);
      return;
    }
    const g = h(`<div class="docs"></div>`);
    c.docs.forEach((dc) => g.appendChild(docCard(dc)));
    docsHost.appendChild(g);
  }
  D.ARCHIVE.forEach((c, i) => {
    const n = c.sources ? D.SOURCES.length : c.docs.length;
    const b = h(`<button class="drawer"><span class="num">${c.id}</span><span class="nm">${esc(c.name)}</span><span class="cnt">${n} файл</span><span class="handle"></span></button>`);
    b.onclick = () => openDrawer(i);
    cab.appendChild(b);
  });
  openDrawer(0);

  /* ================= CIPHER LAB ================= */
  const ALPH = "А Ә Б В Г Ғ Д Е Ё Ж З И Й К Қ Л М Н Ң О Ө П Р С Т У Ұ Ү Ф Х Һ Ц Ч Ш Щ Ъ Ы І Ь Э Ю Я".split(" ");
  const shiftW = (w, k) => w.split("").map((ch) => { const i = ALPH.indexOf(ch); return i < 0 ? ch : ALPH[(i + k + ALPH.length * 4) % ALPH.length]; }).join("");
  const norm = (s) => s.toUpperCase().replace(/Ё/g, "Ё").replace(/[^А-ЯЁӘҒҚҢӨҰҮҺІ]/g, "");
  const L1 = ["ЕРЛІК", "ШИФР", "АРХИВ", "ТАРИХ", "ДЕРЕК", "БАРЛАУ"];
  const L2 = ["ХАБАР ЖЕТТІ", "БАЙЛАНЫС ОРНАДЫ", "МӘСКЕУГЕ ЖЕТКІЗ"];
  const LV = [
    { n: 1, name: "Құпия сөз", pts: 10, diff: "Жеңіл" },
    { n: 2, name: "Радиограмма", pts: 20, diff: "Орта" },
    { n: 3, name: "Құпия операция", pts: 30, diff: "Күрделі" }
  ];
  const CG = $("#cipherGame");
  let cgLevel = S.cipher.level || 1;
  let cgWord1 = L1[(Math.random() * L1.length) | 0], cgWord2 = L2[(Math.random() * L2.length) | 0];
  const total = () => Object.values(S.cipher.pts).reduce((a, b) => a + b, 0);
  function cgRender() {
    CG.innerHTML = "";
    const tabs = h(`<div class="tabs" role="tablist"></div>`);
    LV.forEach((l) => {
      const b = h(`<button class="tab ${cgLevel === l.n ? "on" : ""}" role="tab">${l.n}-деңгей · ${esc(l.name)}<span class="pts">${S.cipher.pts[l.n] ? "✓ " + S.cipher.pts[l.n] : l.pts}</span></button>`);
      b.onclick = () => { cgLevel = l.n; S.cipher.level = l.n; save(); cgRender(); };
      tabs.appendChild(b);
    });
    const res = h(`<button class="tab ${cgLevel === 4 ? "on" : ""}">Жалпы нәтиже</button>`);
    res.onclick = () => { cgLevel = 4; cgRender(); };
    tabs.appendChild(res);
    CG.appendChild(tabs);
    CG.appendChild(h(`<div class="scorebar"><span>${cgLevel <= 3 ? `${LV[cgLevel - 1].diff} деңгей · дұрыс жауап – ${LV[cgLevel - 1].pts} ұпай` : "Шифрлау зертханасы"}</span><span>Ұпай: <span class="score">${total()}</span> / 60</span></div>`));
    const body = h(`<div class="grid" style="gap:16px"></div>`);
    CG.appendChild(body);
    if (cgLevel === 1) level1(body); else if (cgLevel === 2) level2(body); else if (cgLevel === 3) level3(body); else results(body);
  }
  function award(n, pts) { if (!S.cipher.pts[n]) { S.cipher.pts[n] = pts; save(); return true; } return false; }
  function nextBtns(n) {
    const w = h(`<div class="cta"></div>`);
    if (n < 3) { const b = h(`<button class="btn primary">Келесі деңгей ›</button>`); b.onclick = () => { cgLevel = n + 1; S.cipher.level = cgLevel; save(); cgRender(); }; w.appendChild(b); }
    const r = h(`<button class="btn">Жалпы нәтиже</button>`); r.onclick = () => { cgLevel = 4; cgRender(); }; w.appendChild(r);
    return w;
  }
  function answerRow(id, ph, onCheck) {
    const row = h(`<form class="input-row"><input id="${id}" autocomplete="off" spellcheck="false" placeholder="${ph}" aria-label="Жауап"><button class="btn primary" type="submit">Тексеру</button></form>`);
    row.addEventListener("submit", (e) => { e.preventDefault(); onCheck($("input", row).value); });
    return row;
  }
  function level1(body) {
    const enc = shiftW(cgWord1, 2);
    body.innerHTML = `<div><span class="eyebrow">Нұсқаулық</span><p style="margin-top:8px">Қарапайым алмастыру шифры: әр әріп қазақ алфавитінде <b>2 орын алға</b> жылжытылған (А → Б-ның орнына В, Ә → Б…). Шешу үшін әр әріпті кестеден тауып, <b>2 орын артқа</b> жылжытыңыз.</p></div>
      <div class="cipher-text" aria-label="Шифрланған сөз">${enc}</div>
      <div class="alpha">${ALPH.map((a, i) => `<div><b>${a}</b><span>${i + 1}</span></div>`).join("")}</div>`;
    const fb = h(`<div aria-live="polite"></div>`);
    const row = answerRow("c1in", "Шешілген сөз", (v) => {
      const a = norm(v);
      if (!a) { fb.innerHTML = `<p class="fb info">Жауапты енгізіңіз.</p>`; return; }
      if (a === cgWord1) {
        const got = award(1, 10); beep(988, 0.15);
        fb.innerHTML = `<p class="fb ok">Дұрыс! <b>${cgWord1}</b>. ${got ? "+10 ұпай." : "Бұл деңгейдің ұпайы бұрын алынған."}</p>`;
        fb.appendChild(nextBtns(1)); updScore();
      } else {
        let right = 0; for (let i = 0; i < Math.min(a.length, cgWord1.length); i++) if (a[i] === cgWord1[i]) right++;
        beep(180, 0.2);
        fb.innerHTML = `<p class="fb no">Қате. ${right} әріп өз орнында дұрыс. Кестеге қайта қарап, әр әріпті дәл 2 орын артқа жылжытыңыз. Мысалы, шифрдағы «${enc[0]}» → «${cgWord1[0]}».</p>`;
      }
    });
    const other = h(`<button class="btn small ghost">Басқа сөз</button>`);
    other.onclick = () => { let w; do { w = L1[(Math.random() * L1.length) | 0]; } while (w === cgWord1); cgWord1 = w; cgRender(); };
    body.append(row, fb, other);
  }
  function level2(body) {
    const nums = cgWord2.split(" ").map((w) => w.split("").map((c) => ALPH.indexOf(c) + 1).join("-")).join(" / ");
    body.innerHTML = `<div><span class="eyebrow">Нұсқаулық</span><p style="margin-top:8px">Радиостанция шартты сандық хабар қабылдайды. <b>Кілт:</b> әр сан – әріптің алфавиттегі реттік нөмірі. «/» белгісі сөздерді бөледі. Алдымен қабылдағышты қосыңыз.</p></div>`;
    const rs = h(`<div class="radio-set"><div class="radio-face"><span class="led"></span><span class="dial"></span></div><div class="grid" style="gap:10px"><canvas class="osc"></canvas><div class="cipher-text" style="font-size:clamp(1rem,2.6vw,1.4rem);letter-spacing:.12em;min-height:1.6em" aria-live="polite">— — —</div><button class="btn small">📻 Қабылдағышты қосу</button></div></div>`);
    body.appendChild(rs);
    body.appendChild(h(`<div class="alpha">${ALPH.map((a, i) => `<div><b>${a}</b><span>${i + 1}</span></div>`).join("")}</div>`));
    const out = $(".cipher-text", rs), btn = $("button", rs), face = $(".radio-face", rs), osc = $("canvas", rs);
    let on = false, raf = 0;
    const drawOsc = (t) => {
      const c = osc.getContext("2d"), w = osc.width = osc.clientWidth, hh = osc.height = 64;
      c.clearRect(0, 0, w, hh); c.strokeStyle = "#35C7D8"; c.lineWidth = 2; c.beginPath();
      for (let x = 0; x < w; x++) { const y = hh / 2 + (on ? Math.sin(x * 0.08 + t * 0.012) * 14 * Math.sin(x * 0.01 + t * 0.002) + (Math.random() - 0.5) * 6 : 0); x ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke(); if (on && document.body.contains(osc)) raf = requestAnimationFrame(drawOsc);
    };
    drawOsc(0);
    btn.onclick = () => {
      if (on) return; on = true; face.classList.add("on"); btn.disabled = true; raf = requestAnimationFrame(drawOsc);
      out.textContent = ""; const parts = nums.split(""); let i = 0;
      const tick = () => { if (!document.body.contains(out)) return; out.textContent += parts[i]; if (/\d/.test(parts[i])) beep(700 + Math.random() * 200, 0.04, 0.03); i++; if (i < parts.length) setTimeout(tick, 70); else { on = false; face.classList.remove("on"); btn.disabled = false; btn.textContent = "📻 Қайта тыңдау"; } };
      tick();
    };
    const fb = h(`<div aria-live="polite"></div>`);
    const row = answerRow("c2in", "Хабардың мәтіні", (v) => {
      const a = norm(v);
      if (!a) { fb.innerHTML = `<p class="fb info">Алдымен хабарды қабылдап, мәтінді енгізіңіз.</p>`; return; }
      if (a === norm(cgWord2)) {
        const got = award(2, 20); beep(988, 0.15);
        fb.innerHTML = `<p class="fb ok">Дұрыс! «${cgWord2}». ${got ? "+20 ұпай." : "Бұл деңгейдің ұпайы бұрын алынған."} Шифрлаушы мұндай хабарды бір қатесіз шешуі керек еді: бір әріптің өзгеруі мағынаны бұзады.</p>`;
        fb.appendChild(nextBtns(2)); updScore();
      } else {
        beep(180, 0.2);
        const words = cgWord2.split(" "), first = words[0];
        fb.innerHTML = `<p class="fb no">Қате. Әр санды кестеден тексеріңіз: мысалы, ${ALPH.indexOf(first[0]) + 1} → «${first[0]}». Хабарда ${words.length} сөз, ${norm(cgWord2).length} әріп бар.</p>`;
      }
    });
    const other = h(`<button class="btn small ghost">Басқа хабар</button>`);
    other.onclick = () => { let w; do { w = L2[(Math.random() * L2.length) | 0]; } while (w === cgWord2); cgWord2 = w; cgRender(); };
    body.append(row, fb, other);
  }
  function level3(body) {
    body.innerHTML = `<div><span class="eyebrow">Нұсқаулық</span><p style="margin-top:8px">Үш станциядан шешілген шартты хабарлар келді. Оларды салыстырып, логикалық қорытынды жасаңыз. <span class="muted">(Оқу тапсырмасы, ойдан құрастырылған.)</span></p></div>
      <div class="msgs3"><div class="tele"><b>Станция «Альфа»</b>Жүк сейсенбі күні жетпейді. Өзендегі көпір жабық.</div>
      <div class="tele"><b>Станция «Бета»</b>Көпір жабылса, жүк солтүстік жолмен бейсенбі күні жетеді.</div>
      <div class="tele"><b>Станция «Гамма»</b>Солтүстік жолда тек түнде қозғалуға болады.</div></div>
      <p><b>Сұрақ:</b> Жүк қашан жетеді?</p>`;
    const opts = [
      { t: "Сейсенбі күні, күндіз", ok: false, e: "«Альфа» станциясы жүктің сейсенбі күні жетпейтінін хабарлайды." },
      { t: "Бейсенбі күні, түнде", ok: true, e: "Көпір жабық (Альфа) → жүк солтүстік жолмен бейсенбі күні жетеді (Бета) → ол жолда тек түнде жүруге болады (Гамма)." },
      { t: "Бейсенбі күні, күндіз", ok: false, e: "Күн дұрыс, бірақ «Гамма» станциясы солтүстік жолда тек түнде қозғалуға болатынын айтады." },
      { t: "Жұма күні, таңертең", ok: false, e: "Бұл мәлімет ешбір хабарда жоқ. Шифрлаушы деректе жоқ ақпаратты қоспайды." }
    ];
    const box = h(`<div class="opts"></div>`), fb = h(`<div aria-live="polite"></div>`);
    opts.forEach((o) => {
      const b = h(`<button class="opt">${esc(o.t)}</button>`);
      b.onclick = () => {
        $$(".opt", box).forEach((x) => x.classList.remove("wrong"));
        if (o.ok) {
          b.classList.add("right"); $$(".opt", box).forEach((x) => x.disabled = true);
          const got = award(3, 30); beep(988, 0.15);
          fb.innerHTML = `<p class="fb ok">Дұрыс шешім! ${esc(o.e)} ${got ? "+30 ұпай." : "Бұл деңгейдің ұпайы бұрын алынған."}</p>`;
          fb.appendChild(nextBtns(3)); updScore();
        } else { b.classList.add("wrong"); beep(180, 0.2); fb.innerHTML = `<p class="fb no">Қате. ${esc(o.e)} Қайта ойланып көріңіз.</p>`; }
      };
      box.appendChild(b);
    });
    body.append(box, fb);
  }
  function results(body) {
    const t = total();
    const rank = t >= 60 ? "Шебер шифрлаушы" : t >= 30 ? "Шифрлаушы-шәкірт" : t > 0 ? "Жас радист" : "Әлі бастамадыңыз";
    body.innerHTML = `<div class="award"><div class="medal">${t}</div><h3>${rank}</h3><p class="muted">${LV.map((l) => `${l.n}-деңгей: ${S.cipher.pts[l.n] ? "✓ " + S.cipher.pts[l.n] : "0"} / ${l.pts}`).join(" · ")}</p><p style="max-width:56ch">Ақжібек сияқты шифрлаушылардың жұмысы – дәлдік, зейін және жауапкершілік. Бір қате әріп бүкіл хабардың мағынасын өзгертуі мүмкін еді.</p></div>`;
    const again = h(`<div class="cta" style="justify-content:center"><button class="btn primary">Қайта ойнау</button></div>`);
    $("button", again).onclick = () => { S.cipher = { pts: {}, level: 1 }; save(); cgLevel = 1; cgRender(); };
    body.appendChild(again);
  }
  function updScore() { const s = $(".score", CG); if (s) s.textContent = total(); $$(".tab .pts", CG).forEach((p, i) => { if (LV[i] && S.cipher.pts[LV[i].n]) p.textContent = "✓ " + S.cipher.pts[LV[i].n]; }); }
  cgRender();

  /* ================= DETECTIVE ================= */
  const DG = $("#detGame");
  let detTab = S.det.tab || 1;
  function detRender() {
    DG.innerHTML = "";
    const tabs = h(`<div class="tabs"></div>`);
    [["Дерек пе, болжам ба?", 1], ["Жоғалған хронология", 2], ["Архивтік тергеу", 3]].forEach(([t, n]) => {
      const b = h(`<button class="tab ${detTab === n ? "on" : ""}">${n}-ойын · ${t}</button>`);
      b.onclick = () => { detTab = n; S.det.tab = n; save(); detRender(); };
      tabs.appendChild(b);
    });
    DG.appendChild(tabs);
    const body = h(`<div class="grid" style="gap:16px"></div>`); DG.appendChild(body);
    if (detTab === 1) factGame(body); else if (detTab === 2) chronoGame(body); else invGame(body);
  }
  function factGame(body) {
    const st = S.det.fact = S.det.fact || { i: 0, ok: 0, done: [] };
    const N = D.FACT_GAME.length;
    if (st.i >= N) {
      body.innerHTML = `<div class="award"><div class="medal">${st.ok}/${N}</div><h3>${st.ok === N ? "Дерекпен жұмыстың шебері" : "Жақсы нәтиже!"}</h3><p class="muted" style="max-width:56ch">Ғылыми ереже: бірнеше дереккөзде қайталанатын мәлімет – зерттеудің өзегі; бір ғана жарияланымдағы мәлімет – сақтықпен; құжат жоқ жерде – белгісіздікті сақтау.</p></div>`;
      const a = h(`<div class="cta" style="justify-content:center"><button class="btn primary">Қайта ойнау</button></div>`);
      $("button", a).onclick = () => { S.det.fact = null; save(); detRender(); };
      body.appendChild(a); return;
    }
    const q = D.FACT_GAME[st.i];
    body.innerHTML = `<div class="scorebar"><span>Тұжырым ${st.i + 1} / ${N}</span><span>Дұрыс: <span class="score">${st.ok}</span></span></div><div class="progress"><i style="width:${(st.i / N) * 100}%"></i></div>
      <div class="fact-card">«${esc(q.s)}»</div><p class="muted">Бұл тұжырым қай санатқа жатады?</p>`;
    const cats = h(`<div class="cat3"></div>`), fb = h(`<div aria-live="polite"></div>`);
    [["pub", "Жарияланған дерек"], ["unc", "Толық расталмаған мәлімет"], ["ins", "Дерек жеткіліксіз"]].forEach(([k, t]) => {
      const b = h(`<button class="${D.STATUS[k].cls}">${t}</button>`);
      b.onclick = () => {
        $$("button", cats).forEach((x) => x.disabled = true);
        const ok = k === q.a; if (ok) st.ok++; st.i++; save();
        beep(ok ? 988 : 180, 0.15);
        fb.innerHTML = `<p class="fb ${ok ? "ok" : "no"}"><b>${ok ? "Дұрыс." : "Қате."}</b> Дұрыс санат: «${D.STATUS[q.a].label}». ${esc(q.e)}</p>`;
        const n = h(`<div class="cta"><button class="btn primary">${st.i >= N ? "Нәтижені көру" : "Келесі тұжырым ›"}</button></div>`);
        $("button", n).onclick = () => detRender();
        fb.appendChild(n);
        $(".score", body).textContent = st.ok;
      };
      cats.appendChild(b);
    });
    body.append(cats, fb);
  }
  function makeSortable(ul, onChange) {
    let drag = null, startY = 0, pid = null;
    ul.addEventListener("pointerdown", (e) => {
      const li = e.target.closest("li"); if (!li || e.target.closest("button")) return;
      drag = li; startY = e.clientY; pid = e.pointerId; li.classList.add("drag");
      try { li.setPointerCapture(pid); } catch (er) {}
      e.preventDefault();
    });
    ul.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== pid) return;
      let dy = e.clientY - startY;
      const nx = drag.nextElementSibling, pv = drag.previousElementSibling;
      if (nx && dy > nx.offsetHeight / 2 + 4) { ul.insertBefore(nx, drag); startY += nx.offsetHeight + 8; dy = e.clientY - startY; }
      else if (pv && dy < -(pv.offsetHeight / 2 + 4)) { ul.insertBefore(drag, pv); startY -= pv.offsetHeight + 8; dy = e.clientY - startY; }
      drag.style.transform = `translateY(${dy}px)`;
    });
    const end = () => { if (!drag) return; drag.style.transform = ""; drag.classList.remove("drag"); drag = null; onChange && onChange(); };
    ul.addEventListener("pointerup", end); ul.addEventListener("pointercancel", end); ul.addEventListener("lostpointercapture", end);
    ul.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-mv]"); if (!b) return;
      const li = b.closest("li");
      if (b.dataset.mv === "up" && li.previousElementSibling) ul.insertBefore(li, li.previousElementSibling);
      if (b.dataset.mv === "down" && li.nextElementSibling) ul.insertBefore(li.nextElementSibling, li);
      onChange && onChange(); b.focus();
    });
  }
  function chronoGame(body) {
    body.innerHTML = `<p>Оқиғаларды сүйреп, дұрыс хронологиялық ретке қойыңыз (телефонда саусақпен сүйреңіз немесе ▲▼ батырмаларын қолданыңыз). Сосын «Тексеру» батырмасын басыңыз.</p>`;
    const items = shuffle(D.CHRONO_GAME.map((x, i) => ({ ...x, i })));
    const ul = h(`<ul class="sortlist"></ul>`);
    const renumber = () => $$("li", ul).forEach((li, k) => { $(".grip", li).textContent = k + 1; li.classList.remove("ok", "no"); });
    items.forEach((it) => ul.appendChild(h(`<li data-i="${it.i}"><span class="grip"></span><span>${esc(it.t)}<span class="yr src" hidden> · ${esc(it.y)}</span></span><span class="mv"><button data-mv="up" aria-label="Жоғары">▲</button><button data-mv="down" aria-label="Төмен">▼</button></span></li>`)));
    renumber();
    makeSortable(ul, renumber);
    const fb = h(`<div aria-live="polite"></div>`);
    const ctr = h(`<div class="cta"><button class="btn primary">Тексеру</button><button class="btn">Араластыру</button></div>`);
    const [chk, mix] = $$("button", ctr);
    chk.onclick = () => {
      let ok = 0;
      $$("li", ul).forEach((li, k) => { const good = +li.dataset.i === k; li.classList.toggle("ok", good); li.classList.toggle("no", !good); if (good) ok++; });
      const all = ok === D.CHRONO_GAME.length;
      if (all) { $$(".yr", ul).forEach((y) => y.hidden = false); S.det.chrono = true; save(); beep(988, 0.15); }
      else beep(180, 0.2);
      fb.innerHTML = all ? `<p class="fb ok"><b>Хронология қалпына келтірілді!</b> 1919 → 1940 → 1941 → 1942 → 1945 → ?. Соңғы кезең – сұрақ белгісі: кейінгі тағдыры архивтік зерттеуді қажет етеді.</p>`
        : `<p class="fb no">${ok} оқиға өз орнында. Қызыл белгіленгендерді жылжытып, қайта тексеріңіз. Кеңес: білім → қызмет → тұтқындау → лагерь туралы мәлімет.</p>`;
    };
    mix.onclick = () => chronoGame((body.innerHTML = "", body));
    body.append(ul, ctr, fb);
  }
  function invGame(body) {
    const st = S.det.inv = S.det.inv || { i: 0 };
    const N = D.INVESTIGATION.length;
    if (st.i >= N) {
      body.innerHTML = `<div class="award"><div class="medal">★</div><span class="eyebrow" style="justify-content:center">Виртуалды марапат</span><h3 style="font-size:clamp(1.6rem,4vw,2.4rem)">ЖАС ТАРИХ ЗЕРТТЕУШІСІ</h3><p class="muted" style="max-width:52ch">Сіз ${N} құжатты салыстырып, әр деректің мәртебесін дұрыс анықтадыңыз. Тарихтағы белгісіздік – жаңа зерттеудің бастамасы.</p></div>`;
      const a = h(`<div class="cta" style="justify-content:center"><button class="btn primary">Қайта бастау</button></div>`);
      $("button", a).onclick = () => { S.det.inv = null; save(); detRender(); };
      body.appendChild(a); return;
    }
    const q = D.INVESTIGATION[st.i];
    body.innerHTML = `<div class="scorebar"><span>Құжат ${st.i + 1} / ${N}</span><span>Ашылған: ${st.i}</span></div><div class="progress"><i style="width:${(st.i / N) * 100}%"></i></div>
      <div class="docpaper reveal"><b>${esc(q.doc)}</b>${esc(q.text)}</div><p><b>Зерттеу сұрағы:</b> ${esc(q.q)}</p>`;
    const box = h(`<div class="opts"></div>`), fb = h(`<div aria-live="polite"></div>`);
    q.o.forEach((o, k) => {
      const b = h(`<button class="opt">${esc(o)}</button>`);
      b.onclick = () => {
        $$(".opt", box).forEach((x) => x.classList.remove("wrong"));
        if (k === q.a) {
          b.classList.add("right"); $$(".opt", box).forEach((x) => x.disabled = true); beep(988, 0.15);
          fb.innerHTML = `<p class="fb ok"><b>Дұрыс.</b> ${esc(q.e)}</p>`;
          const n = h(`<div class="cta"><button class="btn primary">${st.i + 1 >= N ? "Марапатты алу ★" : "Келесі құжатты ашу ›"}</button></div>`);
          $("button", n).onclick = () => { st.i++; save(); detRender(); };
          fb.appendChild(n);
        } else { b.classList.add("wrong"); beep(180, 0.2); fb.innerHTML = `<p class="fb no">Қате. Құжаттың мәтініне қайта қараңыз: онда не айтылған, не айтылмаған?</p>`; }
      };
      box.appendChild(b);
    });
    body.append(box, fb);
  }
  detRender();

  /* ================= AI ================= */
  function renderAlgo(host) {
    const row = h(`<div class="algo" role="tablist"></div>`), det = h(`<div class="algo-detail glass"></div>`);
    const sel = (i) => {
      $$("button", row).forEach((b, k) => b.classList.toggle("on", k === i));
      const a = D.ALGO[i];
      det.innerHTML = `<div class="im"><img src="${a.img}" alt="${esc(a.k)}">${a.ai ? `<div class="ai-note">${esc(D.AI_NOTE)}</div>` : ""}</div>
        <dl class="reveal"><dt>Кезеңнің мақсаты</dt><dd>${esc(a.goal)}</dd><dt>Қолданылған әдіс</dt><dd>${esc(a.method)}</dd><dt>Орындалған жұмыс</dt><dd>${esc(a.done)}</dd><dt>Алынған нәтиже</dt><dd>${esc(a.result)}</dd>
        <dd class="cta" style="margin-top:6px">${a.video ? `<button class="btn small primary" data-video="${a.video}">▶ Видеоны көру</button>` : ""}<button class="btn small" data-art="aimethod">Толық оқу</button></dd></dl>`;
      $(".im img", det).onclick = () => openLightbox([{ src: a.img, title: a.k, cap: a.result, ai: a.ai }], 0);
      $(".im img", det).style.cursor = "zoom-in";
    };
    D.ALGO.forEach((a, i) => { const b = h(`<button role="tab">${esc(a.k)}</button>`); b.onclick = () => sel(i); row.appendChild(b); });
    host.append(row, det); sel(0);
  }
  renderAlgo($("#algoHost"));
  function renderCompare(host) {
    const c = h(`<div class="compare"><div class="layer data"><h4>Тарихи деректер мен сипаттама (промпт негізі)</h4><ul>
      <li>1940-жылдар · Мәскеу</li><li>Жас қазақ әйел маман, 20–22 жас</li><li>ММУ механика-математика түлегі</li><li>Әскери шифрлау бөлімі</li><li>Дәуірге сай қарапайым киім</li><li>Қағаз құжаттар, шифрланған хабарлар</li><li>Заманауи заттарсыз, деректі фильм эстетикасы</li></ul>
      <p style="margin-top:6px">Түпнұсқа фото: <b>жоқ</b></p></div>
      <div class="layer vis"><img src="ai-face-wide.jpg" alt="ЖИ реконструкциясы"><div class="ai-note">${esc(D.AI_NOTE)}</div></div>
      <div class="handle"></div><input type="range" min="0" max="100" value="50" aria-label="Салыстыру сырғытпасы"></div>`);
    const vis = $(".vis", c), hd = $(".handle", c), rg = $("input", c);
    const set = (v) => { vis.style.clipPath = `inset(0 0 0 ${v}%)`; hd.style.left = v + "%"; };
    rg.addEventListener("input", () => set(rg.value)); set(50);
    const steps = h(`<div class="cta"><button class="btn small">1 · Деректер</button><button class="btn small">2 · Промпт</button><button class="btn small">3 · Визуал</button></div>`);
    const [b1, b2, b3] = $$("button", steps);
    const anim = (to) => { const from = +rg.value; const t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / 600); const v = from + (to - from) * (1 - Math.pow(1 - k, 3)); rg.value = v; set(v); if (k < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); };
    b1.onclick = () => anim(100); b2.onclick = () => anim(50); b3.onclick = () => anim(0);
    host.append(c, steps);
  }
  renderCompare($("#compareHost"));
  $("#promptBox").innerHTML = `${esc(D.PROMPT.main)}<br><br><span class="neg">Negative prompt: ${esc(D.PROMPT.negative)}</span>`;
  $("#promptTable").innerHTML = `<tr><th>Промпт құрамдасы</th><th>Мазмұны</th><th>Мақсаты</th></tr>` + D.PROMPT.parts.map((p) => `<tr><td>${esc(p[0])}</td><td>${esc(p[1])}</td><td>${esc(p[2])}</td></tr>`).join("");
  const AIIMG = [
    { src: "ai-face-wide.jpg", title: "Портрет", ai: true, cap: "Негізгі тарихи-көркем реконструкция (жобаның 2-суреті)." },
    { src: "ai-study.jpg", title: "Оқу жылдары", ai: true, cap: "Бейнеден кадр: ММУ механика-математика факультеті." },
    { src: "ai-radio.jpg", title: "Шифрлау қызметі", ai: true, cap: "Бейнеден кадр: радиограммаларды қабылдау." },
    { src: "ai-cell.jpg", title: "1942", ai: true, cap: "Бейнеден кадр: тұтқындалу кезеңінің символдық бейнесі." },
    { src: "slide-panels.jpg", title: "Семинар слайды", ai: true, cap: "Ақжібек туралы ЖИ визуалдары бар презентация слайды." },
    { src: "slide-step4.jpg", title: "Төртінші қадам", cap: "Мәтін → промпт → сурет: визуал дайындау кезеңі (слайд)." },
    { src: "slide-step5.jpg", title: "Бесінші қадам", cap: "Сурет → видео → біріктіру: монтаж кезеңі (слайд)." },
    { src: "slide-steps3.jpg", title: "Алғашқы 3 қадам", cap: "Тақырып, тарихи дерек жинау, сценарий (слайд)." }
  ];
  const ag = $("#aiGrid");
  AIIMG.forEach((it, i) => {
    const f = h(`<figure><img loading="lazy" src="${it.src.replace(".jpg", "-t.jpg")}" alt="${esc(it.title)}">${it.ai ? `<figcaption class="ai-note">ЖИ реконструкциясы · түпнұсқа фото емес</figcaption>` : ""}</figure>`);
    f.onclick = () => openLightbox(AIIMG, i);
    ag.appendChild(f);
  });

  /* ================= DIARY ================= */
  const book = $("#book");
  let pg = 0, flipping = false;
  function pageHTML(i) {
    const p = D.DIARY_PAGES[i];
    const ents = p.entries.map((k) => { const e = D.DIARY_ENTRIES[k]; return `<div class="entry"><span class="dt">${e[0]}</span><span>${esc(e[1])}</span><span class="r">${esc(e[2])} → ${esc(e[3])}</span></div>`; }).join("");
    const extra = i === 7 ? `<div class="entry"><span class="dt">Промпт</span><span>${esc(D.PROMPT.main.slice(0, 150))}…</span></div>` :
      i === 3 ? `<p style="margin-top:12px;font-style:italic">Тексеру: ЖИ тек визуализация құралы ретінде қолданылады; тарихи дәлдікке мұғалім жауап береді.</p>` : "";
    return `<div class="page l"><span class="ch">${i + 1}-бөлім</span><h3>${esc(p.t)}</h3><p>${esc(p.body)}</p><span class="pn">${i * 2 + 1}</span></div>
      <div class="page r"><span class="ch">Күнделік жазбалары</span>${ents || `<p style="margin-top:14px;color:#5b4a33">Бұл бөлім жобаның негізгі мәтінінен алынды; жеке күнделік жазбасы жоқ.</p>`}${extra}<span class="pn">${i * 2 + 2}</span></div>`;
  }
  function renderBook() {
    book.innerHTML = `<div class="book-inner" id="bookInner">${pageHTML(pg)}</div>
      <div class="book-ctrl"><button class="btn small" id="bkPrev" ${pg === 0 ? "disabled" : ""}>‹ Алдыңғы бет</button><span class="pg">${pg + 1} / ${D.DIARY_PAGES.length}</span><button class="btn small" id="bkNext" ${pg === D.DIARY_PAGES.length - 1 ? "disabled" : ""}>Келесі бет ›</button></div>
      <div class="cta" style="justify-content:center;margin-top:10px;gap:6px">${D.DIARY_PAGES.map((p, i) => `<button class="tab ${i === pg ? "on" : ""}" data-pg="${i}" style="padding:6px 10px;font-size:.68rem">${i + 1}</button>`).join("")}</div>`;
    $("#bkPrev").onclick = () => turn(pg - 1); $("#bkNext").onclick = () => turn(pg + 1);
    $$("[data-pg]", book).forEach((b) => b.onclick = () => turn(+b.dataset.pg));
  }
  function turn(to) {
    if (flipping || to < 0 || to >= D.DIARY_PAGES.length || to === pg) return;
    const inner = $("#bookInner");
    if (reduced) { pg = to; renderBook(); return; }
    flipping = true;
    const f = h(`<div class="flip ${to < pg ? "back" : ""}"></div>`);
    inner.appendChild(f); beep(300, 0.05, 0.02);
    setTimeout(() => { pg = to; const keep = f; renderBook(); $("#bookInner").appendChild(keep); }, 330);
    setTimeout(() => { flipping = false; $$(".flip", book).forEach((x) => x.remove()); }, 720);
  }
  renderBook();
  let bsx = null;
  book.addEventListener("touchstart", (e) => { bsx = e.touches[0].clientX; }, { passive: true });
  book.addEventListener("touchend", (e) => { if (bsx == null) return; const dx = e.changedTouches[0].clientX - bsx; bsx = null; if (Math.abs(dx) > 60) turn(pg + (dx < 0 ? 1 : -1)); });
  $("#howBtn").addEventListener("click", () => {
    const host = $("#howHost");
    host.innerHTML = `<div class="sec-head" style="margin:36px 0 0"><span class="eyebrow">Зерттеу қалай жүргізілді?</span></div><div class="how">${D.HOW_STAGES.map((s, i) => `<div class="st" style="animation-delay:${i * 0.45}s"><span class="p">${esc(s.p)}</span><span class="ln" style="animation-delay:${i * 0.45 + 0.3}s"></span><div><b>${esc(s.t)}</b><p class="d">${esc(s.d)}</p></div></div>`).join("")}</div>`;
    host.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  });
  $("#allEntries").addEventListener("click", (e) => {
    const host = $("#entriesHost");
    if (host.innerHTML) { host.innerHTML = ""; e.target.textContent = "Барлық 41 жазба"; return; }
    e.target.textContent = "Кестені жасыру";
    host.innerHTML = `<div class="table-wrap" style="max-height:560px"><table><tr><th>№</th><th>Күні</th><th>Не істелді?</th><th>Әдіс-тәсілдер</th><th>Нәтиже</th></tr>${D.DIARY_ENTRIES.map((r, i) => `<tr><td>${i + 1}</td><td class="dt">${r[0]}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join("")}</table></div>`;
  });

  /* ================= VIDEOS ================= */
  const vids = $("#vids");
  D.VIDEOS.forEach((v) => {
    const b = h(`<button class="vc"><div class="th"><img loading="lazy" src="${v.poster}" alt=""><span class="cat chip st-mod" style="background:rgba(7,17,31,.75)">${esc(v.cat)}</span><span class="play"><i></i></span><span class="dur">${fmt(v.dur)}</span></div>
      <div class="tx"><b>${esc(v.t)}</b><span>${esc(v.d)}</span>${v.ai ? `<span class="src" style="color:var(--gold2)">ЖИ реконструкциясы · түпнұсқа фото емес</span>` : ""}</div></button>`);
    b.onclick = () => openVideo(v.id);
    vids.appendChild(b);
  });

  /* ================= GALLERY ================= */
  const fl = $("#filters"), ms = $("#masonry");
  let gcat = "all";
  function renderGallery() {
    fl.innerHTML = "";
    D.GALLERY_CATS.forEach(([k, t]) => {
      const n = k === "all" ? D.GALLERY.length : D.GALLERY.filter((g) => g.cats.includes(k)).length;
      const b = h(`<button class="tab ${gcat === k ? "on" : ""}">${esc(t)} <span class="pts">${n}</span></button>`);
      b.onclick = () => { gcat = k; renderGallery(); };
      fl.appendChild(b);
    });
    const list = D.GALLERY.filter((g) => gcat === "all" || g.cats.includes(gcat));
    ms.innerHTML = "";
    if (!list.length) { ms.appendChild(h(`<p class="empty" style="column-span:all">Бұл санатқа әзірге фотосурет жүктелмеген. Жоба қорғаудың суреттері қосылған кезде осы жерде көрсетіледі.</p>`)); return; }
    const lb = list.map((g) => ({ src: `${g.f}.jpg`, cap: g.c, title: "Жетістіктер" }));
    list.forEach((g, i) => {
      const f = h(`<figure><img loading="lazy" src="${g.f}-t.jpg" alt="${esc(g.c)}"><figcaption>${esc(g.c)}</figcaption></figure>`);
      f.onclick = () => openLightbox(lb, i);
      ms.appendChild(f);
    });
  }
  renderGallery();

  /* ================= MEMORY / FEEDBACK ================= */
  $("#fq1l").textContent = "1. " + D.MEMORY_Q[0];
  $("#fq2l").textContent = "2. " + D.MEMORY_Q[1];
  $("#fq3l").textContent = "3. " + D.MEMORY_Q[2];
  const CFG = window.AKZ_CONFIG || {};
  const SB_URL = String(CFG.SUPABASE_URL || "").replace(/\/+$/, "");
  const SB_KEY = String(CFG.SUPABASE_KEY || "");
  const SB_ON = /^https:\/\/.+/.test(SB_URL) && SB_KEY.length > 20;
  const FBK = "akz-feedback-local";
  const storeNote = $("#storeNote"), fbStatus = $("#fbStatus"), fbList = $("#fbList");
  const sbFetch = (path, opts = {}) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    return fetch(`${SB_URL}/rest/v1/${path}`, { ...opts, signal: ctl.signal, headers: { apikey: SB_KEY, "Content-Type": "application/json", ...(opts.headers || {}) } })
      .finally(() => clearTimeout(t));
  };
  const fmtDate = (iso) => { try { const d = new Date(iso); return d.toLocaleDateString("kk-KZ", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toTimeString().slice(0, 5); } catch (e) { return ""; } };
  let fbOffset = 0; const FB_PAGE = 20;
  function fbItem(r) {
    return `<div class="it"><p class="src">${esc(fmtDate(r.created_at))}</p>${r.q1 ? `<p><b>1.</b> ${esc(r.q1)}</p>` : ""}${r.q2 ? `<p><b>2.</b> ${esc(r.q2)}</p>` : ""}${r.q3 || r.q3note ? `<p><b>3.</b> ${esc(r.q3 || "")}${r.q3note ? " · " + esc(r.q3note) : ""}</p>` : ""}</div>`;
  }
  async function loadFeedback(reset) {
    if (!SB_ON) return;
    if (reset) { fbOffset = 0; fbList.innerHTML = `<span class="eyebrow">Келушілердің пікірлері</span><div id="fbItems"><p class="muted">Пікірлер жүктелуде…</p></div>`; }
    fbList.hidden = false;
    const box = $("#fbItems");
    try {
      const res = await sbFetch(`feedback?select=created_at,q1,q2,q3,q3note&order=created_at.desc&limit=${FB_PAGE}&offset=${fbOffset}`, { headers: { Prefer: "count=exact" } });
      if (!res.ok) throw new Error(res.status);
      const rows = await res.json();
      const total = parseInt((res.headers.get("content-range") || "").split("/")[1], 10);
      if (reset) box.innerHTML = "";
      $(".fb-more", fbList) && $(".fb-more", fbList).remove();
      if (!rows.length && fbOffset === 0) box.innerHTML = `<p class="muted">Әзірге пікір жоқ. Бірінші болып жазыңыз!</p>`;
      box.insertAdjacentHTML("beforeend", rows.map(fbItem).join(""));
      fbOffset += rows.length;
      const head = $(".eyebrow", fbList); if (head && !isNaN(total)) head.textContent = `Келушілердің пікірлері · ${total}`;
      if (!isNaN(total) && fbOffset < total) {
        const more = h(`<button class="btn small fb-more" type="button">Тағы көрсету</button>`);
        more.onclick = () => loadFeedback(false); fbList.appendChild(more);
      }
    } catch (e) {
      if (reset) box.innerHTML = `<p class="muted">Пікірлерді жүктеу мүмкін болмады. Интернет байланысын тексеріп, бетті қайта ашыңыз.</p>`;
    }
  }
  if (SB_ON) {
    storeNote.textContent = "Пікіріңіз жобаның ортақ дерекқорына сақталады және төмендегі тізімде барлық келушіге көрінеді. Аты-жөніңізді немесе байланыс деректеріңізді жазбаңыз.";
    loadFeedback(true);
  } else {
    storeNote.textContent = "Ортақ дерекқор әлі қосылмаған (config.js файлын толтырыңыз). Әзірге жауаптар тек осы құрылғыда сақталады.";
  }
  let lastSent = 0;
  try { lastSent = +localStorage.getItem("akz-fb-last") || 0; } catch (e) {}
  $("#fbForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const r = $$('input[name="fq3"]').find((x) => x.checked);
    const cut = (v) => v.trim().slice(0, 1200);
    const data = { q1: cut($("#fq1").value), q2: cut($("#fq2").value), q3: r ? r.value : null, q3note: cut($("#fq3t").value) };
    if (!data.q1 && !data.q2 && !data.q3 && !data.q3note) { fbStatus.innerHTML = `<p class="fb no">Кем дегенде бір сұраққа жауап беріңіз.</p>`; return; }
    if (Date.now() - lastSent < 60000) { fbStatus.innerHTML = `<p class="fb info">Жаңа ғана пікір жібердіңіз. Бір минуттан кейін қайта жіберуге болады.</p>`; return; }
    const btn = $("#fbSubmit"); btn.disabled = true; btn.textContent = "Жіберілуде…";
    const done = () => { btn.disabled = false; btn.textContent = "Жауапты жіберу"; };
    if (!SB_ON) {
      let ok = false; try { const arr = JSON.parse(localStorage.getItem(FBK) || "[]"); arr.push({ ...data, at: new Date().toISOString() }); localStorage.setItem(FBK, JSON.stringify(arr)); ok = true; } catch (er) {}
      fbStatus.innerHTML = ok ? `<p class="fb info">Жауабыңыз тек осы құрылғыда сақталды: ортақ дерекқор әлі қосылмаған.</p>` : `<p class="fb no">Жауапты сақтау мүмкін болмады.</p>`;
      done(); return;
    }
    try {
      const res = await sbFetch("feedback", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error(res.status);
      lastSent = Date.now(); try { localStorage.setItem("akz-fb-last", String(lastSent)); } catch (er) {}
      fbStatus.innerHTML = `<p class="fb ok">Рахмет! Пікіріңіз сақталды.</p>`;
      $("#fbForm").reset();
      loadFeedback(true);
    } catch (er) {
      fbStatus.innerHTML = `<p class="fb no">Пікірді жіберу мүмкін болмады. Интернет байланысын тексеріп, қайта көріңіз.</p>`;
    }
    done();
  });

  /* ================= ROOM TASKS (used by 3D museum) ================= */
  function roomTask(n, host) {
    host.innerHTML = "";
    if (n === 1) {
      host.appendChild(h(`<div><span class="eyebrow">Интерактив</span><h3 style="margin-top:6px">Өмір жолын құрастыр</h3><p class="muted" style="font-size:.92rem">Оқиғаларды хронологиялық ретпен басыңыз.</p></div>`));
      const ev = D.CHRONO_GAME;
      let next = 0;
      const pick = h(`<div class="opts"></div>`), built = h(`<ol class="srclist" style="margin:0"></ol>`), fb = h(`<div aria-live="polite"></div>`);
      shuffle(ev.map((x, i) => ({ ...x, i }))).forEach((x) => {
        const b = h(`<button class="opt">${esc(x.t)}</button>`);
        b.onclick = () => {
          if (x.i === next) { next++; b.remove(); built.appendChild(h(`<li class="reveal"><span class="n">${esc(x.y)}</span><span>${esc(x.t)}</span></li>`)); beep(880, 0.06, 0.03);
            fb.innerHTML = next === ev.length ? `<p class="fb ok"><b>Өмір жолы құрастырылды!</b> Соңғы кезең – «?»: кейінгі тағдыры әлі анықталмаған.</p>` : `<p class="fb ok">Дұрыс! Келесі кезеңді таңдаңыз.</p>`; }
          else { b.classList.add("wrong"); setTimeout(() => b.classList.remove("wrong"), 600); beep(180, 0.15); fb.innerHTML = `<p class="fb no">Бұл кезең кейінірек немесе ертерек. Қазір ${next + 1}-кезеңді табыңыз.</p>`; }
        };
        pick.appendChild(b);
      });
      host.append(built, pick, fb);
    } else if (n === 2) {
      host.appendChild(h(`<div><span class="eyebrow">Интерактив · 3 кезең</span><h3 style="margin-top:6px">Хабарды қабылда, шеш, жеткіз</h3><p class="fb info" style="font-size:.85rem">Бұл – оқу моделі. Ол нақты тарихи операцияны қайталамайды.</p></div>`));
      const step = h(`<div class="grid" style="gap:12px"></div>`); host.appendChild(step);
      const PLAIN = "ХАБАР ҚАБЫЛДАНДЫ", K = 3;
      const s1 = () => {
        step.innerHTML = `<b>1. Хабарды қабылдау</b>`;
        const rs = h(`<div class="radio-set" style="grid-template-columns:1fr"><div class="radio-face" style="margin:auto"><span class="led"></span><span class="dial"></span></div><button class="btn small primary">📻 Радиоқабылдағышты іске қосу</button></div>`);
        step.appendChild(rs);
        $("button", rs).onclick = () => {
          $(".radio-face", rs).classList.add("on"); let k = 0; const iv = setInterval(() => { beep(k % 3 ? 750 : 950, 0.06, 0.03); if (++k > 12) { clearInterval(iv); $(".radio-face", rs).classList.remove("on"); done(); } }, 120);
          $("button", rs).disabled = true;
          const done = () => { step.appendChild(h(`<p class="fb ok">Хабар қабылданды. <span class="muted">Тарихи түсіндірме: шифрлаушылар алыстағы барлау арналарынан радио арқылы келген радиограммаларды қабылдады. E-history.kz материалында 15–20 беттік хабарлар туралы айтылады [6].</span></p>`)); const b = h(`<button class="btn small">2-кезеңге өту ›</button>`); b.onclick = s2; step.appendChild(b); };
        };
      };
      const s2 = () => {
        const enc = PLAIN.split(" ").map((w) => shiftW(w, K)).join(" ");
        step.innerHTML = `<b>2. Шифрды шешу</b><p class="muted" style="font-size:.9rem">Шартты шифрланған мәтін. Сырғытпаны жылжытып, әріптерді алфавит бойынша неше орынға кері жылжыту керегін табыңыз.</p>
          <div class="cipher-text" style="font-size:1.2rem;letter-spacing:.14em" id="r2out">${enc}</div><label class="src" for="r2rng">Жылжу: <b id="r2k">0</b></label><input type="range" id="r2rng" min="0" max="8" value="0" style="width:100%;accent-color:#D4AF37">`;
        const rng = $("#r2rng", step), out = $("#r2out", step), kk = $("#r2k", step); let solved = false;
        rng.oninput = () => {
          const k = +rng.value; kk.textContent = k;
          out.textContent = enc.split(" ").map((w) => shiftW(w, -k)).join(" "); beep(400 + k * 60, 0.03, 0.02);
          if (k === K && !solved) { solved = true; out.style.color = "var(--ok)"; step.appendChild(h(`<p class="fb ok">Шифр шешілді: «${PLAIN}». <span class="muted">Тарихи түсіндірме: шифрды қате шешу мүмкін емес еді. Мазмұны басшылыққа жағымсыз болса да, хабар дәл жеткізілуі керек болды. Ақжібектің нақты қолданған шифр жүйесі жарияланбаған.</span></p>`)); const b = h(`<button class="btn small">3-кезеңге өту ›</button>`); b.onclick = s3; step.appendChild(b); }
        };
      };
      const s3 = () => {
        step.innerHTML = `<b>3. Ақпаратты жеткізу</b><p class="muted" style="font-size:.9rem">Ақпарат тізбегі: барлау арнасы → құпия хабар → шифрланған мәтін → шифрлаушы → <b>?</b> Дайын хабарды қайда жібересіз?</p>`;
        const box = h(`<div class="opts"></div>`);
        [["Әскери басқару (шешім қабылдау деңгейі)", true], ["Қайтадан барлау арнасына", false], ["Газет редакциясына", false]].forEach(([t, ok]) => {
          const b = h(`<button class="opt">${t}</button>`);
          b.onclick = () => { if (ok) { b.classList.add("right"); $$(".opt", box).forEach((x) => x.disabled = true); beep(988, 0.15); step.appendChild(h(`<p class="fb ok"><b>Хабар жеткізілді!</b> <span class="muted">Тарихи түсіндірме: шифрлаушы – ақпаратты шешімге айналдыратын тізбектің көзге көрінбейтін буыны. Деректерге қарағанда, соғыс қарсаңында келген кейбір маңызды хабарларға басшылық күмәнмен қараған [1; 7].</span></p>`)); const r = h(`<button class="btn small ghost">Қайта бастау</button>`); r.onclick = s1; step.appendChild(r); } else { b.classList.add("wrong"); beep(180, 0.15); } };
          box.appendChild(b);
        });
        step.appendChild(box);
      };
      s1();
    } else if (n === 3) {
      host.appendChild(h(`<div><span class="eyebrow">Интерактив</span><h3 style="margin-top:6px">Ақпараттық майдан картасы</h3></div>`));
      const m = h(`<div></div>`); host.appendChild(m); renderMap(m, true);
    } else if (n === 4) {
      host.appendChild(h(`<div><span class="eyebrow">Интерактив</span><h3 style="margin-top:6px">Тарихи деректі зертте</h3><p class="muted" style="font-size:.92rem">Құжат карточкасын ашыңыз.</p></div>`));
      D.ROOM4_DOCS.forEach((d) => {
        const b = h(`<button class="topic" style="background:linear-gradient(180deg,#efe3c6,#e1d1ac);color:#1B140C;border-color:#8e7650"><b style="color:#7a1f15">${esc(d.title)}</b><p style="color:#3a2c1a"><span style="display:block;margin-bottom:6px">${esc(d.content)}</span><span class="mono" style="display:block;font-size:.8rem">Жарияланған жылы: ${esc(d.year)}<br>Дереккөз: ${esc(d.src)}<br>Мәртебе: ${D.STATUS[d.status].label}</span><span style="display:block;margin-top:6px;font-style:italic">Зерттеу сұрағы: ${esc(d.q)}</span></p></button>`);
        b.onclick = () => { b.classList.toggle("open"); beep(260, 0.06, 0.03); };
        host.appendChild(b);
      });
      host.appendChild(h(`<p class="mem-line g" style="font-size:1.3rem;text-align:center;margin-top:10px">«Тарихтағы белгісіздік – жаңа зерттеудің бастамасы».</p>`));
    } else if (n === 5) {
      host.appendChild(h(`<div><span class="eyebrow">Интерактивті алгоритм</span><h3 style="margin-top:6px">ДЕРЕК → … → КЕРІ БАЙЛАНЫС</h3></div>`));
      const a = h(`<div></div>`); host.appendChild(a); renderAlgo(a);
      a.querySelector(".algo").style.gridTemplateColumns = "repeat(2,1fr)";
      a.querySelector(".algo-detail").style.gridTemplateColumns = "1fr";
      host.appendChild(h(`<div><span class="eyebrow" style="margin-top:8px">Реконструкцияны салыстыр</span></div>`));
      const c = h(`<div></div>`); host.appendChild(c); renderCompare(c);
      host.appendChild(h(`<div class="cta"><button class="btn small primary" data-video="film">▶ Тарихи бейне</button><button class="btn small" data-video="process">Жасалу процесі</button></div>`));
    }
  }

  window.AKZApp = { museumFallback, roomTask, openVideo, openLightbox, openOverlay, closeOverlay, Speech, beep, chip, esc, isOverlayOpen: () => !ov.hidden };
})();
