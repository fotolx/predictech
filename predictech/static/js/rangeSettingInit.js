(function() {
  function initSensitivitySlider() {
    const input = document.getElementById('sensitivity');
    const display = document.getElementById('sensitivity-value');

    // Если элементы еще не загружены, ждем
    if (!input || !display) {
      setTimeout(initSensitivitySlider, 100);
      return;
    }

    const min = parseFloat(input.min);
    const max = parseFloat(input.max);

    // Форматируем число: ровно одна цифра после запятой, разделитель — запятая
    function formatWithComma(number) {
      return Number(number).toFixed(1).replace('.', ',');
    }

    // Обновляем видимое значение + aria + фон ползунка
    function update() {
      const val = parseFloat(input.value);

      display.textContent = formatWithComma(val);

      input.setAttribute('aria-valuenow', String(val));

      const percent = ((val - min) / (max - min)) * 100;

      input.style.background = 'linear-gradient(90deg, rgb(59 130 246 / 0.22) ' + percent + '%, #e5e7eb ' + percent + '%)';
    }

    input.addEventListener('input', update);
    input.addEventListener('change', update);

    update();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSensitivitySlider);
  } else {
    // DOM уже готов
    initSensitivitySlider();
  }

  setTimeout(initSensitivitySlider, 500);
})();