'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { getFirestore, collection, getDocs, query, orderBy, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";

// Firebase config
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

// GeoJSON URL for US states
const geoUrl = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

interface Location {
  id: string;
  state: string;
  eventId: string;
  offsetX: number;
  offsetY: number;
  position: [number, number];
  title: string;
}

// State capitals coordinates for placing markers
const STATE_COORDINATES: { [key: string]: [number, number] } = {
  'AL': [-86.279118, 32.361538],
  'AK': [-134.419740, 58.301935],
  'AZ': [-112.073844, 33.448457],
  'AR': [-92.331122, 34.736009],
  'CA': [-121.468926, 38.555605],
  'CO': [-104.984167, 39.7391667],
  'CT': [-72.677, 41.767],
  'DE': [-75.526755, 39.161921],
  'FL': [-84.27277, 30.4518],
  'GA': [-84.39, 33.76],
  'HI': [-157.826182, 21.30895],
  'ID': [-116.237651, 43.613739],
  'IL': [-89.650373, 39.78325],
  'IN': [-86.147685, 39.790942],
  'IA': [-93.620866, 41.590939],
  'KS': [-95.69, 39.04],
  'KY': [-84.86311, 38.197274],
  'LA': [-91.140229, 30.45809],
  'ME': [-69.765261, 44.323535],
  'MD': [-76.501157, 38.972945],
  'MA': [-71.0275, 42.2352],
  'MI': [-84.5467, 42.7335],
  'MN': [-93.094, 44.95],
  'MS': [-90.207, 32.32],
  'MO': [-92.189283, 38.572954],
  'MT': [-112.027031, 46.595805],
  'NE': [-96.675345, 40.809868],
  'NV': [-119.753877, 39.160949],
  'NH': [-71.549127, 43.220093],
  'NJ': [-74.756138, 40.221741],
  'NM': [-105.964575, 35.667231],
  'NY': [-73.781339, 42.659829],
  'NC': [-78.638, 35.771],
  'ND': [-100.779004, 48.813343],
  'OH': [-83.000647, 39.962245],
  'OK': [-97.534994, 35.482309],
  'OR': [-123.029159, 44.931109],
  'PA': [-76.875613, 40.269789],
  'RI': [-71.422132, 41.82355],
  'SC': [-81.035, 34.000],
  'SD': [-100.336378, 44.367966],
  'TN': [-86.784, 36.165],
  'TX': [-97.75, 30.266667],
  'UT': [-111.892622, 40.7547],
  'VT': [-72.57194, 44.26639],
  'VA': [-77.46, 37.54],
  'WA': [-122.893077, 47.042418],
  'WV': [-81.633294, 38.349497],
  'WI': [-89.384444, 43.074722],
  'WY': [-104.802042, 41.145548]
};

// Add state name to postal code mapping
const STATE_NAME_TO_POSTAL: { [key: string]: string } = {
  'Alabama': 'AL',
  'Alaska': 'AK',
  'Arizona': 'AZ',
  'Arkansas': 'AR',
  'California': 'CA',
  'Colorado': 'CO',
  'Connecticut': 'CT',
  'Delaware': 'DE',
  'Florida': 'FL',
  'Georgia': 'GA',
  'Hawaii': 'HI',
  'Idaho': 'ID',
  'Illinois': 'IL',
  'Indiana': 'IN',
  'Iowa': 'IA',
  'Kansas': 'KS',
  'Kentucky': 'KY',
  'Louisiana': 'LA',
  'Maine': 'ME',
  'Maryland': 'MD',
  'Massachusetts': 'MA',
  'Michigan': 'MI',
  'Minnesota': 'MN',
  'Mississippi': 'MS',
  'Missouri': 'MO',
  'Montana': 'MT',
  'Nebraska': 'NE',
  'Nevada': 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  'Ohio': 'OH',
  'Oklahoma': 'OK',
  'Oregon': 'OR',
  'Pennsylvania': 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  'Tennessee': 'TN',
  'Texas': 'TX',
  'Utah': 'UT',
  'Vermont': 'VT',
  'Virginia': 'VA',
  'Washington': 'WA',
  'West Virginia': 'WV',
  'Wisconsin': 'WI',
  'Wyoming': 'WY'
};

// Update the getStateId function to use the state name mapping
const getStateId = (geo: any) => {
  if (!geo?.properties?.name) return null;
  return STATE_NAME_TO_POSTAL[geo.properties.name];
};

// Add US outline coordinates
const US_OUTLINE = [
  { x: 100, y: 50 },   // Northwest
  { x: 300, y: 50 },   // Northeast
  { x: 300, y: 300 },  // Southeast
  { x: 100, y: 300 },  // Southwest
  { x: 100, y: 50 }    // Back to start
];

export default function MapPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [isAddingLocation, setIsAddingLocation] = useState(false);
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [locationToEdit, setLocationToEdit] = useState<Location | null>(null);
  const [hoveredLocation, setHoveredLocation] = useState<Location | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [draggedLocation, setDraggedLocation] = useState<Location | null>(null);
  const [selectedEventId, setSelectedEventId] = useState('');

  // Add debug logging for state changes
  useEffect(() => {
    console.log('Selected State:', selectedState);
    console.log('Is Adding Location:', isAddingLocation);
  }, [selectedState, isAddingLocation]);

  // Fetch events and locations from Firebase
  useEffect(() => {
    async function fetchData() {
      try {
        setError(null);
        setLoading(true);
        // Fetch events
        const eventsQuery = query(collection(db, 'timelineEvents'), orderBy('date', 'asc'));
        const eventsSnapshot = await getDocs(eventsQuery);
        const fetchedEvents = eventsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setEvents(fetchedEvents);

        // Fetch locations
        const locationsQuery = query(collection(db, 'mapLocations'));
        const locationsSnapshot = await getDocs(locationsQuery);
        const fetchedLocations = locationsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Location[];
        setLocations(fetchedLocations);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Check if clicking on a location marker
    const clickedLocation = locations.find(loc => {
      const stateCoords = STATE_COORDINATES[loc.state];
      const markerX = stateCoords[0] + loc.offsetX;
      const markerY = stateCoords[1] + loc.offsetY;
      const dx = markerX - x;
      const dy = markerY - y;
      return Math.sqrt(dx * dx + dy * dy) < 10; // 10px radius for click detection
    });

    if (clickedLocation) {
      setIsDragging(true);
      setDragStartPos({ x, y });
      setDraggedLocation(clickedLocation);
      return;
    }

    // If not dragging a location, handle state selection
    const state = findStateAtPoint(x, y);
    if (state && isAddingLocation) {
      setSelectedState(state);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging && draggedLocation) {
      // Calculate new offset based on drag distance
      const stateCoords = STATE_COORDINATES[draggedLocation.state];
      const newOffsetX = x - stateCoords[0];
      const newOffsetY = y - stateCoords[1];
      
      // Update the dragged location's offset
      setLocations(prevLocations =>
        prevLocations.map(loc =>
          loc === draggedLocation
            ? { ...loc, offsetX: newOffsetX, offsetY: newOffsetY }
            : loc
        )
      );
    } else {
      // Handle hover effects for locations
      const hoveredLoc = locations.find(loc => {
        const stateCoords = STATE_COORDINATES[loc.state];
        const markerX = stateCoords[0] + loc.offsetX;
        const markerY = stateCoords[1] + loc.offsetY;
        const dx = markerX - x;
        const dy = markerY - y;
        return Math.sqrt(dx * dx + dy * dy) < 10;
      });
      setHoveredLocation(hoveredLoc || null);
    }
  };

  const handleMouseUp = () => {
    if (isDragging && draggedLocation) {
      // Save the final position to Firebase
      const stateCoords = STATE_COORDINATES[draggedLocation.state];
      handleMarkerDragEnd(draggedLocation.id, [
        stateCoords[0] + draggedLocation.offsetX,
        stateCoords[1] + draggedLocation.offsetY
      ]);
    }
    setIsDragging(false);
    setDraggedLocation(null);
  };

  // Add this function to find state at a point
  const findStateAtPoint = (x: number, y: number): string | null => {
    // Simple implementation - find the closest state marker
    let closestState: string | null = null;
    let minDistance = Infinity;
    
    Object.entries(STATE_COORDINATES).forEach(([state, coords]) => {
      const dx = coords[0] - x;
      const dy = coords[1] - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestState = state;
      }
    });
    
    return closestState;
  };

  // Add this function to handle state clicks
  const handleStateClick = (geo: any) => {
    if (!isAddingLocation) return;
    
    const stateId = getStateId(geo);
    if (!stateId) return;
    
    const hasExistingLocation = locations.some(loc => loc.state === stateId);
    if (hasExistingLocation) return;
    
    setSelectedState(stateId);
  };

  // Add a new function to handle event selection
  const handleEventSelection = async (eventId: string) => {
    console.log('Event selected:', eventId);
    console.log('Current selected state:', selectedState);
    
    if (eventId && selectedState) {
      try {
        const stateCoords = STATE_COORDINATES[selectedState];
        if (!stateCoords) {
          console.error('No coordinates found for state:', selectedState);
          return;
        }

        const event = events.find(e => e.id === eventId);
        if (!event) {
          console.error('Event not found:', eventId);
          return;
        }

        const newLocation: Omit<Location, 'id'> = {
          state: selectedState,
          eventId: eventId,
          offsetX: 0,
          offsetY: 0,
          position: stateCoords,
          title: event.title
        };

        console.log('Adding new location:', newLocation);

        // Add to Firebase
        const docRef = await addDoc(collection(db, 'mapLocations'), newLocation);
        
        // Update local state
        setLocations(prev => [...prev, { ...newLocation, id: docRef.id }]);
        
        // Reset selection
        setSelectedState(null);
        setSelectedEventId('');
        setIsAddingLocation(false);
      } catch (error) {
        console.error('Error adding location:', error);
      }
    } else {
      console.log('Missing required data:', { eventId, selectedState });
    }
  };

  // Update the handleMarkerDragEnd function to use offsets
  const handleMarkerDragEnd = async (locationId: string, finalPosition: [number, number]) => {
    try {
      const location = locations.find(loc => loc.id === locationId);
      if (!location) return;

      const stateCoords = STATE_COORDINATES[location.state];
      if (!stateCoords) return;

      // Calculate offsets as the difference from the default state center
      const newOffsetX = finalPosition[0] - stateCoords[0];
      const newOffsetY = finalPosition[1] - stateCoords[1];

      // Update in Firebase
      const locationRef = doc(db, 'mapLocations', locationId);
      await updateDoc(locationRef, {
        offsetX: newOffsetX,
        offsetY: newOffsetY
      });

      // Update local state
      setLocations(prev => prev.map(loc => 
        loc.id === locationId 
          ? { ...loc, offsetX: newOffsetX, offsetY: newOffsetY }
          : loc
      ));
    } catch (error) {
      console.error('Error updating marker position:', error);
    }
  };

  // Update the handleDeleteLocation function to properly delete from Firebase
  const handleDeleteLocation = async (locationId: string) => {
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'mapLocations', locationId));
      setLocations(prev => prev.filter(loc => loc.id !== locationId));
      setError(null);
    } catch (error) {
      console.error('Error deleting location:', error);
      setError('Failed to delete location');
    } finally {
      setLoading(false);
    }
  };

  // Update the drawing code to use offsets
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw US outline
    ctx.beginPath();
    ctx.moveTo(US_OUTLINE[0].x, US_OUTLINE[0].y);
    for (let i = 1; i < US_OUTLINE.length; i++) {
      ctx.lineTo(US_OUTLINE[i].x, US_OUTLINE[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw state markers and names
    Object.entries(STATE_COORDINATES).forEach(([state, coords]) => {
      ctx.beginPath();
      ctx.arc(coords[0], coords[1], 4, 0, Math.PI * 2);
      ctx.fillStyle = selectedState === state ? '#4CAF50' : '#666';
      ctx.fill();

      ctx.fillStyle = '#999';
      ctx.font = '10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(state, coords[0], coords[1] + 15);
    });

    // Draw location markers with offsets
    locations.forEach(location => {
      const stateCoords = STATE_COORDINATES[location.state];
      const x = stateCoords[0] + location.offsetX;
      const y = stateCoords[1] + location.offsetY;

      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = hoveredLocation === location ? '#4CAF50' : '#2196F3';
      ctx.fill();

      if (hoveredLocation === location) {
        const event = events.find(e => e.id === location.eventId);
        if (event) {
          ctx.fillStyle = '#fff';
          ctx.font = '12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText(event.title, x, y - 10);
        }
      }
    });
  }, [locations, selectedState, hoveredLocation, events]);

  const handleLocationClick = (location: Location) => {
    if (isEditingLocation) {
      setLocationToEdit(location);
      setSelectedEventId(location.eventId);
    }
  };

  const handleUpdateLocation = async () => {
    if (!locationToEdit || !selectedEventId) return;

    try {
      const event = events.find(e => e.id === selectedEventId);
      if (!event) return;

      const locationRef = doc(db, 'mapLocations', locationToEdit.id);
      await updateDoc(locationRef, {
        eventId: selectedEventId,
        title: event.title
      });

      // Update local state
      setLocations(prev => prev.map(loc => 
        loc.id === locationToEdit.id 
          ? { ...loc, eventId: selectedEventId, title: event.title }
          : loc
      ));

      // Reset editing state
      setIsEditingLocation(false);
      setLocationToEdit(null);
      setSelectedEventId('');
    } catch (error) {
      console.error('Error updating location:', error);
      setError('Failed to update location');
    }
  };

  // Update the handleAddLocation function to use default points
  const handleAddLocation = async () => {
    if (!selectedState || !selectedEventId) return;

    try {
      const stateCoords = STATE_COORDINATES[selectedState];
      if (!stateCoords) return;

      const event = events.find(e => e.id === selectedEventId);
      if (!event) return;

      const newLocation: Omit<Location, 'id'> = {
        state: selectedState,
        eventId: selectedEventId,
        offsetX: 0,  // Start at center
        offsetY: 0,  // Start at center
        position: stateCoords,
        title: event.title
      };

      // Add to Firebase
      const docRef = await addDoc(collection(db, 'mapLocations'), newLocation);
      
      // Update local state
      setLocations(prev => [...prev, { ...newLocation, id: docRef.id }]);
      
      // Reset selection
      setSelectedState(null);
      setSelectedEventId('');
    } catch (error) {
      console.error('Error adding location:', error);
    }
  };

  return (
    <div style={{ 
      width: '100%', 
      minHeight: '100vh', 
      backgroundColor: '#111',
      padding: '20px',
      paddingBottom: '80px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        width: '100%',
        maxWidth: '1200px',
        marginBottom: '20px'
      }}>
        <h1 style={{ color: '#fff', margin: 0 }}>US Timeline Map</h1>
      </div>

      {error && (
        <div style={{
          color: '#f44336',
          marginBottom: '20px',
          padding: '10px',
          backgroundColor: 'rgba(244, 67, 54, 0.1)',
          borderRadius: '4px',
          width: '100%',
          maxWidth: '1200px',
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{
          color: '#fff',
          marginBottom: '20px',
          padding: '10px',
          backgroundColor: 'rgba(33, 150, 243, 0.1)',
          borderRadius: '4px',
          width: '100%',
          maxWidth: '1200px',
        }}>
          Loading...
        </div>
      )}

      <div style={{ 
        position: 'relative',
        backgroundColor: '#222',
        borderRadius: '8px',
        padding: '20px',
        marginBottom: '20px',
        width: '100%',
        maxWidth: '1200px'
      }}>
        <ComposableMap
          projection="geoAlbersUsa"
          style={{
            width: '100%',
            height: 'auto',
            minHeight: '400px',
          }}
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map(geo => {
                const stateId = getStateId(geo);
                const isSelected = selectedState === stateId;
                const hasLocation = locations.some(loc => loc.state === stateId);
                const isClickable = isAddingLocation && !hasLocation;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onClick={() => handleStateClick(geo)}
                    style={{
                      default: {
                        fill: isSelected ? '#4CAF50' : hasLocation ? '#2196F3' : '#333',
                        stroke: isSelected ? '#fff' : '#666',
                        strokeWidth: isSelected ? 2 : 0.5,
                        outline: 'none',
                        cursor: isClickable ? 'pointer' : 'default',
                        opacity: isAddingLocation && !isClickable && !isSelected ? 0.5 : 1,
                        transition: 'all 0.3s ease',
                      },
                      hover: {
                        fill: isSelected ? '#4CAF50' : (isClickable ? '#4CAF50' : (hasLocation ? '#2196F3' : '#333')),
                        stroke: isSelected ? '#fff' : '#666',
                        strokeWidth: isSelected ? 2 : 0.5,
                        outline: 'none',
                        opacity: isAddingLocation && !isClickable && !isSelected ? 0.5 : 1,
                        transition: 'all 0.3s ease',
                      },
                      pressed: {
                        fill: isSelected ? '#4CAF50' : (isClickable ? '#45a049' : (hasLocation ? '#1976D2' : '#333')),
                        stroke: isSelected ? '#fff' : '#666',
                        strokeWidth: isSelected ? 2 : 0.5,
                        outline: 'none',
                        transition: 'all 0.3s ease',
                      },
                    }}
                  />
                );
              })
            }
          </Geographies>

          {locations.map((location) => (
            <Marker
              key={location.id}
              coordinates={location.position}
              onMouseEnter={() => setHoveredLocation(location)}
              onMouseLeave={() => setHoveredLocation(null)}
            >
              <Link href={`/?event=${location.eventId}`}>
                <g 
                  style={{ cursor: 'pointer' }}
                  onMouseDown={(e) => {
                    // Prevent link navigation when starting drag
                    e.preventDefault();
                    
                    const marker = e.currentTarget;
                    const svg = marker.closest('svg');
                    if (!svg) return;

                    let isDragging = false;
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startPosition = location.position;

                    const handleMouseMove = (moveEvent: MouseEvent) => {
                      isDragging = true;
                      const dx = moveEvent.clientX - startX;
                      const dy = moveEvent.clientY - startY;
                      
                      // Update marker position in real-time
                      marker.setAttribute('transform', `translate(${dx}, ${dy})`);
                      
                      moveEvent.preventDefault();
                    };

                    const handleMouseUp = (upEvent: MouseEvent) => {
                      document.removeEventListener('mousemove', handleMouseMove);
                      document.removeEventListener('mouseup', handleMouseUp);

                      if (isDragging) {
                        const dx = upEvent.clientX - startX;
                        const dy = upEvent.clientY - startY;
                        
                        // Convert final position to coordinates
                        const newCoordinates: [number, number] = [
                          startPosition[0] + dx * 0.01,
                          startPosition[1] - dy * 0.01
                        ];
                        
                        handleMarkerDragEnd(location.id, newCoordinates);
                      }
                    };

                    document.addEventListener('mousemove', handleMouseMove);
                    document.addEventListener('mouseup', handleMouseUp);
                  }}
                >
                  <circle
                    r={6}
                    fill={hoveredLocation?.id === location.id ? '#2196F3' : '#4CAF50'}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                  {hoveredLocation?.id === location.id && (
                    <text
                      textAnchor="middle"
                      y={-15}
                      style={{
                        fontFamily: 'Arial',
                        fontSize: '14px',
                        fill: '#fff',
                        pointerEvents: 'none'
                      }}
                    >
                      {location.title}
                    </text>
                  )}
                </g>
              </Link>
            </Marker>
          ))}
        </ComposableMap>

        {isAddingLocation && selectedState && (
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            backgroundColor: 'rgba(0,0,0,0.9)',
            padding: '20px',
            borderRadius: '8px',
            color: '#fff',
            minWidth: '250px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
            zIndex: 1000,
          }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Add Location</h3>
            <p style={{ margin: '0 0 15px 0' }}>Selected State: {selectedState}</p>
            <select
              onChange={(e) => handleEventSelection(e.target.value)}
              defaultValue=""
              style={{
                width: '100%',
                padding: '8px',
                backgroundColor: '#333',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              <option value="">Select an event...</option>
              {events.map(event => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                console.log('Cancel button clicked');
                setSelectedState(null);
                setIsAddingLocation(false);
              }}
              style={{
                marginTop: '10px',
                padding: '4px 8px',
                backgroundColor: '#f44336',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                width: '100%',
              }}
            >
              Cancel Selection
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={() => {
            setIsAddingLocation(!isAddingLocation);
            setIsEditingLocation(false);
            setSelectedState(null);
            setError('');
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: isAddingLocation ? '#f44336' : '#4CAF50',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {isAddingLocation ? '❌ Cancel' : '📍 Add Location'}
        </button>

        <button
          onClick={() => {
            setIsEditingLocation(!isEditingLocation);
            setIsAddingLocation(false);
            setSelectedState(null);
            setError('');
          }}
          style={{
            padding: '8px 16px',
            backgroundColor: isEditingLocation ? '#f44336' : '#2196F3',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          {isEditingLocation ? '❌ Cancel Edit' : '✏️ Edit Location'}
        </button>
      </div>

      {isEditingLocation && locationToEdit && (
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '20px',
          backgroundColor: 'rgba(0,0,0,0.9)',
          padding: '20px',
          borderRadius: '8px',
          color: '#fff',
          minWidth: '250px',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          zIndex: 1000,
        }}>
          <h3 style={{ margin: '0 0 10px 0' }}>Edit Location</h3>
          <p style={{ margin: '0 0 15px 0' }}>State: {locationToEdit.state}</p>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            style={{
              width: '100%',
              padding: '8px',
              backgroundColor: '#333',
              color: '#fff',
              border: '1px solid #444',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            <option value="">Select an event...</option>
            {events.map(event => (
              <option key={event.id} value={event.id}>
                {event.title}
              </option>
            ))}
          </select>
          <button
            onClick={handleUpdateLocation}
            style={{
              marginTop: '10px',
              padding: '8px 16px',
              backgroundColor: '#4CAF50',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Update Location
          </button>
        </div>
      )}
    </div>
  );
} 