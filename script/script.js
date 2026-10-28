/* ============================================================
   VM Labs — script.js
   ------------------------------------------------------------
   IIFE + strict mode. Никакого глобального состояния.
   Изменения относительно предыдущей версии:
   1) mp3 грузится лениво (setEnabled(true) / enabled при init).
   2) focus-trap в мобильном меню (#site-nav).
   3) Магические числа вынесены в CONFIG.
   4) Расширены null/undefined-проверки.
   5) CONFIG и FALLBACK_CONTACT заморожены (иммутабельность).
   6) shouldRunAmbientRain учитывает deviceMemory и отсутствие
      navigator.connection (Firefox).
   7) Все Promise/fetch обработаны, fallback не падает.
   8) Канал связи НЕ выбран по умолчанию: пользователь обязан
      выбрать сам, поле контакта появляется только после выбора,
      валидация отдельно подсвечивает группу каналов и поле
      контакта. Паттерны каналов намеренно мягкие — задача не
      отсеять «неправильные» никнеймы, а отловить явный мусор.
   9) Метка блока подтверждения подменяется под выбранный канал:
      «подтверждение в Telegram» / «подтверждение в MAX».
  10) Открытие документов не зависит от целостности JS: ссылки
      на документы всегда имеют target="_blank", а обработчик
      клика вызывает preventDefault() только после того, как
      убедился в наличии модалки в DOM; любое исключение при
      открытии откатывается к обычной навигации.
  11) Подсказки над кнопками управления (звук, a11y, тема, сворачивание
      шапки) показываются при каждом заходе, пока пользователь не
      ответит «Да» на «Скрыть подсказки?» — initFirstVisitHints().
  12) Демо-модалка (#modal-demo) своих переключателей не имеет:
      тема и версия для слабовидящих берутся с сайта в момент
      открытия и прокидываются в iframe через postMessage
      (vmlabs:display); при смене режима a11y открытая модалка
      обновляется через MutationObserver.
  13) initDuoProgress: класс .is-passed теперь ставится односторонне.
  14) Sound: AudioContext создаётся и резюмируется ТОЛЬКО внутри
      обработчика первого жеста (pointerdown / keydown) или в
      setEnabled(true).
  15) initProcessScroll: на мобиле карточки процесса проявляются
      раньше — rootMargin по нижней кромке увеличен.
  16) initProcessScroll: выбор ветки «sticky vs observer» по
      matchMedia '(min-width: 861px)'.
  17) ScrollLock: единая точка управления блокировкой скролла
      body при открытой модалке. Раньше openByName / preloader
      дёргали document.body.classList.add/remove('is-locked')
      напрямую — без сохранения позиции скролла это не работает
      на iOS: body становится position: fixed, страница «прыгает»
      в начало. Теперь ScrollLock.lock() сохраняет scrollY в
      CSS-переменную --scroll-lock-y, а unlock() возвращает прежнюю
      позицию через window.scrollTo. Плюс к этому на .modal и
      .modal__panel в CSS включён overscroll-behavior: contain —
      «скролл-цепочка» не перетекает на фон на границах.
   ============================================================ */
(() => {
  'use strict';

  /* ============================================================
     КОНФИГ
     Все настраиваемые значения — здесь. Объект заморожен, чтобы
     случайная мутация не «протекла» между модулями.
     ============================================================ */
  const CONFIG = Object.freeze({
    PRELOAD_DURATION_MS: 1000,
    PRELOAD_MIN_MS: 700,
    PRELOAD_HARD_TIMEOUT_MS: 3000,
    PRELOAD_JITTER_PERIOD_MS: 110,
    PRELOAD_JITTER_AMPLITUDE: 0.008,
    PRELOAD_SETTLE_MS: 220,

    DRAIN_ACCEL: 0.9,
    DRAIN_EXIT_MS: 1050,
    DRAIN_FADE_LEAD_MS: 400,

    LETTER_TYPE_MS: 190,
    LETTER_TYPE_JITTER_MS: 120,
    LETTER_TYPE_START_MS: 420,

    BURST_MIN: 6,
    BURST_MAX: 9,
    BURST_LIFE_MS: 850,
    MAX_PARTICLES: 140,
    CURSOR_PARTICLE_GRAVITY: 0.09,
    CURSOR_PARTICLE_UP_BIAS: 1.4,
    CURSOR_PARTICLE_SPEED_MIN: 0.8,
    CURSOR_PARTICLE_SPEED_RANGE: 1.8,
    CURSOR_PARTICLE_LIFE_MIN: 0.7,
    CURSOR_PARTICLE_LIFE_RANGE: 0.5,
    CURSOR_PARTICLE_SIZE_MIN: 10,
    CURSOR_PARTICLE_SIZE_RANGE: 4,
    CURSOR_PARTICLE_ALPHA: 0.85,
    CURSOR_DPR_MAX: 2,

    RAIN_FONT_SIZE: 15,
    RAIN_SPEED_PRELOAD: 6.6,
    RAIN_SPEED_AMBIENT: 0.42,
    RAIN_SPEED_PROCESS: 2.4,
    RAIN_SPEED_JITTER_MIN: 0.6,
    RAIN_SPEED_JITTER_RANGE: 0.8,
    RAIN_GLYPH_MUTATION_CHANCE: 0.02,
    RAIN_RESET_OFFSET: 200,
    RAIN_DPR_MAX: 1.5,
    RAIN_BODY_ALPHA_FACTOR: 0.6,
    RAIN_LIGHT_ALPHA_BOOST: 2.5,
    RAIN_LIGHT_HEAD_RGB: '13, 99, 56',
    RAIN_LIGHT_BODY_RGB: '21, 128, 61',
    RAIN_DARK_HEAD_RGB: '214, 255, 226',
    RAIN_DARK_BODY_RGB: '109, 235, 146',
    RAIN_HEAD_ALPHA: 1,
    RAIN_MAX_LEN_DEFAULT: 16,
    RAIN_MIN_LEN_DEFAULT: 6,

    AMBIENT_ALPHA: 0.13,
    AMBIENT_GAP: 34,
    AMBIENT_DENSITY: 0.5,
    AMBIENT_FONT_SIZE: 14,
    AMBIENT_MIN_LEN: 3,
    AMBIENT_MAX_LEN: 8,
    AMBIENT_MIN_WIDTH: 768,
    AMBIENT_MIN_CORES: 4,
    AMBIENT_MIN_MEMORY_GB: 4,

    PROCESS_ALPHA: 0.35,
    /* Мягкая кромка дождя у границ секции «Процесс» (px): когда
       верхняя или нижняя граница секции попадает в кадр, глифы не
       обрываются линией, а растворяются на этом расстоянии. */
    PROCESS_RAIN_FADE: 140,

    PRELOAD_RAIN_FONT_SIZE: 16,
    PRELOAD_RAIN_GAP: 4,
    PRELOAD_RAIN_MIN_LEN: 8,
    PRELOAD_RAIN_MAX_LEN: 20,

    COIN_RADIUS: 15.5,
    COIN_SHOW_AT: 240,

    DUO_ANCHOR_RATIO: 0.6,
    DUO_ROW_RATIO: 0.35,

    CURSOR_HOT_X: 10,
    CURSOR_HOT_Y: 1,

    /* Доля прокрутки sticky-фазы, на которой появляется последняя
       карточка процесса. Она же — момент, когда полоса прогресса
       заполняется на 100%: заливка нормируется на это значение,
       чтобы линия доходила до точки ровно тогда, когда зажигается
       соответствующая карточка (см. updateSticky в initProcessScroll). */
    PROCESS_LAST_THRESHOLD: 0.6,
    /* Порог, на котором CSS включает position: sticky для сцены
       процесса. Живёт в JS, чтобы ветка «sticky vs observer» в
       initProcessScroll() принимала решение по тому же критерию,
       что и стили: иначе логика и рендер разъезжаются. */
    PROCESS_DESKTOP_QUERY: '(min-width: 861px)',

    SOUND_VOLUME: 0.10,
    CLICK_SAMPLE_VOLUME: 0.35,
    CLICK_SOUND_FILE: 'mouse-click-sound.mp3',
    SOUND_STORAGE_KEY: 'vmlabs:sound',
    /* Телефоны и планшеты — до 1180px (граница «iPad-диапазона» в CSS).
       На них звук отключён принудительно, а кнопка и подсказка звука
       скрыты в CSS: клик мышью на тач-устройстве не нужен. */
    SOUND_QUIET_QUERY: '(max-width: 1179px)',
    SOUND_BLIP_FILTER_HZ: 1400,
    SOUND_BLIP_ATTACK_S: 0.008,
    SOUND_BLIP_MIN_FREQ: 60,

    TRIM_SCAN_LIMIT_SEC: 6,
    TRIM_WINDOW_MS: 4,
    TRIM_PEAK_RATIO: 0.06,
    TRIM_FLOOR: 0.012,
    TRIM_HEAD_PAD_MS: 4,
    TRIM_TAIL_PAD_MS: 40,
    TRIM_MIN_DURATION_SEC: 0.02,
    TRIM_STEP: 8,

    ELEMENT_TRIM_OFFSET_SEC: 0.28,
    ELEMENT_TRIM_DURATION_MS: 220,

    API_PATH: '/api',
    API_PATH_LOCAL: 'http://127.0.0.1:8000/api',
    API_LOCAL_PORT: '8000',
    LEAD_TIMEOUT_MS: 15000,
    RATE_LIMIT_MS: 30_000,
    RATE_LIMIT_KEY: 'vmlabs:last-submit',
    FORM_NAME_MIN_LEN: 2,

    /* Какие контакты принимает канал. Виды перечислены в CONTACT_KINDS
       (см. ниже): канал объявляет набор, проверка одна на весь сайт.
       Telegram принимает только @username или ссылку t.me/username:
       серверная проверка (app/validation.py) телефон для Telegram не
       принимает, поэтому и предлагать его в форме нельзя — иначе человек
       заполнит поле и получит отказ 400 вместо заявки. MAX — только
       телефон: там вход по номеру, а никнейм или ссылку на профиль
       проверить нечем. */
    CONTACT_CHANNELS: Object.freeze({
      telegram: Object.freeze({
        placeholder: '@username или t.me/username',
        hint: '// @username в Telegram (минимум 5 символов) или ссылка t.me/username',
        accepts: Object.freeze(['telegram']),
        error: 'Укажите @username (минимум 5 символов) или ссылку t.me/username.'
      }),
      email: Object.freeze({
        placeholder: 'mail@example.com',
        hint: '// адрес вида mail@example.com',
        accepts: Object.freeze(['email']),
        error: 'Укажите корректный email, например mail@example.com.'
      }),
      max: Object.freeze({
        placeholder: '+7 900 000-00-00',
        hint: '// номер телефона для MAX',
        accepts: Object.freeze(['phone']),
        error: 'Укажите номер телефона для MAX, например +7 900 000-00-00.'
      }),
      vk: Object.freeze({
        placeholder: 'vk.com/username или @username',
        hint: '// ссылка на профиль ВКонтакте или никнейм',
        accepts: Object.freeze(['vk']),
        error: 'Укажите ссылку на профиль ВКонтакте или никнейм.'
      })
    }),

    FALLBACK_CONTACT: Object.freeze({
      telegram: '@vmlabs',
      email: 'hello@vmlabs.ru'
    }),

    /* Версия согласия — не косметика: она пишется в params визита
       Метрики и в журнал согласий на сервере. Меняется только вместе
       с редакциями privacy.html / cookie-consent.html и их копий
       в index.html (порядок — в ANALYTICS.md). */
    CONSENT_VERSION: '2026-10-18',
    SESSION_STORAGE_KEY: 'vmlabs:session',
    CONSENT_STORAGE_KEY: 'vmlabs:consent',
    PRELOAD_SESSION_KEY: 'vmlabs:preload-shown',
    COOKIE_BANNER_HIDE_MS: 300,

    THEME_STORAGE_KEY: 'vmlabs:theme',
    A11Y_STORAGE_KEY: 'vmlabs:a11y',
    THEME_COLOR_DARK: '#10161d',
    THEME_COLOR_LIGHT: '#F7F4EF',

    HINTS_OPT_OUT_KEY: 'vmlabs:hints-off',
    HINTS_LAST_VISIT_KEY: 'vmlabs:last-visit',
    /* Отказ «Да» действует, пока человек заходит хотя бы раз в две
       недели. После 14 дней без заходов он сбрасывается, и подсказки
       появляются снова. */
    HINTS_RESET_AFTER_MS: 14 * 24 * 60 * 60 * 1000,
    HINT_FIRST_DELAY_MS: 900,
    HINT_VISIBLE_MS: 20_000,

    DEMO_FRAME_SELECTOR: '[data-demo-frame]',
    HEADER_SCROLL_THRESHOLD_PX: 8,
    HEADER_DESKTOP_QUERY: '(min-width: 1100px)',

    MODAL_CLOSE_ANIM_MS: 250,

    GLYPH_POOL: '{}<>/;$#&',
    DIGIT_BIAS: 0.82
  });

  /* ============================================================
     АНАЛИТИКА — единственный источник правды
     ------------------------------------------------------------
     Здесь собраны ВСЕ настройки сбора данных. Юридические документы
     описывают ровно это состояние, поэтому менять значения можно
     только вместе с текстами (полный порядок — ANALYTICS.md):

       privacy.html        ↔ index.html, статья privacy.html
       cookie-consent.html ↔ index.html, статья cookie-consent.html
       consent-pd.html     ↔ index.html, статья consent-pd.html

     Вебвизор включён: юридические документы описывают запись
     визуального состояния страницы, движений курсора, кликов и
     прокрутки. Содержимое полей формы маскируется классом
     ym-disable-keys. Изменение этого режима требует правки документов
     и новой версии согласия.
     ============================================================ */
  const ANALYTICS = Object.freeze({
    /* Реальный номер счётчика vmlabs.ru. 0 — счётчик не загружается
       вовсе: ни сети, ни cookie Метрики. */
    COUNTER_ID: 113661247,
    WEBVISOR: true,
    /* Карта кликов и переходы по ссылкам — это «клики» из privacy.html.
       Сами по себе они запись экрана не включают; визуальную запись
       делает Вебвизор. */
    CLICKMAP: true,
    TRACK_LINKS: true,
    ACCURATE_TRACK_BOUNCE: true,
    /* Якоря — не отдельные страницы: разделы уже считает section_view.
       С trackHash: true один визит на одностраничнике распадается на
       десятки «просмотров» и искажает глубину и время — данные
       противоречат сами себе. */
    TRACK_HASH: false,
    ECOMMERCE: false
  });

  /* Идентификаторы целей. Совпадают с именами целей в кабинете Метрики
     и с таблицей в ANALYTICS.md; регистр и подчёркивания менять нельзя. */
  const GOALS = Object.freeze({
    SCROLL_DEPTH: 'scroll_depth',
    SECTION_VIEW: 'section_view',
    PAGE_LEAVE: 'page_leave',
    LEAD_SUBMIT: 'lead_submit'
  });

  /* Имена параметров. Один смысл — одно имя во всех событиях: иначе
     в отчёте «Параметры событий» появляются depth, percent и scroll —
     три поля про одно и то же. */
  const PARAMS = Object.freeze({
    SCROLL_PERCENT: 'scroll_percent',
    SECTION_ID: 'section_id',
    SECONDS_ON_PAGE: 'seconds_on_page',
    MAX_SCROLL_PERCENT: 'max_scroll_percent',
    CONTACT_CHANNEL: 'contact_channel',
    FORM_ID: 'form_id',
    LANDING_TYPES: 'landing_types'
  });

  /* Белый список параметров для каждой цели. Telemetry.send() отбрасывает
     всё, чего здесь нет: случайно добавленное поле (имя, контакт, текст
     заявки) не уйдёт в Метрику даже при будущей правке вызова. */
  const GOAL_PARAMS = Object.freeze({
    [GOALS.SCROLL_DEPTH]: Object.freeze([PARAMS.SCROLL_PERCENT]),
    [GOALS.SECTION_VIEW]: Object.freeze([PARAMS.SECTION_ID]),
    [GOALS.PAGE_LEAVE]: Object.freeze([PARAMS.SECONDS_ON_PAGE, PARAMS.MAX_SCROLL_PERCENT]),
    [GOALS.LEAD_SUBMIT]: Object.freeze([
      PARAMS.CONTACT_CHANNEL,
      PARAMS.FORM_ID,
      PARAMS.LANDING_TYPES
    ])
  });

  const PRELOAD_STATUS = Object.freeze([
    Object.freeze({ at: 0.15, text: 'Загрузка…' }),
    Object.freeze({ at: 0.78, text: 'Почти готово…' })
  ]);

  /* ============================================================
     ПРОВЕРКИ КОНТАКТОВ
     Виды контактов, из которых канал собирает свой набор (accepts в
     CONFIG.CONTACT_CHANNELS). Разложено по видам, а не по каналам:
     телефон сейчас нужен только каналу MAX, но проверка остаётся
     общей точкой — новый канал с телефоном не потребует второй копии
     выражения.
     ============================================================ */
  const CONTACT_KINDS = Object.freeze({
    /* Схема в ссылке необязательна: в подсказках и подсказках об ошибке
       пользователю показывают «t.me/username» и «vk.com/username» без
       https://, и он так и вводит — проверка должна это принимать. */
    telegram: (v) => /^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v)
      || /^(https?:\/\/)?t\.me\/[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v),
    email: (v) => /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v),
    /* Телефон в свободном формате: 10–15 цифр (проверяем просмотром вперёд),
       разделители — пробел, дефис, скобки, ведущий «+» допустим. */
    phone: (v) => /^(?=(?:\D*\d){10,15}\D*$)\+?[\d\s()\-]{10,20}$/.test(v),
    vk: (v) => /^@?[A-Za-z0-9_.]{2,64}$/.test(v)
      || /^(https?:\/\/)?vk\.com\/[A-Za-z0-9_.]{2,64}$/.test(v)
  });

  /* Подходит ли значение выбранному каналу: достаточно совпадения с одним
     из видов, которые канал объявил. */
  function contactMatches(channelCfg, value) {
    const kinds = (channelCfg && channelCfg.accepts) || [];
    return kinds.some((kind) => CONTACT_KINDS[kind] && CONTACT_KINDS[kind](value));
  }

  /* ============================================================
     ХЕЛПЕРЫ
     ============================================================ */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;

  /* Кастомный курсор при точном вводе — единственный указатель на сайте:
     нативный скрыт классом html.is-fine (cursor: none). Поэтому условие
     «кастомный курсор работает» обязано быть ОДНО и то же для прятания
     нативного и для отрисовки .cursor. Если развести их, при малейшем
     рассинхроне пользователь остаётся без указателя вообще: нативный уже
     скрыт, а .cursor не двигается и висит за экраном (в CSS он стартует
     со смещением -100px/-100px).
     Режим для слабовидящих (html[data-a11y]) сюда сознательно не входит:
     по ТЗ курсор обязан работать одинаково в обоих режимах, поэтому
     переключение a11y не должно ломать это условие. */
  const customCursorEnabled = finePointer && !reducedMotion;

  document.body.classList.add('js');

  function debounce(fn, ms) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  function randomGlyph() {
    if (Math.random() < CONFIG.DIGIT_BIAS) return String(Math.floor(Math.random() * 10));
    return CONFIG.GLYPH_POOL[Math.floor(Math.random() * CONFIG.GLYPH_POOL.length)];
  }

  function readStorage(k) { try { return window.localStorage.getItem(k); } catch { return null; } }
  function writeStorage(k, v) { try { window.localStorage.setItem(k, v); } catch { /* пусто */ } }
  function removeStorage(k) { try { window.localStorage.removeItem(k); } catch { /* пусто */ } }
  function readStorageTime(k) {
    const n = Number(readStorage(k));
    /* Отсекаем старые/чужие значения вроде «1»: для времени в
       миллисекундах всё до 2001 года — заведомо не наша отметка. */
    return Number.isFinite(n) && n > 1e12 ? n : 0;
  }
  function readSession(k) { try { return window.sessionStorage.getItem(k); } catch { return null; } }
  function writeSession(k, v) { try { window.sessionStorage.setItem(k, v); } catch { /* пусто */ } }

  function resolveApiBase() {
    const loc = window.location;
    if (loc.protocol === 'file:') return null;
    const isLocalHost = loc.hostname === '127.0.0.1'
      || loc.hostname === 'localhost'
      || loc.hostname === '[::1]';
    if (isLocalHost && loc.port !== CONFIG.API_LOCAL_PORT) {
      return CONFIG.API_PATH_LOCAL;
    }
    return CONFIG.API_PATH;
  }

  function apiUrl(path) {
    const base = resolveApiBase();
    return base ? base + path : null;
  }

  function getSessionId() {
    let id = readSession(CONFIG.SESSION_STORAGE_KEY);
    if (!id) {
      id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      writeSession(CONFIG.SESSION_STORAGE_KEY, id);
    }
    return id;
  }

  /* ============ АТРИБУЦИЯ ЗАЯВКИ ============
     UTM-метки, referrer и страница входа. Нужны, чтобы связать заявку с
     каналом: без этого платный трафик и партнёрские переходы невозможно
     посчитать. Данные хранятся в sessionStorage и уходят ТОЛЬКО в заявку
     на свой сервер; в Метрику они не передаются (см. ANALYTICS.md). */
  const ATTRIBUTION_KEY = 'vmlabs:attribution';
  const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  function captureAttribution() {
    const params = new URLSearchParams(window.location.search);
    const fresh = {};
    let hasUtm = false;
    UTM_FIELDS.forEach((field) => {
      const value = params.get(field);
      if (value) {
        fresh[field] = value.slice(0, 160);
        hasUtm = true;
      }
    });

    if (hasUtm) {
      fresh.referrer = (document.referrer || '').slice(0, 500);
      fresh.landing_page = (window.location.pathname + window.location.search).slice(0, 300);
      try { writeSession(ATTRIBUTION_KEY, JSON.stringify(fresh)); } catch { /* пусто */ }
      return fresh;
    }

    let saved = null;
    try { saved = JSON.parse(readSession(ATTRIBUTION_KEY) || 'null'); } catch { saved = null; }
    if (saved && typeof saved === 'object') return saved;

    return {
      referrer: (document.referrer || '').slice(0, 500),
      landing_page: window.location.pathname.slice(0, 300)
    };
  }

  function postEvidence(path, payload) {
    const url = apiUrl(path);
    if (!url) return Promise.resolve(null);
    try {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true
      }).then((r) => r.json().catch(() => null))
        .catch(() => null);
    } catch {
      return Promise.resolve(null);
    }
  }

  function reportDocumentView(documentName) {
    return postEvidence('/consents/document-view', {
      document: documentName,
      page_url: window.location.href,
      session_id: getSessionId()
    });
  }

  function reportCookieConsent(analytics) {
    return postEvidence('/consents/cookies', {
      analytics: !!analytics,
      necessary: true,
      page_url: window.location.href,
      session_id: getSessionId()
    });
  }

  function getFocusable(container) {
    if (!container) return [];
    return $$(
      'a[href], button:not([disabled]), input:not([disabled]), ' +
      'textarea:not([disabled]), select:not([disabled]), ' +
      '[tabindex]:not([tabindex="-1"])',
      container
    ).filter((el) => !el.hasAttribute('hidden') && el.offsetParent !== null);
  }

  /* ============ SCROLL LOCK ============
     Единая точка блокировки/разблокировки прокрутки body, пока
     открыта модалка (или идёт прелоадер).

     Зачем нужен отдельный модуль:
     — CSS ставит body { position: fixed; top: var(--scroll-lock-y) }
       при классе .is-locked, чтобы на iOS прокрутка фона не
       «перетекала» в модалку и обратно. Без сохранения scrollY
       страница после снятия фиксации прыгает в начало — здесь
       мы запоминаем позицию и возвращаем её через window.scrollTo.
     — Раньше openByName / initPreloader дёргали класс напрямую;
       теперь всё идёт через lock() / unlock(), чтобы состояние
       scrollY и CSS-переменной не разъезжалось.

     Поведение:
     — lock() идемпотентен: повторные вызовы ничего не делают.
     — syncFromClass() используется на старте: в разметке body уже
       помечен is-locked (прелоадер), и нам надо подхватить это
       состояние, не затирая scrollY (там он всё равно 0). */
  const ScrollLock = (() => {
    let savedY = 0;
    let locked = false;

    function setVar(y) {
      document.documentElement.style.setProperty('--scroll-lock-y', `-${y}px`);
    }
    function clearVar() {
      document.documentElement.style.removeProperty('--scroll-lock-y');
    }

    function lock() {
      if (locked) return;
      savedY = window.scrollY || window.pageYOffset || 0;
      setVar(savedY);
      document.body.classList.add('is-locked');
      locked = true;
    }

    function unlock() {
      if (!locked) return;
      document.body.classList.remove('is-locked');
      clearVar();
      /* Мгновенный скролл: CSS задаёт html { scroll-behavior: smooth },
         и обычный scrollTo(0, y) визуально «подъезжал» к позиции.
         На снятии блокировки нужен мгновенный скачок — временно
         выключаем smooth и возвращаем как было. */
      const html = document.documentElement;
      const prevBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = 'auto';
      window.scrollTo(0, savedY);
      html.style.scrollBehavior = prevBehavior;
      savedY = 0;
      locked = false;
    }

    function syncFromClass() {
      if (!document.body.classList.contains('is-locked')) return;
      /* Разметка уже помечена is-locked — значит, CSS-блокировка
         активна. Запоминаем текущую позицию (на старте это 0)
         и выставляем переменную, чтобы body «встало» правильно. */
      savedY = window.scrollY || window.pageYOffset || 0;
      setVar(savedY);
      locked = true;
    }

    return { lock, unlock, syncFromClass };
  })();

  /* ============ SOUND ============ */
  const Sound = (() => {
    const quietMedia = window.matchMedia(CONFIG.SOUND_QUIET_QUERY);
    let audioCtx = null;
    let masterGain = null;
    let enabled = readStorage(CONFIG.SOUND_STORAGE_KEY) === 'on';
    let unlockBound = false;
    let clickBuffer = null;
    let clickOffset = 0;
    let clickDuration = 0;
    let elementFallback = null;
    let elementStopTimer = null;
    let sampleLoadPromise = null;

    /* Звук выключен на телефонах и планшетах независимо от сохранённой
       настройки: кнопка управления там скрыта, а звук кликов/форм на
       тач-устройствах не нужен. На десктопе сохранённый выбор продолжает
       действовать. */
    function audible() {
      return enabled && !quietMedia.matches;
    }

    /* При переходе на тихую (мобильную/планшетную) ширину мгновенно
       глушим уже созданный контекст; при возврате на десктоп возвращаем
       возможность разблокировать звук первым жестом. */
    function handleViewportChange() {
      if (quietMedia.matches) {
        if (elementFallback) elementFallback.pause();
        if (audioCtx && audioCtx.state === 'running') {
          audioCtx.suspend().catch(() => { /* браузер не дал — молча */ });
        }
      } else if (enabled) {
        bindUnlock();
      }
    }

    /*
      AudioContext создаётся и получает resume() строго внутри
      обработчика первого жеста пользователя — pointerdown / keydown
      (через unlockAudio) или клика по кнопке звука (через
      setEnabled(true)). Вне жестов контекст не создаётся и не
      резюмируется: иначе Chrome писал «The AudioContext was not
      allowed to start» на каждую попытку, а попыток было много —
      tick() дёргался из setTimeout-анимации логотипа, success() —
      после отправки формы, и т. д.

      ensureContext() теперь только возвращает уже существующий
      контекст. Создание/resume — исключительно в unlockAudio().
    */
    function ensureContext() {
      if (!audible()) return null;
      return audioCtx;
    }

    function unlockAudio() {
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      unlockBound = false;
      /* На мобильной и планшетной вёрстке не создаём AudioContext
         вообще: иначе браузер держал бы аудио-сессию, хотя звук отключён. */
      if (!audible()) return;
      if (!audioCtx) {
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return;
        try {
          audioCtx = new Ctor();
          masterGain = audioCtx.createGain();
          masterGain.gain.value = CONFIG.SOUND_VOLUME;
          masterGain.connect(audioCtx.destination);
        } catch {
          audioCtx = null;
          return;
        }
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { /* браузер не дал — молча */ });
      }
      ensureClickSample();
    }

    function bindUnlock() {
      if (unlockBound) return;
      unlockBound = true;
      document.addEventListener('pointerdown', unlockAudio, { once: true });
      document.addEventListener('keydown', unlockAudio, { once: true });
    }

    function detectTransient(buffer) {
      const data = buffer.getChannelData(0);
      const sr = buffer.sampleRate;
      const limit = Math.min(data.length, Math.floor(sr * CONFIG.TRIM_SCAN_LIMIT_SEC));
      let peakAll = 0;
      for (let i = 0; i < limit; i += CONFIG.TRIM_STEP) {
        const a = Math.abs(data[i]);
        if (a > peakAll) peakAll = a;
      }
      const th = Math.max(CONFIG.TRIM_FLOOR, peakAll * CONFIG.TRIM_PEAK_RATIO);
      const win = Math.max(32, Math.floor(sr * (CONFIG.TRIM_WINDOW_MS / 1000)));
      let first = -1;
      let last = -1;
      for (let s = 0; s < limit; s += win) {
        const e = Math.min(s + win, limit);
        let p = 0;
        for (let i = s; i < e; i++) {
          const a = Math.abs(data[i]);
          if (a > p) p = a;
        }
        if (p >= th) {
          if (first === -1) first = s;
          last = e;
        }
      }
      if (first === -1) return { start: 0, end: buffer.duration };
      return {
        start: Math.max(0, first / sr - CONFIG.TRIM_HEAD_PAD_MS / 1000),
        end: Math.min(buffer.duration, last / sr + CONFIG.TRIM_TAIL_PAD_MS / 1000)
      };
    }

    function prepareElementFallback() {
      if (elementFallback) return;
      try {
        elementFallback = new Audio();
        elementFallback.preload = 'none';
        elementFallback.volume = CONFIG.CLICK_SAMPLE_VOLUME;
      } catch { elementFallback = null; }
    }

    async function loadClickSample() {
      if (clickBuffer) return;
      if (location.protocol === 'file:') {
        prepareElementFallback();
        return;
      }
      const r = await fetch(CONFIG.CLICK_SOUND_FILE, { cache: 'force-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const ab = await r.arrayBuffer();
      // Используем уже созданный контекст. Если его ещё нет — не создаём
      // здесь: контекст создаётся только в unlockAudio, внутри жеста.
      const ctx = audioCtx;
      if (!ctx) throw new Error('WebAudio unavailable');
      const decoded = await ctx.decodeAudioData(ab.slice(0));
      const { start, end } = detectTransient(decoded);
      clickBuffer = decoded;
      clickOffset = start;
      clickDuration = Math.max(CONFIG.TRIM_MIN_DURATION_SEC, end - start);
    }

    function ensureClickSample() {
      if (sampleLoadPromise) return sampleLoadPromise;
      sampleLoadPromise = loadClickSample().catch(() => {
        prepareElementFallback();
      });
      return sampleLoadPromise;
    }

    function playTrimmedSample() {
      const ctx = ensureContext();
      if (!ctx || !clickBuffer) return false;
      // Не пытаемся играть в suspended — молча выходим.
      if (ctx.state !== 'running') return false;
      try {
        const src = ctx.createBufferSource();
        const g = ctx.createGain();
        const now = ctx.currentTime;
        src.buffer = clickBuffer;
        g.gain.setValueAtTime(CONFIG.CLICK_SAMPLE_VOLUME, now);
        g.gain.setValueAtTime(CONFIG.CLICK_SAMPLE_VOLUME, now + clickDuration * 0.7);
        g.gain.linearRampToValueAtTime(0.0001, now + clickDuration);
        src.connect(g);
        g.connect(masterGain);
        src.start(now, clickOffset, clickDuration + 0.01);
        src.onended = () => src.disconnect();
        return true;
      } catch { return false; }
    }

    function playElementFallback() {
      if (!elementFallback) prepareElementFallback();
      if (!elementFallback) return false;
      try {
        elementFallback.volume = CONFIG.CLICK_SAMPLE_VOLUME;
        if (elementFallback.readyState >= 1) {
          elementFallback.currentTime = CONFIG.ELEMENT_TRIM_OFFSET_SEC;
        }
        const p = elementFallback.play();
        if (p && typeof p.catch === 'function') p.catch(() => { /* autoplay запрещён — не падаем */ });
        clearTimeout(elementStopTimer);
        elementStopTimer = setTimeout(() => {
          if (elementFallback) elementFallback.pause();
        }, CONFIG.ELEMENT_TRIM_DURATION_MS);
        return true;
      } catch { return false; }
    }

    function blip({ freq = 520, dur = 0.09, type = 'sine', gain = 0.5, slide = 0 }) {
      const ctx = ensureContext();
      // Никаких попыток создать/resume из не-жеста: если контекст не готов —
      // просто молча выходим. Так tick() из setTimeout-анимации и success()
      // после await-формы не сыпят предупреждениями в консоль.
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = CONFIG.SOUND_BLIP_FILTER_HZ;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(CONFIG.SOUND_BLIP_MIN_FREQ, freq + slide), t + dur);
      }
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(gain, t + CONFIG.SOUND_BLIP_ATTACK_S);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(filter);
      filter.connect(amp);
      amp.connect(masterGain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    }

    function synthClick() {
      blip({ freq: 480, slide: -160, dur: 0.09, gain: 0.5 });
      blip({ freq: 240, dur: 0.06, gain: 0.25, type: 'triangle' });
    }

    return {
      init() {
        if (!enabled) return;
        bindUnlock();
        if (typeof quietMedia.addEventListener === 'function') {
          quietMedia.addEventListener('change', handleViewportChange);
        } else if (typeof quietMedia.addListener === 'function') {
          // Safari < 14 — старый API, но на iOS 13 ещё встречается.
          quietMedia.addListener(handleViewportChange);
        }
      },
      click() {
        if (!audible()) return;
        if (playTrimmedSample()) return;
        if (playElementFallback()) return;
        synthClick();
      },
      tick() {
        if (!audible()) return;
        blip({ freq: 1150, dur: 0.035, gain: 0.1, type: 'triangle' });
      },
      success() {
        if (!audible()) return;
        blip({ freq: 523, dur: 0.22, gain: 0.3 });
        setTimeout(() => blip({ freq: 784, dur: 0.3, gain: 0.28 }), 120);
      },
      setEnabled(value) {
        enabled = value;
        writeStorage(CONFIG.SOUND_STORAGE_KEY, value ? 'on' : 'off');
        if (value) {
          /*
            setEnabled(true) вызывается только из обработчика клика по
            кнопке звука — это настоящий жест, поэтому разблокируем
            контекст сразу, не дожидаясь следующего pointerdown.
            На мобильной и планшетной вёрстке unlockAudio() сам не
            создаст контекст.
          */
          unlockAudio();
        } else if (elementFallback) {
          elementFallback.pause();
        }
      },
      isEnabled() { return enabled; }
    };
  })();

  /* ============ THEME ============ */
  const Theme = (() => {
    function stored() {
      const v = readStorage(CONFIG.THEME_STORAGE_KEY);
      return v === 'light' || v === 'dark' ? v : null;
    }
    function effective() { return stored() || 'dark'; }
    function renderMeta(theme) {
      const m = document.querySelector('meta[name="theme-color"]');
      if (!m) return;
      m.setAttribute('content', theme === 'light' ? CONFIG.THEME_COLOR_LIGHT : CONFIG.THEME_COLOR_DARK);
    }
    function renderButtons(theme) {
      $$('[data-theme-toggle]').forEach((b) => {
        b.setAttribute('data-theme-icon', theme);
        b.setAttribute('aria-pressed', String(theme === 'light'));
        b.setAttribute('aria-label', theme === 'light' ? 'Включить тёмную тему' : 'Включить светлую тему');
      });
    }
    function apply(theme) {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      renderMeta(theme);
      renderButtons(theme);
    }
    function toggle() {
      const next = effective() === 'light' ? 'dark' : 'light';
      writeStorage(CONFIG.THEME_STORAGE_KEY, next);
      apply(next);
    }
    apply(effective());
    return {
      init() { $$('[data-theme-toggle]').forEach((b) => b.addEventListener('click', () => toggle())); },
      current: effective
    };
  })();

  /* ============ A11Y ============ */
  const A11y = (() => {
    const root = document.documentElement;
    function stored() {
      const v = readStorage(CONFIG.A11Y_STORAGE_KEY);
      return v === 'on' || v === 'off' ? v : null;
    }
    function effective() {
      const s = stored();
      if (s) return s;
      return reducedMotion ? 'on' : 'off';
    }
    function renderButtons(isOn) {
      $$('[data-a11y-toggle]').forEach((b) => {
        b.setAttribute('data-a11y-icon', isOn ? 'on' : 'off');
        b.setAttribute('aria-pressed', String(isOn));
        b.setAttribute('aria-label', isOn ? 'Выключить версию для слабовидящих' : 'Включить версию для слабовидящих');
      });
    }
    /* Класс html.is-fine (прячет нативный курсор) здесь не трогаем: им
       управляет только initCursorFx, потому что он и есть «переключатель
       указателя» — прячем нативный, показываем кастомный. Раньше a11y-режим
       снимал этот класс: нативный курсор возвращался, а .cursor переставал
       следить за мышью и пропадал из виду — указатель выглядел сломанным. */
    function apply(mode) {
      const isOn = mode === 'on';
      if (isOn) root.setAttribute('data-a11y', 'on');
      else root.removeAttribute('data-a11y');
      renderButtons(isOn);
    }
    function toggle() {
      const next = effective() === 'on' ? 'off' : 'on';
      writeStorage(CONFIG.A11Y_STORAGE_KEY, next);
      apply(next);
    }
    apply(effective());
    return {
      init() { $$('[data-a11y-toggle]').forEach((b) => b.addEventListener('click', () => toggle())); },
      isOn() { return root.hasAttribute('data-a11y'); }
    };
  })();

  /* ============ CONSENT ============ */
  const Consent = (() => {
    let ymLoaded = false;
    let analyticsDenied = false;
    let bannerHandled = false;

    function read() {
      try {
        const r = localStorage.getItem(CONFIG.CONSENT_STORAGE_KEY);
        return r ? JSON.parse(r) : null;
      } catch { return null; }
    }
    function write(v) {
      try {
        localStorage.setItem(CONFIG.CONSENT_STORAGE_KEY, JSON.stringify({
          ...v,
          version: CONFIG.CONSENT_VERSION,
          ts: Date.now()
        }));
      } catch { /* quota / private mode — не роняем приложение */ }
      reportCookieConsent(v.analytics);
    }
    /* Отказ от аналитики: убираем cookie Метрики, если они уже успели
       появиться (например, от прошлого согласия). Без этого «Отклонить»
       оставлял бы на устройстве следы счётчика, хотя данные уже не
       отправляются. */
    function purgeMetrikaCookies() {
      try {
        const names = new Set();
        document.cookie.split(';').forEach((part) => {
          const name = part.split('=')[0].trim();
          if (name && name.indexOf('_ym_') === 0) names.add(name);
        });
        /* Известные имена чистим всегда: часть могла быть выставлена
           с другим path/domain и не попасть в document.cookie. */
        ['_ym_uid', '_ym_d', '_ym_isad', '_ym_visorc', '_ym_hostIndex', '_ym_qs']
          .forEach((name) => names.add(name));
        const host = window.location.hostname;
        const domains = [''];
        const parts = host.split('.');
        for (let i = 1; i < parts.length; i++) {
          domains.push('.' + parts.slice(i).join('.'));
        }
        names.forEach((name) => {
          domains.forEach((domain) => {
            const suffix = domain ? '; domain=' + domain : '';
            document.cookie = name + '=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + suffix;
          });
        });
      } catch { /* cookie запрещены настройками браузера */ }
    }
    function deny() {
      analyticsDenied = true;
      purgeMetrikaCookies();
      write({ analytics: false, necessary: true });
    }
    function loadMetrika() {
      /* После отказа счётчик не загружаем даже при повторном вызове:
         иначе Метрика выставила бы cookie вопреки выбору пользователя. */
      if (ymLoaded || analyticsDenied) return;
      if (!ANALYTICS.COUNTER_ID) {
        console.warn('[VM Labs] ANALYTICS.COUNTER_ID = 0 — Яндекс.Метрика не загружается.');
        return;
      }
      ymLoaded = true;
      (function (m, e, t, r, i, k, a) {
        m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
        m[i].l = 1 * new Date();
        for (let j = 0; j < document.scripts.length; j++) {
          if (document.scripts[j].src === r) return;
        }
        k = e.createElement(t);
        a = e.getElementsByTagName(t)[0];
        k.async = 1;
        k.src = r;
        a.parentNode.insertBefore(k, a);
      })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');

      /* Все флаги берутся из ANALYTICS, а не пишутся здесь повторно:
         одно место настройки — один повод для расхождения с документами. */
      window.ym(ANALYTICS.COUNTER_ID, 'init', {
        clickmap: ANALYTICS.CLICKMAP,
        trackLinks: ANALYTICS.TRACK_LINKS,
        accurateTrackBounce: ANALYTICS.ACCURATE_TRACK_BOUNCE,
        webvisor: ANALYTICS.WEBVISOR,
        trackHash: ANALYTICS.TRACK_HASH,
        ecommerce: ANALYTICS.ECOMMERCE,
        /* Параметр визита: по нему в отчётах видно, на какой редакции
           согласия собраны данные. PII здесь нет и быть не должно. */
        params: { consent_version: CONFIG.CONSENT_VERSION }
      });

      /* Noscript-пиксель сознательно не добавляем. Его создаёт этот же
         скрипт: без JS элемента не будет, с JS он не сработает. Зато
         «страховочный» хит мог бы уйти в обход согласия — а документы
         обещают, что до согласия счётчик не загружается вообще. */
    }
    function buildBanner() {
      const w = document.createElement('div');
      w.className = 'cookie-banner';
      w.id = 'cookie-banner';
      w.setAttribute('role', 'region');
      w.setAttribute('aria-live', 'polite');
      w.setAttribute('aria-labelledby', 'cookie-banner-title');
      w.hidden = true;
      w.innerHTML = [
        '<div class="cookie-banner__inner">',
        '  <div class="cookie-banner__content">',
        '    <div class="cookie-banner__head">',
        '      <span class="cookie-banner__icon" aria-hidden="true">',
        '        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" focusable="false">',
        '          <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />',
        '          <path d="M8.5 8.5v.01" />',
        '          <path d="M16 15.5v.01" />',
        '          <path d="M12 12v.01" />',
        '          <path d="M11 17v.01" />',
        '          <path d="M7 14v.01" />',
        '        </svg>',
        '      </span>',
        '      <h2 class="cookie-banner__title" id="cookie-banner-title">Cookie и веб-аналитика</h2>',
        '    </div>',
        '    <p class="cookie-banner__text">',
'      Мы используем cookie и Яндекс.Метрику с записью действий (Вебвизор включён, поля формы маскируются),',
'      чтобы понимать, как Вы пользуетесь сайтом. Это помогает делать его удобнее. Подробнее —',
'      <span class="cookie-banner__white">в</span> <a href="cookie-consent.html" data-modal-open="cookie" target="_blank" rel="noopener">согласии на cookie</a>.',
        '    </p>',
        '  </div>',
        '  <div class="cookie-banner__actions">',
        '    <button class="btn btn--primary btn--sm" type="button" id="cookie-accept">Принять все</button>',
        '    <button class="btn btn--ghost btn--sm" type="button" id="cookie-decline">Только необходимые</button>',
        '    <button class="cookie-banner__reject" type="button" id="cookie-reject">Отклонить</button>',
        '  </div>',
        '</div>'
      ].join('');
      document.body.appendChild(w);
      return w;
    }
    function getBanner() { return document.getElementById('cookie-banner') || buildBanner(); }
    /* Показ и скрытие разделены намеренно: сама плашка теперь видима по
       умолчанию (иначе её не увидеть без скрипта), поэтому «показать» —
       это только включить анимацию появления. */
    function showBanner(b) {
      b.hidden = false;
      requestAnimationFrame(() => b.classList.add('is-visible'));
    }
    function hideBannerNow(b) {
      b.classList.remove('is-visible');
      b.hidden = true;
    }
    function hideBanner(b) {
      b.classList.remove('is-visible');
      setTimeout(() => { b.hidden = true; }, CONFIG.COOKIE_BANNER_HIDE_MS);
    }
    return {
      init() {
        if (bannerHandled) return;
        bannerHandled = true;
        /* Внутри iframe (превью демо в витрине и в модалке) баннер не
           показываем: согласие спрашивает страница-родитель, иначе плашка
           всплывала бы внутри превью. */
        if (window.self !== window.top) return;
        const saved = read();
        const valid = saved && saved.version === CONFIG.CONSENT_VERSION;
        const b = getBanner();
        if (valid) {
          /* Согласие уже дано. Флаг data-consent выставлен ещё в <head>,
             здесь дочищаем: плашка обязана уйти из потока, иначе она
             перехватывала бы клики по низу страницы. */
          hideBannerNow(b);
          if (saved.analytics) loadMetrika();
          else {
            analyticsDenied = true;
            /* Отказ сохранён — на всякий случай дочищаем следы счётчика,
               оставшиеся от прошлых визитов. */
            purgeMetrikaCookies();
          }
          return;
        }
        /* Запись есть, но версия устарела — согласие переспрашиваем. */
        document.documentElement.removeAttribute('data-consent');
        showBanner(b);
        const acc = document.getElementById('cookie-accept');
        const dec = document.getElementById('cookie-decline');
        const rej = document.getElementById('cookie-reject');
        if (acc) acc.addEventListener('click', () => {
          analyticsDenied = false;
          write({ analytics: true, necessary: true });
          hideBanner(b);
          loadMetrika();
        });
        const refuse = () => {
          deny();
          hideBanner(b);
        };
        if (dec) dec.addEventListener('click', refuse);
        if (rej) rej.addEventListener('click', refuse);
      },
      hasAnalytics() {
        const s = read();
        return Boolean(s && s.analytics && s.version === CONFIG.CONSENT_VERSION);
      },
      isYmLoaded() { return ymLoaded; }
    };
  })();

  /* ============ TELEMETRY ============ */
  const Telemetry = (() => {
    const milestones = Object.freeze([25, 50, 75, 90, 100]);
    const fired = new Set();
    const seenSections = new Set();
    let maxScroll = 0;
    let leaveSent = false;
    const startedAt = Date.now();

    /* Единая точка отправки. Событие уходит только после согласия и
       только с параметрами из белого списка GOAL_PARAMS. dataLayer
       намеренно не используется: контейнера GTM на сайте нет, а
       «на всякий случай» положенные туда события обходили бы согласие
       и создавали недокументированный канал передачи данных. */
    function send(goal, data = {}) {
      if (!Consent.hasAnalytics() || !Consent.isYmLoaded()) return false;
      if (typeof window.ym !== 'function') return false;
      const allowed = GOAL_PARAMS[goal];
      if (!allowed) return false;
      const params = {};
      allowed.forEach((key) => {
        const value = data[key];
        if ((typeof value === 'string' && value.length) || typeof value === 'number') {
          params[key] = value;
        }
      });
      try {
        window.ym(ANALYTICS.COUNTER_ID, 'reachGoal', goal, params);
      } catch { /* блокировщик или сбой счётчика не должны ломать страницу */ }
      return true;
    }

    function update() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const percent = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;
      if (percent > maxScroll) maxScroll = percent;
      milestones.forEach((m) => {
        if (percent >= m && !fired.has(m)) {
          fired.add(m);
          send(GOALS.SCROLL_DEPTH, { [PARAMS.SCROLL_PERCENT]: m });
        }
      });
    }

    function trackSections() {
      const sections = document.querySelectorAll('main section[id], footer');
      if (!sections.length || !('IntersectionObserver' in window)) return;
      /* Середина экрана вместо threshold: 0.5. Длинный раздел выше
         двух экранов никогда не показал бы 50% своей площади, и
         section_view для него не сработал бы вовсе. */
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const id = e.target.id || e.target.tagName.toLowerCase();
          if (seenSections.has(id)) return;
          seenSections.add(id);
          send(GOALS.SECTION_VIEW, { [PARAMS.SECTION_ID]: id });
        });
      }, { rootMargin: '-25% 0px -25% 0px', threshold: 0 });
      sections.forEach((s) => io.observe(s));
    }

    return {
      init() {
        trackSections();
        window.addEventListener('scroll', debounce(update, 150), { passive: true });
        /* pagehide, а не beforeunload: на мобильных Safari beforeunload
           часто не приходит, и событие терялось. Флаг ставится только
           если событие действительно ушло: pagehide мог случиться до
           согласия (bfcache), и после возврата page_leave должен ещё
           иметь шанс отправиться. */
        window.addEventListener('pagehide', () => {
          if (leaveSent) return;
          leaveSent = send(GOALS.PAGE_LEAVE, {
            [PARAMS.SECONDS_ON_PAGE]: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
            [PARAMS.MAX_SCROLL_PERCENT]: maxScroll
          });
        });
        update();
      },
      /* Вызывается только после успешного ответа API заявки. Именно
         успех, а не клик по кнопке: иначе цель lead_submit считала бы
         и ошибки валидации, и таймауты сервера. */
      trackLead({ channel = '', formId = '', landingTypes = '' } = {}) {
        send(GOALS.LEAD_SUBMIT, {
          [PARAMS.CONTACT_CHANNEL]: channel,
          [PARAMS.FORM_ID]: formId,
          [PARAMS.LANDING_TYPES]: landingTypes
        });
      }
    };
  })();

  /* ============ IFRAME SYNC ============ */
  const IframeSync = (() => {
    let frames = [];
    /*
      Витрина работ показывает демо как «картинку»: три превью обязаны
      оставаться тёмными всегда — и при светлой теме сайта, и в режиме для
      слабовидящих. Поэтому тема в превью уходит жёстко 'dark', а не текущая
      тема документа: раньше превью щёлкали вслед за родителем.

      Режим для слабовидящих, наоборот, транслируется как есть — внутри
      превью должны расти шрифт и контраст (демо-страницы увеличивают
      базовый кегль по html[data-a11y="on"], а вёрстка у них в rem). Поэтому
      наблюдатель за атрибутом data-a11y нужен: пользователь может включить
      режим, когда превью уже загружены.

      Демо слушают vmlabs:display (script/demo-theme.js), но одного
      postMessage мало: ленивый iframe мог ещё не выполнить скрипт, а на
      file:// сообщение вообще не доходит. Поэтому сразу после него
      проставляем те же атрибуты напрямую в contentDocument — origin
      совпадает, доступ разрешён. Это страховка, а не основной путь:
      postMessage обновляет ещё и иконку/aria кнопки темы внутри демо.

      Селектор CONFIG.DEMO_FRAME_SELECTOR — это только превью-фреймы
      карточек. Демо в модалке (#modal-demo-frame) в него не входит: там
      логика в postDemoTheme, и она не затрагивается.
    */
    const PREVIEW_THEME = 'dark';
    function broadcast() {
      if (!frames.length) return;
      /* a11y читаем в момент отправки, а не кэшируем: состояние могло
         измениться после инициализации. */
      const a11y = document.documentElement.hasAttribute('data-a11y') ? 'on' : 'off';
      const payload = { type: 'vmlabs:display', theme: PREVIEW_THEME, a11y };
      frames.forEach((f) => {
        try {
          if (f.contentWindow && f.contentWindow !== window) {
            f.contentWindow.postMessage(payload, window.location.origin);
          }
        } catch { /* cross-origin — молча пропускаем */ }

        try {
          const frameRoot = f.contentDocument && f.contentDocument.documentElement;
          if (!frameRoot) return;
          frameRoot.setAttribute('data-theme', PREVIEW_THEME);
          frameRoot.style.colorScheme = PREVIEW_THEME;
          if (a11y === 'on') frameRoot.setAttribute('data-a11y', 'on');
          else frameRoot.removeAttribute('data-a11y');
        } catch { /* iframe ещё about:blank или чужой origin */ }
      });
    }
    return {
      init() {
        frames = $$(CONFIG.DEMO_FRAME_SELECTOR);
        if (!frames.length) return;
        /* Досылаем состояние по каждому load: iframe ленивый
           (loading="lazy"), и к моменту первого показа документ мог не
           успеть подписаться на сообщения. */
        frames.forEach((f) => f.addEventListener('load', broadcast));
        window.addEventListener('message', (e) => {
          if (e.origin !== window.location.origin) return;
          const d = e.data;
          if (!d || typeof d !== 'object') return;
          if (d.type !== 'vmlabs:demo-ready') return;
          broadcast();
        });
        /* Тема тут не наблюдается сознательно: она в превью фиксирована,
           и переключение темы сайта не должно дёргать фреймы. */
        const obs = new MutationObserver(broadcast);
        obs.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-a11y']
        });
      },
      broadcast
    };
  })();

  /* ============ LOGO ============ */
  function prepareLogo(logoEl) {
    if (!logoEl) return null;
    const word = $('.logo__word', logoEl);
    if (!word || word.dataset.prepared) return word;
    const raw = word.textContent.trim();
    word.textContent = '';
    for (const ch of raw) {
      const s = document.createElement('span');
      if (ch === ' ') {
        s.setAttribute('aria-hidden', 'true');
        s.textContent = '\u00A0';
      } else s.textContent = ch;
      word.appendChild(s);
    }
    const c = document.createElement('i');
    c.className = 'logo__caret';
    c.setAttribute('aria-hidden', 'true');
    word.appendChild(c);
    word.dataset.prepared = '1';
    return word;
  }
  function playLogo(logoEl, { onDone } = {}) {
    if (!logoEl) { if (typeof onDone === 'function') onDone(); return; }
    prepareLogo(logoEl);
    const letters = $$('.logo__word span:not([aria-hidden])', logoEl);
    const caret = $('.logo__caret', logoEl);
    if (reducedMotion) {
      logoEl.classList.add('is-drawing', 'is-drawn');
      letters.forEach((l) => l.classList.add('is-on'));
      if (caret) caret.classList.add('is-done');
      if (typeof onDone === 'function') onDone();
      return;
    }
    logoEl.classList.add('is-drawing');
    setTimeout(() => logoEl.classList.add('is-drawn'), 480);
    let i = 0;
    function next() {
      if (i >= letters.length) {
        if (caret) caret.classList.add('is-done');
        if (typeof onDone === 'function') onDone();
        return;
      }
      letters[i].classList.add('is-on');
      Sound.tick();
      i++;
      setTimeout(next, CONFIG.LETTER_TYPE_MS + Math.random() * CONFIG.LETTER_TYPE_JITTER_MS);
    }
    setTimeout(next, CONFIG.LETTER_TYPE_START_MS);
  }
  function initStaticLogos() {
    $$('[data-logo]').forEach((el) => {
      if (el.hasAttribute('data-animate')) return;
      prepareLogo(el);
      el.classList.add('is-drawn');
      $$('.logo__word span', el).forEach((l) => l.classList.add('is-on'));
      const c = $('.logo__caret', el);
      if (c) c.remove();
    });
  }

  /* ============ MATRIX RAIN ============ */
  class MatrixRain {
    constructor(canvas, options = {}) {
      if (!canvas) throw new Error('[VM Labs] MatrixRain: canvas not found');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('[VM Labs] MatrixRain: 2d context unavailable');
      this.opts = {
        speed: CONFIG.RAIN_SPEED_PROCESS,
        alpha: 1,
        fontSize: CONFIG.RAIN_FONT_SIZE,
        gap: 6,
        density: 1,
        minLen: CONFIG.RAIN_MIN_LEN_DEFAULT,
        maxLen: CONFIG.RAIN_MAX_LEN_DEFAULT,
        distribute: true,
        autoTheme: false,
        ...options
      };
      this.canvas = canvas;
      this.ctx = ctx;
      this.columns = [];
      this.active = false;
      this.mode = 'normal';
      this.dpr = Math.min(window.devicePixelRatio || 1, CONFIG.RAIN_DPR_MAX);
      this.handleResize = debounce(() => this.resize(), 200);
      window.addEventListener('resize', this.handleResize);
      this.resize();
    }
    resize() {
      const w = this.canvas.clientWidth || window.innerWidth;
      const h = this.canvas.clientHeight || window.innerHeight;
      this.width = w;
      this.height = h;
      this.canvas.width = Math.round(w * this.dpr);
      this.canvas.height = Math.round(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.buildColumns();
    }
    buildColumns() {
      const step = this.opts.fontSize + this.opts.gap;
      const count = Math.max(1, Math.ceil(this.width / step));
      const { minLen, maxLen, speed, density, distribute } = this.opts;
      this.columns = Array.from({ length: count }, (_, i) => {
        const dead = Math.random() > density;
        return {
          x: i * step + step / 2,
          y: distribute
            ? Math.random() * this.height * 1.2 - this.height * 0.1
            : Math.random() * -this.height,
          speed: speed * (CONFIG.RAIN_SPEED_JITTER_MIN + Math.random() * CONFIG.RAIN_SPEED_JITTER_RANGE),
          len: minLen + Math.floor(Math.random() * (maxLen - minLen)),
          chars: Array.from({ length: maxLen }, () => randomGlyph()),
          dead
        };
      });
    }
    start() { this.active = true; this.mode = 'normal'; }
    setActive(v) { this.active = Boolean(v); if (this.active) this.mode = 'normal'; }
    startDrain() { this.mode = 'drain'; }
    stop() { this.active = false; this.ctx.clearRect(0, 0, this.width, this.height); }
    update() {
      if (!this.active || document.hidden) return;
      const ctx = this.ctx;
      const fs = this.opts.fontSize;
      const onLight = this.opts.autoTheme && document.documentElement.dataset.theme === 'light';
      const baseAlpha = onLight ? this.opts.alpha * CONFIG.RAIN_LIGHT_ALPHA_BOOST : this.opts.alpha;
      const headRGB = onLight ? CONFIG.RAIN_LIGHT_HEAD_RGB : CONFIG.RAIN_DARK_HEAD_RGB;
      const bodyRGB = onLight ? CONFIG.RAIN_LIGHT_BODY_RGB : CONFIG.RAIN_DARK_BODY_RGB;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.font = `${fs}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      let alive = 0;
      for (const col of this.columns) {
        if (col.dead) continue;
        if (this.mode === 'drain') col.speed += CONFIG.DRAIN_ACCEL;
        col.y += col.speed;
        for (let i = 0; i < col.len; i++) {
          const gy = col.y - i * fs;
          if (gy < -fs || gy > this.height + fs) continue;
          const fade = 1 - i / col.len;
          const alpha = baseAlpha * fade * (i === 0 ? CONFIG.RAIN_HEAD_ALPHA : CONFIG.RAIN_BODY_ALPHA_FACTOR);
          ctx.fillStyle = i === 0
            ? `rgba(${headRGB}, ${alpha})`
            : `rgba(${bodyRGB}, ${alpha})`;
          if (Math.random() < CONFIG.RAIN_GLYPH_MUTATION_CHANCE) col.chars[i] = randomGlyph();
          ctx.fillText(col.chars[i], col.x, gy);
        }
        if (this.mode === 'drain') {
          if (col.y - col.len * fs > this.height) col.dead = true;
          else alive++;
        } else if (col.y - col.len * fs > this.height) {
          col.y = -col.len * fs - Math.random() * CONFIG.RAIN_RESET_OFFSET;
          col.speed = this.opts.speed * (CONFIG.RAIN_SPEED_JITTER_MIN + Math.random() * CONFIG.RAIN_SPEED_JITTER_RANGE);
          alive++;
        } else alive++;
      }
      if (this.mode === 'drain' && alive === 0) this.active = false;
    }
  }

  /* ============ COIN ============ */
  function initCoin() {
    const coin = document.getElementById('coin');
    if (!coin) return;
    const arc = document.getElementById('coin-arc');
    if (!arc) return;
    const C = 2 * Math.PI * CONFIG.COIN_RADIUS;
    arc.style.strokeDasharray = String(C);
    arc.style.strokeDashoffset = String(C);
    let frameRequested = false;
    let visible = false;
    function update() {
      frameRequested = false;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? clamp(window.scrollY / max, 0, 1) : 0;
      arc.style.strokeDashoffset = String(C * (1 - ratio));
      const shouldShow = window.scrollY > CONFIG.COIN_SHOW_AT;
      if (shouldShow !== visible) {
        visible = shouldShow;
        coin.classList.toggle('is-visible', visible);
      }
    }
    function onScroll() {
      if (frameRequested) return;
      frameRequested = true;
      requestAnimationFrame(update);
    }
    coin.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: (reducedMotion || A11y.isOn()) ? 'auto' : 'smooth' });
      Sound.click();
    });

    const vv = window.visualViewport;
    let pinTicking = false;
    let lastPinOffset = -1;
    function pinCoin() {
      pinTicking = false;
      if (!vv) return;
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      const offset = Math.max(0, Math.round(covered));
      if (offset === lastPinOffset) return;
      lastPinOffset = offset;
      coin.style.bottom = offset > 0
        ? `calc(var(--coin-bottom-gap) + ${offset}px)`
        : '';
    }
    function onViewportShift() {
      if (pinTicking) return;
      pinTicking = true;
      requestAnimationFrame(pinCoin);
    }
    if (vv) {
      vv.addEventListener('resize', onViewportShift);
      vv.addEventListener('scroll', onViewportShift);
      pinCoin();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', debounce(onScroll, 200));
    update();
  }

  /* ============ CURSOR ============ */
  function initCursorFx(fxCanvas) {
    if (!fxCanvas) return;
    const ctx = fxCanvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.CURSOR_DPR_MAX);
    const particles = [];
    const cursorEl = $('#cursor');
    const HOT_X = CONFIG.CURSOR_HOT_X;
    const HOT_Y = CONFIG.CURSOR_HOT_Y;
    const INTERACTIVE = 'a, button, [data-hover], input, textarea, .chip';
    let cursorVisible = true;

    /* Единая точка правды для указателя: класс is-fine (нативный курсор
       скрыт) ставится ровно тогда, когда кастомный действительно может
       следовать за мышью. На тач-устройствах (@media pointer: coarse скрывает
       .cursor) и при prefers-reduced-motion обработчики слежения не
       подключаются — тогда is-fine не ставим, иначе указателя не будет вовсе.
       Функция initCursorFx выходит раньше, если нет canvas/контекста, поэтому
       «безопасное» состояние по умолчанию — нативный курсор виден. */
    const cursorIsActive = customCursorEnabled && Boolean(cursorEl);
    document.documentElement.classList.toggle('is-fine', cursorIsActive);

    function resize() {
      fxCanvas.width = Math.round(window.innerWidth * dpr);
      fxCanvas.height = Math.round(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', debounce(resize, 200));

    if (cursorIsActive) {
      const moveEventName = ('onpointerrawupdate' in window) ? 'pointerrawupdate' : 'pointermove';

      /*
        Позиция курсора применяется ровно один раз за кадр через rAF.
        Без батчинга на каждый pointermove мы писали style.transform —
        при 500–1000 событиях в секунду браузер успевал отрисовать
        лишь часть, и курсор визуально «догонял» системный. С rAF
        transform ставится в тот же тик, что и остальная отрисовка
        страницы, и курсор идёт вплотную за системным.
      */
      let pendingX = null;
      let pendingY = null;
      let rafId = 0;
      function flushCursor() {
        rafId = 0;
        if (pendingX === null) return;
        cursorEl.style.transform =
          `translate3d(${pendingX - HOT_X}px, ${pendingY - HOT_Y}px, 0)`;
        pendingX = null;
        pendingY = null;
      }

      window.addEventListener(moveEventName, (e) => {
        if (!cursorVisible) return;
        pendingX = e.clientX;
        pendingY = e.clientY;
        if (!rafId) rafId = requestAnimationFrame(flushCursor);
      }, { passive: true });

      /*
        Курсор над iframe скрываем — родительский документ не получает
        pointermove, и наш «пилюльный» курсор начинает «зависать».
        Но как только мышь уходит на любой обычный элемент (в том числе
        на кнопку .modal__close, которая лежит поверх iframe), курсор
        надо вернуть. Раньше pointerover только переключал is-hover,
        и после захода в iframe курсор оставался скрытым, пока мышь не
        покидала модалку целиком. Теперь любое попадание на не-iframe
        элемент восстанавливает видимость. */
      document.addEventListener('pointerover', (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (t instanceof HTMLIFrameElement) {
          cursorVisible = false;
          cursorEl.classList.add('is-hidden');
          return;
        }
        if (!cursorVisible) {
          cursorVisible = true;
          cursorEl.classList.remove('is-hidden');
        }
        cursorEl.classList.toggle('is-hover', Boolean(t.closest(INTERACTIVE)));
      });
      document.addEventListener('pointerout', (e) => {
        const t = e.target;
        if (t instanceof HTMLIFrameElement) {
          cursorVisible = true;
          cursorEl.classList.remove('is-hidden');
        }
      });
      document.addEventListener('mouseleave', () => {
        cursorVisible = false;
        cursorEl.classList.add('is-hidden');
      });
      document.addEventListener('mouseenter', () => {
        cursorVisible = true;
        cursorEl.classList.remove('is-hidden');
      });
    }

    /*
      Визуальный центр SVG-курсора. Иконка 20×28, её хотспот
      (HOT_X, HOT_Y) — в верхнем левом углу: искры, выпущенные прямо
      из e.clientX/e.clientY, оказывались в верхней части иконки, а не
      по центру. Сдвигаем точку спавна на половину размеров SVG. */
    const CURSOR_CENTER_X = 10;
    const CURSOR_CENTER_Y = 14;

    window.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (cursorEl) cursorEl.classList.add('is-down');
      /* Искры рисуются в .fx-canvas, а он в режиме для слабовидящих скрыт —
         считать физику для заведомо невидимых частиц незачем. Сам отклик
         курсора на нажатие (is-down) от режима не зависит. */
      if (cursorIsActive && !A11y.isOn() && cursorVisible) {
        spawnBurst(
          e.clientX - HOT_X + CURSOR_CENTER_X,
          e.clientY - HOT_Y + CURSOR_CENTER_Y
        );
      }
    });
    window.addEventListener('pointerup', () => {
      if (cursorEl) cursorEl.classList.remove('is-down');
    });

    function spawnBurst(x, y) {
      const n = CONFIG.BURST_MIN + Math.floor(Math.random() * (CONFIG.BURST_MAX - CONFIG.BURST_MIN + 1));
      for (let i = 0; i < n; i++) {
        if (particles.length >= CONFIG.MAX_PARTICLES) break;
        const a = Math.random() * Math.PI * 2;
        const s = CONFIG.CURSOR_PARTICLE_SPEED_MIN + Math.random() * CONFIG.CURSOR_PARTICLE_SPEED_RANGE;
        particles.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - CONFIG.CURSOR_PARTICLE_UP_BIAS,
          char: randomGlyph(),
          born: performance.now(),
          life: CONFIG.BURST_LIFE_MS * (CONFIG.CURSOR_PARTICLE_LIFE_MIN + Math.random() * CONFIG.CURSOR_PARTICLE_LIFE_RANGE),
          size: CONFIG.CURSOR_PARTICLE_SIZE_MIN + Math.random() * CONFIG.CURSOR_PARTICLE_SIZE_RANGE
        });
      }
    }

    (function frame(now) {
      if (!document.hidden && !A11y.isOn()) {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          const age = now - p.born;
          if (age > p.life) { particles.splice(i, 1); continue; }
          p.vy += CONFIG.CURSOR_PARTICLE_GRAVITY;
          p.x += p.vx;
          p.y += p.vy;
          const alpha = 1 - age / p.life;
          ctx.font = `${p.size}px "JetBrains Mono", monospace`;
          ctx.fillStyle = `rgba(125, 240, 164, ${alpha * CONFIG.CURSOR_PARTICLE_ALPHA})`;
          ctx.fillText(p.char, p.x, p.y);
        }
      }
      requestAnimationFrame(frame);
    })(performance.now());
  }

  /* ============ GLOBAL CLICK SOUND ============ */
  function initGlobalClickSound() {
    window.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('#sound-toggle')) return;
      if (t.closest('#coin')) return;
      Sound.click();
    });
  }

  /* ============ PRELOADER ============ */
  /* Пока идёт прелоадер, body стоит в position: fixed (см. ScrollLock),
     поэтому браузер не может прокрутить страницу к якорю из адреса —
     к моменту снятия блокировки скролл равен 0. */
  function sectionFromHash() {
    const raw = window.location.hash.slice(1);
    if (!raw) return null;
    let id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch { return null; }
    const target = document.getElementById(id);
    return target && target.classList.contains('section') ? target : null;
  }

  function scrollToHashSection() {
    const target = sectionFromHash();
    if (!target) return;
    const html = document.documentElement;
    const prevBehavior = html.style.scrollBehavior;
    /* Как и в ScrollLock: снимаем smooth на время прыжка, иначе после
       прелоадера страница «подъезжает» к секции на большой скорости. */
    html.style.scrollBehavior = 'auto';
    target.scrollIntoView({ block: 'start' });
    html.style.scrollBehavior = prevBehavior;
  }

  /* Дожидаемся снятия блокировки скролла (прелоадер может завершиться
     асинхронно, а на повторном визите — сразу). Только после этого
     раскладка снова становится прокручиваемой, и переход к секции
     срабатывает с учётом её scroll-margin. Модальные якоря (#modal-…)
     сюда не попадают: их открывает initModals. */
  function initHashScroll() {
    if (!sectionFromHash()) return;
    /* setTimeout, а не rAF: после снятия position: fixed нужен кадр,
       в котором документ уже снова прокручиваемый; таймер гарантирует
       это и на вкладках, где requestAnimationFrame приторможен. */
    const restore = () => setTimeout(scrollToHashSection, 0);
    if (!document.body.classList.contains('is-locked')) {
      restore();
      return;
    }
    const mo = new MutationObserver(() => {
      if (document.body.classList.contains('is-locked')) return;
      mo.disconnect();
      restore();
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function initPreloader(rain) {
    const preloader = $('#preloader');
    const fill = $('#preloader-fill');
    const percent = $('#preloader-percent');
    const status = $('#preloader-status');
    const hero = $('#hero');
    const heroLogo = $('.logo--hero');

    function startHero() {
      if (!hero) return;
      playLogo(heroLogo, { onDone: () => hero.classList.add('is-live') });
      hero.classList.add('is-live');
    }
    function unlock() {
      /* Если документ открыт по якорю (#modal-…) или скриптом, окно могли
         показать ещё до конца прелоадера. Снимать блокировку скролла в этот
         момент нельзя — фон поедет под открытой модалкой; снимет её
         closeModal. Проверяем и :target: класс .is-open появляется только
         на следующем кадре, а якорь совпадает сразу. */
      if ($$('.modal.is-open, .modal:target').length === 0) ScrollLock.unlock();
      if (rain) rain.stop();
    }
    if (!preloader) {
      unlock();
      startHero();
      return;
    }
    if (reducedMotion || A11y.isOn()) {
      preloader.remove();
      unlock();
      startHero();
      return;
    }
    if (readSession(CONFIG.PRELOAD_SESSION_KEY) === '1') {
      preloader.remove();
      unlock();
      startHero();
      return;
    }
    writeSession(CONFIG.PRELOAD_SESSION_KEY, '1');

    let finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      clearTimeout(safetyTimer);
      preloader.classList.add('is-core-hidden');
      setTimeout(() => {
        preloader.classList.add('is-draining');
        if (rain) rain.startDrain();
        ScrollLock.unlock();
        startHero();
      }, CONFIG.PRELOAD_SETTLE_MS);
      setTimeout(() => {
        const c = $('.preloader__rain', preloader);
        if (c) c.classList.add('is-fading');
      }, CONFIG.DRAIN_EXIT_MS - CONFIG.DRAIN_FADE_LEAD_MS);
      setTimeout(() => {
        preloader.remove();
        if (rain) rain.stop();
      }, CONFIG.DRAIN_EXIT_MS);
    }
    const safetyTimer = setTimeout(() => {
      if (!document.body.contains(preloader)) return;
      console.warn('[VM Labs] preloader hard-timeout, forcing unlock');
      finished = true;
      preloader.remove();
      ScrollLock.unlock();
      if (rain) rain.stop();
      startHero();
    }, CONFIG.PRELOAD_HARD_TIMEOUT_MS);

    if (rain) rain.start();
    playLogo($('.logo--pre'));

    const t0 = performance.now();
    let statusIdx = 0;
    function progressFrame(now) {
      if (finished || !document.body.contains(preloader)) return;
      const el = now - t0;
      const lin = Math.min(el / CONFIG.PRELOAD_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - lin, 3);
      const jitter = Math.sin(el / CONFIG.PRELOAD_JITTER_PERIOD_MS) * CONFIG.PRELOAD_JITTER_AMPLITUDE;
      const p = clamp(eased + jitter, 0, 1);
      if (fill) fill.style.transform = `scaleX(${p})`;
      if (percent) percent.textContent = `${Math.round(p * 100)}%`;
      if (status) {
        while (statusIdx < PRELOAD_STATUS.length && p >= PRELOAD_STATUS[statusIdx].at) {
          status.textContent = PRELOAD_STATUS[statusIdx].text;
          statusIdx++;
        }
      }
      if (lin >= 1 && el >= CONFIG.PRELOAD_MIN_MS) {
        if (fill) fill.style.transform = 'scaleX(1)';
        if (percent) percent.textContent = '100%';
        setTimeout(finish, CONFIG.PRELOAD_SETTLE_MS);
        return;
      }
      requestAnimationFrame(progressFrame);
    }
    requestAnimationFrame(progressFrame);
  }

  /* ============ SCROLL REVEAL ============ */
  function initReveal() {
    const nodes = $$('[data-reveal]');
    if (!nodes.length) return;
    if (reducedMotion || A11y.isOn() || !('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('is-revealed'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const d = e.target.getAttribute('data-reveal-delay');
        if (d) e.target.style.setProperty('--rd', d);
        e.target.classList.add('is-revealed');
        io.unobserve(e.target);
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
    nodes.forEach((n) => io.observe(n));
  }

  /* ============ DUO ============ */
  function initDuoProgress() {
    const list = $('.duo__list');
    const fill = $('#duo-fill');
    if (!list || !fill) return;
    const rows = $$('.pain-row', list);
    let ticking = false;
    function update() {
      ticking = false;
      const rect = list.getBoundingClientRect();
      const anchor = window.innerHeight * CONFIG.DUO_ANCHOR_RATIO;
      const ratio = rect.height > 0 ? clamp((anchor - rect.top) / rect.height, 0, 1) : 0;
      fill.style.transform = `scaleY(${ratio.toFixed(4)})`;
      rows.forEach((r) => {
        /* Односторонний «замок»: как только строка прошла точку
           срабатывания при движении вниз, класс .is-passed остаётся
           навсегда. С прежним toggle() при скролле вверх зачёркивание
           отматывалось назад — пользователь ожидает, что уже
           прочитанный пункт остаётся перечёркнутым. Линия рисуется
           через CSS-переход (.pain-row__title s) ровно один
           раз — в момент добавления класса. */
        if (r.classList.contains('is-passed')) return;
        const rr = r.getBoundingClientRect();
        const passed = rr.top + rr.height * CONFIG.DUO_ROW_RATIO < anchor;
        if (passed) r.classList.add('is-passed');
      });
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', debounce(onScroll, 200));
    update();
  }

  /* ============ PROCESS ============
     Два пути отображения карточек процесса, выбор — по медиазапросу
     PROCESS_DESKTOP_QUERY (совпадает с порогом, на котором CSS
     включает position: sticky для сцены):

     — десктоп: sticky-сцена фиксируется, прогресс скролла от 0 до 1
       равномерно раскидывается по порогам cards.length - 1; карточка
       становится .is-visible, когда прогресс её достигает;

     — мобила/планшет: sticky-сцены нет, карточки просто въезжают
       справа, когда их верх достигает ~половины высоты вьюпорта.
       Ориентир — реальная позиция элемента в кадре, а не прогресс
       псевдо-скролла.
  */
  function initProcessScroll() {
    const track = $('#process-track');
    const fill = $('#process-fill');
    const dots = $$('.process-bar__dot');
    const cards = $$('.process-card');
    if (!track || !cards.length) return;

    cards.forEach((c, i) => c.style.setProperty('--i', i));

    if (reducedMotion || A11y.isOn()) {
      cards.forEach((c) => c.classList.add('is-visible'));
      dots.forEach((d) => d.classList.add('is-active'));
      if (fill) fill.style.transform = 'scaleX(1)';
      return;
    }

    const denom = Math.max(1, cards.length - 1);
    const thresholds = cards.map((_, i) => (i / denom) * CONFIG.PROCESS_LAST_THRESHOLD);

    const stickyMedia = window.matchMedia(CONFIG.PROCESS_DESKTOP_QUERY);

    let ticking = false;
    let io = null;

    /*
      На мобиле трек из пяти карточек ГАРАНТИРОВАННО выше экрана,
      поэтому прежняя проверка «track выше вьюпорта» всегда давала
      true — observer не создавался, а видимость считал sticky-путь
      по прогрессу фиктивной фиксации. Отсюда и «анимация уже
      отыграна, пока карточка за кадром». Теперь признак sticky —
      только медиазапрос: он один в один повторяет условие, при
      котором CSS применяет position: sticky к .process-stage.
    */
    function isSticky() {
      if (!stickyMedia.matches) return false;
      return track.offsetHeight - window.innerHeight > 0;
    }

    function updateSticky() {
      ticking = false;
      if (!isSticky()) return;
      const rect = track.getBoundingClientRect();
      const total = track.offsetHeight - window.innerHeight;
      const progress = clamp(-rect.top / total, 0, 1);
      /*
        Полоса и точки должны идти в одном темпе с карточками.
        Пороги карточек сжаты в PROCESS_LAST_THRESHOLD (0.6): последняя
        карточка появляется не в самом конце пина, а на 60% прокрутки,
        чтобы оставалось время её прочитать. Поэтому scaleX(progress)
        напрямую давал рассинхрон — полоса доходила до точки позже,
        чем зажигалась карточка (точка 4 активна, а линия ещё на точке 3).
        Нормируем заливку на тот же порог: при progress = threshold[i]
        scaleX = i / (cards.length - 1), то есть линия ровно на i-й точке.
      */
      const fillProgress = clamp(progress / CONFIG.PROCESS_LAST_THRESHOLD, 0, 1);
      if (fill) fill.style.transform = `scaleX(${fillProgress.toFixed(4)})`;
      cards.forEach((c, i) => {
        if (progress + 0.0001 >= thresholds[i]) c.classList.add('is-visible');
      });
      dots.forEach((d, i) => {
        d.classList.toggle('is-active', progress + 0.0001 >= thresholds[i]);
      });
    }

    function setupIntersection() {
      if (io) { io.disconnect(); io = null; }
      if (isSticky()) return;
      if (!('IntersectionObserver' in window)) {
        cards.forEach((c) => c.classList.add('is-visible'));
        return;
      }
      /*
        Мобильный путь (десктоп идёт через updateSticky — там sticky).
        rootMargin по нижней кромке -50%: карточка «оживает», когда её
        верх доходит примерно до половины высоты вьюпорта. Раньше
        значение -35% до этой правки вообще не применялось — код был
        в мёртвой ветке (см. isSticky выше). Теперь это реальный
        триггер: анимация стартует на глазах у пользователя, а не
        когда карточка уже почти уехала за верхнюю кромку.
      */
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add('is-visible');
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -25% 0px' });
      cards.forEach((c) => io.observe(c));
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateSticky);
    }

    function refresh() {
      setupIntersection();
      updateSticky();
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', debounce(refresh, 200));

    /*
      При переходе через границу 861px (поворот планшета, изменение
      размера окна) нужно пересобрать observer: на десктопе он не
      нужен, а на мобиле без него карточки не появятся вообще.
      У matchMedia API в Safari < 14 нет addEventListener —
      предусмотрен fallback на устаревший addListener.
    */
    if (typeof stickyMedia.addEventListener === 'function') {
      stickyMedia.addEventListener('change', refresh);
    } else if (typeof stickyMedia.addListener === 'function') {
      stickyMedia.addListener(refresh);
    }

    refresh();
  }

  /* ============ SPOTLIGHT ============ */
  function initSpotlight() {
    if (!finePointer) return;
    $$('[data-hover]').forEach((card) => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${e.clientX - r.left}px`);
        card.style.setProperty('--my', `${e.clientY - r.top}px`);
      });
    });
  }

  /* ============ HEADER + МОБИЛЬНОЕ МЕНЮ + FOCUS-TRAP ============ */
  function initHeader() {
    const header = $('#header');
    const burger = $('#burger');
    const toggle = $('#header-toggle');
    const nav = $('#site-nav');
    let ticking = false;

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        if (header) {
          header.classList.toggle('is-scrolled', window.scrollY > CONFIG.HEADER_SCROLL_THRESHOLD_PX);
        }
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    if (!header || !burger) return;

    function closeMenu({ returnFocus = false } = {}) {
      if (!header.classList.contains('is-menu-open')) return;
      header.classList.remove('is-menu-open');
      burger.setAttribute('aria-expanded', 'false');
      if (returnFocus) burger.focus();
    }

    burger.addEventListener('click', () => {
      const open = header.classList.toggle('is-menu-open');
      burger.setAttribute('aria-expanded', String(open));
      if (open && nav) {
        const focusables = getFocusable(nav);
        if (focusables.length) focusables[0].focus();
      }
    });

    $$('#site-nav a').forEach((l) => l.addEventListener('click', () => closeMenu()));

    document.addEventListener('keydown', (e) => {
      if (!header.classList.contains('is-menu-open')) return;
      if (e.key === 'Escape') {
        closeMenu({ returnFocus: true });
        return;
      }
      if (e.key !== 'Tab' || !nav) return;
      const focusables = getFocusable(nav);
      if (!focusables.length) { e.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!nav.contains(active)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    });

    if (toggle) {
      toggle.addEventListener('click', () => {
        const collapsed = header.classList.toggle('is-collapsed');
        toggle.setAttribute('aria-expanded', String(!collapsed));
        toggle.setAttribute('aria-label', collapsed ? 'Развернуть шапку' : 'Свернуть шапку');
        if (collapsed) closeMenu();
      });
    }

    /* При смене мобильной и десктопной вёрстки (поворот экрана, ресайз
      окна) сбрасываем состояния, которые относятся только к одной из
       них. Иначе: открытое мобильное меню оставит активным focus-trap —
       на десктопе Tab начнёт зацикливаться в шапке. А свёрнутая шапка
       на мобильном скроет вообще все элементы разом (там кнопка
       разворота — .header-toggle — display: none), и вернуть её будет
       нечем. */
    const desktopMedia = window.matchMedia(CONFIG.HEADER_DESKTOP_QUERY);
    function handleBreakpointChange() {
      closeMenu();
      if (!header.classList.contains('is-collapsed')) return;
      header.classList.remove('is-collapsed');
      if (toggle) {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.setAttribute('aria-label', 'Свернуть шапку');
      }
    }
    if (typeof desktopMedia.addEventListener === 'function') {
      desktopMedia.addEventListener('change', handleBreakpointChange);
    } else if (typeof desktopMedia.addListener === 'function') {
      // Safari < 14 — старый API, но на iOS 13 ещё встречается.
      desktopMedia.addListener(handleBreakpointChange);
    }
  }

  /* ============ FIRST-VISIT HINTS ============
     Подсказки над кнопками управления (на десктопе — звук, a11y,
     тема, сворачивание шапки; на мобильных звук и сворачивание
     скрыты). Показываются при каждом заходе — до тех пор, пока
     пользователь явно не ответит «Да» на вопрос «Скрыть подсказки?».
     «Да» записывает время отказа: пока человек заходит хотя бы раз
     в 14 дней, подсказки скрыты. После двух недель без заходов отказ
     сбрасывается, и подсказки появляются снова. «Нет» и клик по
     любой из кнопок убирают их только на текущий заход, выбор не
     запоминается. В режиме для слабовидящих пропускаем полностью
     (в CSS они тоже скрыты). */
  function initFirstVisitHints() {
    const now = Date.now();
    const lastVisitAt = readStorageTime(CONFIG.HINTS_LAST_VISIT_KEY);
    let optedOutAt = readStorageTime(CONFIG.HINTS_OPT_OUT_KEY);
    const legacyOptOut = !optedOutAt && readStorage(CONFIG.HINTS_OPT_OUT_KEY) === '1';
    if (legacyOptOut) optedOutAt = now;

    /* Отсутствие считаем по предыдущему заходу. Дату текущего пишем
       всегда — в том числе при отказе и на страницах без подсказок:
       иначе 14-дневный таймер не работал бы. */
    const absentLong = lastVisitAt > 0
      && now - lastVisitAt >= CONFIG.HINTS_RESET_AFTER_MS;
    if (optedOutAt && absentLong) {
      /* Человек не заходил две недели — «Да» сбрасываем. */
      removeStorage(CONFIG.HINTS_OPT_OUT_KEY);
      optedOutAt = 0;
    } else if (legacyOptOut) {
      /* Старое значение «1» переводим во время: отказ продолжит
         действовать, пока человек заходит, и сбросится после двух
         недель отсутствия. */
      writeStorage(CONFIG.HINTS_OPT_OUT_KEY, String(now));
    }
    writeStorage(CONFIG.HINTS_LAST_VISIT_KEY, String(now));

    /* Старый ключ vmlabs:hints-shown писался при первом же показе,
       из-за чего подсказки исчезали навсегда; подчищаем. */
    removeStorage('vmlabs:hints-shown');

    if (optedOutAt) return;
    if (A11y.isOn()) return;
    const hints = $$('[data-tool-hint]');
    if (!hints.length) return;
    const actions = $('#hint-actions');
    const yesBtn = actions ? actions.querySelector('[data-hints-hide]') : null;
    const noBtn = actions ? actions.querySelector('[data-hints-keep]') : null;

    let hideTimer = null;
    let stopped = false;

    const persistOptOut = () => writeStorage(CONFIG.HINTS_OPT_OUT_KEY, String(Date.now()));

    const hideAll = () => {
      if (stopped) return;
      stopped = true;
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = null;
      hints.forEach((el) => el.classList.remove('is-visible'));
      if (actions) actions.classList.remove('is-visible');
      document.body.classList.remove('has-hints');
      document.removeEventListener('click', onClick, true);
    };

    /* Клик по любой из «своих» кнопок (звук, a11y, тема, сворачивание
       шапки) — подсказки убираем сразу: пользователь уже разобрался.
       Слушаем на фазе capture, чтобы сработало даже если обработчик
       кнопки остановит всплытие (stopPropagation).
       Клики по самому блоку «Скрыть подсказки?» исключены — у его
       кнопок своя логика ниже. */
    const onClick = (e) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest('[data-hints-hide], [data-hints-keep]')) return;
      if (!e.target.closest('#sound-toggle, #a11y-toggle, #theme-toggle, #header-toggle')) return;
      hideAll();
    };
    document.addEventListener('click', onClick, true);

    // «Да» — скрыть подсказки. Отказ хранится со временем и сбрасывается,
    // если человек не заходил 14 дней (см. начало функции).
    if (yesBtn) {
      yesBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        persistOptOut();
        hideAll();
      });
    }
    // «Нет» — убираем только сам вопрос, подсказки живут до таймера.
    // Выбор не запоминаем: при следующем заходе подсказки появятся
    // снова — пока пользователь не нажмёт «Да».
    if (noBtn) {
      noBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (actions) actions.classList.remove('is-visible');
      });
    }

    setTimeout(() => {
      if (stopped) return;
      hints.forEach((el) => el.classList.add('is-visible'));
      if (actions) actions.classList.add('is-visible');
      /* Дублёр :has()-селектора из CSS: браузеры без поддержки :has()
         (Safari < 15.4, Firefox < 121) не сдвинут hero под каскад
         подсказок, поэтому класс вешается явно и убирается вместе
         с подсказками в hideAll(). */
      document.body.classList.add('has-hints');
      hideTimer = setTimeout(hideAll, CONFIG.HINT_VISIBLE_MS);
    }, CONFIG.HINT_FIRST_DELAY_MS);
  }

  /* ============ TICKER ============ */
  function initTicker() {
    const track = $('#ticker-track');
    if (!track) return;
    Array.from(track.children).forEach((n) => {
      const clone = n.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      track.appendChild(clone);
    });
  }

  /* ============ FAQ ============ */
  function initFaq() {
    const items = $$('.faq-item');
    if (!items.length) return;
    function close(item) {
      const b = $('.faq__q', item);
      const p = $('.faq__panel', item);
      item.classList.remove('is-open');
      if (b) b.setAttribute('aria-expanded', 'false');
      if (p) p.style.maxHeight = '0px';
    }
    items.forEach((item) => {
      const b = $('.faq__q', item);
      const p = $('.faq__panel', item);
      if (!b || !p) return;
      b.addEventListener('click', () => {
        const wasOpen = item.classList.contains('is-open');
        items.forEach(close);
        if (wasOpen) return;
        item.classList.add('is-open');
        b.setAttribute('aria-expanded', 'true');
        p.style.maxHeight = `${p.scrollHeight}px`;
      });
    });
    window.addEventListener('resize', debounce(() => {
      items.filter((i) => i.classList.contains('is-open')).forEach((i) => {
        const p = $('.faq__panel', i);
        if (p) p.style.maxHeight = `${p.scrollHeight}px`;
      });
    }, 200));
  }

  /* ============ FAQ GROUPS ============
     Главы FAQ: открыта одновременно одна, внутри — обычные вопросы
     (их поведение остаётся в initFaq). При закрытии главы её вопросы
     тоже закрываем: иначе после смены ширины окна у них остаётся
     старый inline max-height и ответ обрезается. */
  function initFaqGroups() {
    const groups = $$('.faq-group');
    if (!groups.length) return;

    function questionsWord(count) {
      const mod10 = count % 10;
      const mod100 = count % 100;
      if (mod10 === 1 && mod100 !== 11) return 'вопрос';
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'вопроса';
      return 'вопросов';
    }

    function closeGroup(group) {
      group.classList.remove('is-open');
      const b = $('.faq-group__q', group);
      if (b) b.setAttribute('aria-expanded', 'false');
      $$('.faq-item', group).forEach((item) => {
        item.classList.remove('is-open');
        const ib = $('.faq__q', item);
        const ip = $('.faq__panel', item);
        if (ib) ib.setAttribute('aria-expanded', 'false');
        if (ip) ip.style.maxHeight = '0px';
      });
    }

    groups.forEach((group) => {
      const btn = $('.faq-group__q', group);
      if (!btn) return;

      const count = $$('.faq-item', group).length;
      const meta = $('.faq-group__count', group);
      if (meta) meta.textContent = `${count} ${questionsWord(count)}`;

      btn.addEventListener('click', () => {
        const willOpen = !group.classList.contains('is-open');
        groups.forEach((other) => { if (other !== group) closeGroup(other); });
        if (!willOpen) {
          closeGroup(group);
          return;
        }
        group.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true');
      });
    });
  }

  /* ============ FORM ============ */
  function initForm() {
    const form = $('#lead-form');
    const success = $('#form-success');
    const alertBox = $('#form-alert');
    const alertText = $('#form-alert-text');
    if (!form) return;
    form.dataset.leadBound = 'true';
    const attribution = captureAttribution();
    const honeypot = form.querySelector('[data-honeypot]')
      || form.querySelector('input[name="website"]');

    function showAlert(msg) {
      if (!alertBox || !alertText) return;
      alertText.textContent = msg;
      alertBox.hidden = false;
      alertBox.style.animation = 'none';
      void alertBox.offsetWidth;
      alertBox.style.animation = '';
    }
    function hideAlert() { if (alertBox) alertBox.hidden = true; }

    /* Textarea без ручного resize: высота считается по содержимому.
       Пересчитываем на ввод, при изменении ширины окна и после загрузки
       шрифтов — от них зависит перенос строк. */
    const textareas = $$('textarea', form);
    function resizeTextarea(field) {
      field.style.height = 'auto';
      field.style.height = field.scrollHeight + 2 + 'px';
    }
    textareas.forEach((field) => resizeTextarea(field));
    window.addEventListener('resize', debounce(() => {
      textareas.forEach((field) => resizeTextarea(field));
    }, 150));
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        textareas.forEach((field) => resizeTextarea(field));
      });
    }

    const fb = CONFIG.FALLBACK_CONTACT;
    const fbText = [fb.telegram, fb.email].filter(Boolean).join(' или ');

    const channelBtns = $$('.channel-icon[data-channel]', form);
    const contactInput = $('#field-contact', form);
    const contactHint = $('#field-contact-hint', form);
    const contactWrap = $('#field-contact-wrap', form);
    let activeChannel = null;

    function markChannelError(has) {
      channelBtns.forEach((b) => b.classList.toggle('is-error', has));
    }

    /* Какая клавиатура уместна на телефоне для выбранного канала.
       MAX принимает только номер — там цифровая клавиатура. */
    const CHANNEL_INPUTMODE = Object.freeze({ email: 'email', max: 'tel' });

    function applyChannel(channel) {
      activeChannel = channel || null;
      channelBtns.forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.channel === activeChannel));
      });

      if (!activeChannel) {
        /* Поле контакта не прячем: иначе после выбора канала форма прыгает
           вниз на высоту поля. Пока канал не выбран — поле неактивно,
           подсказка объясняет, что делать. */
        if (contactInput) {
          contactInput.disabled = true;
          contactInput.value = '';
          contactInput.placeholder = '@username';
          contactInput.setAttribute('inputmode', 'text');
        }
        if (contactHint) contactHint.textContent = '// сначала выберите канал связи';
        return;
      }

      const cfg = CONFIG.CONTACT_CHANNELS[activeChannel];
      if (!cfg) return;
      if (contactInput) {
        contactInput.disabled = false;
        contactInput.placeholder = cfg.placeholder;
        contactInput.setAttribute('inputmode', CHANNEL_INPUTMODE[activeChannel] || 'text');
      }
      if (contactHint) contactHint.textContent = cfg.hint;
      if (contactWrap) contactWrap.hidden = false;
    }

    channelBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const channel = b.dataset.channel;
        if (!channel || channel === activeChannel) return;
        applyChannel(channel);
        markError(contactInput, false);
        markChannelError(false);
        Sound.tick();
      });
    });

    applyChannel(null);

    const chips = $$('.chip[data-chip]', form);

    /* Чипы — независимые переключатели: каждый хранит своё состояние
       в aria-pressed. Раньше «другой» был эксклюзивным и сбрасывал
       остальные варианты — это ломало сценарий «нужен лендинг под
       вебинар И под марафон сразу». Теперь можно отметить сколько
       угодно чипов, включая «другой»; сервер получит полный список
       в поле landing_types. */
    chips.forEach((c) => {
      c.addEventListener('click', () => {
        const pressed = c.getAttribute('aria-pressed') === 'true';
        c.setAttribute('aria-pressed', String(!pressed));
      });
    });

    /* Площадки продвижения — отдельная группа мультивыбора: раньше это
       был select, и выбрать можно было только одну площадку. Теперь это
       независимые переключатели, как и типы проектов. В payload уходят
       только они (data-platform), чтобы не смешиваться с landing_types. */
    const platformChips = $$('.chip[data-platform]', form);
    platformChips.forEach((c) => {
      c.addEventListener('click', () => {
        const pressed = c.getAttribute('aria-pressed') === 'true';
        c.setAttribute('aria-pressed', String(!pressed));
      });
    });

    function markError(inp, has) {
      if (!inp) return;
      inp.classList.toggle('is-error', has);
      inp.setAttribute('aria-invalid', String(has));
    }

    function validate() {
      const name = $('#field-name', form);
      const contact = $('#field-contact', form);
      const consent = $('#consent-pd', form);
      const invalid = [];
      let message = '';

      if (!name || name.value.trim().length < CONFIG.FORM_NAME_MIN_LEN) {
        markError(name, true);
        if (name) invalid.push(name);
        if (!message) message = 'Укажите, как к Вам обращаться (минимум 2 символа).';
      } else markError(name, false);

      if (!activeChannel) {
        markChannelError(true);
        if (channelBtns.length) invalid.push(channelBtns[0]);
        if (!message) message = 'Выберите канал связи — куда прислать ответ.';
      } else {
        markChannelError(false);
        const cv = contact ? contact.value.trim() : '';
        const channelCfg = CONFIG.CONTACT_CHANNELS[activeChannel];
        if (!cv) {
          markError(contact, true);
          if (contact) invalid.push(contact);
          if (!message) message = 'Укажите контакт для ответа — без этого мы не сможем связаться.';
        } else if (channelCfg && !contactMatches(channelCfg, cv)) {
          markError(contact, true);
          if (contact) invalid.push(contact);
          if (!message) message = channelCfg.error;
        } else markError(contact, false);
      }

      if (consent && !consent.checked) {
        consent.setAttribute('aria-invalid', 'true');
        invalid.push(consent);
        if (!message) message = 'Необходимо согласие на обработку персональных данных.';
      } else if (consent) consent.setAttribute('aria-invalid', 'false');

      const offer = $('#consent-offer', form);
      if (offer && !offer.checked) {
        offer.setAttribute('aria-invalid', 'true');
        invalid.push(offer);
        if (!message) message = 'Необходимо принять условия публичной оферты.';
      } else if (offer) offer.setAttribute('aria-invalid', 'false');

      return { invalid, message };
    }

    function rateLimited() {
      const last = Number(readStorage(CONFIG.RATE_LIMIT_KEY) || 0);
      return Date.now() - last < CONFIG.RATE_LIMIT_MS;
    }
    function markSubmitted() { writeStorage(CONFIG.RATE_LIMIT_KEY, String(Date.now())); }

    async function submitLead(payload) {
      const endpoint = apiUrl('/applications');
      if (!endpoint) throw new Error('ENDPOINT_NOT_CONFIGURED');
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), CONFIG.LEAD_TIMEOUT_MS);
      let r;
      try {
        r = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
      } finally {
        clearTimeout(to);
      }
      let data = null;
      try { data = await r.json(); } catch { /* не JSON — решим по коду ответа */ }
      if (data && typeof data.error === 'string' && data.error) {
        const e = new Error('SERVER_MESSAGE');
        e.serverMessage = data.error;
        throw e;
      }
      if (!r.ok) throw new Error(`HTTP_${r.status}`);
      return data || {};
    }

    let verifyRequired = false;
    let verifyChannels = [];
    const BOT_CHANNELS = ['telegram', 'max'];
    const BOT_CHANNEL_NAMES = { telegram: 'Telegram', max: 'MAX' };
    let telegramConfirmed = false;
    let verifyPollTimer = null;
    let verifyPollTicks = 0;
    const VERIFY_POLL_MS = 3000;
    const VERIFY_POLL_MAX = 200;

    (async function loadPublicConfig() {
      const url = apiUrl('/documents');
      if (!url) return;
      try {
        const data = await (await fetch(url)).json();
        const cv = data && data.contact_verification;
        verifyRequired = Boolean(cv && cv.required);
        verifyChannels = (cv && Array.isArray(cv.channels)) ? cv.channels : [];
      } catch { /* нет связи — сервер всё равно проверит при отправке */ }
    })();

    function stopVerifyPolling() {
      if (verifyPollTimer) {
        clearInterval(verifyPollTimer);
        verifyPollTimer = null;
      }
    }

    function showVerifyField(show, mode) {
      const isBot = mode === 'bot';
      const wrap = $('#field-verify-wrap', form);
      const bot = $('#field-verify-bot', form);
      if (wrap) wrap.hidden = !show || isBot;
      if (bot) bot.hidden = !show || !isBot;
      if (!show) stopVerifyPolling();
    }

    async function requestVerifyCode(contact, channel) {
      const url = apiUrl('/verify/request');
      if (!url) {
        showAlert('Страница открыта как файл — заявку отправить нельзя.');
        return null;
      }
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact: contact,
            contact_channel: channel || 'email'
          })
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data && data.ok) return data;
        showAlert((data && data.error) || 'Не удалось отправить код подтверждения.');
        return null;
      } catch {
        showAlert('Сервер не отвечает. Попробуйте ещё раз.');
        return null;
      }
    }

    async function isContactConfirmed(contact, channel) {
      const url = apiUrl('/verify/status?contact=' + encodeURIComponent(contact) +
        '&contact_channel=' + encodeURIComponent(channel || 'email'));
      if (!url) return false;
      try {
        const data = await (await fetch(url)).json();
        return Boolean(data && data.confirmed);
      } catch {
        return false;
      }
    }

    function showBotInstruction(data, channel) {
      const label = $('#field-verify-bot-label', form);
      const text = $('#field-verify-bot-text', form);
      const code = $('#field-verify-bot-code', form);
      const status = $('#field-verify-bot-status', form);

      if (label) {
        const name = BOT_CHANNEL_NAMES[channel] || 'мессенджере';
        label.textContent = 'подтверждение в ' + name;
      }
      if (text) text.textContent = data.message || '';
      if (code) code.textContent = data.bot_code || '';
      if (status) status.textContent = '// ждём подтверждения…';
      showVerifyField(true, 'bot');
    }

    function waitForConfirmation(contact, channel) {
      stopVerifyPolling();
      verifyPollTicks = 0;
      const status = $('#field-verify-bot-status', form);

      verifyPollTimer = setInterval(async () => {
        verifyPollTicks += 1;

        if (await isContactConfirmed(contact, channel || 'telegram')) {
          stopVerifyPolling();
          telegramConfirmed = true;
          if (status) status.textContent = '// подтверждено — отправляем заявку';
          if (typeof form.requestSubmit === 'function') form.requestSubmit();
          return;
        }

        if (verifyPollTicks >= VERIFY_POLL_MAX) {
          stopVerifyPolling();
          if (status) {
            status.textContent =
              '// время ожидания истекло — нажмите «Отправить», чтобы получить новый код';
          }
        }
      }, VERIFY_POLL_MS);
    }

    $$('input, textarea', form).forEach((f) => {
      f.addEventListener('input', () => {
        if (f.tagName === 'TEXTAREA') resizeTextarea(f);
        if (f.classList.contains('is-error')) {
          f.classList.remove('is-error');
          f.removeAttribute('aria-invalid');
        }
      });
      if (f.type === 'checkbox') {
        f.addEventListener('change', () => f.removeAttribute('aria-invalid'));
      }
    });

    /* Защита от двойной отправки. Пока submitLeadForm() не вернул
       управление (внутри может идти fetch заявки или запрос кода
       подтверждения), повторный submit — клик по кнопке, Enter в поле,
       form.requestSubmit() из опроса verify — игнорируется: иначе один
       человек создаёт две одинаковые заявки. Флаг снимается в finally,
       поэтому ранние return (honeypot, rate-limit, ошибки валидации,
       ветка подтверждения контакта) его не «залипают»: когда код
       подтверждён, опрос снова вызывает form.requestSubmit(), и заявка
       уходит уже с verification_code. */
    let submitInFlight = false;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (submitInFlight) return;
      submitInFlight = true;
      try {
        await submitLeadForm();
      } finally {
        submitInFlight = false;
      }
    });

    async function submitLeadForm() {
      if (honeypot && honeypot.value) {
        form.hidden = true;
        if (success) {
          success.hidden = false;
          requestAnimationFrame(() => success.classList.add('is-played'));
        }
        return;
      }
      if (rateLimited()) {
        showAlert('Вы уже отправляли заявку недавно. Пожалуйста, подождите немного.');
        Sound.tick();
        return;
      }
      const { invalid, message } = validate();
      if (invalid.length) {
        showAlert(message);
        invalid[0].focus();
        invalid[0].scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
        Sound.tick();
        return;
      }
      hideAlert();

      const name = $('#field-name', form);
      const contact = $('#field-contact', form);
      const cpd = $('#consent-pd', form);
      const cof = $('#consent-offer', form);
      const cads = $('#consent-ads', form);
      const wishes = $('#field-wishes', form);
      const other = $('#field-other', form);

      const fieldValue = (selector) => {
        const el = $(selector, form);
        return el && typeof el.value === 'string' ? el.value.trim() : '';
      };

      const payload = {
        name: name ? name.value.trim() : '',
        contact_channel: activeChannel,
        contact: contact ? contact.value.trim() : '',
        landing_types: $$('.chip[data-chip][aria-pressed="true"]', form)
          .map((c) => c.textContent.trim())
          .filter(Boolean),
        product_description: other ? other.value.trim() : '',
        wishes: wishes ? wishes.value.trim() : '',
        budget: fieldValue('#field-budget'),
        launch_date: fieldValue('#field-launch-date'),
        platform: $$('.chip[data-platform][aria-pressed="true"]', form)
          .map((c) => c.getAttribute('data-platform') || c.textContent.trim())
          .filter(Boolean)
          .join(', '),
        current_landing: fieldValue('#field-current-landing'),
        utm_source: attribution.utm_source || '',
        utm_medium: attribution.utm_medium || '',
        utm_campaign: attribution.utm_campaign || '',
        utm_content: attribution.utm_content || '',
        utm_term: attribution.utm_term || '',
        referrer: attribution.referrer || '',
        landing_page: attribution.landing_page || '',
        consent_pd: cpd ? cpd.checked : false,
        consent_offer: cof ? cof.checked : false,
        consent_ads: cads ? cads.checked : false,
        website: honeypot ? honeypot.value : '',
        page_url: window.location.href,
        form_id: form.id || 'lead-form',
        session_id: getSessionId()
      };

      if (verifyRequired && verifyChannels.indexOf(payload.contact_channel) !== -1) {
        if (BOT_CHANNELS.indexOf(payload.contact_channel) !== -1) {
          if (!telegramConfirmed) {
            const data = await requestVerifyCode(payload.contact, payload.contact_channel);
            if (!data) return;
            showBotInstruction(data, payload.contact_channel);
            waitForConfirmation(payload.contact, payload.contact_channel);
            return;
          }
        } else {
          const verifyField = $('#field-verify', form);
          const typed = verifyField ? verifyField.value.trim() : '';
          if (!typed) {
            const data = await requestVerifyCode(payload.contact, 'email');
            if (!data) return;
            const hint = $('#field-verify-hint', form);
            if (hint) {
              hint.textContent = '// ' + (data.message || 'код отправлен на указанный e-mail');
            }
            showVerifyField(true, 'code');
            if (verifyField) verifyField.focus();
            return;
          }
          payload.verification_code = typed;
        }
      }

      const submitBtn = $('button[type="submit"]', form);
      const label = submitBtn ? $('.btn__label', submitBtn) : null;
      const original = label ? label.textContent : '';
      if (submitBtn) submitBtn.classList.add('is-loading');
      if (label) label.textContent = 'Передаём пакеты…';
      try {
        await submitLead(payload);
        markSubmitted();
        /* Цель отправляем только после успешного ответа API. Типы
           лендинга берём из data-chip-value (стабильные коды), а не из
           подписей кнопок: текст в интерфейсе может измениться, и
           отчёт развалится на «под вебинар» и «под вебинар ». */
        Telemetry.trackLead({
          channel: payload.contact_channel,
          formId: payload.form_id,
          landingTypes: $$('.chip[data-chip][aria-pressed="true"]', form)
            .map((c) => c.getAttribute('data-chip-value'))
            .filter(Boolean)
            .join(',')
        });
        form.hidden = true;
        if (success) {
          success.hidden = false;
          requestAnimationFrame(() => success.classList.add('is-played'));
        }
        Sound.success();
      } catch (err) {
        if (submitBtn) submitBtn.classList.remove('is-loading');
        if (label) label.textContent = original;
        if (err && err.message === 'SERVER_MESSAGE') {
          showAlert(err.serverMessage);
        } else if (err && err.message === 'ENDPOINT_NOT_CONFIGURED') {
          showAlert('Страница открыта как файл, поэтому заявку отправить нельзя. ' +
            'Запустите сайт вместе с сервером (scripts/dev_server.py) и откройте ' +
            'http://127.0.0.1:8000 — либо зайдите на сайт с сервера.' +
            (fbText ? ` А пока можно написать напрямую: ${fbText}.` : ''));
        } else if (err && err.name === 'AbortError') {
          showAlert('Превышено время ожидания. Проверьте соединение и попробуйте ещё раз' +
            (fbText ? `, или напишите нам: ${fbText}.` : '.'));
        } else if (err && typeof err.message === 'string' && err.message.startsWith('HTTP_')) {
          const code = err.message.replace('HTTP_', '');
          showAlert(`Сервер ответил с ошибкой (${code}). Попробуйте ещё раз` +
            (fbText ? `, или напишите нам: ${fbText}.` : '.'));
        } else {
          showAlert('Не удалось отправить заявку. Попробуйте ещё раз' +
            (fbText ? `, или напишите нам: ${fbText}.` : '.'));
        }
        Sound.tick();
      }
    }
  }

  /* ============ MODAL ============ */
  function initModals() {
    const modalMap = new Map();
    $$('.modal').forEach((m) => modalMap.set(m.id, m));
    if (!modalMap.size) return;

    let lastFocused = null;
    let activeModal = null;

    /* Тема демо-iframe (#modal-demo). Своей кнопки у модалки нет:
       тема берётся из темы сайта в момент открытия — переключатель
       в шапке уже есть, дублировать его внутри демо не нужно.
       При каждом открытии iframe получает актуальный display-стейт. */
    let demoTheme = 'dark';

    function postDemoTheme(frame) {
      if (!frame || !frame.contentWindow) return;
      /* Передаём актуальное состояние версии для слабовидящих, а не
         жёсткое 'off'. Иначе при открытии демо с уже включённым
         режимом a11y iframe сначала читал localStorage и включал
         крупный шрифт, а этот postMessage тут же сбрасывал его
         обратно — режим «не работал» на демо-страницах. */
      const a11y = document.documentElement.hasAttribute('data-a11y') ? 'on' : 'off';
      try {
        frame.contentWindow.postMessage(
          { type: 'vmlabs:display', theme: demoTheme, a11y },
          window.location.origin
        );
      } catch { /* iframe ещё не готов — не критично */ }

      /* Страховка на случай, если postMessage не дошёл (старый кэш
         demo.js, гонка при загрузке). Тот же origin — можно поставить
         тему напрямую в документ iframe. */
      try {
        const frameDoc = frame.contentDocument;
        if (frameDoc && frameDoc.documentElement) {
          frameDoc.documentElement.setAttribute('data-theme', demoTheme);
          frameDoc.documentElement.style.colorScheme = demoTheme;
          /* Версия для слабовидящих: демо-страницы реагируют на тот же
             атрибут data-a11y, что и сайт (см. css/demo-a11y.css).
             postMessage выше — для будущих слушателей; этот путь
             работает уже сейчас, потому что демо с того же origin. */
          if (a11y === 'on') frameDoc.documentElement.setAttribute('data-a11y', 'on');
          else frameDoc.documentElement.removeAttribute('data-a11y');
        }
      } catch { /* cross-origin или iframe ещё about:blank */ }
    }

    /*
      Юридические документы лежат прямо в разметке модалок — подгружать их
      fetch-ом и вставлять в .legal больше не нужно: так текст одинаково
      выглядит и работает без скрипта, на file:// и в офлайне. Здесь
      остаётся только аналитика — отмечаем просмотр документа один раз за
      загрузку страницы, как это делала прежняя подгрузка.
    */
    const REPORTED_DOCS = new Set();
    function reportLegalOnce(modal) {
      const legal = $('[data-legal-src]', modal);
      if (!legal) return;
      const src = legal.getAttribute('data-legal-src');
      if (!src || REPORTED_DOCS.has(src)) return;
      REPORTED_DOCS.add(src);
      reportDocumentView(src);
    }

    function openByName(name) {
      const modal = modalMap.get(`modal-${name}`);
      if (!modal) return;

      reportLegalOnce(modal);

      lastFocused = document.activeElement;
      activeModal = modal;
      modal.hidden = false;
      ScrollLock.lock();
      requestAnimationFrame(() => modal.classList.add('is-open'));
      const closeBtn = $('.modal__close', modal);
      const focusables = getFocusable(modal);
      const first = closeBtn || focusables[0];
      if (first) first.focus();
    }

    function openDemo(src, title) {
      const modal = modalMap.get('modal-demo');
      if (!modal) return;
      const frame = $('#modal-demo-frame', modal);
      const titleEl = $('#modal-demo-title', modal);
      if (titleEl && title) titleEl.textContent = title;

      // Тема демо — как у сайта на момент открытия: отдельного
      // переключателя в модалке нет.
      demoTheme = document.documentElement.getAttribute('data-theme') === 'light'
        ? 'light'
        : 'dark';

      if (frame) {
        if (title) frame.setAttribute('title', title);
        // once: true — слушатель отработает один раз на текущую загрузку
        // и не будет висеть на последующих (about:blank при закрытии).
        frame.addEventListener('load', () => postDemoTheme(frame), { once: true });
        frame.src = src;
      }
      openByName('demo');
    }

    function closeModal(modal) {
      modal.classList.remove('is-open');
      if (activeModal === modal) activeModal = null;
      if (modal.id === 'modal-demo') {
        const f = $('#modal-demo-frame', modal);
        if (f) f.src = 'about:blank';
      }
      setTimeout(() => {
        modal.hidden = true;
        clearModalHash(modal);
        const anyOpen = $$('.modal.is-open').length > 0;
        if (!anyOpen) ScrollLock.unlock();
        if (lastFocused instanceof HTMLElement) lastFocused.focus();
      }, CONFIG.MODAL_CLOSE_ANIM_MS);
    }

    /* Снять якорь, если он указывает именно на эту модалку.
       Нужно потому, что показ окна по якорю (#modal-…) — это CSS-правило
       .modal:target, и оно сильнее атрибута hidden. Без снятия якоря
       закрытая скриптом модалка осталась бы на экране.
       replaceState, а не location.hash: не добавляем запись в историю и
       не провоцируем прокрутку страницы к началу. */
    function clearModalHash(modal) {
      if (window.location.hash !== `#${modal.id}`) return;
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch {
        /* Часть движков запрещает replaceState на file:// — тогда снимаем
           якорь переходом на пустой фрагмент. */
        window.location.hash = '';
      }
    }

    /* Модалка, открытая якорем, показывается браузером сама — это работает
       и без скрипта. Если скрипт жив, доводим состояние до полноценного:
       блокировка скролла, перенос фокуса, подгрузка документа. Слушаем и
       hashchange: ссылку с якорем можно открыть из адресной строки или
       вернуться на неё кнопкой «назад». */
    function syncFromHash() {
      const id = window.location.hash.slice(1);
      if (!id.startsWith('modal-')) return;
      const modal = modalMap.get(id);
      if (!modal || modal.classList.contains('is-open')) return;
      openByName(id.slice('modal-'.length));
    }

    /* Аварийный путь: если модалка по любой причине не открылась
       (JS упал, DOM модалки отсутствует, разметку поменяли), открываем
       документ как обычную ссылку. Пробуем новую вкладку — так
       пользователь не теряет заполненную форму; если popup-блокер
       не пустил, переходим в текущей. */
    function openInNewTab(url) {
      if (!url) return;
      // window.open с 'noopener' по спецификации ВСЕГДА возвращает null,
      // поэтому по возвращаемому значению нельзя отличить «вкладка
      // открылась» от «попап заблокирован»: прежняя проверка if (!w)
      // дёргала location.href даже при успешном открытии и уводила
      // пользователя с заполненной формы. Открываем без noopener, чтобы
      // получить handle, и обрываем opener вручную для изоляции вкладки.
      let win = null;
      try {
        win = window.open(url, '_blank');
      } catch {
        win = null;
      }
      if (win) {
        try { win.opener = null; } catch { /* cross-origin — не критично */ }
        return;
      }
      window.location.href = url;
    }

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const demoTrigger = target.closest('[data-demo-open]');
      if (demoTrigger) {
        event.preventDefault();
        event.stopPropagation();
        try {
          openDemo(
            demoTrigger.getAttribute('data-demo-open'),
            demoTrigger.getAttribute('data-demo-title') || 'Демо-лендинг'
          );
        } catch (err) {
          console.error('[VM Labs] demo open error:', err);
          openInNewTab(demoTrigger.getAttribute('data-demo-open'));
        }
        return;
      }

      const trigger = target.closest('[data-modal-open]');
      if (!trigger) return;

      const name = trigger.getAttribute('data-modal-open');
      /* Если модалки нет в DOM — не перехватываем клик. Пусть браузер
         откроет href как обычную ссылку: это и есть graceful degradation,
         ради которого ссылки остаются настоящими <a href="…">. */
      if (!name || !modalMap.has(`modal-${name}`)) return;

      event.preventDefault();
      event.stopPropagation();
      try {
        openByName(name);
      } catch (err) {
        console.error('[VM Labs] modal open error:', err);
        openInNewTab(trigger.getAttribute('href'));
      }
    }, true);

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const closeTrigger = target.closest('[data-modal-close]');
      if (closeTrigger) {
        const modal = closeTrigger.closest('.modal');
        if (modal) closeModal(modal);
      }
    });

    /* Если пользователь включает/выключает версию для слабовидящих,
       когда демо-модалка уже открыта, содержимое iframe тоже должно
       переключиться. IframeSync.broadcast() обходит только превью-
       фреймы карточек (.showcase-card__demo с data-demo-frame), а
       #modal-demo-frame в этот список не входит — у него своя
       логика темы, не совпадающая с темой родителя. Поэтому
       подписываемся на изменение data-a11y отдельно и перепосылаем
       в модалку актуальный display-стейт. */
    const a11yObserver = new MutationObserver(() => {
      if (!activeModal || activeModal.id !== 'modal-demo') return;
      postDemoTheme($('#modal-demo-frame', activeModal));
    });
    a11yObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-a11y']
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const o = $('.modal.is-open');
        if (o) closeModal(o);
        return;
      }
      if (event.key !== 'Tab') return;
      if (!activeModal) return;
      const focusables = getFocusable(activeModal);
      if (!focusables.length) { event.preventDefault(); return; }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!activeModal.contains(active)) {
        event.preventDefault();
        first.focus();
        return;
      }
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    });

    /* Якорь в адресе на момент загрузки (#modal-…): окно уже показано
       CSS-правилом .modal:target, доводим состояние до скриптового. */
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
  }

  /* ============ SOUND TOGGLE ============ */
  function initSoundToggle() {
    const toggle = $('#sound-toggle');
    if (!toggle) return;
    function render() {
      const on = Sound.isEnabled();
      toggle.setAttribute('aria-pressed', String(on));
      toggle.dataset.muted = on ? 'false' : 'true';
    }
    toggle.addEventListener('click', () => {
      const wasOn = Sound.isEnabled();
      if (wasOn) Sound.click();
      Sound.setEnabled(!wasOn);
      render();
      if (!wasOn) Sound.click();
    });
    render();
  }

  function initYear() {
    const el = $('#year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  function shouldRunAmbientRain() {
    if (reducedMotion || A11y.isOn()) return false;
    if (window.innerWidth < CONFIG.AMBIENT_MIN_WIDTH) return false;
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && c.saveData) return false;
    if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency < CONFIG.AMBIENT_MIN_CORES) return false;
    if (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < CONFIG.AMBIENT_MIN_MEMORY_GB) return false;
    return true;
  }

  /* ============ BOOT ============ */
  function boot() {
    /* Синхронизируем ScrollLock с разметкой: <body class="is-locked">
       уже стоит с самого начала (защита от скролла во время
       прелоадера). Без этого первого вызова lock() позже не сработал
       бы: класс есть, а состояние locked = false, и первый же
       unlock() в прелоадере снял бы «чужую» блокировку, вернув
       скролл с позиции 0 — а это заметный скачок. */
    ScrollLock.syncFromClass();
    initHashScroll();

    try {
      Sound.init();
      Theme.init();
      A11y.init();
      Consent.init();
      Telemetry.init();
      IframeSync.init();
      initStaticLogos();
      initTicker();
      initReveal();
      initDuoProgress();
      initProcessScroll();
      initSpotlight();
      initHeader();
      initFaq();
      initFaqGroups();
      initForm();
      initModals();
      initSoundToggle();
      initFirstVisitHints();
      initYear();
      initGlobalClickSound();
      initCursorFx($('#fx-canvas'));
      initCoin();
    } catch (err) {
      console.error('[VM Labs] boot error:', err);
      const p = $('#preloader');
      if (p) p.remove();
      ScrollLock.unlock();
      const h = $('#hero');
      if (h) h.classList.add('is-live');
      return;
    }

    const rains = [];
    try {
      if (shouldRunAmbientRain()) {
        const c = $('#ambient-rain');
        if (c) {
          const r = new MatrixRain(c, {
            speed: CONFIG.RAIN_SPEED_AMBIENT,
            alpha: CONFIG.AMBIENT_ALPHA,
            fontSize: CONFIG.AMBIENT_FONT_SIZE,
            gap: CONFIG.AMBIENT_GAP,
            density: CONFIG.AMBIENT_DENSITY,
            minLen: CONFIG.AMBIENT_MIN_LEN,
            maxLen: CONFIG.AMBIENT_MAX_LEN,
            autoTheme: true
          });
          r.start();
          rains.push(r);
        }
      }
      const pc = $('#process-rain');
      const ps = $('#process');
      if (pc && ps) {
        const r = new MatrixRain(pc, {
          speed: CONFIG.RAIN_SPEED_PROCESS,
          alpha: CONFIG.PROCESS_ALPHA,
          autoTheme: true
        });
        rains.push(r);

        /*
          Дождь секции «Процесс» — fixed во вьюпорте, поэтому при
          скролле он не едет вместе с контентом. Чтобы анимация жила
          только на фоне этой секции (и не лезла на «Кто делает» или
          «Витрину работ»), обрезаем холст ровно по её видимым
          границам: clip-path в координатах вьюпорта. У самих границ
          добавляем мягкую кромку через mask-image, чтобы дождь не
          «разрезал» соседний блок. Пересчитываем на scroll/resize
          через rAF; если значения не изменились, стиль не трогаем.
        */
        let clipTop = -1;
        let clipBottom = -1;
        let clipVh = -1;
        let lastMask = '';
        let clipRaf = 0;

        function applyRainClip() {
          clipRaf = 0;
          const vh = pc.clientHeight || window.innerHeight;
          const box = ps.getBoundingClientRect();
          const top = Math.round(clamp(box.top, 0, vh));
          const bottom = Math.round(clamp(vh - box.bottom, 0, vh));

          /* Жёсткая обрезка по границам секции: дождь живёт только
             внутри «Процесса». */
          if (top !== clipTop || bottom !== clipBottom || vh !== clipVh) {
            clipTop = top;
            clipBottom = bottom;
            clipVh = vh;
            pc.style.clipPath = `inset(${top}px 0 ${bottom}px 0)`;
          }

          /*
            Мягкая кромка: у видимой границы секции глифы плавно
            растворяются, а не начинаются/обрываются линией. Считаем
            по реальным (не обрезанным) границам секции — когда граница
            уезжает за вьюпорт, маска снимается без скачка яркости.
            Пока секция занимает весь экран, mask = none: лишних
            перерисовок градиента нет.
          */
          const edgeTop = Math.round(box.top);
          const edgeBottom = Math.round(box.bottom);
          const visible = clamp(Math.min(vh, edgeBottom) - Math.max(0, edgeTop), 0, vh);
          const fade = Math.min(CONFIG.PROCESS_RAIN_FADE, vh * 0.2, visible / 2);
          let mask = 'none';
          if (fade > 0) {
            const topFadeVisible = edgeTop + fade > 0 && edgeTop < vh;
            const bottomFadeVisible = edgeBottom - fade < vh && edgeBottom > 0;
            if (topFadeVisible || bottomFadeVisible) {
              mask = 'linear-gradient(to bottom, '
                + `transparent ${edgeTop}px, `
                + `#000 ${Math.round(edgeTop + fade)}px, `
                + `#000 ${Math.round(edgeBottom - fade)}px, `
                + `transparent ${edgeBottom}px)`;
            }
          }
          if (mask !== lastMask) {
            lastMask = mask;
            pc.style.maskImage = mask;
            pc.style.webkitMaskImage = mask;
          }
        }

        function scheduleRainClip() {
          if (clipRaf) return;
          clipRaf = requestAnimationFrame(applyRainClip);
        }

        applyRainClip();
        window.addEventListener('scroll', scheduleRainClip, { passive: true });
        window.addEventListener('resize', scheduleRainClip, { passive: true });
        window.addEventListener('load', scheduleRainClip);

        if ('IntersectionObserver' in window) {
          const io = new IntersectionObserver((entries) => {
            entries.forEach((e) => r.setActive(e.isIntersecting));
            scheduleRainClip();
          }, { threshold: 0.05 });
          io.observe(ps);
        } else r.start();
      }
      const prc = $('#preloader-rain');
      let preRain = null;
      if (prc) {
        preRain = new MatrixRain(prc, {
          speed: CONFIG.RAIN_SPEED_PRELOAD,
          alpha: 1,
          fontSize: CONFIG.PRELOAD_RAIN_FONT_SIZE,
          gap: CONFIG.PRELOAD_RAIN_GAP,
          minLen: CONFIG.PRELOAD_RAIN_MIN_LEN,
          maxLen: CONFIG.PRELOAD_RAIN_MAX_LEN
        });
        rains.push(preRain);
      }
      initPreloader(preRain);
    } catch (err) {
      console.error('[VM Labs] decorations error:', err);
      const p = $('#preloader');
      if (p) p.remove();
      ScrollLock.unlock();
      const h = $('#hero');
      if (h) h.classList.add('is-live');
    }

    (function loop() {
      if (!A11y.isOn()) {
        for (const r of rains) {
          try { r.update(); } catch { /* один сломанный дождь не рушит остальные */ }
        }
      }
      requestAnimationFrame(loop);
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else boot();
})();
