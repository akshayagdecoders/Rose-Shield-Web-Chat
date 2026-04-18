# RoseShield Chat: Technical Documentation

## 1. Project Overview
RoseShield is a secure private messaging application built with **Next.js**, **MySQL**, and **ONNX AI**. It detects grooming, toxicity, and sensitive images in real-time.

---

## 2. Core Workflow (Data Flow)
1. **User Action**: User sends a message or image.
2. **Moderation (Server)**:
   - **Text**: `lib/detector.js` checks keywords and then runs an AI inference (`grooming_model.onnx`).
   - **Image**: `lib/imageDetector.js` resizes the image and runs a classification model.
3. **Storage**: 
   - If offensive: Content is replaced with a warning.
   - If safe: Content is stored in MySQL.
4. **Retrieval**: The receiver's client polls `api/messages` every 3 seconds to fetch new content.

---

## 3. Function-by-Function Explanation

### A. Moderation Logic
- **`lib/detector.js` -> `checkMessage(text)`**: 
  - Master function for text safety. 
  - Returns `true` if the message is offensive.
- **`lib/detector.js` -> `normalizeText(text)`**: 
  - Fixes slang (e.g., "u" -> "you") so users cannot hide offensive words.
- **`lib/imageDetector.js` -> `checkImage(buffer)`**: 
  - Predicts if an image is sensitive using AI.

### B. Presence System
- **`app/api/presence/route.js` -> `POST`**: 
  - Called by the browser every 30s (Heartbeat) to mark the user as active.
- **`app/api/presence/route.js` -> `GET`**: 
  - Returns `online: true` if the user's `last_seen` was within the last 60 seconds.

### C. Message Handling
- **`api/messages/route.js` -> `POST`**: 
  - Receives form data, runs moderation, and inserts into DB.
- **`api/messages/route.js` -> `GET`**: 
  - Retrieves history. Use `DATE_FORMAT` and `CONVERT_TZ` to ensure times are in **IST**.

### D. Interface Logic (`app/page.js`)
- **`fetchMessages()`**: Fetches history for the active chat.
- **`handleSendMessage()`**: Sends text and clears the input.
- **`handleImageUpload()`**: Sends raw image files to the server.

---

## 4. Database Structure
- **`users`**: ID, Name, Email, Password (hashed), Last Seen.
- **`messages`**: Sender_ID, Receiver_ID, Content, Type, Status, Timestamp.
- **`calls`**: (New) Handles WebRTC signaling for audio/video calls.

---

## 5. Security Methods
- **Bcrypt**: Used in `/api/auth` to hash passwords before storing them.
- **Sanitization**: Offensive text is never sent to the recipient; it is blocked at the database level.
- **UTC Enforcement**: All timestamps are stored as UTC in the database to prevent "future time" or "past time" bugs.
