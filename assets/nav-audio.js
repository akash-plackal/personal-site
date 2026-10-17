(() => {
  const CLICK_SOUND_DATA =
    "data:audio/ogg;base64,T2dnUwACAAAAAAAAAACk4ALfAAAAAJIizQoBE09wdXNIZWFkAQF4AMBdAAAAAABPZ2dTAAAAAAAAAAAAAKTgAt8BAAAASNgoLwE9T3B1c1RhZ3MMAAAATGF2ZjYxLjcuMTAwAQAAAB0AAABlbmNvZGVyPUxhdmM2MS4xOS4xMDEgbGlib3B1c09nZ1MABAIsAAAAAAAApOAC3wIAAAAuiuulDDZYKiIeMFQjICEoNtj1QN5eO51zYK9Vl95H0pqyRi64bIU4rMf4b+FNFrMmHTGPO2ZgaZky+5G8FBTKfRop2ttnt9h+7smTJzI5U2ESke9vGcj/3qBN9767cdgyGSxBNdht/dw/TmbPoetHsPy2p8vMeqWXNu4Y/aa+BdRNYraV32dy/i/G5e093jPWDepACmCs9akXrnkCCgHYiGbYF8V/QXwm9D1jFo5VKAVzu+gSGEssN/3CXT3BOAZtA7x7QCjOl7DYBZbZTWSzBm+C0DWDPC3+qdDxkPaBKC8REeCZK04/hrH22DuHQzkkZxpc9G3TxCP5m7LnXEvgilemMf5aeNaI2Gep6vN9lOcsiGu9NzD8+oxF4ic6CYRFV8deNnT87kS5bQTYT+yiBmm2B/ZSSeox2H45FrfkF0/f2MITxI9mDNUa7ErObYMKDnQtshFjGTu816pRIouHxM1u4+K9eUT18e3rNjJhzhs+f1lLDtEi29ZI7o/1vejSqcMlAgoLJKPze9sF2CB2wNdt5QGM66Dwtzj08sGSf2zm371KKdq0u27Z4bipk1/YIcnnDmgOgGj/0fTJZVkwzF5kc9bqkwdUBfj0jw+IztjFAwETIMbY7msaYRaigBCyj3LGE5UR8xclD1D0KLY9ctjFVgw0cT4uSx5JfmQ5xr/U3j3sAf+ioSposeMTIs722aoJqYbm6WzYeWIYao+FoBbYitZNEaJ1t2CBhDe0T6OwjSKqX0G1KW6GgmlRVfZFjppzDUuoLGlqzARBZoE=";
  let clickAudio;

  const getClickAudio = () => {
    if (clickAudio) return clickAudio;
    clickAudio = new Audio(CLICK_SOUND_DATA);
    clickAudio.volume = 0.32;
    clickAudio.preload = "auto";
    return clickAudio;
  };

  const playClickSound = () => {
    try {
      const audio = getClickAudio();
      audio.currentTime = 0;
      void audio.play().catch(() => {});
    } catch {}
  };

  // The previous page plays nothing — navigation would cut the sound off — so
  // the incoming page plays it. A normal load learns about the click from a
  // sessionStorage flag. A prerendered page cannot: its storage is a clone
  // taken when the prerender started (for /about/, seconds before the click),
  // and Chrome only re-syncs it at some point around activation. Activation
  // itself is the signal instead — a speculation-rules prerender is only ever
  // activated by a navigation from the page that started it, so a same-origin
  // referrer means the user just clicked through. Omnibox prerenders carry no
  // referrer and stay silent.
  const FLAG_TTL_MS = 3000;

  const clearFlag = () => {
    try {
      sessionStorage.removeItem("__click");
    } catch {}
  };

  const playIfFlagged = () => {
    try {
      const t = Number(sessionStorage.getItem("__click"));
      clearFlag();
      // Timestamped so a flag left behind by a prerender activation (cleared
      // against the clone, not the real storage) cannot fire on a later reload.
      if (t && Date.now() - t < FLAG_TTL_MS) playClickSound();
    } catch {}
  };

  const cameFromThisSite = () => {
    try {
      return new URL(document.referrer).origin === window.location.origin;
    } catch {
      return false;
    }
  };

  if (document.prerendering) {
    // Decode the data URI during prerender so activation plays on frame one.
    getClickAudio();
    document.addEventListener(
      "prerenderingchange",
      () => {
        if (cameFromThisSite()) playClickSound();
        clearFlag();
      },
      { once: true },
    );
  } else {
    playIfFlagged();
  }

  // ── Eager speculation, after the page is done ────────────────
  // /about/ and /about/photos/ are likely next stops, so prerender them at
  // `immediate` — but only once load + idle, so they never bid against this
  // page's LCP image. Everything else is covered by the moderate (hover)
  // rule in /speculationrules.json.
  const addEagerSpeculation = () => {
    if (document.prerendering) {
      document.addEventListener("prerenderingchange", scheduleEagerSpeculation, {
        once: true,
      });
      return;
    }
    if (!HTMLScriptElement.supports?.("speculationrules")) return;
    const s = document.createElement("script");
    s.type = "speculationrules";
    s.textContent = JSON.stringify({
      prerender: [
        {
          source: "list",
          urls: ["/about/", "/about/photos/"],
          eagerness: "immediate",
        },
      ],
    });
    // No separate hero prefetch: the build fingerprints asset URLs only in
    // HTML, so a URL written here would miss the `?v=` the page requests and
    // download the image twice. The prerender fetches the real one.
    document.head.append(s);
  };

  const scheduleEagerSpeculation = () => {
    const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
    idle(addEagerSpeculation, { timeout: 2000 });
  };

  if (document.readyState === "complete") scheduleEagerSpeculation();
  else window.addEventListener("load", scheduleEagerSpeculation, { once: true });

  const findClickable = (target) => {
    if (!(target instanceof Element)) return null;
    return target.closest(
      'a[href], button, summary, input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
    );
  };

  const isSameOriginNavigation = (anchor, event) => {
    const href = anchor.getAttribute("href");
    if (!href) return false;
    if (href.startsWith("#")) return false;
    if (
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      href.startsWith("javascript:")
    )
      return false;
    if (anchor.hasAttribute("download")) return false;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return false;
    if (anchor.target && anchor.target !== "_self") return false;
    try {
      const url = new URL(anchor.href, window.location.href);
      return url.origin === window.location.origin;
    } catch {
      return false;
    }
  };

  // Mouse users get immediate pointerdown feedback: same-origin navigations
  // start there, and local controls play the sound there. Touch users wait for
  // click, which the browser cancels when the gesture becomes a scroll or
  // swipe — otherwise every swipe across a link would click.
  const earlyNavigated = new WeakSet();
  let lastMousePointerDown = null;
  let lastMousePointerDownAt = 0;

  const flagNextPageSound = () => {
    try {
      sessionStorage.setItem("__click", String(Date.now()));
    } catch {}
  };

  const handleActivation = (clickable, event) => {
    if (
      clickable instanceof HTMLAnchorElement &&
      isSameOriginNavigation(clickable, event)
    ) {
      flagNextPageSound();
      return;
    }
    playClickSound();
  };

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (
        !e.isTrusted ||
        !e.isPrimary ||
        e.pointerType !== "mouse" ||
        e.button !== 0
      )
        return;
      const clickable = findClickable(e.target);
      if (!clickable) return;

      if (clickable instanceof HTMLAnchorElement) {
        // Anchors we cannot navigate early (#fragments, mailto/tel, downloads,
        // modifier- and new-tab clicks) keep native behaviour and sound on click.
        if (!isSameOriginNavigation(clickable, e)) return;
        e.preventDefault();
        earlyNavigated.add(clickable);
        window.setTimeout(() => earlyNavigated.delete(clickable), 700);
        flagNextPageSound();
        window.location.assign(clickable.href);
        return;
      }

      lastMousePointerDown = clickable;
      lastMousePointerDownAt = performance.now();
      playClickSound();
    },
    { capture: true },
  );

  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return;
      const clickable = findClickable(e.target);
      if (!clickable) return;

      // pointerdown already navigated; swallow the trailing click so the
      // navigation is not started a second time.
      if (earlyNavigated.has(clickable)) {
        earlyNavigated.delete(clickable);
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }

      // pointerdown already played for this element — consume the marker so a
      // press held longer than the window does not play twice.
      if (
        clickable === lastMousePointerDown &&
        performance.now() - lastMousePointerDownAt < 1000
      ) {
        lastMousePointerDown = null;
        return;
      }

      handleActivation(clickable, e);
    },
    { capture: true },
  );

  // ── Contact popover enhancements ─────────────────────────────
  // Opening, closing, Escape, and light-dismiss are native via the
  // Popover API. This JS only keeps the copy button and submit cleanup.
  const setupContactPopover = () => {
    const popover = document.getElementById("contact-popover");
    if (!(popover instanceof HTMLElement)) return;

    const copyBtn = popover.querySelector("[data-contact-copy]");
    const emailEl = popover.querySelector("[data-contact-email]");
    if (copyBtn instanceof HTMLButtonElement && emailEl) {
      let resetTimer = 0;
      copyBtn.addEventListener("click", async () => {
        const email = (emailEl.textContent || "").trim();
        if (!email) return;
        const original = "Copy";
        try {
          await navigator.clipboard.writeText(email);
          copyBtn.textContent = "Copied";
          copyBtn.classList.add("is-copied");
        } catch {
          const range = document.createRange();
          range.selectNodeContents(emailEl);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
          copyBtn.textContent = "Select+copy";
        }
        clearTimeout(resetTimer);
        resetTimer = window.setTimeout(() => {
          copyBtn.textContent = original;
          copyBtn.classList.remove("is-copied");
        }, 1600);
      });
    }

    const form = popover.querySelector(".contact-form");
    if (form instanceof HTMLFormElement) {
      form.addEventListener("submit", () => {
        try {
          popover.hidePopover();
        } catch {}
      });
    }
  };

  setupContactPopover();

  // ── Back link points at where you actually came from ─────────
  // No-ops on pages without [data-back-link], so it costs article pages
  // nothing to carry it here. It used to be inline in the article template,
  // which duplicated it across all 7 article documents and was the last
  // executable inline script on the site — the only reason the CSP needed a
  // sha256 allowlist at all.
  //
  // Running at `defer` time instead of parse time means a click landing in
  // that window falls back to the template's static href, which is the
  // correct destination anyway — just without the history-aware back.
  const setupBackLink = () => {
    try {
      const b = document.querySelector("[data-back-link]");
      if (!b || !document.referrer) return;
      const r = new URL(document.referrer);
      if (
        r.origin !== window.location.origin ||
        r.pathname === window.location.pathname
      )
        return;
      b.href = document.referrer;
      b.addEventListener("click", (e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)
          return;
        if (window.history.length > 1) {
          e.preventDefault();
          window.history.back();
        }
      });
    } catch {}
  };

  setupBackLink();

  // ── Lazy-load Giscus ─────────────────────────────────────────
  const giscusEl = document.querySelector(".giscus");
  if (giscusEl && !giscusEl.querySelector("iframe")) {
    let giscusLoaded = false;
    const loadGiscus = () => {
      if (giscusLoaded) return;
      giscusLoaded = true;
      const s = document.createElement("script");
      s.src = "https://giscus.app/client.js";
      s.dataset.repo = "akash-plackal/personal-site";
      s.dataset.repoId = "R_kgDORJxwdQ";
      s.dataset.category = "General";
      s.dataset.categoryId = "DIC_kwDORJxwdc4C2xrV";
      s.dataset.mapping = "pathname";
      s.dataset.strict = "0";
      s.dataset.reactionsEnabled = "1";
      s.dataset.emitMetadata = "0";
      s.dataset.inputPosition = "bottom";
      s.dataset.theme = "dark_dimmed";
      s.dataset.lang = "en";
      s.crossOrigin = "anonymous";
      s.async = true;
      giscusEl.appendChild(s);
    };

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            io.disconnect();
            loadGiscus();
          }
        },
        { rootMargin: "900px 0px" },
      );
      io.observe(giscusEl);
    } else {
      loadGiscus();
    }
  }
})();
