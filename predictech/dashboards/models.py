from django.db import models
from django.utils import timezone

# Create your models here.
class HouseAlerts(models.Model):
    house_id = models.PositiveBigIntegerField(default=0)
    name = models.CharField(max_length=100)
    date_time = models.DateTimeField(default=timezone.now)
    description = models.TextField(default="", blank=True)
    adress = models.CharField(max_length=255, default="", blank=True)
    forecast = models.CharField(max_length=100, default="", blank=True)
    cold_water_supply = models.FloatField(default=0.0)
    cold_water_diff = models.FloatField(default=0.0)
    reverse_water = models.FloatField(default=0.0)
    reverse_water_diff = models.FloatField(default=0.0)
    t1 = models.FloatField(default=0.0)
    t2 = models.FloatField(default=0.0)
    STATUSES = {'normal':'Норма', 'warning':'Отклонение', 'danger':'Авария'}
    status = models.CharField(choices=STATUSES, default="", blank=True)

    def __str__(self):
        return self.name +' - '+ self.date_time.__str__()

class Alerts(models.Model):
    alert_id = models.PositiveBigIntegerField(default=0)
    header = models.CharField(max_length=100)
    date_time = models.DateTimeField(default=timezone.now)
    description = models.TextField(default="", blank=True)
    adress = models.CharField(max_length=255, default="", blank=True)
    STATUSES = {'normal':'Норма', 'warning':'Предупреждение', 'critical':'Критическое'}
    status = models.CharField(choices=STATUSES, default="", blank=True)
    PRIORITY = {'low':'Низкий приоритет', 'medium':'Средний приоритет', 'high':'Высокий приоритет'}
    priority = models.CharField(choices=PRIORITY, default="", blank=True)

    def __str__(self):
        return self.header + " - "+ self.date_time.__str__()

class House(models.Model):
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=255)
    description = models.TextField(default="", blank=True)
    def __str__(self):
        return self.name
    
class DetectorTypes(models.Model):
    # type_id = models.PositiveBigIntegerField(default=0)
    name = models.CharField(max_length=100)
    units = models.CharField(max_length=100)
    description = models.TextField(default="", blank=True)
    def __str__(self):
        return self.name
    
class Detector(models.Model):
    type_id = models.ForeignKey(DetectorTypes, null=False, blank=False, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    description = models.TextField(default="", blank=True)
    install_date = models.DateTimeField(blank=True, null=True)
    verification_date = models.DateTimeField(blank=True, null=True)
    def __str__(self):
        return self.id.__str__()+" - "+self.type_id.__str__()+" - "+self.name

class DetectorTreshold(models.Model):
    detector_id = models.ForeignKey(Detector, null=False, blank=False, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    serial_number = models.CharField(max_length=100)
    value = models.FloatField(default=0.0)
    def __str__(self):
        return self.name

class DetectorsAtHouse(models.Model):
    house_id = models.ForeignKey(House, null=False, blank=False, on_delete=models.CASCADE)
    detector_id = models.ForeignKey(Detector, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)
    description = models.TextField(default="", blank=True)
    def __str__(self):
        return self.house_id.__str__()+" - "+self.name

class DetectorData(models.Model):
    detector_id = models.ForeignKey(Detector, null=False, blank=False, on_delete=models.CASCADE)
    timestamp = models.DateTimeField(default=timezone.now)
    value = models.FloatField(default=0.0)
    def __str__(self):
        return self.timestamp.__str__()+" - "+self.detector_id.__str__()+" - "+self.value.__str__()

def user_directory_path(instance, filename):
    return 'saved_models/user_{0}/%Y-%m-%d-%H-%M-%S-{1}'.format(instance.user.id, filename)

class SavedModel(models.Model):
    timestamp = models.DateTimeField(default=timezone.now)
    name = models.CharField(max_length=100)
    description = models.TextField(default="", blank=True)
    accuracy = models.FloatField(default=0.0)
    model_file = models.FileField(upload_to=user_directory_path, max_length=255)
    metadata_file = models.FileField(upload_to=user_directory_path, max_length=255)
    def __str__(self):
        return self.timestamp.__str__()+" - "+self.name
    
class ModelForHouse(models.Model):
    house_id = models.ForeignKey(House, null=False, blank=False, on_delete=models.CASCADE)
    model_id = models.ForeignKey(SavedModel, null=False, blank=False, on_delete=models.CASCADE)
    timestamp = models.DateTimeField(default=timezone.now)
    name = models.CharField(max_length=100)
    description = models.TextField(default="", blank=True)
    def __str__(self):
        return self.name

class StateLabel(models.Model):
    STATES = {'normal':'Норма', 'sensor_failure':'Сбой датчика', 'gradual_leak':'Постепенная утечка', 'sharp_leak':'Утечка', 'unknown':''}
    timestamp = models.DateTimeField(default=timezone.now)
    state = models.CharField(choices=STATES, default='unknown', blank=True)
    house_id = models.ForeignKey(House, null=False, blank=False, on_delete=models.CASCADE)
    name = models.CharField(max_length=100, default="", blank=True)
    description = models.TextField(default="", blank=True)
    confidence = models.FloatField(default=0.0)
    confirmed = models.BooleanField(default=False)
    def __str__(self):
        return self.house_id.__str__()+" - "+self.timestamp.__str__()+" - "+self.state
    
class Forecast(models.Model):
    timestamp = models.DateTimeField(default=timezone.now)
    house_id = models.ForeignKey(House, null=False, blank=False, on_delete=models.CASCADE)
    forecast = models.CharField(max_length=1000, default="", blank=True)
    def __str__(self):
        return self.house_id.__str__()+" - "+self.timestamp.__str__()