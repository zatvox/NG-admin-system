# Nueva Generación — Sistema de Comisiones

## link directo: https://zatvox.github.io/NG-admin-system/

Sistema web para una organización social-política estructurada en 5 comisiones, cada una con sus propios comandos operativos (subgrupos), tareas, calendario, comunicados y biblioteca de enlaces. Ver `especificaciones-sistema-comisiones.md` para el contexto completo y `especificaciones-sistema-comisiones.pdf` para compartirlo fuera del sistema.

## Estado actual

Funciona en dos modos, sin tocar código:

- **Modo demo** (por defecto): `assets/js/config.js` tiene placeholders, así que no hay base de datos real. El login muestra un selector de "perfil de demo" y todos los datos son de ejemplo. Sirve para revisar diseño y flujo antes de conectar Supabase.
- **Modo real**: en cuanto reemplazas los placeholders de `config.js` con tu URL/anon key de Supabase (ver `SETUP.md`), el sistema pasa a usar login real (email + contraseña), datos reales, y Row Level Security de verdad.

## Requisitos

- Cualquier navegador moderno (Chrome, Firefox, Safari, Edge — últimas 2 versiones).
- Para modo real: un proyecto en [Supabase](https://supabase.com) (plan Free alcanza).
- Sin build step, sin `npm install`: es HTML/CSS/JS vanilla, listo para GitHub Pages.

## Instalación rápida

1. Clona o descarga esta carpeta.
2. Ábrela con un servidor estático simple (`python3 -m http.server` o `npx serve .`) — ver `SETUP.md` sección 6.
3. Entra a `index.html`. Sin configurar nada, ya puedes explorar el sistema en modo demo.
4. Cuando quieras conectar datos reales, sigue `SETUP.md` de principio a fin.

## Estructura de carpetas

```
├── index.html                 # Redirige a login.html o app.html según la sesión
├── login.html                 # Ingreso (demo o real, según config.js)
├── register.html              # Crear cuenta nueva
├── forgot-password.html       # Recuperar contraseña
├── app.html                   # Shell de la aplicación (todo el sistema post-login)
├── site.webmanifest           # Metadata para instalar como PWA en el celular
├── assets/
│   ├── css/                   # variables → base → components → app/calendar/auth → responsive
│   ├── js/
│   │   ├── config.js           # ÚNICO archivo a editar para conectar Supabase
│   │   ├── supabase-client.js  # Cliente singleton
│   │   ├── auth.js             # Login/registro/recuperar, unifica demo y real
│   │   ├── permissions.js      # Espejo cliente de las políticas RLS (solo UX)
│   │   ├── utils.js, ui/       # Helpers de DOM, fechas, modal, toast
│   │   ├── data/                # Una función por entidad (comisiones, tareas, eventos...)
│   │   ├── modal-openers.js     # Los 5 formularios de creación (tarea/enlace/evento/comunicado/comando)
│   │   ├── views/                # Pantallas, agrupadas por dominio (ver ARCHITECTURE.md)
│   │   ├── router.js             # Enrutador por hash (#/ruta)
│   │   └── app.js                # Arranque de la aplicación
│   ├── images/
│   └── sql/
│       ├── schema.sql           # Tablas, enums, triggers
│       ├── rls-policies.sql     # Seguridad por rol (ver/editar)
│       ├── seed-demo.sql        # 5 comisiones + 27 comandos regionales
│       └── migrations/          # Los 3 archivos de arriba, numerados y versionados
├── .env.example
├── README.md                    # Este archivo
├── SETUP.md                     # Cómo conectar Supabase y publicar
└── ARCHITECTURE.md              # Decisiones técnicas y flujo de datos
```

## Guía de uso rápido

- **Ver el sistema con distintos permisos (modo demo):** usa el selector "Ver como" en la esquina superior derecha, o elige un perfil distinto en `login.html`.
- **Crear algo (tarea, evento, comunicado, enlace, comando):** los botones "+ Nueva/Nuevo..." abren un formulario real. En modo real, "Guardar" escribe en Supabase; en modo demo, confirma con un mensaje pero no persiste.
- **Cambiar nombre/colores/parámetros de la organización:** módulo "Configuración" en el menú lateral (solo visible para Dirección General).

## Módulos incluidos

Inicio · Comisiones · Tareas (kanban + lista) · Calendario · Directorio · Comunicados · Enlaces · Reportes · Configuración (nuevo, solo Dirección) · Mi perfil.

Ver `especificaciones-sistema-comisiones.md` sección 4 para el detalle de cada uno, y sección 3 para la tabla completa de roles y permisos.
