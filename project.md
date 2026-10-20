# Project Specification: A Beautiful, Self-Hosted Personal Journal

## 1. Project Overview

Build a beautiful, privacy-conscious, self-hosted personal journaling website inspired by the native iOS Journal experience. This is a web application, not a native mobile application.

The product should combine the visual quality and ease of use of a thoughtfully designed consumer application with the flexibility of a structured personal knowledge archive.

The most important product principle is:

**The application must make users want to record their lives consistently.**

A journal is deeply personal. The interface must feel polished, calm, tactile, and inviting. Recording a moment should be effortless, browsing memories should feel rewarding, and finding something from months or years ago should be straightforward.

The application must support real daily usage, large collections of entries, multiple users, and Docker-based deployment on a self-managed server.

Do not build merely a visual prototype. Implement a functional, persistent, secure, and deployable product.

### Core product principles

1. **Beautiful by default:** Carefully designed typography, spacing, colors, transitions, image layouts, and empty states are essential product requirements, not optional polish.
2. **Mobile-first:** Optimize the journal creation and browsing experience for phone-sized screens while providing a complete desktop and tablet experience.
3. **Time is the foundation:** Entries form a continuous chronological history, but folders and tags provide additional ways to organize and retrieve them.
4. **Rich media is first-class:** Photos, Live Photos, videos, documents, rich text, and editable vector drawings should work naturally together.
5. **Search everything:** Users should be able to recover memories through written content, tags, AI-generated descriptions, file metadata, and locations.
6. **Local ownership:** The user owns their data. Content and uploaded files must persist independently of the application container.
7. **Privacy and security:** A personal journal may contain extremely sensitive information. Access control, data isolation, secure authentication, and transparent AI processing are mandatory.
8. **Functional completeness:** All visible actions, buttons, forms, filters, and menus must work. Avoid placeholder interactions and fake data in production functionality.

## 2. Recommended Technology Stack

Unless the existing repository has a strong reason to use another stack, use the following technologies.

### Frontend
- React and TypeScript.
- Vite for the frontend build tool.
- A well-maintained component library or headless component primitives, customized extensively to achieve the desired visual quality.
- Tailwind CSS or an equivalent maintainable styling system.
- A high-quality rich-text editor such as Tiptap.
- SVG-based vector drawing with a structured, editable document model.
- A responsive mapping library such as Leaflet with OpenStreetMap-compatible map tiles.
- An internationalization library supporting English and Simplified Chinese.

### Backend
- Go with Gin.
- SQLAlchemy for database access.
- Alembic for schema migrations.
- SQLite as the initial relational database, PostgreSQL will be the future database, so we need to support both.
- SQLite FTS5 or an appropriate supplementary indexing strategy for full-text search.
- Background job processing for image analysis, text summarization, thumbnail generation, and other non-blocking tasks.

Choose mature libraries with active maintenance. Avoid unnecessary dependencies and avoid implementing cryptography, authentication primitives, or rich-text sanitization from scratch.

### Deployment
- Docker and Docker Compose.
- Separate frontend and backend services.
- Persistent Docker volumes for the database, uploads, and generated assets.
- Environment-based configuration.
- Health checks, structured logs, and database migrations.
- Production deployment behind an HTTPS reverse proxy.

The application must not depend on files stored only inside a disposable container.

Document major architectural decisions, especially those concerning media storage, authentication, search indexing, and background jobs.

## 3. Information Architecture and Entry Model

### 3.1 Chronological journal

The primary experience is a continuous chronological stream of journal entries.

Users can create entries whenever something happens, without having to organize it first. Every entry belongs to a date and time, may contain multiple content types, and can optionally belong to a folder.

The default journal stream contains entries that do not belong to any folder.

The default stream is not a special disposable folder. It is a permanent logical view of all entries whose folder is unset.

Provide a unified timeline that can display:
- Text-only entries.
- Entries with photos.
- Live Photos.
- Video entries.
- Entries with attached files.
- Entries containing rich text and vector drawings.
- Mixed-media entries containing several of these elements.

The timeline should feel like a personal collection of memories, not a spreadsheet or a generic administration dashboard.

### 3.2 Folders

Users can create, rename, reorder, and delete folders.

Example folders include:
- Love
- Learning
- Work
- Travel
- Personal Growth

Folder names are user-defined, and folder ordering must be configurable.

Each entry belongs to zero or one folder in the initial version. An entry without a folder appears in the default stream.

Folders organize entries; they must not create separate databases or duplicate entries.

Deleting a folder must require a clear decision about its contents. Offer at least these options:
- Delete the folder and move its entries into the default stream.
- Delete the folder and permanently delete its entries, with an explicit confirmation.

Do not silently delete entries when a folder is removed.

The interface should make switching folders, navigating back to the default stream, and understanding the current scope effortless.

### 3.3 Tags

Support user-managed tags with a many-to-many relationship between entries and tags.

Users must be able to:
- Create, rename, and delete tags.
- Assign multiple tags to an entry.
- Remove tags from an entry.
- Filter the timeline by one or multiple tags.
- Search for tags by name.
- Browse all entries associated with a tag.
- Perform bulk operations using tag filters.

Avoid unnecessary duplicate tags caused by case differences or whitespace.

Use a consistent tag identity and clearly defined matching behavior. Support Unicode and Chinese tag names.

Deleting a tag removes the tag and its associations, not the associated journal entries.

### 3.4 Entry timestamps

Distinguish between:
- When an entry refers to a real-world event.
- When the entry was created.
- When the entry was last edited.

Allow users to edit the event time so that they can record something that happened in the past.

Use a consistent timezone strategy. Store timestamps in UTC, preserve the user's preferred timezone, and render dates and times appropriately for that user.

Timeline ordering and calendar statistics should use the entry's event time, rather than simply assuming its creation time is the event time.

## 4. Entry Editor and Rich Content

Build a polished, distraction-free editor that supports writing naturally on mobile and desktop.

An entry must be able to combine different content blocks rather than having a single fixed content type.

### 4.1 Rich text

Support:
- Paragraphs and headings.
- Font size controls.
- Text color.
- Bold and italic.
- Bulleted lists.
- Numbered lists.
- Links.
- Quotes.
- Undo and redo.
- Appropriate paragraph spacing.
- Paste from common sources with sensible formatting preservation.
- Keyboard shortcuts where appropriate.

The editor must preserve formatting when content is saved and loaded again.

Use a structured document representation instead of storing arbitrary unsanitized HTML as the sole source of truth.

Sanitize rendered content and user-generated HTML to prevent cross-site scripting.

Provide comfortable editing controls on small screens without allowing toolbars to consume most of the viewport.

### 4.2 Automatic saving

Implement reliable automatic saving with visible save states, such as saving, saved, and save failed.

Avoid losing content when:
- The user navigates between pages.
- The browser refreshes.
- A media upload completes.
- An AI summary finishes in the background.
- The network temporarily disconnects.

Use debounced saves where appropriate, but ensure pending edits are flushed when the editor is closed or the user navigates away.

Protect against concurrent updates and stale saves overwriting newer content.

If a save fails, preserve the local draft and provide a clear retry mechanism. Do not display a successful save state before the server confirms persistence.

### 4.3 Vector doodles and sketches

Implement a simple built-in drawing tool.

This feature is specifically for editable vector drawings, not raster images.

Requirements:
- Pen/freehand drawing.
- Multiple strokes.
- Several selectable colors and stroke widths.
- Eraser or stroke removal.
- Undo and redo.
- Clear canvas.
- Resize-aware rendering.
- Reopen and continue editing a previous drawing.
- Embed a drawing into a journal entry.
- Export or render an SVG representation where appropriate.

Persist vector elements or stroke paths as structured data. SVG may be used as the rendering format, but the underlying document must preserve editable strokes and their properties.

Do not flatten a drawing into a PNG or JPEG when saving.

Drawing must work with touch input on phones and tablets and pointer input on desktops.

## 5. Media and File Management

### 5.1 Supported content

Support:
- Still images, including common JPEG, PNG, WebP, and HEIC/HEIF files where practical.
- Apple Live Photos.
- Videos.
- Ordinary documents and other file attachments.
- Multiple attachments in one entry.

Do not force users to categorize ordinary file attachments. Display a generic attachment component with a filename, size, and sensible download or open action.

The backend may still record MIME type, file size, file hash, original filename, and technical metadata for security, deduplication, and preview generation.

### 5.2 Live Photos

Treat Live Photos as a specific compatibility requirement.

Where the original asset contains the paired still image and motion component, preserve and associate both components rather than silently treating the upload as an ordinary still image.

The system should:
- Accept the available paired assets from the upload interface.
- Preserve the original media files.
- Associate the still image and motion component with the same logical Live Photo.
- Provide the best available preview and playback experience on supported browsers.
- Gracefully fall back to a still image when browser capabilities or asset metadata do not permit native Live Photo playback.

Do not claim full Live Photo compatibility unless the actual upload, metadata association, storage, and playback workflow has been implemented and tested.

Keep the original media intact. Any conversion or thumbnail generation must produce separate derived assets.

### 5.3 Media upload and display

Implement:
- Drag-and-drop upload on desktop.
- Native file selection on mobile.
- Upload progress and error recovery.
- Multiple-file upload.
- Appropriate image thumbnails.
- Lazy loading.
- Responsive image rendering.
- Video playback with browser-native controls or a suitable player.
- File download.
- Attachment removal and replacement.
- Sensible loading, unavailable, and broken-media states.

Avoid loading full-resolution images into a large timeline unnecessarily.

Create thumbnails or optimized display variants where useful while keeping the original files intact.

Media must have authenticated access. Do not expose the uploads directory as a publicly readable static directory or rely on unguessable file URLs as the only security control.

Use safe file paths and server-generated storage identifiers. Preserve original filenames as metadata rather than using them directly to build storage paths.

## 6. AI-Assisted Summaries and Metadata

The system should use an image-capable language model to make journals easier to search.

The specific model endpoint and API credentials will be provided from the Docker env list. Do not invent API credentials, assume undocumented endpoint parameters, or hard-code a specific provider throughout the application.

Implement an abstraction layer for the language model provider, with configuration managed through environment variables.

The provider interface should support image understanding and text summarization independently.

### 6.1 Image summaries

For every uploaded still image, schedule a background job to generate a concise description.

The generated metadata should include:
- A natural-language image description.
- Potentially useful subjects, objects, activities, and scene information.
- A list of suggested tags.
- Relevant search terms.
- Processing status and error information.

Keep the generated description separate from the user's handwritten journal content.

Do not modify or overwrite the original image.

For multiple images, generate metadata independently for each image. The entry can additionally support a combined description later, but per-image metadata is the initial requirement.

Videos do not need AI-generated summaries in the initial version.

For Live Photos, summarize the still image only unless an additional capability is explicitly implemented later.

### 6.2 Text summaries

Generate a concise summary of the textual content of an entry.

Also suggest a small number of relevant tags based on the text.

Text summaries and suggested tags should be clearly identifiable as AI-generated metadata. Users must remain in control of the final tags and handwritten content.

Avoid unnecessarily regenerating summaries when an unrelated property changes, such as folder placement or the entry's display color.

Reprocess summaries when their source content materially changes.

### 6.3 Metadata lifecycle

AI processing must not block a file upload or entry save.

Implement asynchronous processing with:
- Pending, processing, completed, and failed states.
- Safe retries.
- Error logging.
- A reasonable timeout.
- A configurable retry limit.
- A mechanism to reprocess an item.
- Search indexing after metadata is successfully generated.

If the LLM API has not been configured (from docker env variable, which is the OpenAI-style API format), entries and uploads must still function normally. Represent AI metadata as pending or unavailable and provide a clear indication in the interface or configuration diagnostics.

Do not make a failed LLM request cause the entire entry save to fail. That is the LLM is not a hard requirement, it is a bounus.

Because journal data is private, provide clear documentation and an appropriate configuration or consent control explaining which content may be sent to the configured external model provider.

Do not send user data to a model unless the feature is configured and permitted by the user's settings.

### 6.4 Location metadata

Keep location data distinct from AI-generated descriptions.

The AI may describe an image as depicting a beach, city, or restaurant, but must never invent GPS coordinates or claim that a particular location is verified without supporting metadata.

Retrieve coordinates from reliable sources such as embedded EXIF GPS data, explicitly selected locations, or user-supplied coordinates.

Store the location source and, where applicable, its extraction or verification status.

## 7. Location and Maps

### 7.1 Location support

Entries may have an optional geographic location.

Support:
- Latitude and longitude.
- A human-readable place name where available.
- Manual location assignment.
- Location search or selection through a map.
- Location extracted from image EXIF metadata.
- Viewing the locations associated with an entry and its attachments.

When an uploaded image contains valid GPS EXIF metadata, automatically extract its coordinates and associate the location with the image. Where appropriate, also associate it with the parent entry without overwriting a location the user explicitly selected.

A user's manually assigned location must take precedence over automatically inferred defaults.

Preserve relevant original metadata when appropriate, but do not rely on retaining every EXIF field in the image preview copy.

### 7.2 Map viewer

Implement a simple map interface for browsing recorded places.

The map should display markers representing entries or media with valid geographic coordinates.

Requirements:
- Click a marker to open its associated entry or media.
- Group nearby markers into clusters when displaying many records.
- Filter map results by date, folder, and tags where practical.
- Allow the user to navigate from an entry to its location.
- Support a full-screen or spacious map view on mobile and desktop.
- Provide an appropriate empty state when no entries have locations.

Use an appropriate map library and a configurable map tile source. Do not assume unlimited free use of third-party map tiles or geocoding services.

## 8. Search and Retrieval

Search is a core product capability and must work across the user's entire archive.

### 8.1 Global search

Provide a global search interface accessible from the main navigation.

Search across:
- Journal text.
- Rich-text document content.
- Entry titles, if titles are used.
- Tag names.
- Folder names where appropriate.
- AI-generated text summaries.
- Image descriptions and keywords.
- Relevant media metadata and filenames.
- Location names and available location metadata.

Return results that identify the matching entry and, when relevant, the matching image, attachment, or metadata field.

Highlight matching terms when practical.

Search should support searching Chinese and English content. Do not assume that SQLite FTS5's default tokenization is sufficient for Chinese substring and word-boundary search.

Choose and document a practical indexing strategy that delivers reliable Chinese and English search. This may combine full-text indexing, tokenization, n-gram indexing, and indexed substring fallback.

Avoid scanning and loading the complete journal history into application memory for every search request.

Search results must always be restricted to the authenticated user's data.

### 8.2 Timeline filters

The timeline must support combinations of:
- Default stream.
- Specific folders.
- One or multiple tags.
- Date range.
- Relevant media types where useful.
- Text search.

Allow filters to be combined and cleared easily.

Clearly show which filters are active and what portion of the archive is being viewed.

Provide useful empty states for searches and filter combinations that return no results.

### 8.3 Pagination and performance

Assume a user may eventually have tens of thousands of entries and a large number of media attachments.

Use efficient server-side pagination. Cursor-based or keyset pagination is preferred for the main timeline when practical.

Avoid loading the entire journal into the browser.

Design the database schema with suitable indexes, particularly for:
- User ID.
- Entry event timestamp.
- Entry creation timestamp.
- Folder relationships.
- Tag relationships.
- Search indexes.
- Media associations.
- Location coordinates where supported.

Use stable ordering with a deterministic tie-breaker when timestamps are identical.

Implement lazy loading for long timelines and avoid unnecessary rerenders of large collections.

Validate performance with representative seeded data rather than testing only with a few entries.

## 9. Bulk Editing and Archive Management

Provide a selection mode for batch operations on entries.

Support:
- Select one or more entries.
- Select all entries in the current filtered result set where practical.
- Move selected entries into a folder.
- Move selected entries into the default stream.
- Add or remove tags in bulk.
- Delete multiple selected entries.
- Filter entries by tag and perform batch deletion.
- Search and select entries before performing a destructive operation.

Use clear confirmation dialogs for destructive actions. The confirmation should communicate the number of affected entries.

Support deleting a folder according to the folder-deletion behavior described earlier.

Deleting entries must clean up their associated database records and media references safely. Do not leave orphaned files indefinitely or remove files still referenced by other records.

Use transactions for database changes. For file deletion, use a safe ordering or recoverable cleanup process so that a database transaction failure does not leave the system in an inconsistent state.

A long-running bulk operation should provide useful progress or completion feedback rather than freezing the interface.

## 10. Statistics, Calendar, and Streaks

Build a personal journal overview that makes the user's history feel tangible and rewarding without turning the app into a productivity dashboard.

### 10.1 Statistics

Display meaningful personal statistics, including:
- Total number of journal entries.
- Total number of photos.
- Total number of videos.
- Total number of other attachments.
- Total written word count.
- Total number of days with at least one entry.
- Current journaling streak.
- Longest journaling streak.

Define counting rules clearly. For example, distinguish a unique Live Photo from its underlying image and motion components.

Word-count statistics should operate on textual content rather than treating HTML or editor markup as words. Document how Chinese text and mixed-language content are counted.

Statistics must reflect actual database contents and update when entries are created, edited, or deleted.

### 10.2 Calendar

Provide a calendar that can display journal activity by:
- Day.
- Month.
- Year.

Use a visual activity intensity indicator similar to a contribution heatmap, with accessible color contrast and a non-color means of communicating relevant activity.

Users should be able to navigate between periods and open the entries recorded on a selected date.

The year view should make long-term recording patterns visible without overwhelming the interface.

### 10.3 Streaks

Track consecutive calendar days containing at least one journal entry.

Examples include a current streak of 20 consecutive days and a record-long streak.

Use the user's configured timezone to determine calendar-day boundaries.

Do not reset a streak merely because the user changes folders or tags. Define whether deleted entries affect historical streak calculations, and calculate the results from actual journal data rather than maintaining an unreliable counter.

Avoid guilt-inducing or punitive messaging. The feature should encourage consistency rather than punish interruptions.

## 11. Multi-User Authentication and Security

The application will be accessible over the internet and must safely support multiple users.

Multi-user support is not simply multiple accounts sharing the same interface. Every relevant database query, search operation, media request, background job, and destructive action must enforce ownership.

### 11.1 Accounts

Implement:
- User registration with a configurable ability to disable public registration.
- Login and logout.
- Secure password storage using a suitable password-hashing algorithm.
- Password change.
- Account-specific preferences.
- Session revocation on logout and relevant security changes.

An initial administrator bootstrap process should be documented and should not require hard-coded credentials.

Do not expose a public API that can arbitrarily promote users to administrator.

### 11.2 Authentication persistence

Users should not be forced to log in again frequently during normal use.

Implement secure session renewal using an appropriate token or session strategy, such as short-lived access credentials with rotating refresh credentials or a server-managed session.

Use secure, HttpOnly cookies when appropriate, HTTPS in production, suitable SameSite settings, and CSRF protections where required by the chosen authentication design.

Refresh credentials must be revocable. Logout must invalidate the relevant server-side session or refresh credential rather than merely hiding the current page.

Handle session expiry gracefully. Preserve unsaved drafts if a session expires during editing and direct users through a safe reauthentication flow.

Do not store long-lived authentication secrets in localStorage.

### 11.3 Tenant and data isolation

Every entry, folder, tag, attachment, drawing, location record, search result, and statistics query must belong to the correct user.

Never trust a user-supplied record ID as proof of authorization.

Validate ownership in the backend for every operation, including downloads and direct media URLs.

Prevent insecure direct object reference vulnerabilities and cross-user data leakage.

### 11.4 Additional security requirements

Implement appropriate defenses against:
- SQL injection.
- Cross-site scripting.
- Cross-site request forgery where relevant.
- Unauthorized access to media.
- Brute-force login attempts.
- Malicious or incorrectly typed uploaded files.
- Path traversal.
- Oversized uploads and resource-exhaustion attacks.
- Sensitive information leaking through logs.
- Excessive API request rates.

Use parameterized database operations, validated input schemas, secure response headers, authentication rate limits, upload limits, and a restrictive CORS policy.

Treat filenames and MIME types from clients as untrusted input. Validate uploads and generate safe server-side storage identifiers.

Use least-privilege defaults and expose only necessary services and ports in Docker Compose.

Do not commit passwords, session secrets, API keys, or production credentials to source control.

Provide an example environment file containing placeholders rather than live secrets.

Document recommended HTTPS termination and production security configuration.

## 12. Privacy, Backup, and Data Ownership

The journal must remain usable without cloud synchronization or third-party storage.

Store database records locally and store original uploaded files on a persistent local filesystem volume.

Keep uploaded originals separate from derived assets such as thumbnails and preview images.

Provide a documented backup procedure covering:
- SQLite database.
- Uploaded original media.
- Derived assets where useful.
- Relevant configuration required for recovery, excluding live secrets unless securely handled.

SQLite backups must be performed using a safe method that accounts for SQLite transaction and journaling behavior. Do not rely on copying a potentially active database file without considering database consistency.

Provide a restore procedure and document how to verify a backup.

Where practical, provide a way for users to export their journal data and download their original media. A structured JSON export plus a media archive is a useful initial format.

Account deletion and destructive actions must be explicit and must not silently leave private media accessible.

Document the effects of AI processing, geocoding, and external map tile providers on privacy. Do not send user content to third-party services unnecessarily.

## 13. Internationalization

The entire user interface must support English and Simplified Chinese.

English is the default language.

Users must be able to change the interface language in settings, and their selection must persist across sessions.

Requirements:
- Translate navigation, dialogs, buttons, forms, notifications, empty states, and error messages.
- Format dates, times, and numbers according to the selected locale.
- Support Chinese and English text in entries, tags, summaries, filenames, and search.
- Ensure user-generated content is displayed in its original language.
- Avoid hard-coded interface strings scattered across components.

Do not translate user-written content automatically.

Plan the structure so additional languages can be introduced without rewriting the application.

## 14. Visual Design and Interaction Quality

The quality of the visual design is one of the project's defining requirements.

Do not blindly clone Apple's Journal application. Take inspiration from its simplicity, generous whitespace, editorial presentation, and emphasis on memories, while creating a distinct visual identity suitable for a web application.

The UI should feel like a carefully designed premium personal product, not a generic admin template.

### 14.1 Visual direction

Aim for a combination of:
- Editorial typography.
- Refined spacing and alignment.
- Restrained, harmonious colors.
- Subtle borders and shadows.
- Beautiful image presentation.
- Clear typographic hierarchy.
- Thoughtful use of whitespace.
- Carefully designed icons and original SVG illustrations.
- A consistent visual language across the editor, timeline, calendar, maps, and settings.

You may develop a warm, paper-inspired light theme and a carefully tuned dark theme if this can be implemented without compromising the core experience.

Use a consistent design-token system for colors, spacing, typography, radii, shadows, and motion.

Avoid overusing gradients, rounded cards, glassmorphism, oversized icons, or decorative effects without a clear purpose.

Do not fill the interface with unnecessary panels simply because a component library provides them.

### 14.2 Mobile-first layout

Prioritize realistic phone-sized viewports.

The mobile experience must support:
- Comfortable one-handed navigation.
- Quick entry creation.
- Easy media capture or file selection.
- Touch-friendly controls.
- Smooth timeline scrolling.
- Responsive rich-text editing.
- Full-screen or spacious image viewing.
- Map interaction.
- Useful menus and dialogs that fit the viewport.
- Safe-area insets on mobile devices where applicable.

Support desktop with a well-designed wider layout, including efficient browsing, a richer sidebar or navigation area, keyboard shortcuts, and multi-selection workflows.

Avoid horizontal overflow and interactions that depend exclusively on hover.

### 14.3 Animation and feedback

Use subtle, purposeful animations for:
- Opening and closing dialogs.
- Expanding navigation.
- Entry creation and removal.
- Filter changes.
- Image transitions.
- State changes and notifications.

Respect reduced-motion preferences and keep interactions fast.

Animations must never delay essential actions or interfere with scrolling.

### 14.4 Icons and illustrations

Use a consistent icon set supplemented by a limited number of original SVG illustrations.

Illustrations may appear in empty states, onboarding, the calendar, or other places where they improve the experience.

Keep them lightweight, accessible, and visually consistent. Avoid random decorative imagery and generic stock illustrations.

### 14.5 Accessibility

Provide:
- Keyboard navigation.
- Clearly visible focus states.
- Semantic HTML.
- Accessible names for icon-only controls.
- Appropriate labels for form fields.
- Sufficient color contrast.
- Useful screen-reader announcements for saving and upload states.
- Reduced-motion support.

Accessibility is part of interface quality, not a separate afterthought.

## 15. Main Pages and Navigation

Implement the following pages or equivalent views:

1. **Journal Timeline:** The default chronological stream, with pagination, date navigation, and filters.
2. **Folder Views:** Chronological entries belonging to a selected folder.
3. **Entry Editor:** Create and edit rich-text and mixed-media entries.
4. **Entry Detail:** Review a saved entry, its attachments, metadata, tags, and location.
5. **Global Search:** Search the archive and inspect matching entries.
6. **Calendar and Statistics:** View activity by day, month, and year and review personal statistics.
7. **Map Explorer:** Browse recorded locations and navigate to their corresponding entries.
8. **Attachment Viewer:** Preview supported media and manage ordinary file attachments.
9. **Settings:** Manage account preferences, language, timezone, security, and relevant privacy options.
10. **Authentication:** Registration, login, logout, and related flows.

Navigation should remain simple. Users should be able to move between the main timeline, folders, search, calendar, and maps without losing track of their current context.

Do not cram every capability into one screen. Provide progressive disclosure: the journal should be simple at first glance while more advanced controls remain accessible.

## 16. Backend Architecture and Data Model

Design a normalized relational data model.

A reasonable starting point includes the following entities:

- User
- UserSettings
- JournalEntry
- Folder
- Tag
- EntryTag
- MediaAsset
- EntryBlock or structured document content
- DrawingDocument or vector drawing content
- Location
- BackgroundJob or equivalent processing record
- Session or RefreshToken, depending on the authentication design

Refine the schema based on actual implementation needs.

Entries must support optional folder membership, multiple tags, editable event timestamps, structured rich-text content, and multiple associated media assets.

Media records must preserve the association between uploaded originals, derived previews, parent entries, and Live Photo components where applicable.

Location data should support both entry-level locations and media-level location metadata.

Use database migrations rather than relying on an ad hoc schema creation script as the only means of maintaining the database.

Add appropriate indexes, foreign keys, uniqueness constraints, and cascading or cleanup rules.

Background jobs must reference the correct user and source record, and should be safe against duplicate processing where practical.

Document the API, including authentication, pagination, filtering, error responses, uploads, batch actions, and AI processing states.

Use consistent API response formats and meaningful HTTP status codes.

Never expose internal filesystem paths, secrets, stack traces, or other unnecessary implementation details in client-facing error messages.

## 17. Reliability and Performance

The system should remain responsive as the archive grows.

Implement and validate:
- Paginated timeline queries.
- Indexed filtering.
- Efficient database access without N+1 query problems.
- Lazy image loading and suitable media variants.
- Background processing for expensive operations.
- Bounded concurrency for CPU- or memory-intensive jobs.
- Upload size and request limits.
- Safe cleanup of abandoned uploads and derived assets.
- Graceful handling of unavailable AI services.
- Database migration and startup checks.
- Structured application logs.
- Useful health-check endpoints.

Do not perform all AI summaries, media conversions, or large cleanup tasks synchronously during a normal HTTP request.

Avoid fragile background tasks that disappear silently when a request ends. Use a durable job queue or a small persistent SQLite-backed job mechanism appropriate to the initial deployment scale, with locking and recovery behavior documented.

Keep the initial architecture simple enough to deploy easily, but avoid decisions that would make later migration to PostgreSQL or a dedicated worker service unnecessarily difficult.

## 18. Docker Deployment and Operations

The project must be deployable through Docker Compose.

Provide:
- Dockerfiles for the frontend and backend.
- A Docker Compose configuration.
- A persistent SQLite volume.
- A persistent media volume.
- An appropriate persistent location for derived assets and other required state.
- Environment variable configuration.
- A health check.
- Database migration handling.
- A documented initial administrator bootstrap procedure.
- A restart policy appropriate for self-hosted use.
- A production serving configuration.
- A backup and restore guide.
- A troubleshooting guide.

The container must not lose data when it restarts, is recreated, or the application is upgraded.

Do not expose SQLite directly over the network.

Do not enable development servers, debug mode, or permissive development CORS settings in production.

Ensure a fresh deployment can be started using the documented commands without requiring manual modification of source code.

## 19. Testing and Acceptance Criteria

Write meaningful tests throughout development rather than leaving testing until the end.

### Core functionality
- A user can create, edit, and delete journal entries.
- An entry can exist without a folder.
- Folder membership and tag associations persist correctly.
- Rich-text formatting survives save and reload.
- Drawings remain editable after save and reload.
- Images, Live Photo components, videos, and generic files follow their intended upload and viewing flows.
- Uploading an image with valid GPS EXIF data creates the expected location metadata.
- AI failures do not prevent entries or media from being saved.
- A user can search handwritten content, tag names, image descriptions, and AI-generated text metadata.
- Timeline filters can be combined.
- Pagination does not create duplicates or skip entries under ordinary browsing conditions.
- Bulk editing and deletion produce consistent results.
- Calendar, word counts, and streaks reflect actual data.

### Security
- One user cannot read another user's entries, tags, folders, media, drawings, locations, statistics, or search results.
- Direct requests using another user's record IDs do not bypass authorization.
- Authentication renewal and logout work as intended.
- Invalid uploads are rejected safely.
- Secrets are not present in the repository.
- Unauthorized users cannot access private media through static URLs.

### Persistence and deployment
- Application restarts preserve all journal data and uploads.
- Database migrations work against a fresh installation.
- Backup and restore procedures are documented and tested.
- Docker Compose can start the complete application successfully.

### Visual and usability quality
- Core screens work at phone, tablet, and desktop sizes.
- No major screen has broken layouts or horizontal overflow.
- Empty, loading, error, and success states are implemented.
- Buttons and navigation controls have real behavior.
- English and Simplified Chinese are available throughout the interface.
- The application remains responsive with a realistically sized test archive.
- The design feels cohesive rather than assembled from unrelated components.

## 20. Development Strategy and Deliverables

Develop the product in stages, but establish an integrated, running application early.

### Phase 1: Foundation

Establish the repository structure, frontend/backend communication, database models, migrations, authentication, Docker Compose deployment, design system, internationalization, and responsive navigation.

The first milestone must be a working application that can be started locally and deployed with Docker.

### Phase 2: Core Journal

Implement folders, the default stream, tags, rich-text entries, automatic saving, media uploads, attachment viewing, timeline pagination, and editing/deletion.

### Phase 3: Retrieval and Organization

Implement global search, combined timeline filters, batch operations, activity calendars, statistics, and streak calculations.

### Phase 4: Media Intelligence and Maps

Implement background jobs, the LLM provider abstraction, image and text summaries, suggested tags, EXIF extraction, location selection, map browsing, and editable vector drawings if they have not already been integrated into the core editor.

### Phase 5: Hardening and Visual Polish

Complete isolation and security checks, failure handling, performance validation, responsive refinements, accessibility, backups, operational documentation, and end-to-end testing.

You may adjust the order when dependencies make another sequence more efficient, but do not postpone architectural necessities such as user ownership, persistent storage, migrations, or authentication until the end.

### Required deliverables

The finished repository should include:

- Complete frontend and backend source code.
- Database models and migration files.
- Dockerfiles and Docker Compose configuration.
- Environment variable documentation and an example environment file.
- API documentation.
- Automated tests for critical features and security boundaries.
- Installation and deployment instructions.
- Backup and restore documentation.
- A concise architecture document explaining important implementation decisions.

## 21. Instructions to the AI Coding Agent

Treat this specification as the product and engineering requirements for a real application.

First, inspect the existing repository and determine whether code, configuration, or useful functionality already exists. Preserve useful existing work rather than replacing it without reason.

Then establish a concrete implementation plan and immediately begin building the application. Do not stop after producing a plan, a specification, mockups, or a collection of static pages.

Make sensible engineering decisions where details are unspecified. Avoid repeatedly asking for clarification about minor implementation choices. Document significant assumptions and trade-offs.

Build features end to end: frontend interaction, API behavior, persistence, authorization, error handling, and tests must work together.

Do not substitute mock data for backend integration. Do not leave visible buttons unimplemented. Do not claim a feature is complete simply because its interface exists.

When an external service is not configured, implement the appropriate provider interface, configuration, failure state, and fallback behavior rather than inventing credentials or fabricating successful results.

Prioritize data integrity, security, usability, and coherent visual quality. Keep the code modular, typed where practical, readable, and maintainable.

After implementation, run the available tests and build commands, fix the failures you can reproduce, and validate the Docker deployment path.

At completion, provide a concise report covering:
- What was implemented.
- The main architectural decisions.
- How to start and deploy the application.
- Which environment variables must be configured.
- How to create the first administrator.
- Which tests were run and their results.
- Any known limitations or unfinished features.

The objective is a polished, secure, self-hosted journaling product that someone can realistically use every day to record, organize, explore, and preserve their life experiences.