const { HeaderGenerator, PRESETS } = require('header-generator');

const headerGenerator = new HeaderGenerator({
  ...PRESETS.MODERN_DESKTOP,
  locales: ['en-US', 'en'],
});

const generatedHeaderSets = Array.from({ length: 50 }, () => headerGenerator.getHeaders());

module.exports = generatedHeaderSets;

// Write the generated headers to a file
const fs = require('fs');

const headersContent = `const generatedHeaderSets = ${JSON.stringify(generatedHeaderSets, null, 2)};

module.exports = generatedHeaderSets;`;

fs.writeFileSync('src/headers.js', headersContent, 'utf8');

console.log('Headers have been written to headers.js');
