/* Photos lightbox — opens a full-size photo in a modal <dialog> with a
   blurred, liquid-glass backdrop. Reads the existing grid thumbnails, so
   there is no separate image list to keep in sync. No dependencies. */
(function () {
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

  function show(i) {
    current = (i + photos.length) % photos.length;
    var thumb = photos[current].querySelector('img');
    view.src = thumb.currentSrc || thumb.src;
    view.alt = thumb.alt;
    caption.textContent = (current + 1) + ' / ' + photos.length;
  }

  photos.forEach(function (btn, i) {
    btn.addEventListener('click', function () {
      show(i);
      dlg.showModal();
    });
  });

  btnPrev.addEventListener('click', function () { show(current - 1); });
  btnNext.addEventListener('click', function () { show(current + 1); });
  btnClose.addEventListener('click', function () { dlg.close(); });

  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
  });

  /* A click that lands on the dialog itself (the empty area around the
     image and controls) dismisses the viewer. */
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg) dlg.close();
  });

  /* Return focus to the photo that opened the viewer. */
  dlg.addEventListener('close', function () {
    var btn = photos[current];
    if (btn) btn.focus();
  });
})();
