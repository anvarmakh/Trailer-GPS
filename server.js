require('dotenv').config();

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const xml2js = require('xml2js');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// =============================================================================
// ENVIRONMENT-BASED CONFIGURATION
// =============================================================================

// Use environment variables for sensitive data
const SPIREON_ACCOUNTS = [
    {
        name: process.env.SPIREON_NRG_NAME || 'NRG Trucking (4477006)',
        apiKey: process.env.SPIREON_NRG_API_KEY || '09cb8341-335b-40db-9fe2-8634d8950cc7',
        username: process.env.SPIREON_NRG_USERNAME || 'Spireonintegration2@nrgtrucking.com',
        password: process.env.SPIREON_NRG_PASSWORD || 'NRG75#$Trkg',
        baseURL: process.env.SPIREON_BASE_URL || 'https://services.spireon.com/v0/rest',
        nspireId: process.env.SPIREON_NRG_NSPIRE_ID || '4477006'
    },
    {
        name: process.env.SPIREON_GREENWAY_NAME || 'Greenway Carriers Corp',
        apiKey: process.env.SPIREON_GREENWAY_API_KEY || '90ee826b-4a92-4660-a548-6e48674b3a79',
        username: process.env.SPIREON_GREENWAY_USERNAME || 'Spireonintegration@gwaycarriers.com',
        password: process.env.SPIREON_GREENWAY_PASSWORD || 'GreenW49&%Carr',
        baseURL: process.env.SPIREON_BASE_URL || 'https://services.spireon.com/v0/rest',
        nspireId: process.env.SPIREON_GREENWAY_NSPIRE_ID || '3526665'
    },
    {
        name: process.env.SPIREON_NRG2_NAME || 'NRG Trucking (1209155)',
        apiKey: process.env.SPIREON_NRG2_API_KEY || '262e9cd0-aea6-4f68-9568-44d545cdd8f9',
        username: process.env.SPIREON_NRG2_USERNAME || 'Spireonintegration@nrgtrucking.com',
        password: process.env.SPIREON_NRG2_PASSWORD || 'NR48%$Gtruck',
        baseURL: process.env.SPIREON_BASE_URL || 'https://services.spireon.com/v0/rest',
        nspireId: process.env.SPIREON_NRG2_NSPIRE_ID || '1209155'
    }
].filter(account => account.apiKey && account.username && account.password);

// SkyBitz accounts - NRG account only for now
const SKYBITZ_ACCOUNTS = [
    {
        name: process.env.SKYBITZ_NRG_NAME || 'NRG Trucking (SkyBitz)',
        username: process.env.SKYBITZ_NRG_USERNAME || 'XmL!DiTaT!12103',
        password: process.env.SKYBITZ_NRG_PASSWORD || 'i958fCYcczDqsDV',
        baseURL: process.env.SKYBITZ_BASE_URL || 'https://xml.skybitz.com:9443',
        company: 'NRG Trucking'
    }
].filter(account => account.username && account.password);

// =============================================================================
// SETTINGS DATA STORAGE
// =============================================================================

let companySettings = {
    name: process.env.COMPANY_NAME || 'NRG Trucking',
    color: process.env.COMPANY_COLOR || '#2563eb',
    address: process.env.COMPANY_ADDRESS || '123 Fleet Street, Transportation City, TX 75001',
    email: process.env.COMPANY_EMAIL || 'fleet@nrgtrucking.com',
    phone: process.env.COMPANY_PHONE || '+1 (555) 123-4567'
};

let gpsProviders = [
    {
        id: 1,
        name: SPIREON_ACCOUNTS[0]?.name || 'NRG Trucking (4477006)',
        type: 'spireon',
        status: 'connected',
        lastSync: new Date(Date.now() - 5 * 60 * 1000),
        trailerCount: 45,
        config: SPIREON_ACCOUNTS[0] || {}
    },
    {
        id: 2,
        name: SKYBITZ_ACCOUNTS[0]?.name || 'NRG Trucking (SkyBitz)',
        type: 'skybitz',
        status: 'connected',
        lastSync: new Date(Date.now() - 3 * 60 * 1000),
        trailerCount: 23,
        config: SKYBITZ_ACCOUNTS[0] || {}
    }
].filter(provider => provider.config && Object.keys(provider.config).length > 0);

let trailersData = [];
let lastUpdate = null;

// =============================================================================
// HEALTH CHECK ENDPOINT FOR RAILWAY
// =============================================================================

app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date(),
        environment: process.env.NODE_ENV || 'development',
        port: PORT,
        trailers: trailersData.length,
        lastUpdate: lastUpdate,
        providers: {
            spireon: SPIREON_ACCOUNTS.length,
            skybitz: SKYBITZ_ACCOUNTS.length
        }
    });
});

// =============================================================================
// COMPANY SETTINGS API ROUTES
// =============================================================================

app.get('/api/company/profile', (req, res) => {
    try {
        res.json({
            success: true,
            data: companySettings
        });
    } catch (error) {
        console.error('Error getting company profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get company profile'
        });
    }
});

app.put('/api/company/profile', (req, res) => {
    try {
        const { name, color, address, email, phone } = req.body;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Company name is required'
            });
        }
        
        if (color && !/^#[0-9A-F]{6}$/i.test(color)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid color format. Use hex format (#RRGGBB)'
            });
        }
        
        companySettings = {
            ...companySettings,
            name: name.trim(),
            color: color || companySettings.color,
            address: address?.trim() || companySettings.address,
            email: email?.trim() || companySettings.email,
            phone: phone?.trim() || companySettings.phone,
            updatedAt: new Date()
        };
        
        console.log('📝 Company profile updated:', companySettings.name);
        
        res.json({
            success: true,
            data: companySettings,
            message: 'Company profile updated successfully'
        });
    } catch (error) {
        console.error('Error updating company profile:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update company profile'
        });
    }
});

// =============================================================================
// GPS PROVIDERS API ROUTES  
// =============================================================================

app.get('/api/providers', (req, res) => {
    try {
        const safeProviders = gpsProviders.map(provider => ({
            id: provider.id,
            name: provider.name,
            type: provider.type,
            status: provider.status,
            lastSync: provider.lastSync,
            trailerCount: provider.trailerCount,
            hasConfig: !!provider.config
        }));
        
        res.json({
            success: true,
            data: safeProviders
        });
    } catch (error) {
        console.error('Error getting providers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get providers'
        });
    }
});

// =============================================================================
// GPS PROVIDER INTEGRATION (EXISTING CODE WITH ERROR IMPROVEMENTS)
// =============================================================================

class SkyBitzProvider {
    constructor(account) {
        this.account = account;
        this.baseURL = account.baseURL;
        this.username = account.username;
        this.password = account.password;
        this.company = account.company;
    }

    formatSkyBitzDate(date) {
        const d = new Date(date);
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                       'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = months[d.getUTCMonth()];
        const year = d.getUTCFullYear();
        const hour = String(d.getUTCHours()).padStart(2, '0');
        const minute = String(d.getUTCMinutes()).padStart(2, '0');
        const second = String(d.getUTCSeconds()).padStart(2, '0');
        
        return `${day}/${month}/${year}-${hour}:${minute}:${second}`;
    }

    parseTimestamp(timeStr) {
        if (!timeStr) return new Date();
        
        try {
            const [datePart, timePart] = timeStr.split(' ');
            const [year, month, day] = datePart.split('/');
            const [hour, minute, second] = timePart.split(':');
            
            return new Date(Date.UTC(
                parseInt(year),
                parseInt(month) - 1,
                parseInt(day),
                parseInt(hour),
                parseInt(minute),
                parseInt(second)
            ));
        } catch (error) {
            console.warn('Failed to parse SkyBitz timestamp:', timeStr);
            return new Date();
        }
    }

    async queryPositions() {
        try {
            console.log(`📡 Fetching ${this.account.name} data...`);
            
            const queries = [
                {
                    customer: this.username,
                    password: this.password,
                    assetid: 'ALL',
                    version: '2.67'
                },
                {
                    customer: this.username,
                    password: this.password,
                    assetid: 'ALL'
                }
            ];

            for (let i = 0; i < queries.length; i++) {
                for (let retry = 0; retry < 3; retry++) {
                    try {
                        if (retry > 0) {
                            const delay = Math.pow(2, retry) * 2000;
                            console.log(`   ⏳ Retry ${retry + 1}/3 - waiting ${delay}ms...`);
                            await new Promise(resolve => setTimeout(resolve, delay));
                        }

                        const params = new URLSearchParams(queries[i]);
                        const url = `${this.baseURL}/QueryPositions?${params.toString()}`;
                        
                        const response = await axios.get(url, {
                            timeout: 30000,
                            headers: {
                                'User-Agent': 'GPS-Fleet-Management/1.0'
                            }
                        });

                        const trailers = await this.parseXMLResponse(response.data);
                        
                        if (trailers.length > 0) {
                            console.log(`   ✅ ${this.account.name}: ${trailers.length} trailers found`);
                            return trailers;
                        }
                        break;
                    } catch (queryError) {
                        if (queryError.message && queryError.message.includes('97')) {
                            console.log(`   ⚠️  Rate limited - retry ${retry + 1}/3`);
                            if (retry === 2) {
                                console.log(`   ❌ Rate limited after all retries`);
                            }
                            continue;
                        } else {
                            console.log(`   ❌ Query failed:`, queryError.message);
                            break;
                        }
                    }
                }
            }
            
            return [];

        } catch (error) {
            console.error(`   ❌ ${this.account.name} Error:`, error.message);
            return [];
        }
    }

    async parseXMLResponse(xmlData) {
        try {
            const parser = new xml2js.Parser({
                explicitArray: false,
                ignoreAttrs: true,
                parseNumbers: false,
                parseBooleans: false
            });

            const result = await parser.parseStringPromise(xmlData);
            
            if (result.skybitz && result.skybitz.e && result.skybitz.e !== '0') {
                throw new Error(`SkyBitz API Error Code: ${result.skybitz.e}`);
            }

            if (!result.skybitz || !result.skybitz.gls) {
                return [];
            }

            const glsData = Array.isArray(result.skybitz.gls) 
                ? result.skybitz.gls 
                : [result.skybitz.gls];

            const processedTrailers = glsData.map((gls, index) => {
                const asset = gls.asset || {};
                const speedKmh = gls.speed ? parseFloat(gls.speed) : 0;
                const speedMph = speedKmh * 0.621371;
                
                return {
                    id: `${this.account.name.replace(/\s+/g, '')}-${asset.assetid || gls.mtsn || index}`,
                    provider: 'SkyBitz',
                    account: 'NRG Trucking',
                    latitude: gls.latitude ? parseFloat(gls.latitude) : 0,
                    longitude: gls.longitude ? parseFloat(gls.longitude) : 0,
                    speed: Math.round(speedMph * 10) / 10,
                    status: speedMph > 5 ? 'Moving' : 'Parked',
                    lastUpdate: this.parseTimestamp(gls.time),
                    driver: this.extractDriver(gls),
                    deviceId: gls.mtsn || asset.assetid || 'unknown',
                    originalId: asset.assetid || gls.mtsn || 'unknown',
                    make: asset.assettype || 'Unknown',
                    model: gls.devicetype || 'Unknown',
                    year: null,
                    vin: null,
                    odometer: gls.totaldevicemileage ? parseFloat(gls.totaldevicemileage) : null,
                    address: this.extractAddress(gls),
                    company: 'NRG Trucking'
                };
            }).filter(trailer => {
                const hasValidLat = !isNaN(trailer.latitude) && trailer.latitude !== 0;
                const hasValidLng = !isNaN(trailer.longitude) && trailer.longitude !== 0;
                return hasValidLat && hasValidLng;
            });
            
            return processedTrailers;

        } catch (error) {
            console.error('SkyBitz XML parsing error:', error);
            return [];
        }
    }

    extractDriver(gls) {
        if (gls.asset && gls.asset.owner) {
            return gls.asset.owner;
        }
        return 'Unknown';
    }

    extractAddress(gls) {
        if (gls.landmark) {
            const parts = [];
            if (gls.landmark.geoname) parts.push(gls.landmark.geoname);
            if (gls.landmark.state) parts.push(gls.landmark.state);
            return parts.join(', ') || 'Unknown';
        }
        return 'Unknown';
    }
}

async function fetchSpireonAccount(account) {
    try {
        console.log(`📡 Fetching ${account.name} data...`);
        
        const basicAuth = Buffer.from(`${account.username}:${account.password}`).toString('base64');
        
        const response = await axios.get(`${account.baseURL}/assets`, {
            headers: {
                'Authorization': `Basic ${basicAuth}`,
                'X-Nspire-AppToken': account.apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 15000
        });

        const assets = response.data.content || response.data || [];
        
        const processedTrailers = assets.map(asset => ({
            id: `${account.name.replace(/\s+/g, '')}-${asset.id}`,
            provider: 'Spireon',
            account: account.name,
            latitude: parseFloat(asset.lastLocation?.lat),
            longitude: parseFloat(asset.lastLocation?.lng),
            speed: parseFloat(asset.speed) || 0,
            status: asset.status === 'Moving' || asset.status === 'Driving' ? 'Moving' : 'Parked',
            lastUpdate: new Date(asset.locationLastReported || asset.lastUpdated || Date.now()),
            driver: asset.driverName || asset.operatorName || 'Unknown',
            deviceId: asset.instrumentationRef?.deviceId || asset.id,
            originalId: asset.name || asset.id,
            make: asset.make,
            model: asset.model,
            year: asset.year,
            vin: asset.vin,
            odometer: asset.odometer,
            address: asset.lastLocation?.address ? 
                `${asset.lastLocation.address.city}, ${asset.lastLocation.address.stateOrProvince}` : 
                'Unknown'
        })).filter(trailer => 
            !isNaN(trailer.latitude) && !isNaN(trailer.longitude) &&
            trailer.latitude !== 0 && trailer.longitude !== 0
        );
        
        console.log(`   ✅ ${account.name}: ${processedTrailers.length} trailers with GPS data`);
        return processedTrailers;
        
    } catch (error) {
        console.error(`   ❌ ${account.name} Error:`, error.message);
        return [];
    }
}

async function updateTrailerData() {
    console.log('\n🔄 Updating trailer data from all providers...');
    
    let allTrailers = [];
    
    // Process Spireon accounts
    for (let i = 0; i < SPIREON_ACCOUNTS.length; i++) {
        const account = SPIREON_ACCOUNTS[i];
        
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        const accountTrailers = await fetchSpireonAccount(account);
        allTrailers.push(...accountTrailers);
    }
    
    // Process SkyBitz accounts
    if (SKYBITZ_ACCOUNTS.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    for (let i = 0; i < SKYBITZ_ACCOUNTS.length; i++) {
        const account = SKYBITZ_ACCOUNTS[i];
        
        if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        const skyBitzProvider = new SkyBitzProvider(account);
        const accountTrailers = await skyBitzProvider.queryPositions();
        allTrailers.push(...accountTrailers);
    }
    
    trailersData = allTrailers;
    lastUpdate = new Date();
    
    console.log(`📊 Updated: ${trailersData.length} total trailers`);
    
    // Log provider summary
    const providerSummary = {};
    trailersData.forEach(trailer => {
        const key = `${trailer.provider} - ${trailer.account}`;
        providerSummary[key] = (providerSummary[key] || 0) + 1;
    });
    
    Object.entries(providerSummary).forEach(([provider, count]) => {
        console.log(`   • ${provider}: ${count} trailers`);
    });
}

// =============================================================================
// API ROUTES
// =============================================================================

app.get('/api/trailers', (req, res) => {
    try {
        const { search } = req.query;
        
        let filteredData = trailersData;
        
        if (search) {
            const searchLower = search.toLowerCase();
            filteredData = trailersData.filter(trailer => 
                trailer.originalId?.toLowerCase().includes(searchLower) ||
                trailer.driver?.toLowerCase().includes(searchLower) ||
                trailer.account?.toLowerCase().includes(searchLower) ||
                trailer.provider?.toLowerCase().includes(searchLower)
            );
        }
        
        res.json({
            success: true,
            data: filteredData,
            lastUpdate: lastUpdate,
            count: filteredData.length
        });
    } catch (error) {
        console.error('Error in /api/trailers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get trailers data'
        });
    }
});

app.get('/api/stats', (req, res) => {
    try {
        const stats = {
            total: trailersData.length,
            moving: trailersData.filter(t => t.status === 'Moving').length,
            parked: trailersData.filter(t => t.status === 'Parked').length,
            providers: {},
            accounts: {}
        };
        
        trailersData.forEach(trailer => {
            stats.providers[trailer.provider] = (stats.providers[trailer.provider] || 0) + 1;
            stats.accounts[trailer.account] = (stats.accounts[trailer.account] || 0) + 1;
        });
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('Error in /api/stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get statistics'
        });
    }
});

app.post('/api/refresh', async (req, res) => {
    try {
        await updateTrailerData();
        res.json({
            success: true,
            message: 'Data refreshed successfully',
            count: trailersData.length,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error in /api/refresh:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to refresh data'
        });
    }
});

app.get('/api/test-skybitz', async (req, res) => {
    try {
        console.log('🧪 Testing SkyBitz connection...');
        
        const results = [];
        for (const account of SKYBITZ_ACCOUNTS) {
            try {
                const provider = new SkyBitzProvider(account);
                const trailers = await provider.queryPositions();
                
                results.push({
                    account: account.name,
                    success: true,
                    count: trailers.length
                });
            } catch (accountError) {
                results.push({
                    account: account.name,
                    success: false,
                    error: accountError.message,
                    count: 0
                });
            }
        }
        
        res.json({
            success: results.some(r => r.success),
            message: `SkyBitz test completed. ${results.filter(r => r.success).length}/${results.length} accounts successful`,
            results: results,
            totalTrailers: results.reduce((sum, r) => sum + r.count, 0)
        });
    } catch (error) {
        console.error('🧪 Test error:', error);
        res.status(500).json({
            success: false,
            error: 'SkyBitz connection test failed',
            message: error.message
        });
    }
});

// =============================================================================
// PAGE ROUTES
// =============================================================================

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/trailers', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'trailers.html'));
});

// =============================================================================
// ERROR HANDLING MIDDLEWARE
// =============================================================================

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    process.exit(0);
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, async () => {
    console.log('🚛 GPS Fleet Management Platform - Railway Deployment');
    console.log('='.repeat(60));
    console.log(`📍 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📡 Spireon Accounts: ${SPIREON_ACCOUNTS.length}`);
    console.log(`📡 SkyBitz Accounts: ${SKYBITZ_ACCOUNTS.length}`);
    console.log('='.repeat(60));
    
    console.log('\n🚀 Starting initial data load...');
    await updateTrailerData();
    
    console.log(`\n✅ Server ready with ${trailersData.length} trailers loaded!`);
    
    // Auto-refresh every 10 minutes
    setInterval(updateTrailerData, 10 * 60 * 1000);
    console.log('🔄 Auto-refresh enabled: every 10 minutes');
});

module.exports = app;