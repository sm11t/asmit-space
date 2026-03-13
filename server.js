const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const API_URL = process.env.API_URL || 'http://localhost:8000';

// CORS middleware for development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Proxy /pash/api to the Pash backend
app.use('/pash/api', createProxyMiddleware({
  target: API_URL,
  changeOrigin: true,
  pathRewrite: {
    '^/pash/api': '', // Remove /pash/api prefix
  },
  onProxyReq: (proxyReq, req) => {
    // Forward Authorization header
    if (req.headers.authorization) {
      proxyReq.setHeader('Authorization', req.headers.authorization);
    }
  },
  logLevel: 'debug'
}));

// Serve Pash frontend (React app with client-side routing)
app.use('/pash', express.static(path.join(__dirname, 'pash'), {
  setHeaders: (res, filePath) => {
    // Don't cache index.html
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else {
      // Cache assets for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

// Handle client-side routing for Pash - all /pash routes go to index.html
app.get('/pash/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'pash', 'index.html'));
});

// Serve Lead Engine showcase at /lead-engine
app.get('/lead-engine', (req, res) => {
  res.sendFile(path.join(__dirname, 'content', 'showcase_leadengine', 'index.html'));
});

// Serve main website static files
app.use(express.static(__dirname));

// Fallback for SPA routing in main site (if needed)
app.get('*', (req, res) => {
  // Check if file exists
  const filePath = path.join(__dirname, req.path);
  if (require('fs').existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    // Default to index.html
    res.sendFile(path.join(__dirname, 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`🌐 Server running at http://localhost:${PORT}`);
  console.log(`📱 Main site: http://localhost:${PORT}`);
  console.log(`🎵 Pash app: http://localhost:${PORT}/pash`);
  console.log(`🔌 API proxy: http://localhost:${PORT}/pash/api → ${API_URL}`);
  console.log('');
  console.log('Make sure Pash backend is running:');
  console.log('  cd /Users/sm1t/Code/pash/backend');
  console.log('  source venv/bin/activate');
  console.log('  uvicorn main:app --port 8000');
});
