function onOpenCvReady() {
    console.log("OpenCV Engine Loaded Successfully.");
    const badge = document.getElementById('vision_engine_badge');
    if(badge) { 
        badge.innerText = "Engine: OpenCV Ready"; 
        badge.className = "status-badge badge-ready"; 
    }
    const btn = document.getElementById('extractFeaturesBtn');
    if(btn) btn.disabled = false;
    document.getElementById('status_text').innerText = "Status: Vision Engines Online. Ready.";
}

function onOpenCvError() {
    const badge = document.getElementById('vision_engine_badge');
    if(badge) { 
        badge.innerText = "Engine: Core Offline"; 
        badge.style.backgroundColor = "#e74c3c"; 
    }
    document.getElementById('status_text').innerText = "Status: Failed to load OpenCV Vision scripts.";
}

// Add this right after proj4 is loaded or inside your DOMContentLoaded block
function registerZambianProjections() {
    // Arc 1950 / UTM Zone 35S
    proj4.defs("EPSG:20935", "+proj=utm +zone=35 +south +a=6378249.145 +rf=293.4663077 +towgs84=-143,-90,-294,0,0,0,0 +units=m +no_defs +type=crs");
    
    // Arc 1950 / UTM Zone 36S (Covers Lusaka, Copperbelt, Central regions)
    proj4.defs("EPSG:20936", "+proj=utm +zone=36 +south +a=6378249.145 +rf=293.4663077 +towgs84=-143,-90,-294,0,0,0,0 +units=m +no_defs +type=crs");

    // Arc 1950 / LO 29°
    proj4.defs("EPSG:20929", "+proj=tmerc +lat_0=0 +lon_0=29 +k=1 +x_0=0 +y_0=0 +axis=west +a=6378249.145 +rf=293.4663077 +towgs84=-143,-90,-294,0,0,0,0 +units=m +no_defs +type=crs");
}

registerZambianProjections();

let map, mapGeoJsonDisplayLayer;
let activeFeatureCollection = { type: "FeatureCollection", features: [] };
let extractedGeometriesCache = [];
const gisWorker = new Worker('gis-worker.js');

document.addEventListener("DOMContentLoaded", function() {
    map = L.map('map').setView([-15.78, 28.18], 11);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    mapGeoJsonDisplayLayer = L.geoJSON(null, {
        style: { color: '#00a8ff', weight: 3, fillOpacity: 0.25 },
        onEachFeature: function(feature, layer) {
            if (feature.properties && feature.properties.name) {
                layer.bindPopup(`<strong>${feature.properties.name}</strong>`);
            }
        }
    }).addTo(map);

    setupImageLoaderEvents();
});

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOnBackdrop(e, id) { if (e.target.id === id) closeModal(id); }

let imageReadyState = false;
function setupImageLoaderEvents() {
    const imageLoader = document.getElementById('imageLoader');
    const imageSrc = document.getElementById('imageSrc');

    imageLoader.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            imageSrc.onload = function() {
                imageReadyState = true;
                document.getElementById('status_text').innerText = "Status: Image cached in memory.";
            };
            imageSrc.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function processImageFeatures() {
    const imageSrc = document.getElementById('imageSrc');
    if (!imageReadyState || !imageSrc.src) { 
        alert("Please select a valid image file first."); 
        return; 
    }
    
    document.getElementById('loading_spinner').style.display = 'block';
    document.getElementById('status_text').innerText = "Status: Offloading vision calculations to worker thread...";

    try {
        const canvas = document.getElementById('canvasOutput');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        
        canvas.width = imageSrc.naturalWidth || imageSrc.width;
        canvas.height = imageSrc.naturalHeight || imageSrc.height;
        ctx.drawImage(imageSrc, 0, 0);
        
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const mapCenter = map.getCenter();

        gisWorker.postMessage({
            cmd: 'processImage',
            imgData: imgData.data.buffer,
            rows: canvas.height,
            cols: canvas.width,
            centerLng: mapCenter.lng,
            centerLat: mapCenter.lat
        }, [imgData.data.buffer]);
        
    } catch (err) {
        document.getElementById('loading_spinner').style.display = 'none';
        console.error(err);
        alert("Extraction Error: Failed to compile image pixels.");
    }
}

gisWorker.onmessage = function(e) {
    document.getElementById('loading_spinner').style.display = 'none';
    if (e.data.status === 'success') {
        extractedGeometriesCache = e.data.geometries;
        document.getElementById('status_text').innerText = "Status: Extraction complete.";
        openModal('crs_attribute_modal');
    } else {
        alert("Worker Error: " + e.data.message);
    }
};

function commitExtractedFeatures() {
    const selectedCRS = document.getElementById('crs_selector').value;
    const featureName = document.getElementById('attr_feature_name').value || "Extracted Layer";
    
    if (extractedGeometriesCache.length === 0) {
        alert("No geometries detected.");
        closeModal('crs_attribute_modal');
        return;
    }
    
    extractedGeometriesCache.forEach((polyGeometry) => {
		let geoJsonCoordinates = polyGeometry.map(coord => {
		    if (selectedCRS !== "EPSG:4326") {
		        // Converts from selected local CRS (e.g., EPSG:20936) directly to EPSG:4326 WGS84
		        return proj4(selectedCRS, "EPSG:4326", coord);
		    }
		    return coord; 
		});

		activeFeatureCollection.features.push({
		    type: "Feature",
		    id: 'layer_' + Date.now() + '_' + Math.floor(Math.random()*1000),
		    properties: { 
		        name: featureName, 
		        description: featureDesc, 
		        crsContext: selectedCRS, 
		        timestamp: new Date().toLocaleTimeString() 
		    },
		    geometry: { type: "Polygon", coordinates: [geoJsonCoordinates] }
		});
	});

    syncActiveLayersDatabase();
    closeModal('crs_attribute_modal');
}

function syncActiveLayersDatabase() {
    mapGeoJsonDisplayLayer.clearLayers();
    mapGeoJsonDisplayLayer.addData(activeFeatureCollection);
    
    const catalogContainer = document.getElementById('layers_catalog_container');
    catalogContainer.innerHTML = '';

    if(activeFeatureCollection.features.length === 0) {
        catalogContainer.innerHTML = '<div>No layers active.</div>';
        return;
    }

    activeFeatureCollection.features.forEach((feature) => {
        const layerCard = document.createElement('div');
        layerCard.innerHTML = `
            <span>${feature.properties.name}</span>
            <button onclick="removeLayerInstance('${feature.id}')">Delete</button>
        `;
        catalogContainer.appendChild(layerCard);
    });

    if(activeFeatureCollection.features.length > 0) {
        map.fitBounds(mapGeoJsonDisplayLayer.getBounds());
    }
}

function removeLayerInstance(layerId) {
    activeFeatureCollection.features = activeFeatureCollection.features.filter(f => f.id !== layerId);
    syncActiveLayersDatabase();
}

function executeGeocodingSearch() {
    const query = document.getElementById('map_spatial_search_input').value;
    const dropdown = document.getElementById('search_results_dropdown_box');
    const statusText = document.getElementById("status_text");
    if (!query.trim()) return;

    statusText.innerText = "Status: Searching global coordinates records indices...";
    dropdown.innerHTML = '<div class="search-result-item" style="color:#7f8c8d;">Querying spatial addresses server registries...</div>';
    dropdown.style.display = 'block';

    // CORRECTED NOMINATIM ENDPOINT URL:
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`)
        .then(response => {
            if (!response.ok) throw new Error("Network response was not ok");
            return response.json();
        })
        .then(data => {
            dropdown.innerHTML = '';
            if (!data || data.length === 0) {
                dropdown.innerHTML = '<div class="search-result-item" style="color:#e74c3c;">No spatial coordinates matches found.</div>';
                statusText.innerText = "Status: No spatial matches found.";
                return;
            }

            data.forEach(item => {
                const row = document.createElement('div');
                row.className = 'search-result-item';
                row.innerText = item.display_name;
                row.onclick = function() {
                    const lat = parseFloat(item.lat);
                    const lon = parseFloat(item.lon);
                    map.setView([lat, lon], 14);
                    dropdown.style.display = 'none';
                    document.getElementById('map_spatial_search_input').value = item.display_name;
                    statusText.innerText = "Status: Viewport centered over target location.";
                };
                dropdown.appendChild(row);
            });
        })
        .catch(err => {
            console.error("Geocoding Error:", err);
            dropdown.style.display = 'none';
            statusText.innerText = "Status: Geocoding server connectivity error. (Check console)";
        });
}

function triggerImport() { document.getElementById('geoJsonImporter').click(); }

function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(evt) {
        activeFeatureCollection = JSON.parse(evt.target.result);
        syncActiveLayersDatabase();
    };
    reader.readAsText(file);
}

function exportGeoJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeFeatureCollection, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `cadastral_export_${Date.now()}.geojson`;
    a.click();
}