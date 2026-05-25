{{- define "agentd.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "agentd.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "agentd.labels" -}}
helm.sh/chart: {{ include "agentd.name" . }}
app.kubernetes.io/name: {{ include "agentd.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "agentd.apiUrl" -}}
{{- if .Values.ingress.enabled }}
https://{{ .Values.ingress.apiSubdomain }}.{{ .Values.ingress.host }}
{{- else }}
http://{{ include "agentd.fullname" . }}-api:8787
{{- end }}
{{- end }}

{{- define "agentd.webUrl" -}}
{{- if .Values.ingress.enabled }}
https://{{ .Values.ingress.host }}
{{- else }}
http://{{ include "agentd.fullname" . }}-web:3000
{{- end }}
{{- end }}
