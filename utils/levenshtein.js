// Levenshtein Distance Algorithm for typo-tolerant name checking

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Edit distance
 */
function levenshteinDistance(str1, str2) {
    // Convert to lowercase for case-insensitive comparison
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    const m = s1.length;
    const n = s2.length;
    
    // Create a matrix to store distances
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    // Initialize first row and column
    for (let i = 0; i <= m; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= n; j++) {
        dp[0][j] = j;
    }
    
    // Fill the matrix
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (s1[i - 1] === s2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(
                    dp[i - 1][j],     // deletion
                    dp[i][j - 1],     // insertion
                    dp[i - 1][j - 1]  // substitution
                );
            }
        }
    }
    
    return dp[m][n];
}

/**
 * Calculate similarity percentage between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity percentage (0-1)
 */
function similarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 1;
    
    const distance = levenshteinDistance(str1, str2);
    return (maxLen - distance) / maxLen;
}

/**
 * Check if two strings are close matches based on similarity threshold
 * @param {string} userInput - User's input
 * @param {string} correctAnswer - Correct answer
 * @param {number} threshold - Similarity threshold (0-1, default 0.8)
 * @returns {boolean} - True if strings are close enough
 */
function isCloseMatch(userInput, correctAnswer, threshold = 0.8) {
    if (!userInput || !correctAnswer) return false;
    
    // Exact match (case-insensitive)
    if (userInput.toLowerCase().trim() === correctAnswer.toLowerCase().trim()) {
        return true;
    }
    
    // Check similarity
    const sim = similarity(userInput, correctAnswer);
    return sim >= threshold;
}

/**
 * Advanced matching with multiple strategies
 * @param {string} userInput - User's input
 * @param {string} correctAnswer - Correct answer
 * @param {Object} options - Options for matching
 * @returns {Object} - Match result with details
 */
function advancedMatch(userInput, correctAnswer, options = {}) {
    const {
        threshold = 0.8,
        allowPartialMatch = true,
        ignoreAccents = true,
        allowAbbreviations = true
    } = options;
    
    if (!userInput || !correctAnswer) {
        return {
            isMatch: false,
            similarity: 0,
            matchType: 'none'
        };
    }
    
    // Normalize strings
    let normalizedInput = userInput.toLowerCase().trim();
    let normalizedCorrect = correctAnswer.toLowerCase().trim();
    
    // Remove accents if option is enabled
    if (ignoreAccents) {
        normalizedInput = normalizedInput.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        normalizedCorrect = normalizedCorrect.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }
    
    // Exact match
    if (normalizedInput === normalizedCorrect) {
        return {
            isMatch: true,
            similarity: 1.0,
            matchType: 'exact'
        };
    }
    
    // Check for partial matches (e.g., "Amsel" in "Schwarzamsel")
    if (allowPartialMatch) {
        if (normalizedCorrect.includes(normalizedInput) || normalizedInput.includes(normalizedCorrect)) {
            const sim = Math.max(
                normalizedInput.length / normalizedCorrect.length,
                normalizedCorrect.length / normalizedInput.length
            );
            if (sim >= 0.6) {
                return {
                    isMatch: true,
                    similarity: sim,
                    matchType: 'partial'
                };
            }
        }
    }
    
    // Check for common abbreviations (for scientific names)
    if (allowAbbreviations && normalizedCorrect.includes(' ')) {
        const parts = normalizedCorrect.split(' ');
        const abbreviation = parts.map(part => part.charAt(0)).join('. ');
        if (normalizedInput === abbreviation || normalizedInput === abbreviation.replace(/\. /g, '.')) {
            return {
                isMatch: true,
                similarity: 0.9,
                matchType: 'abbreviation'
            };
        }
    }
    
    // Levenshtein distance
    const sim = similarity(userInput, correctAnswer);
    const isMatch = sim >= threshold;
    
    return {
        isMatch,
        similarity: sim,
        matchType: isMatch ? 'similar' : 'different'
    };
}

/**
 * Get suggestions for corrections based on common mistakes
 * @param {string} userInput - User's input
 * @param {Array} possibleAnswers - Array of possible correct answers
 * @param {number} maxSuggestions - Maximum number of suggestions
 * @returns {Array} - Sorted suggestions with similarity scores
 */
function getSuggestions(userInput, possibleAnswers, maxSuggestions = 3) {
    if (!userInput || !possibleAnswers || possibleAnswers.length === 0) {
        return [];
    }
    
    const suggestions = possibleAnswers
        .map(answer => ({
            text: answer,
            similarity: similarity(userInput, answer)
        }))
        .filter(item => item.similarity > 0.3) // Only suggest reasonably similar items
        .sort((a, b) => b.similarity - a.similarity) // Sort by similarity
        .slice(0, maxSuggestions);
    
    return suggestions;
}

/**
 * Check if user input is a reasonable attempt (not just random characters)
 * @param {string} userInput - User's input
 * @param {string} correctAnswer - Correct answer
 * @returns {boolean} - True if input seems like a genuine attempt
 */
function isReasonableAttempt(userInput, correctAnswer) {
    if (!userInput || !correctAnswer) return false;
    
    // Too short compared to correct answer
    if (userInput.length < correctAnswer.length * 0.3) return false;
    
    // Too long compared to correct answer
    if (userInput.length > correctAnswer.length * 2) return false;
    
    // Check if input contains mostly letters (for bird names)
    const letterRatio = (userInput.match(/[a-zA-ZäöüÄÖÜß]/g) || []).length / userInput.length;
    if (letterRatio < 0.7) return false;
    
    return true;
}

module.exports = {
    levenshteinDistance,
    similarity,
    isCloseMatch,
    advancedMatch,
    getSuggestions,
    isReasonableAttempt
};