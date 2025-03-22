'use client';
import React, { useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getStorage } from 'firebase/storage';

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
export const storage = getStorage(app);

export default function DragDropUpload() {
  const [isDragging, setIsDragging] = useState(false);

  // Drop handler
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // If the user dropped multiple files, take the first for simplicity
    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Create a storage ref (e.g. 'images/filename.jpg')
    const storageRef = ref(storage, `images/${file.name}`);

    // Upload the file
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        // Optional: track upload progress here
        const progress =
          (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        console.log(`Upload is ${progress}% done`);
      },
      (error) => {
        console.error('Upload error:', error);
      },
      () => {
        // Once upload is done, get the download URL
        getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
          console.log('File available at:', downloadURL);
          // Here, you can store 'downloadURL' in Firestore or wherever you need it
        });
      }
    );
  }

  // Drag Over / Enter handlers to allow drop
  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }
  function handleDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (isDragging) setIsDragging(false);
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      style={{
        border: '2px dashed #999',
        borderRadius: '8px',
        padding: '40px',
        textAlign: 'center',
        backgroundColor: isDragging ? '#eee' : '#fafafa',
        color: '#333',
        width: '300px',
        margin: '50px auto',
      }}
    >
      {isDragging ? (
        <p>Drop the file here ...</p>
      ) : (
        <p>Drag & drop a file here, or click to select</p>
      )}
      {/* You can also handle "click to select" by hooking into a hidden <input type="file" /> */}
    </div>
  );
}
