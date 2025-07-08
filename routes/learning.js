const express = require('express');
const db = require('../config/database');
const auth = require('../middleware/auth');
const spaceRepetition = require('../utils/spaceRepetition');
const levenshtein = require('../utils/levenshtein');

const router = express.Router();

// Apply authentication middleware
router.use(auth.requireAuth);

// Learning mode selection
router.get('/', (req, res) => {
    res.render('learning/mode-select', { 
        title: 'Lernmodus wählen',
        user: req.session.user 
    });
});

// Memory game page
router.get('/memory', (req, res) => {
    res.render('learning/memory-game', { 
        title: 'Memory-Spiel',
        user: req.session.user 
    });
});

// Name learning game page
router.get('/names', (req, res) => {
    res.render('learning/name-game', { 
        title: 'Namen lernen',
        user: req.session.user 
    });
});

// Get birds for memory game
router.get('/api/memory/birds', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Get 5 birds for memory game using spaced repetition
        const birds = await spaceRepetition.selectBirdsForLearning(userId, 5);
        
        if (birds.length === 0) {
            return res.status(404).json({ 
                error: 'Keine Vögel in Ihrer Sammlung gefunden. Fügen Sie erst einige Vögel hinzu!' 
            });
        }

        // Parse JSON fields and prepare for memory game
        const memoryBirds = birds.map(bird => ({
            id: bird.id,
            scientificName: bird.scientific_name,
            germanName: bird.german_name,
            englishName: bird.english_name,
            imageUrls: JSON.parse(bird.image_urls || '[]'),
            soundUrls: JSON.parse(bird.sound_urls || '[]'),
            level: bird.level
        }));

        res.json({
            success: true,
            birds: memoryBirds
        });

    } catch (error) {
        console.error('Error fetching memory game birds:', error);
        res.status(500).json({ 
            error: 'Fehler beim Laden der Vögel für das Memory-Spiel' 
        });
    }
});

// Submit memory game results
router.post('/api/memory/submit', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { results } = req.body; // Array of {birdId, correct, responseTime}
        
        if (!Array.isArray(results)) {
            return res.status(400).json({ 
                error: 'Ungültige Ergebnisse' 
            });
        }

        // Process each result
        for (const result of results) {
            const { birdId, correct, responseTime } = result;
            
            // Log learning session
            await db.run(
                `INSERT INTO learning_sessions (user_id, game_type, bird_id, correct, response_time)
                 VALUES (?, ?, ?, ?, ?)`,
                [userId, 'memory', birdId, correct, responseTime]
            );

            // Update spaced repetition data
            await spaceRepetition.updateBirdLevel(userId, birdId, correct);
        }

        // Calculate score
        const correctCount = results.filter(r => r.correct).length;
        const totalCount = results.length;
        const score = Math.round((correctCount / totalCount) * 100);

        res.json({
            success: true,
            score: {
                correct: correctCount,
                total: totalCount,
                percentage: score
            },
            message: `Gut gemacht! ${correctCount} von ${totalCount} richtig (${score}%)`
        });

    } catch (error) {
        console.error('Error submitting memory game results:', error);
        res.status(500).json({ 
            error: 'Fehler beim Speichern der Ergebnisse' 
        });
    }
});

// Get bird for name learning
router.get('/api/names/bird', async (req, res) => {
    try {
        const userId = req.session.user.id;
        
        // Get one bird for name learning
        const birds = await spaceRepetition.selectBirdsForLearning(userId, 1);
        
        if (birds.length === 0) {
            return res.status(404).json({ 
                error: 'Keine Vögel in Ihrer Sammlung gefunden' 
            });
        }

        const bird = birds[0];

        res.json({
            success: true,
            bird: {
                id: bird.id,
                scientificName: bird.scientific_name,
                germanName: bird.german_name,
                englishName: bird.english_name,
                imageUrls: JSON.parse(bird.image_urls || '[]'),
                soundUrls: JSON.parse(bird.sound_urls || '[]'),
                level: bird.level
            }
        });

    } catch (error) {
        console.error('Error fetching name learning bird:', error);
        res.status(500).json({ 
            error: 'Fehler beim Laden des Vogels' 
        });
    }
});

// Check name answer
router.post('/api/names/check', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { birdId, userAnswer, answerType, responseTime } = req.body; // answerType: 'german' or 'latin'
        
        // Get bird data
        const bird = await db.get(
            `SELECT b.*, ub.level 
             FROM birds b 
             JOIN user_birds ub ON b.id = ub.bird_id 
             WHERE b.id = ? AND ub.user_id = ?`,
            [birdId, userId]
        );

        if (!bird) {
            return res.status(404).json({ 
                error: 'Vogel nicht gefunden' 
            });
        }

        // Determine correct answer
        const correctAnswer = answerType === 'german' 
            ? bird.german_name 
            : bird.scientific_name;

        // Check answer using Levenshtein distance for typo tolerance
        const isCorrect = levenshtein.isCloseMatch(userAnswer, correctAnswer, 0.8);

        // Log learning session
        await db.run(
            `INSERT INTO learning_sessions (user_id, game_type, bird_id, correct, response_time)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, 'name', birdId, isCorrect, responseTime]
        );

        // Update spaced repetition data
        await spaceRepetition.updateBirdLevel(userId, birdId, isCorrect);

        res.json({
            success: true,
            correct: isCorrect,
            correctAnswer: correctAnswer,
            userAnswer: userAnswer,
            similarity: levenshtein.similarity(userAnswer, correctAnswer),
            message: isCorrect 
                ? 'Richtig! Gut gemacht!' 
                : `Leider falsch. Die richtige Antwort ist: ${correctAnswer}`
        });

    } catch (error) {
        console.error('Error checking name answer:', error);
        res.status(500).json({ 
            error: 'Fehler beim Prüfen der Antwort' 
        });
    }
});

// Get learning progress
router.get('/api/progress', async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Birds by level
        const levelStats = await db.all(
            `SELECT level, COUNT(*) as count 
             FROM user_birds 
             WHERE user_id = ? 
             GROUP BY level 
             ORDER BY level`,
            [userId]
        );

        // Recent activity
        const recentSessions = await db.all(
            `SELECT ls.*, b.german_name, b.english_name, b.scientific_name
             FROM learning_sessions ls
             JOIN birds b ON ls.bird_id = b.id
             WHERE ls.user_id = ?
             ORDER BY ls.created_at DESC
             LIMIT 10`,
            [userId]
        );

        // Next birds to practice (lowest levels first, then by last practiced)
        const nextBirds = await db.all(
            `SELECT b.*, ub.level, ub.last_practiced
             FROM user_birds ub
             JOIN birds b ON ub.bird_id = b.id
             WHERE ub.user_id = ?
             ORDER BY ub.level ASC, ub.last_practiced ASC NULLS FIRST
             LIMIT 5`,
            [userId]
        );

        res.json({
            success: true,
            progress: {
                levelStats: levelStats,
                recentSessions: recentSessions,
                nextBirds: nextBirds.map(bird => ({
                    ...bird,
                    image_urls: JSON.parse(bird.image_urls || '[]')
                }))
            }
        });

    } catch (error) {
        console.error('Error fetching learning progress:', error);
        res.status(500).json({ 
            error: 'Fehler beim Laden des Lernfortschritts' 
        });
    }
});

// Reset bird level (for testing/admin purposes)
router.post('/api/reset/:birdId', async (req, res) => {
    try {
        const userId = req.session.user.id;
        const { birdId } = req.params;

        await db.run(
            `UPDATE user_birds 
             SET level = 1, correct_count = 0, wrong_count = 0, last_practiced = NULL
             WHERE user_id = ? AND bird_id = ?`,
            [userId, birdId]
        );

        res.json({
            success: true,
            message: 'Vogel-Level zurückgesetzt'
        });

    } catch (error) {
        console.error('Error resetting bird level:', error);
        res.status(500).json({ 
            error: 'Fehler beim Zurücksetzen' 
        });
    }
});

module.exports = router;