
# BrowSync

**BrowSync**  is a powerful browser extension designed to help users manage their time effectively. By tracking website usage, offering a comprehensive productivity dashboard, and sending intelligent break reminders, it empowers users to stay focused and optimize their online habits. With the added bonus of AI-driven insights, BrowSync provides personalized recommendations and analysis, helping users boost productivity, maintain balance, and make the most of their time online.
## About The Project

BrowSync is perfect for anyone who wants to take control of their time online. Whether you’re a student, professional, or anyone who spends significant time on the web, this extension helps you stay productive by:

- Tracking time spent on different websites.
- Encouraging mindful breaks.
- Giving you insights into your browsing habits for better time management.

# Features
- **Website Tracking**:- Tracks time spent on websites to help identify distractions and improve focus.
- **Productivity Dashboard**:-  Displays detailed analytics on browsing activity and productivity trends.
- **Smart Break Reminders**:- Suggests optimal break times to prevent burnout and improve focus.
- **AI-Powered Productivity Insights**:- Provides personalized recommendations and insights to boost efficiency.
- **Customizable Settings**:- Allows users to tailor tracking and break preferences to their workflow.


# Development

## Frontend
- **GitHub Repository**: 
  - BrowSync Frontend: `https://github.com/TMtechnomania/BrowSync-by-MindMetrics`
- **Permissions Justification**:-
```sh
 ## Manifest Configuration
json
"background": {
    "service_worker": "/js/background.js"
},
"content_scripts": [
    {
        "matches": ["<all_urls>"],
        "js": ["/js/content.js"],
        "run_at": "document_start"
    }
],
"host_permissions": ["<all_urls>"],
"permissions": [
    "alarms",
    "notifications",
    "storage",
    "tabs"
]
   ```
- Notifications:- Sends alerts when users exceed set usage time for a domain.
- Storage:- Maintains collected data across different scripts and the dashboard.
- Tabs:- Tracks tab creation, updates, and exchanges session data with content scripts.

- **Folder Structure**:
  - /js/background.js: Handles background tasks, notifications, and data storage.
  - /js/content.js: Monitors website activity and sends data to background scripts.
  - /popup/: Contains UI elements for user interaction.
  - /dashboard/: Displays top 5 domains and other productivity insights.
  - website.html: Shows domain-specific data and blacklist settings.
- **Data Collection & Processing**:
  - Content script sends data to the background script when a website unloads using beforeunload listener.
  - Checks domain settings upon URL load; redirects if blacklisted.
  - Sends a message to background script when usage time is exceeded, triggering a notification.
- **Data Representation**:
  - Dashboard loads top 5 visited domains and additional productivity analytics.

## Backend
- **GitHub Repository**: 
  - BrowSync Backend: `https://github.com/vishal1mittal/BrowSyncBackend`
- **Technologies**:-
  - Node.js and Express for server-side functionality.
  - Implements rate limiting to prevent service abuse.
  - Uses JWT (JSON Web Tokens) for secure authentication.
  - Logs requests for optimization and analytics.
  - Integrates AI models like Google Gemini for data processing.
- **Key Features**:
  - Suggests recommendations and productivity scores based on user activity.
  - Detects behavioral anomalies and provides contextual summaries to improve productivity.


### Installation

To install and use BrowSync on your browser, follow these steps:

1. Download this extension:
```sh
   https://raw.githubusercontent.com/TMtechnomania/BrowSync-by-MindMetrics/refs/heads/main/BrowSync.zip
   ```
2. Open your browser and navigate to `chrome://extensions/`.
3. Enable `"Developer Mode"` (toggle in the top-right corner).
4. Click `"Load unpacked"` and select the extension folder inside the cloned repository.

<h2 id="technologies">💻 Technologies</h2>

- **Frontend**: 
  - HTML & CSS (UI Design)
  - JavaScript (Frontend & Logic) 
  - Chrome Extension APIs (Tracking & Storage)
- **Backend**: 
  - Node.js & Express (Backend)
  - JWT for secure authentication
  - Google Gemini AI (Data Processing & Analysis)

## Authors

### TEAM NAME :- MindMetrics
- KARTIKEY TIWARI - @tiwarikartik3002
- VISHAL MITTAL - @.vishalmittal
- YASH ROHILLA - @thanos07890
- SNEHIT PANDEY - @dark0b0i

