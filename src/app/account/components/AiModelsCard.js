'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AiModelsCard({ initialModelId, onModelSelect }) {
  const [models, setModels] = useState([]);
  const [filteredModels, setFilteredModels] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null); // Stores the full model object for UI display & highlighting
  // Removed apiKey, systemPrompt, saveStatus state - managed by parent

  // Fetch available models and set initial selection based on prop
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        // Need session token to fetch models from our API endpoint
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError('No active session found to fetch models.');
          setLoading(false);
          return;
        }

        const response = await fetch('/api/ai/models', {
           headers: {
             'Authorization': `Bearer ${session.access_token}`, // Pass token
             'Content-Type': 'application/json'
           }
         });

        if (!response.ok) {
           const errorData = await response.json().catch(() => ({})); // Avoid crash if body isn't JSON
           throw new Error(errorData.error || `Failed to fetch models (status: ${response.status})`);
         }

        const data = await response.json();
        const availableModels = data.data || [];
        setModels(availableModels);

        // Set initial selected model based on the prop
        if (initialModelId && availableModels.length > 0) {
          const initiallySelected = availableModels.find(m => m.id === initialModelId);
          if (initiallySelected) {
            setSelectedModel(initiallySelected);
          } else {
            console.warn(`Initial model ID "${initialModelId}" not found in available models.`);
          }
        }

        
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchModels();

  }, [initialModelId]); // Re-run if the initialModelId prop changes

  // Effect to update selectedModel if initialModelId prop changes after initial load
  useEffect(() => {
    if (initialModelId && models.length > 0) {
      const modelToSelect = models.find(m => m.id === initialModelId);
      if (modelToSelect && modelToSelect.id !== selectedModel?.id) {
         setSelectedModel(modelToSelect);
      }
    } else if (!initialModelId) {
       // If prop becomes null/undefined, deselect
       setSelectedModel(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialModelId, models]); // Rerun when prop or models list changes

  if (loading) {
    return <div className="loading">Loading available models...</div>;
  }

  if (error) {
    return (
      <div className="error-message">
        Error loading models: {error}
      </div>
    );
  }

  return (
    <div className="ai-models-card">
      {/* Removed Title, Inputs, Save Button - Handled by Parent */}

      {/* Display Currently Selected Model */}
      {selectedModel && (
        <h4 style={{ marginBottom: '15px', color: '#a0a0a0', fontSize: '1rem' }}>
          Currently Selected: <span style={{ color: '#5fa8ff', fontWeight: 'bold' }}>{selectedModel.name}</span>
        </h4>
      )}
      {/* Search Input */}
      <div className="search-container" style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <input
          type="text"
          placeholder="Search models..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setFilteredModels(
              models.filter(model => 
                model.name.toLowerCase().includes(e.target.value.toLowerCase())
              )
            );
          }}
          className="account-input"
          style={{ flex: 1, padding: '10px' }}
        />
      </div>
      <div className="models-grid">
        {(searchTerm ? filteredModels : models).map((model) => ( // Add parentheses here
          // {/* Add selected class for styling */} // Comment removed or kept inside ()
          <div
             key={model.id}
             className={`model-card ${selectedModel?.id === model.id ? 'selected' : ''}`}
             onClick={() => {
                setSelectedModel(model); // Update local state for UI
                onModelSelect(model.id); // Call parent handler to auto-save
             }}
          >
            <h4>{model.name}</h4>
            <div className="model-details">
              <p><strong>Context Length:</strong> {model.context_length.toLocaleString()} tokens</p>
              <p><strong>Pricing:</strong> {
                 (model.pricing && typeof model.pricing.prompt === 'string' && typeof model.pricing.completion === 'string') // Check for string type from API
                   ? `$${(parseFloat(model.pricing.prompt) * 1000000).toFixed(2)} / $${(parseFloat(model.pricing.completion) * 1000000).toFixed(2)}` // Use parseFloat
                   : 'N/A'
              } per million tokens (Prompt/Completion)</p>
            </div>
            {/* Styled button-like indicator */}
            {selectedModel?.id === model.id &&
              <button className="selected-indicator-btn" disabled>
                Selected
              </button>
            }
          </div>
        ))}
      </div>
      {/* Minimal styles needed now */}
      <style jsx>{`
        .ai-models-card {
          /* Keep container styles if needed, or remove if parent handles layout */
           margin-top: 20px;
        }
        .models-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 20px;
        }
        .model-card {
          background: rgba(30, 30, 33, 0.6);
          border: 1px solid #444;
          border-radius: 6px;
          padding: 15px;
          transition: all 0.2s ease;
          cursor: pointer;
          position: relative; /* Needed for absolute positioning of button */
        }
        .model-card.selected {
           border-color: #2563eb;
           box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.3);
        }
        .model-card:hover {
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
          transform: translateY(-2px);
          border-color: #555;
        }
        .model-card h4 {
          margin: 0 0 10px 0;
          color: #5fa8ff;
          font-size: 1.05rem; /* Adjusted size */
        }
        .model-details p {
          margin: 5px 0;
          font-size: 0.85rem;
          color: #aaa;
        }
        .model-details strong {
            color: #ccc;
        }
        .selected-indicator-btn {
          /* Style like .account-btn but smaller */
          position: absolute;
          bottom: 10px;
          right: 10px;
          padding: 4px 10px; /* Smaller padding */
          background-color: #2563eb;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 0.8rem; /* Smaller font */
          cursor: default; /* Not clickable */
          opacity: 1; /* Ensure visible */
        }
        .selected-indicator-btn:disabled { /* Keep disabled style */
           background-color: #2563eb; /* Keep blue when selected */
           opacity: 1;
           cursor: default;
        }

        .loading {
          text-align: center;
          padding: 20px;
          color: #999;
        }
        .error-message {
          color: #f87171;
          padding: 10px;
          border-radius: 4px;
          background-color: rgba(220, 38, 38, 0.2);
          border: 1px solid rgba(220, 38, 38, 0.5);
          margin-top: 20px;
          margin-bottom: 15px;
        }
      `}</style>
    </div>
  );
}