# Vercel Deployment (Frontend)

The root `vercel.json` and `package.json` build script run the frontend build from `soliseum-arena/`. No Root Directory setting needed.

## Environment variables (optional)

- `VITE_API_URL` — backend API URL
- `VITE_SOCKET_URL` — backend Socket.io URL (same as API URL when backend uses single-port)

## Alternative: Root Directory

You can also set **Root Directory** to `soliseum-arena` in Vercel Project Settings. Then the root build script is not used.
