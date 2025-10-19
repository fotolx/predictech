/**
 * RiskSettingsLoader
 * Авто-заполнение формы /risks/ значениями с https://predictech.5d4.ru/risks
 */
class RiskSettingsLoader {
  constructor(opts = {}) {
    this.url = opts.url || 'https://predictech.5d4.ru/risks';
    this.formSelector = opts.formSelector || 'form.risk-settings.form-update';
    this.requiredNames = ['xvs','gvs','cold_water_supply','reverse_flow','t1','t2','sensivity'];
    this.maxWaitMs = opts.maxWaitMs || 20000; // сколько ждать появления формы (ms)
    this.pollInterval = opts.pollInterval || 400; // интервал опроса (ms)
    this.proxies = [
      'https://cors-anywhere.herokuapp.com/',
      'https://api.codetabs.com/v1/proxy?quest=',
      'https://corsproxy.io/?',
      'https://cors.bridged.cc/'
    ];
    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.start());
    } else {
      // уже загружено
      this.start();
    }
  }

  async start() {
    try {
      const form = await this.waitForForm();
      if (!form) {
        console.warn('RiskSettingsLoader: форма не появилась в DOM в отведённое время');
        return;
      }
      const raw = await this.loadDataWithFallback();
      const parsed = this.processServerData(raw);
      const chosen = this.pickBestRecord(parsed);
      console.log('RiskSettingsLoader: Полученные данные (полный объект):', parsed);
      console.log('RiskSettingsLoader: Выбран для заполнения:', chosen);

      this.fillForm(form, chosen);
      console.info('RiskSettingsLoader: Заполнение формы завершено.');
    } catch (err) {
      console.error('RiskSettingsLoader: Ошибка:', err);
    }
  }

  waitForForm() {
    // Возвращает Promise, который разрешается, когда форма появляется в DOM или истекает таймаут
    return new Promise((resolve) => {
      const start = Date.now();

      const check = () => {
        const el = document.querySelector(this.formSelector);
        if (el) return resolve(el);
        if (Date.now() - start > this.maxWaitMs) return resolve(null);
        setTimeout(check, this.pollInterval);
      };
      check();

      // Дополнительно, на всякий случай наблюдаем за вставкой элементов (если желательно — можно убрать)
      const mo = new MutationObserver(() => {
        const el = document.querySelector(this.formSelector);
        if (el) {
          mo.disconnect();
          resolve(el);
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  async loadDataWithFallback() {
    // Пытаемся fetch напрямую, если не работает — пробуем прокси по очереди
    try {
      const res = await fetch(this.url, { method: 'GET', cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Попробуем json() сначала
      try {
        const json = await res.json();
        return json;
      } catch (e) {
        // если не JSON (или мутный), вернём текст для парсинга
        const txt = await res.text();
        return txt;
      }
    } catch (err) {
      console.warn('RiskSettingsLoader: Прямая загрузка не сработала:', err.message);
      // пробуем прокси по очереди
      for (const proxy of this.proxies) {
        try {
          const proxyUrl = proxy + this.url;
          console.info('RiskSettingsLoader: попытка через proxy:', proxy);
          const res = await fetch(proxyUrl, { method: 'GET' });
          if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);
          try {
            const json = await res.json();
            return json;
          } catch (e) {
            const txt = await res.text();
            return txt;
          }
        } catch (errProxy) {
          console.warn(`RiskSettingsLoader: Proxy ${proxy} не сработал:`, errProxy.message);
          // дальше пробуем следующий прокси
          await this.sleep(400); // небольшая пауза, чтобы не "флудить"
        }
      }
      throw new Error('RiskSettingsLoader: Не удалось загрузить данные (все варианты провалились)');
    }
  }

  processServerData(raw) {
    // Если raw уже объект/массив — возвращаем как есть
    if (raw === null || raw === undefined) throw new Error('Пустой ответ сервера');
    if (typeof raw === 'object') return raw;

    // raw = строка -> попробуем распарсить в JSON разными способами
    let text = String(raw).trim();

    // Если на странице прилетел JSONP или есть лишние символы — извлечём JSON-подстроку
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      text = jsonMatch[0];
    }

    // Пробуем стандартный JSON.parse
    try {
      return JSON.parse(text);
    } catch (e1) {
      // Альтернативный подход: заменить одиночные кавычки на двойные и попытаться
      try {
        const t2 = text.replace(/'/g, '"').replace(/(\w+)\s*:/g, '"$1":');
        return JSON.parse(t2);
      } catch (e2) {
        // Наконец: если ничего не помогло — бросаем понятную ошибку
        throw new Error('Не удалось распарсить текст ответа сервера как JSON');
      }
    }
  }

  pickBestRecord(parsed) {
    // сервер может вернуть массив или объект. Нам нужен объект с ключами, соответствующими полям.
    const keys = this.requiredNames;
    if (Array.isArray(parsed)) {
      // Найдём первый элемент массива, который содержит хотя бы одно требуемое поле
      for (const item of parsed) {
        if (item && typeof item === 'object') {
          for (const k of keys) {
            if (Object.prototype.hasOwnProperty.call(item, k)) return item;
          }
        }
      }
      // иначе вернём первый объект массива
      return parsed[0];
    } else if (parsed && typeof parsed === 'object') {
      // Иногда данные вложены (например { data: {...} } или { results: [...] })
      if (parsed.data && typeof parsed.data === 'object') return parsed.data;
      if (parsed.results && Array.isArray(parsed.results) && parsed.results.length) {
        return parsed.results[0];
      }
      // если объект сам содержит поля - возвращаем его
      return parsed;
    } else {
      throw new Error('Формат ответа непонятен');
    }
  }

  fillForm(form, dataObj) {
    if (!form || !dataObj) return;
    const listForConsole = [];

    this.requiredNames.forEach((name) => {
      const input = form.querySelector(`[name="${name}"]`);
      // иногда имя в dataObj может быть с другим регистром или с подчеркиваниями/без
      const value = this.findValueByName(dataObj, name);

      if (input) {
        try {
          // если это <input type="range"> или number - присваиваем value
          input.value = (value !== undefined && value !== null) ? String(value) : input.value;
          // Обновим aria-атрибуты если есть
          if (input.hasAttribute('aria-valuenow')) {
            input.setAttribute('aria-valuenow', input.value);
          }
          // триггерим события input/change чтобы другие обработчики реагировали
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {
          console.warn(`RiskSettingsLoader: не удалось установить значение для ${name}`, e);
        }
      } else {
        // Поля может не быть (например имя sensivity вместо sensitivity) — просто игнорируем
      }

      listForConsole.push({ name, value: value === undefined ? null : value });
    });

    // Дополнительно — обновим видимый спан с id="sensitivity-value", если он есть
    const sensSpan = document.getElementById('sensitivity-value');
    const sensInput = form.querySelector('[name="sensivity"], #sensitivity, input[type="range"][name="sensivity"]');

    if (sensInput) {
      const v = sensInput.value || this.findValueByName(dataObj, 'sensivity') || sensInput.getAttribute('value') || sensInput.defaultValue;
      // форматируем до 1 знака после запятой (1.0) — в тексте используем запятую, если предпочитаете точку — замените
      const formatted = (Number.isFinite(+v)) ? (+v).toFixed(1).replace('.', ',') : String(v);
      if (sensSpan) sensSpan.textContent = formatted.replace(',', '.'); // оставим точку чтобы совпадало с исходным span вида "1" / "1.2"
      // обновим aria
      if (sensInput.hasAttribute('aria-valuenow')) sensInput.setAttribute('aria-valuenow', String(v));
      // триггерим input
      sensInput.dispatchEvent(new Event('input', { bubbles: true }));
      sensInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Выводим (короткий) список полученных данных в консоль, как просили
    console.log('RiskSettingsLoader: Список значений для формы:', listForConsole);
  }

  findValueByName(obj, name) {
    // Простая гибкая функция поиска значения по имени: ищет точное совпадение, либо вариант с другими регистрами, либо схожие ключи
    if (!obj || typeof obj !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(obj, name)) return obj[name];

    const lower = name.toLowerCase();
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === lower) return obj[k];
    }

    // также пробуем искать варианты без подчеркиваний/с дефисами
    const norm = (s) => String(s).replace(/[_-]/g, '').toLowerCase();
    for (const k of Object.keys(obj)) {
      if (norm(k) === norm(name)) return obj[k];
    }

    // если значение вложено, пробуем пройтись по первым уровням
    for (const k of Object.keys(obj)) {
      const val = obj[k];
      if (val && typeof val === 'object') {
        const found = this.findValueByName(val, name);
        if (found !== undefined) return found;
      }
    }

    return undefined;
  }

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
}

// Инициализация
// Если нужно настроить параметры — передайте объект: new RiskSettingsLoader({ url: '...', formSelector: '...' })
new RiskSettingsLoader();
