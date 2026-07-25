(function() {
  var grid = document.querySelector('[data-photo-grid]');
  var dlg = document.querySelector('[data-lightbox]');
  if (!grid || !dlg || typeof dlg.showModal !== 'function') return;

  var view = dlg.querySelector('[data-lb-img]');
  var caption = dlg.querySelector('[data-lb-caption]');
  var btnPrev = dlg.querySelector('[data-lb-prev]');
  var btnNext = dlg.querySelector('[data-lb-next]');
  var btnClose = dlg.querySelector('[data-lb-close]');

  var photos = Array.prototype.slice.call(grid.querySelectorAll('.photo'));
  var current = 0;

  var lensMap = document.querySelector('feImage[data-lens-map]');

  function armLens() {
    if (!lensMap) return;
    lensMap.setAttribute('href', lensMap.getAttribute('data-lens-map'));
    lensMap = null;
  }

  function syncLens() {
    if (!refracts.length) return;
    var img = view.getBoundingClientRect();
    if (!img.width || !img.height) return;

    var src = view.currentSrc || view.src;
    dlg.style.setProperty('--lb-src', 'url("' + src.replace(/["\\]/g, '\\$&') + '")');
    dlg.style.setProperty('--lb-bw', img.width + 'px');
    dlg.style.setProperty('--lb-bh', img.height + 'px');
    dlg.setAttribute('data-lb-glass', '');

    refracts.forEach(function(layer) {
      var box = layer.getBoundingClientRect();
      layer.style.setProperty('--lb-bx', (img.left - box.left) + 'px');
      layer.style.setProperty('--lb-by', (img.top - box.top) + 'px');
    });
  }

  view.addEventListener('load', syncLens);
  window.addEventListener('resize', syncLens);

  function show(i) {
    current = (i + photos.length) % photos.length;
    var thumb = photos[current].querySelector('img');
    view.src = thumb.getAttribute('data-full') || thumb.currentSrc || thumb.src;
    view.alt = thumb.alt;
    caption.textContent = (current + 1) + ' / ' + photos.length;
  }

  photos.forEach(function(btn, i) {
    btn.addEventListener('click', function() {
      armLens();
      show(i);
      dlg.showModal();
      syncLens();
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
    dlg.removeAttribute('data-lb-glass');
    var btn = photos[current];
    if (btn) btn.focus();
  });
})();
