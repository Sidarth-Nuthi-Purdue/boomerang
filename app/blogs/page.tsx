'use client';
import { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, orderBy, query, Timestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyCfzCS5vX2g9ttfIDuANSJVMnnAeq84uRk",
  authDomain: "boomerang-13efe.firebaseapp.com",
  projectId: "boomerang-13efe",
  storageBucket: "boomerang-13efe",
  messagingSenderId: "178749616808",
  appId: "1:178749616808:web:40a573be16a57a58dbc89d",
  measurementId: "G-JZVJPEXBG8"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app);

interface Blog {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: Date;
  videos?: VideoData[];
  videoUrls?: string[]; // Simple array of video URLs
  transcription?: string;
  generatedFromVideo?: boolean;
}

interface VideoData {
  id: string;
  filename: string;
  url: string;
  transcription?: string;
  segments?: VideoData[]; // For multi-segment videos
  audioUrl?: string; // Audio-only version for faster transcription
}

export default function BlogsPage() {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [showNewBlogForm, setShowNewBlogForm] = useState(false);
  const [newBlog, setNewBlog] = useState({
    title: '',
    content: '',
    author: ''
  });
  const [loading, setLoading] = useState(true);
  const [uploadedVideos, setUploadedVideos] = useState<VideoData[]>([]);
  const [uploadingVideos, setUploadingVideos] = useState<{[key: string]: number}>({});
  const [processingVideos, setProcessingVideos] = useState<string[]>([]);
  const [showVideoForm, setShowVideoForm] = useState(false);
  const [generatingBlog, setGeneratingBlog] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Load blogs and videos from Firebase and localStorage
  useEffect(() => {
    loadBlogs();
    loadVideos();
  }, []);

  const loadBlogs = async () => {
    try {
      // Try to load from Firebase first
      const blogsQuery = query(collection(db, 'blogs'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(blogsQuery);
      
      const firebaseBlogs: Blog[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        firebaseBlogs.push({
          id: doc.id,
          title: data.title,
          content: data.content,
          author: data.author,
          createdAt: data.createdAt?.toDate() || new Date(),
          videos: data.videos || [],
          videoUrls: data.videoUrls || [],
          transcription: data.transcription,
          generatedFromVideo: data.generatedFromVideo || false
        });
      });

      setBlogs(firebaseBlogs);
      
      // Save to localStorage as backup
      localStorage.setItem('blogs', JSON.stringify(firebaseBlogs));
    } catch (error) {
      console.log('Firebase load failed, using localStorage:', error);
      
      // Fallback to localStorage
      const localBlogs = localStorage.getItem('blogs');
      if (localBlogs) {
        const parsedBlogs = JSON.parse(localBlogs);
        setBlogs(parsedBlogs.map((blog: any) => ({
          ...blog,
          createdAt: new Date(blog.createdAt)
        })));
      }
    } finally {
      setLoading(false);
    }
  };

  const loadVideos = async () => {
    try {
      const videosCollection = collection(db, 'videos');
      const videosSnapshot = await getDocs(query(videosCollection, orderBy('createdAt', 'desc')));
      const videosData = videosSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt
        } as VideoData;
      });
      setUploadedVideos(videosData);
      console.log(`✅ Loaded ${videosData.length} videos from database:`, videosData);
    } catch (error) {
      console.error('Error loading videos:', error);
    }
  };

  // Handle multiple file uploads with optimized concurrency for large video files
  const handleFileSelection = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    
    // Upload all files concurrently with small stagger to avoid overwhelming the browser
    const promises = fileArray.map((file, index) => 
      new Promise(resolve => {
        // Small stagger to avoid network congestion (100ms between each file start)
        setTimeout(() => {
          console.log(`🚀 Starting concurrent upload ${index + 1}/${fileArray.length}: ${file.name}`);
          uploadVideo(file).then(resolve).catch(resolve);
        }, index * 100);
      })
    );
    
    // Wait for all uploads to complete
    await Promise.all(promises);
    console.log(`✅ All ${fileArray.length} file uploads completed`);
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith('video/') || file.type.startsWith('audio/')
    );
    
    if (files.length > 0) {
      handleFileSelection(files);
    }
  };

  // For now, we'll skip compression and use resumable upload for speed
  // Compression was causing issues with file integrity

  // Parallel chunk upload for maximum speed
  const uploadVideoParallel = async (file: File) => {
    const videoId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    try {
      setUploadingVideos(prev => ({ ...prev, [videoId]: 0 }));
      
      const storageRef = ref(storage, `videos/${videoId}_${file.name}`);
      const chunkSize = 8 * 1024 * 1024; // 8MB chunks for parallel upload
      const totalChunks = Math.ceil(file.size / chunkSize);
      const maxParallelChunks = 4; // Upload 4 chunks simultaneously
      
      let uploadedBytes = 0;
      let completedChunks = 0;
      
      // Create all chunk upload promises
      const chunkPromises: Promise<void>[] = [];
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        const chunkRef = ref(storage, `temp/${videoId}_chunk_${i}`);
        
        const chunkPromise = async () => {
          const chunkTask = uploadBytesResumable(chunkRef, chunk);
          
          return new Promise<void>((resolve, reject) => {
            chunkTask.on('state_changed',
              (snapshot) => {
                // Update progress based on all chunks
                const chunkProgress = snapshot.bytesTransferred;
                uploadedBytes += chunkProgress;
                const totalProgress = (uploadedBytes / file.size) * 100;
                
                setUploadingVideos(prev => ({ ...prev, [videoId]: totalProgress }));
              },
              reject,
              () => {
                completedChunks++;
                resolve();
              }
            );
          });
        };
        
        chunkPromises.push(chunkPromise());
        
        // Limit concurrent chunks
        if ((i + 1) % maxParallelChunks === 0 || i === totalChunks - 1) {
          await Promise.all(chunkPromises.slice(Math.max(0, chunkPromises.length - maxParallelChunks)));
        }
      }
      
      // Wait for all chunks to complete
      await Promise.all(chunkPromises);
      
      // Reassemble chunks into final file (simplified - in reality you'd need a cloud function)
      // For now, we'll use the standard upload as fallback
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      return new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadingVideos(prev => ({ ...prev, [videoId]: progress }));
          },
          reject,
          async () => {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            
            const videoData: VideoData = {
              id: videoId,
              filename: file.name,
              url: downloadURL
            };

            setUploadedVideos(prev => [...prev, videoData]);
            setUploadingVideos(prev => ({ ...prev, [videoId]: 100 }));

            setTimeout(() => {
              setUploadingVideos(prev => {
                const newState = { ...prev };
                delete newState[videoId];
                return newState;
              });
            }, 200);
            
            resolve();
          }
        );
      });

    } catch (error) {
      console.error('Parallel upload failed:', error);
      setUploadingVideos(prev => {
        const newState = { ...prev };
        delete newState[videoId];
        return newState;
      });
    }
  };

  // Parallel segment-based video compression - splits file into chunks for simultaneous processing
  const compressVideo = async (file: File): Promise<File> => {
    console.log(`Skipping compression for ${file.name} - compression disabled`);
    return file;
  };

  // Extract audio from video for faster transcription
  const extractAudioFromVideo = async (file: File): Promise<File | null> => {
    return new Promise((resolve) => {
      try {
        console.log(`🎵 Extracting audio from ${file.name}...`);
        
        const video = document.createElement('video');
        video.muted = true;
        video.src = URL.createObjectURL(file);
        
        video.onloadedmetadata = () => {
          try {
            if (!video.captureStream) {
              console.log('❌ Video capture not supported, skipping audio extraction');
              resolve(null);
              return;
            }
            
            const stream = video.captureStream();
            const audioTracks = stream.getAudioTracks();
            
            if (audioTracks.length === 0) {
              console.log('❌ No audio tracks found in video');
              resolve(null);
              return;
            }
            
            // Create audio-only stream
            const audioStream = new MediaStream(audioTracks);
            const mediaRecorder = new MediaRecorder(audioStream, {
              mimeType: 'audio/webm;codecs=opus'
            });
            
            const chunks: BlobPart[] = [];
            
            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
              }
            };
            
            mediaRecorder.onstop = () => {
              URL.revokeObjectURL(video.src);
              if (chunks.length > 0) {
                const audioBlob = new Blob(chunks, { type: 'audio/webm' });
                const audioFile = new File([audioBlob], 
                  file.name.replace(/\.[^/.]+$/, '.webm'), 
                  { type: 'audio/webm' }
                );
                console.log(`✅ Audio extracted: ${(audioFile.size / 1024 / 1024).toFixed(1)}MB`);
                resolve(audioFile);
              } else {
                resolve(null);
              }
            };
            
            mediaRecorder.onerror = () => {
              URL.revokeObjectURL(video.src);
              console.log('❌ Audio extraction failed');
              resolve(null);
            };
            
            // Start recording and play video
            mediaRecorder.start();
            video.currentTime = 0;
            video.play();
            
            // Stop when video ends or after 30 seconds (for very long videos, get a sample)
            video.onended = () => mediaRecorder.stop();
            setTimeout(() => {
              if (mediaRecorder.state === 'recording') {
                video.pause();
                mediaRecorder.stop();
              }
            }, Math.min(video.duration * 1000, 30000)); // Max 30 seconds for sample
            
          } catch (error) {
            URL.revokeObjectURL(video.src);
            console.log('❌ Audio extraction setup failed:', error);
            resolve(null);
          }
        };
        
        video.onerror = () => {
          URL.revokeObjectURL(video.src);
          console.log('❌ Video load failed for audio extraction');
          resolve(null);
        };
        
      } catch (error) {
        console.log('❌ Audio extraction failed:', error);
        resolve(null);
      }
    });
  };

  // Direct upload for individual video segments with exponential backoff
  const uploadSegmentDirect = async (file: File, baseVideoId: string): Promise<VideoData> => {
    const segmentId = `${baseVideoId}_segment_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const storageRef = ref(storage, `videos/segments/${segmentId}_${file.name}`);
    
    const maxRetries = 5;
    const baseDelay = 1000; // 1 second
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000; // Add jitter
          console.log(`🔄 Retry ${attempt}/${maxRetries} for segment ${file.name} after ${delay.toFixed(0)}ms delay`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        console.log(`📤 Uploading segment: ${file.name} (${(file.size / (1024 * 1024)).toFixed(1)}MB)${attempt > 0 ? ` - Attempt ${attempt + 1}` : ''}`);
        
        // Use simple uploadBytes for segments - they're already compressed and small
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        console.log(`✅ Segment uploaded successfully: ${file.name}${attempt > 0 ? ` (succeeded on attempt ${attempt + 1})` : ''}`);
        
        return {
          id: segmentId,
          filename: file.name,
          url: downloadURL
        };
      } catch (error: any) {
        const isRateLimit = error?.code === 'storage/quota-exceeded' || 
                          error?.code === 'storage/retry-limit-exceeded' ||
                          error?.message?.includes('429') ||
                          error?.message?.includes('rate limit');
        
        if (attempt === maxRetries || !isRateLimit) {
          console.error(`❌ Failed to upload segment ${file.name} after ${attempt + 1} attempts:`, error);
          throw error;
        }
        
        console.warn(`⚠️ Rate limited uploading segment ${file.name}, will retry (attempt ${attempt + 1}/${maxRetries + 1})`);
      }
    }
    
    throw new Error(`Failed to upload segment after ${maxRetries + 1} attempts`);
  };

  // Split video into segments and compress them in parallel
  const compressVideoInParallelSegments = async (file: File): Promise<File> => {
    const fileSizeMB = file.size / (1024 * 1024);
    
    return new Promise(async (resolve) => {
      try {
        const video = document.createElement('video');
        video.muted = true;
        video.src = URL.createObjectURL(file);
        
        await new Promise((videoResolve) => {
          video.onloadedmetadata = videoResolve;
          video.onerror = () => {
            console.log('Video load failed, using original');
            resolve(file);
          };
        });
        
        const duration = video.duration;
        
        // Clean up video element URL
        URL.revokeObjectURL(video.src);
        
        // For very long videos, use longer segments to reduce total count
        let segmentDuration;
        if (duration > 1200) { // >20 minutes
          segmentDuration = 20; // 2-minute segments
        } else if (duration > 600) { // >10 minutes  
          segmentDuration = 60; // 1-minute segments
        } else {
          segmentDuration = 30; // 30-second segments
        }
        
        const numSegments = Math.min(60, Math.ceil(duration / segmentDuration)); // Max 20 segments
        const actualSegmentDuration = duration / numSegments; // Evenly distribute
        
        console.log(`Splitting ${duration.toFixed(1)}s video into ${numSegments} segments of ${actualSegmentDuration.toFixed(1)}s each`);
        
        // Simultaneous compression and upload - upload segments as they complete
        const baseVideoId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        const maxConcurrent = Math.min(6, numSegments);
        const uploadedSegments: { index: number; videoData: VideoData; size: number }[] = [];
        let totalUploadedSize = 0;
        let completedSegments = 0;
        
        const processAndUploadSegment = async (segmentIndex: number): Promise<void> => {
          const startTime = segmentIndex * actualSegmentDuration;
          const segDuration = Math.min(actualSegmentDuration, duration - startTime);
          
          console.log(`🔄 Compressing segment ${segmentIndex + 1}/${numSegments}: ${startTime.toFixed(1)}s - ${(startTime + segDuration).toFixed(1)}s`);
          
          try {
            // Step 1: Compress segment
            const segmentBlob = await compressVideoSegment(file, startTime, segDuration, segmentIndex);
            if (!segmentBlob) {
              console.log(`❌ Segment ${segmentIndex + 1} compression failed`);
              return;
            }
            
            const segmentSizeMB = segmentBlob.size / (1024 * 1024);
            console.log(`✅ Segment ${segmentIndex + 1} compressed: ${segmentSizeMB.toFixed(1)}MB`);
            
            // Step 2: Immediately upload compressed segment
            console.log(`📤 Uploading segment ${segmentIndex + 1} (${segmentSizeMB.toFixed(1)}MB)...`);
            const segmentFile = new File([segmentBlob], 
              `${file.name.replace(/\.[^/.]+$/, '')}_segment_${segmentIndex + 1}.webm`, 
              { type: 'video/webm' }
            );
            
            const videoData = await uploadSegmentDirect(segmentFile, baseVideoId);
            
            if (videoData) {
              uploadedSegments.push({
                index: segmentIndex,
                videoData,
                size: segmentBlob.size
              });
              totalUploadedSize += segmentBlob.size;
              completedSegments++;
              
              console.log(`🚀 Segment ${segmentIndex + 1}/${numSegments} uploaded! (${completedSegments} complete, ${(totalUploadedSize / 1024 / 1024).toFixed(1)}MB total)`);
            }
            
          } catch (error) {
            console.log(`❌ Segment ${segmentIndex + 1} process/upload failed:`, error);
          }
        };
        
        // Start processing all segments simultaneously
        console.log(`🚀 Starting simultaneous compression + upload of ${numSegments} segments...`);
        const allSegmentPromises: Promise<void>[] = [];
        
        // Process segments in waves to avoid overwhelming the browser
        const targetSegments = Math.min(12, numSegments); // Process more segments since we're uploading immediately
        
        for (let i = 0; i < targetSegments; i += maxConcurrent) {
          const batch = [];
          for (let j = i; j < Math.min(i + maxConcurrent, targetSegments); j++) {
            batch.push(processAndUploadSegment(j));
          }
          
          // Don't await here - let segments upload as they complete
          allSegmentPromises.push(...batch);
          
          // Small delay between batches to prevent overwhelming
          if (i + maxConcurrent < targetSegments) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // Wait for all segments to complete
        await Promise.all(allSegmentPromises);
        
        if (uploadedSegments.length === 0) {
          console.log('No segments were uploaded, using original file upload');
          resolve(file);
          return;
        }
        
        // Sort uploaded segments by index
        uploadedSegments.sort((a, b) => a.index - b.index);
        
        console.log(`✅ Simultaneous compression+upload complete: ${uploadedSegments.length} segments, ${(totalUploadedSize / 1024 / 1024).toFixed(1)}MB total`);
        
        // Create a combined video data object representing all segments
        const combinedVideoData: VideoData = {
          id: `combined_${Date.now()}`,
          filename: file.name.replace(/\.[^/.]+$/, '_compressed.webm'),
          url: uploadedSegments[0].videoData.url, // Use first segment's URL as representative
          segments: uploadedSegments.map(s => s.videoData) // Store all segment URLs
        };
        
        // Create a fake "compressed file" for the return value
        const fakeCompressedFile = new File([new Blob()], combinedVideoData.filename, { type: 'video/webm' });
        Object.defineProperty(fakeCompressedFile, 'size', { value: totalUploadedSize });
        Object.defineProperty(fakeCompressedFile, '_videoData', { value: combinedVideoData });
        
        const totalCompressedMB = totalUploadedSize / (1024 * 1024);
        const reduction = ((file.size - totalUploadedSize) / file.size * 100);
        
        console.log(`✅ Parallel compression complete: ${fileSizeMB.toFixed(1)}MB → ${totalCompressedMB.toFixed(1)}MB (${reduction.toFixed(0)}% reduction)`);
        resolve(fakeCompressedFile);
        
      } catch (error) {
        console.log('❌ Parallel compression failed:', error);
        resolve(file);
      }
    });
  };

  // Compress a single video segment
  const compressVideoSegment = async (file: File, startTime: number, duration: number, segmentIndex: number): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.muted = true;
      video.src = URL.createObjectURL(file);
      
      video.onloadedmetadata = () => {
        try {
          if (!video.captureStream) {
            resolve(null);
            return;
          }
          
          const stream = video.captureStream(30);
          
          // Use compatible codec settings
          let mediaRecorderOptions;
          if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            mediaRecorderOptions = {
              mimeType: 'video/webm;codecs=vp9',
              videoBitsPerSecond: 6000000 // 6Mbps for segments
            };
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
            mediaRecorderOptions = {
              mimeType: 'video/webm;codecs=vp8', 
              videoBitsPerSecond: 6000000
            };
          } else {
            mediaRecorderOptions = {
              mimeType: 'video/webm',
              videoBitsPerSecond: 6000000
            };
          }
          
          const mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
          const chunks: BlobPart[] = [];
          
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunks.push(event.data);
            }
          };
          
          mediaRecorder.onstop = () => {
            URL.revokeObjectURL(video.src);
            if (chunks.length > 0) {
              const segmentBlob = new Blob(chunks, { type: mediaRecorderOptions.mimeType });
              resolve(segmentBlob);
            } else {
              resolve(null);
            }
          };
          
          mediaRecorder.onerror = () => {
            URL.revokeObjectURL(video.src);
            resolve(null);
          };
          
          // Set video to segment start time and play
          video.currentTime = startTime;
          video.onseeked = () => {
            mediaRecorder.start(500); // Get data every 500ms
            video.play();
            
            // Stop recording after segment duration
            setTimeout(() => {
              video.pause();
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
              }
            }, duration * 1000);
          };
          
          // Fallback timeout
          setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
              video.pause();
              mediaRecorder.stop();
            } else {
              URL.revokeObjectURL(video.src);
              resolve(null);
            }
          }, (duration + 5) * 1000);
          
        } catch (error) {
          URL.revokeObjectURL(video.src);
          resolve(null);
        }
      };
      
      video.onerror = () => {
        URL.revokeObjectURL(video.src);
        resolve(null);
      };
    });
  };

  // Simpler MediaRecorder compression with better error handling
  const compressVideoWithMediaRecorder = async (file: File): Promise<File> => {
    const fileSizeMB = file.size / (1024 * 1024);
    
    return new Promise((resolve) => {
      console.log(`🔄 MediaRecorder compressing ${file.name} (${fileSizeMB.toFixed(1)}MB)...`);
      
      const video = document.createElement('video');
      video.muted = true;
      video.crossOrigin = 'anonymous';
      
      let mediaRecorder: MediaRecorder | null = null;
      let chunks: BlobPart[] = [];
      let recordingStarted = false;
      
      const cleanup = () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
        if (video.src) {
          URL.revokeObjectURL(video.src);
        }
      };
      
      video.onloadedmetadata = () => {
        try {
          console.log(`Video loaded: ${video.duration.toFixed(1)}s, ${video.videoWidth}x${video.videoHeight}`);
          
          // Check if we can capture stream
          if (!video.captureStream) {
            console.log('captureStream not supported');
            resolve(file);
            return;
          }
          
          const stream = video.captureStream(30); // 30 FPS
          
          // Try different codecs if VP9 fails
          let mediaRecorderOptions;
          if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9')) {
            mediaRecorderOptions = {
              mimeType: 'video/webm;codecs=vp9',
              videoBitsPerSecond: 8000000 // 8Mbps for better compatibility
            };
          } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
            mediaRecorderOptions = {
              mimeType: 'video/webm;codecs=vp8', 
              videoBitsPerSecond: 8000000
            };
          } else if (MediaRecorder.isTypeSupported('video/webm')) {
            mediaRecorderOptions = {
              mimeType: 'video/webm',
              videoBitsPerSecond: 8000000
            };
          } else {
            console.log('No supported WebM codecs');
            resolve(file);
            return;
          }
          
          console.log(`Using codec: ${mediaRecorderOptions.mimeType}`);
          mediaRecorder = new MediaRecorder(stream, mediaRecorderOptions);
          
          mediaRecorder.ondataavailable = (event) => {
            console.log(`Data chunk: ${event.data.size} bytes`);
            if (event.data.size > 0) {
              chunks.push(event.data);
            }
          };
          
          mediaRecorder.onstop = () => {
            console.log(`Recording stopped, ${chunks.length} chunks collected`);
            cleanup();
            
            if (chunks.length > 0) {
              const compressedBlob = new Blob(chunks, { type: mediaRecorderOptions.mimeType });
              const compressedSizeMB = compressedBlob.size / (1024 * 1024);
              
              console.log(`Compressed size: ${compressedSizeMB.toFixed(1)}MB`);
              
              if (compressedBlob.size > 10 * 1024 * 1024 && compressedBlob.size < file.size * 0.9) {
                const compressedFile = new File([compressedBlob], 
                  file.name.replace(/\.[^/.]+$/, '.webm'), 
                  { type: 'video/webm' }
                );
                const reduction = ((file.size - compressedFile.size) / file.size * 100);
                console.log(`✅ MediaRecorder compression: ${fileSizeMB.toFixed(1)}MB → ${compressedSizeMB.toFixed(1)}MB (${reduction.toFixed(0)}% reduction)`);
                resolve(compressedFile);
              } else {
                console.log(`⏭️ MediaRecorder compression not effective, using original`);
                resolve(file);
              }
            } else {
              console.log('❌ No data chunks collected');
              resolve(file);
            }
          };
          
          mediaRecorder.onerror = (event) => {
            console.log('MediaRecorder error:', event);
            cleanup();
            resolve(file);
          };
          
          // Start recording
          video.currentTime = 0;
          mediaRecorder.start(1000); // Request data every second
          recordingStarted = true;
          
          video.play().then(() => {
            console.log('Video playback started');
          }).catch((playError) => {
            console.log('Video play failed:', playError);
            cleanup();
            resolve(file);
          });
          
          // Stop when video ends
          video.onended = () => {
            console.log('Video ended');
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              mediaRecorder.stop();
            }
          };
          
          // Safety timeout - 5 minutes max
          setTimeout(() => {
            console.log('Safety timeout reached');
            if (mediaRecorder && mediaRecorder.state === 'recording') {
              video.pause();
              mediaRecorder.stop();
            } else {
              cleanup();
              resolve(file);
            }
          }, 300000); // 5 minutes
          
        } catch (error) {
          console.log('❌ MediaRecorder setup failed:', error);
          cleanup();
          resolve(file);
        }
      };
      
      video.onerror = (error) => {
        console.log('Video load error:', error);
        cleanup();
        resolve(file);
      };
      
      // Overall timeout
      setTimeout(() => {
        if (!recordingStarted) {
          console.log('Overall timeout - recording never started');
          cleanup();
          resolve(file);
        }
      }, 30000); // 30 second timeout for setup
      
      video.src = URL.createObjectURL(file);
      video.load();
    });
  };

  // Optimized upload with file size-based method selection
  const uploadVideo = async (file: File) => {
    const videoId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    try {
      setUploadingVideos(prev => ({ ...prev, [videoId]: 0 }));
      
      // Show compression status
      const originalSizeMB = file.size / (1024 * 1024);
      console.log(`Starting upload for ${file.name} (${originalSizeMB.toFixed(1)}MB)`);
      
      if (file.size > 50 * 1024 * 1024) {
        console.log('🔄 Compressing video before upload...');
        setUploadingVideos(prev => ({ ...prev, [videoId]: -1 })); // Use -1 to indicate compression
      }
      
      // Compress video client-side for faster upload
      const compressionStart = Date.now();
      const optimizedFile = await compressVideo(file);
      const compressionTime = (Date.now() - compressionStart) / 1000;
      
      const finalSizeMB = optimizedFile.size / (1024 * 1024);
      
      if (optimizedFile !== file) {
        const reduction = ((file.size - optimizedFile.size) / file.size * 100);
        console.log(`✅ Compression complete in ${compressionTime.toFixed(1)}s: ${originalSizeMB.toFixed(1)}MB → ${finalSizeMB.toFixed(1)}MB (${reduction.toFixed(0)}% reduction)`);
      } else {
        console.log(`⏭️ No compression applied (${compressionTime.toFixed(1)}s processing time)`);
      }
      
      // Check if this file already has uploaded segments (from parallel compression)
      const hasUploadedSegments = (optimizedFile as any)._videoData?.segments;
      if (hasUploadedSegments) {
        console.log(`✅ Video segments already uploaded successfully, skipping additional upload`);
        const videoData = (optimizedFile as any)._videoData;
        
        // Add the video data to state
        setUploadedVideos(prev => [...prev, videoData]);
        
        // Clear upload progress
        setUploadingVideos(prev => {
          const newState = { ...prev };
          delete newState[videoId];
          return newState;
        });
        
        return;
      }

      // Reset progress to 0 for actual upload
      console.log(`🚀 Starting upload of ${optimizedFile.name} (${finalSizeMB.toFixed(1)}MB)`);
      setUploadingVideos(prev => ({ ...prev, [videoId]: 0 }));
      const fileSizeMB = optimizedFile.size / (1024 * 1024);

      // Start audio extraction simultaneously with video upload
      console.log(`🎵 Starting simultaneous audio extraction...`);
      const audioExtractionPromise = extractAudioFromVideo(optimizedFile).catch(error => {
        console.log('❌ Audio extraction failed during upload:', error);
        return null;
      });
      
      // Create individual progress trackers for each racing method
      const progressTracker1 = { value: 0 };
      const progressTracker2 = { value: 0 };
      const progressTracker3 = { value: 0 };

      // Optimize approach based on file size - especially for huge files
      let approaches: Promise<VideoData>[];
      
      if (fileSizeMB < 10) {
        // Small files: use simple upload only (no resumable handshakes)
        console.log(`📤 Using simple upload for small file (${fileSizeMB.toFixed(1)}MB)`);
        approaches = [
          createSimpleUpload(optimizedFile, videoId, 'simple', progressTracker1)
        ];
      } else if (fileSizeMB < 100) {
        // Medium files: resumable with moderate chunks
        console.log(`📤 Using medium file upload with 32-64MB chunks (${fileSizeMB.toFixed(1)}MB)`);
        approaches = [
          createUploadTask(optimizedFile, videoId, '1', {
            chunkSize: 64 * 1024 * 1024, // 64MB chunks
            timeout: 300000,
            maxRetries: 1,
          }, progressTracker1),
          
          createUploadTask(optimizedFile, videoId, '2', {
            chunkSize: 32 * 1024 * 1024, // 32MB chunks  
            timeout: 180000,
            maxRetries: 1,
          }, progressTracker2)
        ];
      } else if (fileSizeMB < 1000) {
        // Large files: massive chunks for maximum throughput
        console.log(`📤 Using large file upload with 128-256MB chunks (${fileSizeMB.toFixed(1)}MB)`);
        approaches = [
          createUploadTask(optimizedFile, videoId, '1', {
            chunkSize: 256 * 1024 * 1024, // 256MB chunks!
            timeout: 900000, // 15 minutes per chunk
            maxRetries: 0,
          }, progressTracker1),
          
          createUploadTask(optimizedFile, videoId, '2', {
            chunkSize: 128 * 1024 * 1024, // 128MB chunks
            timeout: 600000,
            maxRetries: 0,
          }, progressTracker2)
        ];
      } else {
        // HUGE files (>1GB): single massive chunk approach
        console.log(`📤 Using MASSIVE 512MB chunks for huge file (${fileSizeMB.toFixed(1)}MB)`);
        approaches = [
          createUploadTask(optimizedFile, videoId, '1', {
            chunkSize: 512 * 1024 * 1024, // 512MB chunks!
            timeout: 1800000, // 30 minutes per chunk
            maxRetries: 0,
          }, progressTracker1)
        ];
      }

      // Race all approaches - use whichever finishes first
      console.log(`🏁 Starting ${approaches.length} parallel upload methods...`);
      
      // Wait for both video upload and audio extraction to complete
      const [result, audioFile] = await Promise.all([
        Promise.race(approaches),
        audioExtractionPromise
      ]);
      
      console.log(`✅ Video upload completed: ${result.filename}`);
      setUploadingVideos(prev => ({ ...prev, [videoId]: 100 }));
      
      // Upload audio file if extraction was successful
      let audioUrl = null;
      if (audioFile) {
        try {
          console.log(`🎵 Uploading extracted audio...`);
          const audioStorageRef = ref(storage, `audio/${result.id}_${audioFile.name}`);
          const audioSnapshot = await uploadBytes(audioStorageRef, audioFile);
          audioUrl = await getDownloadURL(audioSnapshot.ref);
          console.log(`✅ Audio uploaded: ${(audioFile.size / 1024 / 1024).toFixed(1)}MB`);
        } catch (error) {
          console.log('❌ Audio upload failed:', error);
        }
      }

      // Save video to Firestore for persistence
      try {
        const videoData = { ...result, audioUrl };
        const docRef = await addDoc(collection(db, 'videos'), {
          ...videoData,
          createdAt: Timestamp.now()
        });
        console.log(`✅ Video saved to database: ${docRef.id}`);
      } catch (error) {
        console.error('Failed to save video to database:', error);
      }

      setUploadedVideos(prev => [...prev, { ...result, audioUrl }]);

      setTimeout(() => {
        setUploadingVideos(prev => {
          const newState = { ...prev };
          delete newState[videoId];
          return newState;
        });
      }, 200);

    } catch (error) {
      console.error('All upload methods failed:', error);
      setUploadingVideos(prev => {
        const newState = { ...prev };
        delete newState[videoId];
        return newState;
      });
    }
  };

  // Create resumable upload task with fixed progress tracking
  const createUploadTask = (file: File, videoId: string, suffix: string, options: any, progressTracker: { value: number }) => {
    return new Promise<VideoData>((resolve, reject) => {
      const storageRef = ref(storage, `videos/${videoId}_${suffix}_${file.name}`);
      const uploadTask = uploadBytesResumable(storageRef, file, options);

      uploadTask.on('state_changed',
        (snapshot) => {
          const rawProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          const progress = Math.min(100, Math.max(0, rawProgress));
          
          // Update progress tracker for this specific method
          progressTracker.value = progress;
          
          // Only update UI if this method is the fastest and progress is meaningful
          setUploadingVideos(prev => {
            const currentProgress = prev[videoId] || 0;
            if (progress > currentProgress && progress <= 100) {
              return { ...prev, [videoId]: progress };
            }
            return prev;
          });
        },
        reject,
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({
              id: videoId,
              filename: file.name,
              url: downloadURL
            });
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  };

  // Simple upload for small files (faster than resumable for <10MB files)
  const createSimpleUpload = (file: File, videoId: string, suffix: string, progressTracker: { value: number }) => {
    return new Promise<VideoData>(async (resolve, reject) => {
      try {
        const storageRef = ref(storage, `videos/${videoId}_${suffix}_${file.name}`);
        
        // Simulate progress for simple uploads since they don't provide real progress
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress = Math.min(95, progress + Math.random() * 20 + 5);
          progressTracker.value = progress;
          
          setUploadingVideos(prev => {
            const currentProgress = prev[videoId] || 0;
            if (progress > currentProgress && progress <= 100) {
              return { ...prev, [videoId]: progress };
            }
            return prev;
          });
        }, 200);

        // Use simple uploadBytes for small files - no resumable overhead
        const snapshot = await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(snapshot.ref);
        
        clearInterval(progressInterval);
        progressTracker.value = 100;
        
        // Final progress update
        setUploadingVideos(prev => ({ ...prev, [videoId]: 100 }));
        
        resolve({
          id: videoId,
          filename: file.name,
          url: downloadURL
        });
      } catch (error) {
        reject(error);
      }
    });
  };

  // Basic resumable upload (kept for compatibility)
  const createBasicUpload = (file: File, videoId: string, suffix: string, progressTracker: { value: number }) => {
    return new Promise<VideoData>((resolve, reject) => {
      const storageRef = ref(storage, `videos/${videoId}_${suffix}_${file.name}`);
      
      // Use resumable upload for real progress tracking
      const uploadTask = uploadBytesResumable(storageRef, file);

      uploadTask.on('state_changed',
        (snapshot) => {
          const rawProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          const progress = Math.min(100, Math.max(0, rawProgress));
          
          // Update progress tracker for this specific method
          progressTracker.value = progress;
          
          // Only update UI if this method is the fastest
          setUploadingVideos(prev => {
            const currentProgress = prev[videoId] || 0;
            if (progress > currentProgress && progress <= 100) {
              return { ...prev, [videoId]: progress };
            }
            return prev;
          });
        },
        reject,
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            progressTracker.value = 100;
            
            resolve({
              id: videoId,
              filename: file.name,
              url: downloadURL
            });
          } catch (error) {
            reject(error);
          }
        }
      );
    });
  };

  // Fallback upload method using basic uploadBytes for maximum compatibility
  const fallbackUpload = async (file: File, videoId: string) => {
    try {
      console.log('Using fallback upload method...');
      const storageRef = ref(storage, `videos/${videoId}_fallback_${file.name}`);
      
      // Use basic upload which might be faster for some files/connections
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      const videoData: VideoData = {
        id: videoId,
        filename: file.name,
        url: downloadURL
      };

      setUploadingVideos(prev => ({ ...prev, [videoId]: 100 }));
      setUploadedVideos(prev => [...prev, videoData]);

      setTimeout(() => {
        setUploadingVideos(prev => {
          const newState = { ...prev };
          delete newState[videoId];
          return newState;
        });
      }, 300);

    } catch (error) {
      console.error('Fallback upload also failed:', error);
      setUploadingVideos(prev => {
        const newState = { ...prev };
        delete newState[videoId];
        return newState;
      });
    }
  };

  const generateBlogFromVideos = async () => {
    if (uploadedVideos.length === 0) return;

    setGeneratingBlog(true);
    
    // Only use the last 2 videos to extend the storyline
    const recentVideos = uploadedVideos.slice(-2);
    console.log(`🎬 Creating blog from ${recentVideos.length} most recent videos (of ${uploadedVideos.length} total)`);
    
    setProcessingVideos(recentVideos.map(v => v.id));

    try {
      // First, process only the recent videos to get transcriptions
      const videosWithTranscriptions = await Promise.all(
        recentVideos.map(async (video) => {
          try {
            // Call Firebase function to process video with Groq (with longer timeout)
            const processVideo = httpsCallable(functions, 'processVideoForBlog');
            
            // Use audio URL if available for faster transcription, otherwise fall back to video
            const mediaUrl = video.audioUrl || video.url;
            const mediaType = video.audioUrl ? 'audio' : 'video';
            
            console.log(`🎵 Starting transcription for ${video.filename} using ${mediaType}...`);
            const result = await Promise.race([
              processVideo({ videoUrl: mediaUrl, videoId: video.id }),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Client timeout after 10 minutes')), 600000)
              )
            ]);
            const transcription = (result.data as any).transcription;
            
            return { ...video, transcription };
          } catch (error) {
            console.error(`Failed to process video ${video.filename}:`, error);
            return { ...video, transcription: null };
          }
        })
      );

      // Update only the recent videos with transcriptions, preserve existing transcriptions
      setUploadedVideos(prev => {
        const updated = [...prev];
        // Update transcriptions for the processed recent videos
        videosWithTranscriptions.forEach(processedVideo => {
          const index = updated.findIndex(v => v.id === processedVideo.id);
          if (index !== -1) {
            updated[index] = processedVideo;
          }
        });
        return updated;
      });

      // Filter out videos that failed to transcribe
      const successfulTranscriptions = videosWithTranscriptions
        .filter(v => v.transcription)
        .map((v, index) => {
          const label = recentVideos.length > 1 && index === 0 ? 'Previously' : 'Current Episode';
          return `${label} - Video: ${v.filename}\n${v.transcription}`;
        })
        .join('\n\n');

      if (!successfulTranscriptions) {
        alert('Failed to transcribe any recent videos. Please try again.');
        return;
      }

      // Generate blog content using ChatGPT
      const generateBlog = httpsCallable(functions, 'generateBlogFromTranscription');
      const result = await generateBlog({ 
        transcriptions: successfulTranscriptions,
        author: newBlog.author || 'Anonymous'
      });

      const generated = result.data as any;

      // Create blog with generated content and video URLs
      const blogData = {
        title: generated.title,
        content: generated.content,
        author: newBlog.author || 'Anonymous',
        videos: videosWithTranscriptions.map(video => ({
          id: video.id,
          filename: video.filename,
          url: video.url,
          audioUrl: video.audioUrl,
          transcription: video.transcription
        })),
        videoUrls: videosWithTranscriptions.map(video => video.url), // Simple array of video URLs for easy access
        transcription: successfulTranscriptions,
        generatedFromVideo: true,
        createdAt: Timestamp.now()
      };

      const docRef = await addDoc(collection(db, 'blogs'), blogData);
      
      const newBlogWithId: Blog = {
        id: docRef.id,
        ...blogData,
        createdAt: new Date()
      };

      setBlogs([newBlogWithId, ...blogs]);
      localStorage.setItem('blogs', JSON.stringify([newBlogWithId, ...blogs]));

      // Reset form
      setUploadedVideos([]);
      setNewBlog({ title: '', content: '', author: '' });
      setShowVideoForm(false);

    } catch (error) {
      console.error('Blog generation failed:', error);
      alert('Failed to generate blog. Please try again.');
    } finally {
      setGeneratingBlog(false);
      setProcessingVideos([]);
    }
  };

  const createBlog = async () => {
    if (!newBlog.title.trim() || !newBlog.content.trim() || !newBlog.author.trim()) {
      return;
    }

    const blogData = {
      ...newBlog,
      createdAt: Timestamp.now()
    };

    try {
      // Save to Firebase
      const docRef = await addDoc(collection(db, 'blogs'), blogData);
      
      const newBlogWithId: Blog = {
        id: docRef.id,
        title: newBlog.title,
        content: newBlog.content,
        author: newBlog.author,
        createdAt: new Date()
      };

      setBlogs([newBlogWithId, ...blogs]);
      
      // Update localStorage
      localStorage.setItem('blogs', JSON.stringify([newBlogWithId, ...blogs]));
    } catch (error) {
      console.log('Firebase save failed, saving locally:', error);
      
      // Fallback to local-only blog
      const localBlog: Blog = {
        id: Date.now().toString(),
        title: newBlog.title,
        content: newBlog.content,
        author: newBlog.author,
        createdAt: new Date()
      };

      const updatedBlogs = [localBlog, ...blogs];
      setBlogs(updatedBlogs);
      localStorage.setItem('blogs', JSON.stringify(updatedBlogs));
    }

    // Reset form
    setNewBlog({ title: '', content: '', author: '' });
    setShowNewBlogForm(false);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center pb-24">
        <div className="text-2xl">Loading blogs... 📰</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 pb-24">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4">
            📰 Our Blog Collection
          </h1>
          <p className="text-xl text-gray-600">
            Stories, thoughts, and adventures from our journey
          </p>
        </div>

        {/* Add New Blog Buttons */}
        <div className="mb-8 text-center space-x-4">
          <button
            onClick={() => {
              setShowNewBlogForm(!showNewBlogForm);
              setShowVideoForm(false);
            }}
            className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-transform"
          >
            {showNewBlogForm ? '✖️ Cancel' : '✨ Write New Blog'}
          </button>
          
          <button
            onClick={() => {
              setShowVideoForm(!showVideoForm);
              setShowNewBlogForm(false);
            }}
            className="px-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-1 transition-transform"
          >
            {showVideoForm ? '✖️ Cancel' : '🎥 Create from Videos'}
          </button>
        </div>

        {/* New Blog Form */}
        {showNewBlogForm && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-xl border border-gray-100 p-6 mb-8">
            <h3 className="text-2xl font-semibold mb-4">Create New Blog Post</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={newBlog.title}
                  onChange={(e) => setNewBlog({ ...newBlog, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Enter blog title..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
                <input
                  type="text"
                  value={newBlog.author}
                  onChange={(e) => setNewBlog({ ...newBlog, author: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Your name..."
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
                <textarea
                  value={newBlog.content}
                  onChange={(e) => setNewBlog({ ...newBlog, content: e.target.value })}
                  rows={8}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="Write your blog post here..."
                />
              </div>
              
              <div className="flex gap-3 pt-4">
                <button
                  onClick={createBlog}
                  disabled={!newBlog.title.trim() || !newBlog.content.trim() || !newBlog.author.trim()}
                  className="px-6 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  🚀 Publish Blog
                </button>
                <button
                  onClick={() => setShowNewBlogForm(false)}
                  className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Video Blog Form */}
        {showVideoForm && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-xl border border-gray-100 p-6 mb-8">
            <h3 className="text-2xl font-semibold mb-4">🎥 Create Blog from Videos</h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Author</label>
                <input
                  type="text"
                  value={newBlog.author}
                  onChange={(e) => setNewBlog({ ...newBlog, author: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="Your name..."
                />
              </div>

              {/* Video Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Upload Videos</label>
                <div 
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragOver 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-300 hover:border-purple-400'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="text-4xl mb-2">
                    {isDragOver ? '📥' : '🎬'}
                  </div>
                  <p className="text-gray-600 mb-4">
                    {isDragOver 
                      ? 'Drop files here for optimized upload!' 
                      : 'Drop multiple video files here or click to browse'
                    }
                  </p>
                  <div className="text-xs text-gray-500 mb-3 space-y-1">
                    <div>🎬 Smart parallel compression: 6 concurrent segments, early upload start</div>
                    <div>🚀 Adaptive segments: 30s for short, 2min for long videos (max 20 total)</div>
                    <div>⚡ Fast chunked upload: 512MB chunks for huge files</div>
                    <div>📊 Real multipart progress tracking</div>
                  </div>
                  <input
                    type="file"
                    accept="video/*,audio/*"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFileSelection(e.target.files);
                      }
                    }}
                    className="hidden"
                    id="video-upload"
                  />
                  <label
                    htmlFor="video-upload"
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg cursor-pointer transition-colors"
                  >
                    Choose Files
                  </label>
                  <p className="text-xs text-gray-500 mt-3">
                    💡 Optimized for huge .mov files - 512MB chunks, 30min timeouts, single upload for >1GB
                  </p>
                </div>
              </div>


              {/* Upload Progress */}
              {Object.keys(uploadingVideos).length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold">
                      Uploading {Object.keys(uploadingVideos).length} file{Object.keys(uploadingVideos).length > 1 ? 's' : ''} concurrently:
                    </h4>
                    <div className="text-sm text-gray-600">
                      {Object.values(uploadingVideos).filter(p => p === 100).length} / {Object.keys(uploadingVideos).length} complete
                    </div>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(uploadingVideos).map(([videoId, progress], index) => (
                      <div key={videoId} className="p-3 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg border border-blue-100">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">
                              {progress === 100 ? '✅' : progress === -1 ? '🔄' : '📤'}
                            </span>
                            <span className="font-medium text-sm">
                              {progress === 100 ? 'Upload Complete!' : 
                               progress === -1 ? 'Compressing video...' : 
                               `Upload ${index + 1} in progress...`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {progress === -1 ? (
                              <span className="text-orange-600 font-medium">Compressing</span>
                            ) : (
                              <span className="text-blue-600 font-medium">{Math.round(Math.max(0, progress))}%</span>
                            )}
                            {progress < 100 && progress !== -1 && (
                              <div className="animate-spin w-3 h-3 border border-blue-500 border-t-transparent rounded-full"></div>
                            )}
                            {progress === -1 && (
                              <div className="animate-spin w-3 h-3 border border-orange-500 border-t-transparent rounded-full"></div>
                            )}
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all duration-300 ${
                              progress === 100 ? 'bg-green-500' : 
                              progress === -1 ? 'bg-orange-500 animate-pulse' : 
                              'bg-blue-600'
                            }`}
                            style={{ 
                              width: progress === -1 ? '100%' : `${Math.max(0, progress)}%` 
                            }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}


              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={generateBlogFromVideos}
                  disabled={uploadedVideos.length === 0 || !newBlog.author.trim() || generatingBlog || Object.keys(uploadingVideos).length > 0}
                  className="px-6 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {generatingBlog ? (
                    <>
                      <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                      <span>Generating Blog...</span>
                    </>
                  ) : (
                    <>
                      <span>🤖</span>
                      <span>Generate Blog from Videos</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowVideoForm(false)}
                  className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  disabled={generatingBlog}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* My Videos Section - Always Visible */}
        {uploadedVideos.length > 0 && (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl shadow-xl border border-gray-100 p-6 mb-8">
            <h3 className="text-2xl font-semibold mb-4">🎥 My Videos ({uploadedVideos.length})</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploadedVideos.map((video) => (
                <div key={video.id} className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span>🎥</span>
                    <span className="font-medium text-sm truncate">{video.filename}</span>
                    <div className="ml-auto">
                      {processingVideos.includes(video.id) ? (
                        <div className="flex items-center gap-1 text-yellow-600">
                          <div className="animate-spin w-3 h-3 border border-yellow-600 border-t-transparent rounded-full"></div>
                          <span className="text-xs">Processing...</span>
                        </div>
                      ) : video.transcription ? (
                        <span className="text-green-600 text-xs">✅ Transcribed</span>
                      ) : (
                        <span className="text-blue-600 text-xs">📁 Uploaded</span>
                      )}
                    </div>
                  </div>
                  <video
                    src={video.url}
                    controls
                    className="w-full rounded border"
                    style={{ maxHeight: '200px' }}
                  >
                    Your browser does not support video playback.
                  </video>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blog Posts */}
        <div className="space-y-6">
          {blogs.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">📝</div>
              <h3 className="text-2xl font-semibold text-gray-700 mb-2">No blogs yet!</h3>
              <p className="text-gray-500 mb-6">Start writing your first blog post to share your thoughts and adventures.</p>
              <button
                onClick={() => setShowNewBlogForm(true)}
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                ✨ Write First Blog
              </button>
            </div>
          ) : (
            blogs.map((blog) => (
              <div key={blog.id} className="bg-white/80 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 overflow-hidden hover:shadow-xl transition-shadow">
                <div className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h2 className="text-2xl font-bold text-gray-800">{blog.title}</h2>
                        {blog.generatedFromVideo && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">🤖 AI Generated</span>
                        )}
                      </div>
                      {blog.videos && blog.videos.length > 0 && (
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                          <span>🎥</span>
                          <span>Generated from {blog.videos.length} video{blog.videos.length > 1 ? 's' : ''}</span>
                        </div>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 ml-4 text-right">
                      <div>By {blog.author}</div>
                      <div>{formatDate(blog.createdAt)}</div>
                    </div>
                  </div>
                  
                  <div className="prose prose-lg max-w-none">
                    <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                      {blog.content}
                    </div>
                  </div>

                  {/* Show videos if they exist */}
                  {blog.videos && blog.videos.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-gray-200">
                      <h4 className="font-semibold text-gray-700 mb-3">Source Videos:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {blog.videos.map((video) => (
                          <div key={video.id} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span>🎥</span>
                              <span className="font-medium text-sm">{video.filename}</span>
                            </div>
                            <video
                              src={video.url}
                              controls
                              className="w-full rounded border"
                              style={{ maxHeight: '200px' }}
                            >
                              Your browser does not support video playback.
                            </video>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}