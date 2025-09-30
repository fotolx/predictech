document.addEventListener('DOMContentLoaded', function() {
    const inteddactors = document.querySelectorAll('.inteddactor');
    
    inteddactors.forEach(inteddactor => {
        const value = parseInt(inteddactor.getAttribute('data-value'));
        
        const levelElement = inteddactor.querySelector('.inteddactor__level');
        
        if (levelElement) {
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
