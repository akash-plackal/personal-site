(() => {
  const CLICK_SOUND_DATA =
    "data:audio/ogg;base64,T2dnUwACAAAAAAAAAACk4ALfAAAAAJIizQoBE09wdXNIZWFkAQF4AMBdAAAAAABPZ2dTAAAAAAAAAAAAAKTgAt8BAAAASNgoLwE9T3B1c1RhZ3MMAAAATGF2ZjYxLjcuMTAwAQAAAB0AAABlbmNvZGVyPUxhdmM2MS4xOS4xMDEgbGlib3B1c09nZ1MABAIsAAAAAAAApOAC3wIAAAAuiuulDDZYKiIeMFQjICEoNtj1QN5eO51zYK9Vl95H0pqyRi64bIU4rMf4b+FNFrMmHTGPO2ZgaZky+5G8FBTKfRop2ttnt9h+7smTJzI5U2ESke9vGcj/3qBN9767cdgyGSxBNdht/dw/TmbPoetHsPy2p8vMeqWXNu4Y/aa+BdRNYraV32dy/i/G5e093jPWDepACmCs9akXrnkCCgHYiGbYF8V/QXwm9D1jFo5VKAVzu+gSGEssN/3CXT3BOAZtA7x7QCjOl7DYBZbZTWSzBm+C0DWDPC3+qdDxkPaBKC8REeCZK04/hrH22DuHQzkkZxpc9G3TxCP5m7LnXEvgilemMf5aeNaI2Gep6vN9lOcsiGu9NzD8+oxF4ic6CYRFV8deNnT87kS5bQTYT+yiBmm2B/ZSSeox2H45FrfkF0/f2MITxI9mDNUa7ErObYMKDnQtshFjGTu816pRIouHxM1u4+K9eUT18e3rNjJhzhs+f1lLDtEi29ZI7o/1vejSqcMlAgoLJKPze9sF2CB2wNdt5QGM66Dwtzj08sGSf2zm371KKdq0u27Z4bipk1/YIcnnDmgOgGj/0fTJZVkwzF5kc9bqkwdUBfj0jw+IztjFAwETIMbY7msaYRaigBCyj3LGE5UR8xclD1D0KLY9ctjFVgw0cT4uSx5JfmQ5xr/U3j3sAf+ioSposeMTIs722aoJqYbm6WzYeWIYao+FoBbYitZNEaJ1t2CBhDe0T6OwjSKqX0G1KW6GgmlRVfZFjppzDUuoLGlqzARBZoE=";
  let clickAudio;

  const playClickSound = () => {
    try {
      if (!clickAudio) {
        clickAudio = new Audio(CLICK_SOUND_DATA);
        clickAudio.volume = 0.32;
      }
      clickAudio.currentTime = 0;
      void clickAudio.play().catch(() => {});
    } catch {}
  };

  const playPendingNavigationSound = () => {
    try {
      if (sessionStorage.getItem("__click") !== "1") return;
      sessionStorage.removeItem("__click");
      playClickSound();
    } catch {}
  };

  // A prerender starts with a clone of the tab's sessionStorage. When the
  // document is activated, Chrome swaps in the live storage containing the
  // flag written by the outgoing page. Recheck after that swap so prerendered
  // navigations play the same click sound as ordinary navigations.
  if (document.prerendering) {
    document.addEventListener(
      "prerenderingchange",
      playPendingNavigationSound,
      { once: true },
    );
  } else {
    playPendingNavigationSound();
  }

  const findClickable = (target) => {
    if (!(target instanceof Element)) return null;
    return target.closest(
      'a[href], button, summary, input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
    );
  };

  const isSameOriginNavigation = (anchor, event) => {
    // mailto:, tel: and javascript: URLs have an opaque "null" origin, so the
    // origin check below rejects them.
    if (anchor.getAttribute("href").startsWith("#")) return false;
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

  // Mouse users get immediate pointerdown feedback on local controls. Anchors
  // keep their native click navigation so prerender activation and
  // cross-document View Transitions can use the browser's normal lifecycle.
  // Touch users wait for click, which the browser cancels when a gesture turns
  // into a scroll or swipe.
  let lastMousePointerDown = null;
  let lastMousePointerDownAt = 0;

  const flagNextPageSound = () => {
    try {
      sessionStorage.setItem("__click", "1");
    } catch {}
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

      if (clickable instanceof HTMLAnchorElement) return;

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

      // pointerdown already played for this element, so the trailing click
      // stays silent. The marker is consumed so a later keyboard activation
      // of the same control still plays.
      if (
        clickable === lastMousePointerDown &&
        performance.now() - lastMousePointerDownAt < 1000
      ) {
        lastMousePointerDown = null;
        return;
      }

      if (
        clickable instanceof HTMLAnchorElement &&
        isSameOriginNavigation(clickable, e)
      ) {
        flagNextPageSound();
        return;
      }
      playClickSound();
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
          copyBtn.textContent = "Copy";
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
  // No-op on pages without [data-back-link]. Before this runs, the
  // template's static href is the fallback.
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
    } catch {}
  };

  setupBackLink();

  // ── Lazy-load Giscus ─────────────────────────────────────────
  const giscusEl = document.querySelector(".giscus");
  if (giscusEl) {
    const loadGiscus = () => {
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
  }
})();
