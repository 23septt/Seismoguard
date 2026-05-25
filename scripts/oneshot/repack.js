const fs = require('fs');
const path = require('path');
const JSZip = require('./node_modules/jszip');

const unpackedDir = `${__dirname}/unpacked`;
const outputPath = `${__dirname}/รูปเล่มโครงงานเสด_new.docx`;

const zip = new JSZip();

function addDirToZip(zip, baseDir, currentDir) {
  const items = fs.readdirSync(currentDir);
  for (const item of items) {
    const fullPath = path.join(currentDir, item);
    const zipPath = path.relative(baseDir, fullPath).split(path.sep).join('/');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      addDirToZip(zip, baseDir, fullPath);
    } else {
      const content = fs.readFileSync(fullPath);
      zip.file(zipPath, content);
    }
  }
}

addDirToZip(zip, unpackedDir, unpackedDir);

zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  .then(buf => {
    fs.writeFileSync(outputPath, buf);
    console.log('Written to:', outputPath, 'size:', buf.length, 'bytes');
  });
