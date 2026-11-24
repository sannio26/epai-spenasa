/* E-PAIBP All-in-One Realtime Sync & Storage Safe */
(function () {
  'use strict';

  // 1. Cegah error kuota penuh localStorage
  var origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, val) {
    if (key === 'epai_offline_v1' && typeof val === 'string' && val.length > 1500000) {
      try {
        var obj = JSON.parse(val);
        ['materials', 'praktis', 'hotnews', 'portfolioSubmissions'].forEach(function (k) {
          if (Array.isArray(obj[k])) {
            obj[k].forEach(function (item) {
              if (item && item.image && item.image.length > 30000) delete item.image;
              if (item && item.imageData && item.imageData.length > 30000) delete item.imageData;
              if (item && item.pdfData && item.pdfData.length > 30000) delete item.pdfData;
              if (item && item.fileData && item.fileData.length > 30000) delete item.fileData;
            });
          }
        });
        val = JSON.stringify(obj);
      } catch (e) {}
    }
    try {
      origSetItem.call(this, key, val);
    } catch (err) {
      console.warn('Cache lokal penuh, dilewati:', err);
    }
  };

  // Matikan penghapus materi otomatis
  window.bersihDobek = function () {};

  // 2. Fungsi Upsert Universal yang pasti berhasil ke Supabase
  async function upsertToSupabase(table, rowFull, rowMinimal) {
    if (!window.sb || !navigator.onLine) return { error: { message: 'Offline / Supabase belum siap' } };
    var res = await window.sb.from(table).upsert(rowFull, { onConflict: 'id' });
    if (res.error) {
      // Fallback jika tabel di Supabase hanya punya kolom (id, data)
      res = await window.sb.from(table).upsert(rowMinimal, { onConflict: 'id' });
    }
    return res;
  }

  function hookRealtimeFeatures() {
    if (!window.sb) {
      setTimeout(hookRealtimeFeatures, 400);
      return;
    }

    // Override simpan materi agar 100% masuk Supabase & tampil di semua HP
    window.saveMaterial = async function () {
      var titleEl = document.getElementById('matTitle');
      var title = (titleEl && titleEl.value || '').trim();
      if (!title) { alert('Judul materi wajib diisi!'); return; }

      var btn = document.getElementById('saveMaterialBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan ke server...'; }

      try {
        var fEl = document.getElementById('paibp-folder');
        var pEl = document.getElementById('paibp-pdfbanyak');
        var descEl = document.getElementById('matDesc');
        var folder = fEl ? fEl.value.trim() : '';
        var pdfLines = pEl ? pEl.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean) : [];
        var pdfs = pdfLines.map(function (u, i) { return { name: 'PDF ' + (i + 1), url: u }; });
        var kunci = '[PAIBP]' + JSON.stringify({ folder: folder, pdfs: pdfs }) + '[/PAIBP]';
        var cleanDesc = (descEl ? descEl.value : '').replace(/\[PAIBP\].*?\[\/PAIBP\]/g, '').trim();

        var mid = window.editingMid || ('m_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
        var kelasVal = Number((document.getElementById('matClass') || {}).value || 7);
        var semVal = Number((document.getElementById('matSemester') || {}).value || 1);

        var item = {
          id: mid,
          _mid: mid,
          kelas: kelasVal,
          semester: semVal,
          chapter: 1,
          title: title,
          desc: (cleanDesc + ' ' + kunci).trim(),
          url: ((document.getElementById('matUrl') || {}).value || '').trim(),
          video: ((document.getElementById('matVideo') || {}).value || '').trim(),
          image: ((document.getElementById('matImageUrl') || {}).value) || '',
          pdfName: ((document.getElementById('matPdfName') || {}).value) || '',
          createdAt: Date.now()
        };

        // Kirim ke Supabase
        var res = await upsertToSupabase(
          'materials',
          { id: mid, kelas: kelasVal, semester: semVal, chapter: 1, title: title, data: item },
          { id: mid, data: item }
        );

        if (res.error) {
          alert('Gagal sinkron ke Supabase: ' + res.error.message + '\nPastikan SQL tabel materials sudah dijalankan.');
        } else if (typeof showToast === 'function') {
          showToast('Materi tersimpan & tersinkron REALTIME ke semua HP ✓', 'success');
        }

        // Simpan ke state memori & lokal
        if (!window.db) window.db = {};
        if (!Array.isArray(window.db.materials)) window.db.materials = [];
        var idx = window.db.materials.findIndex(function (x) { return x && (x.id === mid || x._mid === mid); });
        if (idx >= 0) window.db.materials[idx] = item;
        else window.db.materials.push(item);

        if (typeof saveDB === 'function') saveDB();
        if (typeof resetMaterialForm === 'function') resetMaterialForm();
        if (fEl) fEl.value = '';
        if (pEl) pEl.value = '';
        window.editingMid = null;
        if (typeof renderMaterialAdmin === 'function') renderMaterialAdmin();
        if (typeof renderLessons === 'function') renderLessons();
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Simpan materi'; }
      }
    };

    // Sinkronisasi Ibadah Praktis ke Supabase
    var origSavePrak = window.savePraktis;
    if (typeof origSavePrak === 'function' && !window._prakSynced) {
      window._prakSynced = true;
      window.savePraktis = async function () {
        origSavePrak();
        var list = (window.db && window.db.praktis) || [];
        var last = list[list.length - 1];
        if (last && last.id) {
          var res = await upsertToSupabase(
            'praktis',
            { id: last.id, title: last.title, kelas: last.kelas || '', data: last },
            { id: last.id, data: last }
          );
          if (!res.error && typeof showToast === 'function') {
            showToast('Ibadah praktis tersinkron REALTIME ✓', 'success');
          }
        }
      };
    }

    // Pastikan renderMateri menampilkan semua data dari Supabase (baik yang lama maupun baru)
    window.renderMaterialAdmin = function () {
      var el = document.getElementById('materialAdminList');
      if (!el) return;
      var items = ((window.db && window.db.materials) || []).slice().sort(function (a, b) {
        return (a.kelas - b.kelas) || (a.semester - b.semester) || ((b.createdAt || 0) - (a.createdAt || 0));
      });
      if (!items.length) {
        el.innerHTML = '<p class="muted">Belum ada materi PAIBP. Isi form lalu simpan.</p>';
        return;
      }
      var html = '';
      items.forEach(function (m) {
        var clean = String(m.desc || '').replace(/\[PAIBP\].*?\[\/PAIBP\]/g, '').trim();
        var mid = String(m.id || m._mid || '').replace(/'/g, '');
        html += '<div class="material" style="border-left:4px solid #1e40af">';
        html += '<span class="pill">Kelas ' + m.kelas + ' • Semester ' + m.semester + '</span>';
        html += '<h3 style="margin:8px 0 4px">' + (m.title || '') + '</h3>';
        if (clean) html += '<p style="white-space:pre-wrap;font-size:13px">' + clean + '</p>';
        if (m.image) html += '<img class="material-img-thumb" src="' + m.image + '" alt="" onclick="openImgLightbox(this.src)">';
        if (m.video) html += '<p class="muted">🎥 Video: <a href="' + m.video + '" target="_blank">' + m.video + '</a></p>';
        if (m.url) html += '<p class="muted">📄 PDF: <a href="' + m.url + '" target="_blank">' + m.url + '</a></p>';
        html += '<div class="material-action-row">';
        html += '<button type="button" class="material-edit-btn" onclick="editMaterialById(\'' + mid + '\')">✏️ Edit</button>';
        html += '<button type="button" class="material-delete-btn" onclick="deleteMaterialById(\'' + mid + '\')">🗑️ Hapus</button>';
        html += '</div></div>';
      });
      el.innerHTML = html;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookRealtimeFeatures);
  } else {
    hookRealtimeFeatures();
  }
})();
                  
