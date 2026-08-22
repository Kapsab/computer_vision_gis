// Keep functional validation markers at the absolute execution header row
function onOpenCvReady() {
    console.log("OpenCV Engine Loaded Successfully.");
    const badge = document.getElementById('vision_engine_badge');
    if(badge) { 
        badge.innerText = "Engine: OpenCV Ready"; 
        badge.className = "status-badge badge-ready"; 
    }
    const btn = document.getElementById('extractFeaturesBtn');
    if(btn) btn.disabled = false;
    const status = document.getElementById('status_text');
    if(status) status.innerText = "Status: Vision Engines Online. Ready.";
}

function onOpenCvError() {
    console.error("OpenCV Failed to Load.");
    const badge = document.getElementById('vision_engine_badge');
    if(badge) { 
        badge.innerText = "Engine: Core Offline"; 
        badge.style.backgroundColor = "#e74c3c"; 
        badge.style.color = "#fff"; 
    }
    const status = document.getElementById('status_text');
    if(status) status.innerText = "Status: Failed to load OpenCV Vision scripts.";
}

// Global Core Register Architecture States Allocation
let map, tiles, mapGeoJsonDisplayLayer;
let activeFeatureCollection = { type: "FeatureCollection", features: [] };
let extractedGeometriesCache = [];

// Initialize multi-threaded worker engine hooks using the file sandbox created previously
const gisWorker = new Worker('gis-worker.js');

document.addEventListener("DOMContentLoaded", function() {
    // Center initially mapped coordinates over the Kafue/Chilanga sector matrix zone targets
    map = L.map('map').setView([-15.78, 28.18], 11);
    
    tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    mapGeoJsonDisplayLayer = L.geoJSON(null, {
        style: function(feature) {
            // Distribute individual color styles uniquely to help contrast active layers
            const colors = ['#00a8ff', '#2ecc71', '#e67e22', '#9b59b6', '#f1c40f'];
            const idx = Math.floor(Math.random() * colors.length);
            return { color: colors[idx], weight: 3, fillOpacity: 0.25 };
        },
        onEachFeature: function(feature, layer) {
            if (feature.properties && feature.properties.name) {
                layer.bindPopup(`<strong>${feature.properties.name}</strong><br>${feature.properties.description}<br><small style="color:#7f8c8d;">CRS: ${feature.properties.crsContext}</small>`);
            }
        }
    }).addTo(map);

    // Document listener binding setup sequence for handling local asset stream changes
    setupImageLoaderEvents();
});

// Structural UI Modals Controller Utility Anchors
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOnBackdrop(event, id) { if (event.target === document.getElementById(id)) { closeModal(id); } }

// Async Extraction Matrix Thread Handshake Setup Sequence Block
let imageReadyState = false;
function setupImageLoaderEvents() {
    const imageLoader = document.getElementById('imageLoader');
    const imageSrc = document.getElementById('imageSrc');
    const statusText = document.getElementById("status_text");

    if (!imageLoader || !imageSrc) return;

    imageLoader.addEventListener('change', function(e) {
        const file = e.target.files[0]; // Targeted first array index item
        
        if (!file) {
            imageReadyState = false;
            if (statusText) statusText.innerText = "Status: No image file selected.";
            return;
        }

        imageReadyState = false; // Reset state tracking loop
        if (statusText) statusText.innerText = "Status: Parsing uploaded image stream...";
        
        const reader = new FileReader();
        reader.onload = function(event) {
            imageSrc.onload = function() {
                imageReadyState = true; // Flips to true only when fully drawn in memory
                if (statusText) statusText.innerText = "Status: Image cached in memory. Ready to segment shapes.";
            };
            imageSrc.src = event.target.result;
        };
        
        reader.readAsDataURL(file);
    }, false);
}

function processImageFeatures() {
    const imageSrc = document.getElementById('imageSrc');
    const statusText = document.getElementById("status_text");
    
    // Safety check: Prevent running math operations on an empty image asset
    if (!imageReadyState || !imageSrc.src || imageSrc.src === window.location.href) { 
        alert("Please wait for your selected image file to finish processing into memory before clicking extract."); 
        return; 
    }
    
    document.getElementById('loading_spinner').style.display = 'inline-block';
    if (statusText) statusText.innerText = "Status: Offloading vision contours calculations to background thread...";

    try {
        const canvas = document.getElementById('canvasOutput');
        const ctx = canvas.getContext('2d');
        
        // Force the canvas size to mirror your high-resolution image precisely
        canvas.width = imageSrc.naturalWidth || imageSrc.width;
        canvas.height = imageSrc.naturalHeight || imageSrc.height;
        
        ctx.drawImage(imageSrc, 0, 0);
        
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const mapCenter = map.getCenter();

        // Ship the pixel payload to your background thread (Main UI stays completely fast!)
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
        console.error("Canvas context generation error:", err);
        alert("Extraction Error: Failed to compile image pixels. Try a standard .jpg or .png screenshot.");
    }
}

gisWorker.onmessage = function(e) {
    document.getElementById('loading_spinner').style.display = 'none';
    const statusText = document.getElementById("status_text");
    if (e.data.status === 'success') {
        extractedGeometriesCache = e.data.geometries;
        statusText.innerText = "Status: Extraction phase complete. Formulating schema rules.";
        openModal('crs_attribute_modal');
    } else {
        statusText.innerText = "Status: Computation thread dropped.";
        alert("Worker Error: " + e.data.message);
    }
};

function commitExtractedFeatures() {
    const selectedCRS = document.getElementById('crs_selector').value;
    const featureName = document.getElementById('attr_feature_name').value || "Extracted Layer";
    const featureDesc = document.getElementById('attr_feature_desc').value || "No description parameters available.";
    
    // Safety check: Alert user if worker failed to find solid lines in the image
    if (extractedGeometriesCache.length === 0) {
        alert("Extraction Notice: No geometric outlines were detected in this image. Try an image with higher edge contrast or sharp boundaries.");
        closeModal('crs_attribute_modal');
        return;
    }
    
    extractedGeometriesCache.forEach((polyGeometry) => {
        let geoJsonCoordinates = polyGeometry.map(coord => {
            if(selectedCRS === "EPSG:3857") { return proj4("EPSG:3857", "EPSG:4326", coord); }
            return coord; 
        });

        activeFeatureCollection.features.push({
            type: "Feature",
            id: 'layer_' + Date.now() + '_' + Math.floor(Math.random()*1000), // Append unique tracking keys
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

// CORE COMPONENT: Structural catalog renderer updating items dynamically inside the layout interface
function syncActiveLayersDatabase() {
    // Redraw geometry structures onto active visual Leaflet map instance
    mapGeoJsonDisplayLayer.clearLayers();
    mapGeoJsonDisplayLayer.addData(activeFeatureCollection);
    
    const catalogContainer = document.getElementById('layers_catalog_container');
    if(!catalogContainer) return;
    catalogContainer.innerHTML = ''; // Wipe stale database entry rows

    if(activeFeatureCollection.features.length === 0) {
        catalogContainer.innerHTML = '<div class="no-layers">No layers currently loaded into vector registry space.</div>';
        return;
    }

    // Iterate feature inventory items and append metadata management item cards
    activeFeatureCollection.features.forEach((feature) => {
        const layerCard = document.createElement('div');
        layerCard.className = 'layer-item-card';
        layerCard.innerHTML = `
            <div class="layer-info">
                <span class="layer-name" title="${feature.properties.name}">${feature.properties.name}</span>
                <span class="layer-meta">Extracted at: ${feature.properties.timestamp}</span>
            </div>
            <div class="layer-actions">
                <button onclick="removeLayerInstance('${feature.id}')">Delete</button>
            </div>
        `;
        catalogContainer.appendChild(layerCard);
    });

    if(activeFeatureCollection.features.length > 0) {
        map.fitBounds(mapGeoJsonDisplayLayer.getBounds());
    }
}

// Delete selected layer element from structural array registry lists
function removeLayerInstance(layerId) {
    activeFeatureCollection.features = activeFeatureCollection.features.filter(f => f.id !== layerId);
    syncActiveLayersDatabase();
    document.getElementById("status_text").innerText = "Status: Target feature instance dropped out from data registry catalog.";
}

// CORE COMPONENT: Spatial API nominatim routing client engine
function executeGeocodingSearch() {
    const query = document.getElementById('map_spatial_search_input').value;
    const dropdown = document.getElementById('search_results_dropdown_box');
    const statusText = document.getElementById("status_text");
    if (!query.trim()) return;

    statusText.innerText = "Status: Searching global coordinates records indices...";
    dropdown.innerHTML = '<div class="search-result-item" style="color:#7f8c8d;">Querying spatial addresses server registries...</div>';
    dropdown.style.display = 'block';

    // Route structural call request out via open server parsing gateways
    fetch(`https://openstreetmap.org{encodeURIComponent(query)}&limit=5`)
        .then(response => response.json())
        .then(data => {
            dropdown.innerHTML = '';
            if(data.length === 0) {
                dropdown.innerHTML = '<div class="search-result-item" style="color:#e74c3c;">No spatial coordinates matches found.</div>';
                return;
            }
            // Bind resolved items straight into visual search selections list blocks
            data.forEach(item => {
                const row = document.createElement('div');
                row.className = 'search-result-item';
				row.innerText = item.display_name;
				row.onclick = function() {
					const lat = parseFloat(item.lat);const lon = parseFloat(item.lon);map.setView([lat, lon], 14);
					// Pan viewport straight to matching location coordinates
					dropdown.style.display = 'none';
					document.getElementById('map_spatial_search_input').value = item.display_name;
					statusText.innerText = "Status: Viewport centered over target location.";
				};
				dropdown.appendChild(row);
			});
		}).catch(err => {console.error(err);
		dropdown.style.display = 'none';
		statusText.innerText = "Status: Geocoding server connectivity timeout error.";
	});
}

// Hide open dropdown interface lists if user clicks out from the mapping focus frame
document.addEventListener('click', function(e) {
	const dropdown = document.getElementById('search_results_dropdown_box');
	const searchInput = document.getElementById('map_spatial_search_input');
	if(dropdown && e.target !== searchInput) {
		dropdown.style.display = 'none';
	}
});

// Local File IO Import and Export Engine Modules Configuration Controls
function triggerImport() {
	document.getElementById('geoJsonImporter').click();
}

function handleImport(event) {
	const file = event.target.files;
	if (!file) return;
	const reader = new FileReader();
	reader.onload = function(e) {
		try {
			const importedData = JSON.parse(e.target.result);
			if(importedData.type === "FeatureCollection") {
				// Map runtime tracking identity keys to imported shapes missing identifiers
				importedData.features.forEach(f => {
					if(!f.id) f.id = 'layer_' + Date.now() + '_' + Math.floor(Math.random()*1000);
					if(!f.properties.timestamp) f.properties.timestamp = "Imported File";
				});
				activeFeatureCollection = importedData;
				syncActiveLayersDatabase();
				document.getElementById("status_text").innerText = "Status: Import operations complete. Vector space catalog synced.";
			} else {
				alert("Data format error: File structure must declare a standard FeatureCollection layout profile.");
			}
		} catch(err) {
			alert("Parser crashed: Unable to decode layout variables configuration data streams.");
		}
	};
	reader.readAsText(file);
}

function exportGeoJSON() {
	if(activeFeatureCollection.features.length === 0) {
		alert("Nothing to export. Vector database metadata catalog is empty.");
		return;
	}
	const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeFeatureCollection, null, 2));
	const downloadAnchor = document.createElement('a');
	downloadAnchor.setAttribute("href", dataStr);
	downloadAnchor.setAttribute("download", `kapsaGIS_catalog_${Date.now()}.geojson`);
	document.body.appendChild(downloadAnchor);
	downloadAnchor.click();downloadAnchor.remove();
}