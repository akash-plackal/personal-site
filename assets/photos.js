(function() {
  var grid = document.querySelector('[data-photo-grid]');
  var dlg = document.querySelector('[data-lightbox]');
  if (!grid || !dlg || typeof dlg.showModal !== 'function') return;

  var view = dlg.querySelector('[data-lb-img]');
  var status = dlg.querySelector('[data-lb-status]');
  var caption = dlg.querySelector('[data-lb-caption]');
  var btnPrev = dlg.querySelector('[data-lb-prev]');
  var btnNext = dlg.querySelector('[data-lb-next]');
  var btnClose = dlg.querySelector('[data-lb-close]');
  var photos = Array.prototype.slice.call(grid.querySelectorAll('.photo'));
  var current = 0;
  var request = 0;
  var loadingTimer = 0;
  var opener;
  var warmed = new Map();
  var loadedUrls = new Set();

  function clearLoading() {
    clearTimeout(loadingTimer);
    loadingTimer = 0;
    status.removeAttribute('data-loading');
    status.textContent = '';
  }

  function imageFor(url) {
    if (loadedUrls.has(url)) return Promise.resolve(true);
    if (warmed.has(url)) return warmed.get(url);

    var image = new Image();
    image.decoding = 'async';
    var promise = new Promise(function(resolve) {
      image.onload = function() {
        loadedUrls.add(url);
        // A decode rejection can happen even after a successful load (for
        // example, if the browser drops a decoded surface under memory
        // pressure). The loaded image is still usable as the lightbox source.
        if (typeof image.decode === 'function') {
          image.decode().then(function() { resolve(image); }, function() { resolve(image); });
        } else {
          resolve(image);
        }
      };
      image.onerror = function() { resolve(null); };
      image.src = url;
    }).then(function(result) {
      // Keep only in-flight Image objects alive. The browser's HTTP cache can
      // serve later requests without retaining every full-resolution bitmap.
      warmed.delete(url);
      return result;
    });

    warmed.set(url, promise);
    return promise;
  }

  function warmPhoto(index) {
    var photo = photos[(index + photos.length) % photos.length];
    var img = photo.querySelector('img');
    var url = img.getAttribute('data-full') || img.currentSrc || img.src;
    if (!loadedUrls.has(url)) imageFor(url);
  }

  function show(index) {
    current = (index + photos.length) % photos.length;
    var thumb = photos[current].querySelector('img');
    var id = ++request;
    var thumbnailUrl = thumb.currentSrc || thumb.src;
    var fullUrl = thumb.getAttribute('data-full') || thumbnailUrl;

    clearLoading();
    view.alt = thumb.alt;
    view.hidden = false;
    caption.textContent = (current + 1) + ' / ' + photos.length;

    if (fullUrl === thumbnailUrl || loadedUrls.has(fullUrl)) {
      view.src = fullUrl;
      warmPhoto(current + 1);
      warmPhoto(current - 1);
      return;
    }

    view.src = thumbnailUrl;
    loadingTimer = setTimeout(function() {
      if (id !== request || !dlg.open) return;
      status.setAttribute('data-loading', '');
      status.textContent = 'Loading full-size photo…';
    }, 250);

    imageFor(fullUrl).then(function(image) {
      if (id !== request || !dlg.open) return;
      clearLoading();
      if (!image) {
        status.textContent = 'Full-size photo failed to load; showing preview.';
        return;
      }
      view.src = fullUrl;
      warmPhoto(current + 1);
      warmPhoto(current - 1);
    });
  }

  photos.forEach(function(btn, index) {
    btn.addEventListener('pointerenter', function() { warmPhoto(index); }, { once: true });
    btn.addEventListener('focus', function() { warmPhoto(index); }, { once: true });
    btn.addEventListener('click', function() {
      opener = btn;
      dlg.showModal();
      show(index);
    });
  });

  btnPrev.addEventListener('click', function() { show(current - 1); });
  btnNext.addEventListener('click', function() { show(current + 1); });
  btnClose.addEventListener('click', function() { dlg.close(); });

  dlg.addEventListener('keydown', function(event) {
    if (event.key === 'ArrowLeft') { event.preventDefault(); show(current - 1); }
    else if (event.key === 'ArrowRight') { event.preventDefault(); show(current + 1); }
  });

  dlg.addEventListener('close', function() {
    request++;
    clearLoading();
    view.hidden = true;
    view.removeAttribute('src');
    if (opener) opener.focus({ preventScroll: true });
  });
})();
