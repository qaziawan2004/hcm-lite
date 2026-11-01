import { useState } from 'react';

export function initials(name = '') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return words.length === 1
    ? words[0].slice(0, 1).toUpperCase()
    : `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

export default function Avatar({ name, src, className = '' }) {
  const [failedSrc, setFailedSrc] = useState('');
  const showImage = src && src !== failedSrc;
  return (
    <span className={`avatar ${className}`} aria-label={`${name || 'User'} profile picture`}>
      {showImage
        ? <img src={src} alt="" onError={() => setFailedSrc(src)} />
        : initials(name)}
    </span>
  );
}
