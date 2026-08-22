// Load the OpenCV engine inside the background sandbox thread environment
importScripts('https://cdn.jsdelivr.net/npm/opencv.js');

// Listen for processing tasks from the main window map layout
self.onmessage = function(e) {
    if (e.data.cmd === 'processImage') {
        try {
            const { imgData, rows, cols, centerLng, centerLat } = e.data;
            
            // Re-compile raw pixel byte data back into an active memory matrix
            let src = new cv.Mat(rows, cols, cv.CV_8UC4);
            src.data.set(imgData);
            
            let dst = cv.Mat.zeros(src.rows, src.cols, cv.CV_8UC3);
            cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
            //cv.threshold(src, src, 100, 255, cv.THRESH_BINARY);
            cv.adaptiveThreshold(src, src, 255, 1, 1, 11, 2);
            
            let contours = new cv.MatVector();
            let hierarchy = new cv.Mat();
            cv.findContours(src, contours, hierarchy, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE);
            
            let extractedGeometries = [];
            
            for (let i = 0; i < contours.size(); ++i) {
                let contour = contours.get(i);
                if (contour.data32S.length > 12) { 
                    let coordinates = [];
                    for (let j = 0; j < contour.data32S.length; j += 2) {
                        let pxX = contour.data32S[j];
                        let pxY = contour.data32S[j+1];
                        
                        let lng = centerLng + (pxX - src.cols / 2) * 0.0001;
                        let lat = centerLat - (pxY - src.rows / 2) * 0.0001;
                        coordinates.push([lng, lat]);
                    }
                    if (coordinates.length > 0) {
                        coordinates.push(coordinates[0]); // Complete Closed Loop Geometry Ring
                        extractedGeometries.push(coordinates);
                    }
                }
            }
            
            // Free worker memory buffers
            src.delete(); dst.delete(); contours.delete(); hierarchy.delete();
            
            // Post computed vector shapes back to the interactive UI map thread
            self.postMessage({ status: 'success', geometries: extractedGeometries });
            
        } catch (err) {
            self.postMessage({ status: 'error', message: err.message });
        }
    }
};
