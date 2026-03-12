# Maker BOM

Build catalog and quoting tool for small-batch makers.

## Features
- Project catalog with per-build BOMs
- Part types: Purchased / 3D Printed / Custom Cut / Drawing
- Vendor badges: McMaster-Carr, Send Cut Send, FramingTech, Bambu Labs
- 3D print cost calculator (filament, electricity, wear & tear, labor)
- Assembly time tracking with labor cost rollup
- Delivery fees per vendor per project
- Stock hardware flagging (STOCK badge)
- Quote summary with suggested price
- CSV export

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to https://vercel.com → New Project
3. Import your repo
4. Click Deploy — no configuration needed

Vercel auto-detects Vite. Done.

## Data Storage

Data is saved to the browser's localStorage on whatever machine/browser you use.
Each browser/device has its own data — use CSV export to move data between devices.
