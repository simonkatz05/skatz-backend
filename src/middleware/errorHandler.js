const { isDev } = require('../config/env');

const PG_ERRORS = {
  '23505': { status: 409, message: 'A record with that value already exists.' },
  '23503': { status: 400, message: 'Referenced record does not exist.' },
  '23502': { status: 400, message: 'A required field is missing.' },
  '22P02': { status: 400, message: 'Invalid input format.' },
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (isDev) console.error(err);

  if (err.code && PG_ERRORS[err.code]) {
    const { status, message } = PG_ERRORS[err.code];
    return res.status(status).json({ error: message });
  }

  const status = err.status || err.statusCode || 500;
  const message = isDev ? err.message : status < 500 ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
}

module.exports = errorHandler;
