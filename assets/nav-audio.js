(() => {
  const DATA =
    "T2dnUwACAAAAAAAAAACk4ALfAAAAAJIizQoBE09wdXNIZWFkAQF4AMBdAAAAAABPZ2dTAAAAAAAAAAAAAKTgAt8BAAAASNgoLwE9T3B1c1RhZ3MMAAAATGF2ZjYxLjcuMTAwAQAAAB0AAABlbmNvZGVyPUxhdmM2MS4xOS4xMDEgbGlib3B1c09nZ1MABAIsAAAAAAAApOAC3wIAAAAuiuulDDZYKiIeMFQjICEoNtj1QN5eO51zYK9Vl95H0pqyRi64bIU4rMf4b+FNFrMmHTGPO2ZgaZky+5G8FBTKfRop2ttnt9h+7smTJzI5U2ESke9vGcj/3qBN9767cdgyGSxBNdht/dw/TmbPoetHsPy2p8vMeqWXNu4Y/aa+BdRNYraV32dy/i/G5e093jPWDepACmCs9akXrnkCCgHYiGbYF8V/QXwm9D1jFo5VKAVzu+gSGEssN/3CXT3BOAZtA7x7QCjOl7DYBZbZTWSzBm+C0DWDPC3+qdDxkPaBKC8REeCZK04/hrH22DuHQzkkZxpc9G3TxCP5m7LnXEvgilemMf5aeNaI2Gep6vN9lOcsiGu9NzD8+oxF4ic6CYRFV8deNnT87kS5bQTYT+yiBmm2B/ZSSeox2H45FrfkF0/f2MITxI9mDNUa7ErObYMKDnQtshFjGTu816pRIouHxM1u4+K9eUT18e3rNjJhzhs+f1lLDtEi29ZI7o/1vejSqcMlAgoLJKPze9sF2CB2wNdt5QGM66Dwtzj08sGSf2zm371KKdq0u27Z4bipk1/YIcnnDmgOgGj/0fTJZVkwzF5kc9bqkwdUBfj0jw+IztjFAwETIMbY7msaYRaigBCyj3LGE5UR8xclD1D0KLY9ctjFVgw0cT4uSx5JfmQ5xr/U3j3sAf+ioSposeMTIs722aoJqYbm6WzYeWIYao+FoBbYitZNEaJ1t2CBhDe0T6OwjSKqX0G1KW6GgmlRVfZFjppzDUuoLGlqzARBZoE=";
  const AC = window.AudioContext || window.webkitAudioContext;
  const FALLBACK = document
    .createElement("audio")
    .canPlayType('audio/ogg; codecs="opus"')
    ? "data:audio/ogg;base64," + DATA
    : "/assets/click-sound.wav";
  let ctx,
    buf,
    decoding = false,
    last = 0;
  const fallback = new Audio(FALLBACK);
  const V = 0.24,
    THROTTLE = 28;
  fallback.preload = "auto";
  fallback.volume = V;

  const boot = () => {
    if (!AC || buf || decoding) return;
    decoding = true;
    ctx || (ctx = new AC());
    try {
      const b = atob(DATA),
        u = new Uint8Array(b.length);
      for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
      ctx
        .decodeAudioData(u.buffer.slice(0))
        .then((x) => {
          buf = x;
        })
        .catch(() => {})
        .finally(() => {
          decoding = false;
        });
    } catch {
      decoding = false;
    }
  };

  const playFallback = () => {
    try {
      fallback.currentTime = 0;
      const p = fallback.play();
      p && p.catch && p.catch(() => {});
    } catch {}
  };

  const play = () => {
    const now = performance.now();
    if (now - last < THROTTLE) return;
    last = now;
    if (!AC) {
      playFallback();
      return;
    }
    ctx || (ctx = new AC());
    const fire = () => {
      if (!buf) {
        playFallback();
        return;
      }
      try {
        const s = ctx.createBufferSource(),
          g = ctx.createGain();
        g.gain.value = V;
        s.buffer = buf;
        s.connect(g).connect(ctx.destination);
        s.start(0);
      } catch {
        playFallback();
      }
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(fire).catch(playFallback);
      return;
    }
    fire();
  };

  const CLICK_KEY = "__click_ts";
  const CLICK_TTL_MS = 1600;
  const markClick = () => {
    try {
      sessionStorage.setItem(CLICK_KEY, String(Date.now()));
    } catch {}
  };

  const playPending = () => {
    let ts = 0;
    try {
      ts = Number(sessionStorage.getItem(CLICK_KEY) || 0);
      sessionStorage.removeItem(CLICK_KEY);
    } catch {}
    if (!ts || Date.now() - ts > CLICK_TTL_MS) return;
    play();
  };

  const setupReadingProgress = () => {
    const track = document.querySelector(".reading-progress");
    const indicator = document.querySelector(".reading-progress-indicator");
    const marker = document.querySelector(".reading-progress-marker");
    if (!(indicator instanceof HTMLElement)) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
      if (track instanceof HTMLElement) {
        track.style.setProperty("--progress", `${(value * 100).toFixed(2)}%`);
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

  boot();
  playPending();
  window.addEventListener("pageshow", playPending);
  setupReadingProgress();

  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!e.isPrimary || !(e.target instanceof Element)) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const a = e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (
        e.pointerType === "mouse" &&
        href &&
        (href.startsWith("/") || href.startsWith("./")) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey &&
        !e.altKey &&
        a.target !== "_blank"
      ) {
        if (
          href === "/" &&
          window.location.pathname !== "/" &&
          window.history.length > 1 &&
          document.referrer
        ) {
          try {
            if (new URL(document.referrer).origin === window.location.origin) {
              markClick();
              window.history.back();
              return;
            }
          } catch {}
        }
        markClick();
        window.location.href = href;
        return;
      }
      play();
    },
    { capture: true },
  );
})();
