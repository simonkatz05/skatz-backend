const multer = require('multer');
const { uploadMaxSizeMb } = require('../config/env');

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: uploadMaxSizeMb * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.originalname.endsWith('.apkg')) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only .apkg files are accepted'), { status: 400 }));
    }
  },
});

module.exports = upload;
