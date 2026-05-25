const fs = require('fs');

const docPath = `${__dirname}/unpacked/word/document.xml`;
const newXmlPath = `${__dirname}/ch2_new.xml`;

const doc = fs.readFileSync(docPath, 'utf8');
const newXml = fs.readFileSync(newXmlPath, 'utf8');

// Anchor: start of the 2.2.1 heading paragraph (unique paraId)
const startMarker = '<w:p w14:paraId="0B000201" w14:textId="0B000201" w:rsidR="00EE5566" w:rsidRDefault="00EE5566" w:rsidP="005B123C">';

// Anchor: start of the 2.3 สรุป heading paragraph (unique paraId)
const endMarker = '<w:p w14:paraId="0B000400" w14:textId="0B000400" w:rsidR="00EE5566" w:rsidRDefault="00EE5566" w:rsidP="005B123C">';

const startIdx = doc.indexOf(startMarker);
const endIdx   = doc.indexOf(endMarker);

if (startIdx === -1) { console.error('ERROR: startMarker not found'); process.exit(1); }
if (endIdx   === -1) { console.error('ERROR: endMarker not found');   process.exit(1); }
if (endIdx <= startIdx) { console.error('ERROR: endMarker before startMarker'); process.exit(1); }

const before = doc.slice(0, startIdx);
const after  = doc.slice(endIdx);

const result = before + newXml + '\n' + after;

fs.writeFileSync(docPath, result, 'utf8');
console.log('Spliced OK. Removed chars:', endIdx - startIdx, '  New chars:', newXml.length);
console.log('Doc length before:', doc.length, '  after:', result.length);
