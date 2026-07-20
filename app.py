import streamlit as st
import pandas as pd
from supabase import create_client, Client
from datetime import datetime, date, timedelta
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
    layout="wide",
    initial_sidebar_state="expanded"
)

# ============ INISIALISASI SESSION STATE ============
def init_session_states():
    # Temporary nilai state untuk input kartu touchscreen
    if "temp_nilai_kartu" not in st.session_state:
        st.session_state.temp_nilai_kartu = {}
    if "temp_catatan_kartu" not in st.session_state:
        st.session_state.temp_catatan_kartu = {}
    if "current_kelas_id" not in st.session_state:
        st.session_state.current_kelas_id = None

    # State untuk Jadwal
    if "hapus_id" not in st.session_state:
        st.session_state.hapus_id = None
    if "hapus_text" not in st.session_state:
        st.session_state.hapus_text = ""
    if "jadwal_success_msg" not in st.session_state:
        st.session_state.jadwal_success_msg = None
    if "jadwal_error_msg" not in st.session_state:
        st.session_state.jadwal_error_msg = None

    # State untuk Dokumen
    if "hapus_doc_id" not in st.session_state:
        st.session_state.hapus_doc_id = None
    if "hapus_doc_judul" not in st.session_state:
        st.session_state.hapus_doc_judul = ""
    if "doc_success_msg" not in st.session_state:
        st.session_state.doc_success_msg = None
    if "doc_error_msg" not in st.session_state:
        st.session_state.doc_error_msg = None

    # State untuk Siswa
    if "hapus_siswa_id" not in st.session_state:
        st.session_state.hapus_siswa_id = None
    if "hapus_siswa_nama" not in st.session_state:
        st.session_state.hapus_siswa_nama = ""
    if "siswa_success_msg" not in st.session_state:
        st.session_state.siswa_success_msg = None
    if "siswa_error_msg" not in st.session_state:
        st.session_state.siswa_error_msg = None

    # State untuk Bab/Generate
    if "daftar_bab" not in st.session_state:
        st.session_state.daftar_bab = [
            {"nama": "Bab 1 - Pengenalan", "durasi": 2},
            {"nama": "Bab 2 - Operasi Dasar", "durasi": 2},
            {"nama": "Bab 3 - Review & UH", "durasi": 1},
        ]
    if "hapus_bab_check" not in st.session_state:
        st.session_state.hapus_bab_check = [False] * len(st.session_state.daftar_bab)

init_session_states()

# ============ CSS KHUSUS HP & KUSTOMISASI GLOBAL ============
# Mengimpor Font Google "Plus Jakarta Sans" dan memberikan styling modern, transisi halus, serta perbaikan responsivitas HP.
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');

    /* Font Global & Transisi Halus */
    html, body, [data-testid="stAppViewContainer"], .stApp {
        font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        background-color: #fcfcfd !important;
        transition: background-color 0.3s ease, opacity 0.3s ease;
    }

    /* Transisi Fade In Halus saat memuat halaman */
    [data-testid="stAppViewContainer"] {
        animation: fadeIn 0.4s ease-out;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* Mempercantik Judul */
    h1, h2, h3, h4, h5, h6 {
        font-family: 'Plus Jakarta Sans', sans-serif !important;
        font-weight: 700 !important;
        color: #1e293b !important;
        letter-spacing: -0.02em !important;
    }

    /* Perbaikan Tab Streamlit agar Fokus ke Tengah dan Rapi di Mobile */
    div[data-testid="stTabs"] {
        background-color: #f8fafc;
        padding: 6px;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
        margin-bottom: 20px;
    }
    div[data-testid="stTabs"] button {
        flex: 1 !important;
        text-align: center !important;
        justify-content: center !important;
        font-weight: 600 !important;
        font-size: 15px !important;
        border-radius: 8px !important;
        color: #64748b !important;
        transition: all 0.2s ease-in-out !important;
        border: none !important;
        background-color: transparent !important;
    }
    div[data-testid="stTabs"] button[aria-selected="true"] {
        background-color: #ffffff !important;
        color: #4CAF50 !important;
        box-shadow: 0px 4px 6px -1px rgba(0, 0, 0, 0.05), 0px 2px 4px -1px rgba(0, 0, 0, 0.03) !important;
    }

    /* Kustomisasi Tombol Primary & Hover */
    .stButton button {
        font-family: 'Plus Jakarta Sans', sans-serif !important;
        font-size: 15px !important;
        font-weight: 600 !important;
        padding: 10px 20px !important;
        min-height: 44px !important;
        border-radius: 10px !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
        box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important;
        border: 1px solid #e2e8f0 !important;
    }

    /* Tombol warna hijau guru */
    .stButton button[data-baseweb="button"] {
        background-color: #4CAF50 !important;
        color: white !important;
        border: none !important;
    }

    .stButton button:hover {
        transform: translateY(-1px) !important;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06) !important;
        background-color: #43a047 !important;
    }

    .stButton button:active {
        transform: translateY(0px) !important;
    }

    /* Card Box Kustom untuk HP */
    .custom-card {
        background: #ffffff;
        border-radius: 16px;
        padding: 18px;
        margin: 12px 0;
        border: 1px solid #f1f5f9;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02), 0 2px 4px -1px rgba(0, 0, 0, 0.01);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .custom-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.04), 0 4px 6px -2px rgba(0, 0, 0, 0.02);
    }

    /* Perbaikan tampilan HP */
    @media only screen and (max-width: 768px) {
        .stApp {
            font-size: 15px !important;
        }
        h1 {
            font-size: 22px !important;
        }
        h2 {
            font-size: 18px !important;
        }
        h3 {
            font-size: 16px !important;
        }
        .stButton button {
            width: 100% !important;
        }
        /* Sidebar lebih lebar di HP */
        .css-1d391kg, [data-testid="stSidebar"] {
            width: 280px !important;
        }
    }

    /* Input & Form Elements */
    .stTextInput input, .stSelectbox select, .stNumberInput input, .stTextArea textarea {
        border-radius: 8px !important;
        border: 1px solid #cbd5e1 !important;
        padding: 10px 14px !important;
        transition: border-color 0.2s ease !important;
    }
    .stTextInput input:focus, .stSelectbox select:focus, .stNumberInput input:focus, .stTextArea textarea:focus {
        border-color: #4CAF50 !important;
        box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.15) !important;
    }

    /* Checkbox lebih besar */
    .stCheckbox label {
        font-size: 15px !important;
        padding: 6px !important;
    }
    .stCheckbox input {
        width: 18px !important;
        height: 18px !important;
    }
</style>
""", unsafe_allow_html=True)
           
# ============ INISIALISASI SUPABASE ============
@st.cache_resource
def init_supabase():
    try:
        url = st.secrets["supabase"]["url"]
        key = st.secrets["supabase"]["key"]
        return create_client(url, key)
    except Exception as e:
        return None

supabase = init_supabase()

if supabase is None:
    st.error("⚠️ **Kredensial database (Supabase) belum diatur dengan benar!**")
    st.info("Silakan buat atau lengkapi file konfigurasi `.streamlit/secrets.toml` Anda dengan format berikut:")
    st.code("""
[supabase]
url = "https://your-project-url.supabase.co"
key = "your-supabase-anon-key"
    """, language="toml")
    st.stop()

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
                # Baca PDF
                pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
                pdf_writer = PyPDF2.PdfWriter()
                
                # ✅ PERBAIKAN: loop yang benar
                for page in pdf_reader.pages:
                    try:
                        page.compress_content_streams()
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
def generate_jadwal_semester(kelas_id, hari, jam, daftar_bab, semester, tahun_ajaran):
    """
    Generate jadwal berdasarkan daftar bab dengan durasi masing-masing
    
    Parameter:
    - daftar_bab: list of dict [{"nama": "Bab 1 - Bilangan Bulat", "durasi": 2}, ...]
    """
    try:
        jadwal_insert = []
        minggu_ke = 1
        
        for bab in daftar_bab:
            nama_bab = bab.get('nama', 'Bab')
            durasi = bab.get('durasi', 1)
            
            # Generate jadwal untuk setiap minggu dalam bab ini
            for i in range(durasi):
                # Jika minggu pertama bab, tulis nama bab lengkap
                if i == 0:
                    topik = nama_bab
                else:
                    topik = f"{nama_bab} (Lanjutan {i+1})"
                
                jadwal_insert.append({
                    "kelas_id": kelas_id,
                    "hari": hari,
                    "jam": str(jam),
                    "topik": topik,
                    "bab": nama_bab,
                    "minggu_ke": minggu_ke,
                    "semester": semester,
                    "tahun_ajaran": tahun_ajaran,
                    "is_generated": True
                })
                minggu_ke += 1
        
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
# ============ FUNGSI TAMPILAN KARTU UNTUK HP ============
def tampilan_kartu(data_list, judul="Daftar"):
    if not data_list:
        st.info(f"📭 Tidak ada data {judul}")
        return
    
    st.markdown(f"### 📇 {judul}")
    
    st.markdown("""
    <style>
        .card-hp {
            background: #f8f9fa;
            border-radius: 12px;
            padding: 14px 16px;
            margin: 8px 0;
            border-left: 4px solid #4CAF50;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .card-hp .nama {
            font-weight: 600;
            font-size: 16px;
            color: #1a1a2e;
        }
        .card-hp .nilai {
            font-size: 20px;
            font-weight: 700;
            color: #4CAF50;
            background: white;
            padding: 4px 12px;
            border-radius: 20px;
            min-width: 50px;
            text-align: center;
        }
        .card-hp .nilai-rendah {
            color: #f44336;
        }
        .card-hp .keterangan {
            font-size: 12px;
            color: #888;
            margin-top: 2px;
        }
        .card-hp .kiri {
            flex: 1;
        }
        .card-hp .kanan {
            text-align: right;
            min-width: 60px;
        }
        @media only screen and (max-width: 480px) {
            .card-hp {
                padding: 12px 12px;
                margin: 6px 0;
                border-radius: 8px;
            }
            .card-hp .nama {
                font-size: 14px;
            }
            .card-hp .nilai {
                font-size: 18px;
                padding: 2px 10px;
                min-width: 40px;
            }
        }
    </style>
    """, unsafe_allow_html=True)
    
    for item in data_list:
        nilai = item.get('Nilai', 0)
        nilai_class = "nilai-rendah" if nilai < 70 else ""
        nilai_text = f"{nilai:.0f}" if isinstance(nilai, (int, float)) and nilai > 0 else "—"
        sebelumnya = item.get('Nilai Sebelumnya', '-')
        if sebelumnya != '-' and sebelumnya:
            keterangan = f"Sebelumnya: {previously}"
        else:
            keterangan = item.get('Catatan', '') or "Kosong"
        
        st.markdown(f"""
        <div class="card-hp">
            <div class="kiri">
                <div class="nama">{item['Nama']}</div>
                <div class="keterangan">{keterangan}</div>
            </div>
            <div class="kanan">
                <div class="nilai {nilai_class}">{nilai_text}</div>
            </div>
        </div>
        """, unsafe_allow_html=True)
        
# ============ HALAMAN: DASHBOARD ============
def page_dashboard():
    st.markdown("<h1 style='text-align: center; margin-bottom: 25px;'>🏠 Dashboard Guru</h1>", unsafe_allow_html=True)
    
    # Grid KPI / Metrik Utama dengan card modern
    cols = st.columns(4)
    kelas = get_kelas()
    total_kelas = len(kelas)
    
    total_siswa = 0
    list_all_siswa = []
    for k in kelas:
        siswa_kelas = get_siswa(k['id'])
        total_siswa += len(siswa_kelas)
        list_all_siswa.extend(siswa_kelas)
    
    semua_nilai = get_nilai()
    total_nilai = len(semua_nilai)
    soal = get_bank_soal()
    total_soal = len(soal)
    
    # Render KPI Cards
    with cols[0]:
        st.markdown(f"""
        <div class="custom-card" style="text-align: center;">
            <div style="font-size: 32px; margin-bottom: 5px;">📚</div>
            <div style="font-size: 14px; color: #64748b; font-weight: 600;">Total Kelas</div>
            <div style="font-size: 28px; font-weight: 800; color: #1e293b;">{total_kelas}</div>
        </div>
        """, unsafe_allow_html=True)
    with cols[1]:
        st.markdown(f"""
        <div class="custom-card" style="text-align: center;">
            <div style="font-size: 32px; margin-bottom: 5px;">👨‍🎓</div>
            <div style="font-size: 14px; color: #64748b; font-weight: 600;">Total Siswa</div>
            <div style="font-size: 28px; font-weight: 800; color: #1e293b;">{total_siswa}</div>
        </div>
        """, unsafe_allow_html=True)
    with cols[2]:
        st.markdown(f"""
        <div class="custom-card" style="text-align: center;">
            <div style="font-size: 32px; margin-bottom: 5px;">📝</div>
            <div style="font-size: 14px; color: #64748b; font-weight: 600;">Total Transaksi Nilai</div>
            <div style="font-size: 28px; font-weight: 800; color: #1e293b;">{total_nilai}</div>
        </div>
        """, unsafe_allow_html=True)
    with cols[3]:
        st.markdown(f"""
        <div class="custom-card" style="text-align: center;">
            <div style="font-size: 32px; margin-bottom: 5px;">📖</div>
            <div style="font-size: 14px; color: #64748b; font-weight: 600;">Total Soal</div>
            <div style="font-size: 28px; font-weight: 800; color: #1e293b;">{total_soal}</div>
        </div>
        """, unsafe_allow_html=True)
    
    st.markdown("<br>", unsafe_allow_html=True)

    # Kolom Kiri: Jadwal Hari Ini | Kolom Kanan: Analitik & Insights Nilai KKM
    col_kiri, col_kanan = st.columns([1.2, 1.0])

    with col_kiri:
        st.markdown("<h3 style='margin-bottom: 15px;'>📅 Jadwal Mengajar Hari Ini</h3>", unsafe_allow_html=True)

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
            st.info(f"Tidak ada jadwal mengajar untuk hari {hari_ini_ind}")

    with col_kanan:
        st.markdown("<h3 style='margin-bottom: 15px;'>📈 Analitik & Insights KKM</h3>", unsafe_allow_html=True)

        if semua_nilai and kelas:
            # Hitung rata-rata nilai kelas, % lulus KKM (default 75 jika KKM belum di-set)
            insights_data = []
            for k in kelas:
                nilai_kelas = [n for n in semua_nilai if n['kelas_id'] == k['id']]
                if nilai_kelas:
                    list_nilai = [n['nilai'] for n in nilai_kelas]
                    rerata = sum(list_nilai) / len(list_nilai)

                    # Ambil KKM kelas (jika ada, jika tidak, pakai 75 sebagai fallback)
                    kkm_data = get_kkm(k['id'])
                    kkm_val = kkm_data[0]['kkm'] if kkm_data else 75

                    lulus_kkm = sum(1 for n in list_nilai if n >= kkm_val)
                    persentase_lulus = (lulus_kkm / len(list_nilai)) * 100

                    insights_data.append({
                        "Kelas": k['nama_kelas'],
                        "Rata-rata Nilai": round(rerata, 1),
                        "KKM": kkm_val,
                        "% Tuntas KKM": round(persentase_lulus, 1)
                    })

            if insights_data:
                df_insights = pd.DataFrame(insights_data)

                # Render chart visualisasi tuntas KKM
                chart_data = df_insights.set_index("Kelas")[["Rata-rata Nilai", "% Tuntas KKM"]]
                st.bar_chart(chart_data)

                # Tampilkan tabel ringkasan analitik
                st.dataframe(df_insights, use_container_width=True, hide_index=True)
            else:
                st.caption("Belum ada data nilai yang cukup untuk menghasilkan analitik.")
        else:
            st.info("Input nilai siswa terlebih dahulu untuk melihat grafik analitik KKM di sini.")

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
    
    # ===== AMBIL DAFTAR TOPIK YANG SUDAH ADA =====
    semua_nilai = get_nilai(kelas_id)
    topik_list = list(set([n.get('topik', '') for n in semua_nilai if n.get('topik')]))
    topik_list.sort()
    
    cols = st.columns(4)
    kategori = cols[0].selectbox(
        "Kategori",
        ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]
    )

    # ===== PILIH TOPIK (Baru atau Existing) =====
    if topik_list:
        topik_option = cols[1].selectbox(
            "Pilih Topik",
            ["+ Topik Baru"] + topik_list,
            help="Pilih topik yang sudah pernah digunakan, atau pilih '+ Topik Baru' untuk membuat baru"
        )
        
        if topik_option == "+ Topik Baru":
            topik = cols[1].text_input("Topik (Baru)", key="topik_baru")
        else:
            topik = topik_option
            # Ambil bab dari topik yang sama jika ada
            existing = next((n for n in semua_nilai if n.get('topik') == topik), None)
            bab_auto = existing.get('bab', '') if existing else ''
            if bab_auto:
                cols[2].info(f"📌 Bab sebelumnya: {bab_auto}")
    else:
        topik = cols[1].text_input("Topik")

    bab = cols[2].text_input("Bab")
    semester = cols[3].selectbox("Semester", [1, 2])
    tanggal = st.date_input("Tanggal", value=date.today())

    st.markdown("---")

    # Cek apakah sudah ada nilai untuk topik ini di kategori ini
    existing_nilai = [n for n in semua_nilai if n.get('topik') == topik and n['kategori'] == kategori]
    if existing_nilai and topik:
        st.warning(f"⚠️ Sudah ada {len(existing_nilai)} nilai untuk '{kategori}' dengan topik '{topik}'. Ini akan menambah data baru (tidak menghapus yang lama).")

    # Reset temp state jika kelas berubah
    if st.session_state.current_kelas_id != kelas_id:
        st.session_state.temp_nilai_kartu = {}
        st.session_state.temp_catatan_kartu = {}
        st.session_state.current_kelas_id = kelas_id

    siswa = get_siswa(kelas_id)
    if not siswa:
        st.warning("Belum ada siswa di kelas ini.")
        return

    st.subheader(f"📋 Daftar Siswa Kelas {kelas_terpilih}")
    st.caption(f"📝 Topik: **{topik}** | Kategori: **{kategori}** | Bab: **{bab if bab else '-'}**")

    # Pilihan Mode Tampilan
    mode_tampilan = st.radio(
        "📱 Mode Tampilan Input",
        ["📋 Tabel (Desktop/Laptop)", "📇 Kartu Touchscreen (Sangat Mudah di HP)", "📥 Import via Excel Template"],
        horizontal=True,
        key="input_nilai_mode"
    )

    if mode_tampilan == "📥 Import via Excel Template":
        st.subheader("📥 Import Nilai dari File Excel")
        st.write("Silahkan download template Excel di bawah ini, isi data nilai siswa Anda, lalu unggah kembali untuk disimpan secara massal.")

        # 1. Download Template Excel
        try:
            template_io = BytesIO()
            with pd.ExcelWriter(template_io, engine="openpyxl") as template_writer:
                # Membuat data siswa template dari data kelas ini jika ada, jika tidak kosong
                template_data = []
                for s in siswa:
                    template_data.append({
                        "Nama Siswa": s['nama'],
                        "Nilai": 0,
                        "Catatan": ""
                    })
                if not template_data:
                    template_data.append({
                        "Nama Siswa": "Contoh Nama Siswa Baru",
                        "Nilai": 85,
                        "Catatan": "Sangat Aktif"
                    })
                df_template = pd.DataFrame(template_data)
                df_template.to_excel(template_writer, index=False, sheet_name="Template Nilai")

            st.download_button(
                label="⬇️ Download Template Excel (.xlsx)",
                data=template_io.getvalue(),
                file_name=f"Template_Nilai_{kelas_terpilih}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
        except Exception as e:
            st.error(f"Gagal menyiapkan file template: {str(e)}")

        st.markdown("---")

        # 2. Upload File Excel
        uploaded_excel = st.file_uploader("Pilih File Excel yang Sudah Diisi", type=["xlsx", "xls"])

        if uploaded_excel:
            try:
                df_uploaded = pd.read_excel(uploaded_excel)
                if "Nama Siswa" not in df_uploaded.columns or "Nilai" not in df_uploaded.columns:
                    st.error("❌ Format file tidak sesuai! Kolom wajib memiliki 'Nama Siswa' dan 'Nilai'.")
                    return

                st.markdown("#### 🔍 Verifikasi Data Nilai Unggahan")
                st.dataframe(df_uploaded, use_container_width=True, hide_index=True)

                # Identifikasi siswa yang belum terdaftar di kelas (secara Case-Insensitive)
                siswa_db_names = [s['nama'].lower().strip() for s in siswa]
                unregistered_siswa = []

                for idx, row in df_uploaded.iterrows():
                    nama_input = str(row["Nama Siswa"]).strip()
                    if nama_input.lower() not in siswa_db_names and nama_input != "nan" and nama_input:
                        unregistered_siswa.append(nama_input)

                unregistered_siswa = list(set(unregistered_siswa)) # Hapus duplikat

                # Form Konfirmasi Registrasi Siswa Baru
                registrasi_diizinkan = True
                siswa_baru_yang_didaftarkan = []

                if unregistered_siswa:
                    st.warning(f"⚠️ Ditemukan {len(unregistered_siswa)} siswa baru di file Excel yang belum terdaftar di Kelas {kelas_terpilih}:")
                    for s_baru in unregistered_siswa:
                        st.markdown(f"- **{s_baru}**")

                    st.write("Apakah Anda ingin mendaftarkan siswa-siswa baru di atas ke dalam kelas ini secara otomatis?")
                    daftar_otomatis = st.checkbox("✅ Ya, daftarkan siswa baru tersebut langsung", value=True)
                    if not daftar_otomatis:
                        registrasi_diizinkan = False
                        st.error("❌ Silahkan centang konfirmasi pendaftaran di atas, atau edit file Excel Anda agar hanya berisi nama siswa yang terdaftar.")
                    else:
                        siswa_baru_yang_didaftarkan = unregistered_siswa

                submit_import = st.button("💾 Simpan Semua Nilai dari Excel", type="primary", use_container_width=True, disabled=not registrasi_diizinkan)

                if submit_import:
                    if not topik:
                        st.error("❌ Mohon isi kolom 'Topik' di bagian atas sebelum mengimpor nilai!")
                        return

                    try:
                        # 1. Daftarkan siswa baru jika ada persetujuan
                        for nama_baru in siswa_baru_yang_didaftarkan:
                            supabase.table("siswa").insert({
                                "nama": nama_baru,
                                "kelas_id": kelas_id
                            }).execute()

                        # Refresh cache & siswa list setelah penambahan siswa baru
                        clear_cache()
                        siswa_terbaru = get_siswa(kelas_id)
                        siswa_map_terbaru = {s['nama'].lower().strip(): s['id'] for s in siswa_terbaru}

                        saved = 0
                        updated = 0

                        for idx, row in df_uploaded.iterrows():
                            nama_key = str(row["Nama Siswa"]).strip().lower()
                            nilai_val = row["Nilai"]
                            catatan_val = row["Catatan"] if "Catatan" in df_uploaded.columns and pd.notna(row["Catatan"]) else None

                            if nama_key in siswa_map_terbaru and pd.notna(nilai_val) and nilai_val != 0:
                                s_id = siswa_map_terbaru[nama_key]

                                # Cek data ganda di db
                                existing = supabase.table("nilai").select("*")\
                                    .eq("siswa_id", s_id)\
                                    .eq("kelas_id", kelas_id)\
                                    .eq("kategori", kategori)\
                                    .eq("topik", topik).execute()

                                if existing.data:
                                    supabase.table("nilai").update({
                                        "nilai": float(nilai_val),
                                        "bab": bab,
                                        "tanggal": str(tanggal),
                                        "semester": semester,
                                        "catatan": catatan_val if catatan_val else None
                                    }).eq("id", existing.data[0]['id']).execute()
                                    updated += 1
                                else:
                                    supabase.table("nilai").insert({
                                        "siswa_id": s_id,
                                        "kelas_id": kelas_id,
                                        "kategori": kategori,
                                        "nilai": float(nilai_val),
                                        "topik": topik,
                                        "bab": bab,
                                        "tanggal": str(tanggal),
                                        "semester": semester,
                                        "catatan": catatan_val if catatan_val else None
                                    }).execute()
                                    saved += 1

                        clear_cache()
                        st.toast(f"✅ Berhasil import! {len(siswa_baru_yang_didaftarkan)} siswa baru terdaftar. {saved} nilai baru disimpan, {updated} nilai diperbarui.")
                        st.balloons()
                        st.rerun()
                    except Exception as e:
                        st.error(f"❌ Gagal memproses penyimpanan database: {str(e)}")
            except Exception as e:
                st.error(f"❌ Gagal membaca file Excel: {str(e)}")

    elif mode_tampilan == "📋 Tabel (Desktop/Laptop)":
        with st.form("form_tabel_nilai"):
            # ===== DATA EDITOR RAMAH SENTUHAN =====
            st.markdown("""
            <style>
                .stDataFrame {
                    font-size: 16px !important;
                }
                .stDataFrame input {
                    font-size: 18px !important;
                    padding: 12px !important;
                    min-height: 44px !important;
                }
                .stDataFrame textarea {
                    font-size: 16px !important;
                    padding: 12px !important;
                    min-height: 44px !important;
                }
            </style>
            """, unsafe_allow_html=True)

            data = []
            for s in siswa:
                key_num = f"num_{s['id']}"
                val = st.session_state.get(key_num, 0.0)
                nilai_sebelumnya = next((n['nilai'] for n in existing_nilai if n['siswa_id'] == s['id']), None)
                data.append({
                    "Nama": s['nama'],
                    "Nilai": float(val) if val > 0 else 0.0,
                    "Catatan": st.session_state.temp_catatan_kartu.get(s['id'], ""),
                    "Nilai Sebelumnya": nilai_sebelumnya if nilai_sebelumnya else "-"
                })

            df_input = pd.DataFrame(data)

            edited_df = st.data_editor(
                df_input,
                column_config={
                    "Nama": st.column_config.TextColumn(
                        "Nama",
                        disabled=True,
                        width="medium"
                    ),
                    "Nilai": st.column_config.NumberColumn(
                        "Nilai",
                        min_value=-50,  # Diubah agar mendukung nilai minus sampai -50 (khusus sikap & harian)
                        max_value=100,
                        step=1,
                        format="%.0f",
                        width="small"
                    ),
                    "Catatan": st.column_config.TextColumn(
                        "Catatan",
                        width="large"
                    ),
                    "Nilai Sebelumnya": st.column_config.TextColumn(
                        "Nilai Sebelumnya",
                        disabled=True,
                        width="small"
                    )
                },
                hide_index=True,
                use_container_width=True,
                num_rows="fixed"
            )

            # Panduan HP
            st.caption("💡 Ketuk kolom Nilai untuk mengisi angka | Geser tabel untuk lihat semua kolom")
            submit = st.form_submit_button("💾 Simpan Semua Nilai (Tabel)")

            if submit:
                if not topik:
                    st.error("❌ Topik wajib diisi!")
                else:
                    try:
                        saved = 0
                        updated = 0
                        for idx, row in edited_df.iterrows():
                            s_id = siswa[idx]['id']
                            st.session_state[f"num_{s_id}"] = float(row['Nilai'])
                            st.session_state.temp_catatan_kartu[s_id] = row['Catatan']

                            if row['Nilai'] != 0:  # Diubah dari > 0 agar nilai minus (negatif) bisa ikut disimpan
                                # Cek apakah sudah ada nilai untuk siswa + topik + kategori ini
                                existing = supabase.table("nilai").select("*")\
                                    .eq("siswa_id", s_id)\
                                    .eq("kelas_id", kelas_id)\
                                    .eq("kategori", kategori)\
                                    .eq("topik", topik).execute()

                                if existing.data:
                                    # Update nilai yang sudah ada
                                    supabase.table("nilai").update({
                                        "nilai": row['Nilai'],
                                        "bab": bab,
                                        "tanggal": str(tanggal),
                                        "semester": semester,
                                        "catatan": row['Catatan'] if row['Catatan'] else None
                                    }).eq("id", existing.data[0]['id']).execute()
                                    updated += 1
                                else:
                                    # Insert nilai baru
                                    supabase.table("nilai").insert({
                                        "siswa_id": s_id,
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
                        st.toast(f"✅ Berhasil menyimpan! {saved} data baru, {updated} data diperbarui.")
                        st.balloons()
                    except Exception as e:
                        st.error(f"❌ Gagal menyimpan: {str(e)}")

    else:
        # ===== MODE KARTU TOUCHSCREEN (SANGAT MUDAH DI HP) =====
        st.markdown("""
        <style>
            .touch-card {
                background: white;
                border-radius: 14px;
                padding: 16px;
                margin-bottom: 16px;
                border: 1px solid #e2e8f0;
                box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
            }
            .touch-nama {
                font-size: 18px;
                font-weight: 700;
                color: #1e293b;
                margin-bottom: 8px;
            }
            .touch-label {
                font-size: 13px;
                color: #64748b;
            }
            .touch-prev {
                font-size: 13px;
                color: #94a3b8;
                font-style: italic;
            }
        </style>
        """, unsafe_allow_html=True)

        # Inisialisasi local temp state jika kosong
        # Sinkronisasi widget state key langsung ke number_input
        for s in siswa:
            key_num = f"num_{s['id']}"
            if key_num not in st.session_state:
                st.session_state[key_num] = 0.0
            if s['id'] not in st.session_state.temp_catatan_kartu:
                st.session_state.temp_catatan_kartu[s['id']] = ""

        for s in siswa:
            nilai_sebelumnya = next((n['nilai'] for n in existing_nilai if n['siswa_id'] == s['id']), None)
            prev_text = f"Nilai Sebelumnya: {nilai_sebelumnya:.0f}" if nilai_sebelumnya else "Belum ada nilai sebelumnya"

            # Render dalam custom layout container
            st.markdown(f"""
            <div class="touch-card">
                <div class="touch-nama">👨‍🎓 {s['nama']}</div>
                <div class="touch-prev">📌 {prev_text}</div>
            </div>
            """, unsafe_allow_html=True)

            col_actions = st.columns([1, 1, 1, 2])

            # Callback untuk tombol + & - agar langsung mengubah widget key secara instan
            def update_grade(s_id, amount):
                key_num = f"num_{s_id}"
                cur_val = st.session_state.get(key_num, 0.0)
                new_val = max(-50.0, min(100.0, cur_val + amount))  # Diubah batas bawahnya agar bisa sampai -50.0
                st.session_state[key_num] = float(new_val)

            # Tombol Minus (-)
            col_actions[0].button(
                "➖ 5",
                key=f"minus5_{s['id']}",
                on_click=update_grade,
                args=(s['id'], -5.0),
                use_container_width=True
            )

            # Tombol Plus (+)
            col_actions[1].button(
                "➕ 5",
                key=f"plus5_{s['id']}",
                on_click=update_grade,
                args=(s['id'], 5.0),
                use_container_width=True
            )

            # Input Angka Langsung (nilai bind ke st.session_state[key_num] via parameter key)
            nilai_val = col_actions[2].number_input(
                "Nilai",
                min_value=-50.0,  # Diubah batas bawahnya agar mendukung nilai minus sampai -50.0
                max_value=100.0,
                step=1.0,
                key=f"num_{s['id']}",
                label_visibility="collapsed"
            )

            # Input Catatan
            st.session_state.temp_catatan_kartu[s['id']] = col_actions[3].text_input(
                "Catatan",
                placeholder="Catatan keaktifan/remedial...",
                key=f"note_{s['id']}",
                value=st.session_state.temp_catatan_kartu[s['id']],
                label_visibility="collapsed"
            )
            st.markdown("<br>", unsafe_allow_html=True)

        # Tombol Simpan Terpisah (tidak di dalam form)
        submit_kartu = st.button("💾 Simpan Semua Nilai Kartu", type="primary", use_container_width=True)

        if submit_kartu:
            if not topik:
                st.error("❌ Topik wajib diisi!")
            else:
                try:
                    saved = 0
                    updated = 0
                    for s in siswa:
                        nilai_val = st.session_state.get(f"num_{s['id']}", 0.0)
                        catatan_val = st.session_state.temp_catatan_kartu[s['id']]
                        if nilai_val != 0:  # Diubah dari > 0 agar nilai minus (negatif) bisa ikut disimpan
                            # Cek apakah sudah ada nilai untuk siswa + topik + kategori ini
                            existing = supabase.table("nilai").select("*")\
                                .eq("siswa_id", s['id'])\
                                .eq("kelas_id", kelas_id)\
                                .eq("kategori", kategori)\
                                .eq("topik", topik).execute()

                            if existing.data:
                                # Update nilai yang sudah ada
                                supabase.table("nilai").update({
                                    "nilai": nilai_val,
                                    "bab": bab,
                                    "tanggal": str(tanggal),
                                    "semester": semester,
                                    "catatan": catatan_val if catatan_val else None
                                }).eq("id", existing.data[0]['id']).execute()
                                updated += 1
                            else:
                                # Insert nilai baru
                                supabase.table("nilai").insert({
                                    "siswa_id": s['id'],
                                    "kelas_id": kelas_id,
                                    "kategori": kategori,
                                    "nilai": nilai_val,
                                    "topik": topik,
                                    "bab": bab,
                                    "tanggal": str(tanggal),
                                    "semester": semester,
                                    "catatan": catatan_val if catatan_val else None
                                }).execute()
                                saved += 1

                    clear_cache()
                    st.toast(f"✅ Berhasil menyimpan! {saved} data baru, {updated} data diperbarui.")
                    st.balloons()

                    # Reset temp state
                    for s in siswa:
                        st.session_state[f"num_{s['id']}"] = 0.0
                        st.session_state.temp_catatan_kartu[s['id']] = ""
                    st.rerun()
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

    # ===== SEARCH LINTAS KELAS / FILTER KELAS UTAMA =====
    col_search_kelas = st.columns([1, 1])
    search_nama_lintas = col_search_kelas[0].text_input("🔍 Cari Siswa Lintas Kelas (Ketik Nama)", placeholder="Masukkan nama siswa...")

    kelas_terpilih = col_search_kelas[1].selectbox("Pilih Kelas", list(kelas_options.keys()))
    kelas_id = kelas_options[kelas_terpilih]
    
    st.markdown("### 🔍 Filter Pencarian & KKM")
    cols_filt = st.columns(4)
    kategori_filter = cols_filt[0].selectbox(
        "Filter Kategori", 
        ["Semua", "Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]
    )
    semester_filter = cols_filt[1].selectbox(
        "Filter Semester",
        ["Semua", 1, 2]
    )
    topik_filter = cols_filt[2].text_input("Filter Topik")
    show_stats = cols_filt[3].checkbox("Tampilkan Statistik", value=True)
    
    cols_filt2 = st.columns(3)
    filter_kkm = cols_filt2[0].selectbox(
        "Filter Pencapaian KKM",
        ["Semua", "Lulus (>= KKM)", "Tidak Lulus (< KKM)"]
    )

    # Ambil nilai KKM kelas saat ini (default 75)
    kkm_data = get_kkm(kelas_id)
    kkm_val = kkm_data[0]['kkm'] if kkm_data else 75

    # Filter Rentang Tanggal
    tanggal_mulai = cols_filt2[1].date_input("Tanggal Mulai", value=date.today() - timedelta(days=90))
    tanggal_akhir = cols_filt2[2].date_input("Tanggal Akhir", value=date.today() + timedelta(days=1))

    # Ambil data siswa & nilai
    if search_nama_lintas:
        # Lintas kelas: cari semua siswa yang namanya cocok
        semua_siswa_db = supabase.table("siswa").select("*").execute().data
        siswa_match = [s for s in semua_siswa_db if search_nama_lintas.lower() in s['nama'].lower()]
        if not siswa_match:
            st.warning(f"Siswa dengan nama '{search_nama_lintas}' tidak ditemukan.")
            return
        siswa = siswa_match
        # Ambil semua data nilai untuk para siswa ini
        siswa_ids = [s['id'] for s in siswa]
        nilai = []
        for s_id in siswa_ids:
            nilai.extend(supabase.table("nilai").select("*").eq("siswa_id", s_id).execute().data)
    else:
        siswa = get_siswa(kelas_id)
        nilai = get_nilai(kelas_id)

    if not nilai:
        st.info("Belum ada data nilai untuk filter ini.")
        return

    # Saring nilai berdasarkan filter input
    if kategori_filter != "Semua":
        nilai = [n for n in nilai if n['kategori'] == kategori_filter]
    if semester_filter != "Semua":
        nilai = [n for n in nilai if n.get('semester', 1) == semester_filter]
    if topik_filter:
        nilai = [n for n in nilai if topik_filter.lower() in n.get('topik', '').lower()]

    # Saring berdasarkan tanggal
    def parse_tgl(t):
        if not t:
            return None
        if isinstance(t, str):
            return datetime.strptime(t, "%Y-%m-%d").date()
        return t

    nilai = [n for n in nilai if n.get('tanggal') and tanggal_mulai <= parse_tgl(n['tanggal']) <= tanggal_akhir]
    
    # Rekonstruksi data tabel
    data = []
    for s in siswa:
        row = {"Nama": s['nama']}
        # Hubungkan ke kelas asalnya jika lintas kelas
        if search_nama_lintas:
            kelas_match = next((k['nama_kelas'] for k in kelas if k['id'] == s['kelas_id']), "Unknown")
            row["Kelas"] = kelas_match

        for kat in ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]:
            row[kat] = 0.0

        nilai_s = [n for n in nilai if n['siswa_id'] == s['id']]
        for kat in ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]:
            nilai_kat = [n['nilai'] for n in nilai_s if n['kategori'] == kat]
            if nilai_kat:
                # Ambil rata-rata nilai siswa pada kategori ini
                row[kat] = round(sum(nilai_kat) / len(nilai_kat), 1)

        # Filter pencapaian KKM
        # Tentukan nilai patokan rata-rata (misal dari seluruh kategori yang diisi)
        nilai_rata_rata = [row[kat] for kat in ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"] if row[kat] > 0 or row[kat] < 0]
        rata_akhir = sum(nilai_rata_rata) / len(nilai_rata_rata) if nilai_rata_rata else 0

        row["Rata-Rata Akhir"] = round(rata_akhir, 1)

        if filter_kkm == "Lulus (>= KKM)" and rata_akhir < kkm_val:
            continue
        elif filter_kkm == "Tidak Lulus (< KKM)" and (rata_akhir >= kkm_val or rata_akhir == 0):
            continue

        data.append(row)

    if not data:
        st.warning("Tidak ada data siswa yang cocok dengan kriteria pencapaian KKM ini.")
        return

    df = pd.DataFrame(data)

    # Atur kolom berdasarkan pencarian lintas kelas
    kolom_tampil = ["Nama"]
    if search_nama_lintas:
        kolom_tampil.append("Kelas")
    kolom_tampil.extend(["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran", "Rata-Rata Akhir"])

    st.markdown(f"#### 📋 Rekapitulasi Nilai Siswa (KKM Kelas Saat Ini: **{kkm_val}**)")
    st.dataframe(df[kolom_tampil], use_container_width=True, hide_index=True)

    # ===== GRAFIK PERKEMBANGAN NILAI (LINE CHART) =====
    st.markdown("### 📈 Grafik Perkembangan Nilai Siswa (Tren Belajar)")
    st.caption("Pilih nama siswa untuk memantau grafik perkembangan nilai dari tanggal ke tanggal secara dinamis.")

    siswa_nama_list = df["Nama"].tolist()
    siswa_grafik_terpilih = st.selectbox("Pilih Siswa untuk Grafik Perkembangan", siswa_nama_list)

    if siswa_grafik_terpilih:
        s_id_match = next((s['id'] for s in siswa if s['nama'] == siswa_grafik_terpilih), None)
        if s_id_match:
            nilai_perkembangan = [n for n in nilai if n['siswa_id'] == s_id_match and n.get('tanggal')]
            if nilai_perkembangan:
                # Urutkan berdasarkan tanggal
                nilai_perkembangan = sorted(nilai_perkembangan, key=lambda x: parse_tgl(x['tanggal']))

                chart_rows = []
                for n in nilai_perkembangan:
                    chart_rows.append({
                        "Tanggal": str(parse_tgl(n['tanggal'])),
                        "Nilai": n['nilai'],
                        "Kategori-Topik": f"{n['kategori']} ({n.get('topik', 'Umum')})"
                    })
                df_chart = pd.DataFrame(chart_rows)

                # Tampilkan grafik garis perkembangan nilai
                st.line_chart(df_chart.set_index("Tanggal")["Nilai"])

                with st.expander("🔍 Detail Riwayat Penilaian Siswa", expanded=False):
                    st.dataframe(df_chart, use_container_width=True, hide_index=True)
            else:
                st.info(f"Belum ada riwayat penilaian bertanggal untuk {siswa_grafik_terpilih}.")
    
    if show_stats and len(df) > 0:
        st.markdown("---")
        st.subheader("📊 Analitik Distribusi & Statistik Nilai")
        
        kategori_kolom = ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]
        existing_kolom = [k for k in kategori_kolom if k in df.columns]
        
        if existing_kolom:
            stats_data = []
            distribution_bins = {"< KKM (Tidak Tuntas)": 0, "70 - 79": 0, "80 - 89": 0, "90 - 100": 0}

            for kat in existing_kolom:
                # Mengubah filter df[kat] > 0 menjadi df[kat] != 0 agar nilai negatif (minus) ikut masuk dalam statistik analitik
                values = df[kat][df[kat] != 0]
                if len(values) > 0:
                    stats_data.append({
                        "Kategori": kat,
                        "Rata-rata": round(values.mean(), 2),
                        "Tertinggi": values.max(),
                        "Terendah": values.min(),
                        "Jumlah Data": len(values)
                    })

                    # Hitung distribusi rentang nilai
                    for val in values:
                        if val < kkm_val:
                            distribution_bins["< KKM (Tidak Tuntas)"] += 1
                        elif val < 80:
                            distribution_bins["70 - 79"] += 1
                        elif val < 90:
                            distribution_bins["80 - 89"] += 1
                        else:
                            distribution_bins["90 - 100"] += 1
            
            if stats_data:
                df_stats = pd.DataFrame(stats_data)
                
                # Render metrik statistik utama di atas grafik
                col_m1, col_m2 = st.columns(2)
                with col_m1:
                    st.markdown("##### 📈 Rata-rata per Kategori")
                    chart_data = df_stats[['Kategori', 'Rata-rata']].set_index('Kategori')
                    st.bar_chart(chart_data)

                with col_m2:
                    st.markdown("##### 📊 Distribusi Rentang Pencapaian Nilai Siswa")
                    df_dist = pd.DataFrame(list(distribution_bins.items()), columns=["Rentang Nilai", "Jumlah Siswa"])
                    st.bar_chart(df_dist.set_index("Rentang Nilai"))

                st.markdown("##### 📝 Ringkasan Statistik Lengkap")
                st.dataframe(df_stats, use_container_width=True, hide_index=True)
            else:
                st.info("Belum ada data nilai yang cukup untuk statistik.")
    
    st.markdown("---")
    st.subheader("📥 Ekspor Laporan Nilai Lebih Kaya (.xlsx)")

    col_eks = st.columns(3)

    # Opsi 1: Ekspor Ringkasan Saat Ini
    with col_eks[0]:
        st.markdown("**1. Rekap Kelas Saat Ini**")
        st.caption("Mengekspor seluruh tabel ringkasan beserta rincian nilai sesuai filter aktif.")
        if st.button("📥 Ekspor Rekap Kelas"):
            try:
                output = BytesIO()
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    df_ringkasan = df[kolom_tampil].copy()
                    df_ringkasan.to_excel(writer, sheet_name="Ringkasan Kelas", index=False)

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
                    df_detail.to_excel(writer, sheet_name="Detail Nilai", index=False)
                
                st.download_button(
                    label="⬇️ Download Excel Rekap",
                    data=output.getvalue(),
                    file_name=f"Rekap_Nilai_{kelas_terpilih}_{date.today()}.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    key="dl_rekap_kelas"
                )
                st.success("File Rekap Kelas siap didownload!")
            except Exception as e:
                st.error(f"❌ Gagal export: {str(e)}")

    # Opsi 2: Ekspor Per Siswa (Semua nilai 1 siswa dalam file khusus)
    with col_eks[1]:
        st.markdown("**2. Laporan Per Siswa**")
        st.caption("Mengekspor semua riwayat nilai milik 1 siswa pilihan Anda ke dalam satu file Excel.")
        siswa_eks_pilihan = st.selectbox("Pilih Siswa untuk Diekspor", df["Nama"].tolist(), key="select_siswa_eks")

        if st.button("📥 Ekspor Laporan Siswa"):
            try:
                s_match = next((s for s in siswa if s['nama'] == siswa_eks_pilihan), None)
                if s_match:
                    output = BytesIO()
                    with pd.ExcelWriter(output, engine='openpyxl') as writer:
                        # Tab 1: Ringkasan Rata-rata Kategori
                        row_s = df[df["Nama"] == siswa_eks_pilihan].copy()
                        row_s.to_excel(writer, sheet_name="Ringkasan Kompetensi", index=False)

                        # Tab 2: Rincian Lengkap Riwayat
                        nilai_s = [n for n in nilai if n['siswa_id'] == s_match['id']]
                        detail_rows = []
                        for n in nilai_s:
                            detail_rows.append({
                                "Kategori": n['kategori'],
                                "Nilai": n['nilai'],
                                "Topik": n.get('topik', ''),
                                "Bab": n.get('bab', ''),
                                "Tanggal": n.get('tanggal', ''),
                                "Semester": n.get('semester', 1),
                                "Catatan": n.get('catatan', '')
                            })
                        df_s_detail = pd.DataFrame(detail_rows)
                        df_s_detail.to_excel(writer, sheet_name="Rincian Riwayat Belajar", index=False)

                    st.download_button(
                        label="⬇️ Download Excel Siswa",
                        data=output.getvalue(),
                        file_name=f"Laporan_Nilai_{siswa_eks_pilihan.replace(' ', '_')}_{date.today()}.xlsx",
                        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                        key="dl_laporan_siswa"
                    )
                    st.success(f"Laporan nilai {siswa_eks_pilihan} siap didownload!")
            except Exception as e:
                st.error(f"❌ Gagal: {str(e)}")

    # Opsi 3: Ekspor Per Kategori (Seluruh siswa, khusus 1 kategori)
    with col_eks[2]:
        st.markdown("**3. Laporan Per Kategori**")
        st.caption("Mengekspor riwayat nilai seluruh siswa pada satu kategori kompetensi spesifik.")
        kat_eks_pilihan = st.selectbox("Pilih Kategori untuk Diekspor", ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"], key="select_kat_eks")

        if st.button("📥 Ekspor Laporan Kategori"):
            try:
                output = BytesIO()
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    # Filter data rekap untuk kategori ini saja
                    df_kat = df[["Nama", kat_eks_pilihan, "Rata-Rata Akhir"]].copy()
                    df_kat.to_excel(writer, sheet_name=f"Nilai {kat_eks_pilihan}", index=False)

                    # Rincian per materi/topik pada kategori ini
                    detail_rows = []
                    for s in siswa:
                        nilai_s_kat = [n for n in nilai if n['siswa_id'] == s['id'] and n['kategori'] == kat_eks_pilihan]
                        for n in nilai_s_kat:
                            detail_rows.append({
                                "Nama Siswa": s['nama'],
                                "Nilai": n['nilai'],
                                "Topik": n.get('topik', ''),
                                "Bab": n.get('bab', ''),
                                "Tanggal": n.get('tanggal', ''),
                                "Semester": n.get('semester', 1),
                                "Catatan": n.get('catatan', '')
                            })
                    df_kat_detail = pd.DataFrame(detail_rows)
                    df_kat_detail.to_excel(writer, sheet_name="Rincian per Topik", index=False)

                st.download_button(
                    label="⬇️ Download Excel Kategori",
                    data=output.getvalue(),
                    file_name=f"Laporan_Kategori_{kat_eks_pilihan}_{date.today()}.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    key="dl_laporan_kategori"
                )
                st.success(f"Laporan kategori {kat_eks_pilihan} siap didownload!")
            except Exception as e:
                st.error(f"❌ Gagal: {str(e)}")

# ============ HALAMAN: KALENDER & JADWAL ============
def page_jadwal():
    st.title("📅 Kalender & Jadwal")
    
    # ===== CALLBACK JADWAL =====
    def select_jadwal_to_delete(jadwal_id, text):
        st.session_state.hapus_id = jadwal_id
        st.session_state.hapus_text = text

    def confirm_delete_jadwal():
        try:
            supabase.table("jadwal").delete().eq("id", st.session_state.hapus_id).execute()
            clear_cache()
            st.session_state.jadwal_success_msg = f"✅ Jadwal '{st.session_state.hapus_text}' berhasil dihapus!"
        except Exception as e:
            st.session_state.jadwal_error_msg = f"❌ Gagal menghapus jadwal: {str(e)}"
        st.session_state.hapus_id = None
        st.session_state.hapus_text = ""

    def cancel_delete_jadwal():
        st.session_state.hapus_id = None
        st.session_state.hapus_text = ""

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
        
        # Tampilkan pesan umpan balik jika ada
        if st.session_state.jadwal_success_msg:
            st.success(st.session_state.jadwal_success_msg)
            st.session_state.jadwal_success_msg = None
        if st.session_state.jadwal_error_msg:
            st.error(st.session_state.jadwal_error_msg)
            st.session_state.jadwal_error_msg = None

        # ===== FILTER =====
        cols_filter = st.columns([2, 2, 2, 1])
        kelas_lihat = cols_filter[0].selectbox(
            "Pilih Kelas", 
            ["Semua Kelas"] + list(kelas_options.keys())
        )
        filter_semester = cols_filter[1].selectbox(
            "Filter Semester",
            ["Semua", 1, 2]
        )
        filter_minggu = cols_filter[2].selectbox(
            "Filter Minggu",
            ["Semua"] + [f"Minggu {i}" for i in range(1, 21)]
        )
        mode_hapus = cols_filter[3].checkbox("🗑️ Mode Hapus", value=False, help="Centang untuk menampilkan tombol hapus")
        
        # ===== AMBIL DATA =====
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
        
        # ===== FILTER DATA =====
        if filter_semester != "Semua":
            jadwal = [j for j in jadwal if j.get('semester', 1) == filter_semester]
        if filter_minggu != "Semua":
            minggu_ke = int(filter_minggu.split()[1])
            jadwal = [j for j in jadwal if j.get('minggu_ke', 0) == minggu_ke]
        
        # ===== TAMPILKAN TABEL =====
        if jadwal:
            # Buat dataframe
            df = pd.DataFrame(jadwal)
            df['hari_angka'] = df['hari'].apply(hari_ke_angka)
            df['jam_time'] = pd.to_datetime(df['jam'])
            df = df.sort_values(['hari_angka', 'jam_time'])
            
            # Format jam
            df['jam_format'] = df['jam'].apply(lambda x: x[:5] if isinstance(x, str) else str(x)[:5])
            
            # ===== TAMPILKAN DENGAN TOMBOL HAPUS =====
            if mode_hapus:
                st.warning("🗑️ Mode Hapus AKTIF - Klik tombol 'Hapus' di samping jadwal yang ingin dihapus")
                
                # Tampilkan per baris dengan tombol hapus
                for idx, row in df.iterrows():
                    cols = st.columns([1.5, 1, 1, 2.5, 1.5, 0.8, 0.8, 0.8])
                    
                    cols[0].write(row.get('nama_kelas', '-'))
                    cols[1].write(row['hari'])
                    cols[2].write(row['jam_format'])
                    cols[3].write(row.get('topik', '-')[:30])
                    cols[4].write(row.get('bab', '-'))
                    cols[5].write(f"M{row.get('minggu_ke', '-')}")
                    cols[6].write(f"S{row.get('semester', '-')}")
                    
                    # Menggunakan callback on_click untuk menyimpan state tanpa interupsi rerun instan
                    row_text = f"{row['hari']} {row['jam_format']} - {row.get('topik', '-')}"
                    cols[7].button(
                        "🗑️",
                        key=f"del_{row['id']}_{idx}",
                        on_click=select_jadwal_to_delete,
                        args=(row['id'], row_text)
                    )
                
                # ===== TAMPILKAN KONFIRMASI DI BAWAH SEMUA BARIS (Di luar loop dan di luar nesting tombol) =====
                if st.session_state.hapus_id is not None:
                    st.markdown("---")
                    st.warning(f"⚠️ Yakin hapus jadwal: **{st.session_state.hapus_text}**?")
                    
                    col_confirm = st.columns([1, 1, 2])
                    col_confirm[0].button(
                        "✅ Ya, Hapus!",
                        key="confirm_yes_fix",
                        on_click=confirm_delete_jadwal
                    )
                    col_confirm[1].button(
                        "❌ Batal",
                        key="confirm_no_fix",
                        on_click=cancel_delete_jadwal
                    )
            else:
                # Tampilkan tabel biasa (tanpa tombol hapus)
                df_display = df[['nama_kelas', 'hari', 'jam_format', 'topik', 'bab', 'minggu_ke', 'semester']].copy()
                df_display.columns = ['Kelas', 'Hari', 'Jam', 'Topik', 'Bab', 'Minggu', 'Semester']
                
                st.dataframe(
                    df_display,
                    use_container_width=True,
                    hide_index=True,
                    column_config={
                        "Kelas": st.column_config.TextColumn("Kelas", width="small"),
                        "Hari": st.column_config.TextColumn("Hari", width="small"),
                        "Jam": st.column_config.TextColumn("Jam", width="small"),
                        "Topik": st.column_config.TextColumn("Topik", width="large"),
                        "Bab": st.column_config.TextColumn("Bab", width="medium"),
                        "Minggu": st.column_config.NumberColumn("Minggu", width="small"),
                        "Semester": st.column_config.NumberColumn("Semester", width="small"),
                    }
                )
            
            # ===== HAPUS MASSAL =====
            if mode_hapus:
                st.markdown("---")
                with st.expander("🗑️ Hapus Semua Jadwal (Massal)", expanded=False):
                    st.warning("⚠️ Tindakan ini akan menghapus SEMUA jadwal yang sedang ditampilkan!")
                    st.caption(f"Total {len(jadwal)} jadwal akan dihapus")
                    
                    if st.button("🗑️ Hapus Semua Jadwal yang Tampil", type="primary"):
                        try:
                            for j in jadwal:
                                supabase.table("jadwal").delete().eq("id", j['id']).execute()
                            clear_cache()
                            st.success(f"✅ Berhasil menghapus {len(jadwal)} jadwal!")
                            st.rerun()
                        except Exception as e:
                            st.error(f"❌ Gagal: {str(e)}")
            
            # Informasi total
            info_text = f"📊 Total {len(jadwal)} jadwal"
            if mode_hapus:
                info_text += " | 🗑️ Mode Hapus AKTIF"
            else:
                info_text += " | 💡 Centang 'Mode Hapus' untuk menghapus"
            st.info(info_text)
        else:
            st.info("📭 Belum ada jadwal untuk filter ini.")
    
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
                    st.toast("✅ Jadwal berhasil ditambahkan!")
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Gagal: {str(e)}")
    
        # === TAB 3: GENERATE MANUAL ===
    with tab3:
        st.subheader("⚡ Generate Jadwal Berdasarkan Bab")
        st.info("💡 Tentukan durasi setiap bab (berapa minggu) untuk membuat jadwal fleksibel")
        
        # Pastikan ukuran hapus_bab_check sesuai dengan daftar_bab
        if len(st.session_state.hapus_bab_check) != len(st.session_state.daftar_bab):
            st.session_state.hapus_bab_check = [False] * len(st.session_state.daftar_bab)

        # ===== FORM UTAMA (SEMUA DALAM SATU FORM) =====
        with st.form("form_generate"):
            cols = st.columns(2)
            kelas_gen = cols[0].selectbox("Kelas", list(kelas_options.keys()))
            hari_gen = cols[0].selectbox("Hari", ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"])
            
            # ===== PILIHAN JAM =====
            jam_options = []
            for h in range(24):
                for m in range(0, 60, 5):
                    jam_options.append(f"{h:02d}:{m:02d}")
            
            default_jam = "07:30"
            default_index = jam_options.index(default_jam) if default_jam in jam_options else 0
            
            jam_pilihan = cols[1].selectbox(
                "Jam Mulai (Format 24 jam)",
                jam_options,
                index=default_index,
                help="Pilih jam mulai dengan interval 5 menit (00:00 - 23:55)"
            )
            
            jam_gen = datetime.strptime(jam_pilihan, "%H:%M").time()
            semester_gen = cols[1].selectbox("Semester", [1, 2])
            
            st.markdown("---")
            st.subheader("📝 Daftar Bab & Durasi")
            st.caption("Centang ☑️ 'Hapus' pada bab yang ingin dihapus, lalu klik tombol di bawah")
            
            # ===== TAMPILAN BAB =====
            for idx, bab in enumerate(st.session_state.daftar_bab):
                cols_bab = st.columns([3, 1, 1])
                cols_bab[0].write(f"{idx+1}. {bab['nama']}")
                cols_bab[1].write(f"{bab['durasi']} minggu")
                
                # [FIX] Checkbox dengan key unik
                check_key = f"check_del_bab_{idx}_{bab['nama']}"
                st.session_state.hapus_bab_check[idx] = cols_bab[2].checkbox(
                    "Hapus", 
                    key=check_key
                )
            
            # ===== TOMBOL KELOLA BAB (DI DALAM FORM) =====
            st.markdown("---")
            st.subheader("⚙️ Kelola Bab")
            
            col_btn = st.columns([1, 1, 1])
            
            # Tombol hapus
            if col_btn[0].form_submit_button(
                "🗑️ Hapus Bab yang Dipilih", 
                use_container_width=True
            ):
                # Hapus dari belakang agar index tidak berubah
                for idx in reversed(range(len(st.session_state.daftar_bab))):
                    if st.session_state.hapus_bab_check[idx]:
                        st.session_state.daftar_bab.pop(idx)
                        st.session_state.hapus_bab_check.pop(idx)
                st.rerun()
            
            # Tombol reset
            if col_btn[1].form_submit_button(
                "🔄 Reset Daftar Bab", 
                use_container_width=True
            ):
                st.session_state.daftar_bab = [
                    {"nama": "Bab 1 - Pengenalan", "durasi": 2},
                    {"nama": "Bab 2 - Operasi Dasar", "durasi": 2},
                    {"nama": "Bab 3 - Review & UH", "durasi": 1},
                ]
                st.session_state.hapus_bab_check = [False] * len(st.session_state.daftar_bab)
                st.rerun()
            
            # ===== TOTAL MINGGU =====
            total_minggu = sum([bab['durasi'] for bab in st.session_state.daftar_bab])
            st.info(f"📊 **Total: {len(st.session_state.daftar_bab)} bab** | **{total_minggu} minggu**")
            
            if total_minggu == 0:
                st.error("❌ Total minggu tidak boleh 0! Tambahkan bab terlebih dahulu.")
            
            st.warning("⚠️ Periksa kembali data di atas. Jadwal yang sudah ada akan dihapus dan diganti!")
            
            # ===== TOMBOL GENERATE =====
            submit_gen = st.form_submit_button(
                "🚀 Generate Jadwal", 
                type="primary", 
                use_container_width=True,
                disabled=(total_minggu == 0)
            )
            
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
                        st.session_state.daftar_bab,
                        semester_gen,
                        tahun_ajaran
                    )
                    
                    if jadwal_baru:
                        for j in jadwal_baru:
                            supabase.table("jadwal").insert(j).execute()
                        
                        clear_cache()
                        st.toast(f"✅ Berhasil generate {len(jadwal_baru)} jadwal untuk {kelas_gen}!")
                        st.balloons()
                        st.rerun()
                    
                except Exception as e:
                    st.error(f"❌ Gagal generate: {str(e)}")
        
        # ===== FORM TAMBAH BAB (TERPISAH) =====
        with st.form("form_tambah_bab"):
            st.subheader("➕ Tambah Bab")
            cols_add = st.columns([2, 1, 1])
            
            nama_bab_baru = cols_add[0].text_input("Nama Bab", placeholder="Contoh: Bab 4 - Pengukuran")
            durasi_bab_baru = cols_add[1].number_input("Durasi (minggu)", min_value=1, max_value=6, value=1)
            
            submit_tambah = cols_add[2].form_submit_button("➕ Tambah Bab", use_container_width=True)
            
            if submit_tambah:
                if nama_bab_baru:
                    st.session_state.daftar_bab.append({
                        "nama": nama_bab_baru,
                        "durasi": durasi_bab_baru
                    })
                    st.session_state.hapus_bab_check.append(False)
                    st.rerun()
                else:
                    st.error("❌ Nama bab wajib diisi!")
                    
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
                        st.toast("✅ Soal berhasil disimpan!")
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
    
    # ===== CALLBACK DOKUMEN =====
    def select_doc_to_delete(doc_id, judul):
        st.session_state.hapus_doc_id = doc_id
        st.session_state.hapus_doc_judul = judul

    def confirm_delete_doc():
        try:
            supabase.table("dokumen").delete().eq("id", st.session_state.hapus_doc_id).execute()
            clear_cache()
            st.session_state.doc_success_msg = f"✅ Dokumen '{st.session_state.hapus_doc_judul}' berhasil dihapus!"
        except Exception as e:
            st.session_state.doc_error_msg = f"❌ Gagal menghapus dokumen: {str(e)}"
        st.session_state.hapus_doc_id = None
        st.session_state.hapus_doc_judul = ""

    def cancel_delete_doc():
        st.session_state.hapus_doc_id = None
        st.session_state.hapus_doc_judul = ""

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
                            
                            st.toast(f"✅ Dokumen '{judul}' berhasil diupload! (hemat {saving:.0f}%)")
                            st.balloons()
                            
                    except Exception as e:
                        st.error(f"❌ Gagal upload: {str(e)}")
    
    # ===== TAB 2: LIHAT DOKUMEN =====
    with tab2:
        st.subheader("Daftar Dokumen")
        
        # Tampilkan pesan umpan balik jika ada
        if st.session_state.doc_success_msg:
            st.success(st.session_state.doc_success_msg)
            st.session_state.doc_success_msg = None
        if st.session_state.doc_error_msg:
            st.error(st.session_state.doc_error_msg)
            st.session_state.doc_error_msg = None

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
                    
                    cols[3].button(
                        "🗑️",
                        key=f"del_doc_{d['id']}",
                        on_click=select_doc_to_delete,
                        args=(d['id'], d['judul'])
                    )
                    
                    st.markdown("---")

            # ===== TAMPILKAN KONFIRMASI HAPUS DOKUMEN (Di luar loop) =====
            if st.session_state.hapus_doc_id is not None:
                st.markdown("---")
                st.warning(f"⚠️ Yakin hapus dokumen: **{st.session_state.hapus_doc_judul}**?")
                col_confirm_doc = st.columns([1, 1, 2])
                col_confirm_doc[0].button(
                    "✅ Ya, Hapus!",
                    key="confirm_yes_doc_fix",
                    on_click=confirm_delete_doc
                )
                col_confirm_doc[1].button(
                    "❌ Batal",
                    key="confirm_no_doc_fix",
                    on_click=cancel_delete_doc
                )
        else:
            st.info("Belum ada dokumen. Upload dokumen pertama Anda!")
    
    # ===== TAB 3: GENERATE AI =====
    with tab3:
        st.subheader("🤖 Buat Perangkat Pembelajaran dengan AI")
        st.caption("💡 Masukkan materi dan biarkan AI membuat RPP, Modul Ajar, atau LKPD secara otomatis!")
        
        # ===== AMBIL API KEY =====
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
                return
        
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
                "🧠 Model AI / Mesin AI",
                [
                    "✨ Gemini 1.5 Flash (Sangat Direkomendasikan - Google AI)",
                    "llama-3.3-70b-versatile",
                    "llama-3.1-8b-instant",
                    "gemma2-9b-it",
                    "qwen-2.5-32b",
                    "llama-4-scout-17b-16e-instruct"
                ],
                index=0,
                help="Gunakan Gemini 1.5 Flash untuk dokumen panjang, rapi, dan komprehensif tanpa takut terpotong."
            )
            
            st.caption("📊 Estimasi token: ~500-1500 tokens per dokumen")
            
            generate_btn = st.form_submit_button("🚀 Generate Dokumen", type="primary", use_container_width=True)
        
        if generate_btn:
            if not mata_pelajaran or not topik:
                st.error("❌ Mata Pelajaran dan Topik wajib diisi!")
            else:
                with st.spinner("⏳ AI sedang menulis dokumen..."):
                    try:
                        from langchain_core.prompts import ChatPromptTemplate
                        from langchain_core.output_parsers import StrOutputParser
                        
                        # Definisikan template prompt terlebih dahulu
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
                        
                        # ===== LOGIKA SISTEM PINTAR & FALLBACK (GEMINI VS GROQ) =====
                        if "Gemini" in model_groq:
                            try:
                                # Ambil gemini_api_key dari secrets Streamlit
                                gemini_api_key = st.secrets.get("gemini_api_key", None)

                                if not gemini_api_key:
                                    st.warning("⚠️ Kunci API `gemini_api_key` tidak terdeteksi di `secrets.toml`. Otomatis dialihkan (fallback) ke Groq...")
                                    raise ValueError("Kunci API Gemini tidak ada.")

                                from langchain_google_genai import ChatGoogleGenerativeAI
                                llm = ChatGoogleGenerativeAI(
                                    model="gemini-1.5-flash",
                                    temperature=0.7,
                                    google_api_key=gemini_api_key
                                )
                                st.toast("🔮 Memproses pembuatan dokumen menggunakan Google Gemini 1.5 Flash...")
                                chain = prompt_template | llm | StrOutputParser()
                                hasil = chain.invoke({"input": prompt_text})
                            except Exception as gemini_err:
                                # Fallback ke Groq jika Gemini error/limit
                                st.warning(f"⚠️ Terjadi kendala pada Gemini ({str(gemini_err)}). Melakukan fallback otomatis menggunakan Groq LLaMA...")
                                from langchain_groq import ChatGroq
                                llm = ChatGroq(
                                    model="llama-3.3-70b-versatile",
                                    temperature=0.7,
                                    groq_api_key=groq_api_key
                                )
                                chain = prompt_template | llm | StrOutputParser()
                                hasil = chain.invoke({"input": prompt_text})
                        else:
                            # Menggunakan Groq biasa
                            from langchain_groq import ChatGroq
                            llm = ChatGroq(
                                model=model_groq,
                                temperature=0.7,
                                groq_api_key=groq_api_key
                            )
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
                                st.toast("✅ Dokumen berhasil disimpan ke database!")
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
    
    # ===== CALLBACK SISWA =====
    def select_siswa_to_delete(siswa_id, nama):
        st.session_state.hapus_siswa_id = siswa_id
        st.session_state.hapus_siswa_nama = nama

    def confirm_delete_siswa():
        try:
            supabase.table("siswa").delete().eq("id", st.session_state.hapus_siswa_id).execute()
            clear_cache()
            st.session_state.siswa_success_msg = f"✅ Siswa '{st.session_state.hapus_siswa_nama}' berhasil dihapus!"
        except Exception as e:
            st.session_state.siswa_error_msg = f"❌ Gagal menghapus siswa: {str(e)}"
        st.session_state.hapus_siswa_id = None
        st.session_state.hapus_siswa_nama = ""

    def cancel_delete_siswa():
        st.session_state.hapus_siswa_id = None
        st.session_state.hapus_siswa_nama = ""

    tab1, tab2, tab3 = st.tabs(["📚 Kelas", "👨‍🎓 Siswa", "🎯 KKM"])
    
    # TAB 1: Kelas
    with tab1:
        st.subheader("Kelola Kelas")
        
        with st.form("form_kelas"):
            cols_form = st.columns([3, 1])
            nama_kelas = cols_form[0].text_input("Nama Kelas", placeholder="Contoh: 7A, 8B, 9C")
            submit = cols_form[1].form_submit_button("➕ Tambah", use_container_width=True)
            
            if submit and nama_kelas:
                nama_kelas_upper = nama_kelas.upper().strip()
                kelas_existing = [k['nama_kelas'].upper().strip() for k in get_kelas()]

                if nama_kelas_upper in kelas_existing:
                    st.error(f"❌ Kelas {nama_kelas_upper} sudah ada!")
                else:
                    try:
                        supabase.table("kelas").insert({"nama_kelas": nama_kelas_upper}).execute()
                        clear_cache()
                        st.toast(f"✅ Kelas {nama_kelas_upper} berhasil ditambahkan!")
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
        
        # Tampilkan pesan umpan balik jika ada
        if st.session_state.siswa_success_msg:
            st.success(st.session_state.siswa_success_msg)
            st.session_state.siswa_success_msg = None
        if st.session_state.siswa_error_msg:
            st.error(st.session_state.siswa_error_msg)
            st.session_state.siswa_error_msg = None

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
                        nama_siswa_strip = nama.strip()
                        siswa_existing = [s['nama'].lower().strip() for s in get_siswa(kelas_id)]

                        if nama_siswa_strip.lower() in siswa_existing:
                            st.error(f"❌ Siswa bernama '{nama_siswa_strip}' sudah ada di kelas {kelas_terpilih}!")
                        else:
                            try:
                                supabase.table("siswa").insert({
                                    "nama": nama_siswa_strip,
                                    "kelas_id": kelas_id
                                }).execute()
                                clear_cache()
                                st.toast(f"✅ {nama_siswa_strip} berhasil ditambahkan!")
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
                        siswa_existing = [s['nama'].lower().strip() for s in get_siswa(kelas_id)]

                        # Filter out existing names
                        nama_to_insert = []
                        duplikat_count = 0
                        for n in nama_list:
                            if n.lower() in siswa_existing:
                                duplikat_count += 1
                            else:
                                nama_to_insert.append(n)

                        if duplikat_count > 0:
                            st.warning(f"⚠️ {duplikat_count} nama diabaikan karena sudah terdaftar di kelas ini.")

                        if not nama_to_insert:
                            st.error("❌ Tidak ada nama baru yang ditambahkan!")
                        else:
                            try:
                                for nama in nama_to_insert:
                                    supabase.table("siswa").insert({
                                        "nama": nama,
                                        "kelas_id": kelas_id
                                    }).execute()
                                clear_cache()
                                st.toast(f"✅ Berhasil menambahkan {len(nama_to_insert)} siswa!")
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
                    cols[1].button(
                        "🗑️",
                        key=f"del_siswa_{s['id']}",
                        on_click=select_siswa_to_delete,
                        args=(s['id'], s['nama'])
                    )

                # ===== TAMPILKAN KONFIRMASI HAPUS SISWA (Di luar loop) =====
                if st.session_state.hapus_siswa_id is not None:
                    st.markdown("---")
                    st.warning(f"⚠️ Yakin ingin menghapus siswa **{st.session_state.hapus_siswa_nama}**?")
                    col_confirm_siswa = st.columns([1, 1, 2])
                    col_confirm_siswa[0].button(
                        "✅ Ya, Hapus!",
                        key="confirm_yes_siswa_fix",
                        on_click=confirm_delete_siswa
                    )
                    col_confirm_siswa[1].button(
                        "❌ Batal",
                        key="confirm_no_siswa_fix",
                        on_click=cancel_delete_siswa
                    )
    
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
                        st.toast("✅ KKM berhasil disimpan!")
                    except Exception as e:
                        st.error(f"❌ Gagal: {str(e)}")

# ============ HALAMAN: DASHBOARD DETAIL PER SISWA (GAMIFIKASI & AI REKOMENDASI) ============
def page_dashboard_siswa():
    st.title("👤 Dashboard Detail & Profil Siswa")
    st.caption("Analisis menyeluruh tentang profil siswa, tren belajar, catatan khusus, rekomendasi AI, serta visualisasi gamifikasi berprestasi.")

    kelas = get_kelas()
    if not kelas:
        st.warning("Belum ada kelas.")
        return

    kelas_options = {k['nama_kelas']: k['id'] for k in kelas}

    col_sel = st.columns(2)
    kelas_terpilih = col_sel[0].selectbox("Pilih Kelas", list(kelas_options.keys()), key="siswa_db_kelas")
    kelas_id = kelas_options[kelas_terpilih]

    siswa = get_siswa(kelas_id)
    if not siswa:
        st.info("Belum ada data siswa di kelas ini.")
        return

    siswa_options = {s['nama']: s['id'] for s in siswa}
    siswa_terpilih = col_sel[1].selectbox("Pilih Profil Siswa", list(siswa_options.keys()))
    siswa_id = siswa_options[siswa_terpilih]

    # Ambil KKM Kelas
    kkm_data = get_kkm(kelas_id)
    kkm_val = kkm_data[0]['kkm'] if kkm_data else 75

    # Ambil semua nilai siswa
    nilai_semua = get_nilai(kelas_id)
    nilai_siswa = [n for n in nilai_semua if n['siswa_id'] == siswa_id]

    # ------------------ SEKTOR GAMIFIKASI & BADGES ------------------
    st.markdown("---")
    st.markdown("### 🏆 Sektor Gamifikasi & Pencapaian Siswa")

    # Kalkulasi Rata-rata Nilai seluruh siswa di kelas untuk Leaderboard
    leaderboard_data = []
    for s in siswa:
        n_s = [n['nilai'] for n in nilai_semua if n['siswa_id'] == s['id']]
        avg_s = sum(n_s) / len(n_s) if n_s else 0.0
        leaderboard_data.append({
            "Nama": s['nama'],
            "Rata-Rata": round(avg_s, 1)
        })
    df_leaderboard = pd.DataFrame(leaderboard_data).sort_values(by="Rata-Rata", ascending=False).reset_index(drop=True)
    df_leaderboard["Peringkat"] = df_leaderboard.index + 1

    # Temukan peringkat siswa saat ini
    posisi_siswa = df_leaderboard[df_leaderboard["Nama"] == siswa_terpilih]
    peringkat = posisi_siswa["Peringkat"].values[0] if len(posisi_siswa) > 0 else "-"
    rerata_s = posisi_siswa["Rata-Rata"].values[0] if len(posisi_siswa) > 0 else 0.0

    # Perhitungan pemicu Badge Gamifikasi
    badges = []
    if peringkat == 1 and rerata_s > 0:
        badges.append(("👑 Bintang Kelas (Peringkat 1)", "Siswa ini memiliki rata-rata tertinggi di kelas."))
    elif peringkat in [2, 3] and rerata_s > 0:
        badges.append(("🥈 Juara Kelas (Peringkat 2 & 3)", "Siswa ini masuk dalam jajaran 3 besar kelas."))

    if rerata_s >= kkm_val and rerata_s > 0:
        badges.append(("✅ Master KKM", "Rata-rata kompetensi siswa berada di atas standar KKM."))

    nilai_sempurna_count = sum(1 for n in nilai_siswa if n['nilai'] == 100)
    if nilai_sempurna_count > 0:
        badges.append((f"💯 Sang Penakluk 100 ({nilai_sempurna_count}x)", "Siswa berhasil mendapatkan nilai sempurna 100 pada beberapa ujian/tugas."))

    # Tampilkan Badge dalam Layout Kolom
    col_b = st.columns(4)
    with col_b[0]:
        st.markdown(f"""
        <div class="custom-card" style="text-align: center; border-left: 5px solid #FFD700;">
            <div style="font-size: 28px;">🏆</div>
            <div style="font-size: 13px; color: #64748b;">Peringkat Kelas</div>
            <div style="font-size: 22px; font-weight: 800; color: #1e293b;">Ke-{peringkat}</div>
        </div>
        """, unsafe_allow_html=True)
    with col_b[1]:
        st.markdown(f"""
        <div class="custom-card" style="text-align: center; border-left: 5px solid #4CAF50;">
            <div style="font-size: 28px;">📈</div>
            <div style="font-size: 13px; color: #64748b;">Rata-rata Nilai</div>
            <div style="font-size: 22px; font-weight: 800; color: #1e293b;">{rerata_s}</div>
        </div>
        """, unsafe_allow_html=True)

    # Render sisa kolom dengan badges
    for i, (badge_title, badge_desc) in enumerate(badges[:2]):
        with col_b[2 + i]:
            st.markdown(f"""
            <div class="custom-card" style="text-align: center; border-left: 5px solid #00c0f2;">
                <div style="font-size: 13px; font-weight:700; color: #0087a3;">🏅 Lencana Didapat</div>
                <div style="font-size: 14px; font-weight: 800; color: #1e293b; margin-top:4px;">{badge_title}</div>
                <div style="font-size: 11px; color: #64748b; margin-top:2px;">{badge_desc}</div>
            </div>
            """, unsafe_allow_html=True)

    # Tampilkan Leaderboard Kelas (Expander)
    with st.expander("📊 Lihat Leaderboard Seluruh Kelas", expanded=False):
        st.dataframe(df_leaderboard, use_container_width=True, hide_index=True)

    # ------------------ RIWAYAT NILAI & TREN ------------------
    st.markdown("---")
    st.markdown("### 📊 Riwayat Nilai & Grafik Perkembangan")

    if nilai_siswa:
        # Konversi ke dataframe
        df_ns = pd.DataFrame(nilai_siswa)

        def parse_tgl(t):
            if not t: return None
            if isinstance(t, str): return datetime.strptime(t, "%Y-%m-%d").date()
            return t

        df_ns['tgl_parsed'] = df_ns['tanggal'].apply(parse_tgl)
        df_ns = df_ns.sort_values(by="tgl_parsed").reset_index(drop=True)

        # Line Chart Perkembangan
        df_chart = pd.DataFrame({
            "Tanggal": df_ns["tgl_parsed"].apply(str),
            "Nilai": df_ns["nilai"]
        })
        st.line_chart(df_chart.set_index("Tanggal")["Nilai"])

        # Tabel Riwayat
        df_display = df_ns[["kategori", "nilai", "topik", "bab", "tanggal", "catatan"]].copy()
        df_display.columns = ["Kategori", "Nilai", "Topik", "Bab", "Tanggal", "Catatan"]
        st.dataframe(df_display, use_container_width=True, hide_index=True)
    else:
        st.info("Belum ada riwayat nilai untuk siswa ini.")

    # ------------------ CATATAN GURU & AI REKOMENDASI (KOLABORASI) ------------------
    st.markdown("---")
    st.markdown("### ✍️ Catatan Guru & Rekomendasi AI")

    # Ambil catatan siswa saat ini dari tabel siswa (bisa disimpan di catatan siswa, kita simpan di session_state sementara atau metadata)
    # Gunakan session state untuk menyimpan catatan per siswa agar persisten
    if "catatan_siswa_persisten" not in st.session_state:
        st.session_state.catatan_siswa_persisten = {}

    current_teacher_note = st.session_state.catatan_siswa_persisten.get(siswa_id, "")

    col_rec = st.columns([1, 1])

    with col_rec[0]:
        st.markdown("**📝 Catatan Guru (Manual)**")
        st.caption("Tulis pengamatan Anda mengenai sikap belajar, kedisiplinan, atau catatan personal siswa.")
        new_note = st.text_area(
            "Masukkan Catatan Guru",
            value=current_teacher_note,
            placeholder="Tulis di sini...",
            key=f"textarea_note_{siswa_id}"
        )
        if st.button("💾 Simpan Catatan Guru", key=f"btn_save_note_{siswa_id}"):
            st.session_state.catatan_siswa_persisten[siswa_id] = new_note
            st.toast("✅ Catatan guru berhasil disimpan!")

    with col_rec[1]:
        st.markdown("**🧠 Analisis & Rekomendasi Belajar (Otomatis AI)**")
        st.caption("AI akan menganalisis riwayat nilai siswa (terutama yang di bawah KKM) dan catatan Anda untuk membuat panduan belajar personal.")

        # Tombol Generate AI Rekomendasi
        generate_ai_rec = st.button("🚀 Generate Rekomendasi AI", key=f"btn_ai_rec_{siswa_id}")

        if generate_ai_rec:
            # Ambil api key
            try:
                groq_api_key = st.secrets["groq_api_key"]
            except:
                groq_api_key = st.session_state.get("groq_dokumen_key", "")

            if not groq_api_key:
                st.warning("⚠️ Masukkan Groq API Key terlebih dahulu di menu '📁 Dokumen Pembelajaran' -> 'Generate AI'!")
                return

            with st.spinner("⏳ AI sedang menganalisis performa belajar..."):
                try:
                    # Buat ringkasan nilai untuk dikirim ke LLM
                    ringkasan_nilai_teks = ""
                    for n in nilai_siswa:
                        ringkasan_nilai_teks += f"- Kategori: {n['kategori']}, Topik: {n.get('topik', '')}, Nilai: {n['nilai']} (KKM: {kkm_val})\n"

                    prompt_ai = f"""
Siswa: {siswa_terpilih}
Kelas: {kelas_terpilih}
Rata-rata Nilai: {rerata_s} (Standar KKM: {kkm_val})
Riwayat Nilai:
{ringkasan_nilai_teks if ringkasan_nilai_teks else "Belum ada riwayat nilai."}

Catatan Pengamatan Guru:
"{new_note if new_note else "Tidak ada catatan pengamatan khusus dari guru."}"

Berdasarkan data di atas, tolong berikan rekomendasi belajar yang personal, taktis, dan ramah bagi siswa ini agar dapat meningkatkan prestasinya (terutama untuk topik-topik di bawah standar KKM). Tulis dalam bahasa Indonesia yang memotivasi dan terstruktur rapi!
"""
                    from langchain_groq import ChatGroq
                    from langchain_core.prompts import ChatPromptTemplate
                    from langchain_core.output_parsers import StrOutputParser

                    llm = ChatGroq(
                        model="llama-3.1-8b-instant",
                        temperature=0.6,
                        groq_api_key=groq_api_key
                    )

                    prompt_template = ChatPromptTemplate.from_messages([
                        ("system", "Anda adalah konselor akademis sekolah dan asisten AI guru yang sangat berempati, analitis, dan solutif."),
                        ("user", "{input}")
                    ])

                    chain = prompt_template | llm | StrOutputParser()
                    rekomendasi_hasil = chain.invoke({"input": prompt_ai})

                    st.info("💡 **Hasil Analisis AI:**")
                    st.markdown(rekomendasi_hasil)
                except Exception as e:
                    st.error(f"Gagal generate rekomendasi: {str(e)}")

# ============ SIDEBAR NAVIGASI & ROUTING ============
st.sidebar.title("📚 Menu Guru")
st.sidebar.markdown("---")

menu = st.sidebar.radio(
    "Pilih Fitur",
    [
        "🏠 Dashboard",
        "👤 Dashboard per Siswa",
        "📝 Input Nilai Rapel",
        "📊 Lihat & Export Nilai",
        "📅 Kalender & Jadwal",
        "📖 Bank Soal & Materi",
        "📁 Dokumen Pembelajaran",
        "⚙️ Pengaturan Kelas & Siswa"
    ]
)

# ============ ROUTING - ROUTING PAGES BERDASARKAN MENU ============
if menu == "🏠 Dashboard":
    page_dashboard()
elif menu == "👤 Dashboard per Siswa":
    page_dashboard_siswa()
elif menu == "📝 Input Nilai Rapel":
    page_input_nilai()
elif menu == "📊 Lihat & Export Nilai":
    page_lihat_nilai()
elif menu == "📅 Kalender & Jadwal":
    page_jadwal()
elif menu == "📖 Bank Soal & Materi":
    page_bank_soal()
elif menu == "📁 Dokumen Pembelajaran":
    page_dokumen()
elif menu == "⚙️ Pengaturan Kelas & Siswa":
    page_pengaturan()

# ============ FOOTER ============
st.sidebar.markdown("---")
st.sidebar.caption("Made with ❤️ untuk Guru SMP")
st.sidebar.caption(f"Version 3.1 | {datetime.now().year}")
