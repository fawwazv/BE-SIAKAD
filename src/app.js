require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');

const app = express();

// Middleware dasar
app.use(cors());
app.use(express.json()); // Wajib agar Express bisa membaca request berbentuk JSON

// Daftarkan routing
app.use('/api', authRoutes);

const PORT = process.env.PORT || 3000;

// Bagian ini yang membuat server "hidup" terus-menerus
app.listen(PORT, () => {
  console.log(`Server Backend SIAKAD jalan di port ${PORT}`);
});