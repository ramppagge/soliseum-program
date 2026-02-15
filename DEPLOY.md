# Deploy Soliseum Backend with Existing Frontend

This guide covers deploying the backend so your frontend (soliseum-arena) can connect to it.

---

## Overview

| Component | Local | Deployed |
|-----------|-------|----------|
| **Backend API** | http://localhost:4000 | https://your-backend.onrender.com |
| **Socket.io** | http://localhost:4001 | Same URL as API (single port) |
| **Frontend** | Points to localhost | Points to backend URL |

The backend runs in **single-port mode** when `SOCKET_PORT` is unset: REST API and Socket.io share one port (required by Render, Railway, etc.).

---

## 1. Deploy Backend (Render / Railway)

### Option A: Render

1. Go to [render.com](https://render.com) → **New** → **Web Service**
2. Connect your repo, select the **soliseum-backend** folder (or root if monorepo)
3. Configure:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Instance Type:** Free or paid
4. Add **Environment Variables**:
   ```
   DATABASE_URL=postgresql://... (your Supabase URL)
   ORACLE_PRIVATE_KEY=... (your oracle key)
   PORT=4000 (Render sets this automatically; keep for clarity)
   CORS_ORIGIN=https://your-frontend.vercel.app
   WEBHOOK_SECRET=...
   HELIUS_API_KEY=...
   BACKEND_WEBHOOK_URL=https://your-service-name.onrender.com
   ```
5. Deploy. Note the URL, e.g. `https://soliseum-backend.onrender.com`

### Option B: Railway

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub**
2. Select repo, set **Root Directory** to `soliseum-backend` if needed
3. Railway auto-detects Node.js. Add env vars in **Variables** tab
4. Deploy. Note the generated URL

---

## 2. Point Frontend to Backend

Your frontend uses `VITE_API_URL` and `VITE_SOCKET_URL`. For deployment, both should be the **same** backend URL.

### If frontend is on Vercel / Netlify

Add build-time env vars:

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://your-backend.onrender.com` |
| `VITE_SOCKET_URL` | `https://your-backend.onrender.com` |

**Vercel:** Project → Settings → Environment Variables  
**Netlify:** Site → Build & deploy → Environment

### If frontend is on Lovable / other

Create or update `.env.production` in **soliseum-arena**:

```
VITE_API_URL=https://your-backend.onrender.com
VITE_SOCKET_URL=https://your-backend.onrender.com
```

Rebuild the frontend so these values are baked in.

---

## 3. CORS

Set `CORS_ORIGIN` on the backend to your frontend URL:

```
CORS_ORIGIN=https://your-frontend.vercel.app
```

Use `*` only for local dev.

---

## 4. Helius Webhook

After deployment, set in backend env:

```
BACKEND_WEBHOOK_URL=https://your-backend.onrender.com
```

Then run `npm run setup:webhook` locally (with these vars in `.env`) to register the webhook with Helius.

---

## 5. Checklist

- [ ] Backend deployed and returns `{"status":"ok"}` at `/health`
- [ ] Frontend `VITE_API_URL` and `VITE_SOCKET_URL` point to backend URL
- [ ] `CORS_ORIGIN` includes frontend URL
- [ ] `DATABASE_URL` and `ORACLE_PRIVATE_KEY` set
- [ ] Helius webhook registered (optional)

---

## Local vs Deployed

| Env | Backend | Frontend .env |
|-----|---------|---------------|
| **Local** | `npm run dev` (ports 4000 + 4001) | `VITE_API_URL=http://localhost:4000`<br>`VITE_SOCKET_URL=http://localhost:4001` |
| **Deployed** | Single port (e.g. 4000) | `VITE_API_URL=https://xxx.onrender.com`<br>`VITE_SOCKET_URL=https://xxx.onrender.com` |
