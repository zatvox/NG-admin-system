# SETUP — Guía de configuración inicial

Pasos exactos para pasar de "modo demo" a sistema conectado con datos reales.

## 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) y crea un proyecto nuevo (plan Free alcanza para esta organización).
2. Anota la **Project URL** y la **anon public key** (Project Settings → API).
3. En **Authentication → Providers**, deja habilitado Email/Password (es el único método que usa este sistema por ahora).
4. En **Authentication → URL Configuration**, agrega la URL donde publiques el sitio (ver paso 4) como Site URL y como Redirect URL — la necesita `forgot-password.html` para el enlace de recuperación.

## 2. Correr el SQL

En **SQL Editor** de Supabase, ejecuta en este orden exacto (o usa los mismos archivos numerados en `assets/sql/migrations/`):

1. `assets/sql/schema.sql` — tablas, enums, triggers.
2. `assets/sql/rls-policies.sql` — políticas de seguridad por rol.
3. `assets/sql/seed-demo.sql` — las 5 comisiones + los 27 comandos regionales (opcional pero recomendado para no crearlos a mano).

**Después de correr los 3 archivos**, ve a **Settings → API** y presiona **"Reload schema cache"** (o espera ~60 segundos). Es un paso fácil de olvidar y la causa más común de errores 500 "raros" justo después de instalar: PostgREST (la capa que traduce tus tablas a API) cachea la estructura de la base y no se entera de las tablas nuevas hasta que se refresca.

Si `seed-demo.sql` falla en la función `unaccent()`, corre primero:
```sql
create extension if not exists unaccent;
```

## 3. Conectar el frontend

Abre `assets/js/config.js` y reemplaza los dos placeholders:

```js
var SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
var SUPABASE_ANON_KEY = "TU-ANON-KEY-AQUI";
```

Con eso alcanza. El sistema detecta automáticamente que ya no está en modo demo (`NG_CONFIG.IS_SUPABASE_CONFIGURED` pasa a `true`) y:
- `login.html` muestra el formulario real de email/contraseña en vez del selector de perfiles.
- Toda la capa de datos (`assets/js/data/*.js`) empieza a leer/escribir en Supabase en vez de los datos de ejemplo.

## 4. Publicar en GitHub Pages

1. Sube todo el contenido de esta carpeta a un repositorio de GitHub (público o privado con GitHub Pro/Team).
2. En **Settings → Pages**, elige la branch (ej. `main`) y carpeta raíz (`/`).
3. Espera 1-2 minutos y entra a la URL que te da GitHub Pages.
4. Vuelve a Supabase → Authentication → URL Configuration y agrega esa URL como Redirect URL (si no lo hiciste en el paso 1).

## 5. Dar de alta a las primeras personas

1. Cada persona entra a `register.html` y crea su cuenta. Queda automáticamente en `usuarios` con `estado = 'pendiente_activacion'` (= Colaborador, sin comisión).
2. Para marcar a alguien como **Dirección General**, corre en el SQL Editor:
   ```sql
   update usuarios set es_direccion = true, estado = 'activo' where email = 'correo@ejemplo.com';
   ```
3. Para asignar un **Líder de Comisión**:
   ```sql
   update comisiones set lider_id = (select id from usuarios where email = 'correo@ejemplo.com')
   where slug = 'comunidad';
   ```
4. Para asignar **Coordinador/Miembro** a un comando (incluye los 27 regionales):
   ```sql
   insert into membresias (usuario_id, comando_id, rol)
   select u.id, c.id, 'coordinador'
   from usuarios u, comandos c
   where u.email = 'correo@ejemplo.com' and c.slug = 'org-lima-metropolitana';
   ```
   (`seed-demo.sql` trae estos mismos ejemplos comentados al final, listos para copiar y pegar).

Una vez que Dirección tenga su cuenta, la mayoría de estas tareas (excepto asignar Líder/Dirección, que quedan en SQL por ahora) se podrán hacer desde el propio sistema (botones "+ Crear comando operativo" y asignación de miembros).

## 6. Probar localmente antes de publicar

No necesitas un servidor especial: basta con abrir `index.html` con un servidor estático simple (abrir por doble clic también funciona, aunque algunos navegadores restringen `fetch` sobre `file://` — si ves errores raros, usa uno de estos):

```bash
# Con Python (ya viene instalado en casi todo)
python3 -m http.server 8080

# o con Node
npx serve .
```

Y entra a `http://localhost:8080`.

## 7. Checklist antes de dar por lista una entrega

- [ ] `config.js` con URL/anon key reales (no los placeholders).
- [ ] Los 3 SQL corridos sin errores.
- [ ] Al menos una cuenta marcada como Dirección General.
- [ ] Login, registro y recuperar contraseña probados con un correo real.
- [ ] Probado en un celular real (no solo en el inspector de escritorio) — ver ARCHITECTURE.md, sección Mobile.
