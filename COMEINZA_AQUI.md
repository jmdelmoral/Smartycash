# Prompt para Inicializar el Proyecto con Cursor AI

## Objetivo

Este boilerplate está configurado con Next.js, React, TypeScript, Shadcn UI, NextAuth.js y Prisma. El objetivo es proporcionar una base sólida para el desarrollo de aplicaciones web.

## Configuración de NextAuth.js y Keycloak

El sistema de autenticación está implementado con NextAuth.js y Keycloak. Se incluye:

1.  **Proveedor Keycloak**: Integrado con `next-auth`.
2.  **Manejo de Certificado SSL**: Configurado para producción, soportando certificados CA personalizados.
3.  **Feature Flag (`AUTH_ENABLED`)**: Para habilitar/deshabilitar la autenticación.
4.  **Lógica Específica por Entorno**: Validaciones de SSL adaptadas para desarrollo y producción.
5.  **Protección de Rutas**: Todas las rutas por defecto están protegidas, excepto las de autenticación y activos estáticos.
6.  **Integración Frontend**: Componentes para gestión de sesión y UI de login/logout.

## Configuración de Base de Datos (MySQL)

La configuración actual usa MySQL con Prisma. Asegúrate de tener una instancia de MySQL disponible y de configurar la variable de entorno `DATABASE_URL` en tu archivo `.env.local`.

## Cómo Iniciar el Proyecto (para Cursor AI)

Para que Cursor AI te ayude a inicializar este proyecto, puedes proporcionarle los siguientes comandos y pasos:

```
# 1. Configurar variables de entorno
# Copia el archivo env.example a .env.local y rellena con tus datos:
cp env.example .env.local

# Genera un secreto para NEXTAUTH_SECRET (ejecuta en tu terminal):
# openssl rand -base64 32

# 2. Instalar dependencias
npm install

# 3. Inicializar la base de datos (asegúrate de que MySQL esté corriendo)
npx prisma migrate dev --name init

# 4. Generar el cliente de Prisma
npx prisma generate

# 5. Iniciar la aplicación en modo desarrollo
npm run dev
```

Con esta información, Cursor AI podrá comprender el contexto del proyecto y guiarte a través de los pasos de configuración inicial y despliegue.
