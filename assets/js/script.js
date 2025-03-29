let userLocation = null; // Kullanıcı konumu
let locationCircle = null; // Kullanıcı konumu için çember
let userMarker = null; // Kullanıcı konumu işareti

const map = L.map('map', {
    zoom: 6,
    maxZoom: 19,
    minZoom: 6,
    zoomControl: true,
    maxBounds: [
        [36.0, 26.0],
        [42.0, 45.0]
    ],
    maxBoundsViscosity: 1.0
});

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        userLocation = position.coords;

        map.setView([latitude, longitude], 18);

        // Bildirim ekleme çemberi
        if (!locationCircle) {
            locationCircle = L.circle([latitude, longitude], {
                color: 'blue',
                fillColor: 'blue',
                fillOpacity: 0.1,
                radius: 1000
            }).addTo(map);
        } else {
            locationCircle.setLatLng([latitude, longitude]);
        }

        // Kullanıcı konumu işareti
        if (!userMarker) {
            userMarker = L.marker([latitude, longitude], {
                icon: L.icon({
                    iconUrl: 'img/my-location.png',
                    iconSize: [50, 50],
                    iconAnchor: [25, 50],
                    popupAnchor: [0, -50]
                })
            })
            .addTo(map)
            .bindPopup(`Şu an buradasın!`)
            .openPopup();
        } else {
            userMarker.setLatLng([latitude, longitude]);
        }

    }, () => {
        map.setView([39.925533, 32.866287], 6); // Ankara (Konum hatasında varsayılan konum)
    }, {
        enableHighAccuracy: true,
        maximumAge: 0
    });
} else {
    map.setView([39.925533, 32.866287], 6); // Ankara (GeoLocation desteklenmiyorsa)
}

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

// Konum güncelleme fonksiyonu
function updateLocation(position) {
    const { latitude, longitude } = position.coords;

    // Eski marker ve çemberi kaldır
    if (userMarker) map.removeLayer(userMarker);
    if (locationCircle) map.removeLayer(locationCircle);

    // Yeni marker ekle
    userMarker = L.marker([latitude, longitude], {
        icon: L.icon({
            iconUrl: 'img/my-location.png',
            iconSize: [50, 50],
            iconAnchor: [25, 50],
            popupAnchor: [0, -50]
        })
    })
    .addTo(map)
    .bindPopup(`Şu an buradasın!`)

    // Yeni çember ekle (1 km yarıçap)
    locationCircle = L.circle([latitude, longitude], {
        color: 'blue',
        fillColor: 'blue',
        fillOpacity: 0.1,
        radius: 1000
    }).addTo(map);
}

const socket = io(); // Socket.io bağlantısı
const chatButton = document.getElementById('chatButton'); // Sohbet kutusunu açma butonu
const chatBox = document.getElementById('chatBox'); // Sohbet kutusu
const messageContainer = document.getElementById('messageContainer'); // Mesajların gösterildiği alan
const messageInput = document.getElementById('messageInput'); // Mesaj input alanı
const sendButton = document.getElementById('sendButton'); // Mesaj gönderme butonu
const menuButton = document.getElementById('menuButton'); // Menü butonu
const menuDropdown = document.getElementById('menuDropdown'); // Menü dropdown
const emojiButton = document.getElementById('emojiButton'); // Emoji anlamları butonu
const emojiDropdown = document.getElementById('emojiDropdown'); // Emoji anlamları dropdown

// Menü dropdown açma ve kapama
menuButton.addEventListener('click', () => {
    menuDropdown.style.display = menuDropdown.style.display === 'block' ? 'none' : 'block';
});

// Emoji anlamları dropdown açma ve kapama
emojiButton.addEventListener('click', () => {
    emojiDropdown.style.display = emojiDropdown.style.display === 'block' ? 'none' : 'block';
});

// Sohbet butonuna tıklandığında mesaj kutusunu en alta kaydır
function scrollToBottom() {
    messageContainer.scrollTop = messageContainer.scrollHeight;
}

// Sohbet kutusunu açma ve kapama
chatButton.addEventListener('click', () => {
    chatBox.classList.toggle('open');
    scrollToBottom();
});

// Mesaj gönderme işlemi
function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    socket.emit('sendMessage', {
        message,
    });

    messageInput.value = '';  // Mesajı gönderdikten sonra input'u temizle
    messageInput.focus(); // Klavye açık kalsın
}

// Mesaj gönderme butonu ve Enter tuşu için tek fonksiyon
sendButton.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
});

// Ekrana uyarı mesajı basma
socket.on('alertMessage', (message) => {
    hhAlert(message);
});

// Sayfa yüklendiğinde veritabanındaki tüm mesajları yükleme
socket.emit('loadMessages');

// Sayfa yüklendiğinde sohbet kutusunu en alta kaydır
window.onload = scrollToBottom;

// Veritabanındaki tüm mesajları yükleme
socket.on('allMessages', (messages) => {
    messageContainer.innerHTML = ''; // Önce tüm mesajları temizle
    messages.forEach(msg => {
        const msgElement = document.createElement('div');
        msgElement.classList.add('message');
        msgElement.innerHTML = `${msg.message} <br><small>${new Date(msg.timestamp).toLocaleString()}</small>`;
        messageContainer.appendChild(msgElement);
    });
    scrollToBottom(); // Mesajlar yüklendikten sonra en alta kaydır
});

// Yeni mesaj geldiğinde ekrana basma
socket.on('receiveMessage', (messageData) => {
    const msgElement = document.createElement('div');
    msgElement.classList.add('message');
    msgElement.innerHTML = `${messageData.message} <br><small>${new Date(messageData.timestamp).toLocaleString()}</small>`;
    messageContainer.appendChild(msgElement);
    scrollToBottom();  // Yeni mesaj geldiğinde en alta kaydır
});

// Zaman formatlama fonksiyonu
function formatTimeAgo(timestamp) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - new Date(timestamp)) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);

    if (diffInSeconds < 60) {
        return 'Az önce';
    } else if (diffInMinutes < 60) {
        return `${diffInMinutes} dakika önce`;
    } else if (diffInHours < 24) {
        return `${diffInHours} saat ${diffInMinutes % 60} dakika önce`;
    }
}

// Emojiyi ve zaman bilgisini haritaya ekleme fonksiyonu
function addEmojiMarker(lat, lng, emoji, timestamp, note) {
    const emojiIcon = L.divIcon({
        className: 'emoji-icon',
        html: emoji,
        iconSize: [50, 50]
    });

    const formattedTime = formatTimeAgo(timestamp);
    const noteContent = note ? `<div><b>Not:</b> ${note}</div>` : '';

    const marker = L.marker([lat, lng], { icon: emojiIcon })
        .addTo(map)
        .bindPopup(`
            <div>
                <b>${formattedTime}</b> bildirildi!
                ${noteContent}
            </div>
        `)
}

let lastClickedCoords = null; // Son tıklanan koordinatlar
let previewMarker = null; // Önizleme işareti

// Haritaya tıklandığında bildirim menüsünü aç ve haritaya önizleme işareti ekle
map.on('click', (e) => {
    lastClickedCoords = e.latlng;
    showReportMenu(e.latlng);
    showPreviewMarker(e.latlng);
});

// Kullanıcı konumunun 1 kilometre yarıçapındaki alanı hesaplama fonksiyonu
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Kilometre cinsinden mesafe
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Bildirim menüsünü gösterme fonksiyonu
function showReportMenu(latlng) {
    const reportMenu = document.getElementById('reportMenu');
    reportMenu.style.display = 'block';
    reportMenu.style.left = '50%';
    reportMenu.style.bottom = '10%';
}

// Bildirim menüsünü kapatma fonksiyonu
function closeReportMenu() {
    const reportMenu = document.getElementById('reportMenu');
    reportMenu.style.display = 'none';
    if (previewMarker) {
        map.removeLayer(previewMarker);
    }
}

// Önizleme işareti gösterme fonksiyonu
function showPreviewMarker(latlng) {
    if (previewMarker) {
        map.removeLayer(previewMarker);
    }
    previewMarker = L.circleMarker(latlng, {
        color: 'black',
        fillColor: 'black',
        fillOpacity: 0.2,
        radius: 15,
    }).addTo(map);
}

// Bildirim gönderme fonksiyonu
function sendReport() {
    if (!userLocation) {
        hhAlert('Konumunuz alınamadı, lütfen konum izni verin.');
        return;
    }

    // Kullanıcı konumu ile son tıklanan konum arasındaki mesafeyi hesapla
    const distance = getDistance(
        userLocation.latitude,
        userLocation.longitude,
        lastClickedCoords.lat,
        lastClickedCoords.lng
    );

    if (distance <= 1) {
        const reportType = document.getElementById('reportType').value;
        const reportNote = document.getElementById('reportNote').value.trim();

        if (!reportType) {
            hhAlert('Lütfen bir bildirim türü seçin.');
            return;
        }

        const emoji = reportType.split(' ')[0];
        const type = reportType.split(' ')[1];

        socket.emit('sendReport', {
            lat: lastClickedCoords.lat,
            lng: lastClickedCoords.lng,
            type: type,
            emoji: emoji,
            note: reportNote || ''
        });

        document.getElementById('reportNote').value = '';
        document.getElementById('reportMenu').style.display = 'none';
        map.removeLayer(previewMarker);
    } else {
        hhAlert('Bu alana bildirim ekleyemezsiniz. Bildirim ekleyebileceğiniz maksimum mesafe 1 km.');
    }
}

// Alert gösterme fonksiyonu
function hhAlert(message) {
    const alertBox = document.getElementById('customAlert');
    const alertMessage = document.getElementById('alertMessage');
    alertMessage.textContent = message;
    alertBox.style.display = 'block';
    setTimeout(closeAlert, 10000);
}

// Alert kapatma fonksiyonu
function closeAlert() {
    const alertBox = document.getElementById('customAlert');
    alertBox.style.display = 'none';
}

// "Konum Bul" butonuna tıklanınca konumu tespit et ve haritayı o konuma kaydır
document.getElementById('gotoLocationButton').addEventListener('click', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const { latitude, longitude } = position.coords;
            map.setView([latitude, longitude], 18); // Konum tespit edildiğinde haritayı o noktaya kaydır

            // Eğer önceden bir kullanıcı marker'ı varsa, kaldır
            if (userMarker) {
                map.removeLayer(userMarker);
            }

            // Yeni marker ekle
            userMarker = L.marker([latitude, longitude], {
                icon: L.icon({
                    iconUrl: 'img/my-location.png',
                    iconSize: [50, 50],
                    iconAnchor: [25, 50],
                    popupAnchor: [0, -50]
                })
            })
            .addTo(map)
            .bindPopup(`Şu an buradasın!`)
        }, () => {
            hhAlert("Konum alınırken bir hata oluştu.");
        },
        {
            maximumAge: 0
        });
    } else {
        hhAlert("Geolocation desteği mevcut değil.");
    }
});

window.addEventListener('DOMContentLoaded', () => {
    setInterval(() => {
        // Backend'e bir istek gönderme (MongoDB'den veri çekiyoruz)
        fetch('/getStatics')
            .then(response => response.json()) // JSON olarak dönen veriyi işleme
            .then(data => {
                const { userCount, reportCount, messageCount } = data;

                // Çevrimiçi kullanıcı sayısını güncelle
                document.getElementById('onlineUsers').textContent = `Çevrimiçi: ${userCount}`;

                // Toplam mesaj sayısını güncelle
                document.getElementById('totalMessages').textContent = `Toplam Mesaj: ${messageCount}`;

                // Toplam bildirim sayısını güncelle
                document.getElementById('totalReports').textContent = `Toplam Bildirim: ${reportCount}`;
            })
            .catch(error => {
                console.error('Error fetching user counts:', error);
            });
    }, 1000); // 1 saniye aralıklarla veri yenilenmesi için
});

// Veritabanındaki bildirimleri yükle
socket.on('loadReports', (reports) => {
    reports.forEach(report => {
        const { lat, lng, emoji, timestamp, note } = report;
        addEmojiMarker(lat, lng, emoji, timestamp, note);
    });
});

// Yeni bildirim geldiğinde haritada göster
socket.on('receiveReport', (data) => {
    const { lat, lng, emoji, timestamp, note } = data;
    addEmojiMarker(lat, lng, emoji, timestamp, note);
});

// Başlangıçta veritabanındaki tüm bildirimleri al
socket.emit('getReports');

document.addEventListener("DOMContentLoaded", function () {
    const scrollingText = document.querySelector(".scrolling-text");

    // Hız ayarı fonksiyonu
    function setScrollSpeed(speedInSeconds) {
        scrollingText.style.animationDuration = `${speedInSeconds}s`;
    }

    // Yeni metin fonksiyonu
    function updateText(newText) {
        scrollingText.textContent = newText;
    }

    setScrollSpeed(75);
    updateText("Harita yüklenmezse sağ alttaki butona tıklayarak konumunuzu belirleyebilirsiniz! • Sohbet bölümünde insanlarla iletişime geçebilirsiniz! • Bildirim eklemek için haritaya tıklayın ve açılan menüden seçiminizi yapın! • Sol üstteki butondan bildirimlerin anlamlarını öğrenebilirsiniz! • Sağ üstteki butondan diğer sayfalara ulaşabilirsiniz!");
});