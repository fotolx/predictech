from .views import *
from django.urls import path

urlpatterns = [
    path('', home, name='main'),
    path('test_alerts/', HouseAlertsView.as_view(), name='test_alerts'),
    path('house_alerts/', HouseAlertsView.as_view(), name='house_alerts'),
    path('alerts/', AlertsView.as_view(), name='alerts'),
    path('detector_data/', DetectorDataCreateView.as_view(), name='detector_data'),
    path('detector_data_log/', DetectorDataView.as_view(), name='detector_data_log'),
    path('detector/', DetectorView.as_view(), name='detector'),
    path('detectors_at_house/', DetectorsAtHouseView.as_view(), name='detectors_at_house'),
    path('state_label/', StateLabelCreateView.as_view(), name='state_label'),
    path('journal/', JournalView.as_view(), name='journal'),
    path('risk-dashboard/', RiskDashboardView.as_view(), name='risk-dashboard'),
    path('situation/', SituationView.as_view(), name='situation'),
    path('train_model/', train_model, name='train_model'),
    path('predict/', predict, name='predict'),
    path('house/', HouseView.as_view(), name='house'),
    path('forecast/', forecast, name='forecast'),
]