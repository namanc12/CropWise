import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { getDatabase, ref, get } from "firebase/database";
import { db } from '../api/firebaseConfig';
import { fetchWeatherApi } from 'openmeteo';

import soilTextureSrc from '../assets/soil_texture5.jpg';
import daylightTextureSrc from '../assets/daylight.png';
import wheatModelSrc from '../assets/wheat/scene.glb';
import islandModelSrc from '../assets/island/island.glb';
import croptextModelSrc from '../assets/croptext/result.glb';
import fieldModelSrc from '../assets/wheat_field_low_poly/scene.glb';

import styles from './Farm3js.module.css';

async function getWeatherBulk(coordsArray) {
  const allPromises = [];
  if (!Array.isArray(coordsArray) || coordsArray.length === 0) {
      console.error("Invalid coordsArray provided to getWeatherBulk");
      return { temps: [], humidities: [], precipitations: [], clouds: [], wind120m: [] };
  }
  const numRows = coordsArray.length;

  for (let y = 0; y < numRows; y++) {
    if (!Array.isArray(coordsArray[y])) {
        console.warn(`Row ${y} in coordsArray is invalid.`);
        continue; 
    }
    const numCols = coordsArray[y].length;
    for (let x = 0; x < numCols; x++) {
      if (!Array.isArray(coordsArray[y][x]) || coordsArray[y][x].length < 2) {
          console.warn(`Coordinate at [${y}][${x}] is invalid.`);
          continue; 
      }
      const promise = (async () => {
        try {
          const lat = coordsArray[y][x][0];
          const lon = coordsArray[y][x][1];
          if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
              throw new Error(`Invalid lat/lon values: ${lat}, ${lon}`);
          }
          const parms = {
            "latitude": lat,
            "longitude": lon,
            "daily": ["weather_code", "uv_index_max"],
            "hourly": ["temperature_2m", "relative_humidity_2m", "weather_code", "cloud_cover", "precipitation", "wind_speed_120m"],
            "timezone": "GMT",
            "apikey": "fTcQWIiIg89maNKW" 
          };
          const url = "https://customer-api.open-meteo.com/v1/forecast";
          const responses = await fetchWeatherApi(url, parms);
          const response = responses[0]; 

          if (!response || !response.hourly()) {
              throw new Error("Invalid weather API response structure.");
          }

          const getAverage = (variableIndex, sliceLength = 5) => {
              const variable = response.hourly().variables(variableIndex);
              if (!variable) return 0; 
              const values = variable.valuesArray();
              if (!values || values.length === 0) return 0; 
              const slicedValues = values.slice(0, sliceLength);
              if (slicedValues.length === 0) return 0; 
              const sum = slicedValues.reduce((acc, current) => acc + (current || 0), 0); 
              return sum / slicedValues.length;
          };

          return {
            y, x,
            temp: getAverage(0), 
            humidity: getAverage(1), 
            wind120m: getAverage(5), 
            precipitation: getAverage(4), 
            cloud: getAverage(3) 
          };
        } catch (error) {
          console.error(`Error getting weather for coords [${coordsArray[y]?.[x]?.join(',') || 'invalid'}]:`, error);
          return {
            y, x, temp: 20, wind120m: 0, humidity: 50, precipitation: 0, cloud: 25
          };
        }
      })();
      allPromises.push(promise);
    }
  }
  const results = await Promise.all(allPromises);

  const temps = Array(numRows).fill().map(() => []);
  const humidities = Array(numRows).fill().map(() => []);
  const precipitations = Array(numRows).fill().map(() => []);
  const clouds = Array(numRows).fill().map(() => []);
  const wind120m = Array(numRows).fill().map(() => []);

  results.forEach(result => {
      if (!temps[result.y]) temps[result.y] = [];
      if (!humidities[result.y]) humidities[result.y] = [];
      if (!precipitations[result.y]) precipitations[result.y] = [];
      if (!clouds[result.y]) clouds[result.y] = [];
      if (!wind120m[result.y]) wind120m[result.y] = [];

      temps[result.y][result.x] = result.temp;
      humidities[result.y][result.x] = result.humidity;
      precipitations[result.y][result.x] = result.precipitation;
      clouds[result.y][result.x] = result.cloud;
      wind120m[result.y][result.x] = result.wind120m;
  });
  return { temps, humidities, precipitations, clouds, wind120m };
}

async function getWeather(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
      console.error(`Invalid lat/lon values passed to getWeather: ${lat}, ${lon}`);
      return { temp: 20, humidity: 50, precipitation: 0, cloud: 25 }; 
  }
  const parms = {
    "latitude": lat,
    "longitude": lon,
    "daily": ["weather_code", "uv_index_max"],
    "hourly": ["temperature_2m", "relative_humidity_2m", "weather_code", "cloud_cover", "precipitation"],
    "timezone": "GMT",
    "apikey": "fTcQWIiIg89maNKW" 
  };
  const url= "https://customer-api.open-meteo.com/v1/forecast";
  try {
      const responses = await fetchWeatherApi(url, parms);
      const response = responses[0]; 

      if (!response || !response.hourly()) {
          throw new Error("Invalid weather API response structure.");
      }

      const getAverage = (variableIndex, sliceLength = 5) => {
          const variable = response.hourly().variables(variableIndex);
          if (!variable) return 0; 
          const values = variable.valuesArray();
          if (!values || values.length === 0) return 0; 
          const slicedValues = values.slice(0, sliceLength);
          if (slicedValues.length === 0) return 0; 
          const sum = slicedValues.reduce((acc, current) => acc + (current || 0), 0);
          return sum / slicedValues.length;
      };

      return {
        temp: getAverage(0), 
        humidity: getAverage(1), 
        precipitation: getAverage(4), 
        cloud: getAverage(3) 
      };
  } catch (error) {
      console.error(`Error getting weather for single coord (${lat}, ${lon}):`, error);
      return { temp: 20, humidity: 50, precipitation: 0, cloud: 25 };
  }
}

async function getCropYields(coords, nutrient) {
  const allPromises = [];
  if (!Array.isArray(coords) || coords.length === 0) {
      console.error("Invalid coords provided to getCropYields");
      return { crops: [], yields: [] };
  }
  const numRows = coords.length;

  for (let y = 0; y < numRows; y++) {
    if (!Array.isArray(coords[y])) {
        console.warn(`Row ${y} in coords is invalid.`);
        continue;
    }
    const numCols = coords[y].length;
    for (let x = 0; x < numCols; x++) {
      if (!Array.isArray(coords[y][x]) || coords[y][x].length < 2) {
          console.warn(`Coordinate at [${y}][${x}] is invalid.`);
          continue; 
      }
      const promise = (async () => {
        try {
          const lat = coords[y][x][0];
          const lon = coords[y][x][1];
           if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
               throw new Error(`Invalid lat/lon values: ${lat}, ${lon}`);
           }
          const weatherData = await getWeather(lat, lon);
          const modelInput = {
            "humidity": weatherData.humidity,
            "temperature": weatherData.temp,
            "nutrient": nutrient
          };
          const apiUrl = 'https://6903-43-245-155-23.ngrok-free.app/predict_yield';
          const response = await fetch(apiUrl, {
            method: 'POST',
            body: JSON.stringify(modelInput),
            headers: { 'Content-Type': 'application/json' }
          });

          if (!response.ok) {
              throw new Error(`API request failed with status ${response.status}`);
          }

          const prediction = await response.json();

          // Validate prediction structure
          if (!prediction || !prediction.yields || !Array.isArray(prediction.yields) || prediction.yields.length === 0 || !Array.isArray(prediction.yields[0]) || prediction.yields[0].length < 2) {
              throw new Error("Invalid prediction response structure.");
          }

          return {
            y, x,
            cropName: prediction.yields[0][0],
            yieldValue: prediction.yields[0][1]
          };
        } catch (error) {
          console.error(`Error processing coords [${coords[y]?.[x]?.join(',') || 'invalid'}]:`, error);
          return { y, x, cropName: "Error", yieldValue: 0 };
        }
      })();
      allPromises.push(promise);
    }
  }
  const results = await Promise.all(allPromises);

  const crops = Array(numRows).fill().map(() => []);
  const yields = Array(numRows).fill().map(() => []);

  results.forEach(result => {
      if (!crops[result.y]) crops[result.y] = [];
      if (!yields[result.y]) yields[result.y] = [];

      crops[result.y][result.x] = result.cropName;
      yields[result.y][result.x] = result.yieldValue;
  });
  return { crops, yields };
}


const Farm3js = ({ user }) => {
  const { assetId } = useParams();
  const [assetData, setAssetData] = useState(null);
  const [isLoadingAsset, setIsLoadingAsset] = useState(true);
  const [coordinates, setCoordinates] = useState([]);
  const [hectaresPerCell, setHectaresPerCell] = useState(0);
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const orbitRef = useRef(null);
  const gridMaterialRef = useRef(null);
  const textSpriteRef = useRef(null);
  const textCanvasRef = useRef(null);
  const textContextRef = useRef(null);
  const textTextureRef = useRef(null);
  const textMaterialRef = useRef(null);
  const highlightMeshRef = useRef(null);
  const planeMeshRef = useRef(null);
  const fieldModelRef = useRef(null);
  const originalMaterialsRef = useRef(new Map());
  const isFieldHoveredRef = useRef(false);
  const objectsRef = useRef([]);
  const windParticlesRef = useRef([]);
  const cloudContainerRef = useRef(null);
  const cloudMeshesRef = useRef([]);
  const rainContainerRef = useRef(null);
  const raindropsRef = useRef([]);
  const colorGridContainerRef = useRef(null);
  const intensityGridRef = useRef(Array(16).fill().map(() => Array(16).fill(10)));
  const bestPlantGridRef = useRef(Array(16).fill().map(() => Array(16).fill("Loading...")));
  const temperatureGridRef = useRef(Array(16).fill().map(() => Array(16).fill("Loading...")));
  const humidityGridRef = useRef(Array(16).fill().map(() => Array(16).fill("Loading...")));
  const precipitationGridRef = useRef(Array(16).fill().map(() => Array(16).fill("Loading...")));
  const cloudGrid2Ref = useRef(Array(16).fill().map(() => Array(16).fill("Loading...")));
  const windGrid2Ref = useRef(Array(16).fill().map(() => Array(16).fill("Loading...")));
  const cloudGridRef = useRef(Array(16).fill().map(() => Array(16).fill(false)));
  const rainfallGridRef = useRef(Array(16).fill().map(() => Array(16).fill(false)));
  const windGridRef = useRef(Array(16).fill().map(() => Array(16).fill(false)));
  const minIntensityRef = useRef(Infinity);
  const maxIntensityRef = useRef(-Infinity);
  const rangeIntensityRef = useRef(0);
  const wheatModelRef = useRef(null);
  const animationFrameIdRef = useRef(null);


  const [weatherData, setWeatherData] = useState({
    temp: "Loading...", humidity: "Loading...", precipitation: "Loading...", cloud: "Loading...", wind120m: "Loading..."
  });
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);
  const [isYieldLoading, setIsYieldLoading] = useState(true);

  const reshapeGridCenters = (gridCenters) => {
      const reshapedCoords = Array(16).fill(null).map(() => Array(16).fill([0, 0]));
      if (!gridCenters || !Array.isArray(gridCenters)) {
          console.warn("Grid centers data missing or invalid.");
          return reshapedCoords;
      }

      for (let i = 0; i < 16; i++) {
          for (let j = 0; j < 16; j++) {
              const index = i * 16 + j;
              if (index < gridCenters.length && Array.isArray(gridCenters[index]) && gridCenters[index].length === 2) {
                  const [lon, lat] = gridCenters[index];
                  if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
                    reshapedCoords[i][j] = [lat, lon]; 
                  } else {
                    console.warn(`Invalid coordinate data at index ${index}: lon=${lon}, lat=${lat}. Using default [0,0].`);
                  }
              } else {
                  // Log if data is missing for a specific cell, keep default
                  if (index >= gridCenters.length) {
                  } else {
                    console.warn(`Invalid grid center structure at index ${index}. Using default [0,0].`);
                  }
              }
          }
      }
      return reshapedCoords;
  };


  useEffect(() => {
    const fetchAssetData = async () => {
      if (!user || !assetId) {
        console.log("User or Asset ID missing, skipping fetch.");
        setIsLoadingAsset(false);
        return;
      }
      console.log("Fetching asset data for:", assetId);
      setIsLoadingAsset(true);
      try {
        const assetRef = ref(db, `users/${user.uid}/assets/${assetId}`);
        const snapshot = await get(assetRef);
        if (snapshot.exists()) {
          const data = snapshot.val();
          console.log("Asset data fetched:", data);
          setAssetData(data);

          const reshapedCoords = reshapeGridCenters(data.gridCenters);
          setCoordinates(reshapedCoords);
          console.log("Processed coordinates:", reshapedCoords);


          if (data.areaHectares && typeof data.areaHectares === 'number') {
            setHectaresPerCell(data.areaHectares / 256);
             console.log("Calculated hectares per cell:", data.areaHectares / 256);
          } else {
            console.warn("Area hectares missing or invalid, setting per cell to 0.");
            setHectaresPerCell(0);
          }

        } else {
          console.error("Asset not found for ID:", assetId);
          setAssetData(null);
          setCoordinates(Array(16).fill().map(() => Array(16).fill([0,0])));
          setHectaresPerCell(0);
        }
      } catch (error) {
        console.error("Error fetching asset data:", error);
        setAssetData(null);
        setCoordinates(Array(16).fill().map(() => Array(16).fill([0,0])));
        setHectaresPerCell(0);
      } finally {
        setIsLoadingAsset(false);
         console.log("Finished fetching asset data.");
      }
    };
    fetchAssetData();
  }, [assetId, user]);

 useEffect(() => {
    
    if (isLoadingAsset || !assetData || coordinates.length === 0 || !mountRef.current) {
         console.log("Skipping Three.js setup: Loading asset or missing data/mount point.");
         return;
    }
     console.log("Starting Three.js setup...");

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 13, -25);
    cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    while (mountRef.current.firstChild) {
        mountRef.current.removeChild(mountRef.current.firstChild);
    }
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.update();
    orbitRef.current = orbit;

    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous'); 
    const gltfloader = new GLTFLoader();

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8); 
    scene.add(ambientLight);
    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 1.0); 
    directionalLight1.position.set(5, 15, 5);
    directionalLight1.castShadow = true;
    directionalLight1.shadow.mapSize.width = 2048;
    directionalLight1.shadow.mapSize.height = 2048;
    directionalLight1.shadow.camera.near = 1;
    directionalLight1.shadow.camera.far = 35;
    directionalLight1.shadow.camera.left = -10;
    directionalLight1.shadow.camera.right = 10;
    directionalLight1.shadow.camera.top = 10;
    directionalLight1.shadow.camera.bottom = -10;
    directionalLight1.shadow.bias = -0.0005;
    scene.add(directionalLight1);
    scene.add(directionalLight1.target); 

    const soilTexture = textureLoader.load(soilTextureSrc);
    soilTexture.wrapS = THREE.RepeatWrapping;
    soilTexture.wrapT = THREE.RepeatWrapping;
    soilTexture.repeat.set(4, 4);
    const soilMaterial = new THREE.MeshPhongMaterial({ map: soilTexture, color: 0x755c48 });
    const soilGeometry = new THREE.BoxGeometry(16, 2, 16);
    const soilMesh = new THREE.Mesh(soilGeometry, soilMaterial);
    soilMesh.position.y = -1.03;
    soilMesh.receiveShadow = true;
    scene.add(soilMesh);

    const planeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 16),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, visible: false })
    );
    planeMesh.rotateX(-Math.PI / 2);
    scene.add(planeMesh);
    planeMeshRef.current = planeMesh;

    gridMaterialRef.current = new THREE.MeshPhongMaterial({
       side: THREE.DoubleSide,
       transparent: true,
       map: null,
       color: 0xaaaaaa 
    });

    if (assetData.imageUrl) {
       console.log("Loading grid texture from:", assetData.imageUrl);
       textureLoader.load(
         assetData.imageUrl,
         (loadedTexture) => {
           if (gridMaterialRef.current) {
             gridMaterialRef.current.map = loadedTexture;
             gridMaterialRef.current.color = new THREE.Color(0xffffff); 
             gridMaterialRef.current.needsUpdate = true;
             console.log("Grid texture loaded successfully.");
           }
         },
         undefined, 
         (error) => {
           console.error('Error loading asset image texture:', error);
           if (gridMaterialRef.current) {
              gridMaterialRef.current.needsUpdate = true;
           }
         }
       );
    } else {
        console.warn("Asset image URL is missing. Using fallback color for grid.");
        if (gridMaterialRef.current) {
            gridMaterialRef.current.needsUpdate = true;
        }
    }

    const gridGeometry = new THREE.PlaneGeometry(16, 16);
    const gridMesh = new THREE.Mesh(gridGeometry, gridMaterialRef.current);
    gridMesh.rotateX(-Math.PI / 2);
    gridMesh.position.y = -0.01; 
    gridMesh.receiveShadow = true; 
    scene.add(gridMesh);

    const gridHelper = new THREE.GridHelper(16, 16);
    gridHelper.position.y = 0.001; 
    scene.add(gridHelper);

    cloudContainerRef.current = new THREE.Group();
    scene.add(cloudContainerRef.current);
    rainContainerRef.current = new THREE.Group();
    scene.add(rainContainerRef.current);
    colorGridContainerRef.current = new THREE.Group();
    scene.add(colorGridContainerRef.current);

    const highlightMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial({ color: 0xFFFFFF, side: THREE.DoubleSide, transparent: true, opacity: 0.3 })
    );
    highlightMesh.rotateX(-Math.PI / 2);
    highlightMesh.position.set(0.5, 0.01, 0.5); 
    highlightMesh.visible = false; 
    highlightMesh.renderOrder = 2; 
    scene.add(highlightMesh);
    highlightMeshRef.current = highlightMesh;


    // --- Load Models ---
    gltfloader.load(wheatModelSrc, (gltfScene) => {
      wheatModelRef.current = gltfScene.scene;
      wheatModelRef.current.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.renderOrder = 10;
        }
      });
      wheatModelRef.current.position.set(1000, 1000, 1000); 
      scene.add(wheatModelRef.current);
       console.log("Wheat model loaded.");
    }, undefined, (error) => console.error("Error loading wheat model:", error));

    gltfloader.load(islandModelSrc, (gltfScene) => {
      const islandModel = gltfScene.scene;
      islandModel.scale.set(0.4, 0.4, 0.4);
      islandModel.position.set(0, 0, 15);
      islandModel.traverse((child) => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
      });
      scene.add(islandModel);
       console.log("Island model loaded.");
    }, undefined, (error) => console.error("Error loading island model:", error));

    gltfloader.load(croptextModelSrc, (gltfScene) => {
      const croptextModel = gltfScene.scene;
      croptextModel.scale.set(2, 2, 2);
      croptextModel.position.set(0, 8, 11);
      croptextModel.rotation.y = Math.PI;
      croptextModel.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
          child.castShadow = true;
        }
      });
      scene.add(croptextModel);
       console.log("Croptext model loaded.");
    }, undefined, (error) => console.error("Error loading croptext model:", error));

    gltfloader.load(fieldModelSrc, (gltfScene) => {
      fieldModelRef.current = gltfScene.scene;
      fieldModelRef.current.scale.set(0.004, 0.004, 0.004);
      fieldModelRef.current.position.set(1, 3.8, 13);
      fieldModelRef.current.traverse((child) => {
        if (child.isMesh) {
          child.userData.isField = true;
          originalMaterialsRef.current.set(child.uuid, child.material.clone());
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(fieldModelRef.current);
       console.log("Field model loaded.");
    }, undefined, (error) => console.error("Error loading field model:", error));

    textureLoader.load(daylightTextureSrc, (texture) => {
        scene.background = texture;
         console.log("Background texture loaded.");
    }, undefined, (err) => console.error('Error loading background texture:', err));

    createTextSprite();
    createColorGrid();

    const fetchInitialData = async () => {
        if (coordinates && coordinates.length > 0 && coordinates[0] && coordinates[0].length > 0) {
             console.log("Fetching initial weather and yield data...");
            setIsLoadingWeather(true);
            setIsYieldLoading(true);
            try {
                await fetchWeatherData();
                await fetchYieldData("Calories"); 
                 console.log("Initial weather and yield data fetched.");
            } catch (error) {
                console.error("Error fetching initial data:", error);
            } finally {
                setIsLoadingWeather(false);
                setIsYieldLoading(false);
            }
        } else {
             console.warn("Coordinates not ready, skipping initial weather/yield fetch.");
        }
    };

    fetchInitialData(); 

    const animate = (time) => {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      animateWind(time);
      animateClouds(time);
      animateRain();
      updateSpriteRotation();
      orbitRef.current.update();
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };
    animate(0); 

    const handleResize = () => {
      if (cameraRef.current && rendererRef.current) {
        cameraRef.current.aspect = window.innerWidth / window.innerHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      }
    };

    const mousePosition = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();

    const handleMouseMove = (e) => {
        if (!cameraRef.current || !planeMeshRef.current || !highlightMeshRef.current || !rendererRef.current || !rendererRef.current.domElement) {
            console.warn("Skipping mouse move calculation: Required refs not ready.");
            return;
        }

        const rect = rendererRef.current.domElement.getBoundingClientRect();

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        mousePosition.x = (x / rect.width) * 2 - 1;
        mousePosition.y = -(y / rect.height) * 2 + 1;


        raycaster.setFromCamera(mousePosition, cameraRef.current);


        const intersectsPlane = raycaster.intersectObject(planeMeshRef.current);
        const intersectsField = fieldModelRef.current ? raycaster.intersectObject(fieldModelRef.current, true) : [];

        let cursorStyle = 'auto'; 

        if (intersectsPlane.length > 0) {
            const intersect = intersectsPlane[0];

            const highlightPos = new THREE.Vector3().copy(intersect.point).floor().addScalar(0.5);

            highlightMeshRef.current.position.set(highlightPos.x, 0.01, highlightPos.z);
            highlightMeshRef.current.visible = true;


            if (textSpriteRef.current) {
                textSpriteRef.current.visible = true;
                textSpriteRef.current.position.set(highlightPos.x, 2, highlightPos.z); 
                const gridX = Math.max(0, Math.min(15, Math.floor(highlightPos.x + 8)));
                const gridZ = Math.max(0, Math.min(15, Math.floor(highlightPos.z + 8)));
                updateTextSprite(gridX, gridZ); 
            }
            cursorStyle = 'pointer';

        } else {
            highlightMeshRef.current.visible = false;
            if (textSpriteRef.current) {
                textSpriteRef.current.visible = false;
            }
        }

        if (intersectsField.length > 0) {
            if (!isFieldHoveredRef.current) {
                isFieldHoveredRef.current = true;
            }
            cursorStyle = 'pointer'; 
        } else {
            if (isFieldHoveredRef.current) {
                isFieldHoveredRef.current = false;
            }
        }
         document.body.style.cursor = cursorStyle;
    };

    window.addEventListener('mousemove', handleMouseMove);

    const handleMouseDown = (event) => {
        if (event.target.closest('#field-info-panel')) return;

        if (isFieldHoveredRef.current) {
            showFieldInfoPanel();
        } else {
            hideFieldInfoPanel();
        }

        if (highlightMeshRef.current.visible && wheatModelRef.current) {
            const intersectsPlane = raycaster.intersectObject(planeMeshRef.current);
            if (intersectsPlane.length > 0) {
                 const intersect = intersectsPlane[0];
                 const highlightPos = new THREE.Vector3().copy(intersect.point).floor().addScalar(0.5);
                 const gridX = Math.max(0, Math.min(15, Math.floor(highlightPos.x + 8)));
                 const gridZ = Math.max(0, Math.min(15, Math.floor(highlightPos.z + 8)));

                 const plantType = bestPlantGridRef.current[gridZ]?.[gridX] ?? "Unknown";
                 console.log(`Planting ${plantType} at grid position (${gridZ}, ${gridX})`);

                 const wheatClone = wheatModelRef.current.clone();
                 wheatClone.position.copy(highlightMeshRef.current.position);
                 wheatClone.position.y = 0.5; 
                 wheatClone.scale.set(1, 1, 1); 
                 wheatClone.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                 });
                 sceneRef.current.add(wheatClone);
                 objectsRef.current.push(wheatClone);
            }
        }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);

    return () => {
      console.log("Cleaning up Three.js scene...");
       if (animationFrameIdRef.current) {
           cancelAnimationFrame(animationFrameIdRef.current);
           animationFrameIdRef.current = null;
       }
      // Remove event listeners
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      // Dispose Three.js objects
      if (orbitRef.current) orbitRef.current.dispose();
      if (sceneRef.current) {
        sceneRef.current.traverse(object => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
                // Handle array of materials
                if (Array.isArray(object.material)) {
                    object.material.forEach(material => {
                        if (material.map) material.map.dispose();
                        material.dispose();
                    });
                } else { 
                    if (object.material.map) object.material.map.dispose();
                    object.material.dispose();
                }
            }
        });
         // Dispose background texture if it exists
         if (sceneRef.current.background instanceof THREE.Texture) {
             sceneRef.current.background.dispose();
         }
        sceneRef.current = null;
      }
       if (rendererRef.current) {
            rendererRef.current.dispose(); 
            if (mountRef.current && rendererRef.current.domElement) {
                mountRef.current.removeChild(rendererRef.current.domElement); 
            }
            rendererRef.current = null;
       }
       // Clear refs holding models or groups if necessary
       wheatModelRef.current = null;
       fieldModelRef.current = null;

       hideFieldInfoPanel();
       console.log("Three.js cleanup complete.");
    };

 }, [isLoadingAsset, assetData, coordinates]);



 const fetchWeatherData = async () => {
    if (!coordinates || coordinates.length === 0 || !coordinates[0] || coordinates[0].length === 0) {
        console.warn("Coordinates not available for weather fetch.");
        return;
    }
    console.log("Fetching weather data...");
    setIsLoadingWeather(true);
    try {
        const data = await getWeatherBulk(coordinates); 
        console.log("Weather data received:", data);

        // Calculate averages
        let tempSum = 0, humiditySum = 0, precipSum = 0, cloudSum = 0, windSum = 0;
        let count = 0;
        if (data && data.temps && Array.isArray(data.temps)) {
            for (let z = 0; z < data.temps.length; z++) {
                if (data.temps[z] && Array.isArray(data.temps[z])) {
                    for (let x = 0; x < data.temps[z].length; x++) {
                        if (typeof data.temps[z][x] === 'number') tempSum += data.temps[z][x];
                        if (data.humidities?.[z]?.[x] && typeof data.humidities[z][x] === 'number') humiditySum += data.humidities[z][x];
                        if (data.precipitations?.[z]?.[x] && typeof data.precipitations[z][x] === 'number') precipSum += data.precipitations[z][x];
                        if (data.clouds?.[z]?.[x] && typeof data.clouds[z][x] === 'number') cloudSum += data.clouds[z][x];
                        if (data.wind120m?.[z]?.[x] && typeof data.wind120m[z][x] === 'number') windSum += data.wind120m[z][x];
                        count++;
                    }
                }
            }
        } else {
            console.warn("Weather data structure is invalid or empty.");
        }


        const avgTemp = count > 0 ? tempSum / count : 0;
        const avgHumidity = count > 0 ? humiditySum / count : 0;
        const avgPrecip = count > 0 ? precipSum / count : 0;
        const avgCloud = count > 0 ? cloudSum / count : 0;
        const avgWind = count > 0 ? windSum / count : 0;

        setWeatherData({
            temp: avgTemp, humidity: avgHumidity, precipitation: avgPrecip, cloud: avgCloud, wind120m: avgWind,
        });

        temperatureGridRef.current = data.temps || [];
        humidityGridRef.current = data.humidities || [];
        precipitationGridRef.current = data.precipitations || [];
        cloudGrid2Ref.current = data.clouds || [];
        windGrid2Ref.current = data.wind120m || [];

        updateCloudAndRainEffects();

    } catch (error) {
        console.error("Error fetching weather data:", error);
         setWeatherData({ temp: "Error", humidity: "Error", precipitation: "Error", cloud: "Error", wind120m: "Error" });
    } finally {
        setIsLoadingWeather(false);
    }
 };

 const fetchYieldData = async (nutrient) => {
    if (!coordinates || coordinates.length === 0 || !coordinates[0] || coordinates[0].length === 0) {
        console.warn("Coordinates not available for yield fetch.");
        return;
    }
    setIsYieldLoading(true);
    console.log(`Fetching yield data for nutrient: ${nutrient}`);

    bestPlantGridRef.current = Array(16).fill().map(() => Array(16).fill("Loading..."));
    intensityGridRef.current = Array(16).fill().map(() => Array(16).fill(10)); 
    updateColorGrid(); 

    try {
        const data = await getCropYields(coordinates, nutrient);
        console.log(`Yield data received for ${nutrient}:`, data);

        // Update refs
        bestPlantGridRef.current = data.crops || Array(16).fill().map(() => Array(16).fill("Error"));
        intensityGridRef.current = data.yields || Array(16).fill().map(() => Array(16).fill(0));

        updateColorGrid(); 
        console.log(`Updated grids with ${nutrient} data`);

    } catch (error) {
        console.error(`Error fetching ${nutrient} yield data:`, error);
        bestPlantGridRef.current = Array(16).fill().map(() => Array(16).fill("Error"));
        intensityGridRef.current = Array(16).fill().map(() => Array(16).fill(0));
        updateColorGrid(); 
    } finally {
        setIsYieldLoading(false);
    }
 };

 const fetchNewYieldData = async (nutrient) => {
    await fetchYieldData(nutrient);
 };

 const findMinMaxValues = (grid) => {
    let min = Infinity;
    let max = -Infinity;
     if (!grid || !Array.isArray(grid)) return { min: 0, max: 1 }; /

    for (let x = 0; x < grid.length; x++) {
       if (grid[x] && Array.isArray(grid[x])) {
          for (let z = 0; z < grid[x].length; z++) {
              if (typeof grid[x][z] === 'number' && !isNaN(grid[x][z])) { 
                const value = grid[x][z];
                if (value < min) min = value;
                if (value > max) max = value;
              }
          }
       }
    }
     if (min === Infinity || max === -Infinity) {
         return { min: 0, max: 1 };
     }
    return { min, max };
 };

 const getColorForValue = (value) => {
    const redColor = new THREE.Color(0xff0000);
    const greenColor = new THREE.Color(0x00ff00);
    // Handle edge case where range is 0 or invalid refs
    const range = rangeIntensityRef.current;
    const min = minIntensityRef.current;
    let normalizedValue = 0.5; 

    if (typeof value === 'number' && !isNaN(value) && typeof range === 'number' && range > 0 && typeof min === 'number') {
       normalizedValue = (value - min) / range;
    } else if (typeof value === 'number' && !isNaN(value) && range === 0 && typeof min === 'number') {
       // If range is 0, all values are the same, decide on a color (e.g., green if value matches min)
       normalizedValue = (value === min) ? 1.0 : 0.0; 
    }

    const color = new THREE.Color();
    // Clamp normalized value between 0 and 1
    color.lerpColors(redColor, greenColor, Math.max(0, Math.min(1, normalizedValue)));
    return color;
 };

 const createColorGrid = () => {
    if (!colorGridContainerRef.current) return;
    // Clear previous tiles
    while (colorGridContainerRef.current.children.length > 0) {
      const child = colorGridContainerRef.current.children[0];
      colorGridContainerRef.current.remove(child);
      // Dispose geometry and material of the removed child
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    // Recalculate min/max based on the current intensityGridRef
    const { min, max } = findMinMaxValues(intensityGridRef.current);
    minIntensityRef.current = min;
    maxIntensityRef.current = max;
    rangeIntensityRef.current = (max - min);

    // Create new tiles
    const gridData = intensityGridRef.current;
    if (!gridData || !Array.isArray(gridData)) return;

    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
         const value = (gridData[x] && typeof gridData[x][z] === 'number' && !isNaN(gridData[x][z])) ? gridData[x][z] : minIntensityRef.current;
         const color = getColorForValue(value);
         const tileGeometry = new THREE.PlaneGeometry(1, 1);
         const tileMaterial = new THREE.MeshBasicMaterial({
           color: color, transparent: true, opacity: 0.25, side: THREE.DoubleSide
         });
         const tile = new THREE.Mesh(tileGeometry, tileMaterial);
         tile.renderOrder = 1;
         tile.position.set(x - 7.5, 0.005, z - 7.5);
         tile.rotation.x = -Math.PI / 2;
         colorGridContainerRef.current.add(tile);
      }
    }
     console.log("Color grid created/updated with new range:", minIntensityRef.current, maxIntensityRef.current);
 };

 const updateColorGrid = () => {
     createColorGrid();
 };


 const updateCloudAndRainEffects = () => {
  if (!cloudContainerRef.current || !rainContainerRef.current || !sceneRef.current) {
    console.warn("Required refs not initialized for cloud/rain effects");
    return;
  }
  
  console.log("===== WEATHER EFFECTS DEBUG =====");

  // First, calculate the values for cloud data
  const cloudValues = [];
  const cloudPositions = [];
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      if (typeof cloudGrid2Ref.current[z]?.[x] === 'number' && cloudGrid2Ref.current[z][x] > 0) {
        cloudValues.push(cloudGrid2Ref.current[z][x]);
        cloudPositions.push({z, x, value: cloudGrid2Ref.current[z][x]});
      }
    }
  }
  
  // Calculate the values for precipitation data
  const precipValues = [];
  const precipPositions = []; 
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      if (typeof precipitationGridRef.current[z]?.[x] === 'number' && precipitationGridRef.current[z][x] > 0) {
        precipValues.push(precipitationGridRef.current[z][x]);
        precipPositions.push({z, x, value: precipitationGridRef.current[z][x]});
      }
    }
  }
  
  // Calculate the values for wind data
  const windValues = [];
  const windPositions = []; 
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      if (typeof windGrid2Ref.current[z]?.[x] === 'number' && windGrid2Ref.current[z][x] > 0) {
        windValues.push(windGrid2Ref.current[z][x]);
        windPositions.push({z, x, value: windGrid2Ref.current[z][x]});
      }
    }
  }
  
  console.log(`Total cloud values collected: ${cloudValues.length}`);
  console.log(`Total precipitation values collected: ${precipValues.length}`);
  console.log(`Total wind values collected: ${windValues.length}`);
  
  console.log("=== CLOUD VALUES SAMPLE ===");
  console.log("First 10 entries:", cloudPositions.slice(0, 10));
  console.log("Last 10 entries:", cloudPositions.slice(-10));
  
  console.log("=== PRECIPITATION VALUES SAMPLE ===");
  console.log("First 10 entries:", precipPositions.slice(0, 10));
  console.log("Last 10 entries:", precipPositions.slice(-10));
  
  console.log("=== WIND VALUES SAMPLE ===");
  console.log("First 10 entries:", windPositions.slice(0, 10));
  console.log("Last 10 entries:", windPositions.slice(-10));
  
  if (cloudValues.length === 0) {
    console.log("No cloud data above 0, skipping cloud creation");
  }
  
  if (precipValues.length === 0) {
    console.log("No precipitation data above 0, skipping rain creation");
  }
  
  if (windValues.length === 0) {
    console.log("No wind data above 0, skipping wind creation");
  }
  
  // Sort values for percentile calculation
  cloudValues.sort((a, b) => a - b);
  precipValues.sort((a, b) => a - b);
  windValues.sort((a, b) => a - b);
  
  // Debug sorted arrays
  console.log("=== SORTED VALUES ===");
  console.log("Cloud values (min to max):", cloudValues.slice(0, 5), "...", cloudValues.slice(-5));
  console.log("Precipitation values (min to max):", precipValues.slice(0, 5), "...", precipValues.slice(-5));
  console.log("Wind values (min to max):", windValues.slice(0, 5), "...", windValues.slice(-5));
  
  // Calculate value ranges and variance
  if (cloudValues.length > 0) {
    const cloudMin = cloudValues[0];
    const cloudMax = cloudValues[cloudValues.length - 1];
    const cloudRange = cloudMax - cloudMin;
    console.log(`Cloud range: ${cloudMin} to ${cloudMax} (range: ${cloudRange})`);
  }
  
  if (precipValues.length > 0) {
    const precipMin = precipValues[0];
    const precipMax = precipValues[precipValues.length - 1];
    const precipRange = precipMax - precipMin;
    console.log(`Precip range: ${precipMin} to ${precipMax} (range: ${precipRange})`);
  }
  
  if (windValues.length > 0) {
    const windMin = windValues[0];
    const windMax = windValues[windValues.length - 1];
    const windRange = windMax - windMin;
    console.log(`Wind range: ${windMin} to ${windMax} (range: ${windRange})`);
  }
  
  // Find the 95th percentile (top 5%) or use max if range is small
  let cloudThreshold = 0;
  let precipThreshold = 0;
  let windThreshold = 0;
  
  if (cloudValues.length > 0) {
    const cloudMin = cloudValues[0];
    const cloudMax = cloudValues[cloudValues.length - 1];
    const cloudRange = cloudMax - cloudMin;
    if (cloudRange < (cloudMax * 0.1)) {
      cloudThreshold = cloudMax * 0.9; 
      console.log(`Cloud range too small, using 90% of max value as threshold`);
    } else {
      cloudThreshold = cloudValues[Math.floor(cloudValues.length * 0.95)];
    }
  }
  
  if (precipValues.length > 0) {
    const precipMin = precipValues[0];
    const precipMax = precipValues[precipValues.length - 1];
    const precipRange = precipMax - precipMin;
    if (precipRange < (precipMax * 0.1)) {
      precipThreshold = precipMax * 0.9;
      console.log(`Precipitation range too small, using 90% of max value as threshold`);
    } else {
      precipThreshold = precipValues[Math.floor(precipValues.length * 0.95)];
    }
  }
  
  if (windValues.length > 0) {
    const windMin = windValues[0];
    const windMax = windValues[windValues.length - 1];
    const windRange = windMax - windMin;
    if (windRange < (windMax * 0.1)) {
      windThreshold = windMax * 0.9;
      console.log(`Wind range too small, using 90% of max value as threshold`);
    } else {
      windThreshold = windValues[Math.floor(windValues.length * 0.95)];
    }
  }
  
  console.log(`Cloud cover threshold: ${cloudThreshold}`);
  console.log(`Precipitation threshold: ${precipThreshold}`);
  console.log(`Wind speed threshold: ${windThreshold}`);
  
  // Clear existing cloud meshes
  const cloudChildCount = cloudContainerRef.current.children.length;
  console.log(`Clearing ${cloudChildCount} existing cloud meshes`);
  while (cloudContainerRef.current.children.length > 0) {
    cloudContainerRef.current.remove(cloudContainerRef.current.children[0]);
  }
  cloudMeshesRef.current.length = 0;
  
  // Clear existing wind particles
  const windParticleCount = windParticlesRef.current.length;
  console.log(`Clearing ${windParticleCount} existing wind particles`);
  while (windParticlesRef.current.length > 0) {
    const particle = windParticlesRef.current.pop();
    if (particle && particle.mesh) {
      sceneRef.current.remove(particle.mesh);
    }
  }
  
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      cloudGridRef.current[x][z] = false;
      rainfallGridRef.current[x][z] = false;
      windGridRef.current[x][z] = false;
    }
  }
  
  if (cloudThreshold <= 0 && precipThreshold <= 0 && windThreshold <= 0) {
    console.log("All thresholds are zero or negative, skipping effects generation");
    console.log("===== WEATHER EFFECTS DEBUG END =====");
    return;
  }
  
  let cloudExceedCount = 0;
  let precipExceedCount = 0;
  let windExceedCount = 0;
  
  const rainCells = [];
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      if (typeof precipitationGridRef.current[z]?.[x] === 'number' && 
          precipitationGridRef.current[z][x] > 0 &&
          precipitationGridRef.current[z][x] >= precipThreshold) {
        rainCells.push({x, z, value: precipitationGridRef.current[z][x]});
        precipExceedCount++;
      }
    }
  }
  
  const cloudCells = [];
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      if (typeof cloudGrid2Ref.current[z]?.[x] === 'number' && 
          cloudGrid2Ref.current[z][x] > 0 &&
          cloudGrid2Ref.current[z][x] >= cloudThreshold) {
        cloudCells.push({x, z, value: cloudGrid2Ref.current[z][x]});
        cloudExceedCount++;
      }
    }
  }
  
  const windCells = [];
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      if (typeof windGrid2Ref.current[z]?.[x] === 'number' && 
          windGrid2Ref.current[z][x] > 0 &&
          windGrid2Ref.current[z][x] >= windThreshold) {
        windCells.push({x, z, value: windGrid2Ref.current[z][x]});
        windExceedCount++;
      }
    }
  }
  
  console.log(`Cells exceeding cloud threshold: ${cloudExceedCount} (expected ~12-13 for top 5%)`);
  console.log(`Cells exceeding precipitation threshold: ${precipExceedCount} (expected ~12-13 for top 5%)`);
  console.log(`Cells exceeding wind threshold: ${windExceedCount} (expected ~12-13 for top 5%)`);
  
  console.log("=== CELLS EXCEEDING THRESHOLDS ===");
  console.log("Cloud cells:", cloudCells);
  console.log("Rain cells:", rainCells);
  console.log("Wind cells:", windCells);
  
  for (const cell of cloudCells) {
    cloudGridRef.current[cell.x][cell.z] = true;
  }
  
  for (const cell of rainCells) {
    rainfallGridRef.current[cell.x][cell.z] = true;
    
    if (!cloudGridRef.current[cell.x][cell.z]) {
      cloudGridRef.current[cell.x][cell.z] = true;
    }
  }
  
  for (const cell of windCells) {
    windGridRef.current[cell.x][cell.z] = true;
  }
  
  // Count total cells marked for each effect
  let totalCloudCells = 0;
  let totalRainCells = 0;
  let totalWindCells = 0;
  
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      if (cloudGridRef.current[x][z]) totalCloudCells++;
      if (rainfallGridRef.current[x][z]) totalRainCells++;
      if (windGridRef.current[x][z]) totalWindCells++;
    }
  }
  
  console.log(`Total cells marked for clouds: ${totalCloudCells}`);
  console.log(`Total cells marked for rain: ${totalRainCells}`);
  console.log(`Total cells marked for wind: ${totalWindCells}`);
  
  // Define cloud material if it doesn't exist yet
  const cloudMaterial = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
    emissive: 0xcccccc,
    emissiveIntensity: 0.2
  });
  
  // Debug the grid state before mesh creation
  console.log("=== GRID STATE BEFORE MESH CREATION ===");
  let debugCloudGrid = [];
  for (let x = 0; x < 16; x++) {
    let row = [];
    for (let z = 0; z < 16; z++) {
      row.push(cloudGridRef.current[x][z] ? 1 : 0);
    }
    debugCloudGrid.push(row);
  }
  console.log("Cloud grid state:", debugCloudGrid);
  
  // Create cloud meshes for all cloud positions
  let cloudsCreated = 0;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      if (cloudGridRef.current[x][z]) {
        const cloudGeometry = new THREE.BoxGeometry(1, 0.3, 1);
        const cloudMesh = new THREE.Mesh(cloudGeometry, cloudMaterial);
        cloudMesh.castShadow = true;
        cloudMesh.receiveShadow = false;
        
        cloudMesh.position.set(
          x - 7.5, 
          5,       
          z - 7.5  
        );
        
        // Add some randomness to make clouds look more natural
        cloudMesh.scale.x = 0.8 + Math.random() * 0.4;
        cloudMesh.scale.z = 0.8 + Math.random() * 0.4;
        
        cloudContainerRef.current.add(cloudMesh);
        cloudMeshesRef.current.push(cloudMesh);
        cloudsCreated++;
      }
    }
  }
  console.log(`Clouds created: ${cloudsCreated}`);
  
  let windParticlesCreated = 0;
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      if (windGridRef.current[x][z]) {
        const particleCount = 5 + Math.floor(Math.random() * 5);
        
        const windValue = windGrid2Ref.current[z][x] || 0;
        const windIntensity = windValue > 0 && windThreshold > 0 ? windValue / windThreshold : 1; 
        
        for (let i = 0; i < particleCount; i++) {
          const windGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.6 * windIntensity, 4);
          const windMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.4 + (windIntensity * 0.3),
            emissive: 0xCCCCCC,
            emissiveIntensity: 0.3
          });
          
          const windMesh = new THREE.Mesh(windGeometry, windMaterial);
          windMesh.renderOrder = 10;
          windMesh.castShadow = false;
          windMesh.receiveShadow = false;
          
          windMesh.position.set(
            x - 7.5 + (Math.random() * 0.8 - 0.4),
            0.2 + Math.random() * 0.2,             
            z - 7.5 + (Math.random() * 0.8 - 0.4) 
          );
          
          windMesh.rotation.z = Math.PI / 2;
          
          windMesh.rotation.y = Math.PI / 4 + (windIntensity * Math.PI / 8);
          
          // Add to scene
          sceneRef.current.add(windMesh);
          
          windParticlesRef.current.push({
            mesh: windMesh,
            speed: 0.001 * windIntensity * 3, 
            cell: { x, z },
            phase: Math.random() * Math.PI * 2, 
            originalY: windMesh.position.y,
            intensity: windIntensity 
          });
          windParticlesCreated++;
        }
      }
    }
  }
  
  // Clear existing raindrops
  const raindropsCount = rainContainerRef.current.children.length;
  console.log(`Clearing ${raindropsCount} existing raindrops`);
  while (rainContainerRef.current.children.length > 0) {
    rainContainerRef.current.remove(rainContainerRef.current.children[0]);
  }
  raindropsRef.current.length = 0;
  
  console.log(`Updated clouds: ${cloudMeshesRef.current.length} clouds created`);
  console.log(`Wind particles created: ${windParticlesCreated}`);
  console.log(`Rain enabled on ${rainCells.length} grid cells`);
  console.log("===== WEATHER EFFECTS DEBUG END =====");
};
const debugGrids = () => {
  console.log("===== GRID DEBUGGING =====");
  
  let cloudNonZeroCount = 0;
  let precipNonZeroCount = 0;
  let windNonZeroCount = 0;
  
  for (let z = 0; z < 16; z++) {
    for (let x = 0; x < 16; x++) {
      if (typeof cloudGrid2Ref.current[z]?.[x] === 'number' && cloudGrid2Ref.current[z][x] > 0) {
        cloudNonZeroCount++;
      }
      if (typeof precipitationGridRef.current[z]?.[x] === 'number' && precipitationGridRef.current[z][x] > 0) {
        precipNonZeroCount++;
      }
      if (typeof windGrid2Ref.current[z]?.[x] === 'number' && windGrid2Ref.current[z][x] > 0) {
        windNonZeroCount++;
      }
    }
  }
  
  console.log(`Cloud grid non-zero values: ${cloudNonZeroCount} out of 256`);
  console.log(`Precipitation grid non-zero values: ${precipNonZeroCount} out of 256`);
  console.log(`Wind grid non-zero values: ${windNonZeroCount} out of 256`);
  
  console.log("Sample grid values (first few cells):");
  for (let z = 0; z < 3; z++) {
    for (let x = 0; x < 3; x++) {
      console.log(`Cell [${z}][${x}]: Cloud=${cloudGrid2Ref.current[z]?.[x]}, Rain=${precipitationGridRef.current[z]?.[x]}, Wind=${windGrid2Ref.current[z]?.[x]}`);
    }
  }
  
  console.log("Grid dimensions:");
  console.log(`cloudGrid2: rows=${cloudGrid2Ref.current.length}, first row cols=${cloudGrid2Ref.current[0]?.length || 0}`);
  console.log(`precipitationGrid: rows=${precipitationGridRef.current.length}, first row cols=${precipitationGridRef.current[0]?.length || 0}`);
  console.log(`windGrid2: rows=${windGrid2Ref.current.length}, first row cols=${windGrid2Ref.current[0]?.length || 0}`);

  console.log("===== GRID DEBUGGING END =====");
  return {
    cloudNonZeroCount,
    precipNonZeroCount,
    windNonZeroCount
  };
};

const modifyFetchWeatherData = () => {
  const originalFetchWeatherData = fetchWeatherData;
  
  return async () => {
    console.log("===== WEATHER FETCH DEBUG START =====");
    console.log("Starting weather data fetch");
    
    try {
      await originalFetchWeatherData();
      
      console.log("Weather data fetch completed");
      console.log("Inspecting weather grids after fetch:");
      debugGrids();
      
    } catch (error) {
      console.error("Error in weather data fetch:", error);
    }
    
    console.log("===== WEATHER FETCH DEBUG END =====");
  };
};





 const createTextSprite = () => {
     if (!sceneRef.current) return; 
    textCanvasRef.current = document.createElement('canvas');
    textCanvasRef.current.width = 350;
    textCanvasRef.current.height = 200;
    textContextRef.current = textCanvasRef.current.getContext('2d');
    textTextureRef.current = new THREE.CanvasTexture(textCanvasRef.current);
    textTextureRef.current.minFilter = THREE.LinearFilter;
    textTextureRef.current.magFilter = THREE.LinearFilter;
    textMaterialRef.current = new THREE.SpriteMaterial({ map: textTextureRef.current, transparent: true, depthTest: false }); 
    textSpriteRef.current = new THREE.Sprite(textMaterialRef.current);
    textSpriteRef.current.scale.set(2, 1, 1);
    textSpriteRef.current.visible = false;
     textSpriteRef.current.renderOrder = 99; 
    sceneRef.current.add(textSpriteRef.current);
 };

 const updateTextSprite = (x, z) => {
    // Ensure refs are available
    if (!textContextRef.current || !textCanvasRef.current || !textTextureRef.current || !coordinates) return;

    textContextRef.current.clearRect(0, 0, textCanvasRef.current.width, textCanvasRef.current.height);
    // Draw background and border
    textContextRef.current.fillStyle = 'rgba(17, 24, 39, 0.8)';
    textContextRef.current.fillRect(0, 0, textCanvasRef.current.width, textCanvasRef.current.height);
    textContextRef.current.strokeStyle = 'rgba(74, 85, 104, 0.6)';
    textContextRef.current.lineWidth = 4;
    textContextRef.current.strokeRect(2, 2, textCanvasRef.current.width - 4, textCanvasRef.current.height - 4);

    // Clamp grid coordinates
    const gridX = Math.max(0, Math.min(15, Math.floor(x)));
    const gridZ = Math.max(0, Math.min(15, Math.floor(z)));


    const safeAccess = (gridRef, r, c, def = "N/A") => gridRef.current?.[r]?.[c] ?? def;

    let bestPlant = safeAccess(bestPlantGridRef, gridZ, gridX);
    let currYield = safeAccess(intensityGridRef, gridX, gridZ); 
    let coordData = coordinates[gridZ]?.[gridX]; 
    let currentCoordinate = Array.isArray(coordData) ? `[${coordData[0]?.toFixed(4)}, ${coordData[1]?.toFixed(4)}]` : "N/A";
    let currentTemp = safeAccess(temperatureGridRef, gridZ, gridX);
    let currentHumidity = safeAccess(humidityGridRef, gridZ, gridX);
    let currentPrecipitation = safeAccess(precipitationGridRef, gridZ, gridX);
    let currentCloud = safeAccess(cloudGrid2Ref, gridZ, gridX); 
    let currentWind = safeAccess(windGrid2Ref, gridZ, gridX); 

    // Format numbers
    let displayYield = "N/A";
    if (typeof currYield === 'number' && !isNaN(currYield)) {
        if (typeof hectaresPerCell === 'number' && hectaresPerCell > 0) {
            displayYield = (currYield * hectaresPerCell).toFixed(2) + " kcal/tonnes";
        } else {
            displayYield = currYield.toFixed(2);
        }
    }

    const formatNumber = (val, decimals = 1) => (typeof val === 'number' && !isNaN(val)) ? val.toFixed(decimals) : "N/A";
    currentTemp = formatNumber(currentTemp);
    currentHumidity = formatNumber(currentHumidity);
    currentPrecipitation = formatNumber(currentPrecipitation);
    currentCloud = formatNumber(currentCloud);
    currentWind = formatNumber(currentWind);

    // Draw text
    textContextRef.current.font = 'bold 20px monospace';
    textContextRef.current.fillStyle = 'white';
    textContextRef.current.textAlign = 'center';

    textContextRef.current.fillText(`Yield: ${displayYield}`, textCanvasRef.current.width / 2, 40);
    textContextRef.current.fillText(`Best Plant: ${bestPlant}`, textCanvasRef.current.width / 2, 70);
    textContextRef.current.fillText(`Coord: ${currentCoordinate}`, textCanvasRef.current.width / 2, 100);
    textContextRef.current.fillText(`Temp: ${currentTemp}°C`, textCanvasRef.current.width / 2, 130);
    textContextRef.current.fillText(`Humidity: ${currentHumidity}%`, textCanvasRef.current.width / 2, 160);
    textContextRef.current.fillText(`Wind: ${currentWind} m/s`, textCanvasRef.current.width / 2, 190);

    // Update texture
    textTextureRef.current.needsUpdate = true;
 };


 const updateSpriteRotation = () => {
    if (textSpriteRef.current && textSpriteRef.current.visible && cameraRef.current) {
      textSpriteRef.current.position.y = 1.5;
      textSpriteRef.current.quaternion.copy(cameraRef.current.quaternion);
    }
 };


 const animateWind = (time) => {
     if (!windParticlesRef.current) return;
    windParticlesRef.current.forEach((particle) => {
      if (!particle || !particle.mesh || !particle.mesh.material) return; // Add checks
      const windEffect = Math.sin(time / 500 + particle.phase) * 0.1;
      particle.mesh.position.y = particle.originalY + Math.sin(time / 800 + particle.phase) * 0.05;
      particle.mesh.scale.y = 1 + windEffect * 0.3 * (particle.intensity || 1); 
      particle.mesh.material.opacity = 0.1 + 0.2 * Math.sin(time / 600 + particle.phase);
      const direction = new THREE.Vector3(1, 0, 0);
      direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), particle.mesh.rotation.y);
      direction.multiplyScalar(particle.speed);
      particle.mesh.position.x += direction.x;
      particle.mesh.position.z += direction.z;
      const cellCenterX = particle.cell.x - 7.5;
      const cellCenterZ = particle.cell.z - 7.5;
      // Wrap around logic
      if (Math.abs(particle.mesh.position.x - cellCenterX) > 0.8 || Math.abs(particle.mesh.position.z - cellCenterZ) > 0.8) {
        particle.mesh.position.x = cellCenterX + (Math.random() * 0.6 - 0.3);
        particle.mesh.position.z = cellCenterZ + (Math.random() * 0.6 - 0.3);
      }
    });
 };

 const animateClouds = (time) => {
     if (!cloudMeshesRef.current) return;
    cloudMeshesRef.current.forEach((cloud, index) => {
       if (!cloud) return;
      cloud.position.y = 5 + 0.2 * Math.sin(time / 2000 + index * 0.2);
      cloud.rotation.y = time / 5000 + index * 0.1;
    });
 };

 const rainConfig = { maxRaindrops: 500, rainSpeed: 0.1, rainVariance: 0.05, spawnRate: 5, minHeight: 0, maxHeight: 5 };
 const rainMaterial = new THREE.MeshBasicMaterial({ color: 0x9db3ff, transparent: true, opacity: 0.6 });
 const rainGeometry = new THREE.BoxGeometry(0.05, 0.3, 0.05); 

 const createRaindrop = () => {
    if (!rainContainerRef.current || !cloudGridRef.current || !rainfallGridRef.current) return null;
    let validPositions = [];
    const cloudGrid = cloudGridRef.current;
    const rainfallGrid = rainfallGridRef.current;
    for (let x = 0; x < 16; x++) {
      for (let z = 0; z < 16; z++) {
        if (cloudGrid[x]?.[z] && rainfallGrid[x]?.[z]) { 
          validPositions.push({x, z});
        }
      }
    }
    if (validPositions.length === 0) return null;
    const randomPos = validPositions[Math.floor(Math.random() * validPositions.length)];
    const raindrop = new THREE.Mesh(rainGeometry, rainMaterial); 
    raindrop.position.set(
      randomPos.x - 7.5 + (Math.random() * 0.8 - 0.4),
      rainConfig.maxHeight,
      randomPos.z - 7.5 + (Math.random() * 0.8 - 0.4)
    );
    raindrop.speed = rainConfig.rainSpeed + (Math.random() * rainConfig.rainVariance);
    rainContainerRef.current.add(raindrop);
    raindropsRef.current.push(raindrop);
    return raindrop;
 };

 const animateRain = () => {
    if (!rainContainerRef.current || !raindropsRef.current) return;
    for (let i = 0; i < rainConfig.spawnRate; i++) {
      if (raindropsRef.current.length < rainConfig.maxRaindrops) {
        createRaindrop();
      }
    }
    for (let i = raindropsRef.current.length - 1; i >= 0; i--) {
      const drop = raindropsRef.current[i];
       if (!drop) continue; 
      drop.position.y -= drop.speed;
      if (drop.position.y <= rainConfig.minHeight) {
        rainContainerRef.current.remove(drop);
        raindropsRef.current.splice(i, 1);
      }
    }
 };


 const showFieldInfoPanel = () => {
    hideFieldInfoPanel(); 
    const panel = document.createElement('div');
    panel.id = 'field-info-panel';
    panel.className = styles.fieldInfoPanel; 

    const nutrients = ["Calories", "Protein", "Oil", "Carbohydrates", "EFA"];
    let buttonsHtml = `<h2 class="${styles.panelTitle}">Crop Optimization</h2>`;
    nutrients.forEach(nutrient => {
        buttonsHtml += `
            <button id="${nutrient.toLowerCase()}-btn" class="${styles.panelButton}">
                ${nutrient} ${nutrient === 'Calories' ? '(Default)' : ''}
            </button>
        `;
    });
    panel.innerHTML = `<div class="${styles.panelContent}">${buttonsHtml}</div>`;
    document.body.appendChild(panel); 

    nutrients.forEach(nutrient => {
        const btn = panel.querySelector(`#${nutrient.toLowerCase()}-btn`);
        if (btn) {
            btn.addEventListener('click', (e) => {
                console.log(`${nutrient} button clicked`);
                e.stopPropagation(); 
                fetchNewYieldData(nutrient); 
                hideFieldInfoPanel();
            }, true);
        } else {
            console.warn(`Button not found for nutrient: ${nutrient}`);
        }
    });

    if(rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.style.pointerEvents = 'none';
    }
 };

 const hideFieldInfoPanel = () => {
    const existingPanel = document.getElementById('field-info-panel');
    if (existingPanel) {
      existingPanel.remove();
    }
    if(rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.style.pointerEvents = 'auto';
    }
 };


 if (isLoadingAsset) {
    return <div className={styles.loadingContainer}>Loading Asset Data...</div>;
 }
 if (!assetData) {
     return <div className={styles.loadingContainer}>Asset not found or failed to load.</div>;
 }

 return (
    <div>
        <div ref={mountRef} style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}></div>
        <div className={styles.uiOverlay}>
            <div className={styles.weatherPanel}>
                <div className={styles.panelHeader}>Weather Averages</div>
                {isLoadingWeather ? (
                    <div className={styles.panelText}>Loading Weather...</div>
                ) : (
                    <>
                        <div className={styles.panelText}>Temperature: {typeof weatherData.temp === 'number' ? weatherData.temp.toFixed(1) : weatherData.temp}°C</div>
                        <div className={styles.panelText}>Humidity: {typeof weatherData.humidity === 'number' ? weatherData.humidity.toFixed(1) : weatherData.humidity}%</div>
                        <div className={styles.panelText}>Precipitation: {typeof weatherData.precipitation === 'number' ? weatherData.precipitation.toFixed(1) : weatherData.precipitation} mm</div>
                        <div className={styles.panelText}>Cloud Coverage: {typeof weatherData.cloud === 'number' ? weatherData.cloud.toFixed(1) : weatherData.cloud}%</div>
                        <div className={styles.panelText}>Wind Speed: {typeof weatherData.wind120m === 'number' ? weatherData.wind120m.toFixed(1) : weatherData.wind120m} m/s</div>
                    </>
                )}
            </div>
            {/* Yield Legend */}
            <div className={styles.yieldLegend}>
                <div className={styles.legendTitle}>Crop Yield</div>
                 {isYieldLoading ? (
                     <div className={styles.legendLoading}>Loading Yield...</div>
                 ) : (
                    <div className={styles.legendContent}>
                        <div className={styles.legendLabelTop}>Best</div>
                        <div className={styles.legendBar}></div>
                        <div className={styles.legendLabelBottom}>Worst</div>
                    </div>
                 )}
            </div>
        </div>
    </div>
 );
};

export default Farm3js;
