'use client';
import { useRef, useEffect, useLayoutEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { query, orderBy, getFirestore, addDoc, Timestamp, collection, getDocs } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, getStorage } from 'firebase/storage';

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
 * Expanded Modal 
 */
function ExpandedModal({
  event,
  onClose,
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
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        overflow: 'auto',
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
          }}
        >
          ✕
        </button>
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <img
            src={event.image}
            alt={event.title}
            style={{ maxWidth: '100%', borderRadius: '6px' }}
          />
        </div>
        <h2 style={{ marginTop: 0 }}>{event.title}</h2>
        <p style={{ color: '#666', marginBottom: '10px' }}>{event.date}</p>
        <p>{event.description}</p>
        {event.relatedImages?.length > 0 && (
          <div style={{ marginTop: '20px' }}>
            <h4>Related Images:</h4>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {event.relatedImages.map((imgUrl, idx) => (
                <img
                  key={idx}
                  src={imgUrl}
                  alt="Related"
                  style={{ width: '100px', borderRadius: '4px' }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
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
  const [relatedImages, setRelatedImages] = useState('');

  // -- DRAG & DROP STATES --
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }
  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Create a storage ref, e.g. "images/<fileName>"
    const storageRef = ref(storage, `images/${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        // Optionally track progress
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log('Upload is ' + progress + '% done');
      },
      (error) => {
        console.error('Upload error:', error);
      },
      () => {
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          console.log('File available at', downloadURL);
          // Set the "image" state to the download link
          setImage(downloadURL);
        });
      }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const relArr = relatedImages
      .split(',')
      .map((img) => img.trim())
      .filter(Boolean);

    await onAdd({
      title,
      description,
      date,
      image, // we use image state, possibly from drag-drop
      relatedImages: relArr,
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
        overflow: 'auto',
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
          }}
        >
          ✕
        </button>
        <h2>Add New Event</h2>

        {/* DRAG & DROP ZONE */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
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
            <p>Drag & drop an image here, or continue below</p>
          )}
          {image && (
            <p style={{ marginTop: '10px', color: 'green' }}>
              Currently using uploaded image: <br />
              <small>{image}</small>
            </p>
          )}
        </div>

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

          {/* You can remove this if you only want drag & drop */}
          <label style={{ display: 'block', marginBottom: '8px' }}>
            Image URL (optional):
            <input
              style={{ width: '100%', marginTop: '4px' }}
              type="text"
              value={image}
              onChange={(e) => setImage(e.target.value)}
            />
          </label>

          {/* <label style={{ display: 'block', marginBottom: '8px' }}>
            Related Images (comma separated):
            <input
              style={{ width: '100%', marginTop: '4px' }}
              type="text"
              value={relatedImages}
              onChange={(e) => setRelatedImages(e.target.value)}
            />
          </label> */}

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
 * Main Page 
 */
export default function Home() {
  const [loading, setLoading] = useState(true);
  const [revealedCount, setRevealedCount] = useState(-1);
  const [eventsData, setEventsData] = useState<
    Array<{
      id: string;
      image: string;
      title: string;
      description: string;
      date: string;
      relatedImages: string[];
    }>
  >([]);
  const [showAddModal, setShowAddModal] = useState(false); // <-- new state

  const pathRef = useRef<SVGPathElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

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

        setEventsData(fetched);
        setLoading(false);

      } catch (error) {
        console.error('Error fetching Firestore data:', error);
        // Even if there's an error, for this demo, let's hide loader
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // 2) Once not loading & pathRef is ready, measure path & animate + reveal
  useLayoutEffect(() => {
    if (loading || !pathRef.current || eventsData.length === 0) return;

    const pathLength = pathRef.current.getTotalLength();

    pathRef.current.style.strokeDasharray = `${pathLength} ${pathLength}`;
    pathRef.current.style.strokeDashoffset = `${pathLength}`;
    pathRef.current.style.transition = 'none';
    pathRef.current.getBoundingClientRect();

    const totalTime = eventsData.length * 600;
    pathRef.current.style.transition = `stroke-dashoffset ${totalTime}ms linear`;
    requestAnimationFrame(() => {
      pathRef.current!.style.strokeDashoffset = '0';
    });

    // Reveal events one-by-one
    let current = 0;
    const total = eventsData.length;
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
  }, [loading, eventsData]);

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
      const updated = [...eventsData, newEvent];
      // if using 'date' as a string or timestamp, we can sort here if needed
      // e.g. if it's just a string, you might want a standardized format
      // updated.sort((a, b) => (a.date > b.date ? 1 : -1));
      setEventsData(updated);
    } catch (error) {
      console.error('Failed to add new event:', error);
    }
  }

  function handleCloseModal() {
    setShowAddModal(false);
  }

  // 3) Now we have data & are not loading -> build the timeline
  // Compute path points
  const points = eventsData.map((_, i) => getEventPosition(i));
  const pathD = getSmoothPath(points);
  const rowCount = Math.ceil(eventsData.length / EVENTS_PER_ROW);
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
        <ExpandedModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      {/* If user is adding a new event, show AddEventModal */}
      {showAddModal && (
        <AddEventModal
          onClose={handleCloseModal}
          onAdd={handleAddEvent}
        />
      )}

      {/* "Add" button in top-right corner (floating) */}
      <button
        onClick={() => setShowAddModal(true)}
        style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          width: '50px',
          height: '50px',
          display: 'flex',         // center the plus symbol
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',     // circle shape
          fontSize: '1.5rem',
          cursor: 'pointer',
          backgroundColor: 'rgba(0,0,0,0.3)',   // "bg-black/30"
          color: '#fff',
          border: 'none',
          boxShadow: '0 0px 10px rgba(220, 220, 220, 0.3)', // the light glow
          outline: 'none',
        }}
      >
        +
      </button>

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

        {eventsData.map((ev, i) => {
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
