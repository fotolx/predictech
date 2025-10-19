from django.shortcuts import redirect, render
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
import joblib
import json

def home(request):
    flow_xvs = 0
    flow_gvs = 0
    temp_supply = 0
    temp_return = 0
    temp_counter = 0
    all_detectors = DetectorsAtHouse.objects.all()
    for detector in all_detectors:
        detector_data = DetectorData.objects.filter(detector_id=detector.detector_id.id).last()
        if detector.name == "flow_xvs":
            flow_xvs = flow_xvs + detector_data.value
        if detector.name == "flow_gvs":
            flow_gvs = flow_gvs + detector_data.value
        if detector.name == "temp_supply":
            temp_supply = temp_supply + detector_data.value
        if detector.name == "temp_return":
            temp_return = temp_return + detector_data.value
            temp_counter = temp_counter + 1
    
    return render(request, 'index.html', {'flow_xvs': round(flow_xvs*100), 'flow_gvs': round(flow_gvs*100), 'percent': round(flow_gvs/flow_xvs*100), 'temp': temp_supply/temp_counter})

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
    
class DetectorsAtHouseView(View):
    def get(self, request, *args, **kwargs):
        if request.GET.get("house_id") is None:
            qs = DetectorsAtHouse.objects.all()
            data = serialize("json", qs)
            return HttpResponse(data, content_type="application/json", status=200)
        qs = DetectorsAtHouse.objects.filter(house_id=request.GET.get("house_id"))
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
    def __init__(self, sequence_length=12, temperature=1.0):
        self.sequence_length = sequence_length
        self.temperature = temperature
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

    def load_trained_model(self, model_path, metadata_path):
        """Загружает обученную модель и метаданные"""
        # Загружаем модель
        self.model = tf.keras.models.load_model(model_path)

        # Загружаем метаданные
        with open(metadata_path, 'rb') as f:
            metadata = pickle.load(f)

        # Восстанавливаем все необходимые атрибуты
        self.scaler = metadata['scaler']
        self.label_encoder = metadata['label_encoder']
        self.feature_columns = metadata['feature_columns']
        self.sequence_length = metadata['sequence_length']

        print(f"Модель загружена из: {model_path}")

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
        features = features.replace('nan', np.nan).dropna()

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
    
    def predict_with_temperature(self, X_data, temperature=None):
        """Предсказание с регулируемой температурой"""
        if temperature is None:
            temperature = self.temperature

        # Получаем оригинальные вероятности
        original_proba = self.model.predict(X_data, verbose=0)

        if temperature == 1.0:
            return np.argmax(original_proba, axis=1), original_proba

        # Применяем температурное масштабирование
        adjusted_proba = original_proba ** (1/temperature)
        adjusted_proba = adjusted_proba / adjusted_proba.sum(axis=1, keepdims=True)

        return np.argmax(adjusted_proba, axis=1), adjusted_proba
    
    def retrain_model(self, data, days_back=30, epochs=10):
        start_time = time.time()
        """Основной метод переобучения на реальных данных"""
        print("=== ПЕРЕОБУЧЕНИЕ МОДЕЛИ НА РЕАЛЬНЫХ ДАННЫХ ===")
        print(f"Температурный параметр: {self.temperature}")

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

    def save_retrained_model(self, base_path="retrained_models", house_id=None):
        """Сохранение переобученной модели с датой в названии"""
        # Формирование имени файла с датой
        current_date = datetime.now().strftime("%Y%m%d_%H%M")
        model_filename = f"anomaly_model_retrained_{current_date}.keras"
        metadata_filename = f"model_metadata_retrained_{current_date}.pkl"

        # Создание файла с информацией
        info_content = f"""Информация о переобученной модели:
- Дата переобучения: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
- Количество признаков: {len(self.feature_columns)}
- Длина последовательности: {self.sequence_length}
- Температурный параметр: {self.temperature}
- Классы: {list(self.label_encoder.classes_)}
- Точность на тесте: {self.test_accuracy:.4f}
- Тестовые потери: {self.test_loss:.4f}
- Время обучения: {self.execution_time:.2f}
"""
      
        # Создание папки если не существует
        os.makedirs(os.path.join(settings.MEDIA_ROOT, base_path), exist_ok=True)
        # Сохранение модели
        model_path = os.path.join(settings.MEDIA_ROOT, f"{base_path}/{model_filename}")
        self.model.save(model_path, overwrite=True)
        # Сохранение метаданных
        metadata_path = os.path.join(settings.MEDIA_ROOT, f"{base_path}/{metadata_filename}")
        metadata = {
            'scaler': self.scaler,
            'label_encoder': self.label_encoder,
            'feature_columns': self.feature_columns,
            'sequence_length': self.sequence_length,
            'temperature': self.temperature,
            'retrain_date': current_date
        }
        with open(metadata_path, 'wb') as f:
            pickle.dump(metadata, f)
        # Сохранение информации о модели
        savedmodel = SavedModel.objects.create(
            timestamp=current_date,
            name=model_filename,
            description=info_content,
            model_file=model_path,
            metadata_file=metadata_path,
            accuracy=self.test_accuracy
        )
        house_obj = House.objects.get(id=house_id)
        ModelForHouse.objects.create(house_id=house_obj, model_id=savedmodel, 
                                         name=model_filename, description=info_content, 
                                         timestamp=current_date)
        print(f"\n✅ Модель успешно переобучена и сохранена!")
        result = {
            "status": "Success",
            "message": "Модель успешно переобучена и сохранена!",
            "sequence_length": self.sequence_length,
            "temperature": self.temperature,
            "retrain_date": current_date,
            "test_accuracy": self.test_accuracy,
            "test_loss": self.test_loss,
            "execution_time": self.execution_time
        }
        return json.dumps(result)

    # РЕГУЛИРОВКА ЧУВСТВИТЕЛЬНОСТИ МОДЕЛИ
    # Измените значение temperature для регулировки чувствительности:
    # - temperature < 1.0: более чувствительная модель (чаще предсказывает аномалии)
    # - temperature > 1.0: менее чувствительная модель (реже предсказывает аномалии)
    # - temperature = 1.0: оригинальная модель (без изменений) 
def retrain_model(data, days_back=30, epochs=8, house_id=None, temperature=1.0):
    """Функция для запуска переобучения"""
    try:
        # Создание и запуск переобучения
        retrainer = RealDataRetrainer(sequence_length=12, temperature=temperature)
        history, features = retrainer.retrain_model(
            data=data,
            days_back=days_back, 
            epochs=epochs,
        )
        # Сохранение модели
        result = retrainer.save_retrained_model(house_id=house_id)
        return result

    except Exception as e:
        print(f"❌ Ошибка при переобучении: {e}")
        return json.dumps({"status": "Error", "message": str(e)})

def prepare_data(house, detectors_list, days_back=30):
    data = pd.DataFrame()
    now = timezone.now()
    # days_back=30  # Данные за последние 30 дней
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
            return HttpResponse(json.dumps({"status": "Error", "message": "Bad request. No detectors"}), status=400)
        data = prepare_data(house, detectors_list, days_back=days_back)
        print(data)
        epochs=8
        result = retrain_model(data, days_back=days_back, epochs=epochs, house_id=house)
        return HttpResponse(f"{result}", status=200)

class DetectorsAtHouseDataView(View):
    def get(self, request, *args, **kwargs):
        if request.GET.get("house_id") is None:
            return HttpResponse("Bad request", status=400)
        house = request.GET.get("house_id")
        days_back=30
        last = False
        detectors_list = DetectorsAtHouse.objects.filter(house_id=house)
        if not len(detectors_list):
            return HttpResponse(json.dumps({"status": "Error", "message": "Bad request. No detectors"}), status=400)
        if request.GET.get("range") is None:
            days_back=30
        elif request.GET.get("range") == "day":
            days_back=1
        elif request.GET.get("range") == "week":
            days_back=7
        elif request.GET.get("range") == "month":
            days_back=30
        elif request.GET.get("range") == "last":
            last = True
            days_back=1
            data = prepare_data(house, detectors_list, days_back=1)
        data = prepare_data(house, detectors_list, days_back=days_back)
        if last:
            data = data.sort_values('timestamp').iloc[-1]
        if request.GET.get("count") == "True":
            df_info = ((data['label'] == 'nan').sum())
            features = data.replace('nan', np.nan)
            with_nan = features[features['label'].notnan()]
            return HttpResponse(f"nan values count: {df_info}\n\nOverall lines: {data.count()}\n\nDropped nan lines count: {features.dropna().count()}\n\nNan lines count: {with_nan.count()}", content_type="text/plain", status=200)
        data = data.to_json(orient='records')
        return HttpResponse(data, content_type="application/json", status=200)
        
def predict(request):
    if request.method == 'GET':
        if request.GET.get("house_id") is None:
            return HttpResponse("Bad request", status=400)
        house = request.GET.get("house_id")
        try:
            saved_model = ModelForHouse.objects.get(house_id=house)
            model_file_path = saved_model.model_id.model_file.path
            metadata_file_path = saved_model.model_id.metadata_file.path
        except Exception as e:
            return HttpResponse(f"Bad request. {e}", status=400)

        detectors_list = DetectorsAtHouse.objects.filter(house_id=house)
        if not len(detectors_list):
            return HttpResponse("Bad request. No detectors.", status=400)
        data = prepare_data(house, detectors_list)
        predictor = RealDataRetrainer(sequence_length=12)
        predictor.load_trained_model(model_file_path, metadata_file_path)
        features = predictor.create_features(data)
        # Получаем предсказание
        if len(features) > predictor.sequence_length:
            demo_idx = len(features) - 1
            demo_data = features.iloc[demo_idx-predictor.sequence_length:demo_idx][predictor.feature_columns].values

            prediction = predictor.model.predict(
                demo_data.reshape(1, predictor.sequence_length, -1), verbose=0
            )
            # Обрабатываем предсказание
            predicted_class = np.argmax(prediction[0])
            predicted_label_name = predictor.label_encoder.inverse_transform([predicted_class])[0]
            confidence = np.max(prediction[0])
            print(str(data['timestamp'].min()))
            print(str(data['timestamp'].max()))
            print(str(data['timestamp'].max()+timedelta(hours=1)))
            print(f"🔮 Прогноз аномалии: {predicted_label_name}")
            print(f"🎯 Уверенность: {confidence:.2%}")
            house_obj = House.objects.get(id=house)
            try:
                label = StateLabel.objects.get(house_id=house_obj, timestamp=data['timestamp'].max()+timedelta(hours=1))
                label.state = predicted_label_name
                label.confidence = confidence
                label.confirmed = False
                label.save()
            except:
                StateLabel.objects.create(house_id=house_obj, timestamp=data['timestamp'].max()+timedelta(hours=1), state=predicted_label_name, confidence=confidence)
            return HttpResponse(f"Прогноз на {str(data['timestamp'].max()+timedelta(hours=1))}: {predicted_label_name} (уверенность: {confidence:.2%})", status=200)
        else:
            return HttpResponse(f"❌ Недостаточно данных для предсказания. Нужно {predictor.sequence_length}, есть {len(features)}", status=400)
        

def forecast(request):
    if request.method == 'GET':
        if request.GET.get("house_id") is None:
            return HttpResponse("Bad request", status=400)
        house = request.GET.get("house_id")

    # 1. Загрузка модели и метаданных
    base_path="forecast"
    model_filename =  os.path.join(settings.MEDIA_ROOT, f"{base_path}/{'fast_forecast_model.pkl'}")
    metadata_filename = os.path.join(settings.MEDIA_ROOT, f"{base_path}/{'forecast_metadata.pkl'}")

    # Загрузка модели и метаданных
    try:
        model = joblib.load(model_filename)
        metadata = joblib.load(metadata_filename)
        print("Модель и метаданные успешно загружены!")
        print(f"Количество признаков: {metadata['feature_count']}")
        print(f"Целевые переменные: {metadata['target_names']}")
    except Exception as e:
        print(f"Ошибка при загрузке модели: {e}")
        # Если не удалось загрузить, создадим демонстрационную модель
        print("Создание демонстрационной модели...")
        from sklearn.ensemble import RandomForestRegressor
        model = RandomForestRegressor()
        # Для демонстрации создадим фиктивные метаданные
        metadata = {
            'feature_names': ['flow_xvs', 'flow_gvs', 'temp_supply', 'temp_return', 'imbalance',
                            'imbalance_ratio', 'temp_difference', 'hour', 'day_of_week',
                            'flow_xvs_mean_3h', 'flow_gvs_mean_3h', 'imbalance_mean_3h',
                            'flow_xvs_diff_1h', 'flow_gvs_diff_1h', 'temp_supply_diff_1h',
                            'temp_return_diff_1h', 'flow_xvs_diff_3h', 'flow_gvs_diff_3h',
                            'temp_supply_diff_3h', 'temp_return_diff_3h'],
            'target_names': ['flow_xvs_168', 'flow_gvs_168', 'temp_supply_168', 'temp_return_168',
                            'flow_xvs_336', 'flow_gvs_336', 'temp_supply_336', 'temp_return_336',
                            'flow_xvs_504', 'flow_gvs_504', 'temp_supply_504', 'temp_return_504'],
            'forecast_horizons': [168, 336, 504]
        }

    # 2. Загрузка данных для прогноза
    print("\n=== ЗАГРУЗКА ДАННЫХ ===")

    # Функция для создания признаков (такая же, как при обучении)
    def create_features_simple(df):
        """Создание упрощенных признаков с округлением"""

        df = df.copy()
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        df = df.sort_values('timestamp').reset_index(drop=True)

        features = pd.DataFrame()

        # Базовые параметры
        features['flow_xvs'] = df['flow_xvs']
        features['flow_gvs'] = df['flow_gvs']
        features['temp_supply'] = df['temp_supply']
        features['temp_return'] = df['temp_return']

        # Расчетные невязки с округлением
        features['imbalance'] = round(features['flow_xvs'] - features['flow_gvs'], 2)
        features['imbalance_ratio'] = round(1 - (features['flow_gvs'] / features['flow_xvs'].replace(0, 0.001)), 2)
        features['temp_difference'] = round(features['temp_supply'] - features['temp_return'], 1)

        # Временные признаки
        features['hour'] = df['timestamp'].dt.hour
        features['day_of_week'] = df['timestamp'].dt.dayofweek

        # Основные статистические признаки (3 часа)
        features['flow_xvs_mean_3h'] = round(df['flow_xvs'].rolling(window=3, min_periods=1).mean(), 2)
        features['flow_gvs_mean_3h'] = round(df['flow_gvs'].rolling(window=3, min_periods=1).mean(), 2)
        features['imbalance_mean_3h'] = round(features['imbalance'].rolling(window=3, min_periods=1).mean(), 2)

        # Разности за 1 час
        features['flow_xvs_diff_1h'] = round(df['flow_xvs'].diff(1), 2)
        features['flow_gvs_diff_1h'] = round(df['flow_gvs'].diff(1), 2)
        features['temp_supply_diff_1h'] = round(df['temp_supply'].diff(1), 1)
        features['temp_return_diff_1h'] = round(df['temp_return'].diff(1), 1)

        # Разности за 3 часа
        features['flow_xvs_diff_3h'] = round(df['flow_xvs'].diff(3), 2)
        features['flow_gvs_diff_3h'] = round(df['flow_gvs'].diff(3), 2)
        features['temp_supply_diff_3h'] = round(df['temp_supply'].diff(3), 1)
        features['temp_return_diff_3h'] = round(df['temp_return'].diff(3), 1)

        # Заполнение NaN
        features = features.fillna(method='bfill').fillna(method='ffill')

        return features

    # Загрузка данных
    detectors_list = DetectorsAtHouse.objects.filter(house_id=house)
    if not len(detectors_list):
        return HttpResponse("Bad request. No detectors.", status=400)
    data = prepare_data(house, detectors_list)
    if not data.empty:
        print(f"Данные загружены: {len(data)} строк")
        # Создание признаков
        features = create_features_simple(data)
        # Проверяем, что все необходимые признаки присутствуют
        missing_features = set(metadata['feature_names']) - set(features.columns)
        if missing_features:
            print(f"Предупреждение: отсутствуют признаки: {missing_features}")
            # Оставляем только те признаки, которые есть в данных
            available_features = [f for f in metadata['feature_names'] if f in features.columns]
            features = features[available_features]
        else:
            features = features[metadata['feature_names']]

        print(f"Признаки подготовлены: {features.shape}")
    else:
        # Создание демонстрационных данных
        print("Создание демонстрационных данных...")
        dates = pd.date_range(start=datetime.now() - timedelta(days=30), end=datetime.now(), freq='H')
        demo_data = []
        for date in dates:
            demo_data.append({
                'timestamp': date,
                'flow_xvs': round(np.random.uniform(0.15, 0.25), 2),
                'flow_gvs': round(np.random.uniform(0.14, 0.24), 2),
                'temp_supply': round(np.random.uniform(59.0, 61.0), 1),
                'temp_return': round(np.random.uniform(41.0, 43.0), 1),
                'label': 'normal'
            })
        data = pd.DataFrame(demo_data)
        features = create_features_simple(data)
        features = features[metadata['feature_names']]
        print(f"Демо-данные созданы: {features.shape}")

    # 3. Выполнение прогноза
    print("\n=== ВЫПОЛНЕНИЕ ПРОГНОЗА ===")

    # Прогнозирование
    predictions = model.predict(features)

    # Преобразование в DataFrame для удобства
    pred_df = pd.DataFrame(predictions, columns=metadata['target_names'])

    # Добавляем временные метки
    pred_df['timestamp'] = data['timestamp'].values
    # 4. Вывод первых пяти строк результатов
    print("\n=== ПЕРВЫЕ 5 СТРОК РЕЗУЛЬТАТОВ ПРОГНОЗА ===")

    # Форматируем вывод для лучшей читаемости
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', 1000)
    response_str = ""
    # Создаем красивый вывод для первых 5 строк
    for i in range(min(5, len(pred_df))):
        print(f"\n--- Строка {i+1} ---")
        print(f"Время: {pred_df.iloc[i]['timestamp']}")
        response_str = response_str+f"\n--- Строка {i+1} ---\n"+f"Время: {pred_df.iloc[i]['timestamp']}\n"
        # Прогноз на 1 неделю (168 часов)
        print("Прогноз на 1 неделю:")
        print(f"  flow_xvs: {pred_df.iloc[i]['flow_xvs_168']:.3f}")
        print(f"  flow_gvs: {pred_df.iloc[i]['flow_gvs_168']:.3f}")
        print(f"  temp_supply: {pred_df.iloc[i]['temp_supply_168']:.1f}°C")
        print(f"  temp_return: {pred_df.iloc[i]['temp_return_168']:.1f}°C")
        response_str = response_str+"Прогноз на 1 неделю:\n"+f"  flow_xvs: {pred_df.iloc[i]['flow_xvs_168']:.3f}\n"+f"  flow_gvs: {pred_df.iloc[i]['flow_gvs_168']:.3f}\n"+f"  temp_supply: {pred_df.iloc[i]['temp_supply_168']:.1f}°C\n"+f"  temp_return: {pred_df.iloc[i]['temp_return_168']:.1f}°C\n"

        # Прогноз на 2 недели (336 часов)
        print("Прогноз на 2 недели:")
        print(f"  flow_xvs: {pred_df.iloc[i]['flow_xvs_336']:.3f}")
        print(f"  flow_gvs: {pred_df.iloc[i]['flow_gvs_336']:.3f}")
        print(f"  temp_supply: {pred_df.iloc[i]['temp_supply_336']:.1f}°C")
        print(f"  temp_return: {pred_df.iloc[i]['temp_return_336']:.1f}°C")

        # Прогноз на 3 недели (504 часов)
        print("Прогноз на 3 недели:")
        print(f"  flow_xvs: {pred_df.iloc[i]['flow_xvs_504']:.3f}")
        print(f"  flow_gvs: {pred_df.iloc[i]['flow_gvs_504']:.3f}")
        print(f"  temp_supply: {pred_df.iloc[i]['temp_supply_504']:.1f}°C")
        print(f"  temp_return: {pred_df.iloc[i]['temp_return_504']:.1f}°C")

    # 5. Дополнительная информация
    print("\n=== СВОДНАЯ ИНФОРМАЦИЯ ===")
    print(f"Всего выполнено прогнозов: {len(pred_df)}")
    print(f"Диапазон дат в данных: {data['timestamp'].min()} - {data['timestamp'].max()}")

    # Сохранение результатов
    print("\n=== СОХРАНЕНИЕ РЕЗУЛЬТАТОВ ===")
    forecast = pred_df.round(2).sort_values('timestamp',ascending=False).loc[0]
    timestamp = forecast['timestamp']
    forecast['timestamp'] = str(timestamp)[:10] + " " + str(timestamp)[11:]  # Убираем миллисекунды из timestamp
    house_obj = House.objects.get(id=house)
    try:
        forecast_obj = Forecast.objects.get(timestamp=timestamp, house_id=house_obj)
        forecast_obj.forecast = forecast.to_json()
        forecast_obj.save()
    except:
        Forecast.objects.create(timestamp=timestamp, house_id=house_obj, forecast=forecast.to_json())

    return HttpResponse(forecast.to_json(), status=200)

@method_decorator(csrf_exempt, name='dispatch')
class RisksValuesView(View):
    def get(self, request, *args, **kwargs):
        try:
            risks = RiskValues.objects.last()
        except:
            risks = None
            return HttpResponse(json.dumps(risks), content_type="application/json", status=400)        
        return HttpResponse(serialize("json", [risks]), content_type="application/json", status=200)
    
    def post(self, request, *args, **kwargs):
        if request.POST.get("house_id") is None:
            house_id = 1
        else:
            house_id = request.POST.get("house_id")
        house = House.objects.get(id=house_id)
        flow_xvs = request.POST.get("xvs")
        flow_gvs = request.POST.get("gvs")
        cold_water_supply = request.POST.get("cold_water_supply")
        reverse_flow = request.POST.get("reverse_flow")
        temp_supply = request.POST.get("t1")
        temp_return = request.POST.get("t2")
        sensivity = request.POST.get("sensivity")
        RiskValues.objects.create(house_id=house, xvs=flow_xvs, gvs=flow_gvs, cold_water_supply=cold_water_supply, 
                                  reverse_flow=reverse_flow, t1=temp_supply, t2=temp_return, sensivity=sensivity)
        result = {
            "status": "Success",
            "message": "Настройки сохранены успешно.",
            }
        # return HttpResponse(json.dumps(result), content_type="application/json", status=200)
        return redirect(request.headers._store['origin'][1])