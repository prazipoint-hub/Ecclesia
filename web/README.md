# Ecclesia Web - Church Management ERP Platform

A modern React-based web interface for the Ecclesia church management platform.

## Stack

- **Framework**: React 18 + TypeScript
- **Routing**: React Router v6
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Icons**: Lucide React
- **Bundler**: Vite

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your API URL

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

## Available Scripts

```bash
# Development
npm run dev              # Start dev server with hot reload

# Production
npm run build            # Build for production
npm run preview          # Preview production build

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format code with Prettier
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Layout/         # Layout components (Header, Sidebar, MainLayout)
│   └── Auth/           # Authentication components
├── features/           # Feature pages (Dashboard, etc.)
├── pages/              # Page components
├── hooks/              # Custom React hooks
├── stores/             # Zustand state management
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
├── App.tsx             # Main app component
└── main.tsx            # Entry point
```

## Architecture

### Authentication Flow

1. User logs in via `/auth/login`
2. Credentials are sent to backend API
3. Token is stored in localStorage
4. Protected routes check authentication status
5. Token is automatically added to all API requests
6. On 401 response, user is redirected to login

### State Management

The app uses Zustand for state management:

- `useAuthStore`: Manages authentication state and actions
- Custom hooks wrap store access for components

### API Integration

- Axios client configured with base URL from environment
- Automatic token injection in request headers
- Centralized error handling for 401 responses

## Features

### Implemented

- ✅ Authentication (login)
- ✅ Protected routes
- ✅ Responsive layout (header + sidebar)
- ✅ Dashboard with stats overview
- ✅ User menu with logout
- ✅ Navigation to placeholder pages

### Coming Soon

- 📋 Members management
- 👥 Membership status tracking
- 📅 Events management
- 💰 Finance/Offerings
- 📊 Reports & Analytics
- ⚙️ Settings

## Environment Variables

```env
VITE_API_URL=http://localhost:3000    # Backend API URL
VITE_APP_NAME=Ecclesia                # Application name
```

## Development Guidelines

### Adding a New Feature Page

1. Create feature file in `src/features/FeatureName.tsx`
2. Add route in `src/App.tsx`
3. Add navigation link in `src/components/Layout/Sidebar.tsx`
4. Wrap with `<ProtectedRoute>` if authenticated access required

### Adding a New Component

1. Create file in appropriate subdirectory under `src/components/`
2. Use TypeScript interfaces for props
3. Use Tailwind CSS for styling
4. Export component for reuse

### State Management

Use `useAuthStore` for auth-related state:

```typescript
import { useAuthStore } from '@stores/authStore';

const MyComponent = () => {
  const { user, login, logout } = useAuthStore();
  // ...
};
```

## Testing

Testing setup coming soon. Recommended tools:
- Vitest for unit tests
- React Testing Library for component tests
- Cypress for e2e tests

## Contributing

- Follow TypeScript strict mode
- Use Prettier for formatting
- Run `npm run lint` before committing
- Create feature branches for new work

## License

MIT
