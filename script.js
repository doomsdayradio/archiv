/**
 * Kraterarchiv EPUB-Reader & Multi-Book Engine
 * EPUB3 Parsing via JSZip, Multi-Book Selector, BGM Audio & Light/Dark Theme.
 */

(function () {
  "use strict";

  // Elements
  const html = document.documentElement;
  const bookSelector = document.getElementById("bookSelector");
  const epubInput = document.getElementById("epubInput");
  const themeToggleBtn = document.getElementById("themeToggleBtn");

  const bookTitle = document.getElementById("bookTitle");
  const bookSubtitle = document.getElementById("bookSubtitle");
  const bookEyebrow = document.getElementById("bookEyebrow");
  const bookFormatTag = document.getElementById("bookFormatTag");
  const railMeta = document.getElementById("railMeta");

  const bgmToggleBtn = document.getElementById("bgmToggleBtn");
  const bgmStateLabel = document.getElementById("bgmStateLabel");
  const bgmTrackSelect = document.getElementById("bgmTrackSelect");
  const bgmVolume = document.getElementById("bgmVolume");

  const audiobookToggleBtn = document.getElementById("audiobookToggleBtn");
  const audiobookDeck = document.getElementById("audiobookDeck");
  const audiobookPlayer = document.getElementById("audioPlayer");
  const audiobookTitle = document.getElementById("audiobookTitle");

  const bookContainer = document.getElementById("book");
  const pageReadout = document.getElementById("pageReadout");
  const chapterLabel = document.getElementById("chapterLabel");
  const progressBar = document.getElementById("progressBar");
  const prevBtn = document.getElementById("prev");
  const nextBtn = document.getElementById("next");
  const smallerBtn = document.getElementById("smaller");
  const largerBtn = document.getElementById("larger");

  // State
  let booksCatalog = [];
  let currentBookMeta = null;
  let chaptersData = [];
  let currentPage = 0;
  let fontScale = 1;

  // BGM Audio Object
  const bgmAudio = new Audio();
  bgmAudio.loop = true;
  bgmAudio.volume = parseFloat(bgmVolume.value) || 0.4;
  let isBgmPlaying = false;

  // Init Theme
  const savedTheme = localStorage.getItem("kraterarchiv_theme") || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
  setTheme(savedTheme);

  themeToggleBtn.addEventListener("click", () => {
    const nextTheme = html.getAttribute("data-theme") === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });

  function setTheme(theme) {
    html.setAttribute("data-theme", theme);
    themeToggleBtn.textContent = theme === "dark" ? "🌙" : "☀️";
    localStorage.setItem("kraterarchiv_theme", theme);
  }

  // --- EPUB PARSER ENGINE (JSZip + DOMParser) ---
  async function parseEpubBuffer(arrayBuffer, sourceName = "EPUB") {
    if (typeof JSZip === "undefined") {
      throw new Error("JSZip Bibliothek ist nicht geladen.");
    }

    const zip = await JSZip.loadAsync(arrayBuffer);

    // 1. Locate container.xml
    const containerFile = zip.file("META-INF/container.xml");
    if (!containerFile) {
      throw new Error("Keine META-INF/container.xml in EPUB gefunden.");
    }
    const containerXmlText = await containerFile.async("string");
    const domParser = new DOMParser();
    const containerDoc = domParser.parseFromString(containerXmlText, "text/xml");
    const rootfileEl = containerDoc.querySelector("rootfile");
    if (!rootfileEl) {
      throw new Error("Ungültiges EPUB: Kein rootfile in container.xml");
    }

    const opfPath = rootfileEl.getAttribute("full-path");
    const opfFolder = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/")) : "";

    // 2. Parse OPF file
    const opfFile = zip.file(opfPath);
    if (!opfFile) {
      throw new Error(`OPF-Datei nicht gefunden: ${opfPath}`);
    }
    const opfXmlText = await opfFile.async("string");
    const opfDoc = domParser.parseFromString(opfXmlText, "text/xml");

    // Metadata
    const titleEl = opfDoc.querySelector("title") || opfDoc.getElementsByTagNameNS("*", "title")[0];
    const creatorEl = opfDoc.querySelector("creator") || opfDoc.getElementsByTagNameNS("*", "creator")[0];
    const pubTitle = titleEl ? titleEl.textContent.trim() : sourceName;
    const pubAuthor = creatorEl ? creatorEl.textContent.trim() : "Doomsday Radio";

    // Manifest map (id -> href)
    const manifestItems = opfDoc.querySelectorAll("manifest > item, item");
    const manifestMap = new Map();
    manifestItems.forEach(item => {
      const id = item.getAttribute("id");
      const href = item.getAttribute("href");
      if (id && href) {
        manifestMap.set(id, href);
      }
    });

    // Spine (ordered chapter itemrefs)
    const itemrefs = opfDoc.querySelectorAll("spine > itemref, itemref");
    const chapterList = [];

    for (let i = 0; i < itemrefs.length; i++) {
      const idref = itemrefs[i].getAttribute("idref");
      const href = manifestMap.get(idref);
      if (!href) continue;

      const fullChapterPath = opfFolder ? `${opfFolder}/${href}` : href;
      const chapFile = zip.file(fullChapterPath);
      if (!chapFile) continue;

      const chapXhtmlText = await chapFile.async("string");
      const chapDoc = domParser.parseFromString(chapXhtmlText, "text/html");

      // Extract chapter title & content
      const hTitleEl = chapDoc.querySelector("h1, h2, h3, title");
      const chapterTitle = hTitleEl ? hTitleEl.textContent.trim() : `Abschnitt ${i + 1}`;

      const bodyEl = chapDoc.querySelector("body") || chapDoc.documentElement;

      // Clean up body content (remove scripts, outer margin)
      const sanitizedHtml = bodyEl.innerHTML
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
        .replace(/xmlns="[^"]*"/g, "");

      chapterList.push({
        index: i + 1,
        title: chapterTitle,
        html: sanitizedHtml
      });
    }

    if (chapterList.length === 0) {
      throw new Error("Keine lesbaren Abschnitte in EPUB gefunden.");
    }

    return {
      title: pubTitle,
      author: pubAuthor,
      chapters: chapterList
    };
  }

  // --- RENDERER & BOOK LOADER ---
  async function loadEpubFromUrl(url, bookInfo = null) {
    try {
      showLoading("Lade EPUB aus Archiv...");
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} beim Laden von ${url}`);
      }
      const buffer = await response.arrayBuffer();
      const parsedBook = await parseEpubBuffer(buffer, bookInfo ? bookInfo.title : "EPUB");

      applyBookData(parsedBook, bookInfo);
    } catch (err) {
      console.error("EPUB Ladefehler:", err);
      showError(`EPUB konnte nicht geladen werden: ${err.message}`);
    }
  }

  async function loadEpubFromFile(file) {
    try {
      showLoading(`Entpacke ${file.name}...`);
      const buffer = await file.arrayBuffer();
      const parsedBook = await parseEpubBuffer(buffer, file.name.replace(/\.epub$/i, ""));

      const customMeta = {
        id: "custom-file",
        title: parsedBook.title,
        subtitle: `Erkannte Datei: ${file.name}`,
        author: parsedBook.author,
        audiobook: null,
        bgmTracks: []
      };

      applyBookData(parsedBook, customMeta);
    } catch (err) {
      console.error("EPUB Dateifehler:", err);
      showError(`EPUB-Datei konnte nicht gelesen werden: ${err.message}`);
    }
  }

  function applyBookData(parsedBook, meta = null) {
    currentBookMeta = meta;
    chaptersData = parsedBook.chapters;
    currentPage = 0;

    // Header Metadata
    bookTitle.innerHTML = formatTitleHtml(parsedBook.title);
    bookSubtitle.textContent = meta && meta.subtitle ? meta.subtitle : `Von ${parsedBook.author}`;
    bookEyebrow.textContent = `EPUB3 // ${meta && meta.author ? meta.author.toUpperCase() : "KRATERARCHIV"}`;
    bookFormatTag.textContent = "EPUB3";
    railMeta.innerHTML = `DATENSATZ<br>${meta && meta.id ? meta.id.toUpperCase() : "CUSTOM"}`;

    // Update Media Bar (Audiobook & BGM)
    setupAudiobook(meta ? meta.audiobook : null);
    setupBgmTracks(meta ? meta.bgmTracks : []);

    // Render Chapters into DOM
    renderChaptersHtml();
    showPage(0);
  }

  function formatTitleHtml(rawTitle) {
    if (rawTitle.includes(",")) {
      const parts = rawTitle.split(",");
      return `${escapeHtml(parts[0])},<br><em>${escapeHtml(parts.slice(1).join(","))}</em>`;
    }
    return escapeHtml(rawTitle);
  }

  function renderChaptersHtml() {
    bookContainer.innerHTML = "";
    chaptersData.forEach((chap, idx) => {
      const sec = document.createElement("section");
      sec.className = `chapter ${idx === 0 ? "active" : ""}`;
      sec.setAttribute("data-page", idx + 1);

      const numP = document.createElement("p");
      numP.className = "chapter-number";
      numP.textContent = `ABSCHNITT ${String(idx + 1).padStart(2, "0")}`;

      const contentDiv = document.createElement("div");
      contentDiv.className = "chapter-content";
      contentDiv.innerHTML = chap.html;

      sec.appendChild(numP);
      sec.appendChild(contentDiv);
      bookContainer.appendChild(sec);
    });
  }

  function showPage(index) {
    const chapterEls = bookContainer.querySelectorAll(".chapter");
    if (chapterEls.length === 0) return;

    currentPage = Math.max(0, Math.min(chapterEls.length - 1, index));
    chapterEls.forEach((ch, idx) => {
      ch.classList.toggle("active", idx === currentPage);
    });

    const pageStr = String(currentPage + 1).padStart(2, "0");
    const totalStr = String(chapterEls.length).padStart(2, "0");

    pageReadout.textContent = `SEITE ${pageStr} / ${totalStr}`;
    chapterLabel.textContent = chaptersData[currentPage] ? chaptersData[currentPage].title.toUpperCase() : `KAPITEL ${pageStr}`;
    progressBar.style.width = `${((currentPage + 1) / chapterEls.length) * 100}%`;

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function movePage(delta) {
    showPage(currentPage + delta);
  }

  function showLoading(msg) {
    bookContainer.innerHTML = `
      <div class="loading-state">
        <span class="spinner"></span> ${escapeHtml(msg)}
      </div>`;
  }

  function showError(msg) {
    bookContainer.innerHTML = `
      <div class="error-state">
        ⚠️ <strong>Fehler:</strong> ${escapeHtml(msg)}
      </div>`;
  }

  // --- AUDIOBOOK & BGM MEDIA DECK ---
  function setupAudiobook(audioUrl) {
    if (audioUrl) {
      audiobookPlayer.src = audioUrl;
      audiobookTitle.textContent = "VOLLSTÄNDIGE AUDIOSENDUNG (31 MB)";
      audiobookToggleBtn.style.display = "inline-flex";
    } else {
      audiobookPlayer.pause();
      audiobookPlayer.removeAttribute("src");
      audiobookToggleBtn.style.display = "none";
      audiobookDeck.classList.add("hidden");
    }
  }

  audiobookToggleBtn.addEventListener("click", () => {
    audiobookDeck.classList.toggle("hidden");
  });

  function setupBgmTracks(tracks = []) {
    bgmTrackSelect.innerHTML = "";
    if (tracks.length === 0) {
      bgmTrackSelect.innerHTML = '<option value="">Keine Hintergrundmusik</option>';
      pauseBgm();
      bgmToggleBtn.disabled = true;
      return;
    }

    bgmToggleBtn.disabled = false;
    tracks.forEach((tr) => {
      const opt = document.createElement("option");
      opt.value = tr.url;
      opt.textContent = tr.title;
      bgmTrackSelect.appendChild(opt);
    });

    // Default first track
    bgmAudio.src = tracks[0].url;
  }

  bgmToggleBtn.addEventListener("click", () => {
    if (isBgmPlaying) {
      pauseBgm();
    } else {
      playBgm();
    }
  });

  bgmTrackSelect.addEventListener("change", () => {
    const selectedUrl = bgmTrackSelect.value;
    if (selectedUrl) {
      bgmAudio.src = selectedUrl;
      if (isBgmPlaying) {
        bgmAudio.play().catch(e => console.log("BGM Audio-Play abgefangen:", e));
      }
    } else {
      pauseBgm();
    }
  });

  bgmVolume.addEventListener("input", () => {
    bgmAudio.volume = parseFloat(bgmVolume.value) || 0;
  });

  function playBgm() {
    if (!bgmAudio.src || bgmAudio.src.endsWith("/")) {
      if (bgmTrackSelect.value) {
        bgmAudio.src = bgmTrackSelect.value;
      } else {
        return;
      }
    }
    bgmAudio.play().then(() => {
      isBgmPlaying = true;
      bgmStateLabel.textContent = "BGM stoppen";
      bgmToggleBtn.classList.add("playing");
    }).catch(err => {
      console.warn("BGM Play gefehlt:", err);
    });
  }

  function pauseBgm() {
    bgmAudio.pause();
    isBgmPlaying = false;
    bgmStateLabel.textContent = "BGM abspielen";
    bgmToggleBtn.classList.remove("playing");
  }

  // --- CATALOG & EVENT HANDLERS ---
  async function initCatalog() {
    try {
      const res = await fetch("books.json");
      if (res.ok) {
        booksCatalog = await res.json();
      }
    } catch (e) {
      console.warn("Katalog books.json nicht geladen:", e);
    }

    if (!booksCatalog || booksCatalog.length === 0) {
      booksCatalog = [{
        id: "wir-berichten",
        title: "Wir berichten, selbst wenn keiner mehr zuhört",
        subtitle: "Die letzte Sendung von Viktor Weiß. Ein Sender. Eine Liste. Ein Krater.",
        author: "Doomsday Radio Kraterarchiv",
        epub: "books/wir-berichten-selbst-wenn-keiner-mehr-zuhoert.epub",
        audiobook: "audio/Kraterarchiv-final.mp3",
        bgmTracks: [
          { title: "Ödland im Staub (Ambient 1)", url: "audio/bgm/oedland-im-staub.mp3" },
          { title: "Ödland im Staub (Ambient 2)", url: "audio/bgm/oedland-im-staub2.mp3" },
          { title: "Ödland Transition", url: "audio/bgm/oedland-transition-doomsday.mp3" }
        ]
      }];
    }

    // Populate book selector
    bookSelector.innerHTML = "";
    booksCatalog.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.title;
      bookSelector.appendChild(opt);
    });

    // Custom option
    const customOpt = document.createElement("option");
    customOpt.value = "upload";
    customOpt.textContent = "📁 Eigene .epub Datei...";
    bookSelector.appendChild(customOpt);

    // Initial load first book
    loadBookById(booksCatalog[0].id);
  }

  function loadBookById(id) {
    const found = booksCatalog.find(b => b.id === id);
    if (found && found.epub) {
      loadEpubFromUrl(found.epub, found);
    }
  }

  bookSelector.addEventListener("change", (e) => {
    const val = e.target.value;
    if (val === "upload") {
      epubInput.click();
    } else {
      loadBookById(val);
    }
  });

  epubInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      loadEpubFromFile(e.target.files[0]);
    }
  });

  // Controls
  prevBtn.addEventListener("click", () => movePage(-1));
  nextBtn.addEventListener("click", () => movePage(1));

  smallerBtn.addEventListener("click", () => {
    fontScale = Math.max(0.85, fontScale - 0.08);
    html.style.setProperty("--reading-size", `${1.16 * fontScale}rem`);
  });

  largerBtn.addEventListener("click", () => {
    fontScale = Math.min(1.4, fontScale + 0.08);
    html.style.setProperty("--reading-size", `${1.16 * fontScale}rem`);
  });

  // Keyboard navigation
  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "PageDown") movePage(1);
    if (event.key === "ArrowLeft" || event.key === "PageUp") movePage(-1);
  });

  // Touch Swipe
  let touchStartX = 0;
  bookContainer.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  }, { passive: true });

  bookContainer.addEventListener("touchend", (e) => {
    const dist = e.changedTouches[0].screenX - touchStartX;
    if (Math.abs(dist) > 50) {
      movePage(dist < 0 ? 1 : -1);
    }
  }, { passive: true });

  // Helpers
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Launch
  initCatalog();
})();
