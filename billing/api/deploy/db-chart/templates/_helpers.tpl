{{/* The Cluster name is the release name (deploy workflow sets `wordsparrow-billing-api-pg`), so the auto-managed `<name>-app` Secret the api reads via secretKeyRef is predictable. */}}
{{- define "bliss-billing-api-pg.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "bliss-billing-api-pg.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- define "bliss-billing-api-pg.labels" -}}
helm.sh/chart: {{ include "bliss-billing-api-pg.chart" . }}
app.kubernetes.io/name: {{ include "bliss-billing-api-pg.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}
