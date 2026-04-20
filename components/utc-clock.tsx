'use client';
import { useEffect, useState } from 'react';

function formatUtc(d: Date): string {
  return d.toISOString().slice(11, 19) + 'Z';
}

export default function UtcClock() {
  const [time, setTime] = useState(() => formatUtc(new Date()));

  useEffect(() => {
    const id = setInterval(() => setTime(formatUtc(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  return <b>{time}</b>;
}
