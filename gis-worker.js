// Load OpenCV inside worker sandbox
importScripts('https://cdn.jsdelivr.net/npm/opencv.js');

let isOpenCvReady = false;

self.Module = {
    onRuntimeInitialized: function() {
        isOpenCvReady = true;
    }
};

self.onmessage = function(e) {
    if (e.data.cmd === 'processImage') {
        if (!isOpenCvReady && typeof cv === 'undefined') {
            self.postMessage({ status: 'error', message: 'OpenCV runtime loading, try again in a few seconds.' });
            return;
        }

        try {
            const { imgData, rows, cols, centerLng, centerLat } = e.data;
            
            let src = new cv.Mat(rows, cols, cv.CV_8UC4);
            src.data.set(new Uint8Array(imgData));
            
            let gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
            
            // 1. Denoise scan texture and paper folds
            let ksize = new cv.Size(3, 3);
            cv.GaussianBlur(gray, gray, ksize, 0, 0, cv.BORDER_DEFAULT);
            
            // 2. Otsu thresholding to separate black line work from grey blueprint background
            let binary = new cv.Mat();
            cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
            
            // 3. Morphological closing to bridge small gaps in scanned boundary lines
            let M = cv.Mat.ones(3, 3, cv.CV_8U);
            cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, M);

            let contours = new cv.MatVector();
            let hierarchy = new cv.Mat();
            cv.findContours(binary, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
            
            let extractedGeometries = [];
            
            // Define plan canvas safe zone (ignores top/bottom margins, stamps, and hole punches)
            const minX = cols * 0.15;
            const maxX = cols * 0.85;
            const minY = rows * 0.15;
            const maxY = rows * 0.85;

            for (let i = 0; i < contours.size(); ++i) {
                let contour = contours.get(i);
                let area = cv.contourArea(contour);
                
                // Filter out small text noise and massive paper boundary outlines
                if (area > 1500 && area < (rows * cols * 0.35)) { 
                    let approx = new cv.Mat();
                    let epsilon = 0.03 * cv.arcLength(contour, true);
                    cv.approxPolyDP(contour, approx, epsilon, true);

                    // Cadastral plots generally have 4 to 8 vertices
                    if (approx.rows >= 4 && approx.rows <= 10) {
                        let coordinates = [];
                        let isInsideCanvas = true;

                        for (let j = 0; j < approx.rows; j++) {
                            let pxX = approx.data32S[j * 2];
                            let pxY = approx.data32S[j * 2 + 1];
                            
                            // Check if vertex lies within the core drawing canvas
                            if (pxX < minX || pxX > maxX || pxY < minY || pxY > maxY) {
                                isInsideCanvas = false;
                                break;
                            }

                            // Coordinate transformation relative to map center
                            let lng = centerLng + (pxX - cols / 2) * 0.000015;
                            let lat = centerLat - (pxY - rows / 2) * 0.000015;
                            coordinates.push([lng, lat]);
                        }
                        
                        if (isInsideCanvas && coordinates.length >= 4) {
                            coordinates.push(coordinates[0]); // Close polygon loop
                            extractedGeometries.push(coordinates);
                        }
                    }
                    approx.delete();
                }
            }
            
            // Memory cleanup
            src.delete(); gray.delete(); binary.delete(); M.delete(); contours.delete(); hierarchy.delete();
            
            self.postMessage({ status: 'success', geometries: extractedGeometries });
            
        } catch (err) {
            self.postMessage({ status: 'error', message: err.message });
        }
    }
};