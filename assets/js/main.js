/* ASK CONNECT – gemeinsames Seitenskript
   Wird auf allen Seiten geladen (defer). Alle Blöcke prüfen selbst,
   ob die zugehörigen Elemente vorhanden sind. */
(function () {
    'use strict';

    /* ---------- Partikel-Hintergrund ---------- */
    var particles = document.getElementById('particles');
    if (particles && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        for (var i = 0; i < 40; i++) {
            var p = document.createElement('div');
            p.className = 'particle';
            p.style.left = (Math.random() * 100) + '%';
            p.style.animationDelay = (Math.random() * 8) + 's';
            p.style.animationDuration = (Math.random() * 3 + 5) + 's';
            particles.appendChild(p);
        }
    }

    /* ---------- Roboter im Hero ----------
       Fehlt die Bilddatei, wird die Figur ausgeblendet statt ein kaputtes
       Bildsymbol im Hero stehen zu lassen. */
    var heroBox = document.getElementById('heroBot');
    var heroVideo = document.getElementById('heroBotVideo');
    var heroImage = heroBox ? heroBox.querySelector('img') : null;

    function heroStill() {
        if (heroBox) heroBox.classList.add('still');
        if (heroVideo) {
            try { heroVideo.pause(); } catch (e) { /* egal */ }
        }
    }

    if (heroBox && heroImage) {
        var hideBot = function () { heroBox.style.display = 'none'; };
        heroImage.addEventListener('error', hideBot);
        /* Dieses Skript läuft mit `defer`, das Fehlerereignis ist zu dem
           Zeitpunkt oft schon durch. Deshalb zusätzlich der Nachtest:
           fertig geladen, aber ohne Breite = die Datei fehlt. */
        if (heroImage.complete && heroImage.naturalWidth === 0) hideBot();
    }

    /* Das Video wiegt mehrere Megabyte. Es wird deshalb nur geladen, wenn die
       Figur sichtbar ist (ab Tablet-Breite) und Bewegung nicht abbestellt
       wurde – sonst bleibt es beim Standbild. */
    var botSichtbar = window.matchMedia('(min-width: 769px)').matches;
    var ruhigerModus = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (heroVideo && (!botSichtbar || ruhigerModus)) {
        heroStill();
    } else if (heroVideo) {
        /* Safari spielt VP9-WebM ab, ignoriert aber den Alphakanal – der
           Roboter säße dort in einem schwarzen Kasten. Statt nach Browsern zu
           raten, wird ein Einzelbild auf eine Leinwand gezeichnet und eine
           Ecke ausgelesen: ist sie undurchsichtig, kann der Browser keine
           Transparenz und wir zeigen das Standbild. */
        heroVideo.muted = true;   // manche Browser starten sonst nicht

        heroVideo.addEventListener('error', heroStill);

        heroVideo.addEventListener('loadeddata', function () {
            try {
                var probe = document.createElement('canvas');
                probe.width = 8;
                probe.height = 8;
                var ctx = probe.getContext('2d');
                /* Linke obere Ecke des Videos – dort ist der Roboter nie. */
                ctx.clearRect(0, 0, 8, 8);
                ctx.drawImage(heroVideo, 0, 0, 8, 8, 0, 0, 8, 8);
                var alpha = ctx.getImageData(1, 1, 1, 1).data[3];
                if (alpha > 20) heroStill();
            } catch (e) {
                /* Leinwand nicht lesbar: lieber das Standbild als ein
                   möglicherweise schwarzer Kasten. */
                heroStill();
            }
        }, { once: true });

        heroVideo.src = heroVideo.getAttribute('data-src');
        var abspielen = heroVideo.play();
        if (abspielen && typeof abspielen.catch === 'function') {
            abspielen.catch(function () { heroStill(); });
        }
    }

    /* ---------- Header-Scroll & Scroll-to-Top ---------- */
    var header = document.querySelector('.site-header');
    var scrollTopBtn = document.getElementById('scrollTop');
    var ticking = false;

    function onScroll() {
        var scrolled = window.scrollY > 80;
        if (header) header.classList.toggle('scrolled', scrolled);
        if (scrollTopBtn) scrollTopBtn.classList.toggle('visible', window.scrollY > 400);
        ticking = false;
    }

    window.addEventListener('scroll', function () {
        if (!ticking) {
            window.requestAnimationFrame(onScroll);
            ticking = true;
        }
    }, { passive: true });
    onScroll();

    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    /* ---------- Mobiles Menü ---------- */
    var burger = document.getElementById('burger');
    var mobileMenu = document.getElementById('mobileMenu');
    var overlay = document.getElementById('menuOverlay');

    function closeMenu() {
        if (!burger) return;
        burger.classList.remove('active');
        burger.setAttribute('aria-expanded', 'false');
        mobileMenu.classList.remove('active');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (burger && mobileMenu && overlay) {
        burger.addEventListener('click', function () {
            var open = !mobileMenu.classList.contains('active');
            burger.classList.toggle('active', open);
            burger.setAttribute('aria-expanded', String(open));
            mobileMenu.classList.toggle('active', open);
            overlay.classList.toggle('active', open);
            document.body.style.overflow = open ? 'hidden' : '';
        });

        overlay.addEventListener('click', closeMenu);
        mobileMenu.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', closeMenu);
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeMenu();
        });
    }

    /* ---------- Aktiven Navigationspunkt markieren ---------- */
    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    document.querySelectorAll('.nav-links a, .mobile-nav-links a').forEach(function (a) {
        var href = (a.getAttribute('href') || '').split('#')[0].toLowerCase();
        if (href && href === page) a.classList.add('active');
    });

    /* ---------- Einblend-Animationen ---------- */
    var revealables = document.querySelectorAll('.feature-card, .benefit-card, .team-member, .contact-info-card');
    if (revealables.length && 'IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

        revealables.forEach(function (el) {
            el.classList.add('reveal');
            observer.observe(el);
        });
    }

    var steps = document.querySelectorAll('.process-step');
    if (steps.length && 'IntersectionObserver' in window) {
        var stepObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry, idx) {
                if (entry.isIntersecting) {
                    setTimeout(function () { entry.target.classList.add('visible'); }, idx * 150);
                    stepObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
        steps.forEach(function (el) { stepObserver.observe(el); });
    } else {
        steps.forEach(function (el) { el.classList.add('visible'); });
    }

    /* ---------- FAQ ---------- */
    var faqItems = document.querySelectorAll('.faq-item');

    document.querySelectorAll('.faq-category').forEach(function (cat) {
        cat.addEventListener('click', function () {
            document.querySelectorAll('.faq-category').forEach(function (c) { c.classList.remove('active'); });
            cat.classList.add('active');
            var target = cat.getAttribute('data-category');
            faqItems.forEach(function (item) {
                var match = target === 'all' || item.getAttribute('data-category') === target;
                item.classList.toggle('hidden', !match);
                if (!match) item.classList.remove('active');
            });
        });
    });

    faqItems.forEach(function (item) {
        var q = item.querySelector('.faq-question');
        if (!q) return;
        q.addEventListener('click', function () {
            var wasActive = item.classList.contains('active');
            faqItems.forEach(function (other) { other.classList.remove('active'); });
            item.classList.toggle('active', !wasActive);
        });
    });
})();
