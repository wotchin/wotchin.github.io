(function () {
  function initTocToggle() {
    var toc = document.getElementById('toc');
    if (!toc) return;
    var toggle = toc.querySelector('.toc-toggle');
    var body = toc.querySelector('.toc-body');
    if (!toggle || !body) return;

    // Start collapsed on article pages to keep the reading column clean.
    toc.classList.add('is-collapsed');

    toggle.addEventListener('click', function () {
      var collapsed = toc.classList.toggle('is-collapsed');
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    });
  }

  function initHeaderShadow() {
    var header = document.getElementById('header');
    if (!header) return;
    var update = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function init() {
    initTocToggle();
    initHeaderShadow();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
