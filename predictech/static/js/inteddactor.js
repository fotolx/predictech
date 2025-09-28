document.addEventListener('DOMContentLoaded', function() {
    // Находим все элементы с классом inteddactor
    const inteddactors = document.querySelectorAll('.inteddactor');
    
    inteddactors.forEach(inteddactor => {
        // Получаем значение из data-value
        const value = parseInt(inteddactor.getAttribute('data-value'));
        
        // Находим элемент уровня внутри текущего индикатора
        const levelElement = inteddactor.querySelector('.inteddactor__level');
        
        if (levelElement) {
            // Устанавливаем ширину уровня в процентах
            levelElement.style.width = value + '%';
            
            // Устанавливаем цвет в зависимости от значения
            if (value < 60) {
                levelElement.style.backgroundColor = '#ef4444';
            } else {
                levelElement.style.backgroundColor = '#22c55e';
                levelElement.style.opacity = '0.57';
            }
        }
    });
});