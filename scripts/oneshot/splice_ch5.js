const fs = require('fs');

const docPath = `${__dirname}/unpacked/word/document.xml`;
const newXmlPath = `${__dirname}/ch5_new.xml`;

const doc = fs.readFileSync(docPath, 'utf8');
const newXml = fs.readFileSync(newXmlPath, 'utf8');

// Start: first body paragraph of Ch5 (after chapter title + blank)
const startMarker = '<w:p w14:paraId="639B80F2" w14:textId="6091E889"';

// End: first blank paragraph after last body paragraph — keep from here onward
const endMarker = '<w:p w14:paraId="38BE9F61" w14:textId="580B02E2"';

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
