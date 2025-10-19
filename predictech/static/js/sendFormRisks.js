(function () {
    'use strict';

    const RISK_URL = 'https://predictech.5d4.ru/risks';
    const PROXIES = [
        'https://api.codetabs.com/v1/proxy?quest=',
        'https://corsproxy.io/?',
        'https://cors-anywhere.herokuapp.com/',
        'https://thingproxy.freeboard.io/fetch/'
    ];
    const POLL_INTERVAL = 700; // ms для опроса наличия формы если MutationObserver не срабатывает
    const FETCH_TIMEOUT = 8000; // ms

    console.log('RiskFormAutoFill: инициализация...');

    // --- Утилиты ---
    function safeJsonParse(text) {
        let cleaned = (text || '').trim();
        if (!cleaned) throw new Error('Пустой ответ');
        // Попробуем сразу JSON.parse
        try {
            return JSON.parse(cleaned);
        } catch (e) {
            // Пытаемся вытащить JSON-подстроку
            const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
            if (jsonMatch) {
                try { return JSON.parse(jsonMatch[0]); } catch (e2) {}
            }
            // Попробуем заменить одинарные кавычки на двойные и ключи без кавычек
            try {
                let attempt = cleaned.replace(/'/g, '"').replace(/(\w+)\s*:/g, '"$1":');
                return JSON.parse(attempt);
            } catch (e3) {
                // в крайнем случае — попытка eval (опасно, но делаем как последний шанс в контролируемом окружении)
                try {
                    // eslint-disable-next-line no-eval
                    const res = eval(`(${cleaned})`);
                    return res;
                } catch (e4) {
                    throw new Error('Не удалось распарсить ответ как JSON');
                }
            }
        }
    }

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
        ]);
    }

    async function tryFetch(url, options = {}) {
        const resp = await withTimeout(fetch(url, options), FETCH_TIMEOUT);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return await resp.text();
    }

    async function fetchWithFallback(url) {
        console.log('RiskFormAutoFill: пытаемся получить данные напрямую...');
        try {
            // основной запрос с режимом CORS (обычно нужно), но если сайт не разрешает — упадёт
            const text = await tryFetch(url, { method: 'GET', mode: 'cors' });
            console.log('RiskFormAutoFill: прямой fetch успешен');
            return text;
        } catch (err) {
            console.warn('RiskFormAutoFill: прямой fetch не сработал:', err.message);
        }

        // Перебираем прокси
        for (const proxy of PROXIES) {
            const proxUrl = proxy + url;
            try {
                console.log(`RiskFormAutoFill: пробуем прокси ${proxy}...`);
                const txt = await tryFetch(proxUrl, { method: 'GET' });
                console.log(`RiskFormAutoFill: прокси ${proxy} вернул ответ`);
                return txt;
            } catch (e) {
                console.warn(`RiskFormAutoFill: прокси ${proxy} не сработал:`, e.message);
                continue;
            }
        }

        throw new Error('Все варианты загрузки данных не сработали');
    }

    // Сеттер, который вызывает input/change события чтобы остальные слушатели увидели изменение
    function setValueAndEmit(el, value) {
        try {
            if (!el) return;
            // для полей number/range нужно присвоить строковое значение
            el.value = (value === null || value === undefined) ? '' : String(value);
            // aria обновления (для range)
            if (el.getAttribute && el.getAttribute('aria-valuenow') !== null) {
                el.setAttribute('aria-valuenow', el.value);
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {
            console.warn('RiskFormAutoFill: ошибка установки значения', e);
        }
    }

    function applyDataToForm(formEl, dataObj) {
        if (!formEl || !dataObj) {
            console.warn('RiskFormAutoFill: форма или данные отсутствуют');
            return;
        }
        console.log('RiskFormAutoFill: применяем данные к форме:', dataObj);

        const fieldNames = ['xvs', 'gvs', 'cold_water_supply', 'reverse_flow', 't1', 't2', 'sensivity'];
        fieldNames.forEach(name => {
            const input = formEl.querySelector(`[name="${name}"]`);
            if (input) {
                const val = dataObj[name] ?? dataObj[name.toLowerCase()] ?? dataObj[name.toUpperCase()] ?? '';
                setValueAndEmit(input, val);
                console.log(`RiskFormAutoFill: установлен ${name} = ${val}`);
            } else {
                // если не найдено по имени, попробуем найти по id или class (резерв)
                const fallback = formEl.querySelector(`#${name}, .${name}`);
                if (fallback) {
                    const val = dataObj[name] ?? '';
                    setValueAndEmit(fallback, val);
                    console.log(`RiskFormAutoFill: установлен (fallback) ${name} = ${val}`);
                } else {
                    console.log(`RiskFormAutoFill: поле ${name} не найдено в форме`);
                }
            }
        });

        // Особая обработка слайдера чувствительности: обновляем видимый span с id sensitivity-value
        const sensInput = formEl.querySelector('[name="sensivity"], #sensitivity');
        const sensSpan = formEl.querySelector('#sensitivity-value');
        if (sensInput && sensSpan) {
            const displayed = sensInput.value || sensInput.getAttribute('value') || '1';
            sensSpan.textContent = displayed;
            sensInput.setAttribute('aria-valuenow', String(displayed));
            // Обновим события на слайдере
            sensInput.dispatchEvent(new Event('input', { bubbles: true }));
            console.log(`RiskFormAutoFill: обновлен слайдер sensivity -> ${displayed}`);
        }
    }

    // Попытка привести полученные данные к объекту с нужными ключами
    function normalizeData(raw) {
        // raw может быть объектом, массивом, или иным
        if (!raw) return null;

        // Если массив — возможно нужный объект в первом элементе
        if (Array.isArray(raw)) {
            // ищем объект, который содержит хоть одно нужное поле
            const candidate = raw.find(item => item && typeof item === 'object' &&
                ( 'xvs' in item || 'gvs' in item || 'cold_water_supply' in item || 'sensivity' in item ));
            if (candidate) return candidate;
            return raw[0] && typeof raw[0] === 'object' ? raw[0] : null;
        }

        if (typeof raw === 'object') {
            // если данные вложены
            if (raw.data && typeof raw.data === 'object') return raw.data;
            if (raw.results && typeof raw.results === 'object') return raw.results;
            return raw;
        }

        // если строка — уже обработано до этого, но на всякий случай
        return null;
    }

    // --- Основной рабочий цикл: загрузить данные и применить ---
    async function loadAndApply(formEl) {
        console.log('RiskFormAutoFill: loadAndApply вызван для формы:', formEl);
        try {
            const text = await fetchWithFallback(RISK_URL);
            console.log('RiskFormAutoFill: получен ответ (первые 400 символов):', text.slice(0, 400));
            const parsed = safeJsonParse(text);
            const normalized = normalizeData(parsed);
            if (!normalized) {
                console.warn('RiskFormAutoFill: не удалось подготовить объект данных из ответа', parsed);
                return;
            }
            // Попробуем привести ключи к простому виду (lowercase)
            const dataObj = {};
            for (const k of Object.keys(normalized)) {
                dataObj[String(k).toLowerCase()] = normalized[k];
            }
            // Иногда поле может называться sensivity или sensitivity - поддержим оба
            if (!('sensivity' in dataObj) && ('sensitivity' in dataObj)) dataObj['sensivity'] = dataObj['sensitivity'];

            // Лог всех ключей для отладки
            console.log('RiskFormAutoFill: подготовленный объект данных (ключи):', Object.keys(dataObj));
            applyDataToForm(formEl, dataObj);
            console.log('RiskFormAutoFill: заполнение завершено.');
        } catch (err) {
            console.error('RiskFormAutoFill: ошибка loadAndApply:', err.message);
        }
    }

    // --- Нахождение формы и подписка на её появление ---
    function handleFoundForm(formEl) {
        if (!formEl) return;
        // Если уже засел на этой форме метка — не будем создавать лишние обработчики
        if (formEl.dataset.riskAutofillApplied === 'true') {
            // но всё равно попытаемся загрузить данные снова (на случай обновлений)
            console.log('RiskFormAutoFill: найдено уже обработанное выражение формы — повторяем загрузку данных.');
            loadAndApply(formEl);
            return;
        }
        formEl.dataset.riskAutofillApplied = 'true';
        console.log('RiskFormAutoFill: форма найдена, запускаем загрузку данных...');
        loadAndApply(formEl);

        // Если форма может переоткрываться и вы хотите, чтобы при каждом открытии заново применялись данные,
        // можно отслеживать события появления модального окна и вызывать loadAndApply снова.
        // Подключим MutationObserver к самой форме, чтобы реагировать на переполнения/перерисовки inputов.
        const mo = new MutationObserver((mutations) => {
            // При любых изменениях — пробуем применить данные ещё раз (например, когда inputs пересоздаются)
            for (const m of mutations) {
                if (m.type === 'childList' || m.type === 'attributes') {
                    console.log('RiskFormAutoFill: изменение внутри формы, повторно применяем данные');
                    loadAndApply(formEl);
                    break;
                }
            }
        });
        mo.observe(formEl, { childList: true, subtree: true, attributes: true });
    }

    function startWatching() {
        // Сначала попробуем немедленно найти форму
        let form = document.querySelector('form.risk-settings.form-update, form.risk-settings');
        if (form) {
            handleFoundForm(form);
        }

        // MutationObserver для появления формы в DOM (динамическая вставка)
        const bodyObserver = new MutationObserver((mutations, observer) => {
            const f = document.querySelector('form.risk-settings.form-update, form.risk-settings');
            if (f) {
                console.log('RiskFormAutoFill: форма появилась в DOM (через MutationObserver)');
                handleFoundForm(f);
                // не отключаем observer — на будущее оставим следить за новыми появлениями формы
            }
        });
        bodyObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });

        // Дополнительный polling (на случай, если MutationObserver не ловит)
        setInterval(() => {
            const f = document.querySelector('form.risk-settings.form-update, form.risk-settings');
            if (f && f.dataset.riskAutofillApplied !== 'true') {
                console.log('RiskFormAutoFill: форма найдена через poller');
                handleFoundForm(f);
            }
        }, POLL_INTERVAL);
    }

    // init: дождёмся DOMContentLoaded или выполнится сразу если уже готов
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            console.log('RiskFormAutoFill: DOMContentLoaded — старт наблюдения...');
            startWatching();
        });
    } else {
        console.log('RiskFormAutoFill: DOM уже готов — старт наблюдения...');
        startWatching();
    }

})();
