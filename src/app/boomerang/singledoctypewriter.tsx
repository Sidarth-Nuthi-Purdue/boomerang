'use client';

import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import Typewriter from './typewriter'; // Replace with your actual Typewriter import
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
export const db = getFirestore(app);
export const storage = getStorage(app);

interface SingleDocTypewriterProps {
  typingSpeed?: number;
}

export default function SingleDocTypewriter({ typingSpeed = 100 }: SingleDocTypewriterProps) {
  const [text, setText] = useState('');

  useEffect(() => {
    async function fetchText() {
      try {
        // Example: collection = 'pages', doc ID = 'myDoc'
        const docRef = doc(db, 'pages', 'myDoc'); 
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setText(data.text || 'No "text" field found');
        } else {
          setText('Document does not exist!');
        }
      } catch (error) {
        console.error('Error fetching document:', error);
        setText('Failed to load text');
      }
    }

    fetchText();
  }, []);

  return <Typewriter text={text} typingSpeed={typingSpeed} />;
}
