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

// --- CONFIG ---
const MONGO_URI = process.env.MONGO_URI 
const TOKEN = process.env.BETS_API_TOKEN; // .env ထဲရှိ Token ကို အသုံးပြုသည်
const BETS_API_URL = "https://api.b365api.com/v1";

mongoose.connect(MONGO_URI).then(() => console.log("✅ GL99 Production DB Connected"));

// USER SCHEMA
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    history: { type: Array, default: [] } 
});
const User = mongoose.model('User', userSchema);

// ODDS HELPERS (Malay Odds Conversion)
function toMalay(decimal) {
    if (!decimal || decimal === 1 || decimal === "-") return "-"; 
    const d = parseFloat(decimal);
    // Standard Malay Odds Formula
    return d <= 2.0 ? (d - 1).toFixed(2) : (-1 / (d - 1)).toFixed(2);
}

// FETCH ODDS FROM BETSAPI
app.get('/odds', async (req, res) => {
    try {
        const response = await axios.get(`${BETS_API_URL}/bet365/upcoming`, {
            params: { token: TOKEN, sport_id: 1 } // Soccer အားကစားအတွက်
        });

        const rawMatches = response.data.results || [];
        
        const processed = rawMatches.map(m => ({
            id: m.id,
            league: m.league.name,
            time: new Date(m.time * 1000).toISOString(),
            home: m.home.name,
            away: m.away.name,
            lines: [{
                hdp: { 
                    label: m.main?.sp?.handicap || "0", 
                    h: toMalay(m.main?.sp?.h_odds), 
                    a: toMalay(m.main?.sp?.a_odds) 
                },
                ou: { 
                    label: m.main?.sp?.total || "0", 
                    o: toMalay(m.main?.sp?.o_odds), 
                    u: toMalay(m.main?.sp?.u_odds) 
                },
                xx: { 
                    h: m.main?.sp?.h2h_home || "2.00", 
                    a: m.main?.sp?.h2h_away || "2.00", 
                    d: m.main?.sp?.h2h_draw || "3.00" 
                }
            }]
        }));

        res.json(processed);
    } catch (e) {
        console.error("API Error:", e.message);
        res.status(500).json([]);
    }
});

// --- AUTH & OTHER ROUTES (တူညီသောကြောင့် ချန်လှပ်ထားပါသည်) ---
// (ယခင်ပေးထားသော Login, Register, sync, bet, admin routes များကို ဤနေရာတွင် ဆက်လက်ထည့်သွင်းပါ)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server Running on Port ${PORT}`));