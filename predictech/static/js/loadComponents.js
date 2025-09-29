document.addEventListener("DOMContentLoaded", function () {
    function loadHTMLFile(url, elementId) {
        return fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Ошибка загрузки ${url}`);
                }
                return response.text();
            })
            .then(data => {
                const element = document.getElementById(elementId);
                if (element) {
                    element.innerHTML = data;
                } else {
                    console.warn(`Элемент с ID "${elementId}" не найден`);
                }
                return data;
            })
            .catch(error => {
                console.error(`Ошибка при вставке ${url}:`, error);
                throw error;
            });
    }

    // Массив файлов для загрузки с соответствующими ID
    const filesToLoad = [
        { url: "/static/public/components/header.html", id: "header-container" },
        { url: "/static/public/components/header-navigation.html", id: "header-navigation" },
        { url: "/static/public/components/actions.html", id: "actions" },
        { url: "/static/public/components/indicator.html", id: "state-indicator" },
        { url: "/static/public/components/side-panel.html", id: "side-panel" },
        { url: "/static/public/components/modal-confirm.html", id: "modal-confirm" },
        { url: "/static/public/components/modal-risk.html", id: "modal-risk" },
        { url: "/static/public/components/modal-card-event.html", id: "modal-card-event" },
        { url: "/static/public/components/svg-map.html", id: "svg-container" },
        { url: "/static/public/components/main-svg-map.html", id: "main-svg-container" },
        { url: "/static/public/components/modal-card-event-2.html", id: "modal-card-event-2" }
    ];

    // Создаем массив промисов для всех загрузок
    const loadPromises = filesToLoad.map(file => 
        loadHTMLFile(file.url, file.id)
    );

    // Загружаем все файлы параллельно
    Promise.all(loadPromises)
        .then(() => {})
        .catch(error => {
            console.error("Ошибка при загрузке компонентов:", error);
        });
});




