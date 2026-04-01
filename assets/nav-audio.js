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

  const findClickable = (target) => {
    if (!(target instanceof Element)) return null;
    return target.closest(
      'a[href], button, summary, input:not([type="hidden"]), select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
    );
  };

  const isSamePageAnchor = (anchor) => {
    const href = anchor.getAttribute("href");
    if (!href) return false;
    if (!href.startsWith("#")) return false;
    return true;
  };

  const isSameOriginNavigation = (anchor, event) => {
    const href = anchor.getAttribute("href");
    if (!href) return false;
    if (href.startsWith("#")) return false;
    if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return false;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return false;
    if (anchor.target && anchor.target !== "_self") return false;
    try {
      const url = new URL(anchor.href, window.location.href);
      return url.origin === window.location.origin;
    } catch {
      return false;
    }
  };

  // ── Reading progress ─────────────────────────────────────────
  const setupReadingProgress = () => {
    const track = document.querySelector(".reading-progress");
    const indicator = document.querySelector(".reading-progress-indicator");
    const marker = document.querySelector(".reading-progress-marker");
    if (!(indicator instanceof HTMLElement)) return;
    const SHOW_THRESHOLD_PX = 56;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
      if (track instanceof HTMLElement) {
        track.style.setProperty("--progress", `${(value * 100).toFixed(2)}%`);
        track.classList.toggle(
          "is-visible",
          max > 0 && window.scrollY > SHOW_THRESHOLD_PX,
        );
      }
      indicator.style.width = `${(value * 100).toFixed(2)}%`;
      if (marker instanceof HTMLElement) {
        marker.style.left = `${(value * 100).toFixed(2)}%`;
      }
    };
    const request = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };
    request();
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request);
    window.addEventListener("pageshow", request);
  };

  setupReadingProgress();

  // ── Lazy-load Giscus ─────────────────────────────────────────
  const giscusEl = document.querySelector(".giscus");
  if (giscusEl && !giscusEl.querySelector("iframe")) {
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
        if (entries[0].isIntersecting) {
          io.disconnect();
          loadGiscus();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(giscusEl);
  }

  // ── Pointer handling ─────────────────────────────────────────
  // On pointerdown: play the sound for local controls immediately.
  // For same-origin navigations, flag sessionStorage so the next
  // page can replay the sound during parsing as well.
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!e.isPrimary) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const clickable = findClickable(e.target);
      if (!clickable) return;

      if (clickable instanceof HTMLAnchorElement) {
        if (isSameOriginNavigation(clickable, e)) {
          try {
            sessionStorage.setItem("__click", "1");
          } catch {}
          return;
        }
        playClickSound();
        if (isSamePageAnchor(clickable)) return;
        return;
      }

      playClickSound();
    },
    { capture: true },
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.repeat) return;
      const clickable = findClickable(e.target);
      if (!clickable) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      if (clickable instanceof HTMLAnchorElement) {
        if (isSameOriginNavigation(clickable, e)) {
          try {
            sessionStorage.setItem("__click", "1");
          } catch {}
          return;
        }
        playClickSound();
        return;
      }
      playClickSound();
    },
    { capture: true },
  );
})();
