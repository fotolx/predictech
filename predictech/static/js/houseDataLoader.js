class HouseDataLoader {
    constructor() {
        this.svgHighlighter = null;
        this.init();
    }

    init() {
        document.addEventListener('DOMContentLoaded', () => {
            this.loadHousesData();
        });
    }

    async loadHousesData() {
        const houseDataUrl = 'https://predictech.5d4.ru/house/';
        
        try {
            const data = await this.loadData(houseDataUrl);
            const housesData = this.processServerData(data);
            this.renderHouses(housesData);
            
            // Инициализируем подсветку SVG после рендеринга домов
            this.initializeSVGHighlighter();
        } catch (error) {
            console.error('HouseDataLoader: Ошибка загрузки данных:', error);
            // Пробуем альтернативные методы
            await this.tryAlternativeMethods();
        }
    }

    // Универсальная функция загрузки данных
    async loadData(url) {
        try {
            // Сначала пробуем простой fetch
            let response = await fetch(url, {
                method: 'GET',
                mode: 'no-cors'
            });
            
            const text = await response.text();
            return text;
            
        } catch (error) {
            console.log(`Прямая загрузка с ${url} не сработала:`, error.message);
            throw error;
        }
    }

    // Функция для обработки данных с сервера
    processServerData(text) {
        let cleanedText = text.trim();
        
        try {
            return JSON.parse(cleanedText);
        } catch (error1) {
            console.log('Прямой JSON парсинг не сработал:', error1.message);
            
            try {
                if (cleanedText.startsWith('[') && cleanedText.endsWith(']')) {
                    try {
                        return eval(`(${cleanedText})`);
                    } catch (evalError) {
                        cleanedText = cleanedText.replace(/'/g, '"');
                        cleanedText = cleanedText.replace(/(\w+):/g, '"$1":');
                        return JSON.parse(cleanedText);
                    }
                }
                
                const jsonMatch = cleanedText.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
                
                throw new Error('Не удалось распарсить данные');
                
            } catch (error2) {
                console.log('Альтернативные методы парсинга не сработали:', error2.message);
                throw new Error(`Не удалось обработать данные: ${error2.message}`);
            }
        }
    }

    // Альтернативные методы загрузки
    async tryAlternativeMethods() {
        const url = 'https://predictech.5d4.ru/house/';
        
        try {
            const data = await this.loadViaProxy(url);
            const housesData = this.processServerData(data);
            this.renderHouses(housesData);
            this.initializeSVGHighlighter();
        } catch (error) {
            console.log(`Не удалось загрузить данные с ${url}:`, error.message);
        }
    }

    // Модифицированная функция для работы с прокси
    async loadViaProxy(targetUrl) {
        const proxies = [
            'https://cors-anywhere.herokuapp.com/',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://corsproxy.io/?',
            'https://proxy.cors.sh/'
        ];
        
        for (const proxy of proxies) {
            try {
                const response = await fetch(proxy + targetUrl, {
                    headers: {
                        'Accept': 'application/json'
                    }
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const text = await response.text();
                return text;
                
            } catch (error) {
                console.log(`Proxy ${proxy} не сработал:`, error.message);
                continue;
            }
        }
        
        throw new Error('Все proxy не сработали');
    }

    renderHouses(housesData) {
        const housesContainer = document.querySelector('.wrapper-houses');
        if (!housesContainer) {
            console.error('HouseDataLoader: Контейнер для домов не найден');
            return;
        }

        housesContainer.innerHTML = '';
        
        // Нормализуем данные к массиву
        if (!Array.isArray(housesData)) {
            if (housesData && typeof housesData === 'object') {
                housesData = housesData.data || housesData.results || housesData.items || [housesData];
            } else {
                housesData = [housesData];
            }
        }

        const sortedHouses = housesData.sort((a, b) => a.pk - b.pk);

        sortedHouses.forEach((house, index) => {
            const houseElement = this.createHouseElement(house, index + 1);
            housesContainer.appendChild(houseElement);
        });
    }

    createHouseElement(houseData, houseNumber) {
        const houseItem = document.createElement('div');
        houseItem.className = 'wrapper-houses__item';
        houseItem.setAttribute('data-house', `svg-house-${houseNumber}`);

        const statusClass = this.getStatusClass(houseNumber);
        
        // Извлекаем площадь из описания (сохраняем оригинальную логику)
        let area = '0';
        if (houseData.fields && houseData.fields.description) {
            const areaMatch = houseData.fields.description.match(/(\d+)\s*кв/);
            area = areaMatch ? areaMatch[1] : '0';
        }

        const address = houseData.fields?.address || 'Адрес не указан';

        houseItem.innerHTML = `
            <a href="#" class="wrapper-houses__link">
                <div class="wrapper-houses__header ${statusClass}">
                    <div class="wrapper-houses__text">№${houseNumber} ${area}&nbsp;кв</div>
                </div>
                <div class="wrapper-houses__body">
                    <div class="wrapper-houses__title">${address}</div>
                </div>
            </a>
        `;

        return houseItem;
    }

    getStatusClass(houseNumber) {
        switch(houseNumber) {
            case 1:
            case 2:
                return 'status-houses--normal';
            case 3:
            case 5:
                return 'status-houses--warning';
            case 4:
                return 'status-houses--criticals';
            default:
                return 'status-houses--normal';
        }
    }

    initializeSVGHighlighter() {
        // Ждем следующего цикла событий чтобы DOM полностью обновился
        setTimeout(() => {
            if (window.svgMapHighlighter) {
                // Переинициализируем хайлайтер если он уже существует
                window.svgMapHighlighter.setup();
            } else {
                // Создаем новый экземпляр если его нет
                window.svgMapHighlighter = new SVGMapHighlighter();
            }
            
            // Дополнительная проверка через небольшой интервал
            setTimeout(() => {
                if (window.svgMapHighlighter && !window.svgMapHighlighter.isReady) {
                    console.log('HouseDataLoader: Принудительная переинициализация SVGHighlighter');
                    window.svgMapHighlighter.setup();
                }
            }, 500);
        }, 100);
    }
}

// Создаем экземпляр класса
new HouseDataLoader();