import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, onValue, off, query, orderByChild, limitToLast, remove } from "firebase/database";
import { getStorage, ref as storageRef, deleteObject } from "firebase/storage";
import { db, storage } from '../api/firebaseConfig';
import AddLandAssetPopup from '../components/AddLandAssetPopup';
import styles from './LandingPage.module.css';
import { Edit3, Trash2, Maximize2, PlusCircle, ImageOff, Leaf, NotebookText, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

const MAX_VISIBLE_ASSETS_BEFORE_SCROLL = 3; // Define a constant

function LandingPage({ user }) {
  const [showPopup, setShowPopup] = useState(false);
  const [landAssets, setLandAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetToEdit, setAssetToEdit] = useState(null);
  const navigate = useNavigate();
  const listContainerRef = useRef(null);

  const displayName = useMemo(() => {
    return user?.displayName || user?.email?.split('@')[0] || 'Farmer';
  }, [user]);

  useEffect(() => {
    if (!user) {
      setLandAssets([]);
      setLoadingAssets(false);
      return;
    }

    setLoadingAssets(true);
    const assetsQuery = query(
      ref(db, `users/${user.uid}/assets`),
      orderByChild('timestamp'),
      limitToLast(50)
    );

    const handleValueChange = (snapshot) => {
      const data = snapshot.val();
      const loadedAssets = data
        ? Object.entries(data)
            .map(([key, value]) => ({ id: key, ...value }))
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        : [];
      setLandAssets(loadedAssets);
      setLoadingAssets(false);
    };

    const handleError = (error) => {
      console.error("Error fetching assets:", error);
      setLoadingAssets(false);
    };

    const unsubscribe = onValue(assetsQuery, handleValueChange, handleError);

    return () => {
      const dbRef = ref(db, `users/${user.uid}/assets`);
      off(dbRef, 'value', unsubscribe);
    };
  }, [user]);

  const handleAddNew = useCallback(() => {
    setAssetToEdit(null);
    setShowPopup(true);
  }, []);

  const handleEdit = useCallback((asset) => {
    setAssetToEdit(asset);
    setShowPopup(true);
  }, []);

  const handleDelete = useCallback(async (assetId, assetName, imageUrl) => {
    if (!window.confirm(`Are you sure you want to remove "${assetName || 'this asset'}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const assetDbRef = ref(db, `users/${user.uid}/assets/${assetId}`);
      await remove(assetDbRef);
      if (imageUrl) {
        try {
          const imageStorageRef = storageRef(storage, imageUrl);
          await deleteObject(imageStorageRef);
        } catch (storageError) {
          console.warn("Could not delete asset image from storage:", storageError);
        }
      }
    } catch (dbError) {
      console.error("Error deleting asset data:", dbError);
      alert("Failed to delete asset data. Please try again.");
    }
  }, [user?.uid]);

  const closePopup = useCallback(() => {
    setShowPopup(false);
    setAssetToEdit(null);
  }, []);

  const handleViewFarm = useCallback((assetId) => {
      navigate(`/farm/${assetId}`);
  }, [navigate]);

  const handleScroll = (direction) => {
      if (listContainerRef.current) {
          const scrollAmount = listContainerRef.current.offsetWidth * 0.8; // Scroll by 80% of visible width
          listContainerRef.current.scrollBy({
              left: direction === 'left' ? -scrollAmount : scrollAmount,
              behavior: 'smooth'
          });
      }
  };

  const showScrollButtons = landAssets.length > MAX_VISIBLE_ASSETS_BEFORE_SCROLL;

  const renderAssetItem = (asset, index) => (
    <li
      key={asset.id}
      className={styles.assetItem}
      style={{ animationDelay: `${index * 0.08}s` }}
      onClick={() => handleViewFarm(asset.id)}
      title={`View details for ${asset.name || 'Unnamed Asset'}`}
    >
      <div className={styles.imageContainer}>
        {asset.imageUrl ? (
          <img
            src={asset.imageUrl}
            alt={`Map preview of ${asset.name || 'asset'}`}
            className={styles.assetImage}
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none';
              const placeholder = e.target.nextElementSibling;
              if (placeholder) placeholder.style.display = 'flex';
            }}
          />
        ) : null}
        <div className={styles.imagePlaceholder} style={{ display: asset.imageUrl ? 'none' : 'flex' }}>
          <ImageOff size={32} />
          <span>No Preview</span>
        </div>
      </div>
      <div className={styles.assetContent}>
        <h3>{asset.name || 'Unnamed Asset'}</h3>
        <p className={styles.assetDetail}>
          <span className={styles.label}>
            <Maximize2 size={14} /> Area:
          </span>
          {asset.areaHectares ? `${asset.areaHectares.toFixed(2)} ha` : 'N/A'}
        </p>
        {asset.notes && (
          <p className={styles.assetNotes}>
            <span className={styles.label}>
              <NotebookText size={14} /> Notes:
            </span>
            <span className={styles.notesText}>{asset.notes}</span>
          </p>
        )}
      </div>
      <div className={styles.assetActions}>
        <button
          onClick={(e) => { e.stopPropagation(); handleEdit(asset); }}
          className={`${styles.actionButton} ${styles.editButton}`}
          title="Edit Asset"
        >
          <Edit3 size={16} />
          <span>Edit</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(asset.id, asset.name, asset.imageUrl); }}
          className={`${styles.actionButton} ${styles.deleteButton}`}
          title="Delete Asset"
        >
          <Trash2 size={16} />
          <span>Delete</span>
        </button>
        <button
            onClick={(e) => { e.stopPropagation(); handleViewFarm(asset.id); }}
            className={`${styles.actionButton} ${styles.viewButton}`}
            title="View Farm Details"
        >
            <ArrowRight size={16} />
            <span>View</span>
        </button>
      </div>
    </li>
  );

  return (
    <div className={styles.landingContainer}>
      <h1 className={styles.welcomeHeader}>
        <Leaf size={30} className={styles.leafIcon} /> Welcome back, {displayName}!
      </h1>

      <main className={styles.landingMain}>
        <button onClick={handleAddNew} className={styles.addAssetButton}>
          <PlusCircle size={20} /> Add New Land Asset
        </button>

        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Your Land Assets</h2>
        </div>

        {loadingAssets ? (
          <div className={styles.loadingPlaceholder}>Loading your assets...</div>
        ) : landAssets.length > 0 ? (
          <div className={`${styles.assetListWrapper} ${!showScrollButtons ? styles.centerItems : ''}`}>
              {showScrollButtons && (
                  <button
                      className={`${styles.scrollButton} ${styles.scrollButtonLeft}`}
                      onClick={() => handleScroll('left')}
                      aria-label="Scroll left"
                  >
                      <ChevronLeft size={24} />
                  </button>
              )}
              <div className={styles.assetListContainer} ref={listContainerRef}>
                  <ul className={styles.assetList}>
                      {landAssets.map(renderAssetItem)}
                  </ul>
              </div>
              {showScrollButtons && (
                  <button
                      className={`${styles.scrollButton} ${styles.scrollButtonRight}`}
                      onClick={() => handleScroll('right')}
                      aria-label="Scroll right"
                  >
                      <ChevronRight size={24} />
                  </button>
              )}
          </div>
        ) : (
          <p className={styles.noAssetsMessage}>
            No land assets found. Time to add your first plot!
          </p>
        )}
      </main>

      {showPopup && (
        <AddLandAssetPopup
          user={user}
          onClose={closePopup}
          assetToEdit={assetToEdit}
        />
      )}
    </div>
  );
}

export default LandingPage;
