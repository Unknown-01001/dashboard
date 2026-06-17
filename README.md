# Notas U

Aplicacion web vanilla JS con Supabase Auth, Supabase Database y funciones Vercel.

## Variables de entorno en Vercel

Configura en Project Settings > Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Luego redeploy. Vercel no aplica variables nuevas a deployments antiguos.

## Base de datos

Ejecuta `supabase/schema.sql` en el SQL Editor de Supabase.

## Desarrollo local

Opcion recomendada:

```bash
npm install
npm start
```

Opcion simple:

Edita `config.js` con tu `supabaseUrl` y `supabaseAnonKey`. Las funciones de administrador requieren Vercel dev o Vercel deploy porque usan `/api/admin-users`.
