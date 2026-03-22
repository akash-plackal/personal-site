(() => {
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
  // On pointerdown: flag sessionStorage + navigate immediately.
  // The NEW page's inline <script> picks up the flag and plays
  // the click sound during HTML parsing (with inherited user
  // activation from the navigation gesture).
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!e.isPrimary) return;
      if (e.pointerType !== "mouse") return;
      if (e.button !== 0) return;
      if (!(e.target instanceof Element)) return;
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");

      if (
        href &&
        (href.startsWith("/") || href.startsWith("./")) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.altKey &&
        (!a.target || a.target === "_self")
      ) {
        try { sessionStorage.setItem("__click", "1"); } catch {}
        window.location.href = href;
      }
    },
    { capture: true },
  );
})();
