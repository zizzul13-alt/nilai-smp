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

# ============ KONFIGURASI ============
st.set_page_config(
    page_title="Asisten Pengajar SMP",
    page_icon="📚",
    layout="wide",
    initial_sidebar_state="expanded"
)

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
# ============ FUNGSI KOMPRES FILE (TANPA MAGIC) ============
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

# ============ FUNGSI UTILITY ============
def hari_ke_angka(hari):
    hari_map = {
        "Senin": 0, "Selasa": 1, "Rabu": 2, "Kamis": 3, 
        "Jumat": 4, "Sabtu": 5, "Minggu": 6
    }
    return hari_map.get(hari, 0)

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
    
    with st.expander("➕ Tambah Jadwal Baru", expanded=False):
        with st.form("form_jadwal"):
            cols = st.columns(3)
            kelas_terpilih = cols[0].selectbox("Pilih Kelas", list(kelas_options.keys()))
            hari = cols[0].selectbox("Hari", ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"])
            jam = cols[1].time_input("Jam")
            topik = cols[1].text_input("Topik")
            bab = cols[2].text_input("Bab")
            
            submit = st.form_submit_button("Simpan Jadwal")
            
            if submit:
                try:
                    supabase.table("jadwal").insert({
                        "kelas_id": kelas_options[kelas_terpilih],
                        "hari": hari,
                        "jam": str(jam),
                        "topik": topik,
                        "bab": bab
                    }).execute()
                    clear_cache()
                    st.success("✅ Jadwal berhasil ditambahkan!")
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Gagal: {str(e)}")
    
    st.markdown("---")
    kelas_lihat = st.selectbox("Lihat Jadwal Kelas", ["Semua Kelas"] + list(kelas_options.keys()))
    
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
    
    if jadwal:
        df = pd.DataFrame(jadwal)
        df['hari_angka'] = df['hari'].apply(hari_ke_angka)
        df['jam_time'] = pd.to_datetime(df['jam'])
        df = df.sort_values(['hari_angka', 'jam_time'])
        
        df_display = df[['nama_kelas', 'hari', 'jam', 'topik', 'bab']]
        df_display.columns = ['Kelas', 'Hari', 'Jam', 'Topik', 'Bab']
        st.dataframe(df_display, use_container_width=True, hide_index=True)
    else:
        st.info("Belum ada jadwal untuk kelas ini.")

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
    
    tab1, tab2 = st.tabs(["📤 Upload Dokumen", "📂 Lihat Dokumen"])
    
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

# ============ HALAMAN: PENGATURAN KELAS & SISWA ============
def page_pengaturan():
    st.title("⚙️ Pengaturan Kelas & Siswa")
    
    tab1, tab2, tab3 = st.tabs(["📚 Kelas", "👨‍🎓 Siswa", "🎯 KKM"])
    
    with tab1:
        st.subheader("Kelola Kelas")
        
        with st.form("form_kelas"):
            nama_kelas = st.text_input("Nama Kelas (contoh: 7A, 8B, 9C)")
            submit = st.form_submit_button("➕ Tambah Kelas")
            
            if submit and nama_kelas:
                try:
                    supabase.table("kelas").insert({"nama_kelas": nama_kelas}).execute()
                    clear_cache()
                    st.success(f"✅ Kelas {nama_kelas} berhasil ditambahkan!")
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Gagal: {str(e)}")
        
        kelas = get_kelas()
        if kelas:
            st.markdown("---")
            st.subheader("Daftar Kelas")
            for k in kelas:
                cols = st.columns([3, 1])
                cols[0].write(f"📚 {k['nama_kelas']}")
                if cols[1].button(f"🗑️ Hapus", key=f"del_kelas_{k['id']}"):
                    st.warning(f"⚠️ Yakin ingin menghapus kelas {k['nama_kelas']}? Semua data akan hilang!")
                    if st.button(f"✅ Ya, Hapus!", key=f"confirm_del_kelas_{k['id']}"):
                        try:
                            siswa = get_siswa(k['id'])
                            for s in siswa:
                                supabase.table("siswa").delete().eq("id", s['id']).execute()
                            supabase.table("kelas").delete().eq("id", k['id']).execute()
                            clear_cache()
                            st.success(f"✅ Kelas {k['nama_kelas']} berhasil dihapus!")
                            st.rerun()
                        except Exception as e:
                            st.error(f"❌ Gagal hapus kelas: {str(e)}")
    
    with tab2:
        st.subheader("Kelola Siswa")
        
        kelas = get_kelas()
        if not kelas:
            st.warning("Tambahkan kelas terlebih dahulu.")
        else:
            kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
            kelas_terpilih_siswa = st.selectbox(
                "Pilih Kelas", 
                list(kelas_options.keys()),
                key="select_kelas_siswa"
            )
            kelas_id = kelas_options[kelas_terpilih_siswa]
            
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
            
            siswa = get_siswa(kelas_id)
            if siswa:
                st.markdown("---")
                st.subheader(f"Daftar Siswa Kelas {kelas_terpilih_siswa}")
                
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
    
    with tab3:
        st.subheader("Setting KKM")
        
        kelas = get_kelas()
        if not kelas:
            st.warning("Tambahkan kelas terlebih dahulu.")
        else:
            kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
            kelas_terpilih_kkm = st.selectbox(
                "Pilih Kelas", 
                list(kelas_options.keys()),
                key="select_kelas_kkm"
            )
            kelas_id = kelas_options[kelas_terpilih_kkm]
            
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

# ============ ROUTING ============
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
st.sidebar.caption(f"Version 3.0 | {datetime.now().year}")
