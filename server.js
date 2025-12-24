require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const MONGO_URI = process.env.MONGO_URI; 
const TOKEN = process.env.BETS_API_TOKEN;
const BETS_API_URL = "https://api.b365api.com/v1";

mongoose.connect(MONGO_URI).then(() => console.log("✅ GL99 Production DB Connected"));

const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    history: { type: Array, default: [] } 
}));

function toMalay(decimal) {
    if (!decimal || decimal === 1 || decimal === "-") return "-"; 
    const d = parseFloat(decimal);
    return d <= 2.0 ? (d - 1).toFixed(2) : (-1 / (d - 1)).toFixed(2);
}

// server.js ၏ /odds route ကို အောက်ပါအတိုင်း အဆင့်မြှင့်ပါ
app.get('/odds', async (req, res) => {
    try {
        // ၁။ Upcoming နှင့် In-Play API နှစ်ခုလုံးကို တစ်ပြိုင်နက် ခေါ်ယူခြင်း
        const [upcomingRes, inplayRes] = await Promise.all([
            axios.get(`${BETS_API_URL}/bet365/upcoming`, { params: { token: TOKEN, sport_id: 1 } }),
            axios.get(`${BETS_API_URL}/bet365/inplay`, { params: { token: TOKEN, sport_id: 1 } })
        ]);

        const upcomingMatches = upcomingRes.data.results || [];
        const inplayMatches = inplayRes.data.results || [];
        
        // အားလုံးကို ပေါင်းလိုက်ခြင်း
        const allRawMatches = [...inplayMatches, ...upcomingMatches];

        // Esoccer ဖယ်ထုတ်ခြင်း
        const filtered = allRawMatches.filter(m => !m.league.name.toLowerCase().includes("esoccer"));

        const processed = filtered.map(m => {
            // Live ပွဲစဉ်ဟုတ်မဟုတ် စစ်ဆေးခြင်း
            const isLive = m.timer ? true : false; 
            
            return {
                id: m.id,
                league: m.league.name,
                home: m.home.name,
                away: m.away.name,
                time: new Date(m.time * 1000).toISOString(),
                isLive: isLive,
                score: m.ss || "0-0", // Live ရမှတ်
                timer: m.timer?.tm || "0", // မိနစ်
                fullTime: {
                    hdp: { label: m.main?.sp?.handicap || "0", h: toMalay(m.main?.sp?.h_odds), a: toMalay(m.main?.sp?.a_odds) },
                    ou: { label: m.main?.sp?.total || "0", o: toMalay(m.main?.sp?.o_odds), u: toMalay(m.main?.sp?.u_odds) },
                    xx: { h: m.main?.sp?.h2h_home || "2.00", a: m.main?.sp?.h2h_away || "2.00", d: m.main?.sp?.h2h_draw || "3.00" }
                },
                firstHalf: {
                    hdp: { label: m.main?.sp?.h1_handicap || "0", h: toMalay(m.main?.sp?.h1_h_odds), a: toMalay(m.main?.sp?.h1_a_odds) },
                    ou: { label: m.main?.sp?.h1_total || "0", o: toMalay(m.main?.sp?.h1_o_odds), u: toMalay(m.main?.sp?.h1_u_odds) }
                }
            };
        });
        res.json(processed);
    } catch (e) { 
    console.error("Odds API Error:", e.message);
    res.status(200).json([]); // 500 အစား Empty Array (200) ကို ပြန်ပို့ပေးပါ
}
});

// Auth & User routes များ ယခင်အတိုင်း ထည့်ထားပါ
app.post('/auth/login', async (req, res) => { /*...*/ });
app.post('/auth/register', async (req, res) => { /*...*/ });
app.post('/user/sync', async (req, res) => { /*...*/ });
app.post('/user/bet', async (req, res) => { /*...*/ });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 GL99 Live on Port ${PORT}`));