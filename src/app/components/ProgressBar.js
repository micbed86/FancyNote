'use client';

import { motion } from 'framer-motion';
import './ProgressBar.css';

export function ProgressBar({ percentage }) {
  return (
    <div className="progress-bar-container">
      <motion.div 
        className="progress-bar"
        initial={{ width: 0 }}
        animate={{ width: `${percentage}%` }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />
    </div>
  );
}