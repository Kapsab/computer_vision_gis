// Modal Global Architecture Hooks
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function closeModalOnBackdrop(event, id) {
	if (event.target === document.getElementById(id)) {
		closeModal(id);
	} 
}

// OpenCV Async Load Management Engine Validation
function onOpenCvReady() {
	document.getElementById('status_text').innerText = "Status: Vision Engines Online. Ready.";
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
	document.getElementById('status_text').innerText = "Status: Failed to load OpenCV Vision scripts.";
	const badge = document.getElementById('vision_engine_badge');
	if(badge) {
        badge.innerText = "Engine: Core Offline";
        badge.style.backgroundColor = "#e74c3c";
        badge.style.color = "#fff";
    }
    const status = document.getElementById('status_text');
    if(status) status.innerText = "Status: Failed to load OpenCV Vision scripts.";
}

let map;
let tiles;
// Feature Storage Registry Array
let activeFeatureCollection = { type: "FeatureCollection", features: [] };
let mapGeoJsonDisplayLayer;
let extractedGeometriesCache = [];
// Initialize the background worker pipeline
const gisWorker = new Worker('gis-worker.js');
// Progress Bar Map Event Listeners
const pBar = document.getElementById("progress_bar");
const pContainer = document.getElementById("progress_container");
const statusText = document.getElementById("status_text");
let tilesLoading = 0, tilesTotal = 0;

document.addEventListener("DOMContentLoaded", function() {
	map = L.map('map').setView([-15.78, 28.18], 11);

	tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}{r}.png', {
		maxZoom: 20,
		attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
	}).addTo(map);

	// Dynamic Vector Presentation Leaflet Layer Handler Anchor
	mapGeoJsonDisplayLayer = L.geoJSON(null, {
		style: { color: "#00a8ff", weight: 3, fillOpacity: 0.25 }
	}).addTo(map);

	tiles.on('tileloadstart', function() {
		if (tilesLoading === 0) {
			tilesTotal = 0; pContainer.style.opacity = '1';
			statusText.innerText = "Status: Synchronizing tiles...";
		}
		tilesLoading++;
		tilesTotal++;
		updateProgress();
	});
	
	tiles.on('tileload tileunload tileerror', function() {
		if (tilesLoading > 0) {
			tilesLoading--;
		} updateProgress();
	});

	function updateProgress() {
		if (tilesLoading === 0) {
			pBar.style.width = '100%'; statusText.innerText = "Status: Ready";
			setTimeout(() => {
				if (tilesLoading === 0) {
					pContainer.style.opacity = '0';
					setTimeout(() => {
						if (tilesLoading === 0) pBar.style.width = '0%';
					}, 200);
				}
			}, 300);
		} else {
			pBar.style.width = Math.max(((tilesTotal - tilesLoading) / tilesTotal) * 100, 10) + '%';
		}
	}
});

// Pipeline Image Import Node Event Stream Tracker
const imageLoader = document.getElementById('imageLoader');
const imageSrc = document.getElementById('imageSrc');

imageLoader.addEventListener('change', function(e) {
	const file = e.target.files[0];
	if (!file) return;
	statusText.innerText = "Status: Reading upload stream...";
	const reader = new FileReader();
	reader.onload = function(event) {
		imageSrc.onload = function() {
			statusText.innerText = "Status: Image caching active. Vision matrix loaded.";
			alert("Image cached successfully! Click 'Extract Polygons' to run computer vision segmentation.");
		};
		imageSrc.src = event.target.result;
	};
	reader.readAsDataURL(file);
}, false);

// Temporal staging array container variables
extractedGeometriesCache = [];

// Computer Vision Image Segmentation Engine Node Core Block
function processImageFeatures() {
    if (!imageSrc.src || imageSrc.src === window.location.href) {
        alert("Please browse and select an image file first.");
        return;
    }
    
    document.getElementById('loading_spinner').style.display = 'inline-block';
    statusText.innerText = "Status: Processing vector analysis in background. You can continue using the map...";

    // Extract raw canvas image pixels to pass to the worker sandbox
    const canvas = document.getElementById('canvasOutput');
    const ctx = canvas.getContext('2d');
    canvas.width = imageSrc.width;
    canvas.height = imageSrc.height;
    ctx.drawImage(imageSrc, 0, 0);
    
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const mapCenter = map.getCenter();

    // Ship data payload to the worker thread (Main Thread remains 100% active!)
    gisWorker.postMessage({
        cmd: 'processImage',
        imgData: imgData.data.buffer, // Zero-copy array buffer transfer for ultra-fast speed
        rows: canvas.height,
        cols: canvas.width,
        centerLng: mapCenter.lng,
        centerLat: mapCenter.lat
    }, [imgData.data.buffer]);
}

// Handle data returned from the background computing core worker
gisWorker.onmessage = function(e) {
    document.getElementById('loading_spinner').style.display = 'none';
    
    if (e.data.status === 'success') {
        extractedGeometriesCache = e.data.geometries;
        statusText.innerText = "Status: Process complete. Setup definitions.";
        openModal('crs_attribute_modal');
    } else {
        statusText.innerText = "Status: Computation failure.";
        alert("Background Processing Error: " + e.data.message);
    }
};


// Save Form Metadata and Structural System Coordinate Reference Sets Into Memory Arrays
function commitExtractedFeatures() {
	const selectedCRS = document.getElementById('crs_selector').value;
	const featureName = document.getElementById('attr_feature_name').value || "Unnamed Layer";
	const featureDesc = document.getElementById('attr_feature_desc').value || "No description provided.";
	extractedGeometriesCache.forEach((polyGeometry) => {
		// Transform coordinate projections array mapping index values if Web Mercator is selected
		let parsedCoordinates = polyGeometry.map(coord => {
			if(selectedCRS === "EPSG:3857") {
				// Transform coordinates via Proj4js mapping conversions
				return proj4("EPSG:3857", "EPSG:4326", coord);
			}
			return coord;
		});
		let geoJsonStructure = {
			type: "Feature",properties: {name: featureName,description: featureDesc,crsContext: selectedCRS,timestamp: new Date().toISOString()},geometry: {type: "Polygon",coordinates: [parsedCoordinates]}
		};
		activeFeatureCollection.features.push(geoJsonStructure);
	});
	// Refresh vectors mapped elements on Leaflet structural scene
	mapGeoJsonDisplayLayer.clearLayers();
	mapGeoJsonDisplayLayer.addData(activeFeatureCollection);
	// Center viewport over newly created spatial dataset components
	if(activeFeatureCollection.features.length > 0) {
		map.fitBounds(mapGeoJsonDisplayLayer.getBounds());
	} closeModal('crs_attribute_modal');
	statusText.innerText = "Status: Captured ${extractedGeometriesCache.length} operational polygon features successfully into dataset registry array.";
}

// Local GeoJSON Spatial Vector Serialization Engine Nodes
function triggerImport() {
	document.getElementById('geoJsonImporter').click();
}

function handleImport(event) {
	const file = event.target.files[0];
	if (!file) return;
	const reader = new FileReader();
	reader.onload = function(e) {
		try {
			const importedData = JSON.parse(e.target.result);
			if(importedData.type === "FeatureCollection" || importedData.type === "Feature") {
				activeFeatureCollection = importedData.type === "Feature" ? { type: "FeatureCollection", features: [importedData] } : importedData;mapGeoJsonDisplayLayer.clearLayers();
				mapGeoJsonDisplayLayer.addData(activeFeatureCollection);
				map.fitBounds(mapGeoJsonDisplayLayer.getBounds());
				statusText.innerText = "Status: Import operations complete. Vector space parsed.";
			} else {
				alert("Data layout design specification error: File format does not comply with GeoJSON guidelines.");
			}
		} catch(err) {
			alert("Parser configuration critical interrupt failure: Unable to decode file properties.");
		}
	};
	reader.readAsText(file);
}

function exportGeoJSON() {
	if(activeFeatureCollection.features.length === 0) {
		alert("Action cancelled: Spatial data register array contains no geometric feature instances.");
		return;
	}
	const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeFeatureCollection, null, 2));
	const downloadAnchor = document.createElement('a');
	downloadAnchor.setAttribute("href", dataStr);
	downloadAnchor.setAttribute("download", kapsaGIS_export.geojson);
	document.body.appendChild(downloadAnchor);
	downloadAnchor.click();
	downloadAnchor.remove();
	statusText.innerText = "Status: Export complete. Vector database payload dispatched.";
}

let croppingMaskActive = false;
let cropBoxRectangle = null;

// Sets up a drag-to-crop crosshair interface across your map window canvas
function toggleCroppingTool() {
    if (activeFeatureCollection.features.length === 0) {
        alert("Action unavailable: Load or extract a vector dataset layer first before executing cropping filters.");
        return;
    }
    
    croppingMaskActive = !croppingMaskActive;
    if (croppingMaskActive) {
        statusText.innerText = "Status: Crop Mode Active. Click two points on the map to define your bounding cut box.";
        map.setStyle({ cursor: 'crosshair' });
        
        map.once('click', (e1) => {
            let startPoint = e1.latLng;
            map.on('mousemove', (eMove) => {
                if(cropBoxRectangle) map.removeLayer(cropBoxRectangle);
                cropBoxRectangle = L.rectangle([startPoint, eMove.latLng], {color: "#e74c3c", weight: 1, fillOpacity: 0.1}).addTo(map);
            });
            
            map.once('click', (e2) => {
                map.off('mousemove');
                executeGeometryCrop(startPoint, e2.latLng);
            });
        });
    } else {
        resetCroppingInterface();
    }
}

// Filters data parameters to retain coordinates within boundary indices
function executeGeometryCrop(p1, p2) {
    const cropBounds = L.latLngBounds(p1, p2);
    
    // Process geometries through a client-side boundary intersection filter matrix
    let clippedFeatures = activeFeatureCollection.features.map(feature => {
        if (feature.geometry.type !== "Polygon") return feature;
        
        let originalRings = feature.geometry.coordinates[0];
        // Retain individual point coordinates only if they fall inside the box parameters
        let insideRing = originalRings.filter(coord => {
            return cropBounds.contains(L.latLng(coord[1], coord[0]));
        });

        if (insideRing.length > 3) {
            insideRing.push(insideRing[0]); // Maintain spatial topology ring closures requirements
            feature.geometry.coordinates = [insideRing];
            return feature;
        }
        return null; // Eliminate shapes sliced down completely
    }).filter(f => f !== null);

    activeFeatureCollection.features = clippedFeatures;
    mapGeoJsonDisplayLayer.clearLayers();
    mapGeoJsonDisplayLayer.addData(activeFeatureCollection);
    
    resetCroppingInterface();
    statusText.innerText = "Status: Crop execution complete. Extraneous boundary elements discarded.";
}

function resetCroppingInterface() {
    if(cropBoxRectangle) { map.removeLayer(cropBoxRectangle); cropBoxRectangle = null; }
    map.setStyle({ cursor: '' });
    croppingMaskActive = false;
}


let transformatioGroup = null;
let transformHandles = [];
let originalExtractedCoordinates = [];

function CommitExtractedFeatures() {
	const selectedCRS = document.getElementById('crs_selector').value;
    const featureName = document.getElementById('attr_feature_name').value || "Staged Layer";
    const featureDesc = document.getElementById('attr_feature_desc').value || "No description provided.";
    
    // Clear any previous interactive transformations running on the canvas scene
    clearTransformationSession();
    
    // Create a working group to host the editable vectors
    transformationGroup = L.featureGroup().addTo(map);
    originalExtractedCoordinates = [];

    extractedGeometriesCache.forEach((polyGeometry) => {
        let parsedCoordinates = polyGeometry.map(coord => {
            if(selectedCRS === "EPSG:3857") {
                return proj4("EPSG:3857", "EPSG:4326", coord);
            }
            return coord; 
        });

        // Store standard Leaflet LatLng points for transformation operations
        let leafletLatLngs = parsedCoordinates.map(c => L.latLng(c[1], c[0]));
        originalExtractedCoordinates.push(leafletLatLngs);

        // Render the geometry as an adjustable vector shape layer
        let interactivePolygon = L.polygon(leafletLatLngs, {
            color: "#e74c3c", // Highlight red during spatial calibration
            weight: 3,
            fillOpacity: 0.3,
            metadata: { name: featureName, description: featureDesc, crs: selectedCRS }
        });
        
        transformationGroup.addLayer(interactivePolygon);
    });

    if(transformationGroup.getLayers().length > 0) {
        map.fitBounds(transformationGroup.getBounds());
        // Initialize visual handles to let the user reposition and scale shapes safely
        createTransformationHandles();
        statusText.innerText = "Status: Geo-referencing Active. Use handles to Drag/Scale. Press 'Save Layer' in sidebar to lock coordinates.";
        
        // Expose a floating Save action block inside your dashboard panel workspace
        appendGeoReferenceLockControl();
    }

    closeModal('crs_attribute_modal');
}

// Generates dynamic anchor points around the bounds of your vector shapes
function createTransformationHandles() {
    if (!transformationGroup) return;
    const bounds = transformationGroup.getBounds();
    const corners = [
        { pos: bounds.getNorthWest(), type: 'nw' },
        { pos: bounds.getSouthEast(), type: 'se' }
    ];

    corners.forEach(corner => {
        let handle = L.marker(corner.pos, {
            draggable: true,
            icon: L.divIcon({
                className: 'spatial-transform-handle',
                html: '<div style="width:12px; height:12px; background:#fff; border:2px solid #00a8ff; border-radius:50%;"></div>',
                iconSize: [12, 12]
            })
        }).addTo(map);

        handle.on('drag', () => scaleAndTranslateVectors(corner.type, handle.getLatLng()));
        handle.on('dragend', () => { createTransformationHandles(); }); // Re-anchor points post-action
        transformHandles.push(handle);
    });
}

// Mathematical scaling & translation engine mapping anchor controls to coordinate strings
function scaleAndTranslateVectors(handleType, newHandleLatLng) {
    const currentBounds = transformationGroup.getBounds();
    let anchorLatLng;
    
    if (handleType === 'se') {
        anchorLatLng = currentBounds.getNorthWest();
    } else {
        anchorLatLng = currentBounds.getSouthEast();
    }

    let layers = transformationGroup.getLayers();
    let index = 0;

    // Run delta scalar changes across every vector coordinate string inside memory structures
    layers.forEach(layer => {
        let origPoints = originalExtractedCoordinates[index];
        let latFactor = (newHandleLatLng.lat - anchorLatLng.lat) / (currentBounds.getSouthEast().lat - currentBounds.getNorthWest().lat);
        if(handleType === 'se') latFactor = (newHandleLatLng.lat - anchorLatLng.lat) / (currentBounds.getSouthEast().lat - anchorLatLng.lat);
        
        let lngFactor = (newHandleLatLng.lng - anchorLatLng.lng) / (currentBounds.getSouthEast().lng - currentBounds.getNorthWest().lng);
        if(handleType === 'se') lngFactor = (newHandleLatLng.lng - anchorLatLng.lng) / (currentBounds.getSouthEast().lng - anchorLatLng.lng);

        let adjustedPoints = origPoints.map(p => {
            let newLat = anchorLatLng.lat + (p.lat - anchorLatLng.lat) * Math.abs(latFactor || 1);
            let newLng = anchorLatLng.lng + (p.lng - anchorLatLng.lng) * Math.abs(lngFactor || 1);
            return L.latLng(newLat, newLng);
        });

        layer.setLatLngs(adjustedPoints);
        index++;
    });

    // Remove secondary markers dynamically during fluid tracking streams
    transformHandles.forEach(h => { if(h.getLatLng() !== newHandleLatLng) map.removeLayer(h); });
    transformHandles = [transformHandles.find(h => h.getLatLng() === newHandleLatLng)];
}

// UI Injector generating lock command pathways inside the sidebar workspace area
function appendGeoReferenceLockControl() {
    let existingBtn = document.getElementById('lockGeoRefBtn');
    if (existingBtn) existingBtn.remove();

    let sidebar = document.getElementById('sidebar');
    let lockContainer = document.createElement('div');
    lockContainer.id = 'lockGeoRefBtn';
    lockContainer.className = 'panel-section';
    lockContainer.style.background = '#e8f4fd';
    lockContainer.style.borderRadius = '6px';
    lockContainer.style.padding = '10px';

    lockContainer.innerHTML = `
        <div class="panel-title" style="color:#0086cc;">3. Calibration Matrix Lock</div>
        <p style="font-size:0.8em; margin-bottom:8px;">Repositioning workflow active. Ensure accuracy before writing entries to spatial catalog records.</p>
        <div style="display:flex; gap:8px;">
            <button style="background-color:#2ecc71; flex-grow:1;" onclick="finalizeSpatialTransform()">Lock Layer</button>
            <button style="background-color:#e74c3c;" onclick="clearTransformationSession()">Abort</button>
        </div>
    `;
    sidebar.appendChild(lockContainer);
}

// Saves transformed shapes directly into the database GeoJSON array pipeline registry structures
function finalizeSpatialTransform() {
    if (!transformationGroup) return;

    transformationGroup.getLayers().forEach(layer => {
        let latLngs = layer.getLatLngs()[0]; // Extract geometry points string map matrix
        let geoJsonCoordinates = latLngs.map(ll => [ll.lng, ll.lat]);
        geoJsonCoordinates.push(geoJsonCoordinates[0]); // Ensure strict closed ring formatting compliance

        activeFeatureCollection.features.push({
            type: "Feature",
            properties: {
                name: layer.options.metadata.name,
                description: layer.options.metadata.description,
                crsContext: layer.options.metadata.crs,
                timestamp: new Date().toISOString()
            },
            geometry: { type: "Polygon", coordinates: [geoJsonCoordinates] }
        });
    });

    // Synchronize active graphics workspace registers back onto standard display layers
    mapGeoJsonDisplayLayer.clearLayers();
    mapGeoJsonDisplayLayer.addData(activeFeatureCollection);
    
    clearTransformationSession();
    statusText.innerText = "Status: Geo-referencing complete. Data record saved successfully.";
}

function clearTransformationSession() {
    if(transformationGroup) { map.removeLayer(transformationGroup); transformationGroup = null; }
    transformHandles.forEach(h => map.removeLayer(h));
    transformHandles = [];
    let lockBtn = document.getElementById('lockGeoRefBtn');
    if (lockBtn) lockBtn.remove();
}