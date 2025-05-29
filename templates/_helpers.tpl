{{- /*
Expand the name of the chart.
*/ -}}
{{- define "pod-ttl-cleaner.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- /*
ServiceAccount name
*/ -}}
{{- define "pod-ttl-cleaner.serviceAccountName" -}}
{{- printf "%s-sa" .Release.Name }}
{{- end }}
