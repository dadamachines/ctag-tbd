# Sample Manager Folder Upload Fix (March 2026)

## Problem

When uploading a folder of samples via the WebUI Sample Manager, subfolder structure was lost — all files ended up flat in the target directory. For example, uploading a folder with 8 subfolders (Bass Drums, Claps, Closed Hats, etc.) containing 558 samples placed every file directly into the target without preserving the subfolder organization.

Two separate issues caused this:

1. **Confirm dialog dismissed**: The old code used a `confirm()` dialog asking whether to preserve or flatten folder structure. If the user missed or cancelled it, all files uploaded flat.
2. **Drag-and-drop had no folder support**: Files dropped via drag-and-drop never received `webkitRelativePath` (only available from `<input webkitdirectory>`), so subfolder structure was always lost on drop regardless of user choice.

## Root Cause

### sample-manager.js — Missing `confirm()` Feedback

The `showFolderStructureDialog` function used `window.confirm()` to ask the user whether to preserve subfolders. This was easy to miss, especially when uploading many files, and cancelling silently fell through to flat upload.

### sample-manager.js — No Drag-and-Drop Folder Traversal

The `drop` event handler used `e.dataTransfer.files` directly, which provides a flat list of `File` objects with no path information. The `webkitRelativePath` property is only populated when files come from an `<input webkitdirectory>` element, not from drag-and-drop.

## Fixes

### Removed Confirmation Dialog

The `showFolderStructureDialog` function and its `confirm()` popup were removed entirely. Subfolder structure is now **automatically preserved** whenever detected, with a toast notification informing the user:

```js
toast(`Uploading ${validFiles.length} files — preserving ${subfolderSet.size} subfolder(s)`, 'primary', 4000);
uploadWithSubfolders(validFiles, targetPath);
```

### Added Drag-and-Drop Folder Traversal

Three helper functions were added to recursively walk dropped folders using the File System Entry API (`webkitGetAsEntry()`):

- **`readAllDirectoryEntries(dirReader)`** — Reads all entries from a directory reader, handling Chrome's 100-entry batch limit by looping until empty.
- **`fileFromEntry(entry)`** — Promise wrapper around `FileSystemFileEntry.file()`.
- **`collectFilesFromEntries(entries, relPath, results)`** — Recursively walks directory entries, annotating each `File` object with a `_relativePath` property containing its relative path within the dropped folder.

### Modified Drop Event Handler

The `drop` handler on `poolPanel` was converted to `async` and enhanced to:

1. Convert `e.dataTransfer.items` to `FileSystemEntry` objects via `webkitGetAsEntry()`
2. Detect if any entries are directories
3. If directories found: recursively collect all files with `_relativePath` annotation
4. If no directories: fall through to plain `e.dataTransfer.files` behavior

### Modified `handleDroppedFiles`

Now reads relative paths from **either** `webkitRelativePath` (from `<input>`) **or** `_relativePath` (from drag-drop), enabling subfolder detection regardless of upload method.

### Modified `uploadWithSubfolders`

Uses `f.webkitRelativePath || f._relativePath || ''` to read relative paths, then creates subfolder directories on the device before uploading each file to its correct location.

## Files Changed

- `sdcard_image/www/js/sample-manager.js` — Source file with all logic changes
- `sdcard_image/www/js/app-bundle.js` — Deployed bundle with same changes applied

## Verification

- Full SD card erase + reimage deploy completed
- Device boots cleanly, web server responds HTTP 200
- Folder upload (both input and drag-drop) now auto-preserves subfolder structure
