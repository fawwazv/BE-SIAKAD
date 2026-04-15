const express = require('express');
const { loginAdmin } = require('../controllers/authController');

const router = express.Router();

// Endpoint publik untuk proses login admin
router.post('/admin/login', loginAdmin);

module.exports = router;