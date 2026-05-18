# 🏗️ limitless-template

Este es un boilerplate base de **Next.js** + **TypeScript** con TailwindCSS, Prisma, NextAuth, Shadcn UI y otras utilidades, mantenido por el equipo **Limitless**.

## 🚀 Comenzando

1. Clona el repositorio:

```bash
git clone git@github.com:FlyJetSmart/limitless-template.git
cd limitless-template
```

2. Instala dependencias:

```bash
npm install
```

3. Copia el archivo de entorno y ajústalo:

```bash
cp .env.example .env.local
# Luego edita .env.local con tus datos
```

4. Ejecuta en modo desarrollo:

```bash
npm run dev
```

Abre http://localhost:3000 en tu navegador.

## 🛠️ Funcionalidades Principales

- 🩺 **Health Check API**: `GET /api/health` devuelve `{ status: "ok", version: "x.x.x" }` usando la versión de package.json.
- 🎨 **TailwindCSS v4** con colores corporativos personalizados:
  - `jetsmart-purple`, `jetsmart-green`, `jetsmart-blue`, `american-blue`, `american-red`, `jetsmart-gray`, `jetsmart-dark`, `jetsmart-light`.
- 🖼️ **Shadcn UI** integrado (ej. `Button`) con utilidades y estilos adaptados.
- 🏠 **Página principal** personalizada mostrando paleta de colores y botones de ejemplo.
- 🔗 **Prisma ORM** configurado:
  - Esquema en `prisma/schema.prisma`.
  - Conexión en `lib/prisma.ts`.
- 📦 **Scripts de Prisma**:
  - `prisma generate`, `prisma migrate dev`, `prisma studio`.
- 🔐 **NextAuth + Keycloak** con feature flag (`AUTH_ENABLED`) desactivada por defecto.
- 🛡️ **Helper de autenticación** en `lib/auth.ts` para verificar si está habilitado.
- 🧹 **Linting y formateo**:
  - **ESLint 9** con configuración flat (`eslint.config.mjs`).
  - **Prettier** (`.prettierrc`, `.prettierignore`).
  - **EditorConfig** (`.editorconfig`).

## ⚙️ Variables de Entorno

El archivo `.env.example` incluye:

```
DATABASE_URL="mysql://USER:PASSWORD@HOST:PORT/DATABASE"
NEXT_PUBLIC_API_URL="http://localhost:3000/api"
AUTH_ENABLED="false" # Cambia a "true" para habilitar autenticación
KEYCLOAK_CLIENT_ID=""
KEYCLOAK_CLIENT_SECRET=""
KEYCLOAK_ISSUER=""
```

Cópialo a `.env.local` antes de ejecutar.

## 🚦 Comandos Disponibles

```bash
npm run dev            # Inicia el servidor en modo desarrollo
npm run build          # Genera build de producción
npm run start          # Inicia el servidor en producción
npm run lint           # Ejecuta ESLint
npm run lint:fix       # Corrige errores de ESLint automáticamente
npm run lint:check     # Verifica código sin cambios
npm run format         # Formatea código con Prettier
npm run format:check   # Verifica formato sin cambios
npm run prisma:generate# Genera cliente Prisma
npm run prisma:migrate # Ejecuta migraciones de Prisma
npm run prisma:studio  # Abre Prisma Studio
```

## 📁 Archivos Clave

- `app/api/health/route.ts` — Health Check API Endpoint
- `tailwind.config.js` — Configuración de TailwindCSS
- `postcss.config.js` — Configuración de PostCSS
- `eslint.config.mjs` — Configuración de ESLint 9 (Flat Config)
- `.prettierrc` — Configuración de Prettier
- `.prettierignore` — Ignorar archivos para Prettier
- `.editorconfig` — Configuración de EditorConfig
- `prisma/schema.prisma` — Esquema de base de datos para Prisma
- `lib/prisma.ts` — Cliente y configuración de conexión Prisma
- `app/api/auth/[...nextauth]/route.ts` — Configuración NextAuth + Keycloak
- `lib/auth.ts` — Utilitario para feature flag de autenticación

## 🤝 Mantenimiento

Este repositorio es mantenido por el equipo **Limitless**. ¡Gracias por tu interés!
