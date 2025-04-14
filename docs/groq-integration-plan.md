# Plan: Integrate Groq API for Note Title and Excerpt Generation

**Goal:** Integrate Groq API calls into the existing asynchronous note processing workflow (`src/app/api/notes/process-async/route.js`) to automatically generate titles (if default is "New Note") and excerpts for new notes using the content from the `text` column after initial processing.

**File to Modify:** `src/app/api/notes/process-async/route.js`

**Function to Modify:** `processNoteInBackground`

**Detailed Steps:**

1.  **Define Helper Functions for Groq Calls:**
    *   Create two new `async` functions outside `processNoteInBackground`:
        *   `generateNoteTitle(content, language)`:
            *   Input: `content` (string), `language` (string).
            *   Uses `process.env.GROQ_API_KEY`.
            *   Constructs messages using the title generation system prompt, language, and content.
            *   Calls `groq.chat.completions.create` (non-streaming).
            *   Extracts title, handles errors, returns title string or null.
        *   `generateNoteExcerpt(content, language)`:
            *   Similar structure to `generateNoteTitle`.
            *   Uses the excerpt generation system prompt.
            *   Calls `groq.chat.completions.create`.
            *   Extracts excerpt, handles errors, returns excerpt string or null.

2.  **Integrate into `processNoteInBackground`:**
    *   **Locate Insertion Point:** After existing LLM processing (line ~219) and before the final DB update (line ~229).
    *   **Determine Content Source:**
        ```javascript
        const contentForGroq = llmResponse?.trim() ? llmResponse : noteData.text;
        let generatedTitle = null;
        let generatedExcerpt = null;
        const language = aiSettings?.language || 'en';
        ```
    *   **Call Title Generation (Conditional):**
        ```javascript
        if (noteData.title === 'New Note' && contentForGroq) {
            try {
                generatedTitle = await generateNoteTitle(contentForGroq, language);
            } catch (error) {
                console.error(`Error generating title:`, error);
            }
        }
        ```
    *   **Call Excerpt Generation:**
        ```javascript
        if (contentForGroq) {
             try {
                generatedExcerpt = await generateNoteExcerpt(contentForGroq, language);
            } catch (error) {
                console.error(`Error generating excerpt:`, error);
            }
        }
        ```
    *   **Modify Database Update:**
        *   Create an `updatePayload` object.
        *   Conditionally add `title: generatedTitle` if `generatedTitle` is not null.
        *   Conditionally add `excerpt: generatedExcerpt` if `generatedExcerpt` is not null.
        *   Use `updatePayload` in the `supabaseAdmin.from('notes').update(...)` call.
    *   **Update Notification:** Use the potentially updated title (`generatedTitle || noteData.title`) when creating the notification content.

**Mermaid Diagram:**

```mermaid
graph TD
    A[Start processNoteInBackground] --> B{Fetch Note Data & AI Settings};
    B --> C{Process Voice/Files?};
    C -- Yes --> D[Transcribe/Read Content];
    C -- No --> E;
    D --> E{Process with OpenRouter LLM?};
    E -- Yes --> F[Call processWithLLM -> llmResponse];
    E -- No --> G{Use noteData.text};
    F --> H[contentForGroq = llmResponse];
    G --> I[contentForGroq = noteData.text];
    H --> J{Determine Content & Language};
    I --> J;
    J --> K{Is noteData.title == "New Note"?};
    K -- Yes --> L[Call generateNoteTitle(contentForGroq, lang)];
    K -- No --> M{Use noteData.title};
    L --> N[generatedTitle];
    M --> N;
    J --> O[Call generateNoteExcerpt(contentForGroq, lang)];
    O --> P[generatedExcerpt];
    N & P --> Q[Prepare DB Update Payload (incl. title?, excerpt?)];
    Q --> R[Update Note in Supabase];
    R --> S[Update Notification Content];
    S --> T[Create Notification];
    T --> U[End Processing];

    subgraph Groq API Calls
        L
        O
    end