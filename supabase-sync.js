/* E-PAIBP All-in-One Realtime Sync & YouTube Fix */
(function () {
  'use strict';
  function openVideoModal(rawUrl, title) {
    var url = (rawUrl || '').trim();
    if (!url) return;
    var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/))([A-Za-z0-9_-]{11})/);
    if (m) url = 'https://www.youtube.com/embed/' + m[1];
    var old = document.getElementById('epaiVideoModal');
    if (old) old.remove();
    var div = document.createElement('div');
    div.id = 'epaiVideoModal';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px;';
    div.innerHTML = '<div style="background:#fff;width:100%;max-width:720px;border-radius:12px;overflow:hidden;"><div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;font-weight:700;">' + (title || 'Video pembelajaran') + '<button id="epaiCloseVideo" style="font-size:22px;border:none;background:none;">×</button></div><div style="aspect-ratio:16/9;background:#000;"><iframe src="' + url + '" style="width:100%;height:100%;border:0;" allowfullscreen></iframe></div></div>';
    div.addEventListener('click', function(e){ if(e.target===div) div.remove(); });
    div.querySelector('#epaiCloseVideo').onclick = function(){ div.remove(); };
    document.body.appendChild(div);
  }
  window.openVideoModal = openVideoModal;
  // 1. Aktifkan semua tombol Video YouTube di menu Materi, Ibadah Praktis & Hot News
  document.addEventListener('click', function (ev) {
    var vidBtn = ev.target.closest('[data-video]');
    if (vidBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      var rawUrl = (vidBtn.getAttribute('data-video') || '').trim();
      var title = vidBtn.getAttribute('data-title') || 'Video pembelajaran';
      if (!rawUrl) return;
      if (typeof openVideoModal === 'function') {
        openVideoModal(rawUrl, title);
      } else {
        window.open(rawUrl, '_blank', 'noopener');
      }
    }
  });

  function installAllSync() {
    if (typeof window.sb === 'undefined' || !window.sb) {
      setTimeout(installAllSync, 500);
      return;
    }
    var sb = window.sb;

    // 2. Sinkronisasi Materi (Simpan, Edit, Pindah Bab/Kelas, & Hapus)
    if (typeof window.saveMaterial === 'function' && !window._epaiMatHooked) {
      window._epaiMatHooked = true;
      var origSaveMat = window.saveMaterial;
      window.saveMaterial = function () {
        var oldKey = (typeof materialEditKey !== 'undefined' && materialEditKey)
          ? Object.assign({}, materialEditKey) : null;
        var k = Number(document.getElementById('matClass').value);
        var s = Number(document.getElementById('matSemester').value);
        var c = Number(document.getElementById('matChapter').value);

        origSaveMat();

        if (oldKey && (oldKey.kelas !== k || oldKey.semester !== s || oldKey.chapter !== c)) {
          sb.from('materials').delete()
            .eq('kelas', oldKey.kelas)
            .eq('semester', oldKey.semester)
            .eq('chapter', oldKey.chapter)
            .then(function () {});
        }

        var savedItem = (db.materials || []).find(function (m) {
          return Number(m.kelas) === k && Number(m.semester) === s && Number(m.chapter) === c;
        });

        if (savedItem) {
          var payloadData = Object.assign({}, savedItem);
          if (payloadData.pdfData) {
            delete payloadData.pdfData;
            if (typeof showToast === 'function') {
              showToast('File PDF hanya tersimpan di HP ini. Untuk siswa, pakai Link PDF Google Drive.', 'error');
            }
          }
          sb.from('materials').upsert({
            id: savedItem.id || ('m_' + k + '_' + s + '_' + c),
            kelas: k,
            semester: s,
            chapter: c,
            title: savedItem.title,
            data: payloadData
          }, { onConflict: 'id' }).then(function (res) {
            if (res.error) {
              alert('Gagal sinkron Materi: ' + res.error.message);
            } else if (typeof showToast === 'function') {
              showToast('Materi tersinkron ke semua HP siswa ✓', 'success');
            }
          });
        }
      };
    }

    if (typeof window.deleteMaterialByKey === 'function' && !window._epaiDelMatHooked) {
      window._epaiDelMatHooked = true;
      var origDelMat = window.deleteMaterialByKey;
      window.deleteMaterialByKey = function (kelas, semester, chapter) {
        origDelMat(kelas, semester, chapter);
        sb.from('materials').delete()
          .eq('kelas', Number(kelas))
          .eq('semester', Number(semester))
          .eq('chapter', Number(chapter))
          .then(function () {});
      };
    }

    // 3. Sinkronisasi Ibadah Praktis
    if (typeof window.savePraktis === 'function' && !window._epaiPrakHooked) {
      window._epaiPrakHooked = true;
      var origSavePrak = window.savePraktis;
      window.savePraktis = function () {
        var editId = (document.getElementById('prakId') && document.getElementById('prakId').value) || '';
        origSavePrak();
        var list = db.praktis || [];
        var item = editId ? list.find(function (x) { return x.id === editId; }) : list[list.length - 1];
        if (item) {
          sb.from('praktis').upsert({
            id: item.id, title: item.title, kelas: item.kelas || '',
            desc: item.desc || '', video: item.video || '', pdf: item.pdf || '',
            image: item.image || '', data: item
          }, { onConflict: 'id' }).then(function (res) {
            if (res.error) {
              alert('Gagal sinkron Praktis: ' + res.error.message);
            } else if (typeof showToast === 'function') {
              showToast('Ibadah praktis tersinkron ke server ✓', 'success');
            }
          });
        }
      };
    }

    if (typeof window.deletePraktis === 'function' && !window._epaiDelPrakHooked) {
      window._epaiDelPrakHooked = true;
      var origDelPrak = window.deletePraktis;
      window.deletePraktis = function (id) {
        origDelPrak(id);
        sb.from('praktis').delete().eq('id', id).then(function () {});
      };
    }

    // 4. Sinkronisasi Hot News (Simpan & Hapus)
    if (typeof window.saveHotNews === 'function' && !window._epaiSaveHotHooked) {
      window._epaiSaveHotHooked = true;
      var origSaveHot = window.saveHotNews;
      window.saveHotNews = function () {
        var editId = (document.getElementById('hotId') && document.getElementById('hotId').value) || '';
        origSaveHot();
        var list = db.hotnews || [];
        var item = editId ? list.find(function (x) { return x.id === editId; }) : list[list.length - 1];
        if (item) {
          sb.from('hotnews').upsert({
            id: item.id, title: item.title, kelas: item.kelas || '',
            description: item.description || item.desc || '', video: item.video || '', pdf: item.pdf || '',
            image: item.image || '', data: item
          }, { onConflict: 'id' }).then(function (res) {
            if (res.error) {
              alert('Gagal sinkron Hot News: ' + res.error.message);
            } else if (typeof showToast === 'function') {
              showToast('Hot News tersinkron ke semua HP ✓', 'success');
            }
          });
        }
      };
    }

    if (typeof window.deleteHotNews === 'function' && !window._epaiDelHotHooked) {
      window._epaiDelHotHooked = true;
      var origDelHot = window.deleteHotNews;
      window.deleteHotNews = function (id) {
        origDelHot(id);
        sb.from('hotnews').delete().eq('id', id).then(function () {});
      };
    }

    // 5. Sinkronisasi Running Text Pengumuman
    if (typeof window.saveMarqueeText === 'function' && !window._epaiMarqHooked) {
      window._epaiMarqHooked = true;
      var origSaveMarq = window.saveMarqueeText;
      window.saveMarqueeText = function () {
        origSaveMarq();
        var val = localStorage.getItem('epai_marquee_text') || '';
        sb.from('app_settings').upsert({
          key: 'marquee_text', value: val, updated_at: new Date().toISOString()
        }, { onConflict: 'key' }).then(function (res) {
          if (res.error) {
            alert('Gagal sinkron Pengumuman: ' + res.error.message);
          } else if (typeof showToast === 'function') {
            showToast('Running text tersinkron ke semua HP ✓', 'success');
          }
        });
      };
    }
  function loadMarqueeFromCloud() {
        if (typeof sb === 'undefined') return;
    sb.from('app_settings').select('value').eq('key', 'marquee_text').single().then(function(res) {
      if (res.data && res.data.value) {
        localStorage.setItem('epai_marquee_text', res.data.value);
        var el = document.getElementById('marqueeText') || document.querySelector('.marquee-text');
        if (el) el.textContent = res.data.value;
      }
    });
  }
  window.loadMarqueeFromCloud = loadMarqueeFromCloud;
  setTimeout(loadMarqueeFromCloud, 800);
  setInterval(function(){ if (document.visibilityState === 'visible') loadMarqueeFromCloud(); }, 180000);
    // 6. Sinkronisasi Hapus Paket Soal
    if (typeof window.deleteQuizPackage === 'function' && !window._epaiDelQuizHooked) {
      window._epaiDelQuizHooked = true;
      var origDelQuiz = window.deleteQuizPackage;
      window.deleteQuizPackage = function (id) {
        origDelQuiz(id);
        sb.from('quizzes').delete().eq('id', id).then(function () {});
      };
    }

    // 7. Tarik Semua Data (Students, Materials, Praktis, HotNews, Pengumuman) & Auto-Refresh UI
    async function syncAllTables() {
      try {
        var extra = await Promise.all([
          sb.from('students').select('*').limit(2000),
          sb.from('praktis').select('*').limit(500),
          sb.from('app_settings').select('*').eq('key', 'marquee_text').maybeSingle(),
          sb.from('materials').select('*').limit(500),
          sb.from('hotnews').select('*').limit(200)
        ]);

        // Students
        if (!extra[0].error && extra[0].data && extra[0].data.length) {
          var stMap = {};
          if (typeof getStudents === 'function') getStudents().forEach(function (s) { stMap[s.u] = s; });
          extra[0].data.forEach(function (r) {
            stMap[r.username] = {
              u: r.username, n: r.name, c: r.kelas,
              a: r.absen || 0, g: r.jk || '', active: r.active !== false
            };
          });
          db.students = Object.keys(stMap).map(function (k) { return stMap[k]; });
          if (typeof fillStudentSelect === 'function') fillStudentSelect();
          if (typeof refreshStudentCounts === 'function') refreshStudentCounts();
        }

        // Praktis
        if (!extra[1].error && extra[1].data) {
          db.praktis = extra[1].data.map(function (row) {
            return (row.data && typeof row.data === 'object') ? row.data : row;
          });
        }

        // Running Text
        if (!extra[2].error && extra[2].data && typeof extra[2].data.value === 'string') {
          var curLocal = localStorage.getItem('epai_marquee_text') || '';
          if (curLocal !== extra[2].data.value) {
            localStorage.setItem('epai_marquee_text', extra[2].data.value);
            if (typeof loadMarqueeText === 'function') loadMarqueeText();
          }
        }

        // Materials
        if (!extra[3].error && extra[3].data) {
          var serverMats = extra[3].data.map(function (row) {
            var d = (row.data && typeof row.data === 'object') ? Object.assign({}, row.data) : Object.assign({}, row);
            d.id = d.id || row.id;
            d.kelas = Number(d.kelas != null && d.kelas !== '' ? d.kelas : row.kelas);
            d.semester = Number(d.semester != null && d.semester !== '' ? d.semester : row.semester);
            d.chapter = Number(d.chapter != null && d.chapter !== '' ? d.chapter : row.chapter);
            if (!d.title) d.title = row.title;
            return d;
          });
          // Jangan hilangkan materi lokal yang belum sempat tersimpan ke server
          var serverIds = {};
          serverMats.forEach(function (m) { serverIds[String(m.id)] = 1; });
          (db.materials || []).forEach(function (m) {
            if (m && m.id && !serverIds[String(m.id)] && current && current.role === 'teacher') serverMats.push(m);
          });
          db.materials = serverMats;
          window.db = db;
        }

        // Hot News
        if (!extra[4].error && extra[4].data) {
          db.hotnews = extra[4].data.map(function (row) {
            return (row.data && typeof row.data === 'object') ? row.data : row;
          });
        }

        localStorage.setItem('epai_offline_v1', JSON.stringify(db));

        if (typeof current !== 'undefined' && current) {
          if (typeof showPage === 'function' && typeof currentPage !== 'undefined' && currentPage) showPage(currentPage);
          if (typeof renderMaterials === 'function') renderMaterials();
          if (typeof window.renderLessons === 'function') window.renderLessons();
          if (typeof renderPraktis === 'function') renderPraktis();
          if (typeof renderHotNews === 'function') renderHotNews();
        }
      } catch (e) {
        console.warn('Sinkron gagal:', e);
      }
    }
    window.syncAllTables = syncAllTables;
    syncAllTables();
    setInterval(function(){ if (document.visibilityState === 'visible' && navigator.onLine) syncAllTables(); }, 300000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installAllSync);
  } else {
    installAllSync();
  }
})();
