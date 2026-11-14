# E-PAIBP Optimized Package (Siap Deploy)

Paket ini sudah dioptimasi:
- index.html → link manifest & icon sudah benar + font lebih ringan
- manifest.json → benar
- sw.js → caching lebih pintar (real-time Supabase tetap jalan)
- logo.jpg

## Cara deploy
1. Download & ekstrak paket ini
2. Upload/replace semua file ke repo GitHub (atau Vercel)
3. Commit & push
4. Tunggu 1-2 menit
5. Buka di Chrome HP → menu (⋮) → Install

## Catatan performa
- Font dikurangi (hemat ~200KB)
- Service worker lebih efisien
- Supabase tetap real-time (network first)
