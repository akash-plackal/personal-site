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
  var opener;

  function finish(id, loaded) {
    if (id !== request || !dlg.open) return;
    view.hidden = !loaded;
    status.removeAttribute('data-loading');
    status.textContent = loaded ? '' : 'Couldn’t load this photo.';
  }

  function show(i) {
    current = (i + photos.length) % photos.length;
    var thumb = photos[current].querySelector('img');
    var id = ++request;
    view.hidden = true;
    status.setAttribute('data-loading', '');
    status.textContent = 'Loading photo…';
    caption.textContent = (current + 1) + ' / ' + photos.length;
    view.alt = thumb.alt;
    view.src = thumb.getAttribute('data-full') || thumb.currentSrc || thumb.src;
    // Wait for pixels to be ready, and ignore stale results when paging quickly.
    view.decode().then(function() { finish(id, true); }, function() { finish(id, false); });
  }

  photos.forEach(function(btn, i) {
    btn.addEventListener('click', function() {
      opener = btn;
      dlg.showModal();
      show(i);
    });
  });

  btnPrev.addEventListener('click', function() { show(current - 1); });
  btnNext.addEventListener('click', function() { show(current + 1); });
  btnClose.addEventListener('click', function() { dlg.close(); });

  dlg.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
  });

  dlg.addEventListener('close', function() {
    if (dlg.open) return;
    request++;
    view.hidden = true;
    view.removeAttribute('src');
    status.removeAttribute('data-loading');
    status.textContent = '';
    if (opener) opener.focus({ preventScroll: true });
  });
})();
