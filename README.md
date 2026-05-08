# AutoImport Tepic

App web para control de autos importados de EUA.

## Stack
- **Frontend**: HTML / CSS / JS puro (ES Modules)
- **Base de datos**: Supabase (PostgreSQL)
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage (fotos de comprobantes)
- **Deploy**: Vercel + GitHub

## Estructura
```
autoimport/
├── index.html              ← Login
├── vercel.json             ← Config de Vercel
├── css/
│   └── global.css          ← Estilos globales
├── js/
│   └── supabase.js         ← Cliente y helpers de Supabase
└── pages/
    ├── dashboard.html      ← Dashboard principal
    ├── autos.html          ← Lista de autos
    ├── detalle.html        ← Detalle de auto + timeline
    ├── nuevo-auto.html     ← Formulario nuevo auto (3 pasos)
    ├── gasto.html          ← Registrar gasto / etapa
    ├── caja.html           ← Capital y caja del negocio
    ├── stats.html          ← Estadísticas
    └── simulador.html      ← Simulador de ganancia
```

## Deploy en Vercel

### 1. Subir a GitHub
```bash
git init
git add .
git commit -m "AutoImport Tepic — inicial"
git remote add origin https://github.com/TU_USUARIO/autoimport-tepic.git
git push -u origin main
```

### 2. Conectar con Vercel
1. Ve a vercel.com → New Project
2. Importa el repo de GitHub
3. Framework Preset: **Other**
4. Root Directory: `/` (dejar por default)
5. Deploy

### 3. Dominio personalizado (opcional)
En Vercel → Settings → Domains → agregar tu dominio

## Usuarios
- joseph@... — Joseph
- emmanuel@... — Emmanuel

## Supabase
- URL: https://vxwmheehqqzybucaunkj.supabase.co
- Tablas: socios, autos, etapas_auto, gastos, movimientos_caja, prestamo_slots, historial_prestamo, capital_socios
- Storage bucket: comprobantes (privado)

## Páginas pendientes de desarrollar
Las siguientes páginas están en el diseño pero el código está pendiente:
- `pages/autos.html` — lista con filtros
- `pages/detalle.html` — timeline completo
- `pages/nuevo-auto.html` — 3 pasos
- `pages/caja.html` — capital y liquidaciones
- `pages/stats.html` — estadísticas
- `pages/simulador.html` — simulador sin guardar
