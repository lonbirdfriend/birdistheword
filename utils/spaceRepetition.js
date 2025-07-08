// Spaced Repetition System for Bird Learning

const db = require('../config/database');

/**
 * Select birds for learning based on spaced repetition algorithm
 * Prioritizes birds with lower levels and those not practiced recently
 * @param {number} userId - User ID
 * @param {number} count - Number of birds to select
 * @returns {Array} - Selected birds for learning
 */
async function selectBirdsForLearning(userId, count = 5) {
    try {
        // Get birds with weighted selection based on level and last practice time
        const birds = await db.all(
            `SELECT b.*, ub.level, ub.correct_count, ub.wrong_count, ub.last_practiced,
                    ub.added_at,
                    -- Calculate priority score (lower is higher priority)
                    CASE 
                        WHEN ub.last_practiced IS NULL THEN 0  -- Never practiced = highest priority
                        WHEN ub.level = 1 THEN 1              -- Level 1 = very high priority
                        WHEN ub.level = 2 THEN 2              -- Level 2 = high priority
                        WHEN ub.level = 3 THEN 4              -- Level 3 = medium priority
                        WHEN ub.level = 4 THEN 8              -- Level 4 = low priority
                        WHEN ub.level = 5 THEN 16             -- Level 5 = very low priority
                        ELSE 10
                    END +
                    -- Add time-based factor (older practice = higher priority)
                    CASE 
                        WHEN ub.last_practiced IS NULL THEN 0
                        WHEN datetime(ub.last_practiced) < datetime('now', '-7 days') THEN 0
                        WHEN datetime(ub.last_practiced) < datetime('now', '-3 days') THEN 2
                        WHEN datetime(ub.last_practiced) < datetime('now', '-1 day') THEN 4
                        ELSE 8
                    END as priority_score
             FROM user_birds ub 
             JOIN birds b ON ub.bird_id = b.id 
             WHERE ub.user_id = ?
             ORDER BY priority_score ASC, RANDOM()
             LIMIT ?`,
            [userId, count]
        );

        return birds;

    } catch (error) {
        console.error('Error selecting birds for learning:', error);
        throw error;
    }
}

/**
 * Update bird level based on learning performance
 * @param {number} userId - User ID
 * @param {number} birdId - Bird ID
 * @param {boolean} correct - Whether the answer was correct
 * @returns {Object} - Updated bird data
 */
async function updateBirdLevel(userId, birdId, correct) {
    try {
        // Get current bird data
        const currentBird = await db.get(
            'SELECT * FROM user_birds WHERE user_id = ? AND bird_id = ?',
            [userId, birdId]
        );

        if (!currentBird) {
            throw new Error('Bird not found in user collection');
        }

        let newLevel = currentBird.level;
        let newCorrectCount = currentBird.correct_count;
        let newWrongCount = currentBird.wrong_count;

        if (correct) {
            newCorrectCount += 1;
            
            // Level up logic
            if (newLevel < 5) {
                // Calculate required correct answers for next level
                const requiredCorrect = getRequiredCorrectAnswers(newLevel);
                const consecutiveCorrect = await getConsecutiveCorrectAnswers(userId, birdId);
                
                if (consecutiveCorrect >= requiredCorrect) {
                    newLevel += 1;
                }
            }
        } else {
            newWrongCount += 1;
            
            // Level down logic - reset to level 1 on wrong answer
            newLevel = 1;
        }

        // Update the database
        await db.run(
            `UPDATE user_birds 
             SET level = ?, correct_count = ?, wrong_count = ?, last_practiced = CURRENT_TIMESTAMP
             WHERE user_id = ? AND bird_id = ?`,
            [newLevel, newCorrectCount, newWrongCount, userId, birdId]
        );

        return {
            previousLevel: currentBird.level,
            newLevel: newLevel,
            levelChanged: newLevel !== currentBird.level,
            correctCount: newCorrectCount,
            wrongCount: newWrongCount
        };

    } catch (error) {
        console.error('Error updating bird level:', error);
        throw error;
    }
}

/**
 * Get required number of consecutive correct answers for level up
 * @param {number} currentLevel - Current level (1-5)
 * @returns {number} - Required consecutive correct answers
 */
function getRequiredCorrectAnswers(currentLevel) {
    const requirements = {
        1: 2,  // Level 1 -> 2: need 2 consecutive correct
        2: 3,  // Level 2 -> 3: need 3 consecutive correct
        3: 4,  // Level 3 -> 4: need 4 consecutive correct
        4: 5   // Level 4 -> 5: need 5 consecutive correct
    };
    
    return requirements[currentLevel] || 5;
}

/**
 * Get number of consecutive correct answers for a bird
 * @param {number} userId - User ID
 * @param {number} birdId - Bird ID
 * @returns {number} - Number of consecutive correct answers
 */
async function getConsecutiveCorrectAnswers(userId, birdId) {
    try {
        // Get recent learning sessions for this bird
        const sessions = await db.all(
            `SELECT correct FROM learning_sessions 
             WHERE user_id = ? AND bird_id = ? 
             ORDER BY created_at DESC 
             LIMIT 10`,
            [userId, birdId]
        );

        let consecutiveCorrect = 0;
        
        // Count consecutive correct answers from most recent
        for (const session of sessions) {
            if (session.correct) {
                consecutiveCorrect++;
            } else {
                break; // Stop at first wrong answer
            }
        }

        return consecutiveCorrect;

    } catch (error) {
        console.error('Error getting consecutive correct answers:', error);
        return 0;
    }
}

/**
 * Calculate when a bird should be reviewed next (for future implementation)
 * @param {number} level - Current level (1-5)
 * @param {Date} lastPracticed - Last practice date
 * @returns {Date} - Next review date
 */
function calculateNextReview(level, lastPracticed) {
    const intervals = {
        1: 1,    // 1 day
        2: 3,    // 3 days
        3: 7,    // 1 week
        4: 14,   // 2 weeks
        5: 30    // 1 month
    };

    const intervalDays = intervals[level] || 1;
    const nextReview = new Date(lastPracticed);
    nextReview.setDate(nextReview.getDate() + intervalDays);
    
    return nextReview;
}

/**
 * Get birds that are due for review
 * @param {number} userId - User ID
 * @returns {Array} - Birds due for review
 */
async function getBirdsDueForReview(userId) {
    try {
        const birds = await db.all(
            `SELECT b.*, ub.level, ub.last_practiced
             FROM user_birds ub 
             JOIN birds b ON ub.bird_id = b.id 
             WHERE ub.user_id = ? 
             AND (
                 ub.last_practiced IS NULL OR
                 (ub.level = 1 AND datetime(ub.last_practiced) < datetime('now', '-1 day')) OR
                 (ub.level = 2 AND datetime(ub.last_practiced) < datetime('now', '-3 days')) OR
                 (ub.level = 3 AND datetime(ub.last_practiced) < datetime('now', '-7 days')) OR
                 (ub.level = 4 AND datetime(ub.last_practiced) < datetime('now', '-14 days')) OR
                 (ub.level = 5 AND datetime(ub.last_practiced) < datetime('now', '-30 days'))
             )
             ORDER BY ub.level ASC, ub.last_practiced ASC NULLS FIRST`,
            [userId]
        );

        return birds;

    } catch (error) {
        console.error('Error getting birds due for review:', error);
        throw error;
    }
}

/**
 * Get learning statistics for a user
 * @param {number} userId - User ID
 * @returns {Object} - Learning statistics
 */
async function getLearningStats(userId) {
    try {
        // Birds by level
        const levelDistribution = await db.all(
            `SELECT level, COUNT(*) as count 
             FROM user_birds 
             WHERE user_id = ? 
             GROUP BY level 
             ORDER BY level`,
            [userId]
        );

        // Total practice sessions
        const totalSessions = await db.get(
            'SELECT COUNT(*) as count FROM learning_sessions WHERE user_id = ?',
            [userId]
        );

        // Accuracy over time
        const recentAccuracy = await db.get(
            `SELECT 
                COUNT(CASE WHEN correct = 1 THEN 1 END) as correct,
                COUNT(*) as total
             FROM learning_sessions 
             WHERE user_id = ? AND created_at > datetime('now', '-7 days')`,
            [userId]
        );

        // Learning streak
        const learningStreak = await calculateLearningStreak(userId);

        return {
            levelDistribution: levelDistribution,
            totalSessions: totalSessions.count,
            recentAccuracy: recentAccuracy.total > 0 
                ? Math.round((recentAccuracy.correct / recentAccuracy.total) * 100)
                : 0,
            learningStreak: learningStreak
        };

    } catch (error) {
        console.error('Error getting learning stats:', error);
        throw error;
    }
}

/**
 * Calculate learning streak (consecutive days with practice)
 * @param {number} userId - User ID
 * @returns {number} - Learning streak in days
 */
async function calculateLearningStreak(userId) {
    try {
        // Get distinct practice dates in descending order
        const practiceDates = await db.all(
            `SELECT DISTINCT DATE(created_at) as practice_date
             FROM learning_sessions 
             WHERE user_id = ?
             ORDER BY practice_date DESC`,
            [userId]
        );

        if (practiceDates.length === 0) {
            return 0;
        }

        let streak = 0;
        const today = new Date().toISOString().split('T')[0];
        let expectedDate = new Date(today);

        // Check if user practiced today or yesterday
        const latestPractice = practiceDates[0].practice_date;
        const daysDiff = Math.floor((new Date(today) - new Date(latestPractice)) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 1) {
            return 0; // Streak broken
        }

        // Count consecutive days
        for (const dateRow of practiceDates) {
            const practiceDate = dateRow.practice_date;
            const expectedDateStr = expectedDate.toISOString().split('T')[0];
            
            if (practiceDate === expectedDateStr) {
                streak++;
                expectedDate.setDate(expectedDate.getDate() - 1);
            } else {
                break;
            }
        }

        return streak;

    } catch (error) {
        console.error('Error calculating learning streak:', error);
        return 0;
    }
}

/**
 * Reset all bird levels for a user (for testing purposes)
 * @param {number} userId - User ID
 * @returns {boolean} - Success status
 */
async function resetAllBirdLevels(userId) {
    try {
        await db.run(
            `UPDATE user_birds 
             SET level = 1, correct_count = 0, wrong_count = 0, last_practiced = NULL
             WHERE user_id = ?`,
            [userId]
        );

        return true;

    } catch (error) {
        console.error('Error resetting bird levels:', error);
        throw error;
    }
}

module.exports = {
    selectBirdsForLearning,
    updateBirdLevel,
    getRequiredCorrectAnswers,
    getConsecutiveCorrectAnswers,
    calculateNextReview,
    getBirdsDueForReview,
    getLearningStats,
    calculateLearningStreak,
    resetAllBirdLevels
};