// scripts/fixPromiseController.js
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../controllers/promiseController.js');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Change the import
content = content.replace(
  "const Promise = require('../models/Promise');",
  "const PromiseModel = require('../models/Promise');"
);

// 2. Change Promise. to PromiseModel. (but not Promise.all)
content = content.replace(/Promise\.(?!all\b)/g, 'PromiseModel.');

// 3. For Promise.all, use global.Promise.all
content = content.replace(
  /await Promise\.all\(\[/g,
  'await global.Promise.all(['
);

// 4. Also fix any Promise.create or Promise.find references
content = content.replace(/Promise\.(create|find|countDocuments|findOne)/g, 'PromiseModel.$1');

// 5. Save the file
fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Fixed promiseController.js');