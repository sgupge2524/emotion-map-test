// ========================================
// 感情マップ - JavaScript
// 初期位置：佐賀市に変更
// ========================================

// --- Firebase 設定 ---
const firebaseConfig = {
    apiKey: "YOUR_API_KEY", // あなたのAPIキーに置き換える
    authDomain: "emotion-map-f45a3.firebaseapp.com",
    projectId: "emotion-map-f45a3",
    storageBucket: "emotion-map-f45a3.appspot.com",
    messagingSenderId: "39564015447",
    appId: "YOUR_APP_ID" // あなたのApp IDに置き換える
};

// Firebaseの初期化
firebase.initializeApp(firebaseConfig);

// Firestoreのインスタンスを取得
const db = firebase.firestore();
console.log('Firebase初期化完了。Firestoreに接続します。');

// --- グローバル変数 ---
let map;
let emotionFilterValue = 'all';
let selectedEmotion = null;
let markers = [];
let emotionCounts = {};
let userLocation = null;
let searchMarker = null;
let currentLocationMarker = null;

// モーダル用の一時保存
let pendingLatLng = null;
let pendingEmotion = null;

// 感情スタイル設定
const emotionStyles = {
    happy: {
        color: '#FDD835',
        icon: '🥰',
        label: '嬉しい',
        markerColor: '#FFE082'
    },
    peaceful: {
        color: '#29B6F6',
        icon: '😌',
        label: '穏やか',
        markerColor: '#B3E5FC'
    },
    excited: {
        color: '#FF7043',
        icon: '🤩',
        label: '興奮',
        markerColor: '#FFAB91'
    },
    nostalgic: {
        color: '#66BB6A',
        icon: '🥺',
        label: '懐かしい',
        markerColor: '#A5D6A7'
    },
    romantic: {
        color: '#AB47BC',
        icon: '💕',
        label: 'ロマンチック',
        markerColor: '#CE93D8'
    },
    delicious: {
        color: '#FF8A65',
        icon: '😋',
        label: '美味しい',
        markerColor: '#FFCCBC'
    }
};

const sceneLabels = {
    alone: '一人で',
    friends: '友達と',
    family: '家族と',
    partner: '恋人と',
    others: 'その他'
};

const timeSlotLabels = {
    morning: '朝',
    day: '昼',
    evening: '夕方',
    night: '夜',
    midnight: '深夜'
};

// カスタムアイコンを作成する関数
function createCustomIcon(emotion) {
    const style = emotionStyles[emotion];
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="
            font-size: 32px;
            text-align: center;
            text-shadow: 0 2px 4px rgba(0,0,0,0.3);
            transform: translate(-50%, -50%);
        ">${style.icon}</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
        popupAnchor: [0, -20]
    });
}

// 地図の初期化（佐賀市を中心に）
function initMap() {
    // Leafletで地図を作成
    // 佐賀市の座標: 緯度 33.2492, 経度 130.2989
    map = L.map('map').setView([33.2492, 130.2989], 13);

    // OpenStreetMapのタイルレイヤーを追加
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
    }).addTo(map);

    console.log('地図の初期化完了（佐賀市中心）');
    updateStatus('地図が準備できました！（佐賀市）');

    // --- Firebase: 感情データのリアルタイムリスナーを設定 ---
    setupEmotionRealtimeListener();

    // 地図クリックイベント
    map.on('click', function (e) {
        if (selectedEmotion) {
            openEntryModal(e.latlng, selectedEmotion);
        } else {
            updateStatus('まず感情を選択してください', 'warning');
        }
    });

    // 凡例を初期表示
    updateLegend();
}

// --- Firebase: 感情データのリアルタイムリスナー設定 ---
function setupEmotionRealtimeListener() {
    db.collection('emotions').orderBy('date', 'desc')
        .onSnapshot((snapshot) => {
            // 既存のマーカーをすべて削除
            markers.forEach(m => map.removeLayer(m.marker));
            markers = [];
            emotionCounts = {};

            snapshot.forEach((doc) => {
                const data = doc.data();
                createMarker({ ...data, id: doc.id });
            });

            updateLegend();
            applyFilters();

            updateStatus(`Firestoreから${snapshot.docs.length}個の感情をロード・更新しました`, 'success');
            console.log(`Firestoreから${snapshot.docs.length}個の感情マーカーをロード・更新しました`);
        }, (error) => {
            console.error("感情データのロードエラー:", error);
            updateStatus('感情データのロードに失敗しました', 'error');
        });
}

// マーカーを作成
function createMarker(data) {
    const style = emotionStyles[data.emotion];
    if (!style) {
        console.warn('不明なemotionのデータをスキップ:', data);
        return;
    }
    const icon = createCustomIcon(data.emotion);

    const marker = L.marker([data.lat, data.lng], {
        icon: icon,
        title: data.comment || ''
    }).addTo(map);

    // 日付のフォーマット
    const displayDate = data.date && data.date.toDate ? data.date.toDate().toLocaleDateString() : '日付不明';

    const placeName = data.placeName || '（場所名なし）';
    const sceneText = data.scene ? sceneLabels[data.scene] || 'その他' : null;
    const timeText = data.timeSlot ? timeSlotLabels[data.timeSlot] || '' : null;
    const publicComment = data.comment || '（コメントなし）';
    const privateNote = data.privateNote || '';

    let tagsText = [];
    if (sceneText) tagsText.push(sceneText);
    if (timeText) tagsText.push(timeText);

    const tagsDisplay = tagsText.length > 0 ? tagsText.join('・') : '';

    const secretSection = privateNote ? `
        <div class="popup-secret locked" data-secret="${encodeURIComponent(privateNote)}">
            <div class="secret-lock">🔒 500m以内に入ると表示されます</div>
            <div class="secret-body"></div>
            <div class="secret-hint">現在 <span class="secret-distance">---</span> m</div>
        </div>
    ` : '';

    const popupContent = `
        <div class="custom-popup">
            <div class="popup-header">
                <span class="popup-emoji">${style.icon}</span>
                <span class="popup-emotion" style="color: ${style.color};">${style.label}</span>
            </div>
            <div class="popup-place">${placeName}</div>
            ${tagsDisplay ? `<div class="popup-tags">🧷 ${tagsDisplay}</div>` : ''}
            <div class="popup-comment">${publicComment}</div>
            ${secretSection}
            <div class="popup-user">
                👤 ${data.user || '匿名'} 
                ・ 📅 ${displayDate}
            </div>
        </div>
    `;

    marker.bindPopup(popupContent, {
        maxWidth: 260,
        className: 'custom-popup-container'
    });

    marker.on('popupopen', (e) => {
        const popupEl = e.popup.getElement();
        if (popupEl) {
            updatePopupSecret(popupEl, data);
        }
    });

    markers.push({ marker: marker, data: data });

    // カウントを更新
    emotionCounts[data.emotion] = (emotionCounts[data.emotion] || 0) + 1;
}

// 感情選択ボタンのイベント設定
document.querySelectorAll('.emotion-btn').forEach(btn => {
    btn.addEventListener('click', function () {
        const emotion = this.getAttribute('data-emotion');
        setEmotion(emotion, this);
    });
});

// 感情を選択
function setEmotion(emotion, buttonElement) {
    selectedEmotion = emotion;
    const style = emotionStyles[emotion];

    document.querySelectorAll('.emotion-btn').forEach(btn => {
        btn.classList.remove('selected');
    });

    buttonElement.classList.add('selected');

    updateStatus(`${style.icon} "${style.label}" を選択中 - 地図をクリックしてください`, 'info');
    console.log('選択された感情:', emotion);
}

// 感情選択をリセット
function resetEmotionSelection() {
    selectedEmotion = null;
    document.querySelectorAll('.emotion-btn').forEach(btn => {
        btn.classList.remove('selected');
    });
}

// ステータスを更新
function updateStatus(message, type = 'info') {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;

    const indicator = document.querySelector('.status-indicator');
    switch (type) {
        case 'success':
            indicator.style.background = '#4CAF50';
            break;
        case 'warning':
            indicator.style.background = '#FF9800';
            break;
        case 'error':
            indicator.style.background = '#F44336';
            break;
        default:
            indicator.style.background = '#2196F3';
    }
}

// 凡例を更新
function updateLegend() {
    const legendContent = document.getElementById('legend-content');
    legendContent.innerHTML = '';

    Object.keys(emotionStyles).forEach(emotion => {
        const style = emotionStyles[emotion];
        const count = emotionCounts[emotion] || 0;

        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `
            <span style="font-size: 18px;">${style.icon}</span>
            <span>${style.label}</span>
            <span class="legend-count">${count}</span>
        `;
        legendContent.appendChild(item);
    });
}

// --- モーダル関連 ---
function openEntryModal(latlng, emotion) {
    pendingLatLng = latlng;
    pendingEmotion = emotion;
    const style = emotionStyles[emotion];

    const modal = document.getElementById('entry-modal');
    const emojiEl = document.getElementById('modal-emoji');
    const titleEl = document.getElementById('modal-title');

    emojiEl.textContent = style.icon;
    titleEl.textContent = `${style.label} な瞬間を記録する`;

    // フォームを初期化
    document.getElementById('entry-form').reset();

    modal.classList.remove('hidden');
    
    // モーダルが表示されたらフォーカスを設定
    setTimeout(() => {
        document.getElementById('modal-place').focus();
    }, 100);
}

function closeEntryModal() {
    const modal = document.getElementById('entry-modal');
    modal.classList.add('hidden');
    pendingLatLng = null;
    pendingEmotion = null;
}

function setupModalEvents() {
    const overlay = document.getElementById('entry-modal');
    const cancelBtn = document.getElementById('modal-cancel');
    const form = document.getElementById('entry-form');

    cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeEntryModal();
        updateStatus('登録をキャンセルしました', 'info');
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeEntryModal();
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!pendingLatLng || !pendingEmotion) {
            closeEntryModal();
            return;
        }

        const placeName = document.getElementById('modal-place').value.trim();
        const scene = document.getElementById('modal-scene').value;
        const timeSlot = document.getElementById('modal-timeSlot').value;
        const publicComment = document.getElementById('modal-publicComment').value.trim();
        const privateNote = document.getElementById('modal-privateNote').value.trim();

        if (!publicComment) {
            alert('みんなに共有するひとことを書いてみてください。');
            return;
        }

        const newData = {
            lat: pendingLatLng.lat,
            lng: pendingLatLng.lng,
            emotion: pendingEmotion,
            comment: publicComment,
            placeName: placeName || null,
            scene: scene || null,
            timeSlot: timeSlot || null,
            privateNote: privateNote || null,
            user: '匿名ユーザー',
            date: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection('emotions').add(newData);
            updateStatus('感情を登録しました！', 'success');
            console.log('新しい感情を登録:', newData);
            closeEntryModal();
            resetEmotionSelection();
        } catch (error) {
            console.error("感情の保存エラー:", error);
            updateStatus('感情の登録に失敗しました', 'error');
            alert('保存に失敗しました。もう一度お試しください。');
        }
    });
}

// --- フィルター関連 ---
function setupFilterControls() {
    const emotionSelect = document.getElementById('filter-emotion');
    const sceneSelect = document.getElementById('filter-scene');
    const timeSelect = document.getElementById('filter-time');

    [emotionSelect, sceneSelect, timeSelect].forEach(sel => {
        sel.addEventListener('change', applyFilters);
    });
}

function applyFilters() {
    const sceneFilter = document.getElementById('filter-scene')?.value || 'all';
    const timeFilter = document.getElementById('filter-time')?.value || 'all';

    markers.forEach(({ marker, data }) => {
        let visible = true;

        // 🔽 emotion（検索バー下の新フィルター）
        if (emotionFilterValue !== 'all' && data.emotion !== emotionFilterValue) {
            visible = false;
        }

        // scene
        if (sceneFilter !== 'all') {
            if (!data.scene || data.scene !== sceneFilter) visible = false;
        }

        // time
        if (timeFilter !== 'all') {
            if (!data.timeSlot || data.timeSlot !== timeFilter) visible = false;
        }

        if (visible) {
            if (!map.hasLayer(marker)) marker.addTo(map);
        } else {
            if (map.hasLayer(marker)) map.removeLayer(marker);
        }
    });
}


// --- 秘密メッセージの表示制御 ---
function updatePopupSecret(popupElement, data) {
    const secretEl = popupElement.querySelector('.popup-secret');
    if (!secretEl) return;

    const bodyEl = secretEl.querySelector('.secret-body');
    const distanceEl = secretEl.querySelector('.secret-distance');

    if (!userLocation) {
        if (distanceEl) distanceEl.textContent = '---';
        secretEl.classList.add('locked');
        secretEl.classList.remove('revealed');
        if (bodyEl) bodyEl.textContent = '';
        return;
    }

    const distance = Math.round(map.distance(userLocation, [data.lat, data.lng]));
    if (distanceEl) distanceEl.textContent = distance;

    if (distance <= 500) {
        secretEl.classList.add('revealed');
        secretEl.classList.remove('locked');
        if (bodyEl && !bodyEl.textContent) {
            bodyEl.textContent = decodeURIComponent(secretEl.dataset.secret || '');
        }
    } else {
        secretEl.classList.add('locked');
        secretEl.classList.remove('revealed');
        if (bodyEl) bodyEl.textContent = '';
    }
}

function refreshOpenPopups() {
    markers.forEach(({ marker, data }) => {
        const popup = marker.getPopup();
        if (!popup) return;
        if (map.hasLayer(popup)) {
            const el = popup.getElement();
            if (el) updatePopupSecret(el, data);
        }
    });
}

// --- 検索バーの処理 ---
function setupSearchBar() {
    const btn = document.getElementById('search-btn');
    const input = document.getElementById('search-input');
    const locateBtn = document.getElementById('locate-btn');

    btn.addEventListener('click', searchPlace);

    // Enterキーでも検索
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchPlace();
    });

    locateBtn.addEventListener('click', goToCurrentLocation);
}

async function searchPlace() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) {
        alert("検索ワードを入力してください");
        return;
    }

    // Nominatim API (OpenStreetMap)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`;

    try {
        const res = await fetch(url);
        const results = await res.json();

        if (results.length === 0) {
            alert("場所が見つかりませんでした");
            return;
        }

        const { lat, lon } = results[0];

        const targetLatLng = [parseFloat(lat), parseFloat(lon)];
        map.setView(targetLatLng, 15);
        updateStatus(`📍「${query}」に移動しました`, 'success');

        // 既存の検索ピンがあれば削除
        if (searchMarker && map.hasLayer(searchMarker)) {
            map.removeLayer(searchMarker);
        }
        // 検索地点のピンを表示
        searchMarker = L.marker(targetLatLng, { title: `検索: ${query}` })
            .addTo(map)
            .bindPopup(`「${query}」付近`)
            .openPopup();

    } catch (err) {
        console.error(err);
        alert("場所の検索に失敗しました");
    }
}

// --- 現在地へ移動 ---
function goToCurrentLocation() {
    if (!navigator.geolocation) {
        alert('位置情報がサポートされていません');
        return;
    }
    updateStatus('現在地を取得しています…', 'info');
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const latlng = [pos.coords.latitude, pos.coords.longitude];
            userLocation = latlng;
            map.setView(latlng, 15);
            updateStatus('現在地に移動しました', 'success');

            if (currentLocationMarker && map.hasLayer(currentLocationMarker)) {
                map.removeLayer(currentLocationMarker);
            }
            currentLocationMarker = L.marker(latlng, { title: '現在地' })
                .addTo(map)
                .bindPopup('現在地')
                .openPopup();

            refreshOpenPopups();
        },
        (err) => {
            console.warn(err);
            updateStatus('現在地を取得できませんでした', 'warning');
            alert('現在地を取得できませんでした');
        },
        {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 8000
        }
    );
}

// --- 位置情報監視 ---
function setupGeolocationWatch() {
    if (!navigator.geolocation) {
        updateStatus('位置情報がサポートされていません', 'warning');
        return;
    }

    navigator.geolocation.watchPosition(
        (pos) => {
            userLocation = [pos.coords.latitude, pos.coords.longitude];
            refreshOpenPopups();
        },
        (err) => {
            console.warn('位置情報の取得エラー', err);
            updateStatus('位置情報を取得できませんでした', 'warning');
        },
        {
            enableHighAccuracy: true,
            maximumAge: 10000,
            timeout: 8000
        }
    );
}

// ページ読み込み時に地図を初期化
window.addEventListener('load', function () {
    console.log('ページ読み込み完了');
    initMap();
    setupModalEvents();
    setupFilterControls();
    setupSearchBar();
    setupEmotionFilterBar();
    setupGeolocationWatch();
});

// エラーハンドリング
window.onerror = function (msg, url, lineNo, columnNo, error) {
    console.error('エラー発生:', msg, error);
    updateStatus('エラーが発生しました', 'error');
    return false;
};

function setupEmotionFilterBar() {
    document.querySelectorAll('.emotion-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            emotionFilterValue = btn.dataset.filter;

            document.querySelectorAll('.emotion-filter-btn')
                .forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            applyFilters();
        });
    });
}


