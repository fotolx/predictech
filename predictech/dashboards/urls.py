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
    path('state_label/', StateLabelCreateView.as_view(), name='state_label'),
]