# Mindpen Application: Visual Design Plan (Revised)

This plan outlines the visual design direction for the Mindpen application, focusing on creating a beautiful, intuitive, glassmorphic, dark-themed interface optimized for mobile devices first, incorporating user feedback.

**I. Core Principles & Global Styles**

1.  **Theme:** Dark Theme primarily, utilizing gradients and glassmorphism.
2.  **Aesthetic:** Glassmorphism - blurred backgrounds, subtle borders, light effects. Referencing `.context/Note View Container Component.md` and `.context/UI kit.html` for inspiration.
3.  **Layout:** Mobile-first, responsive design. Key views should adapt gracefully from small phone screens to larger desktop views. Use flexible grids and containers.
4.  **Color Palette:**
    *   **Backgrounds:** Dark grays/blacks (e.g., `#121212`, `#1a1a1a`, `#2d2d2d`) with linear gradients for depth.
    *   **Glass Backgrounds:** Semi-transparent dark shades (e.g., `rgba(30, 30, 30, 0.6)`, `rgb(35 15 55 / 60%)`) with backdrop-filter blur.
    *   **Primary Accent/Gradients:** Pinks/Purples/Blues (e.g., `#c6008d`, `#8a2be2`, `#007bff`, gradients like `linear-gradient(90deg, #c6008d, #007bff)`). Used for headers, interactive elements, highlights, and light effects.
    *   **Text:** Light grays/whites (e.g., `#f0f0f0`, `#e0e0e0`) for primary text, dimmer grays (`#a0a0a0`, `#ccc`) for secondary text/timestamps.
    *   **Borders:** Subtle light borders (e.g., `rgba(255, 255, 255, 0.1)`).
    *   **Focus/Hover:** Utilize primary accent colors for borders and subtle glows/shadows (e.g., `box-shadow: 0 0 15px rgba(138, 43, 226, 0.4)`).
5.  **Typography:**
    *   **Font:** `Segoe UI`, Tahoma, Geneva, Verdana, sans-serif (as currently used).
    *   **Headers:** Use gradient text style as defined in `.context/UI kit.html` and component examples (`.header1`, `.header2`, `.header3`).
    *   **Body Text:** Clear and readable font sizes (e.g., 16px base for body, smaller for secondary info).
6.  **Iconography:** Utilize Font Awesome icons (or a similar consistent library) as seen in the component examples. Ensure icons are clearly visible against the dark theme. Use icons for actions like add file, add photo, take photo, delete, save, etc.

**II. Key Component Designs**

*(Referencing `.context/UI kit.html` and specific component files, with revisions)*

1.  **Glassmorphic Container (`.container`):** Base for most views/modals. Use `background: rgba(30, 30, 30, 0.6); backdrop-filter: blur(12px); border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);`. Include optional `.light-effect` elements.
2.  **Buttons:**
    *   **Standard Buttons (`.standard-button`):** Base style with subtle background (`rgba(255, 255, 255, 0.05)`), border, and hover/active states using accent color glows/borders (`.button-primary`, `.button-secondary`). Include icon support.
    *   **Floating Action Button (FAB):** Implement design from `.context/Floating Recording Button Component.md`. Primary "Start New Note" button, fixed bottom-center on Notes List view.
3.  **Note Tiles (Notes List View - Revised):**
    *   **Layout:** Horizontal orientation. Aim for a similar overall area as the current tile but wider and shorter (e.g., `min-width: 280px`, `height: 150px` - adjust as needed during implementation). Use glassmorphic card styling (similar to `.recording-item` or simplified `.container`).
    *   **Content Structure:**
        *   Top: Note Title (e.g., `.header3` style, truncated if necessary).
        *   Middle: Timestamp (very small font size, e.g., 10px-11px, color `#a0a0a0`).
        *   Bottom: Note Content Excerpt (1-2 lines max, small font size like timestamp, color `#ccc`, truncated).
    *   **No Icon:** Remove the central icon area.
    *   **Hover/Focus:** Subtle glow or border highlight using accent colors.
4.  **Modals (`.modal`):** *(For potential future use like confirmation dialogs)* Use structure from `.context/Recording Modal Component.md` as a base: dark overlay with blur, glassmorphic modal content (`.modal-content`) centered.
5.  **Input Fields (`.input`, `.textarea`, `.select`):** Use styles from `.context/Settings Tab - *.md` examples. Dark, slightly transparent background, subtle border, clear text, accent color focus state with glow.
6.  **Checkboxes (`.checkbox-wrapper`):** Use the stylized checkbox from `.context/Recording Modal Component.md` or `.context/UI kit.html`.
7.  **Tabs (`.tabs`):** Use the tab style from `.context/UI kit.html` for views like Settings.
8.  **Headers (`.header1`, `.header2`, `.header3`):** Consistently apply the gradient text style.
9.  **Attachment List Item (New/Refined):**
    *   **Layout:** Glassmorphic list item (similar background/border to inputs). `display: flex; align-items: center; justify-content: space-between; padding: 10px 15px;`.
    *   **Content:** File type icon (Font Awesome), Filename (truncated), Delete button/icon (`.button-danger` style or just an icon).
    *   **Checkbox:** Include the styled checkbox (`.checkbox-wrapper`) for "Include in AI context".
10. **Image Thumbnail Container (New):**
    *   **Layout:** Collapsible section (`<details>`/`<summary>` or custom component). `summary` shows "Embedded Images" text and a count. Expanded by default.
    *   **Content:** Grid of image thumbnails (`max-width: 80px`, `max-height: 80px`, `object-fit: cover`, `border-radius: 4px`). Each thumbnail has a small overlay delete icon (`.button-danger` style) on hover/focus.

**III. Specific View Plans (Revised)**

1.  **Notes List View (`/notes` - Renamed):**
    *   **Route:** `/notes`
    *   **Layout:** Responsive grid (`display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;`). Adjust `minmax` based on the new horizontal tile size.
    *   **Header:** Standard `DashboardLayout` header with search. Title "Notes" (`.header2` style).
    *   **Content:** Grid of revised horizontal Note Tiles (as designed above).
    *   **Actions:** Floating Action Button (Mic icon) fixed bottom-center, linking to the `/create-note` page.
    *   **Empty State:** Centered message.
2.  **Note Creation Page (`/create-note` - New Page):**
    *   **Route:** `/create-note`
    *   **Layout:** Full page view, likely using `DashboardLayout`. Main content area within a glassmorphic container (`.container`).
    *   **Content:**
        *   Header (`.header2`): "Create New Note"
        *   **Recording Section:** Prominent Microphone button (can reuse FAB style or similar). Status indicator (Idle, Recording, Paused, Saved). Audio playback controls for saved recording(s). Delete recording button. Option to add *another* recording.
        *   **Manual Text Input:** Textarea (`.textarea`) for user's manual text notes/input.
        *   **Attachments Section:** Buttons (`.standard-button` with icons) to Add File, Add Photo (from gallery), Take Photo (camera). List of added attachments using the "Attachment List Item" component style (including context checkbox).
    *   **Actions:** Buttons at the bottom: "Cancel" (goes back to `/notes`), "Process Note" (`.button-primary`, triggers transcription, AI processing, saving).
3.  **Individual Note View (`/notes/[id]` - Renamed & Revised):**
    *   **Route:** `/notes/[id]`
    *   **Layout:** Use the `.container` style from `.context/Note View Container Component.md` as the main wrapper.
    *   **Header:** Display Note Title (editable, `.header2` style). "More Actions" dropdown (Delete, Share).
    *   **Timestamp:** Display below the header (`.timestamp` style).
    *   **Content Area (WYSIWYG):** Implement a WYSIWYG editor (`.wysiwyg-editor` style).
    *   **Embedded Images Section (Below WYSIWYG):** Use the "Image Thumbnail Container" component (collapsible, expanded by default) to display thumbnails of images *within* the WYSIWYG content, each with a delete option.
    *   **Attachments Section (Below Embedded Images):** Header (`.header3`): "Attachments". Buttons (`.standard-button` with icons) to Add File, Add Photo, Take Photo. List of attached files (not embedded in WYSIWYG) using the "Attachment List Item" component style (including context checkbox and delete option).
    *   **Action Buttons (Bottom):** "Save Changes" (`.button-primary`), potentially others like "Re-process with AI".
4.  **Settings View (`/account`):** Use Tabs for AI and Storage settings with styled inputs.

**IV. Responsiveness**

*   **Mobile First:** Design all components and layouts primarily for small screens. Use flexbox and grid effectively.
*   **Breakpoints:** Define breakpoints (e.g., 480px, 768px, 1024px) to adjust layouts (e.g., grid columns, element sizes, spacing). The existing CSS (`items.css`, `item.css`) already includes some media queries which can be adapted.
*   **Fluidity:** Use relative units (%, vw, vh, rem, em) where appropriate, but fixed units (px) for elements like borders or specific icon sizes can be acceptable. Ensure text wraps correctly and interactive elements remain easily tappable on small screens.

**V. User Flow Example (Mermaid)**

```mermaid
graph TD
    A[Notes List View (/notes)] -- Tap FAB --> B[Create Note Page (/create-note)];
    B -- Record Audio --> B;
    B -- Add Text --> B;
    B -- Add Attachments --> B;
    B -- Tap 'Process Note' --> C((Save & Process Note));
    B -- Tap 'Cancel' --> A;
    C -- Success --> A;
    A -- Tap Note Tile --> D[Individual Note View (/notes/id)];
    D -- Edit Content (WYSIWYG) --> D;
    D -- Add/Remove Embedded Images --> D;
    D -- Add/Remove Attachments --> D;
    D -- Tap 'Save Changes' --> D;
    D -- Tap 'Delete' (in menu) --> E{Confirm Delete};
    E -- Confirm --> A;
    E -- Cancel --> D;

    subgraph Settings
        F[Account View (/account)] --> G{AI Settings Tab};
        F --> H{Storage Settings Tab};
    end

    style B fill:#1f1f2e,stroke:#8a2be2,stroke-width:2px,color:#fff
    style C fill:#1f1f2e,stroke:#007bff,stroke-width:2px,color:#fff
    style E fill:#222,stroke:#ff6b6b,stroke-width:2px,color:#fff