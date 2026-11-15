/* E-PAIBP All-in-One Realtime Sync & YouTube Fix */
(function () {
  'use strict';

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
          if (payloadData.pdfData && payloadData.pdfData.length > 1500000) {
            payloadData.pdfData = '';
            if (typeof showToast === 'function') {
              showToast('PDF > 1.5MB hanya lokal. Gunakan Link PDF Drive untuk siswa.', 'error');
            }
          }
          sb.from('materials').upsert({
            kelas: k,
            semester: s,
            chapter: c,
            title: savedItem.title,
            data: payloadData
          }, { onConflict: 'kelas,semester,chapter' }).then(function (res) {
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
            if (!res.error && typeof showToast === 'function') {
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

    // 4. Sinkronisasi Hot News & Hapus
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
        if (val) {
          sb.from('app_settings').upsert({
            key: 'marquee_text', value: val, updated_at: new Date().toISOString()
          }, { onConflict: 'key' }).then(function () {});
        }
      };
    }

    // 6. Sinkronisasi Hapus Paket Soal
    if (typeof window.deleteQuizPackage === 'function' && !window._epaiDelQuizHooked) {
      window._epaiDelQuizHooked = true;
      var origDelQuiz = window.deleteQuizPackage;
      window.deleteQuizPackage = function (id) {
        origDelQuiz(id);
        sb.from('quizzes').delete().eq('id', id).then(function () {});
      };
    }

    // 7. Tarik Semua Data Tambahan (Students, Praktis, Pengumuman) & Auto-Refresh UI
    async function syncExtraTables() {
      try {
        var extra = await Promise.all([
          sb.from('students').select('*').limit(2000),
          sb.from('praktis').select('*').limit(500),
          sb.from('app_settings').select('*').eq('key', 'marquee_text').maybeSingle()
        ]);

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

        if (!extra[1].error && extra[1].data && extra[1].data.length) {
          var prMap = {};
          (db.praktis || []).forEach(function (p) { prMap[p.id] = p; });
          extra[1].data.forEach(function (row) {
            var item = (row.data && typeof row.data === 'object') ? row.data : row;
            if (item && item.id) prMap[item.id] = item;
          });
          db.praktis = Object.keys(prMap).map(function (k) { return prMap[k]; });
        }

        if (!extra[2].error && extra[2].data && extra[2].data.value) {
          var curLocal = localStorage.getItem('epai_marquee_text') || '';
          if (curLocal !== extra[2].data.value) {
            localStorage.setItem('epai_marquee_text', extra[2].data.value);
            if (typeof loadMarqueeText === 'function') loadMarqueeText();
          }
        }

        localStorage.setItem('epai_offline_v1', JSON.stringify(db));

        if (typeof current !== 'undefined' && current) {
          if (current.role === 'student' || current.role === 'parent') {
            if (typeof renderLessons === 'function') renderLessons();
            if (typeof renderStudentPraktis === 'function') renderStudentPraktis();
            if (typeof renderStudentHotNews === 'function') renderStudentHotNews();
            if (typeof renderMyScores === 'function') renderMyScores();
          } else if (current.role === 'teacher') {
            if (typeof renderMaterialAdmin === 'function') renderMaterialAdmin();
            if (typeof renderPraktisAdmin === 'function') renderPraktisAdmin();
            if (typeof renderHotNewsAdmin === 'function') renderHotNewsAdmin();
          }
        }
      } catch (e) {}
    }

    // 8. Tombol Migrasi Semua Data Siswa & Ibadah Praktis ke Server
    window.syncAllMasterDataToCloud = async function () {
      if (typeof showToast === 'function') showToast('Menyinkronkan seluruh data ke server...', '');
      var stList = (typeof getStudents === 'function' ? getStudents() : []).map(function (item) {
        return {
          username: item.u, name: item.n, kelas: item.c,
          absen: item.a || 0, jk: item.g || 'L', active: item.active !== false
        };
      });
      var prList = (db.praktis || []).map(function (item) {
        return {
          id: item.id, title: item.title, kelas: item.kelas || '',
          desc: item.desc || '', video: item.video || '', pdf: item.pdf || '',
          image: item.image || '', data: item
        };
      });
      var r1 = stList.length ? await sb.from('students').upsert(stList, { onConflict: 'username' }) : { error: null };
      var r2 = prList.length ? await sb.from('praktis').upsert(prList, { onConflict: 'id' }) : { error: null };
      if (r1.error || r2.error) {
