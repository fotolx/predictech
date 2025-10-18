// Risk settings handler — работает с динамически подгружаемой модалкой
(function () {
    'use strict';

    const ENDPOINT = 'https://predictech.5d4.ru/risks';
    const POLL_INTERVAL = 300; // ms — как часто проверять появление модалки
    const POLL_TIMEOUT = 10000; // ms — таймаут ожидания модалки
    const SETTINGS_OPEN_SELECTOR = '.settings__link';
    const MODAL_SELECTOR = '#modal-settings-risk';
    const FORM_SELECTOR = '.risk-settings.form-update';
    const SUBMIT_BTN_SELECTOR = '.risk-button.btn-prymary';
    const SENS_DISPLAY_SELECTOR = '#sensitivity-value';

    // Поля, которые ожидаем в ответе/отправке
    const FIELDS = ['xvs', 'gvs', 'cold_water_supply', 'reverse_flow', 't1', 't2', 'sensivity'];

    // --- УТИЛИТЫ ---
    function qs(selector, root = document) { return root.querySelector(selector); }
    function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

    function waitForElement(selector, timeout = POLL_TIMEOUT) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(selector);
            if (existing) return resolve(existing);

            const start = Date.now();
            const iv = setInterval(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearInterval(iv);
                    resolve(el);
                } else if (Date.now() - start > timeout) {
                    clearInterval(iv);
                    reject(new Error('waitForElement timeout: ' + selector));
                }
            }, POLL_INTERVAL);
        });
    }

    function showMessage(type, msg) {
        // Попытка использовать createModal из вашего кода (если есть),
        // иначе простой alert
        if (typeof createModal === 'function') {
            try { createModal(type === 'error' ? 'error' : 'success', msg); return; } catch (e) { /* fallthrough */ }
        }
        alert(msg);
    }

    function parseNumberSafe(val) {
        if (val === null || val === undefined || val === '') return null;
        const n = Number(String(val).replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }

    // Преобразовать ответ сервера (объект) в значения для полей формы
    function applyDataToForm(data, form) {
        if (!data || !form) return;
        FIELDS.forEach(name => {
            const input = form.querySelector(`[name="${name}"]`);
            if (!input) return;
            // если поле присутствует в data — используем; иначе оставляем placeholder/существующее значение
            if (data[name] !== undefined && data[name] !== null) {
                // sensivity — возможно пришло как float; округлим до 1 знака если нужно
                if (name === 'sensivity') {
                    const v = parseFloat(data[name]);
                    input.value = isNaN(v) ? input.value : (Math.round(v * 10) / 10);
                } else {
                    input.value = data[name];
                }
            }
        });

        // Обновим отображение ползунка
        const sens = form.querySelector('[name="sensivity"]');
        const sensDisplay = document.querySelector(SENS_DISPLAY_SELECTOR);
        if (sens && sensDisplay) sensDisplay.textContent = (sens.value ? String(sens.value) : sensDisplay.textContent);
    }

    // Сериализация формы в объект
    function readFormData(form) {
        const obj = {};
        FIELDS.forEach(name => {
            const input = form.querySelector(`[name="${name}"]`);
            if (!input) { obj[name] = null; return; }
            if (input.type === 'range' || input.type === 'number' || input.tagName.toLowerCase() === 'input') {
                // хранить число, если возможно
                const num = parseNumberSafe(input.value);
                obj[name] = num === null ? input.value : num;
            } else {
                obj[name] = input.value;
            }
        });
        return obj;
    }

    // --- GET / POST ---
    async function fetchSettingsFill(form, modal) {
        try {
            // GET запроса: добавим timestamp чтобы не кэшировалось
            const url = `${ENDPOINT}?_t=${Date.now()}`;
            const res = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                headers: { 'Accept': 'application/json' },
                cache: 'no-store'
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            // ожидаем, что сервер вернёт объект с ключами xvs,gvs,... sensivity
            applyDataToForm(data, form);
        } catch (err) {
            console.error('[RiskSettings] GET error:', err);
            showMessage('error', 'Не удалось загрузить настройки рисков: ' + (err.message || err));
        }
    }

    async function postSettings(form, submitBtn) {
        // блокировка UI
        submitBtn.disabled = true;
        const originalText = submitBtn.dataset.originalText || submitBtn.textContent;
        submitBtn.dataset.originalText = originalText;
        submitBtn.textContent = 'Отправка...';

        const payload = readFormData(form);

        try {
            const res = await fetch(ENDPOINT, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const text = await res.text();
            // Попытка парсить JSON, даже если сервер вернул мусор
            let data = null;
            try { data = JSON.parse(text); } catch (e) {
                // попробуем извлечь JSON внутри строки (как в примере вашего кода)
                const s = text;
                const start = s.indexOf('{');
                const end = s.lastIndexOf('}');
                if (start !== -1 && end !== -1 && end > start) {
                    try { data = JSON.parse(s.slice(start, end + 1)); } catch (e2) { data = null; }
                }
            }

            if (!res.ok) {
                const errMsg = (data && data.message) ? data.message : `Ошибка ${res.status}`;
                throw new Error(errMsg);
            }

            // Успешно
            const msg = (data && (data.message || data.detail)) ? (data.message || data.detail) : 'Настройки успешно обновлены';
            // если в ответе пришли новые значения — применим их
            if (data) applyDataToForm(data, form);
            showMessage('success', msg);
        } catch (err) {
            console.error('[RiskSettings] POST error:', err);
            showMessage('error', 'Ошибка при отправке настроек: ' + (err.message || err));
        } finally {
            // разблокировка
            submitBtn.disabled = false;
            submitBtn.textContent = submitBtn.dataset.originalText || originalText;
        }
    }

    // --- Обработчики UI ---
    function attachFormListeners(form, modal) {
        if (!form) return;

        // гарантируем что привязка происходит один раз
        if (form.dataset.riskInit === '1') return;
        form.dataset.riskInit = '1';

        // Обновление отображения ползунка
        const sens = form.querySelector('[name="sensivity"]');
        const sensDisplay = document.querySelector(SENS_DISPLAY_SELECTOR);
        if (sens && sensDisplay) {
            // Синхронизируем при движении и при изменении
            const updateDisplay = () => { sensDisplay.textContent = Number(sens.value).toFixed(1).replace('.', ',').replace(',', '.'); /* keep dot */ };
            sens.addEventListener('input', updateDisplay);
            sens.addEventListener('change', updateDisplay);
            // начальное значение
            updateDisplay();
        }

        // Кнопка отправки находится вне формы в разметке — ловим её отдельно
        const submitBtn = modal.querySelector(SUBMIT_BTN_SELECTOR) || document.querySelector(SUBMIT_BTN_SELECTOR);
        if (submitBtn) {
            submitBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                postSettings(form, submitBtn);
            });
        }

        // Поддержка отправки по Enter (если пользователь нажал enter внутри поля)
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = submitBtn || form.querySelector('[type="submit"]');
            if (btn) postSettings(form, btn);
        });
    }

    // --- Главная логика: при открытии модалки делаем GET и привязываем обработчики ---
    function init() {

        // Делегированный обработчик клика на кнопку открытия настроек.
        // Не предполагаем, что именно этот элемент откроет модалку — но пользователь написал, что он нажимает на .settings__link.
        document.addEventListener('click', (e) => {
            const openBtn = e.target.closest && e.target.closest(SETTINGS_OPEN_SELECTOR);
            if (!openBtn) return;
            // Пытаемся дождаться появление модалки и затем выполнить GET
            waitForElement(MODAL_SELECTOR, POLL_TIMEOUT)
                .then(modal => {
                    // Если модалка существует, но может не быть активной — подождём пока класс modal-confirm--active появится (до таймаута)
                    const isActive = () => modal.classList.contains('modal-confirm--active') || window.getComputedStyle(modal).display !== 'none';
                    if (isActive()) {
                        const form = modal.querySelector(FORM_SELECTOR);
                        if (form) {
                            attachFormListeners(form, modal);
                            fetchSettingsFill(form, modal);
                        }
                    } else {
                        // Ждём появления класса modal-confirm--active
                        const start = Date.now();
                        const iv = setInterval(() => {
                            if (modal.classList.contains('modal-confirm--active') || window.getComputedStyle(modal).display !== 'none') {
                                clearInterval(iv);
                                const form = modal.querySelector(FORM_SELECTOR);
                                if (form) {
                                    attachFormListeners(form, modal);
                                    fetchSettingsFill(form, modal);
                                }
                            } else if (Date.now() - start > POLL_TIMEOUT) {
                                clearInterval(iv);
                                // fallback — всё равно попробуем заполнить, может окно открывается без класса
                                const form = modal.querySelector(FORM_SELECTOR);
                                if (form) {
                                    attachFormListeners(form, modal);
                                    fetchSettingsFill(form, modal);
                                }
                            }
                        }, POLL_INTERVAL);
                    }
                })
                .catch(err => {
                    console.warn('[RiskSettings] Модалка не найдена после клика:', err);
                });
        }, { capture: true });

        // Вдобавок: если модалка создаётся/вставляется где-то ещё (не через кнопку), можно опционально 
        // наблюдать за DOM и автоматически инициализировать, когда модалка появится.
        const mo = new MutationObserver((mutations) => {
            const modal = document.querySelector(MODAL_SELECTOR);
            if (!modal) return;
            const form = modal.querySelector(FORM_SELECTOR);
            if (form && form.dataset.riskInit !== '1') {
                attachFormListeners(form, modal);
                // если модалка уже активна — сразу загрузим данные
                if (modal.classList.contains('modal-confirm--active') || window.getComputedStyle(modal).display !== 'none') {
                    fetchSettingsFill(form, modal);
                }
            }
        });
        mo.observe(document.body, { childList: true, subtree: true });

        // Опционально: клавиша ESC — закрытие модалки при нажатии на крестик может быть реализовано где-то ещё.
    }

    // Инициализируем
    init();

    // Экспорт для отладки
    window.RiskSettingsManager = {
        fetchSettingsFill,
        postSettings,
        readFormData,
        applyDataToForm
    };

})(); 
