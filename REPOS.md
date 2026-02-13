# Repository layout (frontend / backend)

- **Backend (this repo):** Solana program, Anchor, scripts, tests.  
  Push to: `https://github.com/ramppagge/soliseum-program`

- **Frontend:** React app in `soliseum-arena/` (separate git repo).  
  Repo: `https://github.com/ramppagge/soliseum-arena`

## 1. Create the backend repo on GitHub

1. Open https://github.com/new  
2. Name: **soliseum-program**  
3. Leave “Add README” **unchecked** (empty repo)  
4. Create repository  

## 2. Push this backend to GitHub

From the project root (SOLISEUM):

```powershell
git push -u backend master
```

If you used a different repo name or URL, fix the remote first:

```powershell
git remote set-url backend https://github.com/ramppagge/YOUR-BACKEND-REPO.git
git push -u backend master
```

## 3. Make soliseum-arena the only content of the frontend repo

Right now `https://github.com/ramppagge/soliseum-arena` has the old combined history. To make it frontend-only:

```powershell
cd soliseum-arena
git add -A
git commit -m "Frontend updates"   # if you have local changes
git push origin main
```

If GitHub still shows the old backend commit, set the default branch to `main` in the repo Settings, or force-push the frontend (this overwrites the remote):

```powershell
cd soliseum-arena
git push --force origin main
```

Then in GitHub → Settings → General, set “Default branch” to **main**.

## Remotes (backend repo)

- `origin` → https://github.com/ramppagge/soliseum-arena (frontend repo)
- `backend` → https://github.com/ramppagge/soliseum-program (this program; push here)
