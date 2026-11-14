# Kasir TB. Qeela Jaya Tama

Aplikasi kasir toko bangunan berbentuk PWA (bisa di-install di HP/laptop), **jalan offline** dan **sinkron online** lewat Firebase.

## Fitur tahap 1
1. **Kasir**: cari nama barang, scan barcode (kamera atau scanner USB/Bluetooth), multi-satuan, ubah harga per item, diskon.
2. **Pembayaran**: Tunai (hitung kembalian + tombol pecahan uang), Transfer/QRIS, Bon (hutang) + DP.
3. **Nota**: kirim ke WhatsApp (gambar atau teks), unduh gambar, cetak/PDF ukuran 58mm (siap untuk printer thermal nanti).
4. **Barang & harga**: multi-satuan (mis. paku per kg & per dus), barcode per satuan, buat barcode toko (EAN-13 awalan 2x), cetak label barcode A4, cetak daftar harga, peringatan stok menipis.
5. **Stok**: barang masuk (supplier opsional), barang keluar (rusak/retur/pakai sendiri), tombol "Sesuaikan stok" cepat, riwayat mutasi. Stok boleh minus (hanya peringatan).
6. **Bon pelanggan**: daftar piutang, riwayat bon & cicilan, terima pembayaran, kirim pengingat via WA.
7. **Laporan**: omzet per periode, per metode bayar, uang tunai masuk laci, barang terlaris, daftar transaksi + pembatalan (stok kembali otomatis).
8. **Riwayat aktivitas** (khusus pemilik): ubah harga, diskon, batal, bon, stok — siapa & kapan.
9. **Pengguna**: pemilik + kasir, login email; kasir mendaftar sendiri lalu disetujui pemilik.
10. **Backup/pulihkan** data (JSON).

## Menjalankan
```bash
npm install
npm run dev      # pengembangan
npm run build    # hasil di folder dist/ — upload ke Netlify / Vercel / Firebase Hosting
```
PWA (offline & kamera) butuh **HTTPS**, jadi pakai hosting di atas (semuanya gratis untuk skala toko).

## Mode data
- **Mode lokal** (bawaan, tanpa setup): data di perangkat itu saja. Cocok untuk mencoba.
- **Mode online** (Firebase): beberapa perangkat, login pemilik/kasir. Saat internet putus, transaksi tetap tersimpan di perangkat dan otomatis terkirim saat online.

## Menyambungkan Firebase (sekali saja, ±10 menit)
1. Buka https://console.firebase.google.com → **Add project** (Google Analytics boleh dimatikan).
2. **Build → Authentication → Get started → Email/Password → Enable**.
3. **Build → Firestore Database → Create database** → pilih lokasi `asia-southeast2 (Jakarta)` → mode production.
4. Tab **Rules** → tempel isi `firestore.rules` → **Publish**.
5. **Project settings (⚙) → Your apps → Web (</>)** → daftarkan app → salin `firebaseConfig`.
6. Di aplikasi: **Lainnya → Pengaturan → Database online** → tempel config → Sambungkan.
   (Atau isi `.env` dari `.env.example` lalu build ulang.)
7. Klik **Daftar** — pendaftar pertama otomatis jadi **pemilik**.
8. Kasir: buka aplikasi di HP-nya → Daftar → pemilik mengubah haknya menjadi **kasir** di menu Pengguna.
9. Pindah data dari mode lokal: di mode lokal **Unduh backup** → setelah tersambung online, **Pulihkan dari file**.

## Struktur kode
- `src/lib/backend.ts` — lapisan data (Dexie/IndexedDB untuk lokal, Firestore + cache offline untuk online)
- `src/lib/store.tsx` — state & aksi (checkout, stok, bon, log)
- `src/lib/nota.ts` — format nota 32 kolom (58mm), gambar PNG, WA, cetak
- `src/pages/*` — Kasir, Barang, Stok, Bon, Lainnya

## Rencana tahap berikutnya
- Impor barang dari Excel
- Cetak langsung ke printer thermal Bluetooth (ESC/POS)
- Laporan ekspor Excel/PDF
