function setActiveMenuClass() {
    // Получаем текущий URL
    const currentUrl = window.location.href;
    
    // Получаем все ссылки в меню
    const menuLinks = document.querySelectorAll('.list-menu__link');
    
    // Перебираем все ссылки
    menuLinks.forEach(link => {
        // Получаем href ссылки и извлекаем имя файла
        const linkHref = link.getAttribute('href');
        const fileName = linkHref.split('/').pop(); // получаем последнюю часть пути (имя файла)
        
        // Проверяем, заканчивается ли текущий URL на имя файла
        if (currentUrl.endsWith(fileName)) {
            link.classList.add('list-menu__link--active');
        } else {
            link.classList.remove('list-menu__link--active');
        }
    });
}

// Запускаем функцию после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    // Добавляем небольшую задержку для надежности (100ms)
    setTimeout(setActiveMenuClass, 100);
});

// Также запускаем при изменении URL (если страница динамическая)
window.addEventListener('popstate', setActiveMenuClass);