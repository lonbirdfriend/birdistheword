const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const birdApi = require('../utils/birdApi');
const auth = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(auth.requireAuth);

// Nearby birds page
router.get('/nearby', (req, res) => {
    res.render('birds/nearby', { 
        title: 'Vögel in der Nähe',
        user: req.session.user 
    });
});

// Get nearby birds API endpoint
router.get('/api/nearby', async (req, res) => {
    try {
        const { lat, lng, radius = 25 } = req.query;
        
        if (!lat || !lng) {
            return res.status(400).json({ 
                error: 'Latitude und Longitude sind erforderlich' 
            });
        }

        // Get birds from eBird API
        const observations = await birdApi.getNearbyBirds(lat, lng, radius);
        
        // Check which birds user already has
        const userBirds = await db.all(
            `SELECT b.scientific_name 
             FROM user_birds ub 
             JOIN birds b ON ub.bird_id = b.id 
             WHERE ub.user_id = ?`,
            [req.session.user.id]
        );
        
        const userBirdNames = new Set(userBirds.map(b => b.scientific_name));
        
        // Mark birds as already collected
        const birdsWithStatus = observations.map(bird => ({
            ...bird,
            isCollected: userBirdNames.has(bird.sciName)
        }));

        res.json({
            success: true,
            birds: birdsWithStatus,
            total: birdsWithStatus.length
        });

    } catch (error) {
        console.error('Error fetching nearby birds:', error);
        res.status(500).json({ 
            error: 'Fehler beim Laden der Vögel in der Nähe' 
        });
    }
});

// Add bird to user collection
router.post('/add', async (req, res) => {
    try {
        const { scientificName, englishName, germanName, imageUrls, soundUrls, speciesCode } = req.body;
        
        if (!scientificName) {
            return res.status(400).json({ 
                error: 'Wissenschaftlicher Name ist erforderlich' 
            });
        }

        // Check if bird exists in database
        let bird = await db.get(
            'SELECT * FROM birds WHERE scientific_name = ?',
            [scientificName]
        );

        // If bird doesn't exist, create it
        if (!bird) {
            const result = await db.run(
                `INSERT INTO birds (scientific_name, german_name, english_name, image_urls, sound_urls, species_code)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    scientificName,
                    germanName,
                    englishName,
                    JSON.stringify(imageUrls || []),
                    JSON.stringify(soundUrls || []),
                    speciesCode
                ]
            );
            
            bird = {
                id: result.id,
                scientific_name: scientificName,
                german_name: germanName,
                english_name: englishName
            };
        }

        // Check if user already has this bird
        const existingUserBird = await db.get(
            'SELECT * FROM user_birds WHERE user_id = ? AND bird_id = ?',
            [req.session.user.id, bird.id]
        );

        if (existingUserBird) {
            return res.status(400).json({ 
                error: 'Dieser Vogel ist bereits in Ihrer Sammlung' 
            });
        }

        // Add bird to user's collection
        await db.run(
            'INSERT INTO user_birds (user_id, bird_id) VALUES (?, ?)',
            [req.session.user.id, bird.id]
        );

        res.json({
            success: true,
            message: `${germanName || englishName || scientificName} wurde zu Ihrer Sammlung hinzugefügt!`
        });

    } catch (error) {
        console.error('Error adding bird:', error);
        res.status(500).json({ 
            error: 'Fehler beim Hinzufügen des Vogels' 
        });
    }
});

// Add single bird page
router.get('/add-single', (req, res) => {
    res.render('birds/add-single', { 
        title: 'Einzelnen Vogel hinzufügen',
        user: req.session.user 
    });
});

// Search bird by scientific name
router.get('/api/search', async (req, res) => {
    try {
        const { scientificName } = req.query;
        
        if (!scientificName) {
            return res.status(400).json({ 
                error: 'Wissenschaftlicher Name ist erforderlich' 
            });
        }

        // Search for bird data
        const birdData = await birdApi.searchBirdByName(scientificName);
        
        if (!birdData) {
            return res.status(404).json({ 
                error: 'Vogel nicht gefunden' 
            });
        }

        // Check if user already has this bird
        const existingBird = await db.get(
            `SELECT ub.id 
             FROM user_birds ub 
             JOIN birds b ON ub.bird_id = b.id 
             WHERE ub.user_id = ? AND b.scientific_name = ?`,
            [req.session.user.id, scientificName]
        );

        res.json({
            success: true,
            bird: {
                ...birdData,
                isCollected: !!existingBird
            }
        });

    } catch (error) {
        console.error('Error searching bird:', error);
        res.status(500).json({ 
            error: 'Fehler bei der Suche' 
        });
    }
});

// Predefined lists page
router.get('/lists', async (req, res) => {
    try {
        const lists = await db.all('SELECT * FROM bird_lists ORDER BY name');
        
        res.render('birds/lists', { 
            title: 'Vogellisten',
            user: req.session.user,
            lists 
        });
    } catch (error) {
        console.error('Error loading bird lists:', error);
        res.render('birds/lists', { 
            title: 'Vogellisten',
            user: req.session.user,
            lists: [],
            error: 'Fehler beim Laden der Listen'
        });
    }
});

// Get user's bird collection
router.get('/api/my-birds', async (req, res) => {
    try {
        const birds = await db.all(
            `SELECT b.*, ub.level, ub.correct_count, ub.wrong_count, ub.last_practiced, ub.added_at
             FROM user_birds ub 
             JOIN birds b ON ub.bird_id = b.id 
             WHERE ub.user_id = ?
             ORDER BY ub.added_at DESC`,
            [req.session.user.id]
        );

        // Parse JSON fields
        const birdsWithParsedData = birds.map(bird => ({
            ...bird,
            image_urls: JSON.parse(bird.image_urls || '[]'),
            sound_urls: JSON.parse(bird.sound_urls || '[]')
        }));

        res.json({
            success: true,
            birds: birdsWithParsedData,
            total: birds.length
        });

    } catch (error) {
        console.error('Error fetching user birds:', error);
        res.status(500).json({ 
            error: 'Fehler beim Laden der Vogelsammlung' 
        });
    }
});

// Remove bird from collection
router.delete('/remove/:birdId', async (req, res) => {
    try {
        const { birdId } = req.params;
        
        const result = await db.run(
            'DELETE FROM user_birds WHERE user_id = ? AND bird_id = ?',
            [req.session.user.id, birdId]
        );

        if (result.changes === 0) {
            return res.status(404).json({ 
                error: 'Vogel nicht in Ihrer Sammlung gefunden' 
            });
        }

        res.json({
            success: true,
            message: 'Vogel aus Sammlung entfernt'
        });

    } catch (error) {
        console.error('Error removing bird:', error);
        res.status(500).json({ 
            error: 'Fehler beim Entfernen des Vogels' 
        });
    }
});

// Get bird statistics
router.get('/api/stats', async (req, res) => {
    try {
        const userId = req.session.user.id;

        // Total birds
        const totalResult = await db.get(
            'SELECT COUNT(*) as count FROM user_birds WHERE user_id = ?',
            [userId]
        );

        // Mastered birds (level 5)
        const masteredResult = await db.get(
            'SELECT COUNT(*) as count FROM user_birds WHERE user_id = ? AND level = 5',
            [userId]
        );

        // Accuracy rate
        const accuracyResult = await db.get(
            `SELECT 
                SUM(correct_count) as total_correct,
                SUM(correct_count + wrong_count) as total_attempts
             FROM user_birds 
             WHERE user_id = ? AND (correct_count + wrong_count) > 0`,
            [userId]
        );

        const accuracy = accuracyResult.total_attempts > 0 
            ? Math.round((accuracyResult.total_correct / accuracyResult.total_attempts) * 100)
            : 0;

        // Learning streak (days with practice)
        const streakResult = await db.get(
            `SELECT COUNT(DISTINCT DATE(created_at)) as streak
             FROM learning_sessions 
             WHERE user_id = ? 
             AND created_at >= date('now', '-30 days')`,
            [userId]
        );

        res.json({
            success: true,
            stats: {
                totalBirds: totalResult.count,
                masteredBirds: masteredResult.count,
                accuracy: accuracy,
                streak: streakResult.streak || 0
            }
        });

    } catch (error) {
        console.error('Error fetching bird stats:', error);
        res.status(500).json({ 
            error: 'Fehler beim Laden der Statistiken' 
        });
    }
});

module.exports = router;