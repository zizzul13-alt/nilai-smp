# 📚 Aplikasi Web Asisten Pengajar SMP

Aplikasi Web modern berbasis **Streamlit** yang dirancang khusus untuk mempermudah guru SMP dalam mengelola administrasi kelas, merekap nilai secara fleksibel (ramah HP/touchscreen), menyusun jadwal mengajar semesteran, hingga menyusun perangkat pembelajaran (RPP, Modul Ajar, LKPD) secara otomatis menggunakan teknologi **AI (Groq/LLaMA)**.

---

## ✨ Fitur Utama

1. **🏠 Dashboard Analitik & Insights**
   * Metrik ringkas (Total Kelas, Siswa, Transaksi Nilai, Bank Soal).
   * Tampilan dinamis **Jadwal Mengajar Hari Ini**.
   * Grafik Analitik KKM yang menunjukkan rata-rata nilai kelas dan persentase ketuntasan belajar siswa.

2. **📝 Input Nilai Rapel (Desktop & Mobile-Friendly)**
   * **Mode Tabel (Desktop):** Input cepat dengan spreadsheet interaktif yang responsif.
   * **Mode Kartu Touchscreen (HP):** Layout ramah sentuhan dengan tombol cepat `➕ 5` dan `➖ 5` untuk pengisian nilai yang praktis lewat HP.
   * **Dukungan Nilai Minus:** Mengizinkan input nilai dari `-50` hingga `100` (sangat berguna untuk rekap nilai sikap harian atau poin pelanggaran).

3. **📊 Lihat & Export Rekap Nilai**
   * Filter rekapitulasi berdasarkan Kategori Nilai, Semester, dan Topik.
   * Statistik performa belajar (rata-rata, nilai tertinggi, terendah, dan grafik distribusi pencapaian siswa).
   * Fitur **Export ke Excel** sekali klik yang langsung menghasilkan lembar rekap rapi siap cetak.

4. **📅 Kalender & Jadwal Mengajar**
   * Input jadwal mengajar harian secara manual.
   * **Generator Jadwal Semester Otomatis:** Cukup masukkan daftar bab beserta durasi minggunya, aplikasi akan menyusun jadwal mingguan secara otomatis dalam satu semester.
   * Mode hapus yang aman dan sistem konfirmasi visual anti-salah-klik.

5. **📖 Bank Soal & Materi**
   * Pencarian bank soal berdasarkan kelas, kata kunci, dan tag (UH, UTS, UAS, Tugas, Materi, dsb).
   * Manajemen database soal harian untuk mempermudah pembuatan paket ujian.

6. **📁 Dokumen Pembelajaran & AI Generator**
   * Unggah dokumen pembelajaran (PDF, Word, Excel, Gambar) dengan **fitur kompresi otomatis** untuk menghemat ruang penyimpanan.
   * **Integrasi AI (Groq):** Membuat RPP, Modul Ajar, LKPD, dan Materi secara instan dengan pilihan model AI tercanggih (seperti LLaMA 3.3).

7. **⚙️ Pengaturan Kelas, Siswa, & KKM**
   * Pengelolaan kelas dan penambahan data siswa secara massal (*copy-paste* daftar nama).
   * Deteksi otomatis untuk mencegah nama atau kelas duplikat (sensitivitas huruf kapital diabaikan).
   * Pengaturan batas KKM khusus untuk setiap kategori nilai.

---

## 🛠️ Persyaratan Sistem & Instalasi

### 1. Prasyarat (Prerequisites)
Pastikan Anda sudah menginstal **Python 3.9** atau versi di atasnya di perangkat Anda.

### 2. Kloning Repository & Instalasi Dependensi
Jalankan perintah berikut di terminal Anda:
```bash
# Kloning repository ini
git clone https://github.com/username/asisten-pengajar-smp.git
cd asisten-pengajar-smp

# Instal library/paket Python yang diperlukan
pip install -r requirements.txt
```

### 3. Konfigurasi Kredensial (`.streamlit/secrets.toml`)
Aplikasi ini menggunakan **Supabase** sebagai basis data awan dan **Groq** sebagai penyedia kecerdasan buatan. Buat berkas baru bernama `secrets.toml` di dalam folder `.streamlit` pada direktori utama proyek Anda:

```toml
[supabase]
url = "https://proyek-supabase-anda.supabase.co"
key = "anon-key-dari-dashboard-supabase"

# Opsional: Untuk mengaktifkan fitur Pembuat Perangkat Pembelajaran dengan AI
groq_api_key = "gsk_xxxx..."
```

> **Catatan:** Format struktur tabel database dapat disesuaikan dengan skema tabel Supabase Anda (`kelas`, `siswa`, `jadwal`, `bank_soal`, `kkm`, `dokumen`, dan `nilai`).

---

## 🚀 Cara Menjalankan Aplikasi

Jalankan perintah berikut untuk memulai server Streamlit lokal:
```bash
streamlit run app.py
```
Aplikasi akan otomatis terbuka di peramban (browser) Anda pada alamat default: `http://localhost:8501`.

---

## 🎨 Teknologi yang Digunakan
* **Streamlit** (Framework UI Interaktif)
* **Supabase** (Database real-time & Cloud Storage)
* **LangChain & Groq (LLaMA/Gemma)** (Mesin AI Pembuat RPP)
* **Pandas & OpenPyXL** (Pengolahan data & Export Excel)
* **PyPDF2 & Filetype** (Kompresi file & Manajemen Dokumen)

---
*Dibuat dengan ❤️ untuk kemudahan administrasi Guru-Guru Hebat Indonesia!*
