const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();
const mongoose = require('mongoose');
const cron = require('node-cron');
const escapeHtml = require('escape-html');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let userCount = 0;
const PORT = 80;

// MongoDB Bağlantısı
mongoose.connect('mongodb://localhost:27017/protestoHaritasi')
.then(() => console.log('MongoDB Bağlantısı Sağlandı'))
.catch(err => console.log(err));

// Bildirim Modeli
const reportSchema = new mongoose.Schema({
    lat: Number,                                    // Enlem
    lng: Number,                                    // Boylam
    type: String,                                   // Bildirim tipi
    emoji: String,                                  // Emoji
    note: String,                                   // Not
    timestamp: { type: Date, default: Date.now },   // Bildirimin gönderilme tarihi
});


const Report = mongoose.model('Report', reportSchema);

// Mesaj Modeli
const messageSchema = new mongoose.Schema({
    message: String,                               // Mesaj içeriği
    timestamp: { type: Date, default: Date.now },  // Mesajın gönderilme tarihi
});

const Message = mongoose.model('Message', messageSchema);

// Marka şeması
const brandSchema = new mongoose.Schema({
    name: String,       // Marka adı
    logo: String,       // Logo URL'si
    status: Number,     // Boykot durumu (0: Belirsiz, 1: Boykot var)
});

// Modeli oluştur
const Brand = mongoose.model('Brand', brandSchema);

// Statik Dosyalar
app.use(express.static('public'));
app.use('/img', express.static('assets/img'));
app.use('/css', express.static('assets/css'));
app.use('/js', express.static('assets/js'));

// Harita Sayfası
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Boykot Sayfası
app.get('/boykot', (req, res) => {
    res.sendFile(__dirname + '/public/boykot.html');
});

// Veritabanındaki kayıt sayısını almak için route
app.get('/getStatics', async (req, res) => {
    try {
        // Report ve Message koleksiyonlarındaki döküman sayısı
        const reportCount = await Report.countDocuments();
        const messageCount = await Message.countDocuments();

        // Aktif kullanıcı sayısı ve MongoDB kayıt sayılarıyla birlikte döndürme
        res.json({
            userCount, // Socket.io ile bağlı aktif kullanıcı sayısı
            reportCount,
            messageCount
        });
    } catch (error) {
        console.error('Error fetching counts:', error);
        res.status(500).json({ error: 'Failed to fetch counts' });
    }
});

// Marka verilerini alan endpoint
app.get('/api/brands', async (req, res) => {
    try {
        const brands = await Brand.find();  // Veritabanındaki tüm markaları al
        res.json(brands);  // JSON olarak döndür
    } catch (err) {
        res.status(500).json({ message: 'Sunucu hatası' });
    }
});

// Marka sayısını döndüren endpoint
app.get('/api/brands/count', async (req, res) => {
    try {
        const count = await Brand.countDocuments();
        res.json({ count });
    } catch (err) {
        res.status(500).json({ error: 'Marka sayısı alınamadı' });
    }
});

// Socket.io Bağlantısı
io.on('connection', (socket) => {
    const userAgent = socket.handshake.headers['user-agent'];
    const botKeywords = ['bot', 'crawl', 'spider', 'slurp', 'mediapartners'];
    const isBot = botKeywords.some(keyword => userAgent.toLowerCase().includes(keyword));

    if (!isBot) {
        userCount++;
        io.emit('updateUserCount', userCount);

        socket.on('disconnect', () => {
            userCount--;
            io.emit('updateUserCount', userCount);
        });
    }

    // Yeni bildirim gönderildiğinde
    socket.on('sendReport', async (data) => {
        const { lat, lng, type, emoji, note } = data;
    
        // Eğer timestamp verilmemişse, şu anki zamanı atıyoruz
        const timestamp = data.timestamp || new Date();
    
        const newReport = new Report({
            lat,
            lng,
            type,
            emoji,
            note,
            timestamp,
        });
    
        await newReport.save();
    
        io.emit('receiveReport', {
            lat,
            lng,
            emoji,
            note,
            timestamp,
        });
    });

    // Haritadaki tüm bildirimleri yükle
    socket.on('getReports', async () => {
        const reports = await Report.find();
        socket.emit('loadReports', reports);
    });

    // Spam koruması için değişkenler
    const rateLimitMap = new Map();
    const floodMap = new Map();
    const badWords = ["porno", "amk", "aq", "orospu", "orospu çocuğu", "orospu cocugu", "orospucocu"];

    function containsBadWords(message) {
        return badWords.some(word => message.toLowerCase().includes(word));
    }

    // Mesajları veritabanına kaydetme
    socket.on('sendMessage', async (messageData) => {
        const userId = socket.id;
        const now = Date.now();

        // Rate Limiting Kontrolü
        if (rateLimitMap.has(userId) && now - rateLimitMap.get(userId) < 3000) {
            socket.emit('alertMessage', 'Çok hızlı mesaj gönderiyorsunuz. Lütfen biraz bekleyin.');
            return;
        }

        rateLimitMap.set(userId, now);

        // Flood Detection Kontrolü
        const userMessages = floodMap.get(userId) || [];
        const recentMessages = userMessages.filter(timestamp => now - timestamp < 10000);
        recentMessages.push(now);

        if (recentMessages.length > 5) {
            socket.emit('alertMessage', 'Çok fazla mesaj gönderiyorsunuz. Lütfen yavaşlayın.');
            return;
        }

        floodMap.set(userId, recentMessages);

        // Kötü Kelime Filtresi
        if (containsBadWords(messageData.message)) {
            socket.emit('alertMessage', 'Mesajınız uygunsuz içerik içeriyor.');
            return;
        }

        // Mesaj Boyutu Kontrolü
        const MAX_MESSAGE_LENGTH = 1000;
        if (messageData.message.length > MAX_MESSAGE_LENGTH) {
            socket.emit('alertMessage', 'Mesaj çok uzun! Lütfen daha kısa bir mesaj gönderin.');
            return;
        }

        // Base64 Şifreli Mesajları Engelleme Fonksiyonu
        function isBase64(str) {
            try {
                return btoa(atob(str)) === str;
            } catch (err) {
                return false;
            }
        }

        // Base64 Şifreli Mesajları Engelleme
        if (isBase64(messageData.message)) {
            socket.emit('alertMessage', 'Base64 şifreli mesajlar engelleniyor!');
            return;
        }

        // XSS koruması için mesajı temizleme
        const safeMessage = escapeHtml(messageData.message);

        const newMessage = new Message({
            message: safeMessage,
            timestamp: new Date(),
        });

        try {
            await newMessage.save();
            io.emit('receiveMessage', newMessage);
        } catch (error) {
            console.error('Mesaj kaydedilemedi:', error);
        }
    });

    // Tüm mesajları yükleme
    socket.on('loadMessages', async () => {
        try {
            const messages = await Message.find().sort({ timestamp: 1 });  // Mesajları tarihe göre sırala
            socket.emit('allMessages', messages);  // Mesajları gönder
        } catch (error) {
            console.error('Mesajlar yüklenemedi:', error);
        }
    });
});

// Her gün sabah saat 8'de yer imlerini sil
cron.schedule('0 8 * * *', async () => {
    try {
        await Report.deleteMany({});
        await Message.deleteMany({});
        console.log('Yer imleri temizlendi!');
    } catch (err) {
        console.error('Veritabanı temizlenirken hata oluştu:', err);
    }
});

server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
