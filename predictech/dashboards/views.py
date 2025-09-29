from django.shortcuts import render
from django.views import View
from django.views.generic import CreateView
from django.http import JsonResponse
from django.core.serializers import serialize
from django.http import HttpResponse
from django.utils.decorators import method_decorator  
from django.views.decorators.csrf import csrf_exempt 
from .models import *

def home(request):
    return render(request, 'index.html')

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
        qs = DetectorData.objects.filter(detector_id=request.GET.get("detector_id")).order_by('-timestamp')[0]
        data = serialize("json", [qs])
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