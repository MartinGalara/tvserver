const server = require('./src/app.js');
require('dotenv').config();
const { PORT } = process.env;

// Syncing all the models at once.
  server.listen(PORT, () => {
    console.log('%working'); // eslint-disable-line no-console
    console.log(PORT);
  });