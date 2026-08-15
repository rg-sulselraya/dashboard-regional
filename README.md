# Dashboard Presensi Siswa Sulsel Raya

Versi ini siap diunggah ke Netlify.

## Deploy

1. Buka Netlify.
2. Buat site baru.
3. Upload folder `presensi-dashboard-netlify`.
4. Setelah deploy, buka URL site Netlify.

Tombol Refresh mengambil data terbaru dari Google Sheets lewat Netlify Function:

`/.netlify/functions/sheet`

Workflow GitHub Actions juga memperbarui `attendance-data.js` dan `drill-data.js` dari sumber Sheet yang sama.
