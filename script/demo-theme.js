/*
  Единое состояние отображения демо-лендингов: тема и версия для
  слабовидящих.

  Файл подключается синхронно в <head> каждого демо — до CSS и первой
  отрисовки. Если применить тему после отрисовки, страница успевает
  мигнуть светлым фоном (особенно заметно в iframe на витрине).

  Источники состояния, по приоритету:
  1. ?preview=dark — витрина на главной. Тема жёстко тёмная, сообщения
     родителя о теме игнорируются: превью должно быть «картинкой»;
  2. postMessage от родительской страницы (vmlabs:display) — модалка и
     витрина передают тему сайта и общий режим a11y;
  3. localStorage — выбор темы в самом демо и общий с сайтом a11y;
  4. разметка — тёмная тема по умолчанию.

  data-a11y — тот же атрибут, что и на сайте. Стили режима лежат в
  css/demo-a11y.css, поэтому демо меняется и в мини-окне витрины, и в
  модалке, без отдельной кнопки внутри макета.
*/
(() => {
  'use strict';

  const root = document.documentElement;
  const params = new URLSearchParams(window.location.search);
  const preview = params.get('preview') === 'dark';
  /* Встроенное демо (витрина или модалка). Класс нужен до CSS, чтобы
     системная полоса прокрутки не успела мигнуть внутри iframe:
     html.is-embedded прячет её в css/demo-a11y.css. */
  const embedded = Boolean(window.parent && window.parent !== window);
  if (embedded) root.classList.add('is-embedded');
  const A11Y_KEY = 'vmlabs:a11y';
  const A11Y_ON = 'on';
  const A11Y_OFF = 'off';
  const THEME_KEY = root.getAttribute('data-theme-key') || 'vmlabs:demo-theme';
  const DEFAULT_THEME = 'dark';
  const READY_MESSAGE = 'vmlabs:demo-ready';
  const DISPLAY_MESSAGE = 'vmlabs:display';

  function readStorage(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  }

  function writeStorage(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* приватный режим */ }
  }

  function isTheme(value) {
    return value === 'light' || value === 'dark';
  }

  function themeColor(theme) {
    if (theme === 'light') {
      return root.getAttribute('data-theme-color-light') || '#f7f4ef';
    }
    return root.getAttribute('data-theme-color-dark') || '#0b0a24';
  }

  /* Кнопка темы в каждом демо устроена по-своему, но класс у неё
     общий. Состояние и подпись обновляем из одного места, чтобы после
     переключения из родителя иконка и aria не расходились с темой. */
  function renderToggles() {
    const isDark = root.getAttribute('data-theme') !== 'light';
    document.querySelectorAll('.theme-toggle').forEach((button) => {
      button.setAttribute('aria-pressed', String(isDark));
      button.setAttribute(
        'aria-label',
        isDark ? 'Включить светлую тему' : 'Включить тёмную тему'
      );
      button.setAttribute(
        'title',
        isDark ? 'Сейчас тёмная тема. Включить светлую' : 'Сейчас светлая тема. Включить тёмную'
      );
    });
  }

  function renderThemeMeta() {
    const theme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    root.style.colorScheme = theme;

    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) themeColorMeta.setAttribute('content', themeColor(theme));

    const colorSchemeMeta = document.querySelector('meta[name="color-scheme"]');
    if (colorSchemeMeta) {
      colorSchemeMeta.setAttribute('content', theme === 'dark' ? 'dark light' : 'light dark');
    }

    renderToggles();
  }

  function applyTheme(value, options) {
    if (!isTheme(value)) return;
    const next = preview ? 'dark' : value;
    const changed = root.getAttribute('data-theme') !== next;

    root.setAttribute('data-theme', next);
    if (options && options.persist) writeStorage(THEME_KEY, next);
    if (changed || (options && options.forceRender)) renderThemeMeta();
    else renderToggles();
  }

  function applyA11y(value) {
    const isOn = value === A11Y_ON;
    const changed = root.hasAttribute('data-a11y') !== isOn;

    if (isOn) root.setAttribute('data-a11y', A11Y_ON);
    else root.removeAttribute('data-a11y');

    if (changed) {
      document.dispatchEvent(new CustomEvent('vmlabs:a11ychange', {
        detail: { on: isOn }
      }));
    }
  }

  function toggleTheme() {
    if (preview) return;
    applyTheme(
      root.getAttribute('data-theme') === 'light' ? 'dark' : 'light',
      { persist: true }
    );
  }

  /* 1. Тема до первой отрисовки. */
  if (preview) {
    root.setAttribute('data-preview', 'dark');
    applyTheme('dark', { forceRender: true });
  } else {
    const savedTheme = readStorage(THEME_KEY);
    const markupTheme = root.getAttribute('data-theme');
    applyTheme(
      isTheme(savedTheme) ? savedTheme : (isTheme(markupTheme) ? markupTheme : DEFAULT_THEME),
      { forceRender: true }
    );
  }

  /* 2. Режим для слабовидящих: сначала URL (удобно для проверки),
     затем сохранённый выбор сайта, затем системное reduced-motion —
     ровно так же, как его вычисляет script.js на главной. */
  const a11yParam = params.get('a11y');
  const savedA11y = readStorage(A11Y_KEY);

  if (a11yParam === A11Y_ON || a11yParam === A11Y_OFF) {
    applyA11y(a11yParam);
  } else if (savedA11y === A11Y_ON || savedA11y === A11Y_OFF) {
    applyA11y(savedA11y);
  } else if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyA11y(A11Y_ON);
  }

  renderToggles();

  /* Клик по кнопке темы внутри демо. Делегирование работает и до
     появления body: обработчик навешивается сразу, а кнопка находится
     в момент клика. */
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (!target.closest('.theme-toggle')) return;
    event.preventDefault();
    toggleTheme();
  }, true);

  /* Состояние от родителя: и витрина, и модалка шлют один и тот же
     vmlabs:display. Тема в превью зафиксирована, a11y применяется
     всегда. */
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin && event.origin !== 'null') return;
    const data = event.data;
    if (!data || typeof data !== 'object' || data.type !== DISPLAY_MESSAGE) return;

    applyA11y(data.a11y);
    if (!preview) applyTheme(data.theme);
  });

  function announceReady() {
    if (!window.parent || window.parent === window) return;
    root.classList.add('is-embedded');
    try {
      window.parent.postMessage({ type: READY_MESSAGE }, window.location.origin);
    } catch {
      /* Родитель на file:// — не критично: display-состояние также
         приходит напрямую через доступ к contentDocument. */
    }
  }

  function init() {
    renderThemeMeta();
    renderToggles();
    announceReady();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
    window.addEventListener('load', announceReady, { once: true });
  } else {
    init();
  }

  /* Небольшой публичный API для страниц демо и отладки. */
  window.VMLabsDemo = {
    preview,
    get theme() { return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; },
    get a11y() { return root.hasAttribute('data-a11y'); },
    setTheme(value) { applyTheme(value, { persist: true }); },
    toggleTheme,
    setA11y(value) { applyA11y(value); }
  };
})();
