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
    layout="wide",
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
# ===== CSS UNTUK TOMBOL DI HP =====
st.markdown("""
<style>
    /* Tombol lebih besar dan mudah diklik di HP */
    .stButton button {
        font-size: 16px !important;
        padding: 12px 16px !important;
        min-height: 48px !important;
        border-radius: 8px !important;
        font-weight: 600 !important;
    }
    
    /* Tombol primary (biru) */
    .stButton button[data-baseweb="button"] {
        background-color: #4CAF50 !important;
        color: white !important;
    }
    
    /* Hover effect */
    .stButton button:hover {
        transform: scale(1.02);
        transition: 0.2s;
    }
    
    /* Checkbox lebih besar */
    .stCheckbox label {
        font-size: 16px !important;
        padding: 8px !important;
    }
    .stCheckbox input {
        width: 20px !important;
        height: 20px !important;
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
    
    # ===== AMBIL DAFTAR TOPIK YANG SUDAH ADA =====
    semua_nilai = get_nilai(kelas_id)
    topik_list = list(set([n.get('topik', '') for n in semua_nilai if n.get('topik')]))
    topik_list.sort()
    
    with st.form("form_nilai"):
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
        
        siswa = get_siswa(kelas_id)
        if not siswa:
            st.warning("Belum ada siswa di kelas ini.")
            st.form_submit_button("Simpan", disabled=True)
            return
        
        st.subheader(f"📋 Daftar Siswa Kelas {kelas_terpilih}")
        st.caption(f"📝 Topik: **{topik}** | Kategori: **{kategori}** | Bab: **{bab if bab else '-'}**")
        
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
            @media only screen and (max-width: 768px) {
                .stDataFrame {
                    font-size: 14px !important;
                }
                .stDataFrame input {
                    font-size: 16px !important;
                    padding: 10px !important;
                    min-height: 40px !important;
                }
                .stDataFrame .col-Nilai {
                    min-width: 80px !important;
                }
            }
        </style>
        """, unsafe_allow_html=True)
        
        data = []
        for s in siswa:
            nilai_sebelumnya = next((n['nilai'] for n in existing_nilai if n['siswa_id'] == s['id']), None)
            data.append({
                "Nama": s['nama'],
                "Nilai": 0.0,
                "Catatan": "",
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
                    min_value=0,
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
        
        submit = st.form_submit_button("💾 Simpan Semua Nilai")
    
    if submit:
        if not topik:
            st.error("❌ Topik wajib diisi!")
        else:
            try:
                saved = 0
                updated = 0
                for idx, row in edited_df.iterrows():
                    if row['Nilai'] > 0:
                        # Cek apakah sudah ada nilai untuk siswa + topik + kategori ini
                        existing = supabase.table("nilai").select("*")\
                            .eq("siswa_id", siswa[idx]['id'])\
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
                st.success(f"✅ Berhasil menyimpan! {saved} data baru, {updated} data diperbarui.")
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
                    cols = st.columns([1.5, 1, 1, 2.5, 1.5, 0.8, 0.8, 0.5])
                    
                    cols[0].write(row.get('nama_kelas', '-'))
                    cols[1].write(row['hari'])
                    cols[2].write(row['jam_format'])
                    cols[3].write(row.get('topik', '-')[:30])  # Batasi panjang topik
                    cols[4].write(row.get('bab', '-'))
                    cols[5].write(f"M{row.get('minggu_ke', '-')}")
                    cols[6].write(f"S{row.get('semester', '-')}")
                    
                    # [FIX] Tombol hapus dengan konfirmasi langsung
                    if cols[7].button("🗑️", key=f"del_{row['id']}_{idx}", help="Hapus jadwal ini"):
                        # Konfirmasi dengan st.warning dan tombol
                        st.warning(f"⚠️ Yakin hapus jadwal: **{row['hari']} {row['jam_format']} - {row.get('topik', '-')}**?")
                        
                        col_confirm = st.columns([1, 1])
                        if col_confirm[0].button("✅ Ya, Hapus!", key=f"confirm_yes_{row['id']}"):
                            try:
                                supabase.table("jadwal").delete().eq("id", row['id']).execute()
                                clear_cache()
                                st.success(f"✅ Jadwal berhasil dihapus!")
                                st.rerun()
                            except Exception as e:
                                st.error(f"❌ Gagal: {str(e)}")
                        if col_confirm[1].button("❌ Batal", key=f"confirm_no_{row['id']}"):
                            st.rerun()
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
                    st.success("✅ Jadwal berhasil ditambahkan!")
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Gagal: {str(e)}")
    
        # === TAB 3: GENERATE MANUAL ===
    with tab3:
        st.subheader("⚡ Generate Jadwal Berdasarkan Bab")
        st.info("💡 Tentukan durasi setiap bab (berapa minggu) untuk membuat jadwal fleksibel")
        
        # ===== INISIALISASI SESSION STATE =====
        if "daftar_bab" not in st.session_state:
            st.session_state.daftar_bab = [
                {"nama": "Bab 1 - Pengenalan", "durasi": 2},
                {"nama": "Bab 2 - Operasi Dasar", "durasi": 2},
                {"nama": "Bab 3 - Review & UH", "durasi": 1},
            ]
        
        if "hapus_bab_check" not in st.session_state:
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
                        st.success(f"✅ Berhasil generate {len(jadwal_baru)} jadwal untuk {kelas_gen}!")
                        st.info(f"📚 {len(st.session_state.daftar_bab)} bab | 📅 {total_minggu} minggu | ⏰ {jam_pilihan} WIB")
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
                "🧠 Model AI",
                [
                    "llama-3.3-70b-versatile",
                    "llama-3.1-8b-instant",
                    "gemma2-9b-it",
                    "qwen-2.5-32b",
                    "llama-4-scout-17b-16e-instruct"
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

# ============ SIDEBAR NAVIGASI & ROUTING ============
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

# ============ ROUTING - ROUTING PAGES BERDASARKAN MENU ============
if menu == "🏠 Dashboard":
    page_dashboard()
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
