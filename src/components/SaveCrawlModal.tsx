// src/components/SaveCrawlModal.tsx

import React, { useState } from 'react';
import { FiSave, FiX, FiLock, FiUnlock, FiMapPin, FiWifi } from 'react-icons/fi';
import type { AppBat } from '../pages/Home';
import { saveCrawl, convertAppBarsToSavedBars, type SavedBarCrawl } from '../services/crawlService';
import { useAuth } from '../context/useAuth';
import { testFirebaseConnection } from '../utils/firebaseTest';
import '../styles/SaveCrawlModal.css';

interface SaveCrawlModalProps {
  isOpen: boolean;
  onClose: () => void;
  bars: AppBat[];
  mapCenter: [number, number];
  searchRadius: number;
  startCoordinates: [number, number] | null;
  endCoordinates: [number, number] | null;
  onSaveSuccess: (crawlId: string) => void;
}

export const SaveCrawlModal: React.FC<SaveCrawlModalProps> = ({
  isOpen,
  onClose,
  bars,
  mapCenter,
  searchRadius,
  startCoordinates,
  endCoordinates,
  onSaveSuccess,
}) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    isPublic: false,
    tags: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handlePublicToggle = () => {
    setFormData(prev => ({
      ...prev,
      isPublic: !prev.isPublic
    }));
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Crawl name is required';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Crawl name must be at least 3 characters';
    }

    if (bars.length < 2) {
      newErrors.general = 'You need at least 2 bars to save a crawl';
    }

    if (!user) {
      newErrors.general = 'You must be logged in to save a crawl';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateTotalDistance = (): number => {
    let totalDistance = 0;
    
    // Distance from start to first bar
    if (startCoordinates && bars.length > 0) {
      const firstBar = bars[0];
      totalDistance += calculateDistance(
        startCoordinates[1], startCoordinates[0],
        firstBar.location.coordinates[1], firstBar.location.coordinates[0]
      );
    }

    // Distance between bars
    for (let i = 0; i < bars.length - 1; i++) {
      const currentBar = bars[i];
      const nextBar = bars[i + 1];
      totalDistance += calculateDistance(
        currentBar.location.coordinates[1], currentBar.location.coordinates[0],
        nextBar.location.coordinates[1], nextBar.location.coordinates[0]
      );
    }

    // Distance from last bar to end
    if (endCoordinates && bars.length > 0 && 
        (startCoordinates?.[0] !== endCoordinates[0] || startCoordinates?.[1] !== endCoordinates[1])) {
      const lastBar = bars[bars.length - 1];
      totalDistance += calculateDistance(
        lastBar.location.coordinates[1], lastBar.location.coordinates[0],
        endCoordinates[1], endCoordinates[0]
      );
    }

    return totalDistance;
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    console.log('🔄 Starting save process...');
    console.log('👤 User:', user?.uid, user?.email);
    console.log('🍺 Bars to save:', bars.length);

    setIsSaving(true);
    try {
      const crawlData: Omit<SavedBarCrawl, 'id' | 'createdAt' | 'updatedAt'> = {
        name: formData.name.trim(),
        description: formData.description.trim() || undefined,
        bars: convertAppBarsToSavedBars(bars),
        route: {
          startLocation: {
            lat: startCoordinates?.[1] || mapCenter[1],
            lng: startCoordinates?.[0] || mapCenter[0],
          },
          endLocation: {
            lat: endCoordinates?.[1] || mapCenter[1],
            lng: endCoordinates?.[0] || mapCenter[0],
          },
          totalDistance: calculateTotalDistance(),
          estimatedDuration: bars.length * 30 + Math.round(calculateTotalDistance() / 3 * 60), // 30min per bar + walking time
        },
        mapCenter,
        searchRadius,
        createdBy: user!.uid,
        isPublic: formData.isPublic,
        tags: formData.tags ? formData.tags.split(',').map(tag => tag.trim()).filter(Boolean) : undefined,
      };

      console.log('📝 Crawl data to save:', crawlData);
      console.log('🔐 Authentication status:', !!user);

      const crawlId = await saveCrawl(crawlData);
      console.log('✅ Save successful! ID:', crawlId);
      
      onSaveSuccess(crawlId);
      onClose();
      
      // Reset form
      setFormData({
        name: '',
        description: '',
        isPublic: false,
        tags: '',
      });
    } catch (error) {
      console.error('❌ Save failed:', error);
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        code: (error as any)?.code,
        details: (error as any)?.details
      });
      setErrors({ general: error instanceof Error ? error.message : 'Failed to save crawl' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testFirebaseConnection();
      setTestResult({
        success: result.success,
        message: result.success ? (result.message || 'Success') : (result.error || 'Test failed')
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Test failed'
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="save-modal-overlay" onClick={onClose}>
      <div className="save-modal" onClick={(e) => e.stopPropagation()}>
        <div className="save-modal-header">
          <h2 className="save-modal-title">
            <FiSave className="save-icon" />
            Save Your Bar Crawl
          </h2>
          <button className="save-modal-close" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="save-modal-content">
          {errors.general && (
            <div className="save-error-message">
              {errors.general}
            </div>
          )}

          {testResult && (
            <div className={`test-result-message ${testResult.success ? 'success' : 'error'}`}>
              {testResult.success ? '✅' : '❌'} {testResult.message}
            </div>
          )}

          <div className="debug-section">
            <button 
              className="btn-test-connection"
              onClick={handleTestConnection}
              disabled={isTesting}
            >
              {isTesting ? (
                <>
                  <div className="test-spinner" />
                  Testing...
                </>
              ) : (
                <>
                  <FiWifi />
                  Test Firebase Connection
                </>
              )}
            </button>
          </div>

          <div className="save-crawl-stats">
            <div className="save-stat">
              <FiMapPin className="save-stat-icon" />
              <span className="save-stat-label">{bars.length} bars</span>
            </div>
            <div className="save-stat">
              <span className="save-stat-label">{calculateTotalDistance().toFixed(1)} mi total</span>
            </div>
            <div className="save-stat">
              <span className="save-stat-label">~{Math.round(bars.length * 30 / 60)} hours</span>
            </div>
          </div>

          <div className="save-form-group">
            <label htmlFor="crawl-name" className="save-form-label">
              Crawl Name *
            </label>
            <input
              id="crawl-name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., Downtown Columbus Pub Crawl"
              className={`save-form-input ${errors.name ? 'error' : ''}`}
              maxLength={100}
            />
            {errors.name && <span className="save-field-error">{errors.name}</span>}
          </div>

          <div className="save-form-group">
            <label htmlFor="crawl-description" className="save-form-label">
              Description
            </label>
            <textarea
              id="crawl-description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              placeholder="Tell others about this crawl route..."
              className="save-form-textarea"
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="save-form-group">
            <label htmlFor="crawl-tags" className="save-form-label">
              Tags (comma separated)
            </label>
            <input
              id="crawl-tags"
              name="tags"
              type="text"
              value={formData.tags}
              onChange={handleInputChange}
              placeholder="e.g., rooftop, craft beer, nightlife"
              className="save-form-input"
              maxLength={200}
            />
          </div>

          <div className="save-form-group">
            <div className="save-privacy-toggle" onClick={handlePublicToggle}>
              <div className="save-privacy-icon">
                {formData.isPublic ? <FiUnlock /> : <FiLock />}
              </div>
              <div className="save-privacy-content">
                <span className="save-privacy-label">
                  {formData.isPublic ? 'Public crawl' : 'Private crawl'}
                </span>
                <span className="save-privacy-description">
                  {formData.isPublic 
                    ? 'Others can discover and use this crawl'
                    : 'Only you can see this crawl'
                  }
                </span>
              </div>
              <div className={`save-toggle-switch ${formData.isPublic ? 'active' : ''}`}>
                <div className="save-toggle-slider" />
              </div>
            </div>
          </div>
        </div>

        <div className="save-modal-footer">
          <button className="save-modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button 
            className={`save-modal-save ${isSaving ? 'loading' : ''}`}
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <div className="save-spinner" />
                Saving...
              </>
            ) : (
              <>
                <FiSave />
                Save Crawl
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};