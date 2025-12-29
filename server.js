const express = require('express');
const axios = require('axios');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// --- CONFIGURATION ---
const MONGO_URI = "mongodb+srv://kozed:Bwargyi69@cluster0.s5oybom.mongodb.net/gl99_db?appName=Cluster0";

// 🔴 CRITICAL: Use your API-FOOTBALL Key here (NOT The Odds API key)
const API_KEY = "e4e047268ea3da99a883e473608b3fa5"; 

// League IDs: EPL(39), LaLiga(140), SerieA(135), Bundesliga(78), Ligue1(61), UCL(2)
const TARGET_LEAGUES = [39, 140, 135, 78, 61, 2, 10, 188]; 

mongoose.connect(MONGO_URI).then(() => console.log("✅ GL99 DB Connected"));

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: { type: String },
    balance: { type: Number, default: 0 },
    history: { type: Array, default: [] } 
});
const User = mongoose.model('User', userSchema);

// --- CACHING (Saves Quota) ---
let memoryCache = { data: [], lastFetch: 0 };

app.get('/odds', async (req, res) => {
    // 1. Serve Cache if less than 10 mins old
    if (Date.now() - memoryCache.lastFetch < 600000 && memoryCache.data.length > 0) {
        console.log("⚡ Serving from Cache");
        return res.json(memoryCache.data);
    }

    try {
        console.log("🌍 Fetching FRESH Data from API-Football...");
        
        // 🔴 FORCE SEASON 2024 
        // Even if your PC is in 2025, the API has data for 2024 (Real Time).
        const season = new Date().getFullYear();

        
        const requests = TARGET_LEAGUES.map(id => 
            axios.get('https://v3.football.api-sports.io/odds', {
                headers: { 'x-apisports-key': API_KEY },
                params: { 
                    league: id, 
                    season: season, 
                    bookmaker: 1 // Bet365
                } 
            }).catch(e => {
                console.error(`Error fetching league ${id}:`, e.message);
                return { data: { response: [] } };
            })
        );

        const results = await Promise.all(requests);
        let allMatches = [];

        results.forEach(res => {
            if (res.data && res.data.response) {
                allMatches = allMatches.concat(res.data.response);
            }
        });

        console.log(`✅ Total Matches Fetched: ${allMatches.length}`);

        let processed = allMatches.map(m => {
            const fixture = m.fixture;
            const bookie = m.bookmakers[0];
            const getOdd = (name) => bookie.bets.find(x => x.name === name);
            
            let hdp = getOdd('Asian Handicap');
            let ou = getOdd('Goals Over/Under');
            let xx = getOdd('Match Winner');

            // 1st Half Markets
            let fh_hdp = getOdd('Asian Handicap First Half');
            let fh_ou = getOdd('Goals Over/Under First Half');
            let fh_xx = getOdd('Match Winner First Half');

            return {
                id: fixture.id,
                league: m.league.name,
                time: fixture.date,
                home: m.teams.home.name,
                away: m.teams.away.name,
                fulltime: {
                    hdp: hdp ? { label: hdp.values[0].value, h: hdp.values[0].odd, a: hdp.values[1].odd } : null,
                    ou: ou ? { label: ou.values[0].value, o: ou.values[0].odd, u: ou.values[1].odd } : null,
                    xx: xx ? { h: xx.values[0].odd, d: xx.values[1].odd, a: xx.values[2].odd } : null
                },
                firsthalf: {
                    hdp: fh_hdp ? { label: fh_hdp.values[0].value, h: fh_hdp.values[0].odd, a: fh_hdp.values[1].odd } : null,
                    ou: fh_ou ? { label: fh_ou.values[0].value, o: fh_ou.values[0].odd, u: fh_ou.values[1].odd } : null,
                    xx: fh_xx ? { h: fh_xx.values[0].odd, d: fh_xx.values[1].odd, a: fh_xx.values[2].odd } : null
                }
            };
        });

        // 🔴 NO DATE FILTER: Show ALL matches the API returns
        // We only sort them so the latest ones are at the bottom or top as you prefer
        processed.sort((a,b) => new Date(a.time) - new Date(b.time));

        memoryCache = { data: processed, lastFetch: Date.now() };
        res.json(processed);

    } catch (e) {
        console.error("🔥 Global API Error:", e.message);
        res.json([]);
    }
});

// AUTH & USER ROUTES
app.post('/auth/login', async (req, res) => { const { username, password } = req.body; const user = await User.findOne({ username }); if (!user || password !== user.password) return res.status(400).json({ error: "Invalid" }); res.json({ success: true, user }); });
app.post('/user/sync', async (req, res) => { const user = await User.findOne({ username: req.body.username }); res.json(user || {}); });
app.post('/user/bet', async (req, res) => { const { username, stake, ticket } = req.body; const user = await User.findOne({ username }); if(user.balance < stake) return res.status(400).json({ error: "Low Balance" }); user.balance -= stake; user.history.unshift(ticket); await user.save(); res.json({ success: true }); });

// ADMIN ROUTES
app.get('/admin/users', async (req, res) => { const users = await User.find({}); res.json(users); });
app.post('/admin/balance', async (req, res) => { const { username, amount, type } = req.body; const user = await User.findOne({ username }); if(type === 'add') user.balance += amount; else user.balance -= amount; await user.save(); res.json({ success: true }); });
app.post('/admin/settle', async (req, res) => { const { username, betIndex, result } = req.body; const user = await User.findOne({ username }); let bet = user.history[betIndex]; if(!bet) return res.json({error: "Bet not found"}); bet.status = result; if(result === 'Win') { let winAmount = parseInt(bet.win.replace(/[^0-9]/g, '')); if(!isNaN(winAmount)) user.balance += winAmount; } user.markModified('history'); await user.save(); res.json({ success: true }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`GL99 Running on ${PORT}`));