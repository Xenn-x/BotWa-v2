const { start } = require('./connection');

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
