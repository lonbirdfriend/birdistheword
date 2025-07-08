const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
    secret: 'bird-learning-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Make user available in all templates
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

// Routes
const authRoutes = require('./routes/auth');
const birdRoutes = require('./routes/birds');
const learningRoutes = require('./routes/learning');

app.use('/auth', authRoutes);
app.use('/birds', birdRoutes);
app.use('/learning', learningRoutes);

// Home route
app.get('/', (req, res) => {
    if (req.session.user) {
        res.redirect('/dashboard');
    } else {
        res.redirect('/auth/login');
    }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    res.render('dashboard', { 
        title: 'Dashboard',
        user: req.session.user 
    });
});

// Initialize database and start server
db.init().then(() => {
    app.listen(PORT, () => {
        console.log(`🐦 Bird Learning App running on http://localhost:${PORT}`);
        console.log(`📚 Features: Login, Bird Collection, Memory Games, Name Learning`);
        console.log(`🔥 Development mode: Use 'npm run dev' for auto-restart`);
    });
}).catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});