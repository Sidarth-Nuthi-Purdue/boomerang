'use client';
import { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { query, orderBy, getFirestore, addDoc, Timestamp, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, getStorage } from 'firebase/storage';
import Link from 'next/link';

// TODO: Replace with your own Firebase config object
const firebaseConfig = {
  apiKey: "AIzaSyCfzCS5vX2g9ttfIDuANSJVMnnAeq84uRk",
  authDomain: "boomerang-13efe.firebaseapp.com",
  projectId: "boomerang-13efe",
  storageBucket: "boomerang-13efe.firebasestorage.app",
  messagingSenderId: "178749616808",
  appId: "1:178749616808:web:40a573be16a57a58dbc89d",
  measurementId: "G-JZVJPEXBG8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

/** 
 * Generate a smooth cubic Bezier path through all points in order. 
 */
function getSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) * 0.4;
    d += ` C ${p0.x + dx},${p0.y} ${p1.x - dx},${p1.y} ${p1.x},${p1.y}`;
  }
  return d;
}

// Layout constants
const EVENTS_PER_ROW = 4;
const CARD_WIDTH = 180;
const CARD_HEIGHT = 140;
const CARD_GAP = 60;
const ROW_HEIGHT = 200;
const ROW_GAP = 0;

/**
 * Compute (x,y) for an event in "snake" order
 */
function getEventPosition(index: number) {
  const row = Math.floor(index / EVENTS_PER_ROW);
  const col = index % EVENTS_PER_ROW;
  const reversed = row % 2 === 1;
  const displayCol = reversed ? EVENTS_PER_ROW - 1 - col : col;

  const x = displayCol * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2;
  const y = row * (ROW_HEIGHT + ROW_GAP) + ROW_HEIGHT / 2;
  return { x, y };
}

/**
 * Single Card 
 */
function EventCard({
  event,
  index,
  isRevealed,
  onSelect,
}: {
  event: {
    id: string;
    image: string;
    title: string;
    description: string;
    date: string;
    relatedImages: string[];
  };
  index: number;
  isRevealed: boolean;
  onSelect: (ev: any) => void;
}) {
  const pos = getEventPosition(index);

  const truncatedDesc =
    event.description.length > 60
      ? event.description.substring(0, 60) + '...'
      : event.description;

  return (
    <div
      onClick={() => {
        if (isRevealed) onSelect(event);
      }}
      style={{
        position: 'absolute',
        width: CARD_WIDTH,
        left: pos.x - CARD_WIDTH / 2,
        top: pos.y - CARD_HEIGHT / 2,
        height: CARD_HEIGHT,
        borderRadius: '8px',
        overflow: 'hidden',
        cursor: 'pointer',
        opacity: isRevealed ? 1 : 0,
        transition: 'opacity 0.8s ease',
        pointerEvents: isRevealed ? 'auto' : 'none',
        backgroundImage: `url(${event.image})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
      }}
    >
      {/* Overlay for text */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: '12px',
          color: '#fff',
        }}
      >
        <h4 style={{ margin: '0 0 6px' }}>{event.title}</h4>
        <small style={{ opacity: 0.8 }}>{event.date}</small>
        <p style={{ margin: '6px 0 0' }}>{truncatedDesc}</p>
      </div>
    </div>
  );
}

/**
 * Fullscreen Image Modal
 */
function FullscreenImage({
  imageUrl,
  onClose,
}: {
  imageUrl: string;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          fontSize: '1.5rem',
          cursor: 'pointer',
          background: 'none',
          border: 'none',
          color: '#fff',
          padding: '8px',
          borderRadius: '4px',
          backgroundColor: 'rgba(0,0,0,0.3)',
          zIndex: 10001,
        }}
      >
        ✕
      </button>
      <img
        src={imageUrl}
        alt="Fullscreen"
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

/**
 * Expanded Modal 
 */
function ExpandedModal({
  event,
  onClose,
  onEdit,
}: {
  event: {
    id: string;
    image: string;
    title: string;
    description: string;
    date: string;
    relatedImages: string[];
  };
  onClose: () => void;
  onEdit: (event: any) => void;
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const allImages = [event.image, ...event.relatedImages];

  const nextImage = () => {
    setCurrentImageIndex((prev) => (prev + 1) % allImages.length);
  };

  const prevImage = () => {
    setCurrentImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          overflowY: 'auto',
          padding: '20px',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '80%',
            maxWidth: '600px',
            backgroundColor: 'rgb(10,10,10)',
            boxShadow: '0 0px 15px rgba(155, 155, 155, 0.2)',
            borderRadius: '8px',
            padding: '20px',
            position: 'relative',
            margin: '20px auto',
            display: 'flex',
            flexDirection: 'column',
            minHeight: '400px',
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '10px',
              right: '10px',
              fontSize: '1.2rem',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              color: '#fff',
              padding: '8px',
              borderRadius: '4px',
              backgroundColor: 'rgba(0,0,0,0.3)',
              zIndex: 10000,
            }}
          >
            ✕
          </button>

          {/* Image Slideshow */}
          <div style={{ position: 'relative', marginBottom: '20px' }}>
            <div 
              style={{ 
                textAlign: 'center', 
                marginBottom: '20px', 
                marginTop: '20px',
                cursor: 'pointer',
              }}
              onClick={() => setIsFullscreen(true)}
            >
              <img
                src={allImages[currentImageIndex]}
                alt={`${event.title} - Image ${currentImageIndex + 1}`}
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '400px',
                  objectFit: 'contain',
                  borderRadius: '6px',
                  backgroundColor: '#000',
                }}
              />
            </div>

            {/* Navigation Buttons */}
            {allImages.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  style={{
                    position: 'absolute',
                    left: '20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    zIndex: 10000,
                  }}
                >
                  ‹
                </button>
                <button
                  onClick={nextImage}
                  style={{
                    position: 'absolute',
                    right: '20px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '40px',
                    height: '40px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                    zIndex: 10000,
                  }}
                >
                  ›
                </button>
              </>
            )}

            {/* Image Counter */}
            {allImages.length > 1 && (
              <div style={{
                position: 'absolute',
                bottom: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0,0,0,0.5)',
                color: 'white',
                padding: '5px 10px',
                borderRadius: '15px',
                fontSize: '0.9rem',
                zIndex: 10000,
              }}>
                {currentImageIndex + 1} / {allImages.length}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h2 style={{ margin: 0 }}>{event.title}</h2>
          </div>
          <p style={{ color: '#666', marginBottom: '10px' }}>{event.date}</p>
          <p style={{ flex: 1, marginBottom: '20px' }}>{event.description}</p>
          
          {/* Edit button at the bottom */}
          <div style={{ marginTop: 'auto', paddingTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => onEdit(event)}
              style={{
                fontSize: '1rem',
                cursor: 'pointer',
                background: '#2196F3',
                border: 'none',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'background-color 0.2s',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#1976D2'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#2196F3'}
            >
              <span>✎</span> Edit Event
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Image Modal */}
      {isFullscreen && (
        <FullscreenImage
          imageUrl={allImages[currentImageIndex]}
          onClose={() => setIsFullscreen(false)}
        />
      )}
    </>
  );
}

/**
 * NEW: A simple "Add Event" modal with a small form
 */
function AddEventModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (data: {
    title: string;
    description: string;
    date: string;
    image: string;
    relatedImages: string[];
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [image, setImage] = useState('');
  const [relatedImages, setRelatedImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingRelated, setIsDraggingRelated] = useState(false);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, isRelated: boolean = false) {
    e.preventDefault();
    e.stopPropagation();
    if (isRelated) {
      setIsDraggingRelated(true);
    } else {
      setIsDragging(true);
    }
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>, isRelated: boolean = false) {
    e.preventDefault();
    e.stopPropagation();
    if (isRelated) {
      setIsDraggingRelated(true);
    } else {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>, isRelated: boolean = false) {
    e.preventDefault();
    e.stopPropagation();
    if (isRelated) {
      setIsDraggingRelated(false);
    } else {
      setIsDragging(false);
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>, isRelated: boolean = false) {
    e.preventDefault();
    e.stopPropagation();
    if (isRelated) {
      setIsDraggingRelated(false);
    } else {
      setIsDragging(false);
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      const storageRef = ref(storage, `images/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload is ' + progress + '% done');
        },
        (error) => {
          console.error('Upload error:', error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          if (isRelated) {
            setRelatedImages(prev => [...prev, downloadURL]);
          } else {
            setImage(downloadURL);
          }
        }
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onAdd({
      title,
      description,
      date,
      image,
      relatedImages,
    });
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        overflowY: 'auto',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90%',
          maxWidth: '500px',
          backgroundColor: 'rgb(10,10,10)',
          borderRadius: '8px',
          padding: '20px',
          position: 'relative',
          boxShadow: '0 0px 15px rgba(155, 155, 155, 0.2)',
          margin: '20px auto',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            fontSize: '1.2rem',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            color: '#fff',
            padding: '8px',
            borderRadius: '4px',
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 10000,
          }}
        >
          ✕
        </button>
        <h2 style={{ marginTop: '20px' }}>Add New Event</h2>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Title:
            <input
              style={{ width: '100%', marginTop: '4px' }}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <label style={{ display: 'block', marginBottom: '8px' }}>
            Description:
            <textarea
              style={{ width: '100%', marginTop: '4px' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>

          <label style={{ display: 'block', marginBottom: '8px' }}>
            Date (YYYY-MM-DD):
            <input
              style={{ width: '100%', marginTop: '4px' }}
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>

          {/* Main Image Upload */}
          <div
            onDrop={(e) => handleDrop(e, false)}
            onDragOver={(e) => handleDragOver(e, false)}
            onDragEnter={(e) => handleDragEnter(e, false)}
            onDragLeave={(e) => handleDragLeave(e, false)}
            style={{
              marginBottom: '10px',
              border: '2px dashed #999',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              backgroundColor: isDragging ? '#eee' : '#fafafa',
              color: '#333',
            }}
          >
            {isDragging ? (
              <p>Drop the image here ...</p>
            ) : (
              <p>Drag & drop main image here</p>
            )}
            {image && (
              <div style={{ marginTop: '10px' }}>
                <p style={{ color: 'green' }}>Main image uploaded:</p>
                <div style={{ position: 'relative', display: 'inline-block', marginTop: '10px' }}>
                  <img
                    src={image}
                    alt="Main"
                    style={{ 
                      maxWidth: '200px', 
                      maxHeight: '200px', 
                      objectFit: 'cover', 
                      borderRadius: '4px',
                      display: 'block',
                      margin: '0 auto'
                    }}
                  />
                  <button
                    onClick={() => setImage('')}
                    style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      background: 'red',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Related Images Upload */}
          <div
            onDrop={(e) => handleDrop(e, true)}
            onDragOver={(e) => handleDragOver(e, true)}
            onDragEnter={(e) => handleDragEnter(e, true)}
            onDragLeave={(e) => handleDragLeave(e, true)}
            style={{
              marginBottom: '10px',
              border: '2px dashed #999',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              backgroundColor: isDraggingRelated ? '#eee' : '#fafafa',
              color: '#333',
            }}
          >
            {isDraggingRelated ? (
              <p>Drop the images here ...</p>
            ) : (
              <p>Drag & drop related images here</p>
            )}
            {relatedImages.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <p style={{ color: 'green' }}>Related images uploaded:</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '10px' }}>
                  {relatedImages.map((url, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <img
                        src={url}
                        alt={`Related ${idx + 1}`}
                        style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }}
                      />
                      <button
                        onClick={() => setRelatedImages(prev => prev.filter((_, i) => i !== idx))}
                        style={{
                          position: 'absolute',
                          top: '-8px',
                          right: '-8px',
                          background: 'red',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '20px',
                          height: '20px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Edit Event Modal - Similar to Add Event Modal but pre-populated
 */
function EditEventModal({
  event,
  onClose,
  onEdit,
}: {
  event: {
    id: string;
    image: string;
    title: string;
    description: string;
    date: string;
    relatedImages: string[];
  };
  onClose: () => void;
  onEdit: (id: string, data: {
    title: string;
    description: string;
    date: string;
    image: string;
    relatedImages: string[];
  }) => Promise<void>;
}) {
  // Convert the date string to YYYY-MM-DD format for the input
  const formatDateForInput = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        const today = new Date();
        return today.toISOString().split('T')[0];
      }
      return date.toISOString().split('T')[0];
    } catch (e) {
      const today = new Date();
      return today.toISOString().split('T')[0];
    }
  };

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description);
  const [date, setDate] = useState(formatDateForInput(event.date));
  const [image, setImage] = useState(event.image);
  const [relatedImages, setRelatedImages] = useState<string[]>(event.relatedImages || []);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingRelated, setIsDraggingRelated] = useState(false);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>, isRelated: boolean = false) {
    e.preventDefault();
    e.stopPropagation();
    if (isRelated) {
      setIsDraggingRelated(true);
    } else {
      setIsDragging(true);
    }
  }

  function handleDragEnter(e: React.DragEvent<HTMLDivElement>, isRelated: boolean = false) {
    e.preventDefault();
    e.stopPropagation();
    if (isRelated) {
      setIsDraggingRelated(true);
    } else {
      setIsDragging(true);
    }
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>, isRelated: boolean = false) {
    e.preventDefault();
    e.stopPropagation();
    if (isRelated) {
      setIsDraggingRelated(false);
    } else {
      setIsDragging(false);
    }
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>, isRelated: boolean = false) {
    e.preventDefault();
    e.stopPropagation();
    if (isRelated) {
      setIsDraggingRelated(false);
    } else {
      setIsDragging(false);
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    for (const file of files) {
      const storageRef = ref(storage, `images/${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload is ' + progress + '% done');
        },
        (error) => {
          console.error('Upload error:', error);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          if (isRelated) {
            setRelatedImages(prev => [...prev, downloadURL]);
          } else {
            setImage(downloadURL);
          }
        }
      );
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onEdit(event.id, {
      title,
      description,
      date,
      image,
      relatedImages,
    });
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        overflowY: 'auto',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90%',
          maxWidth: '500px',
          backgroundColor: 'rgb(10,10,10)',
          borderRadius: '8px',
          padding: '20px',
          position: 'relative',
          boxShadow: '0 0px 15px rgba(155, 155, 155, 0.2)',
          margin: '20px auto',
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            fontSize: '1.2rem',
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            color: '#fff',
            padding: '8px',
            borderRadius: '4px',
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 10000,
          }}
        >
          ✕
        </button>
        <h2 style={{ marginTop: '20px' }}>Edit Event</h2>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Title:
            <input
              style={{ width: '100%', marginTop: '4px' }}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>

          <label style={{ display: 'block', marginBottom: '8px' }}>
            Description:
            <textarea
              style={{ width: '100%', marginTop: '4px' }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </label>

          <label style={{ display: 'block', marginBottom: '8px' }}>
            Date (YYYY-MM-DD):
            <input
              style={{ width: '100%', marginTop: '4px' }}
              type="text"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>

          {/* Main Image Upload */}
          <div
            onDrop={(e) => handleDrop(e, false)}
            onDragOver={(e) => handleDragOver(e, false)}
            onDragEnter={(e) => handleDragEnter(e, false)}
            onDragLeave={(e) => handleDragLeave(e, false)}
            style={{
              marginBottom: '10px',
              border: '2px dashed #999',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              backgroundColor: isDragging ? '#eee' : '#fafafa',
              color: '#333',
            }}
          >
            {isDragging ? (
              <p>Drop the image here ...</p>
            ) : (
              <p>Drag & drop main image here</p>
            )}
            {image && (
              <div style={{ marginTop: '10px' }}>
                <p style={{ color: 'green' }}>Main image uploaded:</p>
                <div style={{ position: 'relative', display: 'inline-block', marginTop: '10px' }}>
                  <img
                    src={image}
                    alt="Main"
                    style={{ 
                      maxWidth: '200px', 
                      maxHeight: '200px', 
                      objectFit: 'cover', 
                      borderRadius: '4px',
                      display: 'block',
                      margin: '0 auto'
                    }}
                  />
                  <button
                    onClick={() => setImage('')}
                    style={{
                      position: 'absolute',
                      top: '-8px',
                      right: '-8px',
                      background: 'red',
                      color: 'white',
                      border: 'none',
                      borderRadius: '50%',
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Related Images Upload */}
          <div
            onDrop={(e) => handleDrop(e, true)}
            onDragOver={(e) => handleDragOver(e, true)}
            onDragEnter={(e) => handleDragEnter(e, true)}
            onDragLeave={(e) => handleDragLeave(e, true)}
            style={{
              marginBottom: '10px',
              border: '2px dashed #999',
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              backgroundColor: isDraggingRelated ? '#eee' : '#fafafa',
              color: '#333',
            }}
          >
            {isDraggingRelated ? (
              <p>Drop the images here ...</p>
            ) : (
              <p>Drag & drop related images here</p>
            )}
            {relatedImages.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <p style={{ color: 'green' }}>Related images uploaded:</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '10px' }}>
                  {relatedImages.map((url, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <img
                        src={url}
                        alt={`Related ${idx + 1}`}
                        style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px' }}
                      />
                      <button
                        onClick={() => setRelatedImages(prev => prev.filter((_, i) => i !== idx))}
                        style={{
                          position: 'absolute',
                          top: '-8px',
                          right: '-8px',
                          background: 'red',
                          color: 'white',
                          border: 'none',
                          borderRadius: '50%',
                          width: '20px',
                          height: '20px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '12px',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Main Page 
 */
export default function Home() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  // Add useEffect to handle event query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('event');
    
    if (eventId && events.length > 0) {
      const event = events.find(e => e.id === eventId);
      if (event) {
        setSelectedEvent(event);
      }
    }
  }, [events]);

  // Fetch events from Firebase
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const q = query(collection(db, 'timelineEvents'), orderBy('date', 'asc'));
        const snapshot = await getDocs(q);
        const fetchedEvents = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEvents(fetchedEvents);
      } catch (error) {
        console.error('Error fetching events:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // 1) On mount, fetch events from Firestore
  useEffect(() => {
    async function fetchData() {
      try {
        const q = query(
          collection(db, 'timelineEvents'),
          orderBy('date', 'asc') // or 'desc'
        );
    
        const snapshot = await getDocs(q);
        const fetched: any[] = [];

        snapshot.forEach((doc) => {
          const data = doc.data();

          // data.date is a Firestore Timestamp
          // If it's missing or not a Timestamp, handle gracefully
          let dateString = '';
          if (data.date && data.date.toDate) {
            // Convert Firestore Timestamp -> JS Date -> string
            dateString = data.date.toDate().toLocaleDateString(); 
            // e.g., "1/15/2023"
            // or toISOString(), or any date-fns format you like
          }

          fetched.push({
            id: doc.id,
            title: data.title,
            description: data.description,
            image: data.image,
            relatedImages: data.relatedImages || [],
            date: dateString, // store a string for easy rendering
          });
        });

        setEvents(fetched);
      } catch (error) {
        console.error('Error fetching Firestore data:', error);
        // Even if there's an error, for this demo, let's hide loader
      }
    }
    fetchData();
  }, []);

  // 2) Once not loading & pathRef is ready, measure path & animate + reveal
  useLayoutEffect(() => {
    if (loading || !pathRef.current || events.length === 0) return;

    const pathLength = pathRef.current.getTotalLength();

    pathRef.current.style.strokeDasharray = `${pathLength} ${pathLength}`;
    pathRef.current.style.strokeDashoffset = `${pathLength}`;
    pathRef.current.style.transition = 'none';
    pathRef.current.getBoundingClientRect();

    const totalTime = events.length * 600;
    pathRef.current.style.transition = `stroke-dashoffset ${totalTime}ms linear`;
    requestAnimationFrame(() => {
      pathRef.current!.style.strokeDashoffset = '0';
    });

    // Reveal events one-by-one
    let current = 0;
    const total = events.length;
    const interval = setInterval(() => {
      setRevealedCount((prev) => {
        if (prev < total - 1) {
          return prev + 1;
        } else {
          clearInterval(interval);
          return prev;
        }
      });
      current++;
      if (current >= total) {
        clearInterval(interval);
      }
    }, 600);

    return () => clearInterval(interval);
  }, [loading, events]);

  // If loading, show boomerang loader
  if (loading) {
    return (
      <div
        className='loader-background'
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100vh',
          backgroundColor: '#111',
          color: '#fff',
          flexDirection: 'column',
        }}
      >
        <div style={{ fontSize: '3rem', animation: 'spin 1s linear infinite' }}>
          🪃
        </div>
        <p>Loading...</p>
        <style jsx global>{`
          @keyframes spin {
            0% {
              transform: rotate(0deg);
            }
            100% {
              transform: rotate(360deg);
            }
          }
        `}</style>
      </div>
    );
  }

  async function handleAddEvent(data: {
    title: string;
    description: string;
    date: string;
    image: string;
    relatedImages: string[];
  }) {
    try {
      const [year, month, day] = data.date.split('-').map(Number);
      // Note: month is 0-based in JS, so month-1
      const dateObj = new Date(year, month - 1, day);
      // Then create a Firestore Timestamp
      const timestamp = Timestamp.fromDate(dateObj);

      const docRef = await addDoc(collection(db, 'timelineEvents'), {
        title: data.title,
        description: data.description,
        // store as Firestore Timestamp
        date: timestamp,
        image: data.image,
        relatedImages: data.relatedImages,
      });
      // Option A: refetch from Firestore
      // Option B: just push it into local state
      const newEvent = { id: docRef.id, ...data };
      // We'll insert it in the array in the correct order if you want
      // For simplicity, just push + re-sort
      const updated = [...events, newEvent];
      // if using 'date' as a string or timestamp, we can sort here if needed
      // e.g. if it's just a string, you might want a standardized format
      // updated.sort((a, b) => (a.date > b.date ? 1 : -1));
      setEvents(updated);
    } catch (error) {
      console.error('Failed to add new event:', error);
    }
  }

  function handleCloseModal() {
    setIsAddModalOpen(false);
  }

  async function handleEditEvent(id: string, data: {
    title: string;
    description: string;
    date: string;
    image: string;
    relatedImages: string[];
  }) {
    try {
      // Parse the date string and create a valid Date object
      const [year, month, day] = data.date.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      
      // Validate the date
      if (isNaN(dateObj.getTime())) {
        throw new Error('Invalid date format');
      }

      // Create Firestore timestamp
      const timestamp = Timestamp.fromDate(dateObj);

      // Update in Firestore
      const eventRef = doc(db, 'timelineEvents', id);
      await updateDoc(eventRef, {
        title: data.title,
        description: data.description,
        date: timestamp,
        image: data.image,
        relatedImages: data.relatedImages,
      });

      // Update local state
      setEvents(prevEvents => 
        prevEvents.map(event => 
          event.id === id 
            ? { 
                ...event, 
                ...data,
                date: dateObj.toLocaleDateString() // Format date for display
              }
            : event
        )
      );
    } catch (error) {
      console.error('Failed to edit event:', error);
      alert('Failed to update event. Please check the date format (YYYY-MM-DD) and try again.');
    }
  }

  // 3) Now we have data & are not loading -> build the timeline
  // Compute path points
  const points = events.map((_, i) => getEventPosition(i));
  const pathD = getSmoothPath(points);
  const rowCount = Math.ceil(events.length / EVENTS_PER_ROW);
  const totalHeight = rowCount * ROW_HEIGHT;
  const totalWidth = EVENTS_PER_ROW * (CARD_WIDTH + CARD_GAP);

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: '#111',
        padding: '30px',
        position: 'relative',
        overflow: 'auto',
      }}
    >
      {/* Show expanded modal if user selected a card */}
      {selectedEvent && (
        <ExpandedModal 
          event={selectedEvent} 
          onClose={() => setSelectedEvent(null)}
          onEdit={(event) => {
            setIsEditModalOpen(true);
          }}
        />
      )}

      {/* If user is adding a new event, show AddEventModal */}
      {isAddModalOpen && (
        <AddEventModal
          onClose={handleCloseModal}
          onAdd={handleAddEvent}
        />
      )}

      {/* If user is editing an event, show EditEventModal */}
      {isEditModalOpen && selectedEvent && (
        <EditEventModal
          event={selectedEvent}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedEvent(null);
          }}
          onEdit={handleEditEvent}
        />
      )}

      {/* "Add" button in top-right corner (floating) */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
      }}>
        <button
          onClick={() => setIsAddModalOpen(true)}
          style={{
            width: '50px',
            height: '50px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            fontSize: '1.5rem',
            cursor: 'pointer',
            backgroundColor: 'rgba(0,0,0,0.3)',
            color: '#fff',
            border: 'none',
            boxShadow: '0 0px 10px rgba(220, 220, 220, 0.3)',
          }}
        >
          +
        </button>
      </div>

      <div
        style={{
          position: 'relative',
          width: totalWidth,
          height: totalHeight,
          margin: '0 auto',
        }}
      >
        <svg
          width={totalWidth}
          height={totalHeight}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            overflow: 'visible',
          }}
        >
          <path
            ref={pathRef}
            d={pathD}
            stroke="#666"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
          />
        </svg>

        {events.map((ev, i) => {
          const isRevealed = revealedCount >= i;
          return (
            <EventCard
              key={ev.id}
              event={ev}
              index={i}
              isRevealed={isRevealed}
              onSelect={(selected) => setSelectedEvent(selected)}
            />
          );
        })}
      </div>
    </div>
  );
}
