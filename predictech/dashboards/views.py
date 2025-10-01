from django.shortcuts import render
from django.views import View
from django.views.generic import CreateView
from django.http import JsonResponse
from django.core.serializers import serialize
from django.http import HttpResponse
from django.utils.decorators import method_decorator  
from django.views.decorators.csrf import csrf_exempt 
from django.utils import timezone
from datetime import datetime,timedelta
from .models import *
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.model_selection import train_test_split
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
import pandas as pd
import numpy as np
from django.conf import settings
import time
import pickle
import os

def home(request):
    return render(request, 'index.html')

class JournalView(View):
    def get(self, request, *args, **kwargs):
        return render(request, 'journal.html')

class RiskDashboardView(View):
    def get(self, request, *args, **kwargs):
        return render(request, "risk-dashboard.html")

class SituationView(View):
    def get(self, request, *args, **kwargs):
        return render(request, "situation.html")
    
class HouseAlertsView(View):

    def get(self, request, *args, **kwargs):
        if request.GET.get("house_id") is None:
            qs = HouseAlerts.objects.all()
            data = serialize("json", qs)
            return HttpResponse(data, content_type="application/json", status=200)
        qs = HouseAlerts.objects.filter(house_id=request.GET.get("house_id")).order_by('-date_time')[0]
        data = serialize("json", [qs])
        return HttpResponse(data, content_type="application/json", status=200)

class AlertsView(View):

    def get(self, request, *args, **kwargs):
        if request.GET.get("alert_id") is None:
            qs = Alerts.objects.all()
            data = serialize("json", qs)
            return HttpResponse(data, content_type="application/json", status=200)
        qs = Alerts.objects.filter(id=request.GET.get("alert_id")).order_by('-date_time')[0]
        data = serialize("json", [qs])
        return HttpResponse(data, content_type="application/json", status=200)
    
@method_decorator(csrf_exempt, name='dispatch')
class DetectorDataCreateView(CreateView):
    model = DetectorData
    template_name = "flatpages/detector_data.html"
    context_object_name = "detector_data"
    fields = '__all__'

    def post(self, request, *args, **kwargs):
        if request.POST.get("detector_id") is None:
            return HttpResponse("Bad request", status=400)
        detector_id = request.POST.get("detector_id")
        timestamp = request.POST.get("timestamp") or timezone.now()
        value = request.POST.get("value")
        DetectorData.objects.create(detector_id_id=detector_id, timestamp=timestamp, value=value)
        return HttpResponse("Success", status=200)
    
class DetectorDataView(View):

    def get(self, request, *args, **kwargs):
        if request.GET.get("detector_id") is None:
            qs = DetectorData.objects.all()
            data = serialize("json", qs)
            return HttpResponse(data, content_type="application/json", status=200)
        now = timezone.now()
        if request.GET.get("range") is None:
            qs = DetectorData.objects.filter(detector_id=request.GET.get("detector_id")).order_by('-timestamp')
        elif request.GET.get("range") == "day":
            qs = DetectorData.objects.filter(detector_id=request.GET.get("detector_id"), timestamp__day=now.day).order_by('-timestamp')
        elif request.GET.get("range") == "week":
            qs = DetectorData.objects.filter(detector_id=request.GET.get("detector_id"), timestamp__date__gte=(now - timedelta(days=7)).date()).order_by('-timestamp')
        elif request.GET.get("range") == "month":
            qs = DetectorData.objects.filter(detector_id=request.GET.get("detector_id"), timestamp__date__gte=(now - timedelta(days=30)).date()).order_by('-timestamp')
        elif request.GET.get("range") == "last":
            qs = DetectorData.objects.filter(detector_id=request.GET.get("detector_id")).order_by('-timestamp').first()
            qs = [qs]
        data = serialize("json", qs)
        return HttpResponse(data, content_type="application/json", status=200)
    
class DetectorView(View):
    def get(self, request, *args, **kwargs):
        if request.GET.get("detector_id") is None:
            qs = Detector.objects.all()
            data = serialize("json", qs)
            return HttpResponse(data, content_type="application/json", status=200)
        qs = Detector.objects.get(id=request.GET.get("detector_id"))
        data = serialize("json", [qs])
        return HttpResponse(data, content_type="application/json", status=200)

@method_decorator(csrf_exempt, name='dispatch')
class StateLabelCreateView(CreateView):
    model = StateLabel
    template_name = "flatpages/state_label.html"
    context_object_name = "state_label"
    fields = '__all__'

    def post(self, request, *args, **kwargs):
        if request.POST.get("house_id") is None or request.POST.get("state") is None:
            return HttpResponse("Bad request", status=400)
        house_id = request.POST.get("house_id")
        timestamp = request.POST.get("timestamp") or timezone.now()
        state = request.POST.get("state")
        name = request.POST.get("name") or ""
        description = request.POST.get("description") or ""

        StateLabel.objects.create(house_id_id=house_id, timestamp=timestamp, state=state, name=name, description=description)
        return HttpResponse("Success", status=200)

class HouseView(View):
    def get(self, request, *args, **kwargs):
        if request.GET.get("house_id") is None:
            qs = House.objects.all()
            data = serialize("json", qs)
            return HttpResponse(data, content_type="application/json", status=200)
        qs = House.objects.get(id=request.GET.get("house_id"))
        data = serialize("json", [qs])
        return HttpResponse(data, content_type="application/json", status=200)

class RealDataRetrainer:
    def __init__(self, sequence_length=12):
        self.sequence_length = sequence_length
        self.model = None
        self.scaler = StandardScaler()
        self.label_encoder = LabelEncoder()
        self.feature_columns = None
        self.execution_time = 0
        self.test_loss = 0
        self.test_accuracy = 0

    def _round_flow_value(self, value):
        """Округление значений расходов до 2 знаков после запятой"""
        return round(value, 2) if pd.notnull(value) else value

    def _round_temp_value(self, value):
        """Округление температурных значений до целых чисел"""
        return round(value) if pd.notnull(value) else value

    def create_features(self, df):
        """Создание признаков из реальных данных с контролем точности"""
        features = df.copy()

        # Базовые признаки с контролем точности
        features['imbalance'] = (features['flow_xvs'] - features['flow_gvs']).apply(self._round_flow_value)
        features['imbalance_ratio'] = (1 - (features['flow_gvs'] / features['flow_xvs'])).apply(self._round_flow_value)
        features['temp_difference'] = (features['temp_supply'] - features['temp_return']).apply(self._round_temp_value)
        features['hour'] = features['timestamp'].dt.hour

        # Разностные признаки с контролем точности
        for col in ['flow_xvs', 'flow_gvs', 'imbalance']:
            for window in [1, 3, 12]:
                features[f'{col}_diff_{window}h'] = (features[col] - features[col].shift(window)).apply(self._round_flow_value)

        for col in ['temp_supply', 'temp_return']:
            for window in [1, 3, 12]:
                features[f'{col}_diff_{window}h'] = (features[col] - features[col].shift(window)).apply(self._round_temp_value)

        # Статистические признаки с контролем точности
        for col in ['flow_xvs', 'flow_gvs', 'imbalance']:
            for window in [3, 12]:
                features[f'{col}_mean_{window}h'] = features[col].rolling(window=window).mean().apply(self._round_flow_value)
                features[f'{col}_std_{window}h'] = features[col].rolling(window=window).std().apply(self._round_flow_value)

        # Заполнение пропусков
        features = features.bfill().ffill().dropna()

        print(f"Создано признаков: {len([col for col in features.columns if col not in ['timestamp', 'label']])}")
        return features

    def prepare_sequences(self, features_df):
        """Подготовка последовательностей для обучения"""
        numeric_columns = [col for col in features_df.columns
                          if col not in ['timestamp', 'label']
                          and features_df[col].dtype in ['float64', 'int64']]

        self.feature_columns = numeric_columns
        X = features_df[numeric_columns].values
        y = features_df['label'].values

        # Масштабирование
        X_scaled = self.scaler.fit_transform(X)

        # Создание последовательностей
        X_seq, y_seq = [], []
        step = 2
        for i in range(0, len(X_scaled) - self.sequence_length, step):
            X_seq.append(X_scaled[i:(i + self.sequence_length)])
            y_seq.append(y[i + self.sequence_length])

        return np.array(X_seq), np.array(y_seq)

    def build_model(self, n_features, n_classes):
        """Построение модели (аналогично оригиналу)"""
        model = Sequential([
            LSTM(32, return_sequences=True, input_shape=(self.sequence_length, n_features)),
            Dropout(0.3),
            LSTM(16, return_sequences=False),
            Dropout(0.3),
            Dense(16, activation='relu'),
            Dense(n_classes, activation='softmax')
        ])

        model.compile(
            optimizer='adam',
            loss='sparse_categorical_crossentropy',
            metrics=['accuracy']
        )

        return model

    def retrain_model(self, data, days_back=30, epochs=10):
        start_time = time.time()
        """Основной метод переобучения на реальных данных"""
        print("=== ПЕРЕОБУЧЕНИЕ МОДЕЛИ НА РЕАЛЬНЫХ ДАННЫХ ===")

        # 1. Загрузка данных
        print("1. Загрузка данных")
        data = data

        if len(data) < self.sequence_length:
            raise ValueError(f"Недостаточно данных для обучения. Нужно минимум {self.sequence_length} записей")

        # 2. Создание признаков
        print("2. Создание признаков...")
        features = self.create_features(data)

        # 3. Подготовка последовательностей
        print("3. Подготовка последовательностей...")
        X_seq, y_seq = self.prepare_sequences(features)
        y_encoded = self.label_encoder.fit_transform(y_seq)

        # Разделение на train/test
        X_train, X_test, y_train, y_test = train_test_split(
            X_seq, y_encoded, test_size=0.2, random_state=42, stratify=y_encoded
        )

        print(f"Обучающая выборка: {X_train.shape}")
        print(f"Тестовая выборка: {X_test.shape}")
        print(f"Распределение классов: {np.unique(y_seq, return_counts=True)}")

        # 4. Построение и обучение модели
        n_features = X_train.shape[2]
        n_classes = len(self.label_encoder.classes_)
        self.model = self.build_model(n_features, n_classes)

        early_stop = EarlyStopping(
            monitor='val_loss',
            patience=3,
            restore_best_weights=True
        )

        print("4. Обучение модели...")
        history = self.model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=64,
            validation_data=(X_test, y_test),
            callbacks=[early_stop],
            verbose=1
        )

        # 5. Оценка модели
        self.test_loss, self.test_accuracy = self.model.evaluate(X_test, y_test, verbose=0)
        print(f"Точность на тесте: {self.test_accuracy:.4f}")
        end_time = time.time()  
        self.execution_time = end_time - start_time
        return history, features

    def save_retrained_model(self, base_path="retrained_models"):
        """Сохранение переобученной модели с датой в названии"""
        # Формирование имени файла с датой
        current_date = datetime.now().strftime("%Y%m%d_%H%M")
        model_filename = f"anomaly_model_retrained_{current_date}.keras"

        # Создание файла с информацией
        info_content = f"""Информация о переобученной модели:
- Дата переобучения: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
- Количество признаков: {len(self.feature_columns)}
- Длина последовательности: {self.sequence_length}
- Классы: {list(self.label_encoder.classes_)}
- Точность на тесте: {self.test_accuracy:.4f}
- Тестовые потери: {self.test_loss:.4f}
- Время обучения: {self.execution_time:.2f}
"""
      
        # Создание папки если не существует
        os.makedirs(os.path.join(settings.MEDIA_ROOT, base_path), exist_ok=True)
        model_path = os.path.join(settings.MEDIA_ROOT, f"{base_path}/{model_filename}")
        self.model.save(model_path, overwrite=True)
        savedmodel = SavedModel.objects.create(
            timestamp=current_date,
            name=model_filename,
            description=info_content,
            file=model_path,
            accuracy=self.test_accuracy
        )
        house_obj = House.objects.get(id=self.house)
        ModelForHouse.objects.create(house_id=house_obj, model_id=savedmodel, 
                                         name=model_filename, description=info_content, 
                                         timestamp=current_date)
        print(f"\n✅ Модель успешно переобучена и сохранена!")
        return "Модель успешно переобучена и сохранена!"


def retrain_model(data, days_back=30, epochs=8, house_id=None):
    """Функция для запуска переобучения"""
    try:
        # Создание и запуск переобучения
        retrainer = RealDataRetrainer(sequence_length=12)
        history, features = retrainer.retrain_model(
            data=data,
            days_back=days_back, 
            epochs=epochs,
            house=house_id 
        )
        # Сохранение модели
        result = retrainer.save_retrained_model(house_id=house_id)
        return result

    except Exception as e:
        print(f"❌ Ошибка при переобучении: {e}")
        return f"Ошибка при переобучении: {e}"

def prepare_data(house, detectors_list, days_back=30):
    data = pd.DataFrame()
    now = timezone.now()
    days_back=30  # Данные за последние 30 дней
    for detector in detectors_list:
        detector_data = pd.DataFrame(DetectorData.objects.filter(detector_id=detector.detector_id, timestamp__date__gte=(now - timedelta(days=days_back)).date()).order_by('-timestamp').values('timestamp','value'))
        detector_data.rename(columns={"value":detector.name}, inplace=True)
        detector_data['timestamp'] = pd.to_datetime(detector_data['timestamp'])
        detector_data = detector_data.set_index('timestamp')
        data = pd.concat([data,detector_data],axis=1)
    labels = pd.DataFrame(StateLabel.objects.filter(house_id=house, timestamp__date__gte=(now - timedelta(days=days_back)).date()).order_by('-timestamp').values('timestamp','state'))
    labels.rename(columns={"state":'label'}, inplace=True)
    labels['timestamp'] = pd.to_datetime(labels['timestamp'])
    labels = labels.set_index('timestamp')
    data = pd.concat([data,labels],axis=1)
    data = data.reset_index()
    return data

def train_model(request): 
    if request.method == 'GET':
        if request.GET.get("house_id") is None:
            return HttpResponse("Bad request", status=400)
        house = request.GET.get("house_id")
        try:
            model = ModelForHouse.objects.get(house_id=house)
        except:
            model = None
        days_back=30
        detectors_list = DetectorsAtHouse.objects.filter(house_id=house)
        if not len(detectors_list):
            return HttpResponse("Bad request. No detectors", status=400)
        data = prepare_data(house, detectors_list, days_back=days_back)
        print(data)
        epochs=8
        result = retrain_model(data, days_back=days_back, epochs=epochs, house=house)
        return HttpResponse(f"{result}", status=200)
    
def predict(request):
    if request.method == 'GET':
        if request.GET.get("house_id") is None:
            return HttpResponse("Bad request", status=400)
        house = request.GET.get("house_id")
        try:
            saved_model = ModelForHouse.objects.get(house_id=house)
            model = tf.keras.models.load_model(saved_model.model_id.file.path)
            print(model)
        except Exception as e:
            return HttpResponse(f"Bad request. {e}", status=400)
        
        detectors_list = DetectorsAtHouse.objects.filter(house_id=house)
        if not len(detectors_list):
            return HttpResponse("Bad request. No detectors.", status=400)
        data = prepare_data(house, detectors_list)
        retrainer = RealDataRetrainer(sequence_length=12)
        features = retrainer.create_features(data)

        # print("\n🔍 Тестирование переобученной модели...")
        if len(features) > retrainer.sequence_length:
            demo_idx = len(features) - 1
            demo_data = features.iloc[demo_idx-retrainer.sequence_length:demo_idx][retrainer.feature_columns].values

        #     # Получаем предсказание
            prediction = model.model.predict(
                demo_data.reshape(1, retrainer.sequence_length, -1), verbose=0
            )

        #     # Обрабатываем предсказание
            predicted_class = np.argmax(prediction[0])
            predicted_label_name = retrainer.label_encoder.inverse_transform([predicted_class])[0]
            confidence = np.max(prediction[0])

            print(f"Пример предсказания: {predicted_label_name} (уверенность: {confidence:.2%})")
    
    return HttpResponse(f"Пример предсказания: {predicted_label_name} (уверенность: {confidence:.2%})", status=200)