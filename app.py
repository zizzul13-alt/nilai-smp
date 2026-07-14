import streamlit as st
import pandas as pd
from supabase import create_client, Client
from datetime import datetime, date
import openpyxl
from io import BytesIO
import re
import io
from PIL import Image
import PyPDF2
import filetype

# ===== TAMBAHKAN INI UNTUK GROQ =====
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# ============ KONFIGURASI ============
st.set_page_config(
    page_title="Asisten Pengajar SMP",
    page_icon="📚",
    layout="wide",  # Bisa ganti ke "centered" kalau mau
    initial_sidebar_state="expanded"
)

# ============ CSS KHUSUS HP ============
st.markdown("""
<style>
    /* Perbaikan tampilan HP */
    @media only screen and (max-width: 768px) {
        .stApp {
            font-size: 16px !important;
        }
        h1 {
            font-size: 24px !important;
        }
        h2 {
            font-size: 20px !important;
        }
        h3 {
            font-size: 18px !important;
        }
        .stButton button {
            font-size: 16px !important;
            padding: 12px 24px !important;
            width: 100% !important;
        }
        .stTextInput input, 
        .stSelectbox select,
        .stNumberInput input {
            font-size: 16px !important;
            padding: 12px !important;
        }
        .stTextArea textarea {
            font-size: 16px !important;
            padding: 12px !important;
        }
        .stDataFrame {
            font-size: 14px !important;
        }
        .stDataFrame table {
            font-size: 14px !important;
        }
        .stMetric {
            font-size: 18px !important;
        }
        .stRadio label {
            font-size: 16px !important;
            padding: 8px !important;
        }
        .stTabs button {
            font-size: 14px !important;
            padding: 10px 16px !important;
        }
        /* Sidebar lebih lebar di HP */
        .css-1d391kg {
            width: 280px !important;
        }
    }
    @media only screen and (max-width: 480px) {
        .stApp {
            font-size: 14px !important;
        }
        h1 {
            font-size: 20px !important;
        }
        h2 {
            font-size: 17px !important;
        }
        .stButton button {
            font-size: 14px !important;
            padding: 10px 16px !important;
        }
        .stDataFrame {
            font-size: 12px !important;
        }
    }
    /* Tampilan lebih rapi */
    .stAlert {
        font-size: 14px !important;
    }
    .stSuccess {
        font-size: 14px !important;
    }
</style>
""", unsafe_allow_html=True)

# ============ INISIALISASI SUPABASE ============
@st.cache_resource
def init_supabase():
    url = st.secrets["supabase"]["url"]
    key = st.secrets["supabase"]["key"]
    return create_client(url, key)

supabase = init_supabase()

# ============ FUNGSI DATABASE DENGAN CACHE ============
@st.cache_data(ttl=300)
def get_kelas():
    response = supabase.table("kelas").select("*").order("nama_kelas").execute()
    return response.data

@st.cache_data(ttl=300)
def get_siswa(kelas_id=None):
    query = supabase.table("siswa").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    return query.execute().data

@st.cache_data(ttl=300)
def get_jadwal(kelas_id=None):
    query = supabase.table("jadwal").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    return query.execute().data

@st.cache_data(ttl=300)
def get_bank_soal(kelas_id=None, keyword=None):
    query = supabase.table("bank_soal").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    if keyword:
        query = query.text_search("soal_materi", f"{keyword}")
    return query.execute().data

@st.cache_data(ttl=300)
def get_kkm(kelas_id=None, kategori=None):
    query = supabase.table("kkm").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    if kategori:
        query = query.eq("kategori", kategori)
    return query.execute().data

@st.cache_data(ttl=300)
def get_dokumen(kelas_id=None, jenis=None):
    query = supabase.table("dokumen").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    if jenis:
        query = query.eq("jenis", jenis)
    return query.execute().data

@st.cache_data(ttl=60)
def get_nilai(kelas_id=None, kategori=None, topik=None):
    query = supabase.table("nilai").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    if kategori:
        query = query.eq("kategori", kategori)
    if topik:
        query = query.eq("topik", topik)
    return query.execute().data

def clear_cache():
    st.cache_data.clear()

# ============ FUNGSI KOMPRES FILE ============
def compress_file(file_bytes, file_name):
    """
    Kompres file sebelum upload ke Supabase
    """
    try:
        # Deteksi tipe file menggunakan filetype
        kind = filetype.guess(file_bytes)
        
        if kind is None:
            # Jika tidak terdeteksi, coba dari ekstensi
            ext = file_name.split('.')[-1].lower()
            if ext in ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']:
                file_type = 'image'
            elif ext == 'pdf':
                file_type = 'application/pdf'
            else:
                file_type = 'other'
        else:
            mime = kind.mime
            if mime.startswith('image/'):
                file_type = 'image'
            elif mime == 'application/pdf':
                file_type = 'application/pdf'
            else:
                file_type = 'other'
        
        # Jika file kecil (< 10 MB), tidak perlu kompres
        if len(file_bytes) < 10 * 1024 * 1024:
            return file_bytes, file_name
        
        # === KOMPRES GAMBAR ===
        if file_type == 'image':
            try:
                # Buka gambar
                image = Image.open(io.BytesIO(file_bytes))
                
                # Resize jika terlalu besar
                max_size = (1920, 1080)
                if image.size[0] > max_size[0] or image.size[1] > max_size[1]:
                    image.thumbnail(max_size, Image.Resampling.LANCZOS)
                
                # Simpan dengan kualitas 75%
                output = io.BytesIO()
                if image.format == 'PNG':
                    image.save(output, format='PNG', optimize=True)
                else:
                    image.save(output, format='JPEG', quality=75, optimize=True)
                
                compressed = output.getvalue()
                
                # Jika masih > 50 MB, kompres lebih agresif
                if len(compressed) > 50 * 1024 * 1024:
                    output = io.BytesIO()
                    # Konversi ke JPEG dengan kualitas 50
                    if image.mode in ('RGBA', 'LA', 'P'):
                        image = image.convert('RGB')
                    image.save(output, format='JPEG', quality=50, optimize=True)
                    compressed = output.getvalue()
                
                # Ubah nama file
                new_name = f"compressed_{file_name}"
                if not new_name.lower().endswith(('.jpg', '.jpeg', '.png')):
                    new_name = new_name.rsplit('.', 1)[0] + '.jpg'
                
                return compressed, new_name
                
            except Exception as e:
                st.warning(f"⚠️ Gagal kompres gambar: {str(e)}. Upload original.")
                return file_bytes, file_name
        
        # === KOMPRES PDF ===
        elif file_type == 'application/pdf':
            try:
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
                pdf_writer = PyPDF2.PdfWriter()
                
                # Salin semua halaman dengan kompresi
                for  in pdf_reader.s:
                    try:
                        .compress_content_streams()
                    except:
                        pass
                    pdf_writer.add_page(page)
                
                output = io.BytesIO()
                pdf_writer.write(output)
                compressed = output.getvalue()
                
                new_name = f"compressed_{file_name}"
                return compressed, new_name
                
            except Exception as e:
                st.warning(f"⚠️ Gagal kompres PDF: {str(e)}. Upload original.")
                return file_bytes, file_name
        
        # === FILE LAIN ===
        else:
            if len(file_bytes) > 50 * 1024 * 1024:
                st.warning(f"⚠️ File {file_name} berukuran {len(file_bytes)/1024/1024:.1f} MB > 50 MB.")
                return None, None
            return file_bytes, file_name
            
    except Exception as e:
        st.error(f"❌ Error kompres file: {str(e)}")
        return file_bytes, file_name

# ============ FUNGSI UPLOAD DOKUMEN ============
def upload_file_to_supabase(file_bytes, file_name):
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        unique_filename = f"{timestamp}_{file_name}"
        
        response = supabase.storage.from_("dokumen").upload(
            unique_filename,
            file_bytes,
            {"content-type": "application/octet-stream"}
        )
        
        public_url = supabase.storage.from_("dokumen").get_public_url(unique_filename)
        return public_url
    except Exception as e:
        st.error(f"❌ Gagal upload file: {str(e)}")
        return None

# ============ FUNGSI GENERATE JADWAL ============
def generate_jadwal_semester(kelas_id, hari, jam, topik_awal, bab_awal, semester, tahun_ajaran, jumlah_minggu=16):
    """
    Generate jadwal otomatis untuk 1 semester
    """
    try:
        # Mapping hari ke angka (untuk urutan)
        hari_map = {
            "Senin": 0, "Selasa": 1, "Rabu": 2, "Kamis": 3, 
            "Jumat": 4, "Sabtu": 5, "Minggu": 6
        }
        
        # Daftar topik untuk 16 minggu (sesuaikan dengan mata pelajaran Anda)
        topik_list = [
            f"{topik_awal} - Bab {bab_awal}",
            f"{topik_awal} - Bab {bab_awal + 1}",
            f"{topik_awal} - Bab {bab_awal + 2}",
            f"{topik_awal} - Bab {bab_awal + 3}",
            f"Review & Latihan Soal",
            f"UH {topik_awal}",
            f"{topik_awal} - Bab {bab_awal + 4}",
            f"{topik_awal} - Bab {bab_awal + 5}",
            f"{topik_awal} - Bab {bab_awal + 6}",
            f"Review & Latihan Soal",
            f"UH {topik_awal}",
            f"UTS {topik_awal}",
            f"{topik_awal} - Bab {bab_awal + 7}",
            f"{topik_awal} - Bab {bab_awal + 8}",
            f"Review & UAS",
            f"UAS {topik_awal}"
        ]
        
        # Jika hanya 16 minggu, potong
        if len(topik_list) > jumlah_minggu:
            topik_list = topik_list[:jumlah_minggu]
        
        # Generate jadwal
        jadwal_insert = []
        for minggu in range(1, jumlah_minggu + 1):
            # Topik untuk minggu ini
            topik = topik_list[minggu - 1] if minggu - 1 < len(topik_list) else f"Bab {bab_awal + minggu - 1}"
            
            jadwal_insert.append({
                "kelas_id": kelas_id,
                "hari": hari,
                "jam": str(jam),
                "topik": topik,
                "bab": f"Bab {bab_awal + minggu - 1}",
                "minggu_ke": minggu,
                "semester": semester,
                "tahun_ajaran": tahun_ajaran,
                "is_generated": True
            })
        
        return jadwal_insert
    except Exception as e:
        st.error(f"Error generate jadwal: {str(e)}")
        return None
# ============ FUNGSI UTILITY ============
def hari_ke_angka(hari):
    hari_map = {
        "Senin": 0, "Selasa": 1, "Rabu": 2, "Kamis": 3, 
        "Jumat": 4, "Sabtu": 5, "Minggu": 6
    }
    return hari_map.get(hari, 0)

# Tambahkan fungsi ini untuk jam
def jam_ke_string(jam):
    if isinstance(jam, str):
        return jam
    return jam.strftime("%H:%M")

# ============ FUNGSI PROMPT AI ============
def create_prompt_ai(jenis_dokumen, mata_pelajaran, topik, kelas, tujuan, kd, waktu):
    """Membuat prompt untuk AI berdasarkan jenis dokumen"""
    
    if jenis_dokumen == "RPP":
        return f"""
Buatkan RPP (Rencana Pelaksanaan Pembelajaran) dengan format lengkap untuk:

Mata Pelajaran: {mata_pelajaran}
Kelas: {kelas}
Topik: {topik}
Alokasi Waktu: {waktu} JP

Tujuan Pembelajaran:
{tujuan if tujuan else 'Sesuaikan dengan topik'}

Kompetensi Dasar:
{kd if kd else 'Sesuaikan dengan topik'}

Format RPP yang diminta:
1. Identitas Sekolah
2. Kompetensi Inti
3. Kompetensi Dasar & Indikator
4. Tujuan Pembelajaran
5. Materi Pembelajaran
6. Metode Pembelajaran
7. Media & Sumber Belajar
8. Langkah-langkah Kegiatan (Pendahuluan, Inti, Penutup)
9. Penilaian (Sikap, Pengetahuan, Keterampilan)

Buat dengan bahasa yang jelas, profesional, dan siap pakai!
"""
    
    elif jenis_dokumen == "Modul Ajar":
        return f"""
Buatkan Modul Ajar untuk:

Mata Pelajaran: {mata_pelajaran}
Kelas: {kelas}
Topik: {topik}

Tujuan Pembelajaran:
{tujuan if tujuan else 'Sesuaikan dengan topik'}

Format Modul Ajar:
1. Pendahuluan (Apersepsi, Motivasi)
2. Uraian Materi (lengkap dan terstruktur)
3. Rangkuman
4. Latihan Soal (minimal 5 soal)
5. Kunci Jawaban
6. Daftar Pustaka

Buat dengan bahasa yang mudah dipahami siswa!
"""
    
    elif jenis_dokumen == "LKPD":
        return f"""
Buatkan LKPD (Lembar Kerja Peserta Didik) untuk:

Mata Pelajaran: {mata_pelajaran}
Kelas: {kelas}
Topik: {topik}

Tujuan Pembelajaran:
{tujuan if tujuan else 'Sesuaikan dengan topik'}

Format LKPD:
1. Judul LKPD
2. Petunjuk Pengerjaan
3. Tujuan Pembelajaran
4. Alat dan Bahan (jika ada)
5. Langkah-langkah Kegiatan
6. Tabel/Data Pengamatan
7. Pertanyaan Diskusi (minimal 5 pertanyaan)
8. Kesimpulan

Buat LKPD yang interaktif dan mudah dikerjakan siswa!
"""
    
    else:  # Materi
        return f"""
Buatkan Materi Pembelajaran untuk:

Mata Pelajaran: {mata_pelajaran}
Kelas: {kelas}
Topik: {topik}

Format Materi:
1. Pendahuluan (latar belakang)
2. Uraian Materi (lengkap, terstruktur, dengan contoh)
3. Ilustrasi/Diagram (deskripsikan)
4. Rangkuman
5. Latihan Soal (minimal 5)
6. Kunci Jawaban

Buat materi yang menarik dan mudah dipahami!
"""

# ============ SIDEBAR NAVIGASI ============
st.sidebar.title("📚 Menu Guru")
st.sidebar.markdown("---")

menu = st.sidebar.radio(
    "Pilih Fitur",
    [
        "🏠 Dashboard",
        "📝 Input Nilai Rapel",
        "📊 Lihat & Export Nilai",
        "📅 Kalender & Jadwal",
        "📖 Bank Soal & Materi",
        "📁 Dokumen Pembelajaran",
        "⚙️ Pengaturan Kelas & Siswa"
    ]
)

# ============ HALAMAN: DASHBOARD ============
def page_dashboard():
    st.title("🏠 Dashboard Guru")
    
    cols = st.columns(4)
    kelas = get_kelas()
    total_kelas = len(kelas)
    
    total_siswa = 0
    for k in kelas:
        siswa = get_siswa(k['id'])
        total_siswa += len(siswa)
    
    nilai = get_nilai()
    total_nilai = len(nilai)
    soal = get_bank_soal()
    total_soal = len(soal)
    
    with cols[0]:
        st.metric("Total Kelas", total_kelas)
    with cols[1]:
        st.metric("Total Siswa", total_siswa)
    with cols[2]:
        st.metric("Total Nilai", total_nilai)
    with cols[3]:
        st.metric("Total Soal", total_soal)
    
    st.markdown("---")
    st.subheader("📅 Jadwal Hari Ini")
    
    hari_ini = date.today().strftime("%A")
    hari_ini_ind = {
        "Monday": "Senin", "Tuesday": "Selasa", "Wednesday": "Rabu",
        "Thursday": "Kamis", "Friday": "Jumat", "Saturday": "Sabtu",
        "Sunday": "Minggu"
    }.get(hari_ini, hari_ini)
    
    jadwal_hari_ini = []
    for k in kelas:
        jadwal = get_jadwal(k['id'])
        for j in jadwal:
            if j['hari'] == hari_ini_ind:
                jadwal_hari_ini.append({
                    "Kelas": k['nama_kelas'],
                    "Jam": j['jam'],
                    "Topik": j['topik'],
                    "Bab": j['bab']
                })
    
    if jadwal_hari_ini:
        df = pd.DataFrame(jadwal_hari_ini)
        df = df.sort_values("Jam")
        st.dataframe(df, use_container_width=True, hide_index=True)
    else:
        st.info(f"Tidak ada jadwal untuk hari {hari_ini_ind}")

# ============ HALAMAN: INPUT NILAI RAPEL ============
def page_input_nilai():
    st.title("📝 Input Nilai Rapel")
    
    kelas = get_kelas()
    if not kelas:
        st.warning("Belum ada kelas. Silahkan tambah kelas di menu Pengaturan.")
        return
    
    kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
    kelas_terpilih = st.selectbox("Pilih Kelas", list(kelas_options.keys()))
    kelas_id = kelas_options[kelas_terpilih]
    
    with st.form("form_nilai"):
        cols = st.columns(4)
        kategori = cols[0].selectbox(
            "Kategori", 
            ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]
        )
        topik = cols[1].text_input("Topik")
        bab = cols[2].text_input("Bab")
        semester = cols[3].selectbox("Semester", [1, 2])
        tanggal = st.date_input("Tanggal", value=date.today())
        
        st.markdown("---")
        
        siswa = get_siswa(kelas_id)
        if not siswa:
            st.warning("Belum ada siswa di kelas ini.")
            st.form_submit_button("Simpan", disabled=True)
            return
        
        st.subheader(f"📋 Daftar Siswa Kelas {kelas_terpilih}")
        
        data = []
        for s in siswa:
            data.append({
                "Nama": s['nama'],
                "Nilai": 0.0,
                "Catatan": ""
            })
        
        df_input = pd.DataFrame(data)
        edited_df = st.data_editor(
            df_input,
            column_config={
                "Nama": st.column_config.TextColumn("Nama Siswa", disabled=True),
                "Nilai": st.column_config.NumberColumn(
                    "Nilai",
                    min_value=0,
                    max_value=100,
                    step=0.5,
                    format="%.1f"
                ),
                "Catatan": st.column_config.TextColumn("Catatan")
            },
            hide_index=True,
            use_container_width=True
        )
        
        submit = st.form_submit_button("💾 Simpan Semua Nilai")
    
    if submit:
        try:
            saved = 0
            for idx, row in edited_df.iterrows():
                if row['Nilai'] > 0:
                    supabase.table("nilai").insert({
                        "siswa_id": siswa[idx]['id'],
                        "kelas_id": kelas_id,
                        "kategori": kategori,
                        "nilai": row['Nilai'],
                        "topik": topik,
                        "bab": bab,
                        "tanggal": str(tanggal),
                        "semester": semester,
                        "catatan": row['Catatan'] if row['Catatan'] else None
                    }).execute()
                    saved += 1
            
            clear_cache()
            st.success(f"✅ Berhasil menyimpan {saved} nilai!")
            st.balloons()
        except Exception as e:
            st.error(f"❌ Gagal menyimpan: {str(e)}")

# ============ HALAMAN: LIHAT & EXPORT NILAI ============
def page_lihat_nilai():
    st.title("📊 Lihat & Export Nilai")
    
    kelas = get_kelas()
    if not kelas:
        st.warning("Belum ada kelas.")
        return
    
    kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
    kelas_terpilih = st.selectbox("Pilih Kelas", list(kelas_options.keys()))
    kelas_id = kelas_options[kelas_terpilih]
    
    cols = st.columns(4)
    kategori_filter = cols[0].selectbox(
        "Filter Kategori", 
        ["Semua", "Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]
    )
    semester_filter = cols[1].selectbox(
        "Filter Semester",
        ["Semua", 1, 2]
    )
    topik_filter = cols[2].text_input("Filter Topik")
    show_stats = cols[3].checkbox("Tampilkan Statistik", value=True)
    
    siswa = get_siswa(kelas_id)
    nilai = get_nilai(kelas_id)
    
    if not nilai:
        st.info("Belum ada data nilai untuk kelas ini.")
        return
    
    if kategori_filter != "Semua":
        nilai = [n for n in nilai if n['kategori'] == kategori_filter]
    if semester_filter != "Semua":
        nilai = [n for n in nilai if n.get('semester', 1) == semester_filter]
    if topik_filter:
        nilai = [n for n in nilai if topik_filter.lower() in n.get('topik', '').lower()]
    
    data = []
    for s in siswa:
        row = {"Nama": s['nama']}
        for kat in ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]:
            row[kat] = 0
        for n in nilai:
            if n['siswa_id'] == s['id']:
                row[n['kategori']] = n['nilai']
        data.append(row)
    
    df = pd.DataFrame(data)
    st.dataframe(df, use_container_width=True, hide_index=True)
    
    if show_stats and len(df) > 0:
        st.markdown("---")
        st.subheader("📊 Statistik Nilai")
        
        kategori_kolom = ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]
        existing_kolom = [k for k in kategori_kolom if k in df.columns]
        
        if existing_kolom:
            stats_data = []
            for kat in existing_kolom:
                values = df[kat][df[kat] > 0]
                if len(values) > 0:
                    stats_data.append({
                        "Kategori": kat,
                        "Rata-rata": round(values.mean(), 2),
                        "Tertinggi": values.max(),
                        "Terendah": values.min(),
                        "Jumlah Data": len(values)
                    })
            
            if stats_data:
                df_stats = pd.DataFrame(stats_data)
                st.dataframe(df_stats, use_container_width=True, hide_index=True)
                
                st.markdown("---")
                st.subheader("📈 Rata-rata per Kategori")
                chart_data = df_stats[['Kategori', 'Rata-rata']].set_index('Kategori')
                st.bar_chart(chart_data)
            else:
                st.info("Belum ada data nilai yang cukup untuk statistik.")
    
    st.markdown("---")
    if st.button("📥 Download Excel"):
        try:
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                df_ringkasan = df.copy()
                df_ringkasan.to_excel(writer, sheet_name="Ringkasan", index=False)
                
                detail_data = []
                for s in siswa:
                    for n in nilai:
                        if n['siswa_id'] == s['id']:
                            detail_data.append({
                                "Nama": s['nama'],
                                "Kategori": n['kategori'],
                                "Nilai": n['nilai'],
                                "Topik": n.get('topik', ''),
                                "Bab": n.get('bab', ''),
                                "Tanggal": n.get('tanggal', ''),
                                "Semester": n.get('semester', 1),
                                "Catatan": n.get('catatan', '')
                            })
                df_detail = pd.DataFrame(detail_data)
                df_detail.to_excel(writer, sheet_name="Detail", index=False)
            
            st.download_button(
                label="⬇️ Download File Excel",
                data=output.getvalue(),
                file_name=f"Nilai_{kelas_terpilih}_Semester_{semester_filter if semester_filter != 'Semua' else '1'}_{date.today()}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            st.success("File Excel siap didownload!")
        except Exception as e:
            st.error(f"❌ Gagal export: {str(e)}")

# ============ HALAMAN: KALENDER & JADWAL ============
def page_jadwal():
    st.title("📅 Kalender & Jadwal")
    
    kelas = get_kelas()
    if not kelas:
        st.warning("Belum ada kelas.")
        return
    
    kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
    
    # === TABS ===
    tab1, tab2, tab3 = st.tabs([
        "📋 Lihat Jadwal", 
        "➕ Tambah Manual", 
        "⚡ Generate Semester"
    ])
    
    # === TAB 1: LIHAT JADWAL ===
    with tab1:
        st.subheader("📋 Jadwal Mengajar")
        
        cols = st.columns(3)
        kelas_lihat = cols[0].selectbox(
            "Pilih Kelas", 
            ["Semua Kelas"] + list(kelas_options.keys())
        )
        filter_semester = cols[1].selectbox(
            "Filter Semester",
            ["Semua", 1, 2]
        )
        filter_minggu = cols[2].selectbox(
            "Filter Minggu",
            ["Semua"] + [f"Minggu {i}" for i in range(1, 17)]
        )
        
        jadwal = []
        if kelas_lihat == "Semua Kelas":
            for k in kelas:
                j = get_jadwal(k['id'])
                for item in j:
                    item['nama_kelas'] = k['nama_kelas']
                jadwal.extend(j)
        else:
            jadwal = get_jadwal(kelas_options[kelas_lihat])
            for item in jadwal:
                item['nama_kelas'] = kelas_lihat
        
        # Filter
        if filter_semester != "Semua":
            jadwal = [j for j in jadwal if j.get('semester', 1) == filter_semester]
        if filter_minggu != "Semua":
            minggu_ke = int(filter_minggu.split()[1])
            jadwal = [j for j in jadwal if j.get('minggu_ke', 0) == minggu_ke]
        
        if jadwal:
            df = pd.DataFrame(jadwal)
            df['hari_angka'] = df['hari'].apply(hari_ke_angka)
            df['jam_time'] = pd.to_datetime(df['jam'])
            df = df.sort_values(['hari_angka', 'jam_time'])
            
            df_display = df[['nama_kelas', 'hari', 'jam', 'topik', 'bab', 'minggu_ke', 'semester']]
            df_display.columns = ['Kelas', 'Hari', 'Jam', 'Topik', 'Bab', 'Minggu ke-', 'Semester']
            st.dataframe(df_display, use_container_width=True, hide_index=True)
            
            st.info(f"📊 Total {len(jadwal)} jadwal")
        else:
            st.info("Belum ada jadwal untuk kelas ini.")
    
    # === TAB 2: TAMBAH MANUAL ===
    with tab2:
        st.subheader("➕ Tambah Jadwal Manual")
        
        with st.form("form_jadwal"):
            cols = st.columns(3)
            kelas_terpilih = cols[0].selectbox("Pilih Kelas", list(kelas_options.keys()))
            hari = cols[0].selectbox("Hari", ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"])
            jam = cols[1].time_input("Jam")
            semester = cols[1].selectbox("Semester", [1, 2])
            topik = cols[2].text_input("Topik")
            bab = cols[2].text_input("Bab")
            minggu_ke = cols[2].number_input("Minggu ke-", min_value=1, max_value=20, value=1)
            
            submit = st.form_submit_button("Simpan Jadwal")
            
            if submit:
                try:
                    supabase.table("jadwal").insert({
                        "kelas_id": kelas_options[kelas_terpilih],
                        "hari": hari,
                        "jam": str(jam),
                        "topik": topik,
                        "bab": bab,
                        "minggu_ke": minggu_ke,
                        "semester": semester,
                        "tahun_ajaran": str(date.today().year),
                        "is_generated": False
                    }).execute()
                    clear_cache()
                    st.success("✅ Jadwal berhasil ditambahkan!")
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Gagal: {str(e)}")
    
    # === TAB 3: GENERATE MANUAL ===
    with tab3:
        st.subheader("⚡ Generate Jadwal 1 Semester")
        st.info("💡 Fitur ini akan membuat jadwal otomatis untuk 16 minggu (1 semester)")
        
        with st.form("form_generate"):
            cols = st.columns(2)
            kelas_gen = cols[0].selectbox("Kelas", list(kelas_options.keys()))
            hari_gen = cols[0].selectbox("Hari", ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"])
            jam_gen = cols[1].time_input("Jam Mulai", value=datetime.strptime("07:30", "%H:%M").time())
            semester_gen = cols[1].selectbox("Semester", [1, 2])
            
            st.markdown("---")
            st.subheader("📝 Setting Topik & Bab")
            
            cols2 = st.columns(2)
            topik_awal = cols2[0].text_input("Topik Awal", value="Matematika")
            bab_awal = cols2[1].number_input("Bab Awal", min_value=1, value=1)
            
            jumlah_minggu = st.slider("Jumlah Minggu", min_value=12, max_value=20, value=16)
            
            st.warning("⚠️ Periksa kembali data di atas. Jadwal yang sudah ada akan dihapus dan diganti!")
            
            submit_gen = st.form_submit_button("🚀 Generate Jadwal Semester", type="primary")
            
            if submit_gen:
                try:
                    kelas_id = kelas_options[kelas_gen]
                    tahun_ajaran = f"{date.today().year}/{date.today().year + 1}"
                    
                    # Hapus jadwal lama
                    jadwal_lama = get_jadwal(kelas_id)
                    for j in jadwal_lama:
                        if j.get('is_generated', False) and j.get('semester') == semester_gen:
                            supabase.table("jadwal").delete().eq("id", j['id']).execute()
                    
                    # Generate jadwal baru
                    jadwal_baru = generate_jadwal_semester(
                        kelas_id,
                        hari_gen,
                        jam_gen,
                        topik_awal,
                        bab_awal,
                        semester_gen,
                        tahun_ajaran,
                        jumlah_minggu
                    )
                    
                    if jadwal_baru:
                        for j in jadwal_baru:
                            supabase.table("jadwal").insert(j).execute()
                        
                        clear_cache()
                        st.success(f"✅ Berhasil generate {len(jadwal_baru)} jadwal untuk {kelas_gen}!")
                        st.balloons()
                        st.rerun()
                    
                except Exception as e:
                    st.error(f"❌ Gagal generate: {str(e)}")

# ============ HALAMAN: BANK SOAL & MATERI ============
def page_bank_soal():
    st.title("📖 Bank Soal & Materi")
    
    with st.expander("➕ Tambah Soal/Materi Baru", expanded=False):
        with st.form("form_soal"):
            kelas = get_kelas()
            if not kelas:
                st.warning("Belum ada kelas. Tambahkan kelas dulu.")
                st.form_submit_button("Simpan", disabled=True)
            else:
                kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
                
                cols = st.columns(2)
                kelas_terpilih = cols[0].selectbox("Kelas", list(kelas_options.keys()))
                topik = cols[0].text_input("Topik")
                tag = cols[1].selectbox(
                    "Tag", 
                    ["UH", "UTS", "UAS", "Remedial", "Pengayaan", "Quiz", "Tugas", "Materi"]
                )
                soal = st.text_area("Soal")
                jawaban = st.text_area("Jawaban")
                materi = st.text_area("Materi Terkait")
                
                submit = st.form_submit_button("Simpan Soal")
                
                if submit:
                    try:
                        supabase.table("bank_soal").insert({
                            "kelas_id": kelas_options[kelas_terpilih],
                            "soal": soal,
                            "jawaban": jawaban,
                            "materi": materi,
                            "topik": topik,
                            "tag": tag
                        }).execute()
                        clear_cache()
                        st.success("✅ Soal berhasil disimpan!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"❌ Gagal: {str(e)}")
    
    st.markdown("---")
    st.subheader("🔍 Cari Soal")
    
    kelas = get_kelas()
    kelas_options = {k['nama_kelas']: k['id'] for k in kelas} if kelas else {}
    
    cols = st.columns(3)
    cari_kelas = cols[0].selectbox("Kelas", ["Semua"] + list(kelas_options.keys()) if kelas else ["Semua"])
    cari_keyword = cols[1].text_input("Kata Kunci")
    cari_tag = cols[2].selectbox("Tag", ["Semua", "UH", "UTS", "UAS", "Remedial", "Pengayaan", "Quiz", "Tugas", "Materi"])
    
    if st.button("🔍 Cari", use_container_width=True):
        soal_data = []
        if cari_kelas != "Semua" and kelas:
            soal_data = get_bank_soal(kelas_options[cari_kelas])
        else:
            for k in kelas:
                soal_data.extend(get_bank_soal(k['id']))
        
        if cari_keyword:
            soal_data = [s for s in soal_data if 
                        cari_keyword.lower() in s.get('soal', '').lower() or
                        cari_keyword.lower() in s.get('materi', '').lower() or
                        cari_keyword.lower() in s.get('topik', '').lower()]
        
        if cari_tag != "Semua":
            soal_data = [s for s in soal_data if s.get('tag') == cari_tag]
        
        if soal_data:
            df = pd.DataFrame(soal_data)
            df_display = df[['topik', 'tag', 'soal', 'jawaban', 'materi']]
            st.dataframe(df_display, use_container_width=True, hide_index=True)
        else:
            st.info("Tidak ditemukan soal yang sesuai.")

# ============ HALAMAN: DOKUMEN PEMBELAJARAN ============
def page_dokumen():
    st.title("📁 Dokumen Pembelajaran")
    
    kelas = get_kelas()
    if not kelas:
        st.warning("Belum ada kelas. Silahkan tambah kelas di menu Pengaturan.")
        return
    
    kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
    
    # === 3 TAB ===
    tab1, tab2, tab3 = st.tabs([
        "📤 Upload Dokumen", 
        "📂 Lihat Dokumen", 
        "🤖 Generate AI"
    ])
    
    # ===== TAB 1: UPLOAD DOKUMEN =====
    with tab1:
        st.subheader("Upload Dokumen Pembelajaran")
        
        with st.form("form_upload_dokumen"):
            cols = st.columns(2)
            
            kelas_terpilih = cols[0].selectbox("Kelas", list(kelas_options.keys()))
            jenis = cols[0].selectbox(
                "Jenis Dokumen",
                ["RPP", "Modul Ajar", "LKPD", "Materi"]
            )
            semester = cols[1].selectbox("Semester", [1, 2])
            judul = cols[1].text_input("Judul Dokumen")
            
            topik = st.text_input("Topik")
            bab = st.text_input("Bab")
            
            uploaded_file = st.file_uploader(
                "Pilih File (PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, JPG, PNG)",
                type=['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png']
            )
            
            if uploaded_file:
                file_size_mb = len(uploaded_file.getvalue()) / (1024 * 1024)
                st.info(f"📊 Ukuran file: {file_size_mb:.2f} MB")
                if file_size_mb > 50:
                    st.warning("⚠️ File ini akan dikompres otomatis sebelum upload!")
            
            submit = st.form_submit_button("📤 Upload Dokumen")
            
            if submit:
                if not uploaded_file:
                    st.error("❌ Silakan pilih file terlebih dahulu!")
                elif not judul:
                    st.error("❌ Judul dokumen wajib diisi!")
                else:
                    try:
                        file_bytes = uploaded_file.read()
                        file_name = uploaded_file.name
                        
                        with st.spinner("⏳ Mengompres file..."):
                            compressed_bytes, new_name = compress_file(file_bytes, file_name)
                        
                        if compressed_bytes is None:
                            st.error("❌ File terlalu besar dan tidak bisa dikompres.")
                            return
                        
                        if len(compressed_bytes) > 50 * 1024 * 1024:
                            st.error(f"❌ File setelah kompres masih {len(compressed_bytes)/1024/1024:.1f} MB > 50 MB.")
                            return
                        
                        with st.spinner("⏳ Mengupload file..."):
                            file_url = upload_file_to_supabase(compressed_bytes, new_name)
                        
                        if file_url:
                            supabase.table("dokumen").insert({
                                "kelas_id": kelas_options[kelas_terpilih],
                                "judul": judul,
                                "jenis": jenis,
                                "topik": topik if topik else None,
                                "bab": bab if bab else None,
                                "file_name": new_name,
                                "file_url": file_url,
                                "file_size": len(compressed_bytes),
                                "semester": semester
                            }).execute()
                            
                            clear_cache()
                            
                            original_size = len(file_bytes) / 1024 / 1024
                            compressed_size = len(compressed_bytes) / 1024 / 1024
                            saving = ((original_size - compressed_size) / original_size * 100) if original_size > 0 else 0
                            
                            st.success(f"✅ Dokumen '{judul}' berhasil diupload!")
                            st.info(f"📊 Ukuran: {original_size:.1f} MB → {compressed_size:.1f} MB (hemat {saving:.0f}%)")
                            st.balloons()
                            
                    except Exception as e:
                        st.error(f"❌ Gagal upload: {str(e)}")
    
    # ===== TAB 2: LIHAT DOKUMEN =====
    with tab2:
        st.subheader("Daftar Dokumen")
        
        cols = st.columns(3)
        filter_kelas = cols[0].selectbox(
            "Filter Kelas", 
            ["Semua"] + list(kelas_options.keys())
        )
        filter_jenis = cols[1].selectbox(
            "Filter Jenis",
            ["Semua", "RPP", "Modul Ajar", "LKPD", "Materi"]
        )
        filter_semester = cols[2].selectbox(
            "Filter Semester",
            ["Semua", 1, 2]
        )
        
        dokumen = []
        if filter_kelas == "Semua":
            for k in kelas:
                dokumen.extend(get_dokumen(k['id']))
        else:
            dokumen = get_dokumen(kelas_options[filter_kelas])
        
        if filter_jenis != "Semua":
            dokumen = [d for d in dokumen if d['jenis'] == filter_jenis]
        if filter_semester != "Semua":
            dokumen = [d for d in dokumen if d.get('semester') == filter_semester]
        
        if dokumen:
            for d in dokumen:
                with st.container():
                    cols = st.columns([2, 1, 1, 0.5])
                    
                    kelas_nama = next((k['nama_kelas'] for k in kelas if k['id'] == d['kelas_id']), "Unknown")
                    
                    cols[0].write(f"**{d['judul']}**")
                    cols[0].caption(f"📂 {d['jenis']} | 📚 {kelas_nama} | Semester {d.get('semester', 1)}")
                    if d.get('topik'):
                        cols[0].caption(f"Topik: {d['topik']}")
                    
                    file_size_mb = d.get('file_size', 0) / (1024 * 1024)
                    cols[0].caption(f"📊 {file_size_mb:.1f} MB")
                    
                    if cols[1].button("📥 Download", key=f"download_{d['id']}"):
                        try:
                            st.markdown(
                                f'<a href="{d["file_url"]}" download="{d["file_name"]}" target="_blank">⬇️ Klik untuk Download</a>',
                                unsafe_allow_html=True
                            )
                        except Exception as e:
                            st.error(f"Gagal download: {str(e)}")
                    
                    if cols[3].button("🗑️", key=f"del_doc_{d['id']}"):
                        st.warning(f"⚠️ Yakin hapus dokumen '{d['judul']}'?")
                        if st.button(f"✅ Ya, Hapus!", key=f"confirm_del_doc_{d['id']}"):
                            try:
                                supabase.table("dokumen").delete().eq("id", d['id']).execute()
                                clear_cache()
                                st.success(f"✅ Dokumen dihapus!")
                                st.rerun()
                            except Exception as e:
                                st.error(f"❌ Gagal: {str(e)}")
                    
                    st.markdown("---")
        else:
            st.info("Belum ada dokumen. Upload dokumen pertama Anda!")
    
# ============ HALAMAN: DOKUMEN PEMBELAJARAN ============
def page_dokumen():
    st.title("📁 Dokumen Pembelajaran")
    
    # ===== INISIALISASI SESSION STATE =====
    if "groq_models" not in st.session_state:
        st.session_state.groq_models = []
    if "active_models" not in st.session_state:
        st.session_state.active_models = []
    
    # ===== CEK MODEL AKTIF (HANYA 1x) =====
    if not st.session_state.groq_models:
        try:
            groq_api_key = st.secrets["groq_api_key"]
            import requests
            response = requests.get(
                "https://api.groq.com/openai/v1/models",
                headers={"Authorization": f"Bearer {groq_api_key}"}
            )
            if response.status_code == 200:
                models = response.json().get('data', [])
                model_ids = [m['id'] for m in models]
                st.session_state.groq_models = model_ids
                # Filter yang aktif (bisa dipakai)
                active = [m for m in model_ids if 'preview' not in m.lower()]
                st.session_state.active_models = active
            else:
                st.session_state.groq_models = []
                st.session_state.active_models = []
        except Exception as e:
            st.session_state.groq_models = []
            st.session_state.active_models = []
    
    # ===== TAMPILKAN MODEL YANG AKTIF =====
    if st.session_state.active_models:
        with st.expander("🔍 Model AI yang Tersedia", expanded=False):
            st.write("Model yang bisa digunakan:")
            for m in st.session_state.active_models:
                st.write(f"✅ `{m}`")
            st.caption(f"Total {len(st.session_state.active_models)} model aktif")
    
    # ===== LANJUT KE KODE UTAMA =====
    kelas = get_kelas()
    if not kelas:
        st.warning("Belum ada kelas. Silahkan tambah kelas di menu Pengaturan.")
        return
    
    kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
    
    # === 3 TAB ===
    tab1, tab2, tab3 = st.tabs([
        "📤 Upload Dokumen", 
        "📂 Lihat Dokumen", 
        "🤖 Generate AI"
    ])
    
    # ===== TAB 1: UPLOAD DOKUMEN =====
    with tab1:
        st.subheader("Upload Dokumen Pembelajaran")
        
        with st.form("form_upload_dokumen"):
            cols = st.columns(2)
            
            kelas_terpilih = cols[0].selectbox("Kelas", list(kelas_options.keys()))
            jenis = cols[0].selectbox(
                "Jenis Dokumen",
                ["RPP", "Modul Ajar", "LKPD", "Materi"]
            )
            semester = cols[1].selectbox("Semester", [1, 2])
            judul = cols[1].text_input("Judul Dokumen")
            
            topik = st.text_input("Topik")
            bab = st.text_input("Bab")
            
            uploaded_file = st.file_uploader(
                "Pilih File (PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX, JPG, PNG)",
                type=['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png']
            )
            
            if uploaded_file:
                file_size_mb = len(uploaded_file.getvalue()) / (1024 * 1024)
                st.info(f"📊 Ukuran file: {file_size_mb:.2f} MB")
                if file_size_mb > 50:
                    st.warning("⚠️ File ini akan dikompres otomatis sebelum upload!")
            
            submit = st.form_submit_button("📤 Upload Dokumen")
            
            if submit:
                if not uploaded_file:
                    st.error("❌ Silakan pilih file terlebih dahulu!")
                elif not judul:
                    st.error("❌ Judul dokumen wajib diisi!")
                else:
                    try:
                        file_bytes = uploaded_file.read()
                        file_name = uploaded_file.name
                        
                        with st.spinner("⏳ Mengompres file..."):
                            compressed_bytes, new_name = compress_file(file_bytes, file_name)
                        
                        if compressed_bytes is None:
                            st.error("❌ File terlalu besar dan tidak bisa dikompres.")
                            return
                        
                        if len(compressed_bytes) > 50 * 1024 * 1024:
                            st.error(f"❌ File setelah kompres masih {len(compressed_bytes)/1024/1024:.1f} MB > 50 MB.")
                            return
                        
                        with st.spinner("⏳ Mengupload file..."):
                            file_url = upload_file_to_supabase(compressed_bytes, new_name)
                        
                        if file_url:
                            supabase.table("dokumen").insert({
                                "kelas_id": kelas_options[kelas_terpilih],
                                "judul": judul,
                                "jenis": jenis,
                                "topik": topik if topik else None,
                                "bab": bab if bab else None,
                                "file_name": new_name,
                                "file_url": file_url,
                                "file_size": len(compressed_bytes),
                                "semester": semester
                            }).execute()
                            
                            clear_cache()
                            
                            original_size = len(file_bytes) / 1024 / 1024
                            compressed_size = len(compressed_bytes) / 1024 / 1024
                            saving = ((original_size - compressed_size) / original_size * 100) if original_size > 0 else 0
                            
                            st.success(f"✅ Dokumen '{judul}' berhasil diupload!")
                            st.info(f"📊 Ukuran: {original_size:.1f} MB → {compressed_size:.1f} MB (hemat {saving:.0f}%)")
                            st.balloons()
                            
                    except Exception as e:
                        st.error(f"❌ Gagal upload: {str(e)}")
    
    # ===== TAB 2: LIHAT DOKUMEN =====
    with tab2:
        st.subheader("Daftar Dokumen")
        
        cols = st.columns(3)
        filter_kelas = cols[0].selectbox(
            "Filter Kelas", 
            ["Semua"] + list(kelas_options.keys())
        )
        filter_jenis = cols[1].selectbox(
            "Filter Jenis",
            ["Semua", "RPP", "Modul Ajar", "LKPD", "Materi"]
        )
        filter_semester = cols[2].selectbox(
            "Filter Semester",
            ["Semua", 1, 2]
        )
        
        dokumen = []
        if filter_kelas == "Semua":
            for k in kelas:
                dokumen.extend(get_dokumen(k['id']))
        else:
            dokumen = get_dokumen(kelas_options[filter_kelas])
        
        if filter_jenis != "Semua":
            dokumen = [d for d in dokumen if d['jenis'] == filter_jenis]
        if filter_semester != "Semua":
            dokumen = [d for d in dokumen if d.get('semester') == filter_semester]
        
        if dokumen:
            for d in dokumen:
                with st.container():
                    cols = st.columns([2, 1, 1, 0.5])
                    
                    kelas_nama = next((k['nama_kelas'] for k in kelas if k['id'] == d['kelas_id']), "Unknown")
                    
                    cols[0].write(f"**{d['judul']}**")
                    cols[0].caption(f"📂 {d['jenis']} | 📚 {kelas_nama} | Semester {d.get('semester', 1)}")
                    if d.get('topik'):
                        cols[0].caption(f"Topik: {d['topik']}")
                    
                    file_size_mb = d.get('file_size', 0) / (1024 * 1024)
                    cols[0].caption(f"📊 {file_size_mb:.1f} MB")
                    
                    if cols[1].button("📥 Download", key=f"download_{d['id']}"):
                        try:
                            st.markdown(
                                f'<a href="{d["file_url"]}" download="{d["file_name"]}" target="_blank">⬇️ Klik untuk Download</a>',
                                unsafe_allow_html=True
                            )
                        except Exception as e:
                            st.error(f"Gagal download: {str(e)}")
                    
                    if cols[3].button("🗑️", key=f"del_doc_{d['id']}"):
                        st.warning(f"⚠️ Yakin hapus dokumen '{d['judul']}'?")
                        if st.button(f"✅ Ya, Hapus!", key=f"confirm_del_doc_{d['id']}"):
                            try:
                                supabase.table("dokumen").delete().eq("id", d['id']).execute()
                                clear_cache()
                                st.success(f"✅ Dokumen dihapus!")
                                st.rerun()
                            except Exception as e:
                                st.error(f"❌ Gagal: {str(e)}")
                    
                    st.markdown("---")
        else:
            st.info("Belum ada dokumen. Upload dokumen pertama Anda!")
    
    # ===== TAB 3: GENERATE AI =====
    with tab3:
        st.subheader("🤖 Buat Perangkat Pembelajaran dengan AI")
        st.caption("💡 Masukkan materi dan biarkan AI membuat RPP, Modul Ajar, atau LKPD secara otomatis!")
        
        # ===== AMBIL API KEY (TANPA DEBUG) =====
        try:
            groq_api_key = st.secrets["groq_api_key"]
        except:
            groq_api_key = st.text_input(
                "🔑 Groq API Key",
                type="password",
                help="Dapatkan gratis di console.groq.com/keys",
                placeholder="Masukkan API Key Groq Anda...",
                key="groq_dokumen_key"
            )
            
            if not groq_api_key:
                st.warning("⚠️ Masukkan Groq API Key terlebih dahulu!")
                st.caption("📌 Belum punya? Daftar gratis di [console.groq.com/keys](https://console.groq.com/keys)")
                return  # <-- Masih di dalam fungsi page_dokumen()
        
        # Form Generate
        with st.form("form_generate_ai"):
            cols = st.columns(2)
            jenis_dokumen = cols[0].selectbox(
                "📄 Jenis Dokumen",
                ["RPP", "Modul Ajar", "LKPD", "Materi"],
                help="Pilih jenis perangkat pembelajaran yang ingin dibuat"
            )
            kelas_terpilih = cols[1].selectbox(
                "📚 Kelas",
                list(kelas_options.keys())
            )
            
            mata_pelajaran = st.text_input(
                "📖 Mata Pelajaran",
                placeholder="Contoh: Matematika, IPA, Bahasa Indonesia"
            )
            topik = st.text_input(
                "🎯 Topik/Materi",
                placeholder="Contoh: Bilangan Bulat, Sistem Peredaran Darah"
            )
            
            st.markdown("---")
            st.subheader("📋 Detail Tambahan (Opsional)")
            
            cols2 = st.columns(2)
            tujuan_pembelajaran = cols2[0].text_area(
                "🎯 Tujuan Pembelajaran",
                placeholder="Contoh: Siswa mampu menghitung operasi penjumlahan bilangan bulat...",
                height=100
            )
            kompetensi_dasar = cols2[1].text_area(
                "📋 Kompetensi Dasar",
                placeholder="Contoh: 3.1 Menjelaskan operasi hitung bilangan bulat...",
                height=100
            )
            
            alokasi_waktu = st.number_input("⏱️ Alokasi Waktu (JP)", min_value=1, max_value=10, value=2)
            
            model_groq = st.selectbox(
    "🧠 Model AI",
    [
        "llama-3.3-70b-versatile",     # ✅ Terbaik untuk RPP/Modul/LKPD
        "llama-3.1-8b-instant",        # ✅ Cepat, ringan
        "gemma2-9b-it",                # ✅ Model Google
        "qwen-2.5-32b",                # ✅ Konteks panjang
        "llama-4-scout-17b-16e-instruct" # 🔥 Terbaru
    ],
    index=0,
    help="Pilih model AI yang tersedia - 70B untuk kualitas terbaik"
)
            
            st.caption("📊 Estimasi token: ~500-1500 tokens per dokumen")
            
            generate_btn = st.form_submit_button("🚀 Generate Dokumen", type="primary", use_container_width=True)
        
        if generate_btn:
            if not mata_pelajaran or not topik:
                st.error("❌ Mata Pelajaran dan Topik wajib diisi!")
            else:
                with st.spinner("⏳ AI sedang menulis dokumen..."):
                    try:
                        from langchain_groq import ChatGroq
                        from langchain_core.prompts import ChatPromptTemplate
                        from langchain_core.output_parsers import StrOutputParser
                        
                        llm = ChatGroq(
                            model=model_groq,
                            temperature=0.7,
                            groq_api_key=groq_api_key
                        )
                        
                        prompt_text = create_prompt_ai(
                            jenis_dokumen=jenis_dokumen,
                            mata_pelajaran=mata_pelajaran,
                            topik=topik,
                            kelas=kelas_terpilih,
                            tujuan=tujuan_pembelajaran,
                            kd=kompetensi_dasar,
                            waktu=alokasi_waktu
                        )
                        
                        prompt_template = ChatPromptTemplate.from_messages([
                            ("system", f"Anda adalah guru profesional yang membuat {jenis_dokumen} berkualitas tinggi."),
                            ("user", "{input}")
                        ])
                        
                        chain = prompt_template | llm | StrOutputParser()
                        hasil = chain.invoke({"input": prompt_text})
                        
                        st.markdown("---")
                        st.subheader(f"📄 {jenis_dokumen} - {topik}")
                        st.markdown(hasil)
                        
                        st.markdown("---")
                        st.subheader("💾 Simpan atau Download")
                        
                        cols_save = st.columns(3)
                        
                        if cols_save[0].button("💾 Simpan ke Database", use_container_width=True):
                            try:
                                supabase.table("dokumen").insert({
                                    "kelas_id": kelas_options[kelas_terpilih],
                                    "judul": f"{jenis_dokumen} - {topik} - {date.today()}",
                                    "jenis": jenis_dokumen,
                                    "topik": topik,
                                    "file_name": f"{jenis_dokumen}_{topik}.txt",
                                    "file_url": f"generated_{jenis_dokumen}_{topik}.txt",
                                    "file_size": len(hasil),
                                    "semester": 1
                                }).execute()
                                
                                clear_cache()
                                st.success("✅ Dokumen berhasil disimpan ke database!")
                                st.balloons()
                            except Exception as e:
                                st.error(f"❌ Gagal simpan: {str(e)}")
                        
                        if cols_save[1].button("📥 Download", use_container_width=True):
                            st.download_button(
                                label="⬇️ Klik untuk Download",
                                data=hasil,
                                file_name=f"{jenis_dokumen}_{topik}_{date.today()}.md",
                                mime="text/markdown",
                                use_container_width=True
                            )
                        
                        if cols_save[2].button("📋 Copy ke Clipboard", use_container_width=True):
                            st.code(hasil, language="markdown")
                            st.info("✅ Teks sudah siap di-copy!")
                            
                    except Exception as e:
                        st.error(f"❌ Gagal generate: {str(e)}")
                        st.info("💡 Pastikan API Key benar dan model tersedia")

# ============ HALAMAN: PENGATURAN KELAS & SISWA ============
def page_pengaturan():
    st.title("⚙️ Pengaturan Kelas & Siswa")
    
    tab1, tab2, tab3 = st.tabs(["📚 Kelas", "👨‍🎓 Siswa", "🎯 KKM"])
    
    # TAB 1: Kelas
    with tab1:
        st.subheader("Kelola Kelas")
        
        with st.form("form_kelas"):
            cols_form = st.columns([3, 1])
            nama_kelas = cols_form[0].text_input("Nama Kelas", placeholder="Contoh: 7A, 8B, 9C")
            submit = cols_form[1].form_submit_button("➕ Tambah", use_container_width=True)
            
            if submit and nama_kelas:
                try:
                    supabase.table("kelas").insert({"nama_kelas": nama_kelas.upper()}).execute()
                    clear_cache()
                    st.success(f"✅ Kelas {nama_kelas.upper()} berhasil ditambahkan!")
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Gagal: {str(e)}")
        
        # Tampilan kelas grid
        kelas = get_kelas()
        if kelas:
            st.markdown("---")
            st.subheader(f"📚 Daftar Kelas ({len(kelas)})")
            
            # Tampilkan kelas dalam grid sederhana
            cols = st.columns(4)
            for idx, k in enumerate(kelas):
                col = cols[idx % 4]
                with col:
                    siswa_count = len(get_siswa(k['id']))
                    st.markdown(f"""
                    <div style="background:#f0f2f6; padding:12px; border-radius:10px; text-align:center; margin:4px;">
                        <div style="font-size:24px;">📚</div>
                        <div style="font-weight:bold; font-size:18px;">{k['nama_kelas']}</div>
                        <div style="font-size:12px; color:#666;">{siswa_count} siswa</div>
                    </div>
                    """, unsafe_allow_html=True)
            
            # Hapus kelas (dengan konfirmasi)
            st.markdown("---")
            with st.expander("🗑️ Hapus Kelas", expanded=False):
                kelas_to_delete = st.selectbox(
                    "Pilih kelas yang akan dihapus",
                    [k['nama_kelas'] for k in kelas],
                    key="delete_kelas_select"
                )
                st.warning(f"⚠️ Semua data siswa dan nilai di kelas ini akan ikut terhapus!")
                if st.button(f"✅ Ya, Hapus {kelas_to_delete}!", type="primary"):
                    try:
                        kelas_id = next(k['id'] for k in kelas if k['nama_kelas'] == kelas_to_delete)
                        siswa = get_siswa(kelas_id)
                        for s in siswa:
                            supabase.table("siswa").delete().eq("id", s['id']).execute()
                        supabase.table("kelas").delete().eq("id", kelas_id).execute()
                        clear_cache()
                        st.success(f"✅ Kelas {kelas_to_delete} berhasil dihapus!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"❌ Gagal: {str(e)}")
    
    # TAB 2: Siswa
    with tab2:
        st.subheader("Kelola Siswa")
        
        kelas = get_kelas()
        if not kelas:
            st.warning("Tambahkan kelas terlebih dahulu.")
        else:
            kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
            kelas_terpilih = st.selectbox(
                "Pilih Kelas", 
                list(kelas_options.keys()),
                key="select_kelas_siswa"
            )
            kelas_id = kelas_options[kelas_terpilih]
            
            # Tambah siswa
            with st.form("form_siswa"):
                metode = st.radio("Metode Tambah", ["Satuan", "Massal"], key="radio_siswa")
                
                if metode == "Satuan":
                    nama = st.text_input("Nama Siswa", key="nama_siswa_satuan")
                    submit = st.form_submit_button("➕ Tambah Siswa")
                    
                    if submit and nama:
                        try:
                            supabase.table("siswa").insert({
                                "nama": nama,
                                "kelas_id": kelas_id
                            }).execute()
                            clear_cache()
                            st.success(f"✅ {nama} berhasil ditambahkan!")
                            st.rerun()
                        except Exception as e:
                            st.error(f"❌ Gagal: {str(e)}")
                else:
                    daftar_nama = st.text_area(
                        "Copy-paste daftar nama (satu per baris)",
                        placeholder="Budi\nAni\nCitra\nDodi",
                        key="daftar_nama_massal"
                    )
                    submit = st.form_submit_button("➕ Tambah Massal")
                    
                    if submit and daftar_nama:
                        nama_list = [n.strip() for n in daftar_nama.split('\n') if n.strip()]
                        try:
                            for nama in nama_list:
                                supabase.table("siswa").insert({
                                    "nama": nama,
                                    "kelas_id": kelas_id
                                }).execute()
                            clear_cache()
                            st.success(f"✅ Berhasil menambahkan {len(nama_list)} siswa!")
                            st.rerun()
                        except Exception as e:
                            st.error(f"❌ Gagal: {str(e)}")
            
            # Daftar siswa
            siswa = get_siswa(kelas_id)
            if siswa:
                st.markdown("---")
                st.subheader(f"Daftar Siswa Kelas {kelas_terpilih}")
                
                for s in siswa:
                    cols = st.columns([3, 1])
                    cols[0].write(f"👨‍🎓 {s['nama']}")
                    if cols[1].button(f"🗑️", key=f"del_siswa_{s['id']}"):
                        st.warning(f"⚠️ Yakin ingin menghapus siswa {s['nama']}?")
                        if st.button(f"✅ Ya, Hapus!", key=f"confirm_del_siswa_{s['id']}"):
                            try:
                                supabase.table("siswa").delete().eq("id", s['id']).execute()
                                clear_cache()
                                st.success(f"✅ {s['nama']} berhasil dihapus!")
                                st.rerun()
                            except Exception as e:
                                st.error(f"❌ Gagal: {str(e)}")
    
    # TAB 3: KKM
    with tab3:
        st.subheader("Setting KKM")
        
        kelas = get_kelas()
        if not kelas:
            st.warning("Tambahkan kelas terlebih dahulu.")
        else:
            kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
            kelas_terpilih = st.selectbox(
                "Pilih Kelas", 
                list(kelas_options.keys()),
                key="select_kelas_kkm"
            )
            kelas_id = kelas_options[kelas_terpilih]
            
            with st.form("form_kkm"):
                st.write("Set KKM per kategori:")
                
                kategori_list = ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]
                kkm_values = {}
                
                cols = st.columns(2)
                for i, kategori in enumerate(kategori_list):
                    col = cols[i % 2]
                    existing = get_kkm(kelas_id, kategori)
                    default = existing[0]['kkm'] if existing else 75
                    kkm_values[kategori] = col.number_input(
                        kategori, 
                        min_value=0, 
                        max_value=100, 
                        value=default,
                        key=f"kkm_{kategori}_{kelas_id}"
                    )
                
                submit = st.form_submit_button("💾 Simpan KKM")
                
                if submit:
                    try:
                        for kategori, nilai in kkm_values.items():
                            existing = get_kkm(kelas_id, kategori)
                            if existing:
                                supabase.table("kkm").update({
                                    "kkm": nilai
                                }).eq("id", existing[0]['id']).execute()
                            else:
                                supabase.table("kkm").insert({
                                    "kelas_id": kelas_id,
                                    "kategori": kategori,
                                    "kkm": nilai
                                }).execute()
                        clear_cache()
                        st.success("✅ KKM berhasil disimpan!")
                    except Exception as e:
                        st.error(f"❌ Gagal: {str(e)}")
# ============ FOOTER ============
st.sidebar.markdown("---")
st.sidebar.caption("Made with ❤️ untuk Guru SMP")
st.sidebar.caption(f"Version 3.0 | {datetime.now().year}")
