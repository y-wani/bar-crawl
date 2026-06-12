// src/pages/SavedCrawls.tsx

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiMap,
  FiClock,
  FiMapPin,
  FiTrash2,
  FiEdit2,
  FiShare2,
  FiLock,
  FiUnlock,
  FiArrowLeft,
  FiPlus,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/useAuth";
import { toast } from "../components/Toaster";
import PageTransition from "../components/motion/PageTransition";
import { listItem, modalOverlay, modalPanel } from "../components/motion/variants";
import {
  getUserCrawls,
  deleteCrawl,
  convertSavedBarsToAppBars,
  type SavedBarCrawl,
} from "../services/crawlService";
import "../styles/SavedCrawls.css";

const SavedCrawls: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [crawls, setCrawls] = useState<SavedBarCrawl[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingCrawlId, setDeletingCrawlId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Error boundary effect
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Build a plain string message—avoid passing event.error directly
      const msg = event.error?.message ?? event.message;
      const loc = `${event.filename}:${event.lineno}:${event.colno}`;
      console.error(`SavedCrawls caught error: "${msg}" at ${loc}`);
      setError("An unexpected error occurred. Please try refreshing the page.");
    };

    window.addEventListener("error", handleError);
    return () => window.removeEventListener("error", handleError);
  }, []);

  useEffect(() => {
    if (user) {
      loadCrawls();
    }
  }, [user]);

  const loadCrawls = async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);
    try {
      const userCrawls = await getUserCrawls(user.uid);

      // Safely process the crawls data to avoid object conversion issues
      const processedCrawls = userCrawls.map((crawl) => ({
        ...crawl,
        // Ensure dates are properly handled
        createdAt: crawl.createdAt,
        updatedAt: crawl.updatedAt,
      }));

      setCrawls(processedCrawls);
      console.log(`✅ Loaded ${processedCrawls.length} crawls successfully`);
    } catch (err) {
      console.error("Error loading crawls:", err);
      setError(err instanceof Error ? err.message : "Failed to load crawls");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCrawl = (crawlId: string) => {
    setConfirmDeleteId(crawlId);
  };

  const confirmDelete = async () => {
    const crawlId = confirmDeleteId;
    if (!crawlId) return;
    setConfirmDeleteId(null);

    setDeletingCrawlId(crawlId);
    try {
      await deleteCrawl(crawlId);
      setCrawls((prev) => prev.filter((crawl) => crawl.id !== crawlId));
      toast.success("Crawl deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete crawl");
    } finally {
      setDeletingCrawlId(null);
    }
  };

  const handleLoadCrawl = (crawl: SavedBarCrawl) => {
    // Convert saved crawl back to route format
    const bars = convertSavedBarsToAppBars(crawl.bars);

    // Navigate to route page with the crawl data, restoring saved start/end.
    // existingCrawl lets the save modal update this crawl instead of
    // creating a duplicate.
    navigate("/route", {
      state: {
        selectedBars: bars,
        mapCenter: crawl.mapCenter,
        searchRadius: crawl.searchRadius,
        loadedFromSaved: true,
        crawlName: crawl.name,
        startCoordinates: crawl.route?.startLocation
          ? [crawl.route.startLocation.lng, crawl.route.startLocation.lat]
          : undefined,
        endCoordinates: crawl.route?.endLocation
          ? [crawl.route.endLocation.lng, crawl.route.endLocation.lat]
          : undefined,
        existingCrawl: crawl.id
          ? {
              id: crawl.id,
              name: crawl.name,
              description: crawl.description,
              tags: crawl.tags,
              isPublic: crawl.isPublic,
            }
          : undefined,
      },
    });
  };

  const handleShareCrawl = async (crawl: SavedBarCrawl) => {
    if (!crawl.id) return;

    // Public link to open directly in Route page
    const shareUrl = `${window.location.origin}/route?crawlId=${encodeURIComponent(
      crawl.id
    )}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: crawl.name,
          text: crawl.description || `Check out this bar crawl: ${crawl.name}`,
          url: shareUrl,
        });
      } catch (err) {
        // User cancelled share or error occurred
        copyToClipboard(shareUrl);
      }
    } else {
      copyToClipboard(shareUrl);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success("Link copied to clipboard");
      })
      .catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        toast.success("Link copied to clipboard");
      });
  };

  const formatDate = (date: any) => {
    if (!date) return "Unknown";
    try {
      let jsDate: Date;
      if (date instanceof Date) {
        jsDate = date;
      } else if (date.toDate) {
        // Check for the toDate method on Firestore Timestamps
        jsDate = date.toDate();
      } else if (typeof date === "string" || typeof date === "number") {
        jsDate = new Date(date);
      } else {
        // If it's not a recognizable format, return 'Unknown'
        return "Unknown";
      }

      // Check if the created date is valid
      if (isNaN(jsDate.getTime())) {
        return "Unknown";
      }

      return jsDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch (error) {
      console.warn("Error formatting date:", date, error);
      return "Unknown";
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0
      ? `${hours}h ${remainingMinutes}m`
      : `${hours}h`;
  };

  if (!user) {
    return (
      <PageTransition>
        <div className="saved-crawls-page">
          <div className="saved-crawls-empty">
            <h1>Please sign in to view your saved crawls</h1>
            <button className="btn-primary" onClick={() => navigate("/signin")}>
              Sign In
            </button>
          </div>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
    <div className="saved-crawls-page">
      <div className="saved-crawls-header">
        <button className="back-button" onClick={() => navigate("/home")}>
          <FiArrowLeft />
          Back to Planning
        </button>

        <div className="saved-crawls-title-section">
          <h1 className="saved-crawls-title">
            <FiMap className="title-icon" />
            Your Saved Crawls
          </h1>
          <p className="saved-crawls-subtitle">
            Manage your bar crawl routes and plans
          </p>
        </div>

        <button className="btn-create-new" onClick={() => navigate("/home")}>
          <FiPlus />
          Create New Crawl
        </button>
      </div>

      <div className="saved-crawls-content">
        {isLoading && (
          <div className="saved-crawls-loading">
            <div className="loading-spinner" />
            <p>Loading your saved crawls...</p>
          </div>
        )}

        {error && (
          <div className="saved-crawls-error">
            <p>{error}</p>
            <button onClick={loadCrawls} className="btn-retry">
              Try Again
            </button>
          </div>
        )}

        {!isLoading && !error && crawls.length === 0 && (
          <div className="saved-crawls-empty">
            <div className="empty-icon">🍻</div>
            <h2>No saved crawls yet</h2>
            <p>Create your first bar crawl route to get started!</p>
            <button
              className="btn-primary-large"
              onClick={() => navigate("/home")}
            >
              <FiPlus />
              Create Your First Crawl
            </button>
          </div>
        )}

        {!isLoading && !error && crawls.length > 0 && (
          <div className="crawls-grid">
            <AnimatePresence mode="popLayout">
            {crawls.map((crawl, index) => (
              <motion.div
                key={crawl.id}
                className="crawl-card"
                layout
                variants={listItem(index)}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              >
                <div className="crawl-card-header">
                  <div className="crawl-privacy">
                    {crawl.isPublic ? (
                      <FiUnlock
                        className="privacy-icon public"
                        title="Public crawl"
                      />
                    ) : (
                      <FiLock
                        className="privacy-icon private"
                        title="Private crawl"
                      />
                    )}
                  </div>

                  <div className="crawl-actions">
                    <button
                      className="action-btn share"
                      onClick={() => handleShareCrawl(crawl)}
                      title="Share crawl"
                    >
                      <FiShare2 />
                    </button>
                    <button
                      className="action-btn edit"
                      onClick={() => handleLoadCrawl(crawl)}
                      title="Edit crawl"
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      className={`action-btn delete ${
                        deletingCrawlId === crawl.id ? "loading" : ""
                      }`}
                      onClick={() => crawl.id && handleDeleteCrawl(crawl.id)}
                      disabled={deletingCrawlId === crawl.id}
                      title="Delete crawl"
                    >
                      {deletingCrawlId === crawl.id ? (
                        <div className="mini-spinner" />
                      ) : (
                        <FiTrash2 />
                      )}
                    </button>
                  </div>
                </div>

                <div
                  className="crawl-card-content"
                  onClick={() => handleLoadCrawl(crawl)}
                >
                  <h3 className="crawl-name">{crawl.name}</h3>

                  {crawl.description && (
                    <p className="crawl-description">{crawl.description}</p>
                  )}

                  <div className="crawl-stats">
                    <div className="crawl-stat">
                      <FiMapPin className="stat-icon" />
                      <span>{crawl.bars.length} bars</span>
                    </div>

                    <div className="crawl-stat">
                      <FiMap className="stat-icon" />
                      <span>
                        {crawl.route.totalDistance?.toFixed(1) || "0"} mi
                      </span>
                    </div>

                    <div className="crawl-stat">
                      <FiClock className="stat-icon" />
                      <span>
                        {formatDuration(crawl.route.estimatedDuration || 0)}
                      </span>
                    </div>
                  </div>

                  {crawl.tags && crawl.tags.length > 0 && (
                    <div className="crawl-tags">
                      {crawl.tags.slice(0, 3).map((tag, index) => (
                        <span key={index} className="crawl-tag">
                          {tag}
                        </span>
                      ))}
                      {crawl.tags.length > 3 && (
                        <span className="crawl-tag more">
                          +{crawl.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="crawl-card-footer">
                    <span className="crawl-date">
                      Created {formatDate(crawl.createdAt)}
                    </span>

                    <button className="btn-load-crawl">Load Crawl</button>
                  </div>
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            className="modal-overlay"
            variants={modalOverlay}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => setConfirmDeleteId(null)}
          >
            <motion.div
              className="modal-panel"
              variants={modalPanel}
              onClick={(e) => e.stopPropagation()}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-crawl-title"
            >
              <h2 className="modal-title" id="delete-crawl-title">
                Delete this crawl?
              </h2>
              <p className="modal-subtitle">
                This can't be undone — the route and all its details will be
                gone for good.
              </p>
              <div className="modal-footer">
                <button
                  className="btn btn--ghost"
                  onClick={() => setConfirmDeleteId(null)}
                >
                  Keep it
                </button>
                <button className="btn btn--danger" onClick={confirmDelete}>
                  <FiTrash2 />
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </PageTransition>
  );
};

export default SavedCrawls;
