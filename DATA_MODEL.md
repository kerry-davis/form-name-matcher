# Data Model and ERDs

This document captures the core data shapes, file system interactions, and runtime state models for the `pdf-sorter.html` application.

## 1) Runtime Data & File System ERD

This diagram represents the in-memory objects generated during the scanning (Phase 1) and moving (Phase 2) processes.

```mermaid
erDiagram
  SOURCE_DIR ||--o{ ANALYZED_FILE : "contains"
  SOURCE_DIR ||--o{ SUB_DIRECTORY : "contains"
  ANALYZED_FILE ||--|| PDF_CONTENT : "validates against"
  ANALYZED_FILE }o--|| CATEGORY_ASSIGNMENT : "classified as"
  CSV_IMPORT_ROW ||--o{ MOVEMENT_OP : "triggers"
  MOVEMENT_OP ||--|| DEST_DIR : "targets"

  SOURCE_DIR {
    string name
    FileSystemHandle handle
    string path
  }

  ANALYZED_FILE {
    string name            "KA12345678.pdf"
    string relativePath    "Subfolder/File.pdf"
    string category        "A|B|C"
    string reason          "Classification logic output"
    FileSystemHandle handle
    FileSystemHandle parentHandle
  }

  PDF_CONTENT {
    string filenamePattern "/^KA\d{8}.*\.pdf$/i"
    string page1Text       "Annual Enterprise Survey"
    boolean page1Editable  "Widgets present & unlocked"
    boolean officeUseFound "Text 'Office use' on last page"
    boolean officeUseTickable "Checkboxes below 'Office use' text"
  }

  CATEGORY_ASSIGNMENT {
    string code "A (Non-Editable) | B (Tickable) | C (Locked)"
    string logic "A: Default/Error/ReadOnly | B: P1 Edit + Office Edit | C: P1 Edit + Office Locked"
  }

  CSV_IMPORT_ROW {
    string path "Directory relative to root"
    string name "Filename"
    string category "A|B|C"
  }

  MOVEMENT_OP {
    string status "Pending|Success|Failed"
    boolean copyOnly "flag"
    boolean tickOverride "True if user overrides PDF ticks"
    boolean tickModified "True if B checkboxes updated"
  }
```

Notes:
- **Source of Truth**: The file system is the primary source. `allFiles` array is a transient snapshot.
- **Analysis Logic**:
    - **Category A**: Default state. Assigned if: regex fails, "Annual Enterprise Survey" missing, Page 1 has no editable widgets, or any error occurs.
    - **Category B**: Assigned if: Page 1 has editable widgets **AND** the "Office Use" section on the last page contains editable checkboxes.
    - **Category C**: Assigned if: Page 1 has editable widgets **BUT** the "Office Use" section is missing, invalid, or locked.
- **B-Category Modification**: When moving Category B files, the system **optionally** injects checkbox states.
    - **Default**: Retains existing PDF ticks (No modification).
    - **Override Mode**: If enabled by user, it ticks `dta` (or user selection) and unticks others based on spatial sorting of the last page's widget annotations.
- **Folder Retention**: 
    - **Category A**: Retains the original source subdirectory structure (e.g., `Source/Sub/File.pdf` -> `Dest/Sub/File.pdf`).
    - **Category B & C**: Flattens files into the destination root (e.g., `Source/Sub/File.pdf` -> `Dest/File.pdf`).

## 2) CSV I/O Data Models

### Analysis Export Schema (Output of Phase 1)
Filename: `pdf-analysis-{category}-{timestamp}.csv`

| Column | Type | Description |
| :--- | :--- | :--- |
| `FilePath` | String | The directory path relative to the source root (e.g., `Root/Subfolder`). |
| `FileName` | String | The specific PDF filename (e.g., `KA12345678.pdf`). |
| `Category` | Enum | `A`, `B`, or `C`. |
| `Reason` | String | Human-readable string explaining the classification logic. |
| `MoveStatus` | String | Static value "Pending" for template generation. |

### Move Summary Schema (Output of Phase 2)
Filename: `move-summary-{timestamp}.csv`

| Column | Type | Description |
| :--- | :--- | :--- |
| `FileName` | String | Name of the processed file. |
| `OriginalPath` | String | Source directory path. |
| `Category` | Enum | `A`, `B`, or `C`. |
| `DestinationFolder` | String | Name of the target folder selected by the user. |
| `Status` | Enum | `Success` or `Failed`. |
| `Message` | String | Detailed error message or modification log (e.g., "[Updated: 1 Checked]"). |

## 3) Service Layer Model (Logic Flow)

```mermaid
classDiagram
  class AppState {
    +FileSystemDirectoryHandle sourceDir
    +AnalyzedFile[] allFiles
    +boolean isProcessing
    +CsvStore csvData
  }

  class AnalysisService {
    +scanConcurrent(dir, mode)
    +analyzePdf(fileHandle)
    +validateFormMarkers(pdfDoc)
    +classify(page1Edit, officeEdit)
  }

  class CsvService {
    +exportCategory(category, files)
    +parseImport(csvText)
    +generateSummary(moveResults)
  }

  class MoveService {
    +processBatch(category, csvRows, destHandle)
    +modifyPdfForm(fileBuffer)
    +verifySpatialLayout(widgets)
    +writeToDestination(buffer, handle)
  }

  AppState --> AnalysisService : triggers
  AppState --> CsvService : exports/imports
  AppState --> MoveService : executes
  MoveService --> AnalysisService : re-uses PDF libs
```

Notes:
- **Concurrency**: Phase 1 analysis uses a custom promise pool (limit: 8 concurrent workers) to process file reading and `pdf.js` parsing in parallel without freezing the main thread.
- **PDF Library Usage**: 
    - Phase 1 (Read-only) uses `pdf.js` for efficient text content and annotation inspection.
    - Phase 2 (Read/Write) uses `pdf-lib` to modify form fields (ticking boxes) and save the resulting binary.
- **Tick Logic Tolerance**: The `modifyPdfForm` logic uses spatial tolerance (y-diff < 10, x-sort) to identify the "Office Use" row even if visual alignment varies slightly between files.

## 4) UI State & Persistence

```mermaid
erDiagram
  WINDOW ||--|| LOCAL_STORAGE : "persists"
  WINDOW ||--o{ DOM_TAB : "manages"
  PHASE_SELECTOR ||--|| CONTAINER_VIEW : "toggles"

  LOCAL_STORAGE {
    string darkMode "enabled|disabled"
  }

  DOM_TAB {
    string id "listA|listB|listC"
    boolean active
    int count
  }

  CONTAINER_VIEW {
    string id "phase1-container|phase2-container"
    boolean visible
  }

  PHASE2_ROW {
    string id "rowA|rowB|rowC"
    boolean collapsed "Expanded/Collapsed state"
  }

  LOG_ENTRY {
    string fileName
    string status
    FileSystemHandle destHandle "For Ctrl+Click access"
  }
```

Notes:
- **Dark Mode**: Persisted in `localStorage` (`darkMode`). Applied via CSS root variables.
- **Phase Isolation**: The UI strictly separates Phase 1 (Analysis) and Phase 2 (Movement). Data does not automatically flow from Phase 1 to Phase 2; it MUST go through the CSV Export -> CSV Import cycle to allow human review/editing.
- **Phase 2 Collapsible Sections**: Rows A, B, and C are collapsible accordion panels. Toggling reduces visual clutter, hiding CSV controls and options while keeping the header visible. The state (expanded/collapsed) is currently transient (not persisted).
- **Log Interactivity**: Move/Copy logs retain a reference to the destination `FileSystemHandle`, enabling a "Ctrl+Click" action to instantly open the processed PDF for verification.
