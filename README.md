<div align="center">
<img width="800" alt="EduTrack Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# EduTrack Pro: Sistema de Gestión de Asistencia

EduTrack Pro es una solución *Silicon Valley Grade* para la gestión integral de asistencia estudiantil, diseñada con foco en la resiliencia offline, integración de Inteligencia Artificial y sincronización bidireccional en tiempo real mediante Supabase.

**🚀 Despliegue en Producción:** [Ver Demo en Vercel](https://registro-asistencia-poc.vercel.app/)

## ✨ Características Principales

- **Dashboard Multiroles:** Vistas personalizadas para Administradores, Profesores, Padres y Estudiantes.
- **Persistencia en Tiempo Real:** Base de datos relacional robusta en PostgreSQL usando **Supabase**.
- **Motor AI Embebido:** Generación de embeddings multimodales (Texto, Audio, Imagen) mediante **Google Gemini AI**.
- **Resiliencia PWA & Offline:** Sistema *Graceful Failure* que previene bloqueos de UI cuando hay fallos de red o pérdida de API Keys, soportando retención de datos en IndexedDB.
- **Escaneo QR Integrado:** Pase de lista ultrarrápido a través de la cámara del dispositivo.
- **Auditoría Estricta:** Registro inmutable de todos los cambios de asistencia.

## 🛠️ Stack Tecnológico

- **Frontend:** React 19, Vite, Tailwind CSS (Vanilla + Lucide Icons)
- **Backend/BaaS:** Supabase (Auth, PostgreSQL DB, Realtime)
- **IA:** `@google/genai` (Modelo gemini-embedding-2-preview)
- **Despliegue:** Vercel (Edge Network)

## ⚙️ Configuración y Ejecución Local

Para ejecutar este proyecto en tu entorno local, asegúrate de tener Node.js instalado.

### 1. Instalación de Dependencias
```bash
npm install
```

### 2. Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto basándote en el archivo `.env.example`. Necesitarás:

```env
# URL y Key (anon) de tu proyecto de Supabase
VITE_SUPABASE_URL="https://tu-proyecto.supabase.co"
VITE_SUPABASE_ANON_KEY="tu-anon-key-aqui"

# API Key de Google Gemini AI (opcional: el sistema correrá en mock si no está presente)
VITE_GEMINI_API_KEY="tu-gemini-key"
# Opcionalmente para Vite define:
GEMINI_API_KEY="tu-gemini-key"
```

> **Nota de Resiliencia:** Si omites estas llaves, la aplicación **NO** mostrará una *White Screen*. En su lugar, inicializará valores dummy seguros y te avisará por consola que estás ejecutando el entorno offline/mock.

### 3. Ejecución
```bash
npm run dev
```

## 🗄️ Esquema de Base de Datos (Supabase)

Para desplegar la BBDD en Supabase, ejecuta el siguiente script SQL en tu consola:

```sql
-- Tabla Principal de Estudiantes
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  section TEXT NOT NULL,
  status TEXT DEFAULT 'unmarked',
  timestamp_record TEXT,
  streak INTEGER DEFAULT 0,
  "atRisk" BOOLEAN DEFAULT false,
  notes TEXT
);

-- Tabla de Profesores
CREATE TABLE teachers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'unmarked',
  timestamp_record TEXT,
  class TEXT NOT NULL
);

-- Tabla de Auditoría (Logs inmutables)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  student_id TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---
*Desarrollado para el Ministerio de Educación Nacional de Colombia (PoC).*
