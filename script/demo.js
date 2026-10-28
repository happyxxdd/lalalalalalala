/*
  Общее поведение демо-макетов: переключение темы, режим для
  слабовидящих, собственный курсор и связь с родительской модалкой.

  Скрипт подключается с defer: DOM уже разобран, но до DOMContentLoaded.
  Если файл когда-нибудь подключат в <head> без defer, init() сам
  дождётся DOMContentLoaded — логика от места подключения не зависит.
*/
(() => {
  'use strict';

  const THEME_LIGHT = 'light';
  const THEME_DARK = 'dark';
  const A11Y_ON = 'on';
  const A11Y_OFF = 'off';
  const VIEW_TRANSITION = 'view';
  const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
  const FINE_POINTER_QUERY = '(pointer: fine)';
  const DISPLAY_MESSAGE = 'vmlabs:display';
  const READY_MESSAGE = 'vmlabs:demo-ready';
  const CURSOR_HOTSPOT_X = 10;
  const CURSOR_HOTSPOT_Y = 1;

  const root = document.documentElement;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const darkColor = root.dataset.themeColorDark || '#0b0a24';
  const lightColor = root.dataset.themeColorLight || '#F7F4EF';
  /* View Transition нужен только там, где фон — градиент. Курс на
     твёрдом фоне переключается обычным CSS-transition, и лишний
     кроссфейд ему не нужен. */
  const useViewTransition = root.dataset.themeTransition === VIEW_TRANSITION;

  const isLight = () => root.getAttribute('data-theme') === THEME_LIGHT;

  function initTheme() {
    const toggle = document.querySelector('.theme-toggle');

    function renderToggle() {
      if (!toggle) return;
      toggle.setAttribute('aria-pressed', String(isLight()));
      toggle.setAttribute(
        'aria-label',
        isLight() ? 'Включить тёмную тему' : 'Включить светлую тему'
      );
    }

    function renderMeta() {
      if (!themeMeta) return;
      themeMeta.setAttribute('content', isLight() ? lightColor : darkColor);
    }

    function commitTheme(value) {
      root.setAttribute('data-theme', value);
      root.style.colorScheme = value;
      renderToggle();
      renderMeta();
    }

    let themeTransition = null;
    const clearThemeTransition = () => {
      themeTransition = null;
      root.classList.remove('is-theme-transitioning');
    };

    function applyTheme(value) {
      if (value !== THEME_LIGHT && value !== THEME_DARK) return;
      if (root.getAttribute('data-theme') === value) return;
      /* Пока идёт кроссфейд, второй клик игнорируем: наложение двух
         View Transition даёт двойной снимок и рывок в конце. */
      if (themeTransition) return;

      const reduceMotion = window.matchMedia(REDUCED_MOTION_QUERY).matches;
      const canAnimate = useViewTransition
        && !reduceMotion
        && !root.hasAttribute('data-a11y')
        && typeof document.startViewTransition === 'function';

      if (!canAnimate) {
        commitTheme(value);
        return;
      }

      try {
        root.classList.add('is-theme-transitioning');
        themeTransition = document.startViewTransition(() => commitTheme(value));
        themeTransition.finished.then(clearThemeTransition, clearThemeTransition);
      } catch {
        clearThemeTransition();
        commitTheme(value);
      }
    }

    function applyA11y(value) {
      if (value !== A11Y_ON && value !== A11Y_OFF) return;
      if (value === A11Y_ON) root.setAttribute('data-a11y', A11Y_ON);
      else root.removeAttribute('data-a11y');
    }

    renderToggle();
    renderMeta();

    if (toggle) {
      toggle.addEventListener('click', () => {
        applyTheme(isLight() ? THEME_DARK : THEME_LIGHT);
      });
    }

    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type !== DISPLAY_MESSAGE) return;

      /* a11y применяем ДО темы: от него зависит, можно ли анимировать
         переход. В превью (?preview=dark) тему родителя игнорируем —
         превью всегда тёмное, — но a11y применяем всегда. */
      applyA11y(data.a11y);
      if (root.getAttribute('data-preview') !== THEME_DARK) applyTheme(data.theme);
    });
  }

  function initCursor() {
    const cursorEl = document.getElementById('cursor');
    const finePointer = window.matchMedia(FINE_POINTER_QUERY).matches;
    if (!cursorEl || !finePointer) return;

    /* Нативный курсор прячем только сейчас: CSS ждёт html.is-fine.
       Если JS выключен или курсор не создан, класса нет — системный
       указатель остаётся видимым. */
    root.classList.add('is-fine');

    let pendingX = null;
    let pendingY = null;
    let rafId = 0;

    const flushCursor = () => {
      rafId = 0;
      if (pendingX === null || pendingY === null) return;
      cursorEl.style.transform =
        `translate3d(${pendingX - CURSOR_HOTSPOT_X}px, ${pendingY - CURSOR_HOTSPOT_Y}px, 0)`;
      pendingX = null;
      pendingY = null;
    };

    /* Позиция обновляется один раз за кадр: так курсор идёт вплотную
       за системным, без «догоняния» на каждом pointermove. */
    window.addEventListener('pointermove', (event) => {
      pendingX = event.clientX;
      pendingY = event.clientY;
      if (!rafId) rafId = requestAnimationFrame(flushCursor);
    }, { passive: true });

    window.addEventListener('pointerdown', () => cursorEl.classList.add('is-down'));
    window.addEventListener('pointerup', () => cursorEl.classList.remove('is-down'));

    document.addEventListener('pointerover', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      cursorEl.classList.toggle('is-hover', Boolean(target.closest('a, button')));
    });

    document.addEventListener('mouseleave', () => cursorEl.classList.add('is-hidden'));
    document.addEventListener('mouseenter', () => cursorEl.classList.remove('is-hidden'));
  }

  function initEmbedded() {
    try {
      if (!window.parent || window.parent === window) return;
      /* Демо встроено как iframe — прячем собственную кнопку темы,
         в родительской модалке есть своя. */
      root.classList.add('is-embedded');
      window.parent.postMessage({ type: READY_MESSAGE }, window.location.origin);
    } catch {
      /* Родитель на другом origin или file:// — демо всё равно
         работает как отдельная страница. */
    }
  }

  /* Появление блоков при скролле. Если IntersectionObserver недоступен
     или включён reduced motion — показываем всё сразу, без анимации:
     контент не должен зависеть от поддержки API. */
  function initReveal() {
    const items = Array.from(document.querySelectorAll('.reveal'));
    if (!items.length) return;

    if (window.matchMedia(REDUCED_MOTION_QUERY).matches
        || typeof window.IntersectionObserver !== 'function') {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

    items.forEach((el) => observer.observe(el));
  }

  /* Профессиональные мелочи навигации: тень у прилипшей шапки и
     подсветка активного раздела. Работает без библиотек и не мешает
     страницам, где шапка не sticky. */
  function initHeaderState() {
    const header = document.querySelector('.topline, .masthead');
    const links = Array.from(document.querySelectorAll('.nav a[href^="#"], .foot__nav a[href^="#"]'));
    const sections = [];
    links.forEach((link) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target && sections.indexOf(target) === -1) sections.push(target);
    });

    function update() {
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 6);
      let current = '';
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= 140) current = section.id;
      });
      links.forEach((link) => {
        const active = link.getAttribute('href') === `#${current}`;
        link.classList.toggle('is-active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  /* Демо-путь покупки: кнопки «Купить / Записаться» открывают диалог
     оформления. Настоящей оплаты нет — после отправки форма честно
     показывает, что это макет, а не рабочая касса. */
  function initCheckout() {
    const modal = document.getElementById('checkout');
    if (!modal) return;

    const panel = modal.querySelector('.checkout__panel');
    const body = modal.querySelector('.checkout__body');
    const success = modal.querySelector('.checkout__success');
    const form = modal.querySelector('.checkout__form');
    const openers = Array.from(document.querySelectorAll('[data-buy]'));
    let lastFocused = null;

    function open(event) {
      if (event) event.preventDefault();
      lastFocused = document.activeElement;
      if (body) body.hidden = false;
      if (success) success.hidden = true;
      if (form) form.reset();
      modal.hidden = false;
      document.body.classList.add('is-checkout-open');
      if (panel) panel.focus();
    }

    function close() {
      modal.hidden = true;
      document.body.classList.remove('is-checkout-open');
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    }

    openers.forEach((el) => el.addEventListener('click', open));
    modal.querySelectorAll('[data-checkout-close]').forEach((el) => {
      el.addEventListener('click', close);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !modal.hidden) close();
    });

    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (typeof form.reportValidity === 'function' && !form.reportValidity()) return;

        const submit = form.querySelector('.checkout__submit');
        const label = submit ? submit.textContent : '';
        if (submit) {
          submit.disabled = true;
          submit.textContent = 'Оформляем…';
        }

        /* Небольшая задержка имитирует запрос к кассе: в реальном
           проекте здесь был бы ответ платёжного провайдера. */
        window.setTimeout(() => {
          if (body) body.hidden = true;
          if (success) {
            success.hidden = false;
            const heading = success.querySelector('h2');
            if (heading) heading.focus();
          }
          if (submit) {
            submit.disabled = false;
            submit.textContent = label;
          }
        }, 450);
      });
    }
  }

  function init() {
    initTheme();
    initCursor();
    initEmbedded();
    initReveal();
    initHeaderState();
    initCheckout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
