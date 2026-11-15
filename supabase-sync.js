// E-PAIBP Cloud Sync - Simpan semua data ke Supabase
// GANTI 2 BARIS DI BAWAH INI dengan punya kamu dari Supabase Dashboard
const SUPABASE_URL = "PASTE_URL_SUPABASE_KAMU_DISINI";
const SUPABASE_KEY = "PASTE_ANON_KEY_SUPABASE_KAMU_DISINI";

let supa = null;
if (window.supabase && SUPABASE_URL.startsWith("http")) {
  supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Simpan semua localStorage ke Cloud
async function saveToCloud() {
  if (!supa) return;
  try {
    const all = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      all[k] = localStorage.getItem(k);
    }
    await supa.from("app_state").upsert({ id: 1, data: all, updated_at: new Date().toISOString() });
    console.log("✅ Tersimpan ke Cloud");
  } catch (e) { console.log("Gagal simpan cloud:", e); }
}

// Ambil dari Cloud saat buka aplikasi
async function loadFromCloud() {
  if (!supa) return false;
  try {
    const { data } = await supa.from("app_state").select("data").eq("id", 1).single();
    if (data && data.data) {
      for (const k in data.data) {
        if (!localStorage.getItem(k)) localStorage.setItem(k, data.data[k]);
      }
      console.log("✅ Data Cloud dimuat");
      return true;
    }
  } catch (e) { console.log("Belum ada data cloud"); }
  return false;
}

// Auto-save tiap kali data berubah
const _setItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function(k, v) {
  _setItem(k, v);
  clearTimeout(window._saveTimer);
  window._saveTimer = setTimeout(saveToCloud, 1500);
};

window.addEventListener("load", async () => {
  const ada = await loadFromCloud();
  if (ada) location.reload();
});
window.saveToCloud = saveToCloud;
