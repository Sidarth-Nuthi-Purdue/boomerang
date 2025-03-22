'use client';
import React, { useEffect, useState } from 'react';

interface TypewriterProps {
  text: string;
  typingSpeed?: number; // optional ms between each character
  blinkSpeed?: number;  // optional ms for cursor blinking
}

const Typewriter: React.FC<TypewriterProps> = ({
  text,
  typingSpeed = 100,
  blinkSpeed = 500,
}) => {
  const [displayedText, setDisplayedText] = useState('');
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    setDisplayedText('');
  }, [text]);

  console.log('Typewriter received text:', text);
  useEffect(() => {
    let index = 0;

    // Type each character at an interval
    const typingInterval = setInterval(() => {
      if (index < text.length -1 ) {
        setDisplayedText((prev) => prev + text[index]);
        index++;
      } else {
        clearInterval(typingInterval);
      }
    }, typingSpeed);

    // Blink the underscore cursor
    const blinkInterval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, blinkSpeed);

    // Cleanup intervals on unmount
    return () => {
      clearInterval(typingInterval);
      clearInterval(blinkInterval);
    };
  }, [text, typingSpeed, blinkSpeed]);

  return (
    <div className="font-mono whitespace-pre-wrap break-words" style={{ width: '80vw', textAlign: 'center' }}>
      {displayedText}
      {showCursor ? <span className="animate-pulse">_</span> : ' '}
    </div>
  );
};

export default Typewriter;
