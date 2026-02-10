# 🎵 Pash Integration - asmit.space/pash

## ✅ What's Integrated

Your Pash audio stem separation app is now integrated into your website at `/pash`!

- **Main site**: http://localhost:8080 → Your existing website
- **Pash app**: http://localhost:8080/pash → Audio stem separation
- **API proxy**: http://localhost:8080/pash/api → Auto-proxied to backend

---

## 🚀 Quick Start - Test Locally

### Option 1: Automatic Start (Recommended)
```bash
cd /Users/sm1t/Code/asmit-space

# Terminal 1: Start backend
cd /Users/sm1t/Code/pash/backend
source venv/bin/activate
uvicorn main:app --port 8000 --reload

# Terminal 2: Start website with Pash
cd /Users/sm1t/Code/asmit-space
./start-with-pash.sh
```

### Option 2: Manual Start
```bash
# Terminal 1: Backend API
cd /Users/sm1t/Code/pash/backend
source venv/bin/activate
uvicorn main:app --port 8000

# Terminal 2: Website
cd /Users/sm1t/Code/asmit-space
npm start

# Terminal 3 (Optional): Worker
cd /Users/sm1t/Code/pash/backend/worker
source ../venv/bin/activate
python worker.py
```

---

## 🧪 Test It Out

1. **Visit your main site**:
   ```
   http://localhost:8080
   ```

2. **Visit Pash**:
   ```
   http://localhost:8080/pash
   ```

3. **Register a new account**:
   - Click "Sign up" or go to http://localhost:8080/pash/register
   - Email: your@email.com
   - Password: at least 8 characters

4. **Upload a test file**:
   - After login, you'll see the upload interface
   - Upload an MP3/WAV file
   - Watch it process (if worker is running)
   - Play separated stems!

---

## 📁 What Changed in Your Site

### New Files
```
asmit-space/
├── pash/                       # Pash frontend build
│   ├── index.html
│   └── assets/
├── server.js                   # Express server with routing + proxy
├── start-with-pash.sh         # Convenient start script
└── PASH_INTEGRATION.md        # This file
```

### Updated Files
```
asmit-space/
└── package.json               # Added express & http-proxy-middleware
```

---

## 🔧 How It Works

### Express Server (`server.js`)
- Serves your existing static site at `/`
- Serves Pash React app at `/pash`
- Proxies `/pash/api` → `http://localhost:8000` (Pash backend)
- Handles client-side routing for both apps

### URL Routing
```
http://localhost:8080/              → Your main site (index.html)
http://localhost:8080/welcome.html  → Your welcome page
http://localhost:8080/pash          → Pash app (login/register)
http://localhost:8080/pash/login    → Pash login page
http://localhost:8080/pash/api/...  → Proxied to Pash backend
```

### API Flow
```
Browser Request:
  http://localhost:8080/pash/api/songs

Express Proxy:
  http://localhost:8000/songs

Pash Backend:
  Returns user's songs
```

---

## 🔐 Authentication

Pash uses JWT tokens stored in localStorage:
- After login/register, token is saved
- All API calls include `Authorization: Bearer <token>`
- Token expires after 7 days
- Automatic logout on 401 responses

---

## 🎨 Customization

### Update API URL
If you deploy the backend elsewhere, update in frontend build:

```bash
cd /Users/sm1t/Code/pash/frontend
export VITE_API_URL=https://your-api-url.com
export BASE_PATH=/pash
npm run build

# Copy to asmit-space
cp -r dist/* /Users/sm1t/Code/asmit-space/pash/
```

### Update Port
Change server port in `server.js` or via environment:
```bash
PORT=3000 npm start
```

---

## 🚢 Deployment to Production

### For Nginx Deployment
1. Build frontend for production:
   ```bash
   cd /Users/sm1t/Code/pash/frontend
   BASE_PATH=/pash npm run build
   ```

2. Copy to your server:
   ```bash
   scp -r dist/* user@server:/var/www/asmit.space/pash/
   ```

3. Add to nginx config:
   ```nginx
   # Pash app
   location /pash {
       alias /var/www/asmit.space/pash;
       try_files $uri $uri/ /pash/index.html;
   }

   # Pash API proxy
   location /pash/api {
       proxy_pass http://localhost:8000;
       proxy_set_header Authorization $http_authorization;
       rewrite ^/pash/api/(.*) /$1 break;
   }
   ```

4. Reload nginx:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   ```

---

## 🐛 Troubleshooting

### "Cannot GET /pash"
- Make sure you're using `npm start` (not the old http-server)
- Check that `pash/` directory exists with built files

### "API calls fail"
- Ensure Pash backend is running on port 8000
- Check browser console for CORS errors
- Verify proxy is working: http://localhost:8080/pash/api/health

### "Pash app shows blank page"
- Check browser console for errors
- Verify all assets loaded correctly
- Try rebuilding: `cd /Users/sm1t/Code/pash/frontend && BASE_PATH=/pash npm run build`

### "Login doesn't work"
- Check backend is running and responding
- Verify token is being saved in localStorage (check browser DevTools)
- Check network tab for API responses

---

## 📊 Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser: http://localhost:8080                     │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  Express Server (port 8080)                         │
│  ┌─────────────────────────────────────────────┐   │
│  │ Static File Serving                          │   │
│  │  / → Main site                               │   │
│  │  /pash → Pash React app                      │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │ API Proxy                                    │   │
│  │  /pash/api → http://localhost:8000          │   │
│  └─────────────────────────────────────────────┘   │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  Pash Backend (port 8000)                           │
│  ┌─────────────────────────────────────────────┐   │
│  │ FastAPI with Authentication                  │   │
│  │  /register, /login, /songs, /upload, etc    │   │
│  └─────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────┐   │
│  │ AWS Integration                              │   │
│  │  S3, DynamoDB, SQS                           │   │
│  └─────────────────────────────────────────────┘   │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│  Pash Worker (optional)                             │
│  ┌─────────────────────────────────────────────┐   │
│  │ Demucs Audio Processing                      │   │
│  │  Polls SQS → Downloads S3 → Processes →      │   │
│  │  Uploads stems to S3                         │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## ✅ Checklist for Production

- [ ] Generate secure JWT secret: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- [ ] Update backend `.env` with new JWT_SECRET_KEY
- [ ] Update CORS_ORIGINS to your production domain
- [ ] Build frontend with production API URL
- [ ] Test authentication flow
- [ ] Test file upload
- [ ] Test worker processing
- [ ] Deploy backend to server
- [ ] Copy frontend files to server
- [ ] Configure nginx
- [ ] Enable HTTPS
- [ ] Test from production domain

---

## 🎉 You're All Set!

Your website now has a complete audio stem separation app integrated at `/pash`!

**Local testing:**
```bash
./start-with-pash.sh
```

**Visit:**
- Main site: http://localhost:8080
- Pash app: http://localhost:8080/pash

Enjoy! 🎵
