import streamlit as st
import pandas as pd
from supabase import create_client, Client
from datetime import datetime, date
import openpyxl
from io import BytesIO
import re

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

# ============ FUNGSI DATABASE ============
def get_kelas():
    response = supabase.table("kelas").select("*").order("nama_kelas").execute()
    return response.data

def get_siswa(kelas_id=None):
    query = supabase.table("siswa").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    return query.execute().data

def get_nilai(kelas_id=None, kategori=None, topik=None):
    query = supabase.table("nilai").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    if kategori:
        query = query.eq("kategori", kategori)
    if topik:
        query = query.eq("topik", topik)
    return query.execute().data

def get_jadwal(kelas_id=None):
    query = supabase.table("jadwal").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    return query.execute().data

def get_bank_soal(kelas_id=None, keyword=None):
    query = supabase.table("bank_soal").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    if keyword:
        query = query.text_search("soal_materi", f"{keyword}")
    return query.execute().data

def get_kkm(kelas_id=None, kategori=None):
    query = supabase.table("kkm").select("*")
    if kelas_id:
        query = query.eq("kelas_id", kelas_id)
    if kategori:
        query = query.eq("kategori", kategori)
    return query.execute().data

# ============ FUNGSI UTILITY ============
def hari_ke_angka(hari):
    hari_map = {
        "Senin": 0, "Selasa": 1, "Rabu": 2, "Kamis": 3, 
        "Jumat": 4, "Sabtu": 5, "Minggu": 6
    }
    return hari_map.get(hari, 0)

def angka_ke_hari(angka):
    hari_map = {
        0: "Senin", 1: "Selasa", 2: "Rabu", 3: "Kamis",
        4: "Jumat", 5: "Sabtu", 6: "Minggu"
    }
    return hari_map.get(angka, "")

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
        "⚙️ Pengaturan Kelas & Siswa"
    ]
)

# ============ HALAMAN: DASHBOARD ============
def page_dashboard():
    st.title("🏠 Dashboard Guru")
    
    # Statistik cepat
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
    
    # Jadwal hari ini
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
    
    # Pilih Kelas
    kelas = get_kelas()
    if not kelas:
        st.warning("Belum ada kelas. Silahkan tambah kelas di menu Pengaturan.")
        return
    
    kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
    kelas_terpilih = st.selectbox("Pilih Kelas", list(kelas_options.keys()))
    kelas_id = kelas_options[kelas_terpilih]
    
    # Form Input
    with st.form("form_nilai"):
        cols = st.columns(4)
        
        kategori = cols[0].selectbox(
            "Kategori", 
            ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]
        )
        
        topik = cols[1].text_input("Topik")
        bab = cols[2].text_input("Bab")
        tanggal = cols[3].date_input("Tanggal", value=date.today())
        
        st.markdown("---")
        
        # Tabel Siswa
        siswa = get_siswa(kelas_id)
        if not siswa:
            st.warning("Belum ada siswa di kelas ini. Tambahkan siswa di menu Pengaturan.")
            st.form_submit_button("Simpan", disabled=True)
            return
        
        st.subheader(f"📋 Daftar Siswa Kelas {kelas_terpilih}")
        
        # Buat dataframe untuk input
        data = []
        for s in siswa:
            data.append({
                "Nama": s['nama'],
                "Nilai": 0.0,
                "Catatan": ""
            })
        
        df_input = pd.DataFrame(data)
        
        # Tampilkan editable dataframe
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
    
    # Proses simpan di luar form untuk menghindari rerun
    if submit:
        try:
            saved = 0
            for idx, row in edited_df.iterrows():
                if row['Nilai'] > 0:  # Hanya simpan nilai yang diisi
                    supabase.table("nilai").insert({
                        "siswa_id": siswa[idx]['id'],
                        "kelas_id": kelas_id,
                        "kategori": kategori,
                        "nilai": row['Nilai'],
                        "topik": topik,
                        "bab": bab,
                        "tanggal": str(tanggal),
                        "catatan": row['Catatan'] if row['Catatan'] else None
                    }).execute()
                    saved += 1
            
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
    
    cols = st.columns(3)
    kategori_filter = cols[0].selectbox(
        "Filter Kategori", 
        ["Semua", "Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]
    )
    topik_filter = cols[1].text_input("Filter Topik")
    show_stats = cols[2].checkbox("Tampilkan Statistik", value=True)
    
    # Ambil data
    siswa = get_siswa(kelas_id)
    nilai = get_nilai(kelas_id)
    
    if not nilai:
        st.info("Belum ada data nilai untuk kelas ini.")
        return
    
    # Filter
    if kategori_filter != "Semua":
        nilai = [n for n in nilai if n['kategori'] == kategori_filter]
    if topik_filter:
        nilai = [n for n in nilai if topik_filter.lower() in n.get('topik', '').lower()]
    
    # Buat dataframe
    data = []
    for s in siswa:
        row = {"Nama": s['nama']}
        for n in nilai:
            if n['siswa_id'] == s['id']:
                row[n['kategori']] = n['nilai']
        data.append(row)
    
    df = pd.DataFrame(data)
    df = df.fillna("-")
    
    # Tampilkan
    st.dataframe(df, use_container_width=True, hide_index=True)
    
    if show_stats and len(df) > 0:
        st.markdown("---")
        st.subheader("📊 Statistik")
        
        # Pisahkan kolom numerik
        num_cols = df.select_dtypes(include=['float64', 'int64']).columns
        
        if len(num_cols) > 0:
            stats = pd.DataFrame({
                "Rata-rata": df[num_cols].mean().round(2),
                "Tertinggi": df[num_cols].max(),
                "Terendah": df[num_cols].min()
            })
            st.dataframe(stats, use_container_width=True)
    
    # Export Excel
    st.markdown("---")
    if st.button("📥 Download Excel"):
        try:
            # Buat Excel dengan 2 sheet
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                # Sheet 1: Ringkasan
                df_ringkasan = df.copy()
                df_ringkasan.to_excel(writer, sheet_name="Ringkasan", index=False)
                
                # Sheet 2: Detail
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
                                "Catatan": n.get('catatan', '')
                            })
                df_detail = pd.DataFrame(detail_data)
                df_detail.to_excel(writer, sheet_name="Detail", index=False)
            
            # Download
            st.download_button(
                label="⬇️ Download File Excel",
                data=output.getvalue(),
                file_name=f"Nilai_{kelas_terpilih}_{date.today()}.xlsx",
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
    
    # Tambah Jadwal
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
                    st.success("✅ Jadwal berhasil ditambahkan!")
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Gagal: {str(e)}")
    
    # Lihat Jadwal
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
        # Urutkan berdasarkan hari dan jam
        df['hari_angka'] = df['hari'].apply(hari_ke_angka)
        df['jam_time'] = pd.to_datetime(df['jam'])
        df = df.sort_values(['hari_angka', 'jam_time'])
        
        # Tampilkan
        df_display = df[['nama_kelas', 'hari', 'jam', 'topik', 'bab']]
        df_display.columns = ['Kelas', 'Hari', 'Jam', 'Topik', 'Bab']
        st.dataframe(df_display, use_container_width=True, hide_index=True)
    else:
        st.info("Belum ada jadwal untuk kelas ini.")

# ============ HALAMAN: BANK SOAL & MATERI ============
def page_bank_soal():
    st.title("📖 Bank Soal & Materi")
    
    # Tambah Soal
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
                        st.success("✅ Soal berhasil disimpan!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"❌ Gagal: {str(e)}")
    
    # Cari Soal
    st.markdown("---")
    st.subheader("🔍 Cari Soal")
    
    cols = st.columns(3)
    cari_kelas = cols[0].selectbox("Kelas", ["Semua"] + list(kelas_options.keys()) if kelas else ["Semua"])
    cari_keyword = cols[1].text_input("Kata Kunci (cari di soal, materi, atau topik)")
    cari_tag = cols[2].selectbox("Tag", ["Semua", "UH", "UTS", "UAS", "Remedial", "Pengayaan", "Quiz", "Tugas", "Materi"])
    
    if st.button("🔍 Cari", use_container_width=True):
        # Ambil data
        soal_data = []
        if cari_kelas != "Semua" and kelas:
            soal_data = get_bank_soal(kelas_options[cari_kelas])
        else:
            for k in kelas:
                soal_data.extend(get_bank_soal(k['id']))
        
        # Filter
        if cari_keyword:
            soal_data = [s for s in soal_data if 
                        cari_keyword.lower() in s.get('soal', '').lower() or
                        cari_keyword.lower() in s.get('materi', '').lower() or
                        cari_keyword.lower() in s.get('topik', '').lower()]
        
        if cari_tag != "Semua":
            soal_data = [s for s in soal_data if s.get('tag') == cari_tag]
        
        # Tampilkan
        if soal_data:
            df = pd.DataFrame(soal_data)
            df_display = df[['topik', 'tag', 'soal', 'jawaban', 'materi']]
            st.dataframe(df_display, use_container_width=True, hide_index=True)
        else:
            st.info("Tidak ditemukan soal yang sesuai.")

# ============ HALAMAN: PENGATURAN KELAS & SISWA ============
# ============ HALAMAN: PENGATURAN KELAS & SISWA ============
def page_pengaturan():
    st.title("⚙️ Pengaturan Kelas & Siswa")
    
    tab1, tab2, tab3 = st.tabs(["📚 Kelas", "👨‍🎓 Siswa", "🎯 KKM"])
    
    # TAB 1: Kelas
    with tab1:
        st.subheader("Kelola Kelas")
        
        # Tambah Kelas
        with st.form("form_kelas"):
            nama_kelas = st.text_input("Nama Kelas (contoh: 7A, 8B, 9C)")
            submit = st.form_submit_button("➕ Tambah Kelas")
            
            if submit and nama_kelas:
                try:
                    supabase.table("kelas").insert({"nama_kelas": nama_kelas}).execute()
                    st.success(f"✅ Kelas {nama_kelas} berhasil ditambahkan!")
                    st.rerun()
                except Exception as e:
                    st.error(f"❌ Gagal: {str(e)}")
        
        # Daftar Kelas
        kelas = get_kelas()
        if kelas:
            st.markdown("---")
            st.subheader("Daftar Kelas")
            for k in kelas:
                cols = st.columns([3, 1])
                cols[0].write(f"📚 {k['nama_kelas']}")
                if cols[1].button(f"🗑️ Hapus", key=f"del_kelas_{k['id']}"):
                    try:
                        # Hapus siswa dulu
                        siswa = get_siswa(k['id'])
                        for s in siswa:
                            supabase.table("siswa").delete().eq("id", s['id']).execute()
                        # Hapus kelas
                        supabase.table("kelas").delete().eq("id", k['id']).execute()
                        st.success(f"✅ Kelas {k['nama_kelas']} berhasil dihapus!")
                        st.rerun()
                    except Exception as e:
                        st.error(f"❌ Gagal hapus kelas: {str(e)}")
    
    # TAB 2: Siswa
    with tab2:
        st.subheader("Kelola Siswa")
        
        kelas = get_kelas()
        if not kelas:
            st.warning("Tambahkan kelas terlebih dahulu.")
        else:
            kelas_options = {k['nama_kelas']: k['id'] for k in kelas}
            # 🔥 PERBAIKAN: tambahkan key unik
            kelas_terpilih_siswa = st.selectbox(
                "Pilih Kelas", 
                list(kelas_options.keys()),
                key="select_kelas_siswa"  # <-- key unik
            )
            kelas_id = kelas_options[kelas_terpilih_siswa]
            
            # Tambah Siswa
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
                            st.success(f"✅ Berhasil menambahkan {len(nama_list)} siswa!")
                            st.rerun()
                        except Exception as e:
                            st.error(f"❌ Gagal: {str(e)}")
            
            # Daftar Siswa
            siswa = get_siswa(kelas_id)
            if siswa:
                st.markdown("---")
                st.subheader(f"Daftar Siswa Kelas {kelas_terpilih_siswa}")
                
                for s in siswa:
                    cols = st.columns([3, 1])
                    cols[0].write(f"👨‍🎓 {s['nama']}")
                    if cols[1].button(f"🗑️", key=f"del_siswa_{s['id']}"):
                        try:
                            supabase.table("siswa").delete().eq("id", s['id']).execute()
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
            # 🔥 PERBAIKAN: tambahkan key unik
            kelas_terpilih_kkm = st.selectbox(
                "Pilih Kelas", 
                list(kelas_options.keys()),
                key="select_kelas_kkm"  # <-- key unik
            )
            kelas_id = kelas_options[kelas_terpilih_kkm]
            
            # Form KKM
            with st.form("form_kkm"):
                st.write("Set KKM per kategori:")
                
                kategori_list = ["Harian", "Sikap", "UH", "UTS", "UAS", "Tugas", "Quiz", "Kehadiran"]
                kkm_values = {}
                
                cols = st.columns(2)
                for i, kategori in enumerate(kategori_list):
                    col = cols[i % 2]
                    # Ambil KKM yang sudah ada
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
                            # Cek apakah sudah ada
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
elif menu == "⚙️ Pengaturan Kelas & Siswa":
    page_pengaturan()

# ============ FOOTER ============
st.sidebar.markdown("---")
st.sidebar.caption("Made with ❤️ untuk Guru SMP")
st.sidebar.caption(f"Version 1.0 | {datetime.now().year}")
