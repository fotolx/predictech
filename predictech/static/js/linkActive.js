function setActiveMenuClass() {
    // Получаем текущий URL и путь
    const currentUrl = window.location.href;
    const currentPath = window.location.pathname;
    
    const menuLinks = document.querySelectorAll('.list-menu__link');
    
    // Перебираем все ссылки
    menuLinks.forEach(link => {
        // Получаем href ссылки
        const linkHref = link.getAttribute('href');
        
        link.classList.remove('list-menu__link--active');
        
        // Для главной страницы (href="/")
        if (linkHref === '/' && (currentPath === '/' || currentPath === '')) {
            link.classList.add('list-menu__link--active');
            return;
        }
        
        if (linkHref !== '/' && currentPath.startsWith(linkHref)) {
            link.classList.add('list-menu__link--active');
        }
    });
}

// Запускаем функцию после загрузки DOM
document.addEventListener('DOMContentLoaded', function() {
    // Добавляем небольшую задержку для надежности (100ms)
    setTimeout(setActiveMenuClass, 100);
});

window.addEventListener('popstate', setActiveMenuClass);
