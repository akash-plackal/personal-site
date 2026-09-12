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

  try {
    if (sessionStorage.getItem("__click")) {
      sessionStorage.removeItem("__click");
      playClickSound();
    }
  } catch {}

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
      sessionStorage.setItem("__click", "1");
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

  // ── Prerender before intent, gated on the LCP image ─────────
  // Two tiers, and the split is about *when*, not *whether*:
  //
  //   speculationrules.json   every internal link, `moderate` — hover or
  //   (Speculation-Rules      pointerdown. Nothing leaves the wire until the
  //    response header)       pointer says so, so it is safe to apply from
  //                          parse time.
  //
  //   here                    /about/ and /about/photos/, `immediate` — the
  //                          pages worth having ready before the pointer
  //                          moves, which is exactly why they have to wait
  //                          for the LCP image.
  //
  // `immediate` starts during parse, which is when the hero AVIF is in
  // flight. The old `prefetch /* immediate` rule pulled ~92 KB of documents
  // before the user had expressed any intent — ~500 ms of a 1.45 Mbps link
  // bidding against the LCP image. Chrome de-prioritises speculative fetches,
  // but priority reorders a queue; it does not create bandwidth. Waiting for
  // `load` spends an idle link instead of a contended one.
  //
  // Prerender rather than prefetch at both tiers because the fallback is
  // free: when Chrome declines to allocate a renderer it keeps the
  // speculative fetch and the navigation arrives as
  // `deliveryType: "navigational-prefetch"`. A separate prefetch rule would
  // buy nothing a failed prerender does not already give back.
  //
  // `sel` is the cheap local test for "does this document actually contain a
  // link the rule could act on" — only /about/more/ links to the photo page,
  // so every other document would carry a rule that can never fire.
  const PRERENDER = [
    { href_matches: "/about/", sel: 'a[href="/about/"]' },
    { href_matches: "/about/photos/*", sel: 'a[href^="/about/photos/"]' },
  ];

  const setupPrerender = () => {
    if (!HTMLScriptElement.supports?.("speculationrules")) return;

    // Someone on a metered or genuinely slow link is the person least able to
    // absorb a speculative document they may never open. Prefetch-on-intent
    // still covers them.
    const conn = navigator.connection;
    if (conn?.saveData) return;
    if (conn && /^(slow-)?2g$/.test(conn.effectiveType || "")) return;
    if (window.matchMedia?.("(prefers-reduced-data: reduce)").matches) return;

    const rules = PRERENDER.filter((r) => document.querySelector(r.sel)).map(
      (r) => ({
        source: "document",
        where: { href_matches: r.href_matches },
        eagerness: "immediate",
      }),
    );
    if (!rules.length) return;

    const el = document.createElement("script");
    el.type = "speculationrules";
    el.textContent = JSON.stringify({ prerender: rules });
    document.head.appendChild(el);
  };

  // /about/'s hero used to be a <link rel=prefetch> in head-base.html, which
  // put 43 KB of a page the visitor may never open into head parsing — on
  // every document on the site, in the same window as that document's own LCP
  // image. Same bytes, moved past the LCP; the prerender above reuses it from
  // the HTTP cache (immutable, so the two never race for a second copy), and
  // browsers that decline to prerender still get the warm image.
  const warmAboutHero = () => {
    if (!document.querySelector('a[href="/about/"]')) return;
    const l = document.createElement("link");
    l.rel = "prefetch";
    l.as = "image";
    l.type = "image/avif";
    l.href = "/assets/hero-about-720.avif";
    l.imageSrcset =
      "/assets/hero-about-720.avif 720w, /assets/hero-about-1080.avif 1080w";
    l.imageSizes = "(min-width: 54rem) 22rem, 88vw";
    document.head.appendChild(l);
  };

  // A prerendered document still fires `load`, so without this every page
  // speculated from another page would immediately speculate in turn —
  // warming /about/'s hero and chaining rules outward from a page nobody has
  // opened yet. Chrome already defers speculation rules found in a prerendered
  // document, but not the <link rel=prefetch>, and the fan-out is the point:
  // speculation should cost one hop, not a spreading tree.
  const whenActive = (fn) => {
    if (!document.prerendering) {
      fn();
      return;
    }
    document.addEventListener("prerenderingchange", fn, { once: true });
  };

  const speculate = () => whenActive(() => {
    setupPrerender();
    warmAboutHero();
  });

  // `load` is the cheap, reliable proxy for "the LCP image has arrived": it
  // waits on every non-lazy subresource in the document, the hero preload
  // included. The idle callback after it keeps the rule insertion off the
  // tail of any work the load event itself kicked off.
  const afterLoad = () => {
    if (window.requestIdleCallback) {
      window.requestIdleCallback(speculate, { timeout: 2000 });
    } else {
      window.setTimeout(speculate, 200);
    }
  };

  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });

  // ── Lazy-load Giscus ─────────────────────────────────────────
  const giscusEl = document.querySelector(".giscus");
  if (giscusEl && !giscusEl.querySelector("iframe")) {
    let giscusLoaded = false;
    // The observer's 900px rootMargin reaches well past a short article's
    // fold, so a prerendered page can trip it and pull giscus + the GitHub API
    // for a page the visitor only hovered. Third-party requests wait for a
    // real visit.
    const loadGiscus = () => whenActive(() => {
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
    });

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
