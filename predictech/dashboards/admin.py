from django.contrib import admin
from .utils import admin_register
from .models import *

class HouseAlertsAdmin(admin.ModelAdmin):
    pass

class AlertsAdmin(admin.ModelAdmin):
    pass

class HouseAdmin(admin.ModelAdmin):
    pass

class DetectorTypesAdmin(admin.ModelAdmin):
    pass

class DetectorAdmin(admin.ModelAdmin):
    pass

class DetectorTresholdAdmin(admin.ModelAdmin):
    pass

class DetectorsAtHouseAdmin(admin.ModelAdmin):
    pass

class DetectorDataAdmin(admin.ModelAdmin):
    list_display = ("detector_id", "timestamp", "value",)
    pass

class SavedModelAdmin(admin.ModelAdmin):
    pass

class ModelForHouseAdmin(admin.ModelAdmin):
    pass

class StateLabelAdmin(admin.ModelAdmin):
    list_display = ("timestamp", "state", "house_id",)
    pass
class ForecastAdmin(admin.ModelAdmin):
    pass

admin_register(namespace=globals())