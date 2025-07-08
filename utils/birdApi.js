// Bird API Integration Utilities
const fetch = require('node-fetch');

// API Configuration
const EBIRD_API_BASE = 'https://api.ebird.org/v2';
const EBIRD_API_TOKEN = '79hfu62fap6o'; // Your eBird API key
const XENO_CANTO_API = 'https://xeno-canto.org/api/3/recordings';
const XENO_CANTO_KEY = 'db4ac657832153265e396b59bfaf5b1fd47df695'; // Your Xeno-canto key
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

/**
 * Get nearby birds from eBird API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radius - Search radius in km (default: 25)
 * @returns {Array} - Array of bird observations
 */
async function getNearbyBirds(lat, lng, radius = 25) {
    try {
        const url = `${EBIRD_API_BASE}/data/obs/geo/recent?lat=${lat}&lng=${lng}&dist=${radius}&back=14&maxResults=50&sort=species`;
        
        const response = await fetch(url, {
            headers: {
                'X-eBirdApiToken': EBIRD_API_TOKEN
            }
        });

        if (!response.ok) {
            throw new Error(`eBird API error: ${response.status} ${response.statusText}`);
        }

        const observations = await response.json();
        
        // Sort by count (highest first), then alphabetically
        observations.sort((a, b) => {
            const countA = parseInt(a.howMany) || 0;
            const countB = parseInt(b.howMany) || 0;
            if (countB !== countA) {
                return countB - countA;
            }
            return a.comName.localeCompare(b.comName);
        });

        // Enrich each observation with additional data
        const enrichedObservations = await Promise.all(
            observations.slice(0, 30).map(async (obs) => {
                const [germanName, imageUrls, soundUrls] = await Promise.all([
                    getGermanName(obs.sciName),
                    getBirdImages(obs.sciName, 3),
                    getBirdSounds(obs.sciName, 2)
                ]);

                return {
                    ...obs,
                    germanName,
                    imageUrls,
                    soundUrls
                };
            })
        );

        return enrichedObservations;

    } catch (error) {
        console.error('Error fetching nearby birds:', error);
        throw error;
    }
}

/**
 * Search for a bird by scientific name
 * @param {string} scientificName - Scientific name of the bird
 * @returns {Object|null} - Bird data or null if not found
 */
async function searchBirdByName(scientificName) {
    try {
        // Get basic bird info from eBird taxonomy
        const taxonomyUrl = `${EBIRD_API_BASE}/ref/taxonomy/ebird?fmt=json&q=${encodeURIComponent(scientificName)}`;
        const taxonomyResponse = await fetch(taxonomyUrl);
        
        if (!taxonomyResponse.ok) {
            throw new Error(`eBird taxonomy API error: ${taxonomyResponse.status}`);
        }
        
        const taxonomyData = await taxonomyResponse.json();
        const birdMatch = taxonomyData.find(bird => 
            bird.sciName.toLowerCase() === scientificName.toLowerCase()
        );

        if (!birdMatch) {
            return null;
        }

        // Get additional data
        const [germanName, imageUrls, soundUrls] = await Promise.all([
            getGermanName(scientificName),
            getBirdImages(scientificName, 5),
            getBirdSounds(scientificName, 3)
        ]);

        return {
            scientificName: birdMatch.sciName,
            englishName: birdMatch.comName,
            germanName,
            speciesCode: birdMatch.speciesCode,
            imageUrls,
            soundUrls,
            category: birdMatch.category,
            order: birdMatch.order,
            familyCode: birdMatch.familyCode,
            familyComName: birdMatch.familyComName
        };

    } catch (error) {
        console.error('Error searching bird by name:', error);
        throw error;
    }
}

/**
 * Get German name for a bird species
 * @param {string} scientificName - Scientific name
 * @returns {string|null} - German name or null
 */
async function getGermanName(scientificName) {
    try {
        const url = `${EBIRD_API_BASE}/ref/taxonomy/ebird?fmt=json&locale=de&q=${encodeURIComponent(scientificName)}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            return null;
        }
        
        const data = await response.json();
        const match = data.find(bird => 
            bird.sciName && bird.sciName.toLowerCase() === scientificName.toLowerCase()
        );
        
        return match ? match.comName : null;

    } catch (error) {
        console.warn('Error fetching German name:', error);
        return null;
    }
}

/**
 * Get bird images from Wikimedia Commons
 * @param {string} scientificName - Scientific name
 * @param {number} limit - Maximum number of images
 * @returns {Array} - Array of image URLs
 */
async function getBirdImages(scientificName, limit = 3) {
    try {
        const searchUrl = `${COMMONS_API}?action=query&format=json&list=search&srsearch="${encodeURIComponent(scientificName)}"&srnamespace=6&srlimit=${limit}&origin=*`;
        const response = await fetch(searchUrl);
        const data = await response.json();

        if (!data.query || !data.query.search || data.query.search.length === 0) {
            return [];
        }

        const imagePromises = data.query.search.map(async (result) => {
            try {
                const filename = result.title;
                const imageInfoUrl = `${COMMONS_API}?action=query&format=json&titles=${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url&iiurlwidth=400&origin=*`;
                const imageResponse = await fetch(imageInfoUrl);
                const imageData = await imageResponse.json();
                
                const pages = imageData.query?.pages;
                if (!pages) return null;
                
                const pageId = Object.keys(pages)[0];
                const page = pages[pageId];
                
                if (page.imageinfo && page.imageinfo[0]) {
                    return page.imageinfo[0].thumburl || page.imageinfo[0].url;
                }
                return null;
            } catch (error) {
                console.warn('Error fetching individual image:', error);
                return null;
            }
        });

        const imageUrls = await Promise.all(imagePromises);
        return imageUrls.filter(url => url !== null);

    } catch (error) {
        console.warn('Error fetching bird images:', error);
        return [];
    }
}

/**
 * Get bird sounds from Xeno-canto
 * @param {string} scientificName - Scientific name
 * @param {number} limit - Maximum number of sounds
 * @returns {Array} - Array of sound data
 */
async function getBirdSounds(scientificName, limit = 2) {
    try {
        const query = `sp:"${scientificName}"`;
        const url = `${XENO_CANTO_API}?query=${encodeURIComponent(query)}&key=${XENO_CANTO_KEY}&per_page=${limit}`;
        
        const response = await fetch(url);
        
        if (!response.ok) {
            return [];
        }
        
        const data = await response.json();

        if (!data.recordings || data.recordings.length === 0) {
            return [];
        }

        return data.recordings.map(recording => ({
            url: recording.file,
            type: recording.type || 'call',
            location: recording.loc || 'Unknown',
            country: recording.cnt || 'Unknown',
            recordist: recording.rec || 'Unknown',
            date: recording.date || 'Unknown',
            quality: recording.q || 'Unknown',
            length: recording.length || 'Unknown',
            remarks: recording.rmk || ''
        }));

    } catch (error) {
        console.warn('Error fetching bird sounds:', error);
        return [];
    }
}

/**
 * Get bird lists for specific habitats/regions
 * @param {string} region - Region code (e.g., 'DE' for Germany)
 * @param {string} habitat - Habitat type (optional)
 * @returns {Array} - Array of common birds for the region
 */
async function getCommonBirds(region = 'DE', habitat = null) {
    try {
        // This could be expanded to use eBird's regional data
        // For now, return predefined lists
        const commonGermanBirds = [
            'Turdus merula',      // Amsel
            'Parus major',        // Kohlmeise
            'Erithacus rubecula', // Rotkehlchen
            'Passer domesticus',  // Haussperling
            'Corvus corvus',      // Kolkrabe
            'Sturnus vulgaris',   // Star
            'Carduelis carduelis',// Stieglitz
            'Fringilla coelebs',  // Buchfink
            'Phylloscopus collybita', // Zilpzalp
            'Sitta europaea'      // Kleiber
        ];

        // Get detailed data for each bird
        const birdDetails = await Promise.all(
            commonGermanBirds.map(async (scientificName) => {
                return await searchBirdByName(scientificName);
            })
        );

        return birdDetails.filter(bird => bird !== null);

    } catch (error) {
        console.error('Error fetching common birds:', error);
        throw error;
    }
}

/**
 * Validate coordinates
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {boolean} - True if coordinates are valid
 */
function validateCoordinates(lat, lng) {
    return (
        typeof lat === 'number' && 
        typeof lng === 'number' &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180
    );
}

/**
 * Calculate distance between two coordinates
 * @param {number} lat1 - First latitude
 * @param {number} lng1 - First longitude
 * @param {number} lat2 - Second latitude
 * @param {number} lng2 - Second longitude
 * @returns {number} - Distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

module.exports = {
    getNearbyBirds,
    searchBirdByName,
    getGermanName,
    getBirdImages,
    getBirdSounds,
    getCommonBirds,
    validateCoordinates,
    calculateDistance
};
