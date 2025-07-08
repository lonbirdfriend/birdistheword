const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');

const router = express.Router();

// Login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('login', { 
        title: 'Anmelden',
        error: null 
    });
});

// Register page
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/dashboard');
    }
    res.render('register', { 
        title: 'Registrieren',
        error: null 
    });
});

// Login POST
router.post('/login', [
    body('username').notEmpty().withMessage('Benutzername ist erforderlich'),
    body('password').notEmpty().withMessage('Passwort ist erforderlich')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('login', {
                title: 'Anmelden',
                error: 'Bitte füllen Sie alle Felder aus'
            });
        }

        const { username, password } = req.body;

        // Find user
        const user = await db.get(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [username, username]
        );

        if (!user) {
            return res.render('login', {
                title: 'Anmelden',
                error: 'Benutzername oder Passwort falsch'
            });
        }

        // Check password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            return res.render('login', {
                title: 'Anmelden',
                error: 'Benutzername oder Passwort falsch'
            });
        }

        // Set session
        req.session.user = {
            id: user.id,
            username: user.username,
            email: user.email
        };

        res.redirect('/dashboard');

    } catch (error) {
        console.error('Login error:', error);
        res.render('login', {
            title: 'Anmelden',
            error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'
        });
    }
});

// Register POST
router.post('/register', [
    body('username')
        .isLength({ min: 3 })
        .withMessage('Benutzername muss mindestens 3 Zeichen lang sein')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Benutzername darf nur Buchstaben, Zahlen und Unterstriche enthalten'),
    body('email').isEmail().withMessage('Gültige E-Mail-Adresse erforderlich'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Passwort muss mindestens 6 Zeichen lang sein'),
    body('confirmPassword').custom((value, { req }) => {
        if (value !== req.body.password) {
            throw new Error('Passwörter stimmen nicht überein');
        }
        return true;
    })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.render('register', {
                title: 'Registrieren',
                error: errors.array()[0].msg
            });
        }

        const { username, email, password } = req.body;

        // Check if user already exists
        const existingUser = await db.get(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );

        if (existingUser) {
            return res.render('register', {
                title: 'Registrieren',
                error: 'Benutzername oder E-Mail bereits vergeben'
            });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Create user
        const result = await db.run(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, passwordHash]
        );

        // Set session
        req.session.user = {
            id: result.id,
            username,
            email
        };

        res.redirect('/dashboard');

    } catch (error) {
        console.error('Registration error:', error);
        res.render('register', {
            title: 'Registrieren',
            error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.'
        });
    }
});

// Logout
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/auth/login');
    });
});

module.exports = router;