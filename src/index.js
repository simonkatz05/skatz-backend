const { port } = require('./config/env');
const app = require('./app');

app.listen(port, () => {
  console.log(`Skatz backend listening on port ${port}`);
});
