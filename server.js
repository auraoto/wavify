/**
 * WAVIFY - Node.js Server & Streaming Search Proxy
 * Запуск: node server.js [порт]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.argv[2], 10) || 3000;
const DIRECTORY = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg'
};

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  // API Поиска
  if (parsed.pathname === '/api/search') {
    const q = (parsed.query.q || '').trim();
    const source = (parsed.query.source || 'all').toLowerCase();

    if (!q) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ results: [] }));
    }

    const results = [];

    // 1. Deezer Search (Spotify Catalog with real 30s MP3s)
    if (source === 'all' || source === 'spotify') {
      try {
        const dzUrl = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15`;
        const resp = await fetch(dzUrl, { signal: AbortSignal.timeout(3500) });
        if (resp.ok) {
          const data = await resp.json();
          (data.data || []).forEach(item => {
            results.push({
              id: `spotify-${item.id}`,
              title: item.title,
              artist: item.artist?.name || '',
              album: item.album?.title || '',
              year: '2024',
              source: 'spotify',
              duration: item.duration || 180,
              cover: item.album?.cover_medium || item.artist?.picture_medium || '',
              audioUrl: item.preview || ''
            });
          });
        }
      } catch (err) {
        console.error('[Search] Deezer error:', err.message);
      }
    }

    // 2. Yandex Music Search
    if (source === 'all' || source === 'yandex') {
      try {
        const yandexUrl = `https://api.music.yandex.net/search?text=${encodeURIComponent(q)}&type=track&page=0`;
        const resp = await fetch(yandexUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          signal: AbortSignal.timeout(3500)
        });
        if (resp.ok) {
          const data = await resp.json();
          const items = data?.result?.tracks?.results || [];
          items.slice(0, 12).forEach(item => {
            const artists = (item.artists || []).map(a => a.name).join(', ');
            const coverUri = item.ogImage || '';
            const coverUrl = coverUri ? `https://${coverUri.replace('%%', '300x300')}` : '';
            const albums = item.albums || [];
            const albumTitle = albums[0]?.title || '';
            const year = albums[0]?.year ? String(albums[0].year) : '2025';

            results.push({
              id: `yandex-${item.id}`,
              title: item.title,
              artist: artists || 'Яндекс.Музыка',
              album: albumTitle,
              year: year,
              source: 'yandex',
              duration: Math.round((item.durationMs || 180000) / 1000),
              cover: coverUrl,
              audioUrl: ''
            });
          });
        }
      } catch (err) {
        console.error('[Search] Yandex error:', err.message);
      }
    }

    // 3. Fallback
    if (results.length === 0 && source !== 'all') {
      try {
        const dzUrl = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15`;
        const resp = await fetch(dzUrl, { signal: AbortSignal.timeout(3500) });
        if (resp.ok) {
          const data = await resp.json();
          (data.data || []).forEach(item => {
            results.push({
              id: `${source}-${item.id}`,
              title: item.title,
              artist: item.artist?.name || '',
              album: item.album?.title || '',
              year: '2024',
              source: source,
              duration: item.duration || 180,
              cover: item.album?.cover_medium || item.artist?.picture_medium || '',
              audioUrl: item.preview || ''
            });
          });
        }
      } catch(e) {}
    }

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(JSON.stringify({ results }));
  }

  // Раздача статики
  let filePath = path.join(DIRECTORY, parsed.pathname === '/' ? 'index.html' : parsed.pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Server error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log('=================================================');
  console.log(`  Wavify Node Server запущен!`);
  console.log(`  Адрес: http://localhost:${PORT}`);
  console.log('=================================================');
});
