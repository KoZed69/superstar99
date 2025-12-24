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

if (!MONGO_URI || !TOKEN) {
    console.error("❌ ERROR: Check Environment Variables (MONGO_URI, BETS_API_TOKEN)");
    process.exit(1); 
}

mongoose.connect(MONGO_URI).then(() => console.log("✅ DB Connected"));

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

app.get('/odds', async (req, res) => {
    try {
        // In-play နှင့် Upcoming နှစ်မျိုးလုံးကို ဆွဲယူခြင်း
        const [inplayRes, upcomingRes] = await Promise.all([
            axios.get(`${BETS_API_URL}/bet365/inplay`, { params: { token: TOKEN, sport_id: 1 } }),
            axios.get(`${BETS_API_URL}/bet365/upcoming`, { params: { token: TOKEN, sport_id: 1 } })
        ]);

        const allRawMatches = [...(inplayRes.data.results || []), ...(upcomingRes.data.results || [])];
        const filtered = allRawMatches.filter(m => !m.league.name.toLowerCase().includes("esoccer"));

        const processed = filtered.map(m => {
            const isLive = !!m.timer;
            const o = m.main?.sp || {}; // BetsAPI main odds source

            return {
                id: m.id,
                league: m.league?.name || "Unknown",
                home: m.home?.name || "Home",
                away: m.away?.name || "Away",
                time: new Date(m.time * 1000).toISOString(),
                isLive: isLive,
                score: m.ss || "0-0",
                timer: m.timer?.tm || "0",
                fullTime: {
                    hdp: { label: o.handicap || "0", h: toMalay(o.h_odds), a: toMalay(o.a_odds) },
                    ou: { label: o.total || "0", o: toMalay(o.o_odds), u: toMalay(o.u_odds) },
                    xx: { h: o.h2h_home || "2.00", a: o.h2h_away || "2.00", d: o.h2h_draw || "3.00" }
                },
                firstHalf: {
                    hdp: { label: o.h1_handicap || "0", h: toMalay(o.h1_h_odds), a: toMalay(o.h1_a_odds) },
                    ou: { label: o.h1_total || "0", o: toMalay(o.h1_o_odds), u: toMalay(o.h1_u_odds) }
                }
            };
        });
        res.json(processed);
    } catch (e) { res.status(200).json([]); }
});

// AUTH & USER ROUTES
app.post('/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: "Invalid Login" });
    res.json({ success: true, user });
});

app.post('/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (await User.findOne({ username })) return res.status(400).json({ error: "User Exists" });
    const user = new User({ username, password: await bcrypt.hash(password, 10), balance: 0 });
    await user.save();
    res.json({ success: true });
});

app.post('/user/sync', async (req, res) => {
    const user = await User.findOne({ username: req.body.username });
    res.json(user || {});
});

app.post('/user/bet', async (req, res) => {
    const { username, stake, ticket } = req.body;
    const user = await User.findOne({ username });
    if(user.balance < stake) return res.status(400).json({ error: "Insufficient Balance" });
    user.balance -= stake;
    user.history.unshift(ticket);
    await user.save();
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 GL99 Real Soccer Live on Port ${PORT}`));