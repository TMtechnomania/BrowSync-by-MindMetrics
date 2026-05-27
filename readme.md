# BrowSync

**BrowSync** is a modern browser extension designed to help users manage their time effectively and boost productivity. Track website usage, view comprehensive analytics with real-time system stats, and receive intelligent break reminders - all with a beautiful, modern interface.

## ✨ Features

### 📊 Real-Time Analytics
- **Live System Stats**: Monitor open tabs count and memory usage in real-time
- **Session Tracking**: Track time spent on each website with active/passive time breakdown
- **Activity Monitoring**: See your engagement level with activity ratio percentages
- **Click & Distraction Tracking**: Monitor interactions and tab switches

### 🎯 Productivity Tools
- **Smart Break Reminders**: Customizable usage reminders (30m, 1h, 2h, 4h)
- **Website Blacklisting**: Block distracting sites to stay focused
- **Local AI Insights**: Get personalized productivity recommendations without external APIs
- **Session History**: Detailed breakdown of all your browsing sessions

### 🎨 Modern UI
- Built with **Tailwind CSS** for a sleek, responsive design
- Dark theme optimized for extended use
- Smooth animations and transitions
- Intuitive dashboard with data visualizations

### 🔒 Privacy-First
- **100% Local Processing**: All data stored and analyzed locally
- **No External APIs**: No data sent to external servers
- **Chrome Webstore Compliant**: Follows all extension policies
- **Manifest V3**: Uses the latest extension standards

## 🚀 Installation

### From Source

1. Clone this repository:
```bash
git clone https://github.com/TMtechnomania/BrowSync-by-MindMetrics.git
```

2. Open your browser and navigate to `chrome://extensions/`

3. Enable `"Developer Mode"` (toggle in the top-right corner)

4. Click `"Load unpacked"` and select the extension folder

## 📸 Screenshots

### Dashboard
Modern, comprehensive dashboard showing:
- Total sessions and domains tracked
- Real-time tab count and memory usage
- Top websites by time and visits
- Productivity summary with local AI insights
- Interactive charts and graphs

### Popup
Quick view showing:
- Current domain stats
- Total visits and time spent
- Activity ratio
- Live system stats (tabs & memory)

### Domain Details
Detailed view per domain:
- Session history table
- Time breakdown (active/passive)
- Blacklist and reminder settings
- Click and distraction analytics

## 🛠️ Technical Details

### Permissions Used
- **`tabs`**: Track browsing activity and manage tab information
- **`storage`**: Save browsing data locally across sessions
- **`notifications`**: Send usage reminders and alerts
- **`alarms`**: Schedule periodic tasks
- **`system.memory`**: Display real-time memory usage
- **`<all_urls>`**: Content script injection for tracking

### Architecture
```
├── manifest.json          # Extension configuration (Manifest V3)
├── popup.html            # Extension popup interface
├── dashboard.html        # Main analytics dashboard
├── website.html          # Domain-specific details page
├── js/
│   ├── background.js     # Service worker (data management)
│   ├── content.js        # Content script (page tracking)
│   ├── popup.js          # Popup logic with real-time stats
│   ├── dashboard.js      # Dashboard with local AI insights
│   └── website.js        # Domain details logic
└── icons/                # Extension icons
```

### Data Structure
```javascript
domainDB = {
  "example.com": {
    clicks: 150,
    totalLife: 3600,        // Total seconds
    activeLife: 2400,       // Active seconds
    passiveLife: 1200,      // Passive seconds
    distractions: 5,
    urlVisited: [
      {
        domain: "example.com",
        url: "https://example.com/page",
        title: "Page Title",
        clicks: 10,
        sessionDuration: 300,
        activeSession: 200,
        passiveSession: 100,
        distractions: 1,
        sessionStart: 1234567890,
        sessionEnd: 1234568190
      }
    ]
  }
}
```

## 🎯 Key Improvements (v2.0)

### What's New
✅ **Modern UI**: Complete redesign with Tailwind CSS  
✅ **Real-time Stats**: Live tab count and memory monitoring  
✅ **Local AI**: Productivity insights without external APIs  
✅ **Better Performance**: Optimized data handling and storage  
✅ **Enhanced UX**: Smoother interactions and animations  
✅ **Search & Filter**: Find domains quickly in dashboard  
✅ **Improved Notifications**: Beautiful in-page reminders  

### What Was Removed
❌ **External AI API**: No longer depends on unavailable backend  
❌ **Token Authentication**: Removed JWT-based auth system  
❌ **Network Requests**: All processing now happens locally  

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📜 License

This project is open source and available under the MIT License.

## 👥 Team MindMetrics

- **KARTIKEY TIWARI** - [@tiwarikartik3002](https://github.com/tiwarikartik3002)
- **VISHAL MITTAL** - [@vishal1mittal](https://github.com/vishal1mittal)
- **YASH ROHILLA** - [@thanos07890](https://github.com/thanos07890)
- **SNEHIT PANDEY** - [@dark0b0i](https://github.com/dark0b0i)

## 🔗 Links

- [GitHub Repository](https://github.com/TMtechnomania/BrowSync-by-MindMetrics)
- [Report Issues](https://github.com/TMtechnomania/BrowSync-by-MindMetrics/issues)
- [Chrome Web Store](#) _(Coming Soon)_

## 📧 Support

For support, email us or open an issue on GitHub.

---

Made with ❤️ by Team MindMetrics
