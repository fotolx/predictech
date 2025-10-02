FROM buildpack-deps:bookworm

ENV PATH /usr/local/bin:$PATH
ENV LANG C.UTF-8
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /usr/src/app

# Установка системных зависимостей
RUN apt-get update && \
    apt-get install -y python3 python3-pip && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Копируем только requirements.txt сначала
COPY requirements.txt .

# Устанавливаем зависимости (кешируется отдельно)
RUN pip install -r requirements.txt --break-system-packages

# Копируем код приложения после установки зависимостей
COPY ./predictech .