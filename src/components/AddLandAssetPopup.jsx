import React, { useState, useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import * as turf from '@turf/turf';
import bboxPolygon from '@turf/bbox-polygon';
import pointGrid from '@turf/point-grid';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { ref, push, update, serverTimestamp } from "firebase/database";
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { db, storage } from '../api/firebaseConfig';
import styles from './AddLandAssetPopup.module.css';
import { X, Loader } from 'lucide-react';

import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

const calculateBounds = (geometry) => {
  if (!geometry?.coordinates) return null;
  try {
    if (geometry.type === 'Point') {
      const [lon, lat] = geometry.coordinates;
      const delta = 0.005;
      return [lon - delta, lat - delta, lon + delta, lat + delta];
    }
    if ((geometry.type === 'Polygon' && geometry.coordinates[0]?.length >= 4) ||
        (geometry.type === 'MultiPolygon' && geometry.coordinates[0]?.[0]?.length >= 4) ||
         geometry.type === 'LineString') {
      return turf.bbox(geometry);
    }
  } catch (e) {
    console.error("Error calculating bounds:", e);
  }
  return null;
};

const cropMapCanvasToBlob = async (mapInstance, geometry, scaleFactor = 1.5) => {
  return new Promise((resolve, reject) => {
    if (!mapInstance || !geometry) {
      return reject(new Error("Map instance or geometry missing for cropping."));
    }

    const mapCanvas = mapInstance.getCanvas();
    const bounds = calculateBounds(geometry);

    if (!mapCanvas || !bounds) {
      return reject(new Error("Map canvas or bounds unavailable for cropping."));
    }

    try {
      const [minX, minY, maxX, maxY] = bounds;
      const sw = mapInstance.project([minX, minY]);
      const ne = mapInstance.project([maxX, maxY]);

      const cropWidth = Math.abs(ne.x - sw.x);
      const cropHeight = Math.abs(ne.y - sw.y);
      const cropX = Math.min(sw.x, ne.x);
      const cropY = Math.min(sw.y, ne.y);

      if (cropWidth <= 0 || cropHeight <= 0) {
        return reject(new Error("Invalid crop dimensions calculated."));
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = Math.round(cropWidth * scaleFactor);
      tempCanvas.height = Math.round(cropHeight * scaleFactor);
      const ctx = tempCanvas.getContext('2d');

      if (!ctx) {
        return reject(new Error("Failed to get 2D context for cropping canvas."));
      }

      ctx.drawImage(
        mapCanvas,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, tempCanvas.width, tempCanvas.height
      );

      tempCanvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas toBlob conversion failed."));
        }
      }, 'image/png');

    } catch (error) {
      console.error("Error during image cropping:", error);
      reject(new Error("Image cropping process failed."));
    }
  });
};

const calculateGridCenters = (polygonFeature, gridSize = 16) => {
  if (polygonFeature?.geometry?.type !== 'Polygon') {
    return [];
  }
  try {
    const bounds = turf.bbox(polygonFeature);
    const [minX, minY, maxX, maxY] = bounds;
    const cellWidth = (maxX - minX) / gridSize;
    const cellHeight = (maxY - minY) / gridSize;
    const gridCenters = [];
    const flatCenters = []; // Store flat [lon, lat] pairs

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const centerX = minX + cellWidth * (i + 0.5);
        const centerY = minY + cellHeight * (j + 0.5);
        const centerPoint = turf.point([centerX, centerY]);

        if (booleanPointInPolygon(centerPoint, polygonFeature)) {
          // gridCenters.push([centerX, centerY]); // Keep original structure if needed elsewhere
          flatCenters.push([centerX, centerY]); // Add to flat list for Firebase
        }
      }
    }
    // Return the flat list specifically for Firebase storage
    return flatCenters;
  } catch (error) {
    console.error("Error calculating grid centers:", error);
    return [];
  }
};


function AddLandAssetPopup({ user, onClose, assetToEdit = null }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const currentFeatureIdRef = useRef(null);

  const [assetName, setAssetName] = useState('');
  const [assetNotes, setAssetNotes] = useState('');
  const [drawnFeature, setDrawnFeature] = useState(null);
  const [areaHectares, setAreaHectares] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const isEditing = Boolean(assetToEdit);

  const calculateArea = useCallback((feature) => {
    let area = 0;
    if (feature?.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
      try {
        area = turf.area(feature) / 10000;
      } catch (calcError) {
        console.error("Area calculation error:", calcError);
        area = 0;
      }
    }
    setAreaHectares(area);
  }, []);

  useEffect(() => {
    setAssetName(assetToEdit?.name || '');
    setAssetNotes(assetToEdit?.notes || '');
    setDrawnFeature(null);
    setAreaHectares(0);
    currentFeatureIdRef.current = null;
    setStatusMessage('');

    if (isMapLoaded && drawRef.current) {
      drawRef.current.deleteAll();
      if (assetToEdit?.geometry) {
        const feature = {
          id: assetToEdit.id,
          type: 'Feature',
          properties: assetToEdit.properties || {},
          geometry: assetToEdit.geometry,
        };
        const addedIds = drawRef.current.add(feature);
        if (addedIds?.length > 0) {
            currentFeatureIdRef.current = addedIds[0];
            setDrawnFeature(drawRef.current.get(addedIds[0]));
            calculateArea(feature);
            drawRef.current.changeMode('simple_select', { featureIds: addedIds });

            const bounds = calculateBounds(assetToEdit.geometry);
            if (bounds && mapRef.current) {
                try {
                    // Use the existing bearing when fitting bounds on load
                    const currentBearing = mapRef.current.getBearing();
                    mapRef.current.fitBounds(bounds, {
                        padding: 80,
                        maxZoom: 17,
                        duration: 0,
                        bearing: currentBearing // Preserve bearing
                    });
                } catch (e) {
                    console.error("Fit bounds error on edit load:", e);
                }
            }
        }
      }
    }

  }, [assetToEdit, isMapLoaded, calculateArea]);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    mapRef.current = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [-98.5795, 39.8283],
      zoom: 3.5,
      preserveDrawingBuffer: true,
    });

    drawRef.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      userProperties: true,
    });

    const geocoder = new MapboxGeocoder({
        accessToken: mapboxgl.accessToken,
        mapboxgl: mapboxgl,
        marker: false,
        placeholder: 'Search for address or place',
    });

    mapRef.current.addControl(geocoder, 'top-left');
    mapRef.current.addControl(drawRef.current, 'top-left');
    mapRef.current.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');
    mapRef.current.addControl(new mapboxgl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true
    }), 'top-right');

    geocoder.on('result', (e) => {
        if (mapRef.current && e.result?.geometry?.coordinates) {
            mapRef.current.flyTo({ center: e.result.geometry.coordinates, zoom: 15 });
        }
    });


    const updateDrawState = (event) => {
      if (!drawRef.current) return;
      const data = drawRef.current.getAll();
      let currentFeature = null;

      if (data.features.length > 1) {
        const idsToDelete = data.features.slice(0, -1).map(f => f.id);
        drawRef.current.delete(idsToDelete);
        currentFeature = data.features[data.features.length - 1];
      } else if (data.features.length === 1) {
        currentFeature = data.features[0];
      }

      if (currentFeature) {
         currentFeatureIdRef.current = currentFeature.id;
         setDrawnFeature(currentFeature);
         calculateArea(currentFeature);
         if (event?.type === 'draw.create' || event?.type === 'draw.update') {
           setTimeout(() => {
               if (drawRef.current?.getMode() !== 'simple_select') {
                   drawRef.current?.changeMode('simple_select', { featureIds: [currentFeature.id] });
               }
           }, 50);
         }
      } else {
         currentFeatureIdRef.current = null;
         setDrawnFeature(null);
         setAreaHectares(0);
      }
      setStatusMessage('');
    };

    const handleDrawCreate = (e) => {
        const allFeatures = drawRef.current?.getAll().features || [];
        if (allFeatures.length > 1) {
            const idsToDelete = allFeatures.filter(f => f.id !== e.features[0].id).map(f => f.id);
            if (idsToDelete.length > 0) {
                drawRef.current?.delete(idsToDelete);
            }
        }
        currentFeatureIdRef.current = e.features[0]?.id;
        updateDrawState({features: [e.features[0]]});
    };

    const handleDrawUpdateOrSelect = (e) => updateDrawState(e);
    const handleDrawDelete = () => updateDrawState();

    mapRef.current.on('load', () => setIsMapLoaded(true));
    mapRef.current.on('draw.create', handleDrawCreate);
    mapRef.current.on('draw.update', handleDrawUpdateOrSelect);
    mapRef.current.on('draw.delete', handleDrawDelete);
    mapRef.current.on('draw.selectionchange', handleDrawUpdateOrSelect);

    const resizeObserver = new ResizeObserver(() => mapRef.current?.resize());
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      if (mapContainerRef.current) {
        resizeObserver.unobserve(mapContainerRef.current);
      }
      mapRef.current?.remove();
      mapRef.current = null;
      drawRef.current = null;
      setIsMapLoaded(false);
    };
  }, [calculateArea]);


  const uploadCroppedImage = useCallback(async (assetId, featureGeometry) => {
    if (!mapRef.current || !featureGeometry || !user?.uid) {
      throw new Error("Missing required data for image upload.");
    }

    // Ensure the map is fully idle before capturing
    if (!mapRef.current.isStyleLoaded() || !mapRef.current.areTilesLoaded()) {
        await new Promise(resolve => mapRef.current.once('idle', resolve));
    }
     // Add an extra short delay just in case, after map reports idle
     await new Promise(resolve => setTimeout(resolve, 50));

    const croppedBlob = await cropMapCanvasToBlob(mapRef.current, featureGeometry);
    if (!croppedBlob) {
      throw new Error("Failed to generate cropped image blob.");
    }

    const imagePath = `assetImages/${user.uid}/${assetId}_preview.png`;
    const imageStorageRef = storageRef(storage, imagePath);
    const uploadTask = uploadBytesResumable(imageStorageRef, croppedBlob);

    return new Promise((resolve, reject) => {
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          setSaveProgress(progress);
        },
        (error) => {
          console.error("Image upload error:", error);
          reject(new Error(`Image upload failed: ${error.code}`));
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve(downloadURL);
          } catch (error) {
            console.error("Error getting download URL:", error);
            reject(new Error("Failed to get image download URL."));
          }
        }
      );
    });
  }, [user?.uid]);

  const handleConfirm = async () => {
    setStatusMessage('');
    if (!drawnFeature?.geometry || drawnFeature.geometry.type !== 'Polygon') {
      setStatusMessage('Please draw a valid polygon area on the map.');
      return;
    }
     if (drawnFeature.geometry.coordinates[0]?.length < 4) {
      setStatusMessage('Polygon must have at least 3 points.');
      return;
    }
    if (!assetName.trim()) {
      setStatusMessage('Please enter a name for the asset.');
      return;
    }

    setIsSaving(true);
    setStatusMessage(isEditing ? 'Updating asset...' : 'Saving asset...');
    setSaveProgress(0);

    let imageUrl = assetToEdit?.imageUrl || null;
    let gridCenters = [];

    try {
      const assetId = isEditing ? assetToEdit.id : push(ref(db, `users/${user.uid}/assets`)).key;
      if (!assetId) throw new Error("Failed to generate asset ID.");

      gridCenters = calculateGridCenters(drawnFeature);

      const finalAreaSqMeters = turf.area(drawnFeature);
      const finalAreaHectares = finalAreaSqMeters / 10000;

      setStatusMessage('Processing map preview...');
      const bounds = calculateBounds(drawnFeature.geometry);
       if (bounds && mapRef.current) {
           try {
               // --- REVISED MODIFICATION START ---
               // Get the current map bearing
               const currentBearing = mapRef.current.getBearing();

               // Fit bounds instantly (duration 0) while preserving bearing
               mapRef.current.fitBounds(bounds, {
                   padding: 20,
                   maxZoom: 18,
                   duration: 0, // Set duration to 0 for instant transition
                   bearing: currentBearing // Pass the current bearing
               });

               // Wait for the map to be completely idle after the instant transition
               await new Promise(resolve => mapRef.current.once('idle', resolve));
               // --- REVISED MODIFICATION END ---

           } catch (fitError) { console.warn("Fit bounds before capture failed:", fitError); }
       }

      imageUrl = await uploadCroppedImage(assetId, drawnFeature.geometry);

      const assetData = {
        name: assetName.trim(),
        notes: assetNotes.trim(),
        geometry: drawnFeature.geometry,
        properties: drawnFeature.properties || {},
        areaHectares: finalAreaHectares,
        userId: user.uid,
        imageUrl: imageUrl,
        gridCenters: gridCenters,
        ...(isEditing
          ? { modifiedTimestamp: serverTimestamp() }
          : { timestamp: serverTimestamp() }
        ),
      };

      setStatusMessage('Finalizing save...');
      const assetDbRef = ref(db, `users/${user.uid}/assets/${assetId}`);
      await update(assetDbRef, assetData);

      setIsSaving(false);
      onClose();

    } catch (err) {
      console.error("Saving error:", err);
      setStatusMessage(`Save failed: ${err.message}`);
      setIsSaving(false);
      setSaveProgress(0);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      onClose();
    }
  }

  return (
    <div className={styles.popupOverlay} onClick={handleClose}>
      <div className={styles.popupContent} onClick={(e) => e.stopPropagation()}>
        <button
          className={styles.popupCloseButton}
          onClick={handleClose}
          disabled={isSaving}
          aria-label="Close popup"
        >
          <X size={24} />
        </button>

        <h2>{isEditing ? 'Edit Land Asset' : 'Add New Land Asset'}</h2>

        <p className={styles.instructions}>
          Use the map tools to define your land area. Complete the selection by selecting the first point again, then save.
        </p>

        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label htmlFor="assetName">Asset Name</label>
            <input
              type="text"
              id="assetName"
              value={assetName}
              onChange={(e) => setAssetName(e.target.value)}
              placeholder="e.g., North Field, Orchard Patch"
              required
              disabled={isSaving}
              className={styles.inputField}
            />
          </div>

          <div className={styles.formGroup}>
             <label htmlFor="assetArea">Calculated Area</label>
             <div className={styles.areaDisplay}>
               {areaHectares > 0 ? `${areaHectares.toFixed(3)} hectares` : 'Draw a polygon'}
             </div>
          </div>

          <div className={`${styles.formGroup} ${styles.notesGroup}`}>
            <label htmlFor="assetNotes">Notes (Optional)</label>
            <textarea
              id="assetNotes"
              value={assetNotes}
              onChange={(e) => setAssetNotes(e.target.value)}
              placeholder="e.g., Soil type, irrigation details, planned crops..."
              rows="3"
              disabled={isSaving}
              className={styles.textareaField}
            />
          </div>

          <div className={`${styles.formGroup} ${styles.mapGroup}`}>
             <div className={styles.mapContainerPopup} ref={mapContainerRef}>
               {!isMapLoaded && <div className={styles.mapLoadingOverlay}><Loader size={30} className={styles.loadingSpinner}/> Loading Map...</div>}
             </div>
          </div>
        </div>


        {(statusMessage || isSaving) && (
          <div className={`${styles.statusBox} ${statusMessage.startsWith('Save failed') ? styles.errorBox : ''}`}>
            {isSaving && <Loader size={16} className={styles.loadingSpinnerInline} />}
            {statusMessage}
            {isSaving && saveProgress > 0 && saveProgress < 100 && ` (Uploading: ${saveProgress}%)`}
          </div>
        )}

        <div className={styles.popupActions}>
          <button
            onClick={handleClose}
            className={`${styles.button} ${styles.cancelButton}`}
            disabled={isSaving}
            type="button"
          >
            Cancel
          </button>
           <button
            onClick={handleConfirm}
            className={`${styles.button} ${styles.buttonPrimary}`}
            disabled={isSaving || !drawnFeature || !assetName.trim()}
            type="button"
          >
            {isSaving ? 'Saving...' : (isEditing ? 'Update Asset' : 'Save Asset')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddLandAssetPopup;
