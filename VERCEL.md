# Vercel Deployment (Frontend)

## Vercel project settings

1. **Root Directory:** `soliseum-arena`
2. **Framework Preset:** Vite
3. **Build Command:** `npm run build` (default)
4. **Output Directory:** `dist` (default)

## Environment variables (optional)

- `VITE_API_URL` — backend API URL
- `VITE_SOCKET_URL` — backend Socket.io URL (same as API URL when backend uses single-port)

## If you see "vite: command not found"

- Set **Root Directory** to `soliseum-arena` in Project Settings → General.
- Redeploy.
