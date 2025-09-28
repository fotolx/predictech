// Функция для получения иконки погоды по описанию
function getWeatherIcon(description) {
    const iconMap = {
        // Ясная погода
        'ясно': '☀️',
        'чистое небо': '☀️',
        
        // Облачная погода
        'пасмурно': '☁️',
        'облачно с прояснениями': '⛅',
        'небольшая облачность': '🌤️',
        'переменная облачность': '⛅',
        'облачно': '☁️',
        
        // Дождь
        'дождь': '🌧️',
        'небольшой дождь': '🌦️',
        'легкий дождь': '🌦️',
        'умеренный дождь': '🌧️',
        'сильный дождь': '⛈️',
        'ливень': '⛈️',
        'гроза': '⛈️',
        'грозы': '⛈️',
        
        // Снег
        'снег': '❄️',
        'небольшой снег': '🌨️',
        'снегопад': '❄️',
        'легкий снег': '🌨️',
        
        // Туман
        'туман': '🌫️',
        'дымка': '🌫️',
        'мгла': '🌫️'
    };
    
    // Приводим описание к нижнему регистру для поиска
    const desc = description.toLowerCase();
    
    // Ищем точное совпадение или частичное
    for (const [key, icon] of Object.entries(iconMap)) {
        if (desc.includes(key)) {
            return icon;
        }
    }
    
    // Иконка по умолчанию
    return '🌈';
}

// Функция для получения погоды с микрозадержкой
function getWeatherWithDelay() {
    setTimeout(() => {
        const city = 'Москва';
        const apiKey = '23422f44d0a84bd05ebd4b7d0cdd0156';
        const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&lang=ru&units=metric&appid=${apiKey}`;

        fetch(weatherUrl)
            .then(function (resp) { 
                if (!resp.ok) {
                    throw new Error('Ошибка сети');
                }
                return resp.json() 
            })
            .then(function (data) {

                const weatherDescription = data.weather[0].description;
                const weatherIcon = getWeatherIcon(weatherDescription);

                // Заполняем разметку данными о погоде с иконкой
                document.getElementById('temperature').textContent = Math.round(data.main.temp) + '°С';
                
                // Обновляем элемент condition с иконкой и текстом
                const conditionElement = document.getElementById('condition');
                conditionElement.innerHTML = `<span class="weather-icon">${weatherIcon}</span> ${weatherDescription}`;
                
                document.getElementById('humidity').textContent = data.main.humidity + '%';

                // Для осадков используем данные из rain или snow
                let precipitation = '0 мм';
                if (data.rain && data.rain['1h']) {
                    precipitation = data.rain['1h'] + ' мм';
                } else if (data.snow && data.snow['1h']) {
                    precipitation = data.snow['1h'] + ' мм';
                }
                document.getElementById('precipitation').textContent = precipitation;

                document.getElementById('wind-speed').textContent = data.wind.speed + ' м/с';
            })
            .catch(function (error) {
                console.error('Ошибка получения погоды:', error);
                
                const conditionElement = document.getElementById('condition');
                conditionElement.innerHTML = '<span class="weather-icon">❓</span> Нет данных';
                
                // Устанавливаем значения по умолчанию в случае ошибки
                document.getElementById('temperature').textContent = '--°С';
                document.getElementById('humidity').textContent = '--%';
                document.getElementById('precipitation').textContent = '-- мм';
                document.getElementById('wind-speed').textContent = '-- м/с';
            });
    }, 100); // Задержка 100ms для гарантии загрузки DOM
}

// Запускаем когда DOM загружен
document.addEventListener('DOMContentLoaded', getWeatherWithDelay);

// Альтернативный вариант если DOM уже загружен
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', getWeatherWithDelay);
} else {
    getWeatherWithDelay();
}