# 🍸 Bar Crawl Route Planner

> **Live Demo:** [https://bar-crawl.vercel.app/](https://bar-crawl.vercel.app/)

A modern, interactive web application for planning and optimizing bar crawl routes. Built with React, TypeScript, and Mapbox GL JS, featuring real-time route optimization, interactive maps, and a sleek cyberpunk-inspired UI.

![Bar Crawl Route Planner](https://img.shields.io/badge/Status-Live%20Demo-brightgreen)
![React](https://img.shields.io/badge/React-18.2.0-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Vite](https://img.shields.io/badge/Vite-5.0-purple)
![Mapbox](https://img.shields.io/badge/Mapbox%20GL%20JS-Latest-orange)

## ✨ Features

### 🗺️ Interactive Map Experience
- **Real-time bar discovery** with Mapbox integration
- **Interactive pin hover effects** with detailed bar information
- **Dynamic route visualization** with animated paths
- **Custom neon-styled markers** with cyberpunk aesthetics
- **Responsive map controls** with geolocation support

### 🎯 Smart Route Planning
- **Intelligent route optimization** using nearest neighbor algorithm
- **Drag-and-drop bar reordering** for custom routes
- **Real-time distance calculations** and estimated durations
- **Start/end location customization** with address search
- **Radius-based filtering** to focus on walkable areas

### 🎨 Modern UI/UX
- **Cyberpunk-inspired design** with neon gradients and glowing effects
- **Smooth animations** and micro-interactions
- **Responsive design** that works on all devices
- **Dark theme** with customizable color schemes
- **Accessibility features** for inclusive user experience

### 🔐 User Management
- **Firebase Authentication** with email/password
- **User profile management** with saved preferences
- **Secure data storage** with Firestore
- **Public/private crawl sharing** options

### 💾 Data Management
- **Save and load routes** with detailed metadata
- **Export functionality** for sharing with friends
- **Crawl history** with timestamps and descriptions
- **Offline caching** for better performance

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Mapbox API key
- Firebase project

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/bar-crawl-route-app.git
   cd bar-crawl-route-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment setup**
   Create a `.env` file in the root directory:
   ```env
   VITE_MAPBOX_ACCESS_TOKEN=your_mapbox_token_here
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173`

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern UI framework with hooks
- **TypeScript** - Type-safe JavaScript development
- **Vite** - Fast build tool and dev server
- **TailwindCSS** - Utility-first CSS framework
- **Framer Motion** - Smooth animations and transitions

### Maps & Location
- **Mapbox GL JS** - Interactive vector maps
- **Turf.js** - Geospatial analysis library
- **Mapbox Directions API** - Route optimization

### Backend & Database
- **Firebase Authentication** - User management
- **Firestore** - NoSQL cloud database
- **Firebase Hosting** - Static site hosting

### UI Components
- **React Icons** - Icon library
- **Custom CSS** - Cyberpunk styling with CSS Grid/Flexbox
- **Responsive Design** - Mobile-first approach

## 📱 How to Use

### 1. **Search for Bars**
   - Enter your location or use current GPS
   - Adjust search radius (0.5 - 5 miles)
   - Browse bars with ratings and distances

### 2. **Select Your Route**
   - Click bars to add them to your route
   - Drag and drop to reorder stops
   - Use the optimize button for the best walking path

### 3. **Customize Your Experience**
   - Set start and end locations
   - Add notes and estimated times
   - Choose public or private sharing

### 4. **Save & Share**
   - Save your route with a custom name
   - Share with friends via link
   - Export for offline use

## 🎨 Design Features

### Cyberpunk Aesthetic
- **Neon color palette** with cyan, magenta, and yellow
- **Glowing effects** and animated borders
- **Dark backgrounds** with gradient overlays
- **Futuristic typography** and iconography

### Interactive Elements
- **Hover animations** on all clickable elements
- **Loading states** with custom spinners
- **Smooth transitions** between pages
- **Micro-interactions** for better UX

## 🔧 Development

### Project Structure
```
src/
├── components/          # Reusable UI components
├── pages/              # Page components
├── hooks/              # Custom React hooks
├── services/           # API and data services
├── styles/             # CSS and styling
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── context/            # React context providers
```

### Key Components
- `MapContainer` - Main map interface with interactive pins
- `Sidebar` - Bar list and route management
- `Route` - Route planning and optimization
- `SaveCrawlModal` - Save and share functionality

### Available Scripts
```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
```

## 🌟 Key Features in Detail

### Interactive Map Pins
- **Hover effects** with detailed popups
- **Selection states** with visual feedback
- **Custom markers** with neon styling
- **Real-time updates** as you modify routes

### Route Optimization
- **Nearest neighbor algorithm** for efficient paths
- **Walking distance calculations** in real-time
- **Estimated duration** based on bar count
- **Alternative route suggestions**

### Data Persistence
- **Firebase integration** for user data
- **Offline caching** for better performance
- **Real-time synchronization** across devices
- **Backup and restore** functionality

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Development Setup
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Mapbox** for the excellent mapping platform
- **Firebase** for backend services
- **React community** for the amazing ecosystem
- **All contributors** who helped make this project better

## 📞 Support

- **Live Demo:** [https://bar-crawl.vercel.app/](https://bar-crawl.vercel.app/)
- **Issues:** [GitHub Issues](https://github.com/yourusername/bar-crawl-route-app/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/bar-crawl-route-app/discussions)

---

**Made with ❤️ for the bar crawl community**

*Plan your next adventure with style!* 🍻
