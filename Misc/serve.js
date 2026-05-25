const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = process.env.PORT || 5500;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.css':  'text/css',
  '.png':  'image/png',
};

http.createServer((req, res) => {
  const reqPath = req.url.split('?')[0];
  let filePath = path.join(ROOT, reqPath === '/' ? 'blackmystery.html' : reqPath);
  const ext = path.extname(filePath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + req.url + ' | ROOT=' + ROOT + ' | path=' + filePath + ' | err=' + err.code); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
}).listen(PORT, () => console.log('Serving ' + ROOT + ' on port ' + PORT));
