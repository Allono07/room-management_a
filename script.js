// Configuration - Replace with your actual Google Sheets details
const CONFIG = {
    SPREADSHEET_ID: '19w8SGE8dc4c_PxI4mBg-0nEerRvUsqOxPSE__BfK4gQ',
    API_KEY: 'AIzaSyCNTFlcVxF16w5jIGYdp5d9rBg2IHjAsCU',
    CLIENT_ID: '311551867349-ee4mroopunj16n40lt92qlfblftg2j9d.apps.googleusercontent.com',
    DISCOVERY_DOC: 'https://sheets.googleapis.com/$discovery/rest?version=v4',
    SCOPES: 'https://www.googleapis.com/auth/spreadsheets openid email profile',
    WASTE_SHEET: 'Waste!A:E',
    WATER_SHEET: 'Water!A:E', 
    CLEANING_SHEET: 'Cleaning!A:E',
    REWARDS_SHEET: 'Rewards!A:F',
    REWARDS: {
        WASTE_POINTS: 5,
        WATER_POINTS: 15,
        CLEANING_POINTS: 10
    },
    ROOMMATES: ['ALLEN', 'DEBIN', 'GREEN', 'JITHU'],
    // Email configuration
    EMAIL: {
        SERVICE_ID: 'service_z7ejjbn',
        TEMPLATE_ID: 'template_n885wa8',
        PUBLIC_KEY: 'noyxT_Bu6ph2s9LL8', // Replace with your public key from EmailJS dashboard
        TO_EMAILS: ['jithuv01@gmail.com', 'allen.thomson@mscsa.christuniversity.in','greeenvr@gmail.com','rtdebin@gmail.com']
    }
};

// Global state
let roommateData = {};
let waterTripData = [];
let cleaningData = [];
let rewardsData = {};
let currentMonthRankings = [];
let lastMonthWinner = null;
let currentUpdatingPerson = null;
let isSignedIn = false;

// GIS state
let googleUser = null;
let googleToken = null;
let accessToken = null;
let tokenClient = null;

// Google Identity Services load callback
window.onGapiLoad = function() {
    console.log('Google Identity Services loaded successfully');
};

// Email utility functions
async function sendEmail(templateParams) {
    try {
        // Check if EmailJS is defined
        if (typeof emailjs === 'undefined') {
            throw new Error('EmailJS is not loaded. Please check if the EmailJS script is included in your HTML.');
        }
        
        // Send email to all recipients
        const sendPromises = CONFIG.EMAIL.TO_EMAILS.map(async (recipientEmail) => {
            const params = {
                ...templateParams,
                email: recipientEmail
            };
            
            console.log(`Sending email to ${recipientEmail} with params:`, params);
            
            return emailjs.send(
                CONFIG.EMAIL.SERVICE_ID,
                CONFIG.EMAIL.TEMPLATE_ID,
                params
            );
        });
        
        // Wait for all emails to be sent
        const responses = await Promise.all(sendPromises);
        
        console.log('All emails sent successfully:', responses);
        return true;
    } catch (error) {
        console.error('Failed to send email:', error);
        if (error.text) {
            showError(`Failed to send email: ${error.text}`);
        } else {
            showError('Failed to send email notification. Please try again.');
        }
        return false;
    }
}

async function sendWasteUpdateEmail(person, date) {
    // Debug log to check authentication state
    console.log('Current auth state:', {
        googleUser: googleUser,
        isSignedIn: isSignedIn,
        accessToken: accessToken ? 'Present' : 'None'
    });

    let editorEmail = 'Unknown editor';
    if (googleUser && googleUser.email) {
        editorEmail = googleUser.email;
    } else {
        // Try to get email from localStorage
        const storedUser = localStorage.getItem('google_user');
        if (storedUser) {
            const userObject = JSON.parse(storedUser);
            editorEmail = userObject.email || 'Unknown editor';
        }
        console.log('Retrieved stored user:', storedUser);
    }

    console.log('Editor email being used:', editorEmail);

    const templateParams = {
        title: 'Waste Disposal Update',
        date: date,
        action_type: 'waste disposal update',
        message: `${person} has taken out the waste`,
        icon: '🗑️',
        bg_color: '#ffebee',
        editor_email: editorEmail,
        update_info: `This update was made by: ${editorEmail}`
    };
   return await sendEmail(templateParams);
}

async function sendWaterUpdateEmail(person1, person2, date) {
    const editorEmail = googleUser ? googleUser.email : 'Unknown editor';
    const templateParams = {
        title: 'Water Bottle Trip Update',
        date: date,
        action_type: 'water bottle trip update',
        message: `${person1} and ${person2} went for water bottles`,
        icon: '💧',
        bg_color: '#e3f2fd',
        editor_email: editorEmail,
        update_info: `This update was made by: ${editorEmail}`
    };
    return await sendEmail(templateParams);
}

async function sendCleaningUpdateEmail(person, location, date) {
    const editorEmail = googleUser ? googleUser.email : 'Unknown editor';
    const templateParams = {
        title: 'Cleaning Update',
        date: date,
        action_type: 'cleaning update',
        message: `${person} has cleaned the ${location}`,
        icon: '🧹',
        bg_color: '#f5f5f5',
        editor_email: editorEmail,
        update_info: `This update was made by: ${editorEmail}`
    };
    return await sendEmail(templateParams);
}

// Initialize EmailJS
function initializeEmailJS() {
    try {
        emailjs.init(CONFIG.EMAIL.PUBLIC_KEY);
        console.log('EmailJS initialized successfully');
    } catch (error) {
        console.error('Failed to initialize EmailJS:', error);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Initialize EmailJS first
    initializeEmailJS();
    
    // Set max date to today for all date inputs to disable future dates
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('wasteDate').max = today;
    document.getElementById('waterDate').max = today;
    document.getElementById('cleaningDate').max = today;
    
    // Check for stored authentication state first
    checkStoredAuthState();
        
    // Check for OAuth2 redirect
    handleOAuthRedirect();
    
    // Initialize Google Identity Services
    setTimeout(() => {
        initializeGIS();
    }, 1000); // Give time for the script to load
    
    // Initialize the app
    initializeApp();
});

// Reward System Functions
async function updateRewardsSheet(person, activity, points, date) {
    if (!isSignedIn) {
        window.alert("Please sign in to update");
        throw new Error('Please sign in to update rewards');
    }

    try {
        const authToken = getAuthToken();
        if (!authToken) {
            throw new Error('No authentication token available');
        }

        const rowData = [date, person, activity, points, new Date().toISOString(), googleUser?.email || 'Unknown'];
        
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.REWARDS_SHEET}:append?valueInputOption=USER_ENTERED&access_token=${authToken}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: [rowData]
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to update rewards sheet: ${response.status}`);
        }

        console.log(`Successfully added reward points for ${person}`);
        await loadRewardsData();
    } catch (error) {
        console.error('Error updating rewards:', error);
        throw error;
    }
}

async function loadRewardsData() {
    try {
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.REWARDS_SHEET}?key=${CONFIG.API_KEY}`
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log(data)
        processRewardsData(data.values || []);
        updateRewardsDisplay();
    } catch (error) {
        console.error('Error loading rewards data:', error);
    }
}

function processRewardsData(values) {
    rewardsData = {};
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    // Skip header row if it exists
    const dataRows = values.length > 1 ? values.slice(1) : values;

    dataRows.forEach(row => {
        if (row.length < 4) return;

        // Parse date in DD/MM/YYYY format
        const [day, month, year] = row[0].split('/').map(num => parseInt(num, 10));
        const date = new Date(year, month - 1, day); // month is 0-based in JS
        const person = row[1];
        const points = parseInt(row[3]) || 0;

        // Initialize person's data if not exists
        if (!rewardsData[person]) {
            rewardsData[person] = {
                currentMonth: 0,
                lastMonth: 0,
                total: 0
            };
        }

        // Add points to appropriate month
        if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
            rewardsData[person].currentMonth += points;
        } else if (date.getMonth() === lastMonth && date.getFullYear() === lastMonthYear) {
            rewardsData[person].lastMonth += points;
        }
        rewardsData[person].total += points;
    });

    // Calculate rankings and winner
    calculateRankings();
}

function calculateRankings() {
    // Current month rankings
    currentMonthRankings = Object.entries(rewardsData)
        .map(([name, data]) => ({
            name,
            points: data.currentMonth
        }))
        .sort((a, b) => b.points - a.points);

    // Last month's winner
    lastMonthWinner = Object.entries(rewardsData)
        .reduce((winner, [name, data]) => {
            if (!winner || data.lastMonth > winner.points) {
                return { name, points: data.lastMonth };
            }
            return winner;
        }, null);
}

function updateRewardsDisplay() {
    // Update current rankings
    const rankingsList = document.getElementById('rankingsList');
    rankingsList.innerHTML = currentMonthRankings
        .map((person, index) => `
            <div class="ranking-item ${index === 0 ? 'top-rank' : ''}">
                <span class="rank">#${index + 1}</span>
                <span class="name">${person.name}</span>
                <span class="points">${person.points} pts</span>
            </div>
        `)
        .join('');

    // Update last month's winner
    const winnerDisplay = document.getElementById('lastMonthWinner');
    if (lastMonthWinner && lastMonthWinner.points > 0) {
        winnerDisplay.innerHTML = `
            <div class="winner">
                <span class="winner-name">${lastMonthWinner.name}</span>
                <span class="winner-points">${lastMonthWinner.points} pts</span>
            </div>
        `;
    } else {
        winnerDisplay.innerHTML = '<p>No winner yet</p>';
    }
}

async function initializeApp() {
    showLoading(true);
    
    try {
        // Load data from sheets
        await Promise.all([
            loadDataFromSheets(),
            loadRewardsData()
        ]);
        
        // Render all components
        renderRoommateCards();
        renderWaterTrips();
        renderWaterRoommateCards();
        renderCleaningHistory();
        renderCleaningRoommateCards();
        updateLatestIndicator();
        updateMostIndicator();
        updateWaterLatestIndicator();
        updateWaterMostIndicator();
        updateCleaningLatestIndicator();
        updateCleaningMostIndicator();
        updateRewardsDisplay();
        setupEventListeners();
        
        // Update auth status
        updateAuthStatus();
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to load data. Please check your configuration and try again.');
    } finally {
        showLoading(false);
    }
}



// OAuth2 Authentication Functions
// Check for stored authentication state
function checkStoredAuthState() {
    try {
        const storedToken = localStorage.getItem('google_access_token');
        const storedUser = localStorage.getItem('google_user');
        const tokenExpiry = localStorage.getItem('google_token_expiry');
        
        console.log('Checking stored auth state...');
        console.log('Stored token exists:', !!storedToken);
        console.log('Stored user exists:', !!storedUser);
        console.log('Stored user value:',storedUser);
        console.log('Token expiry:', tokenExpiry);
        
        if (storedToken) {
            // Check if token is still valid (not expired)
            if (tokenExpiry && new Date() < new Date(tokenExpiry)) {
                accessToken = storedToken;
                googleUser = JSON.parse(storedUser);
                isSignedIn = true;
                console.log('Restored valid authentication state from storage');
                console.log('Restored user:', googleUser);
                return true;
            } else {
                console.log('Stored token has expired, clearing storage');
                localStorage.removeItem('google_access_token');
                localStorage.removeItem('google_user');
                localStorage.removeItem('google_token_expiry');
            }
        } else {
            console.log('No stored authentication state found');
        }
    } catch (error) {
        console.error('Error checking stored auth state:', error);
        // Clear invalid stored data
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_user');
        localStorage.removeItem('google_token_expiry');
    }
    return false;
}

function initializeGIS() {
    let retryAttempts = 0;
    const maxRetries = 50; // 5 seconds maximum wait
    const retryInterval = 100; // 100ms between retries
    
    function initializeGoogleAuth() {
        try {
            console.log('Initializing Google Identity Services...');
            
            // Initialize the Google Identity Services
            google.accounts.id.initialize({
                client_id: CONFIG.CLIENT_ID,
                callback: handleCredentialResponse,
                auto_select: false
            });
            
            // Render the Google Sign-In button
            const signInElement = document.getElementById('g_id_signin');
            if (signInElement) {
                google.accounts.id.renderButton(
                    signInElement,
                    { 
                        type: 'standard',
                        theme: 'outline',
                        size: 'large',
                        width: 250,
                        logo_alignment: 'center'
                    }
                );
                console.log('Google Sign-In button rendered successfully');
            } else {
                console.error('g_id_signin element not found');
            }
            
            // Initialize OAuth2 token client
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CONFIG.CLIENT_ID,
                scope: CONFIG.SCOPES,
                callback: handleTokenResponse,
                prompt: 'consent'
            });
            
            console.log('Google Identity Services initialized successfully');
            return true;
            
        } catch (error) {
            console.error('Error initializing Google Identity Services:', error);
            return false;
        }
    }
    
    async function handleTokenResponse(tokenResponse) {
        console.log('Token client callback fired!', tokenResponse);
        
        if (tokenResponse.error) {
            console.error('Token error:', tokenResponse.error);
            showError('Authentication failed: ' + tokenResponse.error);
            showLoading(false);
            return;
        }
        
        accessToken = tokenResponse.access_token;
        isSignedIn = true;
        
        // Calculate token expiry (1 hour from now)
        const expiryTime = new Date(Date.now() + 3600000);
        
        try {
            // Try to fetch user email if needed
            if (!googleUser?.email) {
                console.log('Email not found in googleUser, attempting to fetch...');
                const email = await fetchUserEmailFromGoogle();
                if (email) {
                    googleUser = googleUser || {};
                    googleUser.email = email;
                    console.log('Updated googleUser with email:', googleUser);
                    localStorage.setItem('google_user', JSON.stringify(googleUser));
                }
            }
            
            // Store authentication state
            localStorage.setItem('google_access_token', accessToken);
            localStorage.setItem('google_token_expiry', expiryTime.toISOString());
            if (googleUser) {
                localStorage.setItem('google_user', JSON.stringify(googleUser));
                console.log('Stored googleUser after token acquisition:', googleUser);
            }
            
            updateAuthStatus();
            showSuccess(`Successfully signed in${googleUser?.email ? ` (${googleUser.email})` : ''}!`);
            console.log('Access token received successfully');
        } catch (error) {
            console.error('Error in token response:', error);
        } finally {
            showLoading(false);
        }
    }
    
    function attemptInitialization() {
        if (typeof google === 'undefined' || !google.accounts) {
            retryAttempts++;
            console.log(`Google Identity Services not ready, retrying... (${retryAttempts}/${maxRetries})`);
            
            if (retryAttempts < maxRetries) {
                setTimeout(attemptInitialization, retryInterval);
            } else {
                console.error('Failed to load Google Identity Services after maximum attempts');
                showError('Failed to initialize Google authentication. Please refresh the page.');
            }
            return;
        }
        
        const initialized = initializeGoogleAuth();
        if (!initialized) {
            retryAttempts++;
            if (retryAttempts < maxRetries) {
                console.log(`Initialization failed, retrying... (${retryAttempts}/${maxRetries})`);
                setTimeout(attemptInitialization, retryInterval);
            } else {
                console.error('Failed to initialize Google authentication after maximum attempts');
                showError('Failed to initialize Google authentication. Please refresh the page.');
            }
        }
    }
    
    // Start initialization process
    attemptInitialization();
}

function handleSignInClick() {
    try {
        if (!google?.accounts?.id) {
            showError('Authentication not initialized. Please refresh the page.');
            return;
        }

        showLoading(true);
        
        // Trigger Google One Tap or fall back to button click
        google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                console.log('Google One Tap not displayed:', notification);
                // Fall back to the Google Sign-In button click
                const signInButton = document.getElementById('g_id_signin');
                if (signInButton) {
                    const button = signInButton.querySelector('div[role="button"]');
                    if (button) {
                        button.click();
                    } else {
                        showError('Could not find Google Sign-In button');
                        showLoading(false);
                    }
                } else {
                    showError('Could not initiate sign-in. Please try again.');
                    showLoading(false);
                }
            }
        });
    } catch (error) {
        console.error('Error initiating sign-in:', error);
        showError('Failed to start sign-in process. Please try again.');
        showLoading(false);
    }
}


async function handleCredentialResponse(response) {
    try {
        if (!response?.credential) {
            throw new Error('Invalid credential response');
        }

        console.log('Credential response received');
        googleToken = response.credential;
        
        try {
            // Parse the JWT token
            const [header, payload] = googleToken.split('.');
            if (!header || !payload) {
                throw new Error('Invalid JWT format');
            }
            
            const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
            const jsonPayload = decodeURIComponent(atob(padded).split('').map(c => 
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
            ).join(''));
            
            const decodedToken = JSON.parse(jsonPayload);
            console.log('Decoded token:', decodedToken);
            
            // Update user info immediately
            googleUser = {
                email: decodedToken.email || null,
                name: decodedToken.name || null,
                picture: decodedToken.picture || null
            };

            if (googleUser.email) {
                localStorage.setItem('google_user', JSON.stringify(googleUser));
                console.log('User info stored:', googleUser);
                
                // After getting the user info, proceed with token request
                console.log('Requesting access token...');
                if (tokenClient) {
                    tokenClient.requestAccessToken({ prompt: 'consent' });
                } else {
                    console.error('Token client not initialized');
                }
            } else {
                console.error('No email found in token');
            }
            
        } catch (parseError) {
            console.error('Error parsing JWT:', parseError);
            googleUser = null;
        }

    } catch (error) {
        console.error('Error in handleCredentialResponse:', error);
        showError('Failed to process sign-in. Please try again.');
    }
}

function signOut() {
    googleUser = null;
    googleToken = null;
    accessToken = null;
    isSignedIn = false;
    // Clear stored authentication state
    localStorage.removeItem('google_access_token');
    localStorage.removeItem('google_user');
    localStorage.removeItem('google_token_expiry');
    updateAuthStatus();
    showSuccess('Successfully signed out.');
    console.log('User signed out');
}

function checkAuthStatus() {
    console.log('Checking auth status...');
    console.log('googleUser:', googleUser);
    console.log('accessToken:', accessToken ? 'Present' : 'Missing');
    console.log('isSignedIn:', isSignedIn);
    
    // Check localStorage
    const storedToken = localStorage.getItem('google_access_token');
    const storedUser = localStorage.getItem('google_user');
    console.log('Stored token:', storedToken ? 'Present' : 'Missing');
    console.log('Stored user:', storedUser ? 'Present' : 'Missing');
    
    if (googleUser && accessToken) {
        console.log('Auth Status:', {
            isSignedIn: true,
            userEmail: googleUser.email,
            accessToken: accessToken ? 'Present' : 'Missing'
        });
        return true;
    } else {
        console.log('Auth Status: Not signed in');
        console.log('Reason: Missing googleUser or accessToken');
        return false;
    }
}

function updateAuthStatus() {
    const authButton = document.getElementById('authButton');
    const googleSignInButton = document.getElementById('g_id_signin');

    if (authButton) {
        if (isSignedIn) {
            authButton.textContent = '🚪 Sign Out';
            authButton.onclick = signOut;
            authButton.style.display = 'block';
            authButton.classList.remove('btn-signin');
            authButton.classList.add('btn-signout');
            if (googleSignInButton) {
                googleSignInButton.style.display = 'none';
            }
        } else {
            authButton.style.display = 'none';
            if (googleSignInButton) {
                googleSignInButton.style.display = 'block';
            }
        }
    }
}

function getAuthToken() {
    return accessToken;
}

// Alternative authentication method for COOP issues
function tryAlternativeAuth() {
    try {
        // Try to open auth in same window instead of popup
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${CONFIG.CLIENT_ID}&` +
            `scope=${encodeURIComponent(CONFIG.SCOPES)}&` +
            `response_type=token&` +
            `redirect_uri=${encodeURIComponent(window.location.origin)}&` +
            `state=roommate_tracker`;
        
        window.location.href = authUrl;
    } catch (error) {
        console.error('Alternative auth failed:', error);
        showError('Authentication failed. Please check your browser settings.');
    }
}

// Handle redirect from OAuth2
function handleOAuthRedirect() {
    const hash = window.location.hash;
    if (hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        if (token) {
            accessToken = token;
            isSignedIn = true;
            
            // Calculate token expiry (typically 1 hour from now)
            const expiryTime = new Date(Date.now() + 3600000); // 1 hour
            
            // Store authentication state with expiry
            localStorage.setItem('google_access_token', accessToken);
            localStorage.setItem('google_token_expiry', expiryTime.toISOString());
            
            updateAuthStatus();
            showSuccess('Successfully authenticated! You can now add entries.');
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
}

// Call GIS initializer
initializeGIS();

// Google Sheets API functions
async function loadDataFromSheets() {
    try {
        // Check if API key and spreadsheet ID are configured
        if (CONFIG.API_KEY === 'YOUR_API_KEY' || CONFIG.SPREADSHEET_ID === 'YOUR_SPREADSHEET_ID') {
            console.log('Using mock data - configure Google Sheets API to use real data');
            loadMockData();
            return;
        }

        // Load data from all three sheets
        await Promise.all([
            loadWasteData(),
            loadWaterData(),
            loadCleaningData()
        ]);
        
    } catch (error) {
        console.error('Error loading data from sheets:', error);
        console.log('Falling back to mock data');
        loadMockData();
    }
}

async function loadWasteData() {
    try {
        console.log('Fetching waste data from:', `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.WASTE_SHEET}?key=${CONFIG.API_KEY}`);
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.WASTE_SHEET}?key=${CONFIG.API_KEY}`
        );
        console.log('Waste data response status:', response.status);
        const text = await response.text();
        console.log('Waste data raw response:', text);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = JSON.parse(text);
        processWasteSheetData(data.values);
    } catch (error) {
        console.error('Error loading waste data:', error);
        throw error;
    }
}

async function loadWaterData() {
    try {
        console.log('Fetching water data from:', `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.WATER_SHEET}?key=${CONFIG.API_KEY}`);
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.WATER_SHEET}?key=${CONFIG.API_KEY}`
        );
        console.log('Water data response status:', response.status);
        const text = await response.text();
        console.log('Water data raw response:', text);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = JSON.parse(text);
        processWaterSheetData(data.values);
    } catch (error) {
        console.error('Error loading water data:', error);
        throw error;
    }
}

async function loadCleaningData() {
    try {
        console.log('Fetching cleaning data from:', `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.CLEANING_SHEET}?key=${CONFIG.API_KEY}`);
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.CLEANING_SHEET}?key=${CONFIG.API_KEY}`
        );
        console.log('Cleaning data response status:', response.status);
        const text = await response.text();
        console.log('Cleaning data raw response:', text);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = JSON.parse(text);
        processCleaningSheetData(data.values);
    } catch (error) {
        console.error('Error loading cleaning data:', error);
        throw error;
    }
}

function loadMockData() {
    // Mock data for testing
    roommateData = {
        'ALLEN': {
            name: 'ALLEN',
            dates: ['23/09/2025', '25/09/2025'],
            lastDate: '25/09/2025',
            count: 2
        },
        'DEBIN': {
            name: 'DEBIN',
            dates: ['23/09/2025'],
            lastDate: '23/09/2025',
            count: 1
        },
        'GREEN': {
            name: 'GREEN',
            dates: ['23/09/2025'],
            lastDate: '23/09/2025',
            count: 1
        },
        'JITHU': {
            name: 'JITHU',
            dates: ['23/09/2025'],
            lastDate: '23/09/2025',
            count: 1
        }
    };

    waterTripData = [
        {
            date: '22/09/2025',
            time: '14:30',
            person1: 'ALLEN',
            person2: 'DEBIN',
            id: 1
        },
        {
            date: '24/09/2025',
            time: '16:45',
            person1: 'GREEN',
            person2: 'JITHU',
            id: 2
        },
        {
            date: '26/09/2025',
            time: '10:15',
            person1: 'ALLEN',
            person2: 'GREEN',
            id: 3
        }
    ];

    cleaningData = [
        {
            date: '21/09/2025',
            time: '09:30',
            person: 'ALLEN',
            location: 'kitchen',
            id: 1
        },
        {
            date: '23/09/2025',
            time: '14:15',
            person: 'DEBIN',
            location: 'hall',
            id: 2
        },
        {
            date: '25/09/2025',
            time: '11:45',
            person: 'GREEN',
            location: 'kitchen',
            id: 3
        },
        {
            date: '27/09/2025',
            time: '16:20',
            person: 'JITHU',
            location: 'hall',
            id: 4
        },
        {
            date: '28/09/2025',
            time: '10:10',
            person: 'ALLEN',
            location: 'hall',
            id: 5
        }
    ];
}

function processWasteSheetData(values) {
    // Initialize roommate data first
    CONFIG.ROOMMATES.forEach(roommate => {
        roommateData[roommate] = {
            name: roommate,
            dates: [],
            lastDate: null,
            count: 0
        };
    });

    if (!values || values.length < 2) {
        console.log('No waste data found in sheet, using empty data');
        return; // No data, keep empty
    }

    const headers = values[0];
    const dataRows = values.slice(1);
    
    console.log('Waste sheet headers:', headers);
    console.log('Waste sheet data rows:', dataRows);
    
    // Process each data row
    dataRows.forEach(row => {
        if (row.length < 2) return; // Skip empty or incomplete rows
        // Skip row[0] (row number), roommate columns start at index 1
        CONFIG.ROOMMATES.forEach((roommate, index) => {
            const dateValue = row[index + 1]; // Start from column 1
            if (dateValue && dateValue.trim()) {
                roommateData[roommate].dates.push(dateValue.trim());
                roommateData[roommate].count++;
                roommateData[roommate].lastDate = dateValue.trim();
            }
        });
    });
}

function processWaterSheetData(values) {
    waterTripData = [];
    
    if (!values || values.length < 2) {
        console.log('No water data found in sheet, using empty data');
        return; // No data, keep empty
    }

    const headers = values[0];
    const dataRows = values.slice(1);
    
    console.log('Water sheet headers:', headers);
    console.log('Water sheet data rows:', dataRows);
    
    dataRows.forEach((row, index) => {
        if (row.length >= 4 && row[0] && row[2] && row[3]) {
            waterTripData.push({
                date: row[0].trim(),
                time: row[1] ? row[1].trim() : '',
                person1: row[2].trim(),
                person2: row[3].trim(),
                id: index + 1
            });
        }
    });
}

function processCleaningSheetData(values) {
    cleaningData = [];
    
    if (!values || values.length < 2) {
        console.log('No cleaning data found in sheet, using empty data');
        return; // No data, keep empty
    }

    const headers = values[0];
    const dataRows = values.slice(1);
    
    console.log('Cleaning sheet headers:', headers);
    console.log('Cleaning sheet data rows:', dataRows);
    
    dataRows.forEach((row, index) => {
        if (row.length >= 4 && row[0] && row[2] && row[3]) {
            cleaningData.push({
                date: row[0].trim(),
                time: row[1] ? row[1].trim() : '',
                person: row[2].trim(),
                location: row[3].trim(),
                id: index + 1
            });
        }
    });
}

// UI Rendering functions
function renderRoommateCards() {
    const grid = document.getElementById('roommatesGrid');
    grid.innerHTML = '';

    CONFIG.ROOMMATES.forEach(roommate => {
        const data = roommateData[roommate];
        const card = createRoommateCard(data);
        grid.appendChild(card);
    });
}

function createRoommateCard(data) {
    // Safety check for undefined data
    if (!data || !data.name) {
        console.error('Invalid roommate data:', data);
        return document.createElement('div'); // Return empty div
    }

    const card = document.createElement('div');
    card.className = 'roommate-card';
    card.dataset.roommate = data.name;

    const isLatest = isLatestWasteKeeper(data.name);
    const isMost = isMostWasteKeeper(data.name);
    
    if (isLatest) {
        card.classList.add('latest');
    }
    if (isMost) {
        card.classList.add('most');
    }

    card.innerHTML = `
        <div class="roommate-name">${data.name}</div>
        <div class="roommate-stats">
            <div class="stat">
                <span class="stat-number">${data.count || 0}</span>
                <span class="stat-label">Times</span>
            </div>
            <div class="stat">
                <span class="stat-number">${data.lastDate ? formatDate(data.lastDate) : 'Never'}</span>
                <span class="stat-label">Last Date</span>
            </div>
        </div>
        <div class="last-date">
            <div class="last-date-label">Most Recent:</div>
            <div class="last-date-value">${data.lastDate || 'No records'}</div>
        </div>
        <button class="update-btn" onclick="openUpdateModal('${data.name}')">
            Update Waste Date
        </button>
    `;

    return card;
}

// Water Bottle Functions
function renderWaterTrips() {
    const grid = document.getElementById('waterTripsGrid');
    grid.innerHTML = '';

    // Sort trips by date (most recent first)
    const sortedTrips = [...waterTripData].sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        return dateB - dateA;
    });

    sortedTrips.forEach((trip, index) => {
        const card = createWaterTripCard(trip, index === 0);
        grid.appendChild(card);
    });
}

function createWaterTripCard(trip, isLatest) {
    const card = document.createElement('div');
    card.className = 'water-trip-card';
    card.dataset.tripId = trip.id;

    if (isLatest) {
        card.classList.add('latest');
    }

    card.innerHTML = `
        <div class="water-trip-date">${trip.date}</div>
        <div class="water-trip-people">
            <div class="water-trip-person">
                <div class="water-trip-person-label">First Person</div>
                <div class="water-trip-person-name">${trip.person1}</div>
            </div>
            <div class="water-trip-person">
                <div class="water-trip-person-label">Second Person</div>
                <div class="water-trip-person-name">${trip.person2}</div>
            </div>
        </div>
        <div class="water-trip-time">${trip.time || 'Time not specified'}</div>
    `;

    return card;
}

// Water Bottle Roommate Cards
function renderWaterRoommateCards() {
    const grid = document.getElementById('waterRoommatesGrid');
    grid.innerHTML = '';

    CONFIG.ROOMMATES.forEach(roommate => {
        const data = calculateWaterRoommateData(roommate);
        const card = createWaterRoommateCard(data);
        grid.appendChild(card);
    });
}

function calculateWaterRoommateData(roommateName) {
    const trips = waterTripData.filter(trip => 
        trip.person1 === roommateName || trip.person2 === roommateName
    );
    
    let lastTrip = null;
    if (trips.length > 0) {
        lastTrip = trips.reduce((latest, trip) => {
            const tripDate = parseDate(trip.date);
            const latestDate = latest ? parseDate(latest.date) : null;
            
            if (!latestDate || tripDate > latestDate) {
                return trip;
            }
            return latest;
        }, null);
    }
    
    return {
        name: roommateName,
        count: trips.length,
        lastTrip: lastTrip,
        lastDate: lastTrip ? lastTrip.date : null
    };
}

function createWaterRoommateCard(data) {
    const card = document.createElement('div');
    card.className = 'water-roommate-card';
    card.dataset.roommate = data.name;

    const isLatest = isLatestWaterKeeper(data.name);
    const isMost = isMostWaterKeeper(data.name);
    
    if (isLatest) {
        card.classList.add('latest');
    }
    if (isMost) {
        card.classList.add('most');
    }

    card.innerHTML = `
        <div class="water-roommate-name">${data.name}</div>
        <div class="water-roommate-stats">
            <div class="water-stat">
                <span class="water-stat-number">${data.count}</span>
                <span class="water-stat-label">Trips</span>
            </div>
            <div class="water-stat">
                <span class="water-stat-number">${data.lastDate ? formatDate(data.lastDate) : 'Never'}</span>
                <span class="water-stat-label">Last Trip</span>
            </div>
        </div>
        <div class="water-last-trip">
            <div class="water-last-trip-label">Most Recent:</div>
            <div class="water-last-trip-value">${data.lastDate || 'No trips recorded'}</div>
        </div>
    `;

    return card;
}

function isLatestWaterKeeper(roommateName) {
    const latestTrip = getLatestWaterTrip();
    return latestTrip && (latestTrip.person1 === roommateName || latestTrip.person2 === roommateName);
}

function isMostWaterKeeper(roommateName) {
    return getMostWaterTripPerson() === roommateName;
}

// Cleaning Functions
function renderCleaningHistory() {
    const grid = document.getElementById('cleaningHistoryGrid');
    grid.innerHTML = '';

    // Sort cleaning sessions by date (most recent first)
    const sortedCleaning = [...cleaningData].sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        return dateB - dateA;
    });

    sortedCleaning.forEach((session, index) => {
        const card = createCleaningHistoryCard(session, index === 0);
        grid.appendChild(card);
    });
}

function createCleaningHistoryCard(session, isLatest) {
    const card = document.createElement('div');
    card.className = 'cleaning-history-card';
    card.dataset.sessionId = session.id;

    if (isLatest) {
        card.classList.add('latest');
    }

    card.innerHTML = `
        <div class="cleaning-history-date">${session.date}</div>
        <div class="cleaning-history-info">
            <div class="cleaning-history-person">
                <div class="cleaning-history-person-label">Person</div>
                <div class="cleaning-history-person-name">${session.person}</div>
            </div>
            <div class="cleaning-history-location">
                <div class="cleaning-history-location-label">Location</div>
                <div class="cleaning-history-location-value">${session.location}</div>
            </div>
        </div>
        <div class="cleaning-history-time">${session.time || 'Time not specified'}</div>
    `;

    return card;
}

function renderCleaningRoommateCards() {
    const grid = document.getElementById('cleaningRoommatesGrid');
    grid.innerHTML = '';

    CONFIG.ROOMMATES.forEach(roommate => {
        const data = calculateCleaningRoommateData(roommate);
        const card = createCleaningRoommateCard(data);
        grid.appendChild(card);
    });
}

function calculateCleaningRoommateData(roommateName) {
    const sessions = cleaningData.filter(session => session.person === roommateName);
    
    let lastSession = null;
    if (sessions.length > 0) {
        lastSession = sessions.reduce((latest, session) => {
            const sessionDate = parseDate(session.date);
            const latestDate = latest ? parseDate(latest.date) : null;
            
            if (!latestDate || sessionDate > latestDate) {
                return session;
            }
            return latest;
        }, null);
    }
    
    return {
        name: roommateName,
        count: sessions.length,
        lastSession: lastSession,
        lastDate: lastSession ? lastSession.date : null
    };
}

function createCleaningRoommateCard(data) {
    const card = document.createElement('div');
    card.className = 'cleaning-roommate-card';
    card.dataset.roommate = data.name;

    const isLatest = isLatestCleaningKeeper(data.name);
    const isMost = isMostCleaningKeeper(data.name);
    
    if (isLatest) {
        card.classList.add('latest');
    }
    if (isMost) {
        card.classList.add('most');
    }

    card.innerHTML = `
        <div class="cleaning-roommate-name">${data.name}</div>
        <div class="cleaning-roommate-stats">
            <div class="cleaning-stat">
                <span class="cleaning-stat-number">${data.count}</span>
                <span class="cleaning-stat-label">Sessions</span>
            </div>
            <div class="cleaning-stat">
                <span class="cleaning-stat-number">${data.lastDate ? formatDate(data.lastDate) : 'Never'}</span>
                <span class="cleaning-stat-label">Last Session</span>
            </div>
        </div>
        <div class="cleaning-last-session">
            <div class="cleaning-last-session-label">Most Recent:</div>
            <div class="cleaning-last-session-value">${data.lastDate || 'No sessions recorded'}</div>
        </div>
    `;

    return card;
}

function isLatestCleaningKeeper(roommateName) {
    const latestSession = getLatestCleaningSession();
    return latestSession && latestSession.person === roommateName;
}

function isMostCleaningKeeper(roommateName) {
    return getMostCleaningPerson() === roommateName;
}

// Cleaning Indicator Functions
function updateCleaningLatestIndicator() {
    const latestSession = getLatestCleaningSession();
    const badge = document.getElementById('cleaningLatestBadge');
    const personSpan = document.getElementById('cleaningLatestPerson');
    
    if (latestSession) {
        personSpan.textContent = latestSession.person;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function updateCleaningMostIndicator() {
    const mostPerson = getMostCleaningPerson();
    const badge = document.getElementById('cleaningMostBadge');
    const personSpan = document.getElementById('cleaningMostPerson');
    
    if (mostPerson) {
        personSpan.textContent = mostPerson;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function getLatestCleaningSession() {
    if (cleaningData.length === 0) return null;
    
    return cleaningData.reduce((latest, session) => {
        const sessionDate = parseDate(session.date);
        const latestDate = latest ? parseDate(latest.date) : null;
        
        if (!latestDate || sessionDate > latestDate) {
            return session;
        }
        return latest;
    }, null);
}

function getMostCleaningPerson() {
    const sessionCounts = {};
    
    // Count sessions for each person
    cleaningData.forEach(session => {
        sessionCounts[session.person] = (sessionCounts[session.person] || 0) + 1;
    });
    
    // Find person with most sessions
    let mostPerson = null;
    let highestCount = 0;
    
    Object.entries(sessionCounts).forEach(([person, count]) => {
        if (count > highestCount) {
            highestCount = count;
            mostPerson = person;
        }
    });
    
    return mostPerson;
}

function updateLatestIndicator() {
    const latestPerson = getLatestWasteKeeper();
    const badge = document.getElementById('latestBadge');
    const personSpan = document.getElementById('latestPerson');
    
    if (latestPerson) {
        personSpan.textContent = latestPerson;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function updateMostIndicator() {
    const mostPerson = getMostWasteKeeper();
    const badge = document.getElementById('mostBadge');
    const personSpan = document.getElementById('mostPerson');
    
    if (mostPerson) {
        personSpan.textContent = mostPerson;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function isLatestWasteKeeper(roommateName) {
    return getLatestWasteKeeper() === roommateName;
}

function isMostWasteKeeper(roommateName) {
    return getMostWasteKeeper() === roommateName;
}

function getLatestWasteKeeper() {
    let latestPerson = null;
    let latestDate = null;

    CONFIG.ROOMMATES.forEach(roommate => {
        const data = roommateData[roommate];
        if (data.lastDate) {
            const dateObj = parseDate(data.lastDate);
            if (!latestDate || dateObj > latestDate) {
                latestDate = dateObj;
                latestPerson = roommate;
            }
        }
    });

    return latestPerson;
}

function getMostWasteKeeper() {
    let mostPerson = null;
    let highestCount = 0;

    CONFIG.ROOMMATES.forEach(roommate => {
        const data = roommateData[roommate];
        if (data.count > highestCount) {
            highestCount = data.count;
            mostPerson = roommate;
        }
    });

    // If there's a tie, return the first person alphabetically
    if (highestCount > 0) {
        const tiedPersons = CONFIG.ROOMMATES.filter(roommate => 
            roommateData[roommate].count === highestCount
        );
        return tiedPersons.sort()[0];
    }

    return null;
}

// Water Bottle Indicator Functions
function updateWaterLatestIndicator() {
    const latestTrip = getLatestWaterTrip();
    const badge = document.getElementById('waterLatestBadge');
    const personSpan = document.getElementById('waterLatestPerson');
    
    if (latestTrip) {
        personSpan.textContent = `${latestTrip.person1} & ${latestTrip.person2}`;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function updateWaterMostIndicator() {
    const mostPerson = getMostWaterTripPerson();
    const badge = document.getElementById('waterMostBadge');
    const personSpan = document.getElementById('waterMostPerson');
    
    if (mostPerson) {
        personSpan.textContent = mostPerson;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function getLatestWaterTrip() {
    if (waterTripData.length === 0) return null;
    
    return waterTripData.reduce((latest, trip) => {
        const tripDate = parseDate(trip.date);
        const latestDate = latest ? parseDate(latest.date) : null;
        
        if (!latestDate || tripDate > latestDate) {
            return trip;
        }
        return latest;
    }, null);
}

function getMostWaterTripPerson() {
    const tripCounts = {};
    
    // Count trips for each person
    waterTripData.forEach(trip => {
        tripCounts[trip.person1] = (tripCounts[trip.person1] || 0) + 1;
        tripCounts[trip.person2] = (tripCounts[trip.person2] || 0) + 1;
    });
    
    // Find person with most trips
    let mostPerson = null;
    let highestCount = 0;
    
    Object.entries(tripCounts).forEach(([person, count]) => {
        if (count > highestCount) {
            highestCount = count;
            mostPerson = person;
        }
    });
    
    return mostPerson;
}

// Date utility functions
function parseDate(dateString) {
    // Handle DD/MM/YYYY format
    const parts = dateString.split('/');
    if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JavaScript months are 0-based
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }
    return new Date(dateString);
}

function formatDate(dateString) {
    const date = parseDate(dateString);
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

function formatDateForSheet(dateInput) {
    const date = new Date(dateInput);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    
    return `${day}/${month}/${year}`;
}

// Modal functions
function openUpdateModal(roommateName) {
    if (!isSignedIn) {
        showError('Please sign in to update waste disposal records');
         window.alert("Please sign in to update");
      //  document.getElementById('authButton').click();
        return;
    }
    
    currentUpdatingPerson = roommateName;
    const modal = document.getElementById('updateModal');
    const dateInput = document.getElementById('wasteDate');
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    
    modal.style.display = 'block';
    dateInput.focus();
}

function closeUpdateModal() {
    const modal = document.getElementById('updateModal');
    modal.style.display = 'none';
    currentUpdatingPerson = null;
    
    // Reset form
    document.getElementById('wasteDate').value = '';
}

// Water Bottle Modal Functions
function openWaterUpdateModal() {
    if (!isSignedIn) {
        showError('Please sign in to record water bottle trips');
         window.alert("Please sign in to update");
        // document.getElementById('authButton').click();
        return;
    }
    
    const modal = document.getElementById('waterModal');
    const dateInput = document.getElementById('waterDate');
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    
    modal.style.display = 'block';
    dateInput.focus();
}

function closeWaterModal() {
    const modal = document.getElementById('waterModal');
    modal.style.display = 'none';
    
    // Reset form
    document.getElementById('waterDate').value = '';
    document.getElementById('person1').value = '';
    document.getElementById('person2').value = '';
}

// Cleaning Modal Functions
function openCleaningUpdateModal() {
    if (!isSignedIn) {
        showError('Please sign in to record cleaning sessions');
         window.alert("Please sign in to update");
        // document.getElementById('authButton').click();
        return;
    }
    
    const modal = document.getElementById('cleaningModal');
    const dateInput = document.getElementById('cleaningDate');
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    
    modal.style.display = 'block';
    dateInput.focus();
}

function closeCleaningModal() {
    const modal = document.getElementById('cleaningModal');
    modal.style.display = 'none';
    
    // Reset form
    document.getElementById('cleaningDate').value = '';
    document.getElementById('cleaningPerson').value = '';
    document.getElementById('cleaningLocation').value = '';
}

// Event listeners
function setupEventListeners() {
    // Modal close events
    const modal = document.getElementById('updateModal');
    const closeBtn = document.querySelector('.close');
    
    closeBtn.onclick = closeUpdateModal;
    
    // Water modal close events
    const waterModal = document.getElementById('waterModal');
    const waterCloseBtn = document.querySelector('.close-water');
    
    waterCloseBtn.onclick = closeWaterModal;
    
    // Cleaning modal close events
    const cleaningModal = document.getElementById('cleaningModal');
    const cleaningCloseBtn = document.querySelector('.close-cleaning');
    
    cleaningCloseBtn.onclick = closeCleaningModal;
    
    window.onclick = function(event) {
        if (event.target === modal) {
            closeUpdateModal();
        }
        if (event.target === waterModal) {
            closeWaterModal();
        }
        if (event.target === cleaningModal) {
            closeCleaningModal();
        }
    };
    
    // Update buttons
    document.getElementById('updateBtn').addEventListener('click', handleUpdate);
    document.getElementById('waterUpdateBtn').addEventListener('click', handleWaterUpdate);
    document.getElementById('cleaningUpdateBtn').addEventListener('click', handleCleaningUpdate);
    
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            switchTab(tab);
        });
    });
    
    // Refresh button
    document.getElementById('refreshBtn').addEventListener('click', async () => {
        showLoading(true);
        try {
            await loadDataFromSheets();
            renderRoommateCards();
            renderWaterTrips();
            renderWaterRoommateCards();
            renderCleaningHistory();
            renderCleaningRoommateCards();
            updateLatestIndicator();
            updateMostIndicator();
            updateWaterLatestIndicator();
            updateWaterMostIndicator();
            updateCleaningLatestIndicator();
            updateCleaningMostIndicator();
            showSuccess('Data refreshed successfully!');
        } catch (error) {
            console.error('Error refreshing data:', error);
            showError('Failed to refresh data. Please try again.');
        } finally {
            showLoading(false);
        }
    });
}

function getDeviceDetails() {
    const ua = navigator.userAgent;
    let device = 'Unknown Device';
    if (/android/i.test(ua)) device = 'Android';
    else if (/iPad|iPhone|iPod/.test(ua)) device = 'iOS';
    else if (/Windows/i.test(ua)) device = 'Windows';
    else if (/Macintosh/i.test(ua)) device = 'Mac';
    else if (/Linux/i.test(ua)) device = 'Linux';
    return `${device} | ${ua}`;
}

async function handleUpdate() {
    const dateInput = document.getElementById('wasteDate');
    
    if (!dateInput.value) {
        showError('Please select a date.');
        return;
    }
    
    if (!currentUpdatingPerson) {
        showError('No person selected for update.');
        return;
    }
    
    try {
        showLoading(true);
        
        const formattedDate = formatDateForSheet(dateInput.value);
        
        // Update local data
        const personData = roommateData[currentUpdatingPerson];
        personData.dates.push(formattedDate);
        personData.count++;
        personData.lastDate = formattedDate;

        // Add reward points
        await updateRewardsSheet(currentUpdatingPerson, 'waste', CONFIG.REWARDS.WASTE_POINTS, formattedDate);
        
        // Update the Google Sheet
        await updateGoogleSheet(currentUpdatingPerson, formattedDate);
        
        // Send email notification
        const emailSent = await sendWasteUpdateEmail(currentUpdatingPerson, formattedDate);
        if (!emailSent) {
            console.warn('Failed to send email notification');
        }
        
        // Log the action to the Logger sheet
        const deviceDetails = getDeviceDetails();
        console.log('Logging action for device:', deviceDetails);
        await logUserActionToSheet(deviceDetails, `Updated waste date for ${currentUpdatingPerson} to ${formattedDate}`);
        
        // Refresh UI
        renderRoommateCards();
        updateLatestIndicator();
        updateMostIndicator();
        
        closeUpdateModal();
        showSuccess(`Waste disposal date updated successfully!`);
        
    } catch (error) {
        console.error('Error updating data:', error);
        showError('Failed to update data. Please try again.');
    } finally {
        showLoading(false);
    }
}

async function updateGoogleSheet(roommateName, dateValue) {
    if (!isSignedIn) {
        window.alert("Please sign in to update");
        throw new Error('Please sign in to add entries');
    }
    
    try {
        const authToken = getAuthToken();
        if (!authToken) {
            throw new Error('No authentication token available');
        }
        
        // Find the next empty row in the waste sheet
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.WASTE_SHEET}?access_token=${authToken}`
        );
        
        if (!response.ok) {
            throw new Error(`Failed to read sheet: ${response.status}`);
        }
        
        const data = await response.json();
        const nextRow = data.values ? data.values.length + 1 : 2;
        
        // Create the row data
        const roommateIndex = CONFIG.ROOMMATES.indexOf(roommateName);
        const rowData = new Array(CONFIG.ROOMMATES.length + 1).fill('');
        rowData[0] = nextRow - 1; // Row number
        rowData[roommateIndex + 1] = dateValue;
        
        // Append the row
        const appendResponse = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.WASTE_SHEET}:append?valueInputOption=USER_ENTERED&access_token=${authToken}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: [rowData]
                })
            }
        );
        
        if (!appendResponse.ok) {
            throw new Error(`Failed to update sheet: ${appendResponse.status}`);
        }
        
        console.log(`Successfully updated ${roommateName} in Google Sheets`);
    } catch (error) {
        console.error('Error updating Google Sheet:', error);
        throw error;
    }
}

async function updateWaterSheet(dateValue, timeValue, person1, person2) {
    if (!isSignedIn) {
        window.alert("Please sign in to update");
        throw new Error('Please sign in to add entries');
    }
    
    try {
        const authToken = getAuthToken();
        if (!authToken) {
            throw new Error('No authentication token available');
        }
        
        const rowData = [dateValue, timeValue || '', person1, person2];
        
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.WATER_SHEET}:append?valueInputOption=USER_ENTERED&access_token=${authToken}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: [rowData]
                })
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to update water sheet: ${response.status}`);
        }
        
        console.log(`Successfully added water trip to Google Sheets`);
    } catch (error) {
        console.error('Error updating water sheet:', error);
        throw error;
    }
}

async function updateCleaningSheet(dateValue, timeValue, person, location) {
    if (!isSignedIn) {
        window.alert("Please sign in to update");
        throw new Error('Please sign in to add entries');
    }
    
    try {
        const authToken = getAuthToken();
        if (!authToken) {
            throw new Error('No authentication token available');
        }
        
        const rowData = [dateValue, timeValue || '', person, location];
        
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${CONFIG.CLEANING_SHEET}:append?valueInputOption=USER_ENTERED&access_token=${authToken}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    values: [rowData]
                })
            }
        );
        
        if (!response.ok) {
            throw new Error(`Failed to update cleaning sheet: ${response.status}`);
        }
        
        console.log(`Successfully added cleaning session to Google Sheets`);
    } catch (error) {
        console.error('Error updating cleaning sheet:', error);
        throw error;
    }
}

async function logUserActionToSheet(username, action) {
    const now = new Date();
    const date = now.toLocaleDateString();
    const time = now.toLocaleTimeString();
    const values = [[username, action, date, time]];
    const loggerSheet = 'Logger!A:D'; // Make sure you have a sheet named 'Logger' with columns: Username, Action, Date, Time

    try {
        const response = await fetch(
            `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${loggerSheet}:append?valueInputOption=USER_ENTERED&key=${CONFIG.API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({ values })
            }
        );
        if (!response.ok) {
            throw new Error(`Logger sheet append failed: ${response.status}`);
        }
        console.log('User action logged to Logger sheet:', { username, action, date, time });
    } catch (error) {
        console.error('Failed to log user action:', error);
    }
}

// Fetch user email from Google UserInfo API
async function fetchUserEmailFromGoogle() {
    if (!accessToken) {
        console.error('No access token available for fetching user email');
        return null;
    }
    try {
        const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        console.log('UserInfo API Response status:', userInfoResponse.status);
        
        if (!userInfoResponse.ok) {
            throw new Error(`Failed to fetch user info: ${userInfoResponse.status}`);
        }
        
        const userInfo = await userInfoResponse.json();
        console.log('UserInfo API Response:', userInfo);
        
        if (userInfo.email) {
            console.log('Successfully fetched email from UserInfo API:', userInfo.email);
            return userInfo.email;
        }
        
        throw new Error('No email found in UserInfo API response');
    } catch (error) {
        console.error('Error fetching user email:', error);
        return null;
    }
}

// UI utility functions
function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.style.display = show ? 'flex' : 'none';
}

function showError(message) {
    // Remove existing error messages
    const existingErrors = document.querySelectorAll('.error');
    existingErrors.forEach(error => error.remove());
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    
    const container = document.querySelector('.container');
    container.insertBefore(errorDiv, container.firstChild);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

function showSuccess(message) {
    // Remove existing success messages
    const existingSuccess = document.querySelectorAll('.success');
    existingSuccess.forEach(success => success.remove());
    
    const successDiv = document.createElement('div');
    successDiv.className = 'success';
    successDiv.textContent = message;
    
    const container = document.querySelector('.container');
    container.insertBefore(successDiv, container.firstChild);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// Tab switching function
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

// Water bottle update handler
async function handleWaterUpdate() {
    const dateInput = document.getElementById('waterDate');
    const person1Select = document.getElementById('person1');
    const person2Select = document.getElementById('person2');
    
    if (!dateInput.value) {
        showError('Please select a date.');
        return;
    }
    
    if (!person1Select.value || !person2Select.value) {
        showError('Please select both people.');
        return;
    }
    
    if (person1Select.value === person2Select.value) {
        showError('Please select two different people.');
        return;
    }
    
    try {
        showLoading(true);
        
        const formattedDate = formatDateForSheet(dateInput.value);
        const newTrip = {
            date: formattedDate.split(' ')[0], // Just the date part
            person1: person1Select.value,
            person2: person2Select.value,
            id: Date.now() // Simple ID generation
        };

        // Add reward points for both participants
        await Promise.all([
            updateRewardsSheet(person1Select.value, 'water', CONFIG.REWARDS.WATER_POINTS, formattedDate),
            updateRewardsSheet(person2Select.value, 'water', CONFIG.REWARDS.WATER_POINTS, formattedDate)
        ]);
        
        // Add to water trip data
        waterTripData.push(newTrip);
        
        // Update the Google Sheet
        await updateWaterSheet(newTrip.date, newTrip.time, newTrip.person1, newTrip.person2);

        // Send email notification
        const emailSent = await sendWaterUpdateEmail(newTrip.person1, newTrip.person2, newTrip.date);
        if (!emailSent) {
            console.warn('Failed to send email notification');
        }
        
        const deviceDetails = getDeviceDetails();
        console.log('Logging action for device:', deviceDetails);
        // Log the action to the Logger sheet
        await logUserActionToSheet(deviceDetails, `Added water trip: ${newTrip.person1} & ${newTrip.person2} on ${newTrip.date}`);
        
        // Refresh UI
        renderWaterTrips();
        renderWaterRoommateCards();
        updateWaterLatestIndicator();
        updateWaterMostIndicator();
        
        closeWaterModal();
        showSuccess(`Water bottle trip added successfully! ${newTrip.person1} & ${newTrip.person2} on ${newTrip.date}`);
        
    } catch (error) {
        console.error('Error updating water trip:', error);
        showError('Failed to add water trip. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Cleaning update handler
async function handleCleaningUpdate() {
    const dateInput = document.getElementById('cleaningDate');
    const personSelect = document.getElementById('cleaningPerson');
    const locationSelect = document.getElementById('cleaningLocation');
    
    if (!dateInput.value) {
        showError('Please select a date.');
        return;
    }
    
    if (!personSelect.value) {
        showError('Please select a person.');
        return;
    }
    
    if (!locationSelect.value) {
        showError('Please select a location.');
        return;
    }
    
    try {
        showLoading(true);
        
        const formattedDate = formatDateForSheet(dateInput.value);
        const newSession = {
            date: formattedDate.split(' ')[0], // Just the date part
            person: personSelect.value,
            location: locationSelect.value,
            id: Date.now() // Simple ID generation
        };

        // Add reward points
        await updateRewardsSheet(personSelect.value, 'cleaning', CONFIG.REWARDS.CLEANING_POINTS, formattedDate);
        
        // Add to cleaning data
        cleaningData.push(newSession);
        
        // Update the Google Sheet
        await updateCleaningSheet(newSession.date, newSession.time, newSession.person, newSession.location);

        // Send email notification
        const emailSent = await sendCleaningUpdateEmail(newSession.person, newSession.location, newSession.date);
        if (!emailSent) {
            console.warn('Failed to send email notification');
        }
        
        const deviceDetails = getDeviceDetails();
        console.log('Logging action for device:', deviceDetails);
        // Log the action to the Logger sheet
        await logUserActionToSheet(deviceDetails, `Added cleaning session: ${newSession.person} cleaned ${newSession.location} on ${newSession.date}`);
        
        // Refresh UI
        renderCleaningHistory();
        renderCleaningRoommateCards();
        updateCleaningLatestIndicator();
        updateCleaningMostIndicator();
        
        closeCleaningModal();
        showSuccess(`Cleaning session added successfully! ${newSession.person} cleaned ${newSession.location} on ${newSession.date}`);
        
    } catch (error) {
        console.error('Error updating cleaning session:', error);
        showError('Failed to add cleaning session. Please try again.');
    } finally {
        showLoading(false);
    }
}

// Make functions global for onclick handlers


window.openUpdateModal = openUpdateModal;
window.openWaterUpdateModal = openWaterUpdateModal;
window.openCleaningUpdateModal = openCleaningUpdateModal;

